import { Request, Response } from 'express';
import { db } from '../db';
import { settings, branches, customers, orders, payments } from '../../src/db/schema';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { createSignedAuditLog } from '../services/auditService';
import { parseSettingJson, upsertSetting } from '../utils/settingsStore';
import { DEFAULT_RETENTION_POLICY, normalizeRetentionPolicy, RETENTION_POLICY_KEY, retentionCutoff } from '../utils/retentionPolicy';
import { assertBranchExportRange, MAX_BRANCH_EXPORT_ORDERS } from '../utils/branchExportPolicy';
import { isLegalHoldActive, normalizeLegalHoldInput, type LegalHold } from '../utils/legalHoldPolicy';
import { randomUUID } from 'node:crypto';

export const getRetentionPolicy = async (_req: Request, res: Response) => {
    try {
        const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, RETENTION_POLICY_KEY)).top(1);
        const policy = normalizeRetentionPolicy(parseSettingJson(row?.value, DEFAULT_RETENTION_POLICY));
        return res.json({ policy, execution: 'NO_AUTOMATIC_DELETE', cutoffs: Object.fromEntries([
            ['auditLogsDays', retentionCutoff(policy.auditLogsDays).toISOString()],
            ['ordersDays', retentionCutoff(policy.ordersDays).toISOString()],
            ['customerDataDays', retentionCutoff(policy.customerDataDays).toISOString()],
            ['webhookDeliveriesDays', retentionCutoff(policy.webhookDeliveriesDays).toISOString()],
            ['telemetryDays', retentionCutoff(policy.telemetryDays).toISOString()],
        ]) });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'RETENTION_POLICY_READ_FAILED' });
    }
};

export const updateRetentionPolicy = async (req: Request, res: Response) => {
    try {
        const policy = normalizeRetentionPolicy(req.body);
        await upsertSetting({ key: RETENTION_POLICY_KEY, value: policy, category: 'operations', updatedBy: req.user?.id || 'system' });
        await createSignedAuditLog({
            eventType: 'RETENTION_POLICY_UPDATED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: null,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { policy, automaticDelete: false },
            reason: 'Data retention policy updated',
        });
        return res.json({ updated: true, policy, execution: 'NO_AUTOMATIC_DELETE' });
    } catch (error: any) {
        const code = String(error?.message || 'RETENTION_POLICY_UPDATE_FAILED');
        return res.status(code.startsWith('RETENTION_') ? 400 : 500).json({ error: code, code });
    }
};

export const exportBranchData = async (req: Request, res: Response) => {
    try {
        const branchId = String(req.query.branchId || '').trim();
        const from = String(req.query.from || '').trim();
        const to = String(req.query.to || '').trim();
        const includePersonalData = String(req.query.includePersonalData || '').toLowerCase() === 'true';
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED', code: 'BRANCH_ID_REQUIRED' });
        assertBranchExportRange(from, to);
        const role = String(req.user?.role || '').toUpperCase();
        if (includePersonalData && !['SUPER_ADMIN', 'OWNER'].includes(role)) return res.status(403).json({ error: 'PERSONAL_DATA_EXPORT_RESTRICTED', code: 'PERSONAL_DATA_EXPORT_RESTRICTED' });
        const [branch] = await db.select({ id: branches.id, name: branches.name }).from(branches).where(eq(branches.id, branchId)).top(1);
        if (!branch) return res.status(404).json({ error: 'BRANCH_NOT_FOUND', code: 'BRANCH_NOT_FOUND' });
        const orderRows = await db.select({
            id: orders.id, customerId: orders.customerId, status: orders.status, type: orders.type, source: orders.source,
            subtotal: orders.subtotal, discount: orders.discount, tax: orders.tax, deliveryFee: orders.deliveryFee,
            serviceCharge: orders.serviceCharge, total: orders.total, paymentMethod: orders.paymentMethod,
            businessDate: orders.businessDate, createdAt: orders.createdAt,
        }).from(orders).where(and(
            eq(orders.branchId, branchId), gte(orders.businessDate, from), lte(orders.businessDate, to),
        )).orderBy(orders.businessDate).top(MAX_BRANCH_EXPORT_ORDERS + 1);
        if (orderRows.length > MAX_BRANCH_EXPORT_ORDERS) return res.status(413).json({ error: 'BRANCH_EXPORT_TOO_LARGE', code: 'BRANCH_EXPORT_TOO_LARGE', maxOrders: MAX_BRANCH_EXPORT_ORDERS });
        const orderIds = orderRows.map((order) => String(order.id));
        const customerIds = Array.from(new Set<string>(orderRows
            .map((order) => order.customerId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)));
        const customerRows = includePersonalData && customerIds.length > 0
            ? await db.select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, marketingOptIn: customers.marketingOptIn }).from(customers).where(inArray(customers.id, customerIds))
            : [];
        const paymentRows = orderIds.length > 0
            ? await db.select({ orderId: payments.orderId, method: payments.method, amount: payments.amount, status: payments.status, createdAt: payments.createdAt }).from(payments).where(inArray(payments.orderId, orderIds))
            : [];
        const payload = {
            exportVersion: 1, generatedAt: new Date().toISOString(), branch, period: { from, to },
            privacy: { personalDataIncluded: includePersonalData, paymentReferencesExcluded: true },
            orders: orderRows.map((order) => ({ ...order, customerId: includePersonalData ? order.customerId : null })),
            payments: paymentRows,
            ...(includePersonalData ? { customers: customerRows } : {}),
        };
        await createSignedAuditLog({
            eventType: 'BRANCH_DATA_EXPORTED', userId: req.user?.id || 'system', userRole: req.user?.role,
            branchId, requestId: req.requestId, sourceDevice: req.headers['user-agent'],
            payload: { branchId, from, to, orderCount: orderRows.length, paymentCount: paymentRows.length, customerCount: customerRows.length, personalDataIncluded: includePersonalData },
            reason: 'Branch data export',
        });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="branch-${branchId}-${from}-${to}.json"`);
        return res.send(JSON.stringify(payload));
    } catch (error: any) {
        const code = String(error?.message || 'BRANCH_EXPORT_FAILED');
        const status = code.startsWith('INVALID_') || code.endsWith('_TOO_LARGE') ? 400 : 500;
        return res.status(status).json({ error: code, code });
    }
};

const LEGAL_HOLDS_KEY = 'ops.data.legal-holds';

const readLegalHolds = async (): Promise<LegalHold[]> => {
    const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, LEGAL_HOLDS_KEY)).top(1);
    const value = parseSettingJson<unknown>(row?.value, []);
    return Array.isArray(value) ? value as LegalHold[] : [];
};

export const getRetentionPlan = async (_req: Request, res: Response) => {
    try {
        const [policyRow] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, RETENTION_POLICY_KEY)).top(1);
        const policy = normalizeRetentionPolicy(parseSettingJson(policyRow?.value, DEFAULT_RETENTION_POLICY));
        const holds = (await readLegalHolds()).filter((hold) => isLegalHoldActive(hold));
        const datasets = [
            ['auditLogs', policy.auditLogsDays],
            ['orders', policy.ordersDays],
            ['customerData', policy.customerDataDays],
            ['webhookDeliveries', policy.webhookDeliveriesDays],
            ['telemetry', policy.telemetryDays],
        ].map(([dataset, days]) => ({
            dataset,
            retentionDays: days,
            cutoff: retentionCutoff(Number(days)).toISOString(),
            legalHoldProtection: holds.length > 0,
            status: policy.executionMode === 'DRY_RUN' ? 'DRY_RUN' : 'MANUAL_APPROVAL_REQUIRED',
        }));
        return res.json({ execution: 'NO_AUTOMATIC_DELETE', policy, activeLegalHolds: holds.map((hold) => ({ id: hold.id, branchId: hold.branchId, caseReference: hold.caseReference })), datasets });
    } catch (error: any) { return res.status(500).json({ error: error.message || 'RETENTION_PLAN_FAILED' }); }
};

export const listLegalHolds = async (_req: Request, res: Response) => {
    try { return res.json({ holds: await readLegalHolds() }); } catch (error: any) { return res.status(500).json({ error: error.message || 'LEGAL_HOLD_READ_FAILED' }); }
};

export const createLegalHold = async (req: Request, res: Response) => {
    try {
        const normalized = normalizeLegalHoldInput(req.body);
        const hold: LegalHold = { id: `hold-${randomUUID()}`, ...normalized, active: true, createdBy: req.user?.id || 'system', createdAt: new Date().toISOString() };
        const holds = [...await readLegalHolds(), hold].slice(-500);
        await upsertSetting({ key: LEGAL_HOLDS_KEY, value: holds, category: 'operations', updatedBy: req.user?.id || 'system' });
        await createSignedAuditLog({ eventType: 'LEGAL_HOLD_CREATED', userId: req.user?.id || 'system', userRole: req.user?.role, branchId: hold.branchId, requestId: req.requestId, sourceDevice: req.headers['user-agent'], payload: { holdId: hold.id, branchId: hold.branchId, caseReference: hold.caseReference }, reason: 'Legal hold created' });
        return res.status(201).json(hold);
    } catch (error: any) {
        const code = String(error?.message || 'LEGAL_HOLD_CREATE_FAILED');
        return res.status(code.startsWith('LEGAL_HOLD_') ? 400 : 500).json({ error: code, code });
    }
};

export const releaseLegalHold = async (req: Request, res: Response) => {
    try {
        const holdId = String(req.params.id || '').trim();
        const holds = await readLegalHolds();
        const index = holds.findIndex((hold) => hold.id === holdId);
        if (index < 0) return res.status(404).json({ error: 'LEGAL_HOLD_NOT_FOUND', code: 'LEGAL_HOLD_NOT_FOUND' });
        const next = { ...holds[index], active: false };
        holds[index] = next;
        await upsertSetting({ key: LEGAL_HOLDS_KEY, value: holds, category: 'operations', updatedBy: req.user?.id || 'system' });
        await createSignedAuditLog({ eventType: 'LEGAL_HOLD_RELEASED', userId: req.user?.id || 'system', userRole: req.user?.role, branchId: next.branchId, requestId: req.requestId, sourceDevice: req.headers['user-agent'], payload: { holdId }, reason: 'Legal hold released' });
        return res.json(next);
    } catch (error: any) { return res.status(500).json({ error: error.message || 'LEGAL_HOLD_RELEASE_FAILED' }); }
};
