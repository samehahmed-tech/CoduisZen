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
            if (!code || !type || !value) return res.status(400).json({ error: 'Code, type, and value are required' });

            const [created] = await db.insert(coupons).values({
                id: `CPN-${Date.now()}`,
                code: code.toUpperCase(),
                type,
                value,
                minOrderValue,
                maxDiscount,
                endDate: endDate ? new Date(endDate) : null,
                usageLimit,
            }).returning();

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

            const [created] = await db.insert(customerComplaints).values({
                id: `CST-CASE-${Date.now()}`,
                customerId,
                orderId,
                subject,
                description,
                priority: priority || 'MEDIUM',
                status: 'OPEN',
            }).returning();

            res.status(201).json(created);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
};
