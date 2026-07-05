import { Request, Response } from 'express';
import { pool } from '../db';
import { db } from '../db';
import { etaDeadLetters, fiscalLogs, postingRules } from '../../src/db/schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { getSocketRuntimeStatus } from '../socket';

export const getRealtimeHealth = async (_req: Request, res: Response) => {
    const socket = getSocketRuntimeStatus();
    let dbOk = false;
    let dbLatencyMs = -1;

    try {
        const started = Date.now();
        await pool.query('select 1');
        dbOk = true;
        dbLatencyMs = Date.now() - started;
    } catch {
        dbOk = false;
    }

    res.json({
        ok: dbOk,
        timestamp: new Date().toISOString(),
        database: {
            ok: dbOk,
            latencyMs: dbLatencyMs,
        },
        socket,
    });
};

export const getPlatformHealth = async (req: Request, res: Response) => {
    const socket = getSocketRuntimeStatus();
    const branchId = getStringParam(req.query.branchId);
    const startedAt = Date.now();
    let dbOk = false;
    let dbLatencyMs = -1;

    try {
        const dbStarted = Date.now();
        await pool.query('select 1');
        dbOk = true;
        dbLatencyMs = Date.now() - dbStarted;
    } catch {
        dbOk = false;
    }

    const since = new Date();
    since.setDate(since.getDate() - 1);

    const rows = await db.select({
        status: fiscalLogs.status,
        count: sql<number>`count(*)`,
    }).from(fiscalLogs)
        .where(and(
            branchId ? eq(fiscalLogs.branchId, branchId) : undefined,
            gte(fiscalLogs.createdAt, since),
        ))
        .groupBy(fiscalLogs.status);

    const pendingDlqRows = await db.select({ count: sql<number>`count(*)` }).from(etaDeadLetters)
        .where(and(
            branchId ? eq(etaDeadLetters.branchId, branchId) : undefined,
            eq(etaDeadLetters.status, 'PENDING'),
        ));

    const submitted = Number(rows.find(r => r.status === 'SUBMITTED')?.count || 0);
    const failed = Number(rows.find(r => r.status === 'FAILED')?.count || 0);
    const pending = Number(rows.find(r => r.status === 'PENDING')?.count || 0);
    const total = submitted + failed + pending;
    const successRate = total > 0 ? Number((submitted / total).toFixed(4)) : 1;
    const pendingDlqCount = Number(pendingDlqRows[0]?.count || 0);

    const fiscalConfigMissing = [
        'ETA_BASE_URL',
        'ETA_TOKEN_URL',
        'ETA_CLIENT_ID',
        'ETA_CLIENT_SECRET',
        'ETA_API_KEY',
        'ETA_PRIVATE_KEY',
        'ETA_RIN',
    ].filter((key) => !process.env[key]);

    const alerts = {
        dbDown: !dbOk,
        realtimeDegraded: socket.adapter !== 'redis' || !socket.redisConnected,
        fiscalConfigMissing: fiscalConfigMissing.length > 0,
        fiscalLowSuccessRate: successRate < 0.98,
        fiscalPendingDlq: pendingDlqCount > 0,
    };

    res.json({
        ok: !alerts.dbDown && !alerts.fiscalConfigMissing,
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startedAt,
        branchScope: branchId || 'ALL',
        database: {
            ok: dbOk,
            latencyMs: dbLatencyMs,
        },
        socket,
        fiscal: {
            configOk: fiscalConfigMissing.length === 0,
            missingConfig: fiscalConfigMissing,
            metrics24h: {
                submitted,
                pending,
                failed,
                total,
                successRate,
            },
            deadLetter: {
                pendingCount: pendingDlqCount,
            },
        },
        alerts,
    });
};

/**
 * Sprint 3: Side effect health endpoint
 * Returns count of failed side effects (finance, fiscal, print, webhook) from domain_events.
 */
export const getSideEffectHealth = async (req: Request, res: Response) => {
    const branchId = getStringParam(req.query.branchId);
    const date = getStringParam(req.query.date) || new Date().toISOString().split('T')[0];

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { domainEvents } = await import('../../src/db/schema');
    const { like } = await import('drizzle-orm');

    const failedEvents = await db.select({
        type: domainEvents.type,
        count: sql<number>`count(*)`,
    }).from(domainEvents).where(and(
        like(domainEvents.type, 'side_effect.%.failed'),
        branchId ? eq(domainEvents.branchId, branchId) : undefined,
        gte(domainEvents.createdAt, startOfDay),
        lte(domainEvents.createdAt, endOfDay),
    )).groupBy(domainEvents.type);

    const successEvents = await db.select({
        type: domainEvents.type,
        count: sql<number>`count(*)`,
    }).from(domainEvents).where(and(
        like(domainEvents.type, 'side_effect.%.success'),
        branchId ? eq(domainEvents.branchId, branchId) : undefined,
        gte(domainEvents.createdAt, startOfDay),
        lte(domainEvents.createdAt, endOfDay),
    )).groupBy(domainEvents.type);

    const extract = (rows: typeof failedEvents, suffix: string) => {
        const result: Record<string, number> = {};
        for (const row of rows) {
            const effectType = row.type.replace(`side_effect.`, '').replace(`.${suffix}`, '');
            result[effectType] = Number(row.count || 0);
        }
        return result;
    };

    res.json({
        date,
        branchScope: branchId || 'ALL',
        failed: extract(failedEvents, 'failed'),
        success: extract(successEvents, 'success'),
        totalFailed: failedEvents.reduce((sum, e) => sum + Number(e.count), 0),
        totalSuccess: successEvents.reduce((sum, e) => sum + Number(e.count), 0),
    });
};

/**
 * Item 24: Posting rules preflight check.
 * Validates that all required posting rules exist before finance is ready.
 */
const REQUIRED_POSTING_RULES: { documentType: string; label: string }[] = [
    { documentType: 'POS_SALE', label: 'POS Sale' },
    { documentType: 'POS_REFUND', label: 'Refund' },
    { documentType: 'VAT', label: 'VAT / Tax' },
    { documentType: 'PAYMENT_CASH', label: 'Cash Payment' },
    { documentType: 'PAYMENT_CARD', label: 'Card Payment' },
    { documentType: 'INVENTORY_ADJUSTMENT', label: 'Inventory Adjustment' },
    { documentType: 'WASTAGE', label: 'Wastage' },
];

export const getFinanceReadiness = async (_req: Request, res: Response) => {
    try {
        const existingRules = await db.select({
            documentType: postingRules.documentType,
        }).from(postingRules).where(eq(postingRules.isActive, true));

        const existingTypes = new Set(existingRules.map(r => r.documentType));

        const results = REQUIRED_POSTING_RULES.map(rule => ({
            documentType: rule.documentType,
            label: rule.label,
            exists: existingTypes.has(rule.documentType),
        }));

        const missingRules = results.filter(r => !r.exists);
        const ready = missingRules.length === 0;

        res.json({
            ready,
            totalRequired: REQUIRED_POSTING_RULES.length,
            totalExisting: results.filter(r => r.exists).length,
            missingRules: missingRules.map(r => ({ documentType: r.documentType, label: r.label })),
            rules: results,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
