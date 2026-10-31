import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireEnv } from '../config/env';
import { db } from '../db';
import { userSessions } from '../../src/db/schema';
import { and, eq } from 'drizzle-orm';
import { isDatabaseUnavailableError, writeDatabaseUnavailable } from '../utils/dbErrors';
import { isSessionExpired } from '../services/sessionPolicy';

export interface AuthUser {
    id: string;
    name?: string;
    role: string;
    permissions: string[];
    branchId?: string | null;
    allowedBranches?: string[] | null;
    sessionId?: string;
    tokenId?: string;
}

declare global {
    var __authUser: AuthUser | undefined;
}

declare module 'express-serve-static-core' {
    interface Request {
        user?: AuthUser;
    }
}

const getJwtSecret = () => requireEnv('JWT_SECRET');

const logAuthRejection = (req: Request, reason: string, details: Record<string, unknown> = {}) => {
    // Never log bearer/refresh tokens or credential material. This is kept
    // intentionally small so an installed customer build can explain a
    // 401 without turning auth diagnostics into a data-leak surface.
    console.warn('[AUTH_REJECT]', {
        method: req.method,
        path: req.path,
        requestId: req.requestId || 'unknown',
        reason,
        ...details,
    });
};

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
        logAuthRejection(req, 'missing-bearer');
        return res.status(401).json({ error: 'AUTH_REQUIRED' });
    }

    try {
        const payload = jwt.verify(token, getJwtSecret()) as AuthUser & { sub?: string; sid?: string; jti?: string };
        const sessionId = payload.sid || payload.sessionId;
        const tokenId = payload.jti || payload.tokenId;
        if (!sessionId || !tokenId) {
            logAuthRejection(req, 'missing-session-claims');
            return res.status(401).json({ error: 'INVALID_TOKEN_SESSION' });
        }

        const [session] = await db.select().from(userSessions).where(and(
            eq(userSessions.id, sessionId),
            eq(userSessions.userId, payload.sub || payload.id),
            eq(userSessions.tokenId, tokenId),
            eq(userSessions.isActive, true),
        ));

        if (!session || session.revokedAt) {
            logAuthRejection(req, 'session-not-active', {
                hasSession: Boolean(session),
                revoked: Boolean(session?.revokedAt),
            });
            return res.status(401).json({ error: 'SESSION_REVOKED' });
        }

        if (isSessionExpired(session.expiresAt)) {
            await db.update(userSessions)
                .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
                .where(and(eq(userSessions.id, sessionId), eq(userSessions.isActive, true)));
            logAuthRejection(req, 'session-expired');
            return res.status(401).json({ error: 'SESSION_EXPIRED' });
        }

        // Throttle lastSeenAt updates to once every 5 minutes (Item 37)
        const lastSeenMs = session.lastSeenAt ? new Date(session.lastSeenAt).getTime() : 0;
        const nowMs = Date.now();
        if (nowMs - lastSeenMs > 5 * 60 * 1000) {
            // Fire-and-forget for performance (do not await)
            db.update(userSessions)
                .set({ lastSeenAt: new Date(nowMs), updatedAt: new Date(nowMs) })
                .where(eq(userSessions.id, sessionId))
                .catch(err => console.error('Failed to update session lastSeenAt:', err));
        }

        req.user = {
            id: payload.sub || payload.id,
            role: payload.role,
            permissions: payload.permissions || [],
            branchId: payload.branchId,
            allowedBranches: Array.isArray(payload.allowedBranches) ? payload.allowedBranches : [],
            sessionId,
            tokenId,
        };
        return next();
    } catch (error) {
        // A DB outage here must NOT look like a bad token: valid sessions
        // would 401 everywhere and the frontend would log the user out.
        // Surface 503 so clients retry with backoff and stay logged in.
        if (isDatabaseUnavailableError(error)) return writeDatabaseUnavailable(res, error);
        logAuthRejection(req, 'token-verification-failed', {
            errorName: error instanceof Error ? error.name : 'unknown',
        });
        return res.status(401).json({ error: 'INVALID_TOKEN' });
    }
};

export const requireRoles = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = req.user;
        if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        if (roles.includes(user.role)) return next();
        return res.status(403).json({ error: 'FORBIDDEN' });
    };
};

export const requirePermission = (...perms: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = req.user;
        if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        if (user.role === 'SUPER_ADMIN') return next();
        if (user.permissions?.includes('*')) return next();
        if (perms.some(p => user.permissions?.includes(p))) return next();
        return res.status(403).json({ error: 'FORBIDDEN' });
    };
};

export const requireRoleOrPermission = (roles: string[], perms: string[] = []) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = req.user;
        if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        if (user.role === 'SUPER_ADMIN') return next();
        if (roles.includes(user.role)) return next();
        if (user.permissions?.includes('*')) return next();
        if (perms.some((perm) => user.permissions?.includes(perm))) return next();
        return res.status(403).json({ error: 'FORBIDDEN' });
    };
};
