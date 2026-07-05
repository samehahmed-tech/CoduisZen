import { Request, Response } from 'express';
import { db } from '../db';
import { etaDeadLetters, fiscalLogs } from '../../src/db/schema';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { getStringParam, getNumberParam } from '../utils/request';
import { submitOrderToFiscal } from '../services/fiscalSubmitService';
import { etaService } from '../services/etaService';

const getDateRange = (dateFrom?: string, dateTo?: string) => {
    const end = dateTo ? new Date(dateTo) : new Date();
    end.setHours(23, 59, 59, 999);

    const start = dateFrom ? new Date(dateFrom) : new Date(end);
    if (!dateFrom) {
        start.setDate(end.getDate() - 7);
    }
    start.setHours(0, 0, 0, 0);

    return { start, end };
};

export const submitReceipt = async (req: Request, res: Response) => {
    try {
        const orderId = getStringParam(req.body?.orderId);
        if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });
        const force = Boolean(req.body?.force);
        const result = await submitOrderToFiscal(orderId, { force });
        res.json({ success: true, ...result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getFiscalLogs = async (req: Request, res: Response) => {
    try {
        const branchId = getStringParam(req.query.branchId);
        const limit = getNumberParam(req.query.limit) || 50;

        let query = db.select().from(fiscalLogs);
        if (branchId) {
            // @ts-ignore dynamic where chaining
            query = query.where(eq(fiscalLogs.branchId, branchId));
        }
        const rows = await query.orderBy(desc(fiscalLogs.createdAt)).limit(Math.min(200, limit));
        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getFiscalSummary = async (req: Request, res: Response) => {
    try {
        const branchId = getStringParam(req.query.branchId);
        const dateFrom = getStringParam(req.query.dateFrom);
        const dateTo = getStringParam(req.query.dateTo);
        const { start, end } = getDateRange(dateFrom, dateTo);

        const rows = await db.select({
            status: fiscalLogs.status,
            count: sql<number>`count(*)`,
        }).from(fiscalLogs)
            .where(and(
                branchId ? eq(fiscalLogs.branchId, branchId) : undefined,
                gte(fiscalLogs.createdAt, start),
                lte(fiscalLogs.createdAt, end),
            ))
            .groupBy(fiscalLogs.status);

        const deadLetters = await db.select({
            status: etaDeadLetters.status,
            count: sql<number>`count(*)`,
        }).from(etaDeadLetters)
            .where(and(
                branchId ? eq(etaDeadLetters.branchId, branchId) : undefined,
                gte(etaDeadLetters.createdAt, start),
                lte(etaDeadLetters.createdAt, end),
            ))
            .groupBy(etaDeadLetters.status);

        const summary = {
            submitted: Number(rows.find(r => r.status === 'SUBMITTED')?.count || 0),
            pending: Number(rows.find(r => r.status === 'PENDING')?.count || 0),
            failed: Number(rows.find(r => r.status === 'FAILED')?.count || 0),
        };
        const total = summary.submitted + summary.pending + summary.failed;
        const successRate = total > 0 ? summary.submitted / total : 1;

        res.json({
            branchId: branchId || 'ALL',
            period: { start, end },
            summary: {
                ...summary,
                total,
                successRate: Number(successRate.toFixed(4)),
            },
            deadLetters: deadLetters.map(item => ({
                status: item.status,
                count: Number(item.count || 0),
            })),
            alerts: {
                hasFailures: summary.failed > 0,
                hasPendingDeadLetters: deadLetters.some(item => item.status === 'PENDING' && Number(item.count || 0) > 0),
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getDeadLetters = async (req: Request, res: Response) => {
    try {
        const branchId = getStringParam(req.query.branchId);
        const status = getStringParam(req.query.status);

        const rows = await db.select().from(etaDeadLetters)
            .where(and(
                branchId ? eq(etaDeadLetters.branchId, branchId) : undefined,
                status ? eq(etaDeadLetters.status, status) : undefined,
            ))
            .orderBy(desc(etaDeadLetters.updatedAt));

        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const retryDeadLetter = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: 'INVALID_DEAD_LETTER_ID' });
        }

        const result = await etaService.retryDeadLetter(id);
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const dismissDeadLetter = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: 'INVALID_DEAD_LETTER_ID' });
        }
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'AUTH_REQUIRED' });
        }

        await etaService.dismissDeadLetter(id, userId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getFiscalConfig = async (_req: Request, res: Response) => {
    const required = [
        'ETA_BASE_URL',
        'ETA_TOKEN_URL',
        'ETA_CLIENT_ID',
        'ETA_CLIENT_SECRET',
        'ETA_API_KEY',
        'ETA_PRIVATE_KEY',
        'ETA_RIN',
    ];
    const missing = required.filter(key => !process.env[key]);
    res.json({ ok: missing.length === 0, missing });
};

export const getFiscalReadiness = async (req: Request, res: Response) => {
    try {
        const branchId = getStringParam(req.query.branchId);
        const since = new Date();
        since.setDate(since.getDate() - 1);

        const required = [
            'ETA_BASE_URL',
            'ETA_TOKEN_URL',
            'ETA_CLIENT_ID',
            'ETA_CLIENT_SECRET',
            'ETA_API_KEY',
            'ETA_PRIVATE_KEY',
            'ETA_RIN',
        ];
        const missing = required.filter(key => !process.env[key]);

        const rows = await db.select({
            status: fiscalLogs.status,
            count: sql<number>`count(*)`,
        }).from(fiscalLogs)
            .where(and(
                branchId ? eq(fiscalLogs.branchId, branchId) : undefined,
                gte(fiscalLogs.createdAt, since),
            ))
            .groupBy(fiscalLogs.status);

        const pendingDlqRows = await db.select().from(etaDeadLetters)
            .where(and(
                branchId ? eq(etaDeadLetters.branchId, branchId) : undefined,
                eq(etaDeadLetters.status, 'PENDING'),
            ))
            .orderBy(desc(etaDeadLetters.createdAt));

        const submitted = Number(rows.find(r => r.status === 'SUBMITTED')?.count || 0);
        const failed = Number(rows.find(r => r.status === 'FAILED')?.count || 0);
        const pending = Number(rows.find(r => r.status === 'PENDING')?.count || 0);
        const total = submitted + failed + pending;
        const successRate = total > 0 ? Number((submitted / total).toFixed(4)) : 1;

        const oldestPendingDlq = pendingDlqRows.length > 0 ? pendingDlqRows[pendingDlqRows.length - 1] : null;
        const oldestPendingAgeMinutes = oldestPendingDlq?.createdAt
            ? Math.floor((Date.now() - new Date(oldestPendingDlq.createdAt).getTime()) / 60000)
            : 0;

        const alerts = {
            configMissing: missing.length > 0,
            lowSuccessRate: successRate < 0.98,
            hasPendingDlq: pendingDlqRows.length > 0,
            stalePendingDlq: oldestPendingAgeMinutes >= 30,
        };

        res.json({
            ok: !alerts.configMissing && !alerts.lowSuccessRate && !alerts.stalePendingDlq,
            branchId: branchId || 'ALL',
            period: { from: since, to: new Date() },
            config: {
                ok: missing.length === 0,
                missing,
            },
            metrics24h: {
                submitted,
                pending,
                failed,
                total,
                successRate,
            },
            deadLetter: {
                pendingCount: pendingDlqRows.length,
                oldestPendingAgeMinutes,
            },
            alerts,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_GET_FISCAL_READINESS' });
    }
};
