/**
 * Webhook Controller — CRUD + Delivery History
 * 
 * Endpoints:
 *   GET    /api/webhooks           — List all endpoints
 *   POST   /api/webhooks           — Create endpoint
 *   PUT    /api/webhooks/:id       — Update endpoint
 *   DELETE /api/webhooks/:id       — Delete endpoint
 *   GET    /api/webhooks/:id/deliveries — Delivery history
 */

import { Request, Response } from 'express';
import { webhookService } from '../services/webhookService';
import { randomUUID } from 'crypto';
import logger from '../utils/logger';
import { getStringParam } from '../utils/request';
import { createSignedAuditLog } from '../services/auditService';

const log = logger.child({ controller: 'webhook' });

const webhookErrorStatus = (error: any) =>
    String(error?.message || '').startsWith('WEBHOOK_URL_') || String(error?.message || '').startsWith('WEBHOOK_PRIVATE_')
        ? 400
        : 500;

const safeEndpoint = (endpoint: any) => ({
    id: endpoint.id,
    name: endpoint.name,
    url: endpoint.url,
    events: endpoint.events,
    branchId: endpoint.branchId || null,
    isActive: endpoint.isActive !== false,
    retryCount: endpoint.retryCount,
    timeoutMs: endpoint.timeoutMs,
    createdBy: endpoint.createdBy || null,
    secretConfigured: Boolean(endpoint.secret),
    headerKeys: endpoint.headers && typeof endpoint.headers === 'object' ? Object.keys(endpoint.headers).sort() : [],
});

const auditWebhookMutation = (req: Request, eventType: string, payload: Record<string, unknown>, branchId?: string | null, after?: Record<string, unknown>) => createSignedAuditLog({
    eventType,
    branchId: branchId || null,
    userId: req.user?.id || null,
    userName: req.user?.name || null,
    userRole: req.user?.role || null,
    payload,
    after,
});

const canAccessWebhookBranch = (req: Request, branchId?: string | null) => {
    if (req.user?.role === 'SUPER_ADMIN') return true;
    return Boolean(branchId && req.effectiveBranchId && branchId === req.effectiveBranchId);
};

export const getWebhooks = async (req: Request, res: Response) => {
    try {
        const endpoints = await webhookService.getEndpoints(req.user?.role === 'SUPER_ADMIN' ? undefined : req.effectiveBranchId);
        // Mask secrets in response
        res.json(endpoints.map(safeEndpoint));
    } catch (error: any) {
        log.error({ err: error.message }, 'Failed to list webhooks');
        res.status(500).json({ error: error.message || 'FAILED_TO_LIST_WEBHOOKS' });
    }
};

export const createWebhook = async (req: Request, res: Response) => {
    try {
        const { name, url, events, branchId, headers, retryCount, timeoutMs, secret } = req.body;
        if (!name || !url) {
            return res.status(400).json({ error: 'NAME_AND_URL_REQUIRED' });
        }
        if (!Array.isArray(events) || events.length === 0) {
            return res.status(400).json({ error: 'EVENTS_REQUIRED' });
        }

        const endpoint = await webhookService.createEndpoint({
            id: randomUUID(),
            name,
            url,
            events,
            secret: secret || null,
            branchId: req.user?.role === 'SUPER_ADMIN' ? (branchId || null) : req.effectiveBranchId,
            headers: headers || {},
            retryCount: retryCount || 3,
            timeoutMs: timeoutMs || 10000,
            createdBy: req.user?.id || 'system',
        });

        await auditWebhookMutation(req, 'WEBHOOK_ENDPOINT_CREATED', {
            endpointId: endpoint.id,
            eventCount: events.length,
            secretConfigured: Boolean(secret),
        }, endpoint.branchId, { active: endpoint.isActive !== false });
        log.info({ endpointId: endpoint.id, name, events }, 'Webhook endpoint created');
        res.status(201).json(safeEndpoint(endpoint));
    } catch (error: any) {
        log.error({ err: error.message }, 'Failed to create webhook');
        res.status(webhookErrorStatus(error)).json({ error: error.message || 'FAILED_TO_CREATE_WEBHOOK' });
    }
};

export const updateWebhook = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID_REQUIRED' });

        const current = await webhookService.getEndpoint(id);
        if (!current) return res.status(404).json({ error: 'WEBHOOK_NOT_FOUND' });
        if (!canAccessWebhookBranch(req, current.branchId)) return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });

        const { name, url, events, branchId, headers, retryCount, timeoutMs, secret, isActive } = req.body;
        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (url !== undefined) updates.url = url;
        if (events !== undefined) updates.events = events;
        if (branchId !== undefined) updates.branchId = req.user?.role === 'SUPER_ADMIN' ? (branchId || null) : req.effectiveBranchId;
        if (headers !== undefined) updates.headers = headers;
        if (retryCount !== undefined) updates.retryCount = retryCount;
        if (timeoutMs !== undefined) updates.timeoutMs = timeoutMs;
        if (secret !== undefined) updates.secret = secret;
        if (isActive !== undefined) updates.isActive = isActive;

        const endpoint = await webhookService.updateEndpoint(id, updates);
        if (!endpoint) return res.status(404).json({ error: 'WEBHOOK_NOT_FOUND' });

        await auditWebhookMutation(req, 'WEBHOOK_ENDPOINT_UPDATED', {
            endpointId: id,
            changedKeys: Object.keys(updates).filter((key) => key !== 'secret' && key !== 'headers').sort(),
            secretChanged: secret !== undefined,
            headersChanged: headers !== undefined,
        }, endpoint.branchId, { active: endpoint.isActive !== false });
        log.info({ endpointId: id }, 'Webhook endpoint updated');
        res.json(safeEndpoint(endpoint));
    } catch (error: any) {
        log.error({ err: error.message }, 'Failed to update webhook');
        res.status(webhookErrorStatus(error)).json({ error: error.message || 'FAILED_TO_UPDATE_WEBHOOK' });
    }
};

export const deleteWebhook = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID_REQUIRED' });

        const current = await webhookService.getEndpoint(id);
        if (!current) return res.status(404).json({ error: 'WEBHOOK_NOT_FOUND' });
        if (!canAccessWebhookBranch(req, current.branchId)) return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });

        await webhookService.deleteEndpoint(id);
        await auditWebhookMutation(req, 'WEBHOOK_ENDPOINT_DELETED', { endpointId: id }, current.branchId, { deleted: true });
        log.info({ endpointId: id }, 'Webhook endpoint deleted');
        res.json({ success: true });
    } catch (error: any) {
        log.error({ err: error.message }, 'Failed to delete webhook');
        res.status(500).json({ error: error.message || 'FAILED_TO_DELETE_WEBHOOK' });
    }
};

export const getWebhookDeliveries = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID_REQUIRED' });

        const current = await webhookService.getEndpoint(id);
        if (!current) return res.status(404).json({ error: 'WEBHOOK_NOT_FOUND' });
        if (!canAccessWebhookBranch(req, current.branchId)) return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });

        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const deliveries = await webhookService.getDeliveries(id, limit);
        res.json(deliveries);
    } catch (error: any) {
        log.error({ err: error.message }, 'Failed to get webhook deliveries');
        res.status(500).json({ error: error.message || 'FAILED_TO_GET_DELIVERIES' });
    }
};
