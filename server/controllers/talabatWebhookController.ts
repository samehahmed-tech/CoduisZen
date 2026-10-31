import type { Request, Response } from 'express';
import { ingestTalabatWebhook } from '../modules/talabat/talabatIngestService';
import logger from '../utils/logger';
import { createSignedAuditLog } from '../services/auditService';

const log = logger.child({ controller: 'talabat-webhook' });

/**
 * POST /api/integrations/talabat/webhook (public, Talabat-signed).
 * Must ack 2xx within 10s — ingest is fast, side effects are fire-and-forget.
 * Duplicate deliveries return the same order (idempotent).
 */
export const receiveTalabatWebhook = async (req: Request, res: Response) => {
    try {
        const result = await ingestTalabatWebhook(req.body);
        await createSignedAuditLog({
            eventType: 'TALABAT_WEBHOOK_PROCESSED',
            branchId: result.branchId || null,
            userId: null,
            userName: 'talabat-webhook',
            userRole: 'EXTERNAL_INTEGRATION',
            payload: {
                orderId: result.orderId,
                created: result.created,
                internalStatus: result.internalStatus,
            },
            after: { acknowledged: true },
            reason: 'Authenticated Talabat webhook',
        });
        return res.status(200).json({ ok: true, orderId: result.orderId, created: result.created, status: result.internalStatus });
    } catch (err: any) {
        const status = Number(err?.status) || 400;
        const code = String(err?.code || err?.message || 'TALABAT_INGEST_FAILED');
        // TALABAT_DISABLED still acks to stop retries piling up.
        if (code === 'TALABAT_DISABLED') return res.status(200).json({ ok: true, ignored: true, code });
        log.warn({ code, status }, 'Talabat webhook ingest failed');
        return res.status(status).json({ ok: false, error: code });
    }
};
