import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { webhookEndpoints } from '../../src/db/schema';
import { WebhookEvent, webhookService } from '../services/webhookService';
import { PUBLIC_WEBHOOK_EVENTS, validatePublicWebhookInput } from '../utils/publicWebhookPolicy';
import { createSignedAuditLog } from '../services/auditService';

const PUBLIC_WEBHOOK_OWNER_PREFIX = 'public-api:';
const PUBLIC_EVENTS: readonly WebhookEvent[] = PUBLIC_WEBHOOK_EVENTS;

const safeEndpoint = (endpoint: any) => ({
    id: endpoint.id,
    name: endpoint.name,
    url: endpoint.url,
    events: Array.isArray(endpoint.events) ? endpoint.events : [],
    branchId: endpoint.branchId || null,
    isActive: endpoint.isActive !== false,
    retryCount: endpoint.retryCount,
    timeoutMs: endpoint.timeoutMs,
    secretConfigured: Boolean(endpoint.secret),
    createdAt: endpoint.createdAt || null,
});

const clientId = (req: Request) => `${PUBLIC_WEBHOOK_OWNER_PREFIX}${req.publicApiClient?.id || ''}`;
const owned = (req: Request, id: string) => db.select().from(webhookEndpoints).where(and(
    eq(webhookEndpoints.id, id),
    eq(webhookEndpoints.createdBy, clientId(req)),
));

const errorStatus = (error: any) => {
    const code = String(error?.message || '');
    if (code.startsWith('WEBHOOK_URL_') || code.startsWith('WEBHOOK_PRIVATE_')) return 422;
    return Number(error?.statusCode) || 500;
};

const errorResponse = (res: Response, error: any) => {
    const status = errorStatus(error);
    return res.status(status).json({
        code: status === 500 ? 'PUBLIC_WEBHOOK_OPERATION_FAILED' : String(error?.message || 'PUBLIC_WEBHOOK_INVALID'),
        message: status === 500 ? 'Webhook operation failed.' : String(error?.message || 'Invalid webhook request.'),
    });
};

const audit = (req: Request, eventType: string, payload: Record<string, unknown>) => createSignedAuditLog({
    eventType,
    userId: `public-api:${req.publicApiClient?.id || 'unknown'}`,
    branchId: payload.branchId ? String(payload.branchId) : null,
    payload,
    reason: 'PUBLIC_API_WEBHOOK_MANAGEMENT',
    requestId: String(req.headers['x-request-id'] || `req-${Date.now()}`),
}).catch(() => undefined);

export const listPublicWebhooks = async (req: Request, res: Response) => {
    try {
        const endpoints = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.createdBy, clientId(req)));
        return res.json({ data: endpoints.map(safeEndpoint), events: PUBLIC_EVENTS });
    } catch (error) {
        return errorResponse(res, error);
    }
};

export const createPublicWebhook = async (req: Request, res: Response) => {
    try {
        const input = validatePublicWebhookInput(req.body, req.publicApiClient?.branchIds || []);
        const secret = `whsec_${crypto.randomBytes(32).toString('base64url')}`;
        const endpoint = await webhookService.createEndpoint({
            id: crypto.randomUUID(),
            name: input.name,
            url: input.url,
            events: input.events as WebhookEvent[],
            branchId: input.branchId,
            headers: {},
            retryCount: input.retryCount,
            timeoutMs: input.timeoutMs,
            secret,
            createdBy: clientId(req),
            isActive: true,
        });
        await audit(req, 'PUBLIC_WEBHOOK_CREATED', {
            endpointId: endpoint.id,
            branchId: endpoint.branchId || null,
            eventCount: input.events.length,
            secretConfigured: true,
        });
        return res.status(201).json({ ...safeEndpoint(endpoint), secret });
    } catch (error) {
        return errorResponse(res, error);
    }
};

export const deletePublicWebhook = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '').trim();
        const [endpoint] = await owned(req, id);
        if (!endpoint) return res.status(404).json({ code: 'PUBLIC_WEBHOOK_NOT_FOUND', message: 'Webhook was not found.' });
        await webhookService.deleteEndpoint(id);
        await audit(req, 'PUBLIC_WEBHOOK_DELETED', { endpointId: id, branchId: endpoint.branchId || null });
        return res.json({ success: true, id });
    } catch (error) {
        return errorResponse(res, error);
    }
};

export const listPublicWebhookDeliveries = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '').trim();
        const [endpoint] = await owned(req, id);
        if (!endpoint) return res.status(404).json({ code: 'PUBLIC_WEBHOOK_NOT_FOUND', message: 'Webhook was not found.' });
        const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit || 50))));
        return res.json(await webhookService.getDeliveries(id, limit));
    } catch (error) {
        return errorResponse(res, error);
    }
};
