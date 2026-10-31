import { Request, Response } from 'express';
import { db } from '../db';
import { coupons, customerComplaints, orders } from '../../src/db/schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { createSignedAuditLog } from '../services/auditService';
import { canAccessBranch } from '../middleware/branchIsolation';

const auditMarketingMutation = (req: Request, eventType: string, payload: Record<string, unknown>, after?: Record<string, unknown>) => createSignedAuditLog({
    eventType,
    userId: req.user?.id || 'system',
    userRole: req.user?.role,
    branchId: req.effectiveBranchId || req.user?.branchId || null,
    requestId: req.requestId,
    sourceDevice: req.headers?.['user-agent'],
    payload,
    after,
    reason: `Marketing mutation: ${eventType}`,
});

export const marketingController = {
    // --- Coupons ---
    async getCoupons(req: Request, res: Response) {
        try {
            const branchId = req.effectiveBranchId || req.user?.branchId;
            const result = await db.select().from(coupons).where(
                branchId ? or(isNull(coupons.branchId), eq(coupons.branchId, branchId)) : undefined,
            );
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    async createCoupon(req: Request, res: Response) {
        try {
            const { code, type, value, minOrderValue, maxDiscount, endDate, usageLimit, campaignId } = req.body;
            const branchId = req.effectiveBranchId || null;
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
                branchId,
                campaignId: campaignId ? String(campaignId).trim() : null,
                type: normalizedType,
                value: discountValue,
                minOrderValue,
                maxDiscount,
                endDate: endDate ? new Date(endDate) : null,
                usageLimit,
            });

            await auditMarketingMutation(req, 'COUPON_CREATED', { couponId: created?.id || null, type: normalizedType, value: discountValue, usageLimit: usageLimit ?? null }, { active: true });
            res.status(201).json(created);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    // --- Complaints ---
    async getComplaints(req: Request, res: Response) {
        try {
            const branchId = req.effectiveBranchId || req.user?.branchId;
            const result = await db.select().from(customerComplaints).where(
                branchId ? eq(customerComplaints.branchId, branchId) : undefined,
            );
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    async createComplaint(req: Request, res: Response) {
        try {
            const { customerId, orderId, subject, description, priority } = req.body;
            if (!customerId || !subject || !description) return res.status(400).json({ error: 'Missing required fields' });

            const branchId = req.effectiveBranchId || req.user?.branchId || null;
            if (orderId) {
                const [order] = await db.select({ branchId: orders.branchId, customerId: orders.customerId })
                    .from(orders)
                    .where(eq(orders.id, String(orderId)));
                if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
                if (String(order.customerId || '') !== String(customerId)) return res.status(409).json({ error: 'ORDER_CUSTOMER_MISMATCH' });
                if (branchId && order.branchId && order.branchId !== branchId) return res.status(403).json({ error: 'BRANCH_MISMATCH' });
            }

            const [created] = await db.insert(customerComplaints).output().values({
                id: `CST-CASE-${Date.now()}`,
                customerId,
                orderId,
                branchId,
                subject,
                description,
                priority: priority || 'MEDIUM',
                status: 'OPEN',
            });

            await auditMarketingMutation(req, 'CUSTOMER_COMPLAINT_CREATED', { complaintId: created?.id || null, customerId: String(customerId), orderId: orderId || null, priority: priority || 'MEDIUM', descriptionLength: String(description).length }, { status: 'OPEN' });
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
            const [existing] = await db.select({ branchId: customerComplaints.branchId })
                .from(customerComplaints)
                .where(eq(customerComplaints.id, id));
            if (!existing) return res.status(404).json({ error: 'COMPLAINT_NOT_FOUND' });
            if (existing.branchId && !canAccessBranch(req.user, existing.branchId)) {
                return res.status(403).json({ error: 'BRANCH_MISMATCH' });
            }
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
            await auditMarketingMutation(req, 'CUSTOMER_COMPLAINT_UPDATED', { complaintId: id, changedKeys: Object.keys(req.body || {}).filter((key) => key !== 'resolutionNotes').sort(), resolutionNotesLength: resolutionNotes ? String(resolutionNotes).length : 0 }, { status: updated.status });
            res.json(updated);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
};
