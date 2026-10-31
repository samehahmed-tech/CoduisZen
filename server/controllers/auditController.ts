import { Request, Response } from 'express';
import { db } from '../db';
import { auditLogs } from '../../src/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { buildSafeAuditPayload, redactAuditValue } from '../utils/auditPayload';
import { signAuditWithCurrentKey, verifyAuditSignature } from '../utils/auditSignature';
import { parseCursorPagination, decodeCursor, cursorPaginatedResponse } from '../middleware/pagination';
import { createSignedAuditLog } from '../services/auditService';

const auditInputFromRow = (row: any, createdAt: Date) => ({
    eventType: row.eventType,
    userId: row.userId,
    branchId: row.branchId,
    deviceId: row.deviceId,
    payload: row.payload,
    before: row.before,
    after: row.after,
    reason: row.reason,
    createdAt,
});

const isRowSignatureValid = (row: any, createdAt: Date) => Boolean(
    row.signature && verifyAuditSignature(auditInputFromRow(row, createdAt), row.signature, row.signatureVersion),
);

const auditIntegrityOperation = (req: Request, eventType: string, payload: Record<string, unknown>, after?: Record<string, unknown>) => createSignedAuditLog({
    eventType,
    userId: req.user?.id || 'system',
    userRole: req.user?.role,
    branchId: req.effectiveBranchId || req.user?.branchId || null,
    requestId: req.requestId,
    sourceDevice: req.headers['user-agent'],
    payload,
    after,
    reason: `Audit integrity operation: ${eventType}`,
});

export const getAuditLogs = async (req: Request, res: Response) => {
    try {
        const event_type = typeof req.query.event_type === 'string' ? req.query.event_type : undefined;
        const user_id = typeof req.query.user_id === 'string' ? req.query.user_id : undefined;

        const conditions: any[] = [];
        if (event_type) conditions.push(eq(auditLogs.eventType, event_type));
        if (user_id) conditions.push(eq(auditLogs.userId, user_id));
        if (req.effectiveBranchId) conditions.push(eq(auditLogs.branchId, req.effectiveBranchId));

        // Cursor-based pagination (new) vs legacy limit-based
        const useCursor = typeof req.query.cursor === 'string' || typeof req.query.direction === 'string';

        if (useCursor) {
            const { limit, cursor } = parseCursorPagination(req, 100);

            if (cursor) {
                const decoded = decodeCursor(cursor);
                if (decoded) {
                    conditions.push(
                        sql`(${auditLogs.createdAt}, CAST(${auditLogs.id} AS NVARCHAR(MAX))) < (CAST(${decoded.createdAt} AS DATETIME2), ${decoded.id})`
                    );
                }
            }

            const rows = await db.select()
                .from(auditLogs)
                .where(conditions.length ? and(...conditions) : undefined)
                .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
                .offset(0).fetch(limit + 1) as any[];

            // Attach integrity check
            const withIntegrity = rows.map(attachIntegrity);

            // Map to include string id for cursor compatibility
            const mapped = withIntegrity.map(r => ({ ...r, id: String(r.id), createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt) }));
            return res.json(cursorPaginatedResponse(mapped, limit));
        }

        // Legacy mode: simple limit
        const limit = typeof req.query.limit === 'string' ? req.query.limit : undefined;
        const max = Math.min(Number(limit) || 200, 500);

        const results = (conditions.length
            ? await db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).offset(0).fetch(max)
            : await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).offset(0).fetch(max)) as any[];

        res.json(results.map(attachIntegrity));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** Helper: attach integrity check to a single audit row */
function attachIntegrity(row: any) {
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    return {
        ...row,
        signatureValid: row.signature ? isRowSignatureValid(row, createdAt) : undefined,
    };
}

export const createAuditLog = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const trustedUserId = req.user?.id || 'system';
        const trustedBranchId = req.effectiveBranchId || req.user?.branchId || undefined;
        const payload = buildSafeAuditPayload(body.payload, {
            requestId: req.requestId,
            sourceDevice: body.sourceDevice || body.source_device,
        });
        const before = redactAuditValue(body.before ?? body.payload?.before);
        const after = redactAuditValue(body.after ?? body.payload?.after ?? body.payload?.order ?? body.payload);
        const reason = body.reason ?? payload?.reason;
        const createdAtCandidate = body.createdAt ?? body.created_at ?? body.timestamp;
        const createdAt = createdAtCandidate ? new Date(createdAtCandidate) : new Date();

        const signed = signAuditWithCurrentKey({
            eventType: body.eventType || body.event_type,
            userId: trustedUserId,
            branchId: trustedBranchId,
            deviceId: body.deviceId || body.device_id,
            payload,
            before,
            after,
            reason,
            createdAt: isNaN(createdAt.getTime()) ? new Date() : createdAt,
        });

        const [created] = await db.insert(auditLogs).output().values({
            eventType: body.eventType || body.event_type,
            // Never trust identity or branch ownership supplied by the client.
            userId: trustedUserId,
            userName: req.user?.name || undefined,
            userRole: req.user?.role || undefined,
            branchId: trustedBranchId,
            deviceId: body.deviceId || body.device_id,
            ipAddress: body.ipAddress || body.ip_address,
            payload,
            before,
            after,
            reason,
            signature: signed.signature,
            signatureVersion: signed.signatureVersion,
            createdAt: isNaN(createdAt.getTime()) ? new Date() : createdAt,
        });

        await auditIntegrityOperation(req, 'AUDIT_LOG_CLIENT_CREATED', {
            createdAuditId: created?.id || null,
            targetEventType: body.eventType || body.event_type || null,
        }, { created: true });

        res.status(201).json({ ...created, signatureValid: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Verify a single audit log signature
 * POST /api/audit-logs/:id/verify
 */
export const verifyAuditLog = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'INVALID_ID' });
        }

        const [row] = await db.select().from(auditLogs).where(and(
            eq(auditLogs.id, id),
            req.effectiveBranchId ? eq(auditLogs.branchId, req.effectiveBranchId) : undefined,
        ));
        if (!row) {
            return res.status(404).json({ error: 'NOT_FOUND' });
        }

        if (!row.signature) {
            return res.json({ id, valid: false, reason: 'NO_SIGNATURE' });
        }

        const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt || Date.now());
        const isValid = isRowSignatureValid(row, createdAt);

        // Update verification status in database
        await db.update(auditLogs)
            .set({
                isVerified: isValid,
                lastVerifiedAt: new Date(),
            })
            .where(and(
                eq(auditLogs.id, id),
                req.effectiveBranchId ? eq(auditLogs.branchId, req.effectiveBranchId) : undefined,
            ));

        await auditIntegrityOperation(req, 'AUDIT_LOG_VERIFIED', { auditId: id, valid: isValid }, { verified: true });

        res.json({
            id,
            valid: isValid,
            reason: isValid ? undefined : 'SIGNATURE_MISMATCH',
            verifiedAt: new Date().toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Bulk verify audit logs
 * POST /api/audit-logs/verify-all
 */
export const verifyAllAuditLogs = async (req: Request, res: Response) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

        const rows = await db.select()
            .from(auditLogs)
            .where(req.effectiveBranchId ? eq(auditLogs.branchId, req.effectiveBranchId) : undefined)
            .orderBy(desc(auditLogs.id))
            .offset(0).fetch(limit);

        let verified = 0;
        let failed = 0;
        const failedIds: number[] = [];

        for (const row of rows) {
            if (!row.signature) {
                failed++;
                failedIds.push(row.id);
                continue;
            }

            const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt || Date.now());
            const isValid = isRowSignatureValid(row, createdAt);

            await db.update(auditLogs)
                .set({
                    isVerified: isValid,
                    lastVerifiedAt: new Date(),
                })
                .where(eq(auditLogs.id, row.id));

            if (isValid) {
                verified++;
            } else {
                failed++;
                failedIds.push(row.id);
            }
        }

        await auditIntegrityOperation(req, 'AUDIT_LOGS_VERIFIED_ALL', { total: rows.length, verified, failed }, { completed: true });
        res.json({
            total: rows.length,
            verified,
            failed,
            failedIds: failedIds.slice(0, 10), // Only return first 10 failed IDs
            hasTamperedEntries: failed > 0,
            verifiedAt: new Date().toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Tamper detection scan with alerts
 * POST /api/audit-logs/scan-tamper
 */
export const scanForTampering = async (req: Request, res: Response) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string) || 500, 2000);
        const rows = await db.select()
            .from(auditLogs)
            .where(req.effectiveBranchId ? eq(auditLogs.branchId, req.effectiveBranchId) : undefined)
            .orderBy(desc(auditLogs.id))
            .offset(0).fetch(limit);

        const tamperedEntries: any[] = [];
        const missingSignatures: number[] = [];

        for (const row of rows) {
            if (!row.signature) {
                missingSignatures.push(row.id);
                continue;
            }

            const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt || Date.now());
            if (!isRowSignatureValid(row, createdAt)) {
                tamperedEntries.push({
                    id: row.id,
                    eventType: row.eventType,
                    userId: row.userId,
                    branchId: row.branchId,
                    createdAt: row.createdAt,
                    severity: 'CRITICAL',
                });
            }
        }

        const hasTampering = tamperedEntries.length > 0;

        await auditIntegrityOperation(req, 'AUDIT_TAMPER_SCAN_COMPLETED', { scannedCount: rows.length, tamperedCount: tamperedEntries.length, missingSignatureCount: missingSignatures.length }, { hasTampering });
        res.json({
            scannedCount: rows.length,
            tamperedCount: tamperedEntries.length,
            missingSignatureCount: missingSignatures.length,
            hasTampering,
            alert: hasTampering ? 'CRITICAL: Tampered audit entries detected!' : null,
            tamperedEntries: tamperedEntries.slice(0, 20),
            missingSignatures: missingSignatures.slice(0, 10),
            scannedAt: new Date().toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Forensic search with filters
 * GET /api/audit-logs/forensic
 */
export const forensicSearch = async (req: Request, res: Response) => {
    try {
        const {
            actor,      // userId
            entity,     // entity type from eventType (e.g., ORDER, PAYMENT, USER)
            branch,     // branchId
            from,       // start date
            to,         // end date
            eventType,
            limit: limitStr,
        } = req.query;

        const limit = Math.min(parseInt(limitStr as string) || 100, 500);
        const conditions: any[] = [];

        if (req.effectiveBranchId) {
            conditions.push(eq(auditLogs.branchId, req.effectiveBranchId));
        }

        if (actor && typeof actor === 'string') {
            conditions.push(eq(auditLogs.userId, actor));
        }

        if (branch && typeof branch === 'string' && !req.effectiveBranchId) {
            conditions.push(eq(auditLogs.branchId, branch));
        }

        if (eventType && typeof eventType === 'string') {
            conditions.push(eq(auditLogs.eventType, eventType));
        }

        // Get all logs matching basic conditions
        let rows = await (conditions.length
            ? db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).offset(0).fetch(limit * 2)
            : db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).offset(0).fetch(limit * 2));

        // Filter by entity (extract from eventType like ORDER_CREATED, PAYMENT_RECEIVED)
        if (entity && typeof entity === 'string') {
            rows = rows.filter(r => r.eventType?.toUpperCase().startsWith(entity.toUpperCase()));
        }

        // Filter by date range
        if (from && typeof from === 'string') {
            const fromDate = new Date(from);
            if (!isNaN(fromDate.getTime())) {
                rows = rows.filter(r => {
                    const rowDate = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt || 0);
                    return rowDate >= fromDate;
                });
            }
        }

        if (to && typeof to === 'string') {
            const toDate = new Date(to);
            if (!isNaN(toDate.getTime())) {
                rows = rows.filter(r => {
                    const rowDate = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt || 0);
                    return rowDate <= toDate;
                });
            }
        }

        // Limit after filtering
        rows = rows.slice(0, limit);

        // Add integrity check
        const withIntegrity = rows.map((row) => {
            const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt || Date.now());
            return {
                ...row,
                signatureValid: row.signature ? isRowSignatureValid(row, createdAt) : null,
            };
        });

        res.json({
            count: withIntegrity.length,
            filters: { actor, entity, branch, from, to, eventType },
            results: withIntegrity,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
