import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../db';
import { branches, users, userSessions } from '../../src/db/schema';
import { INITIAL_ROLE_PERMISSIONS, UserRole } from '../../types';
import { createSignedAuditLog } from '../services/auditService';

const PROTECTED_USER_IDS = ['user_sys_sameh_191224'];

const param = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

const cleanString = (value: unknown) => {
    if (typeof value !== 'string') return undefined;
    const v = value.trim();
    return v || undefined;
};

const cleanStringArray = (value: unknown) =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim()) : undefined;

const isEmailLike = (value: string | undefined) => !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const userBody = (body: any) => ({
    id: cleanString(body.id),
    name: cleanString(body.name),
    email: cleanString(body.email),
    role: cleanString(body.role),
    permissions: Array.isArray(body.permissions) ? body.permissions : undefined,
    assignedBranchId: cleanString(body.assignedBranchId || body.assigned_branch_id),
    allowedBranches: cleanStringArray(body.allowedBranches || body.allowed_branches),
    isActive: body.isActive ?? body.is_active,
    managerPin: cleanString(body.managerPin || body.manager_pin),
    password: cleanString(body.password),
    pin: cleanString(body.pin),
});

const audit = (req: Request, eventType: string, payload: Record<string, unknown>, reason: string) =>
    createSignedAuditLog({
        eventType,
        userId: (req as any).user?.id || 'system',
        branchId: null,
        payload,
        reason,
        sourceDevice: req.headers['user-agent'] || 'unknown',
        requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
    }).catch(() => undefined);

const writeError = (res: Response, error: any) => {
    const text = String(error?.message || error?.cause?.message || '');
    const code = error?.code || error?.cause?.code;
    if (code === '23505' || text.includes('duplicate key') || text.includes('users_email_unique')) {
        return res.status(409).json({ error: 'USER_CONFLICT', message: 'A user with the same email already exists' });
    }
    return res.status(500).json({ error: error.message || 'USER_WRITE_FAILED' });
};

export const getAllUsers = async (_req: Request, res: Response) => {
    try {
        res.json(await db.select().from(users).orderBy(desc(users.createdAt)));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getUserById = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        const [user] = await db.select().from(users).where(eq(users.id, id));
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        res.json(user);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createUser = async (req: Request, res: Response) => {
    try {
        const body = userBody(req.body || {});
        if (!body.name) return res.status(400).json({ error: 'USER_NAME_REQUIRED' });
        if (!isEmailLike(body.email)) return res.status(400).json({ error: 'VALID_EMAIL_REQUIRED' });
        let passwordHash: string | undefined;
        let pinCodeHash: string | undefined;
        if (body.password) passwordHash = await bcrypt.hash(body.password, 10);
        if (body.pin) {
            if (!/^\d{6}$/.test(body.pin)) return res.status(400).json({ error: 'PIN_MUST_BE_6_DIGITS' });
            pinCodeHash = await bcrypt.hash(body.pin, 10);
        }
        const [created] = await db.insert(users).values({
            id: body.id || crypto.randomUUID(),
            name: body.name,
            email: body.email,
            role: body.role || UserRole.CASHIER,
            permissions: body.permissions || INITIAL_ROLE_PERMISSIONS[(body.role || UserRole.CASHIER) as UserRole] || [],
            assignedBranchId: body.assignedBranchId,
            allowedBranches: body.allowedBranches || [],
            isActive: body.isActive !== false,
            managerPin: body.managerPin,
            passwordHash,
            pinCode: body.pin,
            pinCodeHash,
            pinLoginEnabled: Boolean(body.pin),
            createdAt: new Date(),
            updatedAt: new Date(),
        }).returning();
        await audit(req, 'USER_CREATED', { targetUserId: created.id, role: created.role }, 'User account created');
        res.status(201).json(created);
    } catch (error: any) {
        writeError(res, error);
    }
};

export const updateUser = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        const body = userBody(req.body || {});
        const [existing] = await db.select().from(users).where(eq(users.id, id));
        if (!existing) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        if (body.email !== undefined && !isEmailLike(body.email)) return res.status(400).json({ error: 'VALID_EMAIL_REQUIRED' });
        const protectedUser = PROTECTED_USER_IDS.includes(id);
        const passwordHash = body.password ? await bcrypt.hash(body.password, 10) : existing.passwordHash;
        const pinCodeHash = body.pin ? await bcrypt.hash(body.pin, 10) : existing.pinCodeHash;
        const nextRole = protectedUser ? UserRole.SUPER_ADMIN : (body.role || existing.role);
        const [updated] = await db.update(users).set({
            name: body.name ?? existing.name,
            email: body.email ?? existing.email,
            role: nextRole,
            permissions: body.permissions ?? existing.permissions,
            assignedBranchId: body.assignedBranchId ?? existing.assignedBranchId,
            allowedBranches: body.allowedBranches ?? existing.allowedBranches,
            isActive: protectedUser ? true : (body.isActive ?? existing.isActive),
            managerPin: body.managerPin ?? existing.managerPin,
            passwordHash,
            pinCode: body.pin ?? existing.pinCode,
            pinCodeHash,
            pinLoginEnabled: body.pin ? true : existing.pinLoginEnabled,
            updatedAt: new Date(),
        }).where(eq(users.id, id)).returning();

        const permissionsChanged = JSON.stringify(existing.permissions || []) !== JSON.stringify(updated.permissions || []);
        const roleChanged = existing.role !== updated.role;
        const activeChanged = existing.isActive !== updated.isActive;
        if (permissionsChanged || roleChanged || activeChanged) {
            await db.update(userSessions).set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
                .where(and(eq(userSessions.userId, id), eq(userSessions.isActive, true)));
        }
        await audit(req, 'USER_UPDATED', { targetUserId: updated.id, roleChanged, activeChanged, permissionsChanged }, 'User account updated');
        res.json(updated);
    } catch (error: any) {
        writeError(res, error);
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        if (PROTECTED_USER_IDS.includes(id)) return res.status(403).json({ error: 'FORBIDDEN', message: 'System Owner cannot be deleted' });
        await db.delete(userSessions).where(eq(userSessions.userId, id));
        const [deleted] = await db.delete(users).where(eq(users.id, id)).returning();
        if (!deleted) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        await audit(req, 'USER_DELETED', { targetUserId: deleted.id }, 'User account deleted');
        res.json({ message: 'User deleted', user: deleted });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const bulkCreateUsers = async (req: Request, res: Response) => {
    try {
        const list = Array.isArray(req.body?.users) ? req.body.users.slice(0, 100) : [];
        if (!list.length) return res.status(400).json({ error: 'USERS_ARRAY_REQUIRED' });
        const created = [];
        const errors = [];
        for (const [index, raw] of list.entries()) {
            try {
                const body = userBody(raw);
                const [user] = await db.insert(users).values({
                    id: body.id || crypto.randomUUID(),
                    name: body.name || `User ${index + 1}`,
                    email: body.email || `${crypto.randomUUID()}@local.invalid`,
                    role: body.role || UserRole.CASHIER,
                    permissions: body.permissions || [],
                    assignedBranchId: body.assignedBranchId,
                    allowedBranches: body.allowedBranches || [],
                    isActive: body.isActive !== false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }).returning();
                created.push(user);
            } catch (error: any) {
                errors.push({ index, error: error.message });
            }
        }
        await audit(req, 'USER_CREATED', { bulk: true, created: created.length, failed: errors.length }, 'Bulk user creation');
        res.status(201).json({ created: created.length, failed: errors.length, users: created, errors });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const bulkUpdateStatus = async (req: Request, res: Response) => {
    try {
        const userIds = cleanStringArray(req.body?.userIds) || [];
        const toUpdate = userIds.filter((id) => !PROTECTED_USER_IDS.includes(id));
        const updated = toUpdate.length
            ? await db.update(users).set({ isActive: Boolean(req.body?.isActive), updatedAt: new Date() }).where(inArray(users.id, toUpdate)).returning()
            : [];
        if (!req.body?.isActive && toUpdate.length) {
            await db.update(userSessions).set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() }).where(inArray(userSessions.userId, toUpdate));
        }
        res.json({ updated: updated.length, skipped: userIds.length - toUpdate.length, users: updated });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const bulkAssignRole = async (req: Request, res: Response) => {
    try {
        const userIds = cleanStringArray(req.body?.userIds) || [];
        const role = cleanString(req.body?.role);
        if (!userIds.length || !role) return res.status(400).json({ error: 'USER_IDS_AND_ROLE_REQUIRED' });
        const toUpdate = userIds.filter((id) => !PROTECTED_USER_IDS.includes(id));
        const updated = await db.update(users).set({
            role,
            permissions: INITIAL_ROLE_PERMISSIONS[role as UserRole] || [],
            updatedAt: new Date(),
        }).where(inArray(users.id, toUpdate)).returning();
        await db.update(userSessions).set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() }).where(inArray(userSessions.userId, toUpdate));
        res.json({ updated: updated.length, skipped: userIds.length - toUpdate.length, users: updated });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const bulkAssignBranch = async (req: Request, res: Response) => {
    try {
        const userIds = cleanStringArray(req.body?.userIds) || [];
        const branchId = cleanString(req.body?.branchId);
        if (!userIds.length || !branchId) return res.status(400).json({ error: 'USER_IDS_AND_BRANCH_REQUIRED' });
        const updated = await db.update(users).set({ assignedBranchId: branchId, allowedBranches: [branchId], updatedAt: new Date() }).where(inArray(users.id, userIds)).returning();
        res.json({ updated: updated.length, users: updated });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const bulkDeleteUsers = async (req: Request, res: Response) => {
    try {
        const userIds = cleanStringArray(req.body?.userIds) || [];
        const toDelete = userIds.filter((id) => !PROTECTED_USER_IDS.includes(id));
        if (toDelete.length) await db.delete(userSessions).where(inArray(userSessions.userId, toDelete));
        const deleted = toDelete.length ? await db.delete(users).where(inArray(users.id, toDelete)).returning() : [];
        res.json({ deleted: deleted.length, skipped: userIds.length - toDelete.length, users: deleted });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const exportUsersCSV = async (_req: Request, res: Response) => {
    try {
        const allUsers = await db.select().from(users).orderBy(users.name);
        const safe = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = allUsers.map((u) => [u.id, u.name, u.email, u.role, u.assignedBranchId, u.isActive ? 'Active' : 'Inactive', u.lastLoginAt?.toISOString?.() || '', u.createdAt?.toISOString?.() || ''].map(safe).join(','));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=users-export-${Date.now()}.csv`);
        res.send('\uFEFFID,Name,Email,Role,AssignedBranch,Status,LastLogin,CreatedAt\n' + rows.join('\n'));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getUserSessions = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        res.json(await db.select().from(userSessions).where(eq(userSessions.userId, id)).orderBy(desc(userSessions.lastSeenAt)));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const revokeUserSession = async (req: Request, res: Response) => {
    try {
        const sessionId = param(req.params.sessionId);
        if (!sessionId) return res.status(400).json({ error: 'SESSION_ID_REQUIRED' });
        const [session] = await db.update(userSessions).set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() }).where(eq(userSessions.id, sessionId)).returning();
        if (!session) return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
        res.json({ success: true, session });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const revokeAllUserSessions = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        await db.update(userSessions).set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(userSessions.userId, id), eq(userSessions.isActive, true)));
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getAllActiveSessions = async (_req: Request, res: Response) => {
    try {
        const active = await db.select({
            id: userSessions.id,
            userId: userSessions.userId,
            userName: users.name,
            userRole: users.role,
            deviceName: userSessions.deviceName,
            userAgent: userSessions.userAgent,
            ipAddress: userSessions.ipAddress,
            lastSeenAt: userSessions.lastSeenAt,
            createdAt: userSessions.createdAt,
            expiresAt: userSessions.expiresAt,
        }).from(userSessions).innerJoin(users, eq(userSessions.userId, users.id))
            .where(and(eq(userSessions.isActive, true), gt(userSessions.expiresAt, new Date())))
            .orderBy(desc(userSessions.lastSeenAt));
        res.json(active);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getUserActivity = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        const { pool } = await import('../db');
        const result = await pool.query(`SELECT id, event_type, user_id, branch_id, payload, reason, created_at FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [id]);
        res.json(result.rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getUserAuditChanges = async (_req: Request, res: Response) => {
    try {
        const { pool } = await import('../db');
        const result = await pool.query(`SELECT al.id, al.event_type, al.user_id AS actor_id, u.name AS actor_name, al.payload, al.reason, al.created_at, al.branch_id FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id WHERE al.event_type LIKE 'USER_%' ORDER BY al.created_at DESC LIMIT 200`);
        res.json(result.rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const resetUserMFA = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        const [updated] = await db.update(users).set({ mfaEnabled: false, mfaSecret: null, updatedAt: new Date() }).where(eq(users.id, id)).returning();
        if (!updated) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const resetUserPin = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        const pin = cleanString(req.body?.newPin) || Math.floor(100000 + Math.random() * 900000).toString();
        if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: 'PIN_MUST_BE_6_DIGITS' });
        const [updated] = await db.update(users).set({ pinCode: pin, pinCodeHash: await bcrypt.hash(pin, 10), pinLoginEnabled: true, updatedAt: new Date() }).where(eq(users.id, id)).returning();
        if (!updated) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        res.json({ success: true, pin });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const adminResetPassword = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        const newPassword = cleanString(req.body?.newPassword);
        if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'PASSWORD_MIN_6_CHARS' });
        const [updated] = await db.update(users).set({ passwordHash: await bcrypt.hash(newPassword, 10), updatedAt: new Date() }).where(eq(users.id, id)).returning();
        if (!updated) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        await db.update(userSessions).set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(userSessions.userId, id), eq(userSessions.isActive, true)));
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getLoginHistory = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        const { pool } = await import('../db');
        const result = await pool.query(`SELECT id, event_type, payload, ip_address, created_at FROM audit_logs WHERE user_id = $1 AND (event_type = 'SECURITY_LOGIN' OR event_type = 'LOGIN_ATTEMPT') ORDER BY created_at DESC LIMIT 50`, [id]);
        res.json(result.rows);
    } catch {
        try {
            const id = param(req.params.id);
            if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
            res.json(await db.select({ id: userSessions.id, ipAddress: userSessions.ipAddress, deviceName: userSessions.deviceName, createdAt: userSessions.createdAt, lastSeenAt: userSessions.lastSeenAt, isActive: userSessions.isActive }).from(userSessions).where(eq(userSessions.userId, id)).orderBy(desc(userSessions.createdAt)).limit(50));
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
};

export const toggleUserActive = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        if (PROTECTED_USER_IDS.includes(id)) return res.status(403).json({ error: 'FORBIDDEN', message: 'System Owner cannot be deactivated' });
        const [user] = await db.select().from(users).where(eq(users.id, id));
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        const [updated] = await db.update(users).set({ isActive: !user.isActive, updatedAt: new Date() }).where(eq(users.id, id)).returning();
        if (!updated.isActive) await db.update(userSessions).set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(userSessions.userId, id), eq(userSessions.isActive, true)));
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateUserPermissions = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        const [updated] = await db.update(users).set({
            permissions: Array.isArray(req.body?.permissions) ? req.body.permissions : [],
            customPermissions: req.body?.customOverrides || {},
            updatedAt: new Date(),
        }).where(eq(users.id, id)).returning();
        if (!updated) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        await db.update(userSessions).set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(userSessions.userId, id), eq(userSessions.isActive, true)));
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getEffectivePermissions = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        const [user] = await db.select().from(users).where(eq(users.id, id));
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        const roleDefaults = INITIAL_ROLE_PERMISSIONS[user.role as UserRole] || [];
        const custom = user.customPermissions || {};
        const effective = new Set([...(roleDefaults || []), ...((user.permissions || []) as string[])]);
        for (const [perm, enabled] of Object.entries(custom)) enabled ? effective.add(perm) : effective.delete(perm);
        res.json({ userId: user.id, role: user.role, permissions: Array.from(effective), roleDefaults, userOverrides: user.permissions || [], customOverrides: custom });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateBranchAccess = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        const allowedBranches = cleanStringArray(req.body?.allowedBranches);
        const assignedBranchId = cleanString(req.body?.assignedBranchId) || allowedBranches?.[0];
        if (assignedBranchId) {
            const [branch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.id, assignedBranchId));
            if (!branch) return res.status(400).json({ error: 'INVALID_BRANCH_REFERENCE' });
        }
        const [updated] = await db.update(users).set({ assignedBranchId, allowedBranches: allowedBranches || [], updatedAt: new Date() }).where(eq(users.id, id)).returning();
        if (!updated) return res.status(404).json({ error: 'USER_NOT_FOUND' });
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
