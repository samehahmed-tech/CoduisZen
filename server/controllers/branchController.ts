import { Request, Response } from 'express';
import { db } from '../db';
import { branches } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { isForeignKeyDeleteError, writeForeignKeyDeleteConflict } from '../utils/dbErrors';

export const getAllBranches = async (req: Request, res: Response) => {
    try {
        const role = String(req.user?.role || '').toUpperCase();
        const allowedBranches = Array.isArray(req.user?.allowedBranches) ? req.user.allowedBranches : [];

        let allBranches = await db.select().from(branches).where(eq(branches.isActive, true)).orderBy(branches.name);

        if (role === 'CALL_CENTER_AGENT') {
            if (allowedBranches.length > 0) {
                allBranches = allBranches.filter(b => allowedBranches.includes(b.id));
            } else {
                allBranches = [];
            }
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
            res.json({ message: 'Branch deleted permanently' });
        } else {
            // Soft delete
            await db.update(branches).set({ isActive: false, updatedAt: new Date() }).where(eq(branches.id, id));
            res.json({ message: 'Branch deactivated successfully' });
        }
    } catch (error: any) {
        if (isForeignKeyDeleteError(error)) {
            return writeForeignKeyDeleteConflict(res, 'branch', ['shifts', 'orders', 'printers', 'warehouses', 'print_jobs']);
        }
        res.status(500).json({ error: error.message });
    }
};
