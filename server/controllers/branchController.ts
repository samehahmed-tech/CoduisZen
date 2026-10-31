import { Request, Response } from 'express';
import { db } from '../db';
import { branches } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { isForeignKeyDeleteError, writeForeignKeyDeleteConflict } from '../utils/dbErrors';
import { createSignedAuditLog } from '../services/auditService';
import { isCrossBranchMonitor } from '../middleware/branchIsolation';

export const getAllBranches = async (req: Request, res: Response) => {
    try {
        const role = String(req.user?.role || '').toUpperCase();
        const allowedBranches = Array.isArray(req.user?.allowedBranches) ? req.user.allowedBranches : [];

        const includeInactive = req.query.includeInactive === 'true';
        let allBranches = includeInactive
            ? await db.select().from(branches).orderBy(branches.name)
            : await db.select().from(branches).where(eq(branches.isActive, true)).orderBy(branches.name);

        const isTopLevel = role === 'SUPER_ADMIN' || role === 'OWNER' || isCrossBranchMonitor(role);
        if (!isTopLevel) {
            const visibleBranches = new Set([req.user?.branchId, ...allowedBranches].filter(Boolean).map(String));
            allBranches = allBranches.filter(b => visibleBranches.has(String(b.id)));
        }

        res.json(allBranches);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createBranch = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const newBranch = await db.insert(branches).output().values({
            id: body.id,
            name: body.name,
            nameAr: body.name_ar || body.nameAr,
            location: body.location,
            address: body.address,
            phone: body.phone,
            email: body.email,
            serverIp: body.serverIp || body.server_ip,
            dayCloseEmails: body.dayCloseEmails || body.day_close_emails || [],
            isActive: body.is_active !== false && body.isActive !== false,
            timezone: body.timezone,
            currency: body.currency,
            taxRate: body.tax_rate ?? body.taxRate,
            serviceCharge: body.service_charge ?? body.serviceCharge,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        await createSignedAuditLog({
            eventType: 'BRANCH_CREATED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: newBranch[0]?.id || body.id || null,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { branchId: newBranch[0]?.id || body.id || null, hasEmail: Boolean(body.email), hasPhone: Boolean(body.phone) },
            after: { active: newBranch[0]?.isActive !== false },
            reason: 'Branch created',
        });
        res.status(201).json(newBranch[0]);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateBranch = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        const [before] = await db.select({ id: branches.id, isActive: branches.isActive, timezone: branches.timezone, currency: branches.currency }).from(branches).where(eq(branches.id, id));
        const updatedBranch = await db.update(branches)
            .set({
                name: body.name,
                nameAr: body.name_ar || body.nameAr,
                location: body.location,
                address: body.address,
                phone: body.phone,
                email: body.email,
                serverIp: body.serverIp !== undefined ? body.serverIp : (body.server_ip !== undefined ? body.server_ip : undefined),
                dayCloseEmails: body.dayCloseEmails !== undefined ? body.dayCloseEmails : (body.day_close_emails !== undefined ? body.day_close_emails : undefined),
                isActive: body.isActive !== undefined ? body.isActive : (body.is_active !== undefined ? body.is_active : undefined),
                timezone: body.timezone,
                currency: body.currency,
                taxRate: body.tax_rate ?? body.taxRate,
                serviceCharge: body.service_charge ?? body.serviceCharge,
                updatedAt: new Date()
            })
            .output()
            .where(eq(branches.id, id));
        await createSignedAuditLog({
            eventType: 'BRANCH_UPDATED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: id,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { branchId: id, changedKeys: Object.keys(body).filter((key) => !/server.?ip|password|secret|token/i.test(key)).sort() },
            before,
            after: updatedBranch[0] ? { id: updatedBranch[0].id, isActive: updatedBranch[0].isActive, timezone: updatedBranch[0].timezone, currency: updatedBranch[0].currency } : undefined,
            reason: 'Branch updated',
        });
        res.json(updatedBranch[0]);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteBranch = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        const isHard = req.query.hard === 'true';
        if (!id) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        
        if (isHard) {
            await db.delete(branches).where(eq(branches.id, id));
            await createSignedAuditLog({
                eventType: 'BRANCH_DELETED',
                userId: req.user?.id || 'system',
                userRole: req.user?.role,
                branchId: id,
                requestId: req.requestId,
                sourceDevice: req.headers['user-agent'],
                payload: { branchId: id, hard: true },
                before: { id, active: true },
                after: { deleted: true },
                reason: 'Branch permanently deleted',
            });
            res.json({ message: 'Branch deleted permanently' });
        } else {
            // Soft delete
            await db.update(branches).set({ isActive: false, updatedAt: new Date() }).where(eq(branches.id, id));
            await createSignedAuditLog({
                eventType: 'BRANCH_DEACTIVATED',
                userId: req.user?.id || 'system',
                userRole: req.user?.role,
                branchId: id,
                requestId: req.requestId,
                sourceDevice: req.headers['user-agent'],
                payload: { branchId: id, hard: false },
                before: { id, active: true },
                after: { id, active: false },
                reason: 'Branch deactivated',
            });
            res.json({ message: 'Branch deactivated successfully' });
        }
    } catch (error: any) {
        if (isForeignKeyDeleteError(error)) {
            return writeForeignKeyDeleteConflict(res, 'branch', ['shifts', 'orders', 'printers', 'warehouses', 'print_jobs']);
        }
        res.status(500).json({ error: error.message });
    }
};
