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

const log = logger.child({ controller: 'webhook' });

export const getWebhooks = async (req: Request, res: Response) => {
    try {
        const endpoints = await webhookService.getEndpoints();
        // Mask secrets in response
        res.json(endpoints.map(ep => ({
            ...ep,
            secret: ep.secret ? '••••••••' : null,
        })));
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
            branchId: branchId || null,
            headers: headers || {},
            retryCount: retryCount || 3,
            timeoutMs: timeoutMs || 10000,
            createdBy: req.user?.id || 'system',
        });

        log.info({ endpointId: endpoint.id, name, events }, 'Webhook endpoint created');
        res.status(201).json(endpoint);
    } catch (error: any) {
        log.error({ err: error.message }, 'Failed to create webhook');
        res.status(500).json({ error: error.message || 'FAILED_TO_CREATE_WEBHOOK' });
    }
};

export const updateWebhook = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID_REQUIRED' });

        const { name, url, events, branchId, headers, retryCount, timeoutMs, secret, isActive } = req.body;
        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (url !== undefined) updates.url = url;
        if (events !== undefined) updates.events = events;
        if (branchId !== undefined) updates.branchId = branchId;
        if (headers !== undefined) updates.headers = headers;
        if (retryCount !== undefined) updates.retryCount = retryCount;
        if (timeoutMs !== undefined) updates.timeoutMs = timeoutMs;
        if (secret !== undefined) updates.secret = secret;
        if (isActive !== undefined) updates.isActive = isActive;

        const endpoint = await webhookService.updateEndpoint(id, updates);
        if (!endpoint) return res.status(404).json({ error: 'WEBHOOK_NOT_FOUND' });

        log.info({ endpointId: id }, 'Webhook endpoint updated');
        res.json(endpoint);
    } catch (error: any) {
        log.error({ err: error.message }, 'Failed to update webhook');
        res.status(500).json({ error: error.message || 'FAILED_TO_UPDATE_WEBHOOK' });
    }
};

export const deleteWebhook = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID_REQUIRED' });

        await webhookService.deleteEndpoint(id);
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

        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const deliveries = await webhookService.getDeliveries(id, limit);
        res.json(deliveries);
    } catch (error: any) {
        log.error({ err: error.message }, 'Failed to get webhook deliveries');
        res.status(500).json({ error: error.message || 'FAILED_TO_GET_DELIVERIES' });
    }
};
