/**
 * Generic aggregator ingest: branch resolve → dup guard → create order+items →
 * KDS + socket → idempotency. Notify-only (no PUT-back; most aggregators
 * manage fulfilment on their own app).
 */
import { and, eq, gt, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../../db';
import {
    branches,
    idempotencyKeys,
    menuItems,
    orderItems,
    orders,
    orderStatusHistory,
    shifts,
    webhookDeliveries,
    webhookEndpoints,
} from '../../../src/db/schema';
import {
    AGGREGATOR_IDEMPOTENCY_SCOPE,
    NormalizedOrder,
    buildAggregatorIdempotencyKey,
    buildAggregatorPayloadFingerprint,
    mapProviderStatus,
    resolveAggregatorBranch,
} from './aggregatorTypes';
import { getAggregatorsConfigRaw } from './aggregatorConfig';
import { allocateDailyOrderNumber } from '../../services/orderNumberService';
import { inventoryService } from '../../services/inventoryService';
import { kdsController } from '../../controllers/kdsController';
import { emitBranchEvent } from '../../utils/socketEmit';
import { webhookService } from '../../services/webhookService';
import logger from '../../utils/logger';

const log = logger.child({ service: 'aggregator-ingest' });
const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ensureInboundEndpoint = async () => {
    try {
        const [existing] = await db.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(eq(webhookEndpoints.id, 'aggregator-inbound'));
        if (!existing) {
            await db.insert(webhookEndpoints).values({
                id: 'aggregator-inbound',
                name: 'Aggregators inbound log',
                url: 'internal://aggregator-inbound',
                events: 'aggregator.inbound',
                isActive: false,
                createdBy: 'system',
            } as any);
        }
    } catch { /* best effort */ }
};

const logInbound = async (providerId: string, payload: any, status: string, orderId?: string, error?: string, branchId?: string | null) => {
    try {
        await ensureInboundEndpoint();
        await db.insert(webhookDeliveries).values({
            endpointId: 'aggregator-inbound',
            event: 'aggregator.inbound',
            payload: { provider: providerId, status, orderId, branchId: branchId || null, payload },
            status: error ? 'FAILED' : 'SUCCESS',
            httpStatus: error ? 400 : 200,
            lastError: error?.substring(0, 2000),
            attempt: 1,
            deliveredAt: new Date(),
        } as any);
    } catch { /* never blocks webhook */ }
};

export const ingestAggregatorOrder = async (
    providerId: string,
    normalized: NormalizedOrder,
    rawPayload: any,
): Promise<{ orderId: string; created: boolean; internalStatus: string | null; branchId?: string | null }> => {
    const provider = String(providerId || '').trim().toLowerCase();
    const internalStatus = mapProviderStatus(provider, normalized.rawStatus);
    const configs = await getAggregatorsConfigRaw();
    const config = configs[provider];
    if (!config?.enabled) {
        await logInbound(provider, rawPayload, normalized.rawStatus, normalized.externalId, `${provider.toUpperCase()}_DISABLED`);
        const err: any = new Error(`${provider.toUpperCase()}_DISABLED`);
        err.status = 503;
        err.code = err.message;
        throw err;
    }
    const branchId = resolveAggregatorBranch(config, normalized.storeId);
    if (!branchId) {
        await logInbound(provider, rawPayload, normalized.rawStatus, normalized.externalId, 'STORE_BRANCH_UNMAPPED');
        const err: any = new Error('STORE_BRANCH_UNMAPPED');
        err.status = 400;
        err.code = err.message;
        throw err;
    }
    if (Array.isArray(config.branchIds) && config.branchIds.length > 0 && !config.branchIds.includes(branchId)) {
        await logInbound(provider, rawPayload, normalized.rawStatus, normalized.externalId, 'BRANCH_NOT_ENABLED', branchId);
        const err: any = new Error('BRANCH_NOT_ENABLED');
        err.status = 403;
        err.code = err.message;
        throw err;
    }
    const [branch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId));
    if (!branch) {
        await logInbound(provider, rawPayload, normalized.rawStatus, normalized.externalId, 'INVALID_BRANCH_REFERENCE', branchId);
        const err: any = new Error('INVALID_BRANCH_REFERENCE');
        err.status = 400;
        err.code = err.message;
        throw err;
    }

    const idemKey = buildAggregatorIdempotencyKey(provider, normalized.externalId, normalized.rawStatus);
    const payloadFingerprint = buildAggregatorPayloadFingerprint(provider, normalized);
    const [claim] = await db.select().from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.key, idemKey), eq(idempotencyKeys.scope, AGGREGATOR_IDEMPOTENCY_SCOPE), gt(idempotencyKeys.expiresAt, new Date())));
    if (internalStatus === null) {
        await logInbound(provider, rawPayload, normalized.rawStatus, normalized.externalId);
        return { orderId: normalized.externalId, created: false, internalStatus: null, branchId };
    }

    const claimRequestHash = String(claim?.requestHash || '');
    if (claim && claimRequestHash && claimRequestHash !== payloadFingerprint && claimRequestHash !== normalized.externalId) {
        await logInbound(provider, rawPayload, normalized.rawStatus, claim.resourceId || normalized.externalId, 'AGGREGATOR_ORDER_PAYLOAD_CONFLICT', branchId);
        const err: any = new Error('AGGREGATOR_ORDER_PAYLOAD_CONFLICT');
        err.status = 409;
        err.code = err.message;
        throw err;
    }
    if (claim?.resourceId) return { orderId: claim.resourceId, created: false, internalStatus, branchId };
    if (claim) {
        const err: any = new Error('AGGREGATOR_ORDER_IN_PROGRESS');
        err.status = 409;
        err.code = err.message;
        throw err;
    }

    // Claim before any order-side effects. The unique (key, scope) index makes
    // concurrent deliveries deterministic: exactly one request proceeds, and
    // the loser receives an explicit retryable conflict instead of creating a
    // second order.
    try {
        await db.insert(idempotencyKeys).values({
            key: idemKey,
            scope: AGGREGATOR_IDEMPOTENCY_SCOPE,
            requestHash: payloadFingerprint,
            status: 'IN_PROGRESS',
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
            updatedAt: new Date(),
        });
    } catch {
        const [concurrentClaim] = await db.select().from(idempotencyKeys)
            .where(and(eq(idempotencyKeys.key, idemKey), eq(idempotencyKeys.scope, AGGREGATOR_IDEMPOTENCY_SCOPE)));
        if (concurrentClaim?.resourceId) return { orderId: concurrentClaim.resourceId, created: false, internalStatus, branchId };
        const err: any = new Error('AGGREGATOR_ORDER_IN_PROGRESS');
        err.status = 409;
        err.code = err.message;
        throw err;
    }

    if (internalStatus === 'CANCELLED') {
        const [existing] = await db.select({ id: orders.id }).from(orders)
            .where(and(eq(orders.platformOrderId, normalized.externalId), eq(orders.deliverySource, provider)));
        if (existing) {
            const { transitionOrderStatus } = await import('../../services/orderLifecycleService');
            try {
                await transitionOrderStatus({
                    orderId: existing.id, nextStatus: 'CANCELLED',
                    notes: `${provider} cancel`, changedBy: `${provider}-webhook`, skipPolicy: true,
                });
            } catch (e: any) {
                log.warn({ orderId: existing.id, err: e?.message }, 'Aggregator cancel transition failed');
            }
            await db.update(idempotencyKeys).set({
                resourceId: existing.id, status: 'COMPLETED', updatedAt: new Date(),
            }).where(and(eq(idempotencyKeys.key, idemKey), eq(idempotencyKeys.scope, AGGREGATOR_IDEMPOTENCY_SCOPE))).catch(() => undefined);
            await logInbound(provider, rawPayload, normalized.rawStatus, existing.id, undefined, branchId);
            return { orderId: existing.id, created: false, internalStatus: 'CANCELLED', branchId };
        }
        await db.update(idempotencyKeys).set({
            resourceId: normalized.externalId, status: 'COMPLETED', updatedAt: new Date(),
        }).where(and(eq(idempotencyKeys.key, idemKey), eq(idempotencyKeys.scope, AGGREGATOR_IDEMPOTENCY_SCOPE))).catch(() => undefined);
        await logInbound(provider, rawPayload, normalized.rawStatus, normalized.externalId);
        return { orderId: normalized.externalId, created: false, internalStatus: 'CANCELLED', branchId };
    }

    const [dup] = await db.select({ id: orders.id, branchId: orders.branchId, total: orders.total }).from(orders).where(and(
        eq(orders.deliverySource, provider),
        eq(orders.platformOrderId, normalized.externalId),
        sql`${orders.status} NOT IN ('CANCELLED', 'REFUNDED')`,
    ));
    if (dup) {
        const sameBranch = String(dup.branchId || '') === String(branchId || '');
        const sameTotal = Number(dup.total || 0) === Number(normalized.total || 0);
        if (!sameBranch || !sameTotal) {
            await logInbound(provider, rawPayload, normalized.rawStatus, dup.id, 'AGGREGATOR_ORDER_PAYLOAD_CONFLICT', branchId);
            await db.delete(idempotencyKeys).where(and(
                eq(idempotencyKeys.key, idemKey),
                eq(idempotencyKeys.scope, AGGREGATOR_IDEMPOTENCY_SCOPE),
                eq(idempotencyKeys.status, 'IN_PROGRESS'),
            )).catch(() => undefined);
            const err: any = new Error('AGGREGATOR_ORDER_PAYLOAD_CONFLICT');
            err.status = 409;
            err.code = err.message;
            throw err;
        }
        await db.update(idempotencyKeys).set({
            resourceId: dup.id, status: 'COMPLETED', updatedAt: new Date(),
        }).where(and(eq(idempotencyKeys.key, idemKey), eq(idempotencyKeys.scope, AGGREGATOR_IDEMPOTENCY_SCOPE))).catch(() => undefined);
        return { orderId: dup.id, created: false, internalStatus, branchId };
    }

    const skus = Array.from(new Set(normalized.items.map((i) => i.sku).filter(Boolean))) as string[];
    const menuBySku = new Map<string, any>();
    if (skus.length > 0) {
        try {
            const found = await db.select({ id: menuItems.id, name: menuItems.name, nameAr: menuItems.nameAr, price: menuItems.price, sku: menuItems.sku })
                .from(menuItems).where(sql`${menuItems.sku} IN (${sql.join(skus.map((s) => sql`${s}`), sql`, `)})`);
            for (const m of found as any[]) menuBySku.set(String((m as any).sku || '').trim(), m);
        } catch (e: any) {
            log.warn({ err: e?.message }, 'Aggregator SKU lookup failed, using payload prices');
        }
    }

    const [activeShift] = await db.select({ id: shifts.id }).from(shifts)
        .where(and(eq(shifts.branchId, branchId), eq(shifts.status, 'OPEN')));
    const [branchRow] = await db.select({ businessDate: branches.businessDate }).from(branches).where(eq(branches.id, branchId));
    const now = new Date();
    const businessDate = branchRow?.businessDate || now.toISOString().split('T')[0];

    let createdId: string;
    try {
        createdId = await db.transaction(async (tx) => {
        const dailyOrderNumber = await allocateDailyOrderNumber(tx as any, branchId, businessDate);
        const [created] = await tx.insert(orders).output().values({
            id: `${provider.slice(0, 2).toUpperCase()}-${normalized.externalId.slice(0, 8)}-${nanoid(6)}`,
            type: normalized.orderType,
            source: provider,
            deliverySource: provider,
            branchId,
            platformOrderId: normalized.externalId,
            customerName: normalized.customer.name,
            customerPhone: normalized.customer.phone,
            deliveryAddress: normalized.customer.address,
            deliveryNotes: normalized.customer.notes,
            status: internalStatus === 'READY' ? 'PREPARING' : (internalStatus || 'PENDING'),
            subtotal: normalized.subtotal,
            tax: 0,
            deliveryFee: normalized.deliveryFee,
            total: normalized.total,
            paymentMethod: provider.toUpperCase(),
            isPaid: false,
            notes: normalized.notes ? `${provider} ${normalized.notes}` : `${provider} order`,
            shiftId: activeShift?.id || null,
            businessDate,
            orderNumber: dailyOrderNumber,
            createdAt: now,
            updatedAt: now,
        } as any);
        for (const item of normalized.items) {
            const menu = item.sku ? menuBySku.get(item.sku) : undefined;
            const unitPrice = Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) > 0
                ? Number(item.unitPrice)
                : (Number.isFinite(Number(item.totalPrice)) && Number(item.quantity) > 0 ? Number(item.totalPrice) / Number(item.quantity) : Number(menu?.price || 0));
            await tx.insert(orderItems).values({
                orderId: (created as any).id,
                menuItemId: menu?.id || null,
                name: menu?.name || item.name || item.sku || 'Item',
                nameAr: menu?.nameAr || menu?.name || item.name || item.sku || 'صنف',
                price: unitPrice,
                basePrice: Number(menu?.price || unitPrice),
                platformMarkup: Math.max(0, Number((unitPrice - Number(menu?.price || unitPrice)).toFixed(2))),
                priceSource: `PLATFORM:${provider.toUpperCase()}`,
                quantity: item.quantity,
                modifiers: [],
            } as any);
        }
        await tx.insert(orderStatusHistory).values({ orderId: (created as any).id, status: (created as any).status, changedBy: `${provider}-webhook`, createdAt: now } as any);
        return (created as any).id as string;
        });
    } catch (error) {
        await db.delete(idempotencyKeys).where(and(
            eq(idempotencyKeys.key, idemKey),
            eq(idempotencyKeys.scope, AGGREGATOR_IDEMPOTENCY_SCOPE),
            eq(idempotencyKeys.status, 'IN_PROGRESS'),
        )).catch(() => undefined);
        throw error;
    }

    try {
        const schema = await import('../../../src/db/schema');
        const lines = await db.select({ menuItemId: orderItems.menuItemId, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, createdId));
        const whs = await db.select({ id: schema.warehouses.id }).from(schema.warehouses).where(eq(schema.warehouses.branchId, branchId));
        const wid = (whs as any[])[0]?.id;
        if (wid) {
            for (const l of lines) {
                if (!l.menuItemId || !(Number(l.quantity) > 0)) continue;
                inventoryService.deductIngredients(db as any, String(l.menuItemId), Number(l.quantity), wid, createdId, `${provider}-webhook`, {} as any).catch(() => undefined);
            }
        }
    } catch { /* warn-only */ }
    kdsController.dispatchToKitchen(branchId, createdId, { enqueuePrintJobs: true }).catch(() => undefined);
    emitBranchEvent(branchId, 'order:created', { id: createdId, source: provider, platformOrderId: normalized.externalId });
    webhookService.dispatch('order.created', { id: createdId, source: provider, platformOrderId: normalized.externalId, branchId }, branchId).catch(() => {});

    await db.update(idempotencyKeys).set({
        resourceId: createdId, status: 'COMPLETED', updatedAt: new Date(),
    }).where(and(eq(idempotencyKeys.key, idemKey), eq(idempotencyKeys.scope, AGGREGATOR_IDEMPOTENCY_SCOPE))).catch(() => undefined);
    await logInbound(provider, rawPayload, normalized.rawStatus, createdId, undefined, branchId);
    return { orderId: createdId, created: true, internalStatus, branchId };
};
