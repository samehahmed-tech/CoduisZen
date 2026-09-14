/**
 * Refund Controller — POS Refund API
 */

import { Request, Response } from 'express';
import { refundService } from '../services/refundService';

const canAccessRefundBranch = (req: Request, branchId?: string | null) => {
    if (!branchId) return true;
    if (req.user?.role === 'SUPER_ADMIN') return true;
    return req.effectiveBranchId === branchId;
};

export const getRefunds = async (req: Request, res: Response) => {
    try {
        const refunds = await refundService.getRefunds({
            branchId: req.query.branchId ? String(req.query.branchId) : undefined,
            status: req.query.status ? String(req.query.status) : undefined,
            orderId: req.query.orderId ? String(req.query.orderId) : undefined,
            startDate: req.query.startDate ? String(req.query.startDate) : undefined,
            endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        });
        res.json(refunds);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getRefundById = async (req: Request, res: Response) => {
    try {
        const refund = await refundService.getRefundById(String(req.params.id));
        if (!refund) return res.status(404).json({ error: 'Refund not found' });
        if (!canAccessRefundBranch(req, refund.branchId)) {
            return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });
        }
        res.json(refund);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const requestRefund = async (req: Request, res: Response) => {
    try {
        const refund = await refundService.requestRefund({
            ...req.body,
            branchId: req.effectiveBranchId,
            requestedBy: req.user?.id || 'system',
            requestedByName: req.body.requestedByName || 'System',
        });
        res.status(201).json(refund);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const approveRefund = async (req: Request, res: Response) => {
    try {
        const existing = await refundService.getRefundById(String(req.params.id));
        if (!existing) return res.status(404).json({ error: 'Refund not found' });
        if (!canAccessRefundBranch(req, existing.branchId)) {
            return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });
        }
        const refund = await refundService.approveRefund(
            String(req.params.id),
            req.user?.id || 'system',
            req.body.approvedByName || 'System'
        );
        res.json(refund);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const rejectRefund = async (req: Request, res: Response) => {
    try {
        const existing = await refundService.getRefundById(String(req.params.id));
        if (!existing) return res.status(404).json({ error: 'Refund not found' });
        if (!canAccessRefundBranch(req, existing.branchId)) {
            return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });
        }
        const refund = await refundService.rejectRefund(
            String(req.params.id),
            req.user?.id || 'system',
            req.body.reason || 'No reason provided'
        );
        res.json(refund);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const processRefund = async (req: Request, res: Response) => {
    try {
        const existing = await refundService.getRefundById(String(req.params.id));
        if (!existing) return res.status(404).json({ error: 'Refund not found' });
        if (!canAccessRefundBranch(req, existing.branchId)) {
            return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });
        }
        const refund = await refundService.processRefund(String(req.params.id), req.user?.id || 'system');
        res.json(refund);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getRefundPolicy = async (_req: Request, res: Response) => {
    try {
        const policy = await refundService.getPolicy();
        res.json(policy);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateRefundPolicy = async (req: Request, res: Response) => {
    try {
        const policy = await refundService.updatePolicy(req.body, req.user?.id || 'system');
        res.json(policy);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getRefundStats = async (req: Request, res: Response) => {
    try {
        const stats = await refundService.getRefundStats(
            req.query.branchId ? String(req.query.branchId) : undefined,
            req.query.startDate ? String(req.query.startDate) : undefined,
            req.query.endDate ? String(req.query.endDate) : undefined
        );
        res.json(stats);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
