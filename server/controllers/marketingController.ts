import { Request, Response } from 'express';
import { db } from '../db';
import { coupons, customerComplaints } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { getStringParam } from '../utils/request';

export const marketingController = {
    // --- Coupons ---
    async getCoupons(req: Request, res: Response) {
        try {
            const result = await db.select().from(coupons);
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    async createCoupon(req: Request, res: Response) {
        try {
            const { code, type, value, minOrderValue, maxDiscount, endDate, usageLimit } = req.body;
            const normalizedCode = String(code || '').trim().toUpperCase();
            const normalizedType = String(type || '').trim().toUpperCase();
            const discountValue = Number(value);
            if (!normalizedCode || !['PERCENTAGE', 'FIXED_AMOUNT'].includes(normalizedType) || !Number.isFinite(discountValue) || discountValue <= 0) {
                return res.status(400).json({ error: 'INVALID_COUPON' });
            }
            if (normalizedType === 'PERCENTAGE' && discountValue > 100) {
                return res.status(400).json({ error: 'INVALID_COUPON_PERCENTAGE' });
            }
            const [existingCoupon] = await db.select({ id: coupons.id }).top(1).from(coupons).where(eq(coupons.code, normalizedCode));
            if (existingCoupon) return res.status(409).json({ error: 'COUPON_CODE_EXISTS' });

            const [created] = await db.insert(coupons).output().values({
                id: `CPN-${Date.now()}`,
                code: normalizedCode,
                type: normalizedType,
                value: discountValue,
                minOrderValue,
                maxDiscount,
                endDate: endDate ? new Date(endDate) : null,
                usageLimit,
            });

            res.status(201).json(created);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    // --- Complaints ---
    async getComplaints(req: Request, res: Response) {
        try {
            const result = await db.select().from(customerComplaints);
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    async createComplaint(req: Request, res: Response) {
        try {
            const { customerId, orderId, subject, description, priority } = req.body;
            if (!customerId || !subject || !description) return res.status(400).json({ error: 'Missing required fields' });

            const [created] = await db.insert(customerComplaints).output().values({
                id: `CST-CASE-${Date.now()}`,
                customerId,
                orderId,
                subject,
                description,
                priority: priority || 'MEDIUM',
                status: 'OPEN',
            });

            res.status(201).json(created);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    async updateComplaint(req: Request, res: Response) {
        try {
            const id = getStringParam((req.params as any).id);
            const { status, assignedTo, resolutionNotes, priority } = req.body || {};
            if (!id) return res.status(400).json({ error: 'COMPLAINT_ID_REQUIRED' });
            const patch: any = { updatedAt: new Date() };
            if (status !== undefined) {
                const s = String(status).toUpperCase();
                if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(s)) {
                    return res.status(400).json({ error: 'INVALID_STATUS' });
                }
                patch.status = s;
            }
            if (assignedTo !== undefined) patch.assignedTo = String(assignedTo);
            if (resolutionNotes !== undefined) patch.resolutionNotes = String(resolutionNotes);
            if (priority !== undefined) {
                const p = String(priority).toUpperCase();
                if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(p)) {
                    return res.status(400).json({ error: 'INVALID_PRIORITY' });
                }
                patch.priority = p;
            }
            const [updated] = await db.update(customerComplaints).set(patch).output()
                .where(eq(customerComplaints.id, id));
            if (!updated) return res.status(404).json({ error: 'COMPLAINT_NOT_FOUND' });
            res.json(updated);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
};
