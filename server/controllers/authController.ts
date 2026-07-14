import { Request, Response } from 'express';
import { db } from '../db';
import { users, userSessions, auditLogs } from '../../src/db/schema';
import { and, eq, ne, desc, gte, lte, sql, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { requireEnv } from '../config/env';
import { getLoginThrottleState, registerLoginFailure, registerLoginSuccess } from '../services/loginProtectionService';
import { createSignedAuditLog } from '../services/auditLogService';
import crypto from 'crypto';
import { buildOtpAuthUri, generateBase32Secret, verifyTotp } from '../services/totpService';
import { validatePassword, getPasswordPolicyRules } from '../services/passwordPolicyService';
import logger from '../utils/logger';

const JWT_SECRET = requireEnv('JWT_SECRET');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const AUTH_SESSION_TTL_HOURS = Number(process.env.AUTH_SESSION_TTL_HOURS || 12);
const AUTH_MFA_ISSUER = process.env.AUTH_MFA_ISSUER || 'Coduis Zen';
const AUTH_MFA_ENFORCE_ADMIN_FINANCE = process.env.AUTH_MFA_ENFORCE_ADMIN_FINANCE === 'true';

const parseJwtExpiryMs = (value: string): number => {
    const normalized = String(value || '').trim();
    const match = normalized.match(/^(\d+)([smhd])?$/i);
    if (!match) return 12 * 60 * 60 * 1000;
    const amount = Number(match[1]);
    const unit = (match[2] || 's').toLowerCase();
    if (unit === 'm') return amount * 60 * 1000;
    if (unit === 'h') return amount * 60 * 60 * 1000;
    if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
    return amount * 1000;
};

/** Parse a value that may be a JSON string (as stored by MSSQL nvarchar columns) or already an array/object */
const parseJsonField = <T>(value: any, fallback: T): T => {
    if (Array.isArray(value)) return value as unknown as T;
    if (value && typeof value === 'object') return value as unknown as T;
    if (typeof value === 'string' && value.trim()) {
        try { return JSON.parse(value) as T; } catch { /* ignore */ }
    }
    return fallback;
};

const sanitizeUser = (u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    permissions: parseJsonField<string[]>(u.permissions, []),
    assignedBranchId: u.assignedBranchId,
    allowedBranches: parseJsonField<string[]>(u.allowedBranches, []),
    defaultPage: parseJsonField<Record<string, any>>(u.customPermissions, {})?.defaultPage,
    isActive: u.isActive !== false,
    mfaEnabled: u.mfaEnabled === true,
});

const normalizeAllowedBranches = (user: any): string[] => {
    const branches = new Set<string>();
    if (typeof user?.assignedBranchId === 'string' && user.assignedBranchId.trim()) {
        branches.add(user.assignedBranchId.trim());
    }
    const allowedBranches = parseJsonField<string[]>(user?.allowedBranches, []);
    for (const branchId of allowedBranches) {
        if (typeof branchId === 'string' && branchId.trim()) {
            branches.add(branchId.trim());
        }
    }
    return Array.from(branches);
};

const getSessionExpiry = (): Date => {
    const refreshMs = parseJwtExpiryMs(REFRESH_TOKEN_EXPIRES_IN);
    const sessionMs = AUTH_SESSION_TTL_HOURS > 0 ? AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000 : refreshMs;
    return new Date(Date.now() + Math.min(refreshMs, sessionMs));
};

const writeAuthAudit = async (input: Parameters<typeof createSignedAuditLog>[0]) => {
    try {
        await createSignedAuditLog(input);
    } catch {
        // Do not block auth flow if audit insert fails.
    }
};

const issueAccessToken = async (user: any, req: Request, deviceName?: string) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const tokenId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const expiresAt = getSessionExpiry();

    await db.insert(userSessions).values({
        id: sessionId,
        userId: user.id,
        tokenId,
        deviceName: deviceName || null,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: clientIp,
        isActive: true,
        expiresAt,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
    });

    await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));

    const token = jwt.sign({
        id: user.id,
        role: user.role,
        permissions: parseJsonField<string[]>(user.permissions, []),
        branchId: user.assignedBranchId,
        allowedBranches: normalizeAllowedBranches(user),
        sid: sessionId,
        jti: tokenId,
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, subject: user.id });

    const refreshToken = jwt.sign({
        sub: user.id,
        sid: sessionId,
        jti: tokenId,
        purpose: 'refresh',
    }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });

    return { token, refreshToken };
};

const roleRequiresMfa = (role: string): boolean => role === 'SUPER_ADMIN' || role === 'FINANCE';
const shouldRequireMfa = (user: any): boolean => user.mfaEnabled === true || (AUTH_MFA_ENFORCE_ADMIN_FINANCE && roleRequiresMfa(user.role));

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body || {};
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        const normalizedEmail = String(email || '').trim().toLowerCase();

        const throttle = getLoginThrottleState(clientIp, normalizedEmail);
        if (throttle.blocked) {
            await writeAuthAudit({
                eventType: 'auth.login.blocked',
                ipAddress: clientIp,
                payload: { email: normalizedEmail, retryAfterSeconds: throttle.retryAfterSeconds },
                reason: 'TOO_MANY_LOGIN_ATTEMPTS',
            });
            res.setHeader('Retry-After', String(throttle.retryAfterSeconds));
            return res.status(429).json({
                error: 'TOO_MANY_LOGIN_ATTEMPTS',
                retryAfterSeconds: throttle.retryAfterSeconds,
            });
        }

        if (!email || !password) {
            registerLoginFailure(clientIp, normalizedEmail);
            await writeAuthAudit({
                eventType: 'auth.login.failed',
                ipAddress: clientIp,
                payload: { email: normalizedEmail },
                reason: 'MISSING_CREDENTIALS',
            });
            return res.status(400).json({ error: 'email and password are required' });
        }

        const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${normalizedEmail}`);
        if (!user || user.isActive === false) {
            registerLoginFailure(clientIp, email);
            await writeAuthAudit({
                eventType: 'auth.login.failed',
                ipAddress: clientIp,
                payload: { email: normalizedEmail },
                reason: 'INVALID_CREDENTIALS',
            });
            return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
        }

        // First-time password setup if hash is missing
        if (!user.passwordHash) {
            if (String(password).length < 4) {
                return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
            }
            const policyResult = validatePassword(String(password));
            if (!policyResult.valid) {
                // Accept weak password for legacy compatibility, but log warning
                logger.warn({ email: user.email }, 'User set a weak password on first login — recommend password change');
            }
            const hash = await bcrypt.hash(password, 10);
            await db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, user.id));
            user.passwordHash = hash;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash || '');
        if (!isValid) {
            registerLoginFailure(clientIp, email);
            await writeAuthAudit({
                eventType: 'auth.login.failed',
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                branchId: user.assignedBranchId,
                ipAddress: clientIp,
                payload: { email: normalizedEmail },
                reason: 'INVALID_CREDENTIALS',
            });
            return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
        }

        const deviceName = String(req.body?.deviceName || req.body?.device_name || '').trim() || undefined;
        registerLoginSuccess(clientIp, email);

        if (shouldRequireMfa(user)) {
            if (!user.mfaEnabled || !user.mfaSecret) {
                return res.status(403).json({ error: 'MFA_SETUP_REQUIRED' });
            }
            const mfaToken = jwt.sign({
                id: user.id,
                purpose: 'mfa_challenge',
                branchId: user.assignedBranchId,
                allowedBranches: normalizeAllowedBranches(user),
                role: user.role,
            }, JWT_SECRET, { expiresIn: '5m', subject: user.id });
            await writeAuthAudit({
                eventType: 'auth.login.mfa_challenge',
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                branchId: user.assignedBranchId,
                ipAddress: clientIp,
                payload: { email: normalizedEmail },
            });
            return res.json({ mfaRequired: true, mfaToken });
        }

        const { token, refreshToken } = await issueAccessToken(user, req, deviceName);

        await writeAuthAudit({
            eventType: 'auth.login.success',
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            branchId: user.assignedBranchId,
            ipAddress: clientIp,
            payload: { email: normalizedEmail },
        });

        res.json({
            token,
            refreshToken,
            user: sanitizeUser(user),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const me = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

        res.json({ user: sanitizeUser(user) });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const logout = async (req: Request, res: Response) => {
    try {
        const sessionId = req.user?.sessionId;
        if (!sessionId) return res.status(200).json({ ok: true });

        await db.update(userSessions)
            .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
            .where(eq(userSessions.id, sessionId));

        await writeAuthAudit({
            eventType: 'auth.logout',
            userId: req.user?.id,
            userRole: req.user?.role,
            branchId: req.user?.branchId || null,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
            payload: { sessionId },
        });

        return res.json({ ok: true });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

export const getSessions = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

        const rows = await db.select().from(userSessions)
            .where(eq(userSessions.userId, userId))
            .orderBy(desc(userSessions.createdAt));

        return res.json(rows.map((row) => ({
            id: row.id,
            deviceName: row.deviceName,
            userAgent: row.userAgent,
            ipAddress: row.ipAddress,
            isActive: row.isActive !== false && !row.revokedAt && new Date(row.expiresAt) > new Date(),
            createdAt: row.createdAt,
            lastSeenAt: row.lastSeenAt,
            expiresAt: row.expiresAt,
            revokedAt: row.revokedAt,
            isCurrent: row.id === req.user?.sessionId,
        })));
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

export const revokeSession = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        const rawSessionId = req.params.id as string | string[] | undefined;
        const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        if (!sessionId) return res.status(400).json({ error: 'SESSION_ID_REQUIRED' });

        const [session] = await db.select().from(userSessions)
            .where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId)));
        if (!session) return res.status(404).json({ error: 'SESSION_NOT_FOUND' });

        await db.update(userSessions)
            .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
            .where(eq(userSessions.id, sessionId));

        await writeAuthAudit({
            eventType: 'auth.session.revoked',
            userId,
            userRole: req.user?.role,
            branchId: req.user?.branchId || null,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
            payload: { sessionId },
        });

        return res.json({ ok: true });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

export const revokeOtherSessions = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        const currentSessionId = req.user?.sessionId;
        if (!userId || !currentSessionId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

        await db.update(userSessions)
            .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
            .where(and(
                eq(userSessions.userId, userId),
                ne(userSessions.id, currentSessionId),
                eq(userSessions.isActive, true),
            ));

        await writeAuthAudit({
            eventType: 'auth.session.revoke_others',
            userId,
            userRole: req.user?.role,
            branchId: req.user?.branchId || null,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
            payload: { keepSessionId: currentSessionId },
        });

        return res.json({ ok: true });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

export const verifyMfaChallenge = async (req: Request, res: Response) => {
    try {
        const { mfaToken, code, deviceName } = req.body || {};
        if (!mfaToken || !code) return res.status(400).json({ error: 'MFA_TOKEN_AND_CODE_REQUIRED' });

        const payload = jwt.verify(mfaToken, JWT_SECRET) as { sub?: string; id?: string; purpose?: string };
        if (payload.purpose !== 'mfa_challenge') return res.status(401).json({ error: 'INVALID_MFA_TOKEN' });
        const userId = payload.sub || payload.id;
        if (!userId) return res.status(401).json({ error: 'INVALID_MFA_TOKEN' });

        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user || !user.mfaEnabled || !user.mfaSecret) return res.status(401).json({ error: 'MFA_NOT_ENABLED' });

        const valid = verifyTotp(user.mfaSecret, String(code));
        if (!valid) {
            await writeAuthAudit({
                eventType: 'auth.mfa.failed',
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                branchId: user.assignedBranchId,
                ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
            });
            return res.status(401).json({ error: 'INVALID_MFA_CODE' });
        }

        const { token, refreshToken } = await issueAccessToken(user, req, String(deviceName || '').trim() || undefined);
        await writeAuthAudit({
            eventType: 'auth.mfa.verified',
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            branchId: user.assignedBranchId,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        });
        return res.json({ token, refreshToken, user: sanitizeUser(user) });
    } catch {
        return res.status(401).json({ error: 'INVALID_MFA_TOKEN' });
    }
};

export const initiateMfaSetup = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

        const secret = generateBase32Secret(32);
        const setupToken = jwt.sign({
            id: userId,
            purpose: 'mfa_setup',
            secret,
        }, JWT_SECRET, { expiresIn: '10m', subject: userId });
        const otpAuthUrl = buildOtpAuthUri(AUTH_MFA_ISSUER, user.email, secret);
        return res.json({ setupToken, secret, otpAuthUrl });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

export const confirmMfaSetup = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        const { setupToken, code } = req.body || {};
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        if (!setupToken || !code) return res.status(400).json({ error: 'SETUP_TOKEN_AND_CODE_REQUIRED' });

        const payload = jwt.verify(setupToken, JWT_SECRET) as { sub?: string; id?: string; purpose?: string; secret?: string };
        if (payload.purpose !== 'mfa_setup' || (payload.sub || payload.id) !== userId || !payload.secret) {
            return res.status(401).json({ error: 'INVALID_SETUP_TOKEN' });
        }
        if (!verifyTotp(payload.secret, String(code))) return res.status(401).json({ error: 'INVALID_MFA_CODE' });

        await db.update(users).set({ mfaEnabled: true, mfaSecret: payload.secret, updatedAt: new Date() }).where(eq(users.id, userId));
        await writeAuthAudit({
            eventType: 'auth.mfa.enabled',
            userId,
            userRole: req.user?.role,
            branchId: req.user?.branchId || null,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        });
        return res.json({ ok: true });
    } catch {
        return res.status(401).json({ error: 'INVALID_SETUP_TOKEN' });
    }
};

export const disableMfa = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        const { code } = req.body || {};
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        if (!code) return res.status(400).json({ error: 'MFA_CODE_REQUIRED' });

        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user || !user.mfaEnabled || !user.mfaSecret) return res.status(400).json({ error: 'MFA_NOT_ENABLED' });
        if (!verifyTotp(user.mfaSecret, String(code))) return res.status(401).json({ error: 'INVALID_MFA_CODE' });

        await db.update(users).set({ mfaEnabled: false, mfaSecret: null, updatedAt: new Date() }).where(eq(users.id, userId));
        await writeAuthAudit({
            eventType: 'auth.mfa.disabled',
            userId,
            userRole: req.user?.role,
            branchId: req.user?.branchId || null,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        });
        return res.json({ ok: true });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

// ============================================================================
// PIN CODE LOGIN
// ============================================================================

export const loginWithPin = async (req: Request, res: Response) => {
    try {
        const { pin, branchId } = req.body || {};
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        const pinThrottleKey = `pin:${branchId || 'global'}`;

        if (!pin || pin.length !== 6 || !/^\d+$/.test(String(pin))) {
            return res.status(400).json({ error: 'PIN_REQUIRED' });
        }

        const throttle = getLoginThrottleState(clientIp, pinThrottleKey);
        if (throttle.blocked) {
            return res.status(429).json({
                error: 'TOO_MANY_LOGIN_ATTEMPTS',
                retryAfterSeconds: throttle.retryAfterSeconds,
            });
        }

        // Find user with this PIN (PIN must be unique per branch or globally)
        const allUsers = await db.select().from(users).where(eq(users.isActive, true));

        let matchedUser = null;
        for (const user of allUsers) {
            if (!user.pinLoginEnabled || !user.pinCodeHash) continue;

            if (branchId && user.assignedBranchId !== branchId && user.role !== 'SUPER_ADMIN' && user.role !== 'OWNER') {
                const allowedBranches = (user as any).allowedBranches || [];
                if (!allowedBranches.includes(branchId)) continue;
            }

            const isMatch = await bcrypt.compare(pin, user.pinCodeHash);
            if (isMatch) {
                matchedUser = user;
                break;
            }
        }

        if (!matchedUser) {
            registerLoginFailure(clientIp, pinThrottleKey);
            await writeAuthAudit({
                eventType: 'auth.pin_login.failed',
                ipAddress: clientIp,
                payload: { branchId: branchId || null },
                reason: 'INVALID_PIN',
            });
            return res.status(401).json({ error: 'INVALID_PIN' });
        }

        registerLoginSuccess(clientIp, pinThrottleKey);

        const deviceName = String(req.body?.deviceName || '').trim() || 'PIN Login';
        const { token, refreshToken } = await issueAccessToken(matchedUser, req, deviceName);

        await writeAuthAudit({
            eventType: 'auth.pin_login.success',
            userId: matchedUser.id,
            userName: matchedUser.name,
            userRole: matchedUser.role,
            branchId: matchedUser.assignedBranchId,
            ipAddress: clientIp,
        });

        return res.json({
            token,
            refreshToken,
            user: sanitizeUser(matchedUser),
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

export const setupPin = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        const { pin, currentPassword } = req.body || {};

        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        if (!pin || pin.length !== 6) {
            return res.status(400).json({ error: 'PIN_MUST_BE_6_DIGITS' });
        }
        if (!/^\d+$/.test(pin)) {
            return res.status(400).json({ error: 'PIN_MUST_BE_NUMERIC' });
        }

        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

        // Verify current password if user has one
        if (user.passwordHash && currentPassword) {
            const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
            if (!isValid) {
                return res.status(401).json({ error: 'INVALID_PASSWORD' });
            }
        }

        const pinHash = await bcrypt.hash(pin, 10);
        await db.update(users).set({
            pinCodeHash: pinHash,
            pinLoginEnabled: true,
            updatedAt: new Date(),
        }).where(eq(users.id, userId));

        await writeAuthAudit({
            eventType: 'auth.pin.setup',
            userId,
            userRole: req.user?.role,
            branchId: req.user?.branchId || null,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        });

        return res.json({ ok: true, message: 'PIN_SETUP_COMPLETE' });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

export const disablePin = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

        await db.update(users).set({
            pinCodeHash: null,
            pinLoginEnabled: false,
            updatedAt: new Date(),
        }).where(eq(users.id, userId));

        await writeAuthAudit({
            eventType: 'auth.pin.disabled',
            userId,
            userRole: req.user?.role,
            branchId: req.user?.branchId || null,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        });

        return res.json({ ok: true, message: 'PIN_DISABLED' });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

// Admin function to set PIN for another user
export const adminSetUserPin = async (req: Request, res: Response) => {
    try {
        const adminId = req.user?.id;
        const adminRole = req.user?.role;
        const { userId, pin } = req.body || {};

        if (!adminId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        if (!['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(adminRole || '')) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }
        if (!userId || !pin) {
            return res.status(400).json({ error: 'USER_ID_AND_PIN_REQUIRED' });
        }
        if (pin.length !== 6 || !/^\d+$/.test(pin)) {
            return res.status(400).json({ error: 'PIN_MUST_BE_6_DIGITS' });
        }

        const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
        if (!targetUser) return res.status(404).json({ error: 'USER_NOT_FOUND' });

        const pinHash = await bcrypt.hash(pin, 10);
        await db.update(users).set({
            pinCodeHash: pinHash,
            pinLoginEnabled: true,
            updatedAt: new Date(),
        }).where(eq(users.id, userId));

        await writeAuthAudit({
            eventType: 'auth.pin.admin_set',
            userId: adminId,
            userRole: adminRole,
            branchId: req.user?.branchId || null,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
            payload: { targetUserId: userId, targetUserName: targetUser.name },
        });

        return res.json({ ok: true, message: 'PIN_SET_FOR_USER' });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

// ============================================================================
// REFRESH TOKEN
// ============================================================================

export const refreshAccessToken = async (req: Request, res: Response) => {
    try {
        const { refreshToken: rt } = req.body || {};
        if (!rt) return res.status(400).json({ error: 'REFRESH_TOKEN_REQUIRED' });

        let payload: any;
        try {
            payload = jwt.verify(rt, JWT_SECRET);
        } catch {
            return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN' });
        }

        if (payload.purpose !== 'refresh') {
            return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN' });
        }

        const sessionId = payload.sid;
        const userId = payload.sub;
        const tokenId = payload.jti;

        if (!sessionId || !userId || !tokenId) {
            return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN' });
        }

        // Verify session is still active
        const [session] = await db.select().from(userSessions).where(and(
            eq(userSessions.id, sessionId),
            eq(userSessions.userId, userId),
            eq(userSessions.tokenId, tokenId),
            eq(userSessions.isActive, true),
        ));

        if (!session || session.revokedAt || new Date(session.expiresAt) < new Date()) {
            return res.status(401).json({ error: 'SESSION_EXPIRED' });
        }

        // Fetch user
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user || user.isActive === false) {
            return res.status(401).json({ error: 'USER_INACTIVE' });
        }

        // Issue new short-lived access token (same session)
        const newToken = jwt.sign({
            id: user.id,
            role: user.role,
            permissions: user.permissions || [],
            branchId: user.assignedBranchId,
            allowedBranches: normalizeAllowedBranches(user),
            sid: sessionId,
            jti: tokenId,
        }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, subject: user.id });

        // Touch session
        await db.update(userSessions)
            .set({ lastSeenAt: new Date(), updatedAt: new Date() })
            .where(eq(userSessions.id, sessionId));

        return res.json({ token: newToken, user: sanitizeUser(user) });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

// ============================================================================
// PASSWORD MANAGEMENT
// ============================================================================

export const changePassword = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

        const { currentPassword, newPassword } = req.body || {};
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'CURRENT_AND_NEW_PASSWORD_REQUIRED' });
        }

        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

        // Verify current password
        if (!user.passwordHash) {
            return res.status(400).json({ error: 'NO_PASSWORD_SET' });
        }
        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValid) {
            await writeAuthAudit({
                eventType: 'auth.password.change_failed',
                userId,
                userRole: req.user?.role,
                branchId: req.user?.branchId || null,
                ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
                reason: 'INVALID_CURRENT_PASSWORD',
            });
            return res.status(401).json({ error: 'INVALID_CURRENT_PASSWORD' });
        }

        // Enforce password policy
        const policyResult = validatePassword(newPassword);
        if (!policyResult.valid) {
            return res.status(400).json({
                error: 'PASSWORD_POLICY_VIOLATION',
                details: policyResult.errors,
                strength: policyResult.strength,
                score: policyResult.score,
            });
        }

        // Prevent reuse of the same password
        const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
        if (isSamePassword) {
            return res.status(400).json({ error: 'NEW_PASSWORD_MUST_BE_DIFFERENT' });
        }

        // Update password
        const newHash = await bcrypt.hash(newPassword, 10);
        await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, userId));

        // Revoke other sessions for security
        const currentSessionId = req.user?.sessionId;
        if (currentSessionId) {
            await db.update(userSessions)
                .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
                .where(and(
                    eq(userSessions.userId, userId),
                    ne(userSessions.id, currentSessionId),
                    eq(userSessions.isActive, true),
                ));
        }

        await writeAuthAudit({
            eventType: 'auth.password.changed',
            userId,
            userName: user.name,
            userRole: req.user?.role,
            branchId: req.user?.branchId || null,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        });

        return res.json({
            ok: true,
            message: 'PASSWORD_CHANGED',
            strength: policyResult.strength,
            score: policyResult.score,
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

export const getPasswordPolicy = async (_req: Request, res: Response) => {
    try {
        res.json(getPasswordPolicyRules());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================================================
// ADMIN: LOGIN AUDIT LOG
// ============================================================================


const AUTH_EVENT_TYPES = [
    'auth.login.success', 'auth.login.failed', 'auth.login.blocked',
    'auth.logout', 'auth.mfa.verified', 'auth.mfa.failed',
    'auth.mfa.enabled', 'auth.mfa.disabled',
    'auth.pin_login.success', 'auth.pin_login.failed',
    'auth.pin.setup', 'auth.pin.disabled', 'auth.pin.admin_set',
    'auth.password.changed', 'auth.password.change_failed',
    'auth.session.revoked', 'auth.session.revoke_others',
    'auth.login.mfa_challenge',
];

export const getLoginAuditLog = async (req: Request, res: Response) => {
    try {
        const adminRole = req.user?.role;
        if (!['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(adminRole || '')) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }

        const limit = Math.min(Number(req.query.limit || 100), 500);
        const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
        const eventType = typeof req.query.eventType === 'string' ? req.query.eventType : undefined;
        const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
        const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

        const conditions: any[] = [inArray(auditLogs.eventType, AUTH_EVENT_TYPES)];

        if (userId) conditions.push(eq(auditLogs.userId, userId));
        if (eventType) conditions.push(eq(auditLogs.eventType, eventType));
        if (startDate) conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
        if (endDate) conditions.push(lte(auditLogs.createdAt, new Date(endDate)));

        const logs = await db.select({
            id: auditLogs.id,
            eventType: auditLogs.eventType,
            userId: auditLogs.userId,
            userName: sql<string>`JSON_VALUE(${auditLogs.payload}, '$.userName')`,
            userRole: sql<string>`JSON_VALUE(${auditLogs.payload}, '$.userRole')`,
            ipAddress: sql<string>`JSON_VALUE(${auditLogs.payload}, '$.ipAddress')`,
            reason: auditLogs.reason,
            payload: auditLogs.payload,
            createdAt: auditLogs.createdAt,
        }).from(auditLogs)
            .where(and(...conditions))
            .orderBy(desc(auditLogs.createdAt))
            .offset(0).fetch(limit);

        // Summary stats
        const totalAttempts = logs.length;
        const successCount = logs.filter(l => l.eventType === 'auth.login.success' || l.eventType === 'auth.pin_login.success').length;
        const failedCount = logs.filter(l => l.eventType?.includes('.failed') || l.eventType?.includes('.blocked')).length;

        res.json({
            logs,
            summary: {
                total: totalAttempts,
                successful: successCount,
                failed: failedCount,
                mfaEvents: logs.filter(l => l.eventType?.includes('.mfa.')).length,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// ADMIN: SESSION MANAGEMENT (All Users)
// ============================================================================

export const getAdminSessions = async (req: Request, res: Response) => {
    try {
        const adminRole = req.user?.role;
        if (!['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(adminRole || '')) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }

        const activeOnly = req.query.active !== 'false';
        const limit = Math.min(Number(req.query.limit || 100), 500);

        const conditions: any[] = [];
        if (activeOnly) {
            conditions.push(eq(userSessions.isActive, true));
        }

        const sessions = await db.select({
            id: userSessions.id,
            userId: userSessions.userId,
            deviceName: userSessions.deviceName,
            userAgent: userSessions.userAgent,
            ipAddress: userSessions.ipAddress,
            isActive: userSessions.isActive,
            createdAt: userSessions.createdAt,
            lastSeenAt: userSessions.lastSeenAt,
            expiresAt: userSessions.expiresAt,
            revokedAt: userSessions.revokedAt,
        }).from(userSessions)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(userSessions.lastSeenAt))
            .offset(0).fetch(limit);

        // Fetch user names for each session
        const userIds = [...new Set(sessions.map(s => s.userId))];
        let userMap = new Map<string, { name: string; email: string; role: string }>();

        if (userIds.length > 0) {
            const userRows = await db.select({
                id: users.id,
                name: users.name,
                email: users.email,
                role: users.role,
            }).from(users).where(inArray(users.id, userIds));

            userMap = new Map(userRows.map(u => [u.id, { name: u.name, email: u.email, role: u.role }]));
        }

        const enrichedSessions = sessions.map(s => {
            const user = userMap.get(s.userId);
            const now = new Date();
            return {
                ...s,
                userName: user?.name || 'Unknown',
                userEmail: user?.email || '',
                userRole: user?.role || '',
                isExpired: s.expiresAt ? new Date(s.expiresAt) < now : false,
                isRevoked: !!s.revokedAt,
            };
        });

        const activeSessions = enrichedSessions.filter(s => s.isActive && !s.isExpired && !s.isRevoked);

        res.json({
            sessions: enrichedSessions,
            summary: {
                total: enrichedSessions.length,
                active: activeSessions.length,
                expired: enrichedSessions.filter(s => s.isExpired).length,
                revoked: enrichedSessions.filter(s => s.isRevoked).length,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const adminRevokeSession = async (req: Request, res: Response) => {
    try {
        const adminRole = req.user?.role;
        if (!['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(adminRole || '')) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }

        const sessionId = String(req.params.id || '');
        if (!sessionId) return res.status(400).json({ error: 'SESSION_ID_REQUIRED' });

        const [session] = await db.select().from(userSessions).where(eq(userSessions.id, sessionId));
        if (!session) return res.status(404).json({ error: 'SESSION_NOT_FOUND' });

        await db.update(userSessions)
            .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
            .where(eq(userSessions.id, sessionId));

        await writeAuthAudit({
            eventType: 'auth.session.admin_revoked',
            userId: req.user?.id,
            userRole: adminRole,
            branchId: req.user?.branchId || null,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
            payload: { targetSessionId: sessionId, targetUserId: session.userId },
        });

        return res.json({ ok: true, message: 'SESSION_REVOKED' });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};
