/**
 * Treasury Controller — محاسب الخزينة
 * Vouchers (سندات قبض/صرف), overview, supplier statements, custody.
 */
import { Request, Response } from 'express';
import { treasuryService } from '../services/treasuryService';
import { getStringParam } from '../utils/request';

const getBranchId = (req: Request): string | undefined =>
    getStringParam(req.query.branchId) || req.effectiveBranchId || (req.user as any)?.branchId;

const handle = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
    try {
        await fn(req, res);
    } catch (error: any) {
        const status = Number(error?.status) || 500;
        res.status(status).json({
            error: error?.code || error?.message,
            message: error?.message,
            ...(error?.available !== undefined ? { available: error.available, requested: error.requested } : {}),
            ...(error?.remaining !== undefined ? { remaining: error.remaining } : {}),
        });
    }
};

export const getOverview = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    res.json(await treasuryService.overview(branchId));
});

export const listVouchers = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    res.json(await treasuryService.listVouchers(branchId, {
        kind: getStringParam(req.query.kind),
        category: getStringParam(req.query.category),
        status: getStringParam(req.query.status),
        accountId: getStringParam(req.query.accountId),
        limit: req.query.limit ? Number(req.query.limit) : undefined,
    }));
});

export const createVoucher = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const row = await treasuryService.createVoucher({
        branchId,
        kind: req.body?.kind,
        category: req.body?.category,
        accountId: req.body?.accountId,
        amount: req.body?.amount,
        supplierId: req.body?.supplierId,
        invoiceId: req.body?.invoiceId,
        holderUserId: req.body?.holderUserId,
        holderName: req.body?.holderName,
        expenseAccountCode: req.body?.expenseAccountCode,
        description: req.body?.description,
        paymentMethod: req.body?.paymentMethod,
        reference: req.body?.reference,
        requestedBy: req.user?.id,
    });
    res.status(201).json(row);
});

export const approveVoucher = handle(async (req, res) => {
    const id = getStringParam((req.params as any).id);
    if (!id) return res.status(400).json({ error: 'VOUCHER_ID_REQUIRED' });
    res.json(await treasuryService.approveVoucher(id, req.user?.id));
});

export const rejectVoucher = handle(async (req, res) => {
    const id = getStringParam((req.params as any).id);
    if (!id) return res.status(400).json({ error: 'VOUCHER_ID_REQUIRED' });
    res.json(await treasuryService.rejectVoucher(id, req.user?.id));
});

export const cancelVoucher = handle(async (req, res) => {
    const id = getStringParam((req.params as any).id);
    if (!id) return res.status(400).json({ error: 'VOUCHER_ID_REQUIRED' });
    res.json(await treasuryService.cancelVoucher(id));
});

export const getSupplierStatement = handle(async (req, res) => {
    const supplierId = getStringParam((req.params as any).id) || getStringParam(req.query.supplierId);
    if (!supplierId) return res.status(400).json({ error: 'SUPPLIER_ID_REQUIRED' });
    res.json(await treasuryService.supplierStatement(supplierId));
});

export const getCustody = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    res.json(await treasuryService.custodyOutstanding(branchId));
});
