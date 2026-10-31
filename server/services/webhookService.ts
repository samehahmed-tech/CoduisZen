/**
 * Webhook Service — Plugin/Extension System
 * 
 * Dispatches events to registered webhook endpoints with:
 * - HMAC-SHA256 payload signing
 * - Retry with exponential backoff
 * - Delivery logging for debugging
 * - Branch-scoped filtering
 */

import crypto from 'crypto';
import { db } from '../db';
import { webhookEndpoints, webhookDeliveries } from '../../src/db/schema';
import { eq, and, sql, isNull, lt, or } from 'drizzle-orm';
import logger from '../utils/logger';
import { assertSafeWebhookTarget, validateWebhookTargetUrl } from '../utils/webhookTarget';
import { isWebhookBranchMatch } from '../utils/webhookScope';
import { sanitizeWebhookDelivery } from '../utils/webhookDeliveryPrivacy';
import { buildIntegrationIdempotencyKey, classifyIntegrationHttpStatus, computeIntegrationBackoffMs, shouldRetryIntegrationFailure } from '../utils/integrationRuntimePolicy';
import { sanitizePublicWebhookPayload } from '../utils/publicWebhookPrivacy';

const log = logger.child({ service: 'webhook' });

const MAX_RETRIES = 3;

const signPayload = (payload: string, secret: string): string => {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

export type WebhookEvent =
    | 'order.created'
    | 'order.status_changed'
    | 'order.completed'
    | 'order.cancelled'
    | 'order.refunded'
    | 'inventory.low_stock'
    | 'inventory.stock_updated'
    | 'inventory.batch_expired'
    | 'shift.opened'
    | 'shift.closed'
    | 'day.closed'
    | 'driver.assigned'
    | 'driver.location_updated'
    | 'payment.received'
    | 'customer.created'
    | 'customer.updated'
    | 'fiscal.submitted'
    | 'fiscal.failed'
    | 'approval.requested'
    | 'approval.resolved';

export const webhookService = {
    /**
     * Dispatch an event to all matching webhook endpoints
     */
    async dispatch(event: WebhookEvent, payload: any, branchId?: string) {
        try {
            // Find all active endpoints subscribed to this event
            const endpoints = await db.select()
                .from(webhookEndpoints)
                .where(
                    and(
                        eq(webhookEndpoints.isActive, true),
                        sql`charindex(${event}, cast(${webhookEndpoints.events} as nvarchar(max))) > 0`
                    )
                );

            // Filter by branch if specified
            const matching = endpoints.filter(ep => isWebhookBranchMatch(ep.branchId, branchId));

            if (matching.length === 0) return;

            // Fire-and-forget delivery to each endpoint
            for (const endpoint of matching) {
                this.deliverToEndpoint(endpoint, event, payload).catch(err => {
                    log.error({ endpointId: endpoint.id, event, err: err.message }, 'Webhook delivery failed');
                });
            }
        } catch (err: any) {
            log.error({ event, err: err.message }, 'Webhook dispatch error');
        }
    },

    /**
     * Deliver a webhook to a specific endpoint with retry
     */
    async deliverToEndpoint(
        endpoint: typeof webhookEndpoints.$inferSelect,
        event: WebhookEvent,
        payload: any
    ) {
        const safeUrl = await assertSafeWebhookTarget(endpoint.url);
        const startedAt = Date.now();
        const body = JSON.stringify({
            event,
            timestamp: new Date().toISOString(),
            data: String(endpoint.createdBy || '').startsWith('public-api:')
                ? sanitizePublicWebhookPayload(payload)
                : payload,
        });

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Webhook-Event': event,
            'X-Webhook-Id': endpoint.id,
            'Idempotency-Key': buildIntegrationIdempotencyKey('webhook', endpoint.id, event, payload),
            ...(endpoint.headers as Record<string, string> || {}),
        };

        // Sign the payload if secret is configured
        if (endpoint.secret) {
            headers['X-Webhook-Signature'] = `sha256=${signPayload(body, endpoint.secret)}`;
        }

        const maxRetries = endpoint.retryCount || MAX_RETRIES;
        const timeoutMs = endpoint.timeoutMs || 10000;

        let lastError: string | undefined;
        let httpStatus: number | undefined;
        let responseBody: string | undefined;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);

                const res = await fetch(safeUrl, {
                    method: 'POST',
                    headers,
                    body,
                    signal: controller.signal,
                });

                clearTimeout(timer);
                httpStatus = res.status;
                responseBody = await res.text().catch(() => '');

                if (res.ok) {
                    // Log successful delivery
                    await db.insert(webhookDeliveries).values({
                        endpointId: endpoint.id,
                        event,
                        payload,
                        status: 'SUCCESS',
                        httpStatus,
                        responseBody: responseBody?.substring(0, 2000),
                        attempt,
                        durationMs: Date.now() - startedAt,
                        nextRetryAt: null,
                        deliveredAt: new Date(),
                    });
                    return true;
                }

                lastError = `HTTP ${httpStatus}: ${responseBody?.substring(0, 500)}`;

                if (!shouldRetryIntegrationFailure(classifyIntegrationHttpStatus(httpStatus))) {
                    break;
                }
            } catch (err: any) {
                lastError = err.message;
            }

            // Exponential backoff between retries
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, computeIntegrationBackoffMs(attempt)));
            }
        }

        // Log failed delivery
        await db.insert(webhookDeliveries).values({
            endpointId: endpoint.id,
            event,
            payload,
            status: 'FAILED',
            httpStatus,
            responseBody: responseBody?.substring(0, 2000),
            attempt: maxRetries,
            durationMs: Date.now() - startedAt,
            nextRetryAt: null,
            lastError: lastError?.substring(0, 2000),
        });
        return false;
    },

    /**
     * Get delivery history for an endpoint
     */
    async getDeliveries(endpointId: string, limit = 50) {
        const deliveries = await db.select()
            .from(webhookDeliveries)
            .where(eq(webhookDeliveries.endpointId, endpointId))
            .orderBy(sql`${webhookDeliveries.createdAt} DESC`)
            .offset(0).fetch(limit);
        // Retry processing still uses the raw DB row internally; delivery
        // history exposed to operators must not reveal customer credentials,
        // contact data, or gateway response fields.
        return deliveries.map(sanitizeWebhookDelivery);
    },

    /**
     * CRUD for webhook endpoints
     */
    async createEndpoint(data: typeof webhookEndpoints.$inferInsert) {
        validateWebhookTargetUrl(String(data.url));
        const [endpoint] = await db.insert(webhookEndpoints).output().values(data);
        return endpoint;
    },

    async updateEndpoint(id: string, data: Partial<typeof webhookEndpoints.$inferInsert>) {
        if (data.url !== undefined) validateWebhookTargetUrl(String(data.url));
        const [endpoint] = await db.update(webhookEndpoints)
            .set({ ...data, updatedAt: new Date() })
            .output()
            .where(eq(webhookEndpoints.id, id));
        return endpoint;
    },

    async getEndpoint(id: string) {
        const [endpoint] = await db.select().from(webhookEndpoints)
            .where(eq(webhookEndpoints.id, id)).top(1);
        return endpoint || null;
    },

    async deleteEndpoint(id: string) {
        await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
    },

    async getEndpoints(branchId?: string) {
        return db.select().from(webhookEndpoints)
            .where(branchId ? eq(webhookEndpoints.branchId, branchId) : undefined)
            .orderBy(sql`${webhookEndpoints.createdAt} DESC`);
    },

    /**
     * Retry failed webhook deliveries (Item 45 — Webhook Reliability)
     * Ops can trigger this to re-dispatch any FAILED deliveries.
     */
    async retryFailed(limit = 50) {
        const now = new Date();
        const claimLeaseUntil = new Date(Date.now() + 5 * 60 * 1000);

        // A crashed worker must not leave a delivery permanently claimed.
        await db.update(webhookDeliveries)
            .set({ status: 'FAILED', nextRetryAt: null })
            .where(and(
                eq(webhookDeliveries.status, 'RETRYING'),
                or(isNull(webhookDeliveries.nextRetryAt), lt(webhookDeliveries.nextRetryAt, now)),
            ));

        const failed = await db.select()
            .from(webhookDeliveries)
            .where(and(
                eq(webhookDeliveries.status, 'FAILED'),
                or(isNull(webhookDeliveries.nextRetryAt), lt(webhookDeliveries.nextRetryAt, now)),
            ))
            .orderBy(sql`${webhookDeliveries.createdAt} ASC`)
            .offset(0).fetch(limit);

        if (failed.length === 0) return { retried: 0 };

        let retried = 0;
        for (const delivery of failed) {
            try {
                const [claimed] = await db.update(webhookDeliveries)
                    .set({ status: 'RETRYING', nextRetryAt: claimLeaseUntil })
                    .output()
                    .where(and(
                        eq(webhookDeliveries.id, delivery.id),
                        eq(webhookDeliveries.status, 'FAILED'),
                        or(isNull(webhookDeliveries.nextRetryAt), lt(webhookDeliveries.nextRetryAt, now)),
                    ));
                if (!claimed) continue;

                const [endpoint] = await db.select()
                    .top(1)
                    .from(webhookEndpoints)
                    .where(eq(webhookEndpoints.id, delivery.endpointId));

                // Re-dispatch (this will create a new delivery record)
                if (!endpoint || !endpoint.isActive) {
                    await db.update(webhookDeliveries)
                        .set({ status: 'FAILED', nextRetryAt: null, lastError: 'WEBHOOK_ENDPOINT_UNAVAILABLE' })
                        .where(eq(webhookDeliveries.id, delivery.id));
                    continue;
                }

                const delivered = await this.deliverToEndpoint(endpoint, delivery.event as WebhookEvent, delivery.payload);

                // Mark original as retried so it's not picked up again
                await db.update(webhookDeliveries)
                    .set({ status: delivered ? 'RETRIED' : 'FAILED', nextRetryAt: null })
                    .where(eq(webhookDeliveries.id, delivery.id));

                if (delivered) retried++;
            } catch (err: any) {
                await db.update(webhookDeliveries)
                    .set({ status: 'FAILED', nextRetryAt: null, lastError: String(err?.message || err).substring(0, 2000) })
                    .where(eq(webhookDeliveries.id, delivery.id));
                log.error({ deliveryId: delivery.id, err: err.message }, 'Webhook retry failed');
            }
        }

        return { retried, total: failed.length };
    },
};

export default webhookService;
