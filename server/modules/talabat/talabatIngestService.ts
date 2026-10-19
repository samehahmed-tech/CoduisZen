export { resolveTalabatBranch, buildTalabatOrderRow } from './talabatIngestPure';

import { and, eq, gt, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
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
import { getTalabatConfigRaw } from './talabatConfig';
import {
    buildTalabatIdempotencyKey,
    mapTalabatStatus,
    normalizeTalabatItems,
    TALABAT_IDEMPOTENCY_SCOPE,
    validateTalabatPayload,
} from './talabatMapper';
import { buildTalabatOrderRow, resolveTalabatBranch } from './talabatIngestPure';
import { allocateDailyOrderNumber } from '../../services/orderNumberService';
import { inventoryService } from '../../services/inventoryService';
import { kdsController } from '../../controllers/kdsController';
import { emitBranchEvent } from '../../utils/socketEmit';
import { webhookService } from '../../services/webhookService';
import logger from '../../utils/logger';

const log = logger.child({ service: 'talabat-ingest' });
const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — outlives retry + DLQ replay

const ensureTalabatInboundEndpoint = async () => {
    try {
        const [existing] = await db.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(eq(webhookEndpoints.id, 'talabat-inbound'));
        if (!existing) {
            await db.insert(webhookEndpoints).values({
                id: 'talabat-inbound',
                name: 'Talabat inbound log',
                url: 'internal://talabat-inbound',
                events: 'talabat.inbound',
                isActive: false,
                createdBy: 'system',
            } as any);
        }
    } catch { /* best effort */ }
};

const logInbound = async (payload: any, status: string, orderId?: string, error?: string) => {
    try {
        await ensureTalabatInboundEndpoint();
        await db.insert(webhookDeliveries).values({
            endpointId: 'talabat-inbound',
            event: 'talabat.inbound',
            payload: { status, orderId: orderId || (payload as any)?.order_id, payload },
            status: error ? 'FAILED' : 'SUCCESS',
            httpStatus: error ? 400 : 200,
            lastError: error?.substring(0, 2000),
            attempt: 1,
            deliveredAt: new Date(),
        } as any);
    } catch { /* never blocks webhook */ }
};

export const ingestTalabatWebhook = async (payload: any): Promise<{ orderId: string; created: boolean; internalStatus: string | null }> => {
    const validation = validateTalabatPayload(payload);
    if (!validation.ok) {
        const code = (validation as any).code || 'INVALID_PAYLOAD';
        await logInbound(payload, String((payload as any)?.status || ''), undefined, code);
        const err: any = new Error(code);
        err.status = 400;
        err.code = code;
        throw err;
    }
    const orderId = String(payload.order_id).trim();
    const talabatStatus = String(payload.status).trim().toUpperCase();
    const internalStatus = mapTalabatStatus(talabatStatus);
    const config = await getTalabatConfigRaw();
    if (config.enabled === false) {
        // Disabled integrations must still ack (avoid Talabat retries) but do nothing.
        await logInbound(payload, talabatStatus, orderId, 'TALABAT_DISABLED');
        const err: any = new Error('TALABAT_DISABLED');
        err.status = 503;
        err.code = 'TALABAT_DISABLED';
        throw err;
    }
    const branchId = resolveTalabatBranch(payload, config);
    if (!branchId) {
        await logInbound(payload, talabatStatus, orderId, 'STORE_BRANCH_UNMAPPED');
        const err: any = new Error('STORE_BRANCH_UNMAPPED');
        err.status = 400;
        err.code = 'STORE_BRANCH_UNMAPPED';
        throw err;
    }
    const [branch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId));
    if (!branch) {
        await logInbound(payload, talabatStatus, orderId, 'INVALID_BRANCH_REFERENCE');
        const err: any = new Error('INVALID_BRANCH_REFERENCE');
        err.status = 400;
        err.code = 'INVALID_BRANCH_REFERENCE';
        throw err;
    }

    // Idempotency first: same order_id+status twice = same result, no double order.
    const idemKey = buildTalabatIdempotencyKey(orderId, talabatStatus);
    const [claim] = await db.select().from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.key, idemKey), eq(idempotencyKeys.scope, TALABAT_IDEMPOTENCY_SCOPE), gt(idempotencyKeys.expiresAt, new Date())));
    if (claim?.resourceId) {
        return { orderId: claim.resourceId, created: false, internalStatus };
    }

    // UPDATE_CART carries no status change — ack only (PUT flow validates separately).
    if (talabatStatus === 'UPDATE_CART') {
        await logInbound(payload, talabatStatus, orderId);
        return { orderId, created: false, internalStatus: null };
    }

    // CANCELLED after creation flips the existing order; no order yet → ack.
    if (talabatStatus === 'CANCELLED') {
        const [existing] = await db.select({ id: orders.id }).from(orders)
            .where(and(eq(orders.platformOrderId, orderId), eq(orders.deliverySource, 'talabat')));
        if (existing) {
            const { transitionOrderStatus } = await import('../../services/orderLifecycleService');
            try {
                await transitionOrderStatus({
                    orderId: existing.id,
                    nextStatus: 'CANCELLED',
                    notes: `Talabat cancel: ${String(payload?.cancellation?.reason || 'customer')}`,
                    changedBy: 'talabat-webhook',
                    skipPolicy: true,
                });
            } catch (e: any) {
                log.warn({ orderId: existing.id, err: e?.message }, 'Talabat cancel transition failed');
            }
            await db.insert(idempotencyKeys).values({
                key: idemKey, scope: TALABAT_IDEMPOTENCY_SCOPE, requestHash: orderId,
                resourceId: existing.id, status: 'COMPLETED', expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS), updatedAt: new Date(),
            }).catch(() => undefined);
            await logInbound(payload, talabatStatus, existing.id);
            return { orderId: existing.id, created: false, internalStatus: 'CANCELLED' };
        }
        await logInbound(payload, talabatStatus, orderId);
        return { orderId, created: false, internalStatus: 'CANCELLED' };
    }

    // RECEIVED / READY_FOR_PICKUP / DISPATCHED → ensure one internal order.
    // Aggregator double-entry guard (same as POS createOrder).
    const [dup] = await db.select({ id: orders.id }).from(orders).where(and(
        eq(orders.deliverySource, 'talabat'),
        eq(orders.platformOrderId, orderId),
        sql`${orders.status} NOT IN ('CANCELLED', 'REFUNDED')`,
    ));
    if (dup) {
        await db.insert(idempotencyKeys).values({
            key: idemKey, scope: TALABAT_IDEMPOTENCY_SCOPE, requestHash: orderId,
            resourceId: dup.id, status: 'COMPLETED', expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS), updatedAt: new Date(),
        }).catch(() => undefined);
        return { orderId: dup.id, created: false, internalStatus };
    }

    const row = buildTalabatOrderRow(payload, branchId);
    const normalizedItems = normalizeTalabatItems(payload.items);
    const skus = Array.from(new Set(normalizedItems.map((i) => i.sku)));
    const menuBySku = new Map<string, any>();
    if (skus.length > 0) {
        try {
            const found = await db.select({ id: menuItems.id, name: menuItems.name, nameAr: menuItems.nameAr, price: menuItems.price, sku: menuItems.sku })
                .from(menuItems).where(sql`${menuItems.sku} IN (${sql.join(skus.map((s) => sql`${s}`), sql`, `)})`);
            for (const m of found as any[]) menuBySku.set(String((m as any).sku || '').trim(), m);
        } catch (e: any) {
            log.warn({ err: e?.message }, 'Talabat SKU lookup failed, using payload prices');
        }
    }

    const [activeShift] = await db.select({ id: shifts.id }).from(shifts)
        .where(and(eq(shifts.branchId, branchId), eq(shifts.status, 'OPEN')));
    const [branchRow] = await db.select({ businessDate: branches.businessDate }).from(branches).where(eq(branches.id, branchId));
    const now = new Date();
    const businessDate = branchRow?.businessDate || now.toISOString().split('T')[0];

    const createdId = await db.transaction(async (tx) => {
        const dailyOrderNumber = await allocateDailyOrderNumber(tx as any, branchId, businessDate);
        const [created] = await tx.insert(orders).output().values({
            id: `TB-${orderId.slice(0, 8)}-${nanoid(6)}`,
            type: row.type,
            source: 'talabat',
            deliverySource: 'talabat',
            branchId,
            platformOrderId: orderId,
            customerName: row.customerName,
            customerPhone: row.customerPhone,
            deliveryAddress: row.deliveryAddress,
            deliveryLat: row.deliveryLat,
            deliveryLng: row.deliveryLng,
            deliveryNotes: row.deliveryNotes,
            status: internalStatus === 'READY' ? 'PREPARING' : (internalStatus || 'PENDING'),
            subtotal: row.subtotal,
            tax: 0,
            deliveryFee: row.deliveryFee,
            total: row.total,
            paymentMethod: 'TALABAT',
            isPaid: false,
            notes: row.notes,
            shiftId: activeShift?.id || null,
            businessDate,
            orderNumber: dailyOrderNumber,
            createdAt: now,
            updatedAt: now,
        } as any);
        for (const item of normalizedItems) {
            const menu = menuBySku.get(item.sku);
            const unitPrice = Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) > 0
                ? Number(item.unitPrice)
                : (Number.isFinite(Number(item.totalPrice)) && Number(item.quantity) > 0 ? Number(item.totalPrice) / Number(item.quantity) : Number(menu?.price || 0));
            await tx.insert(orderItems).values({
                orderId: (created as any).id,
                menuItemId: menu?.id || null,
                name: menu?.name || item.sku,
                nameAr: menu?.nameAr || menu?.name || item.sku,
                price: unitPrice,
                basePrice: Number(menu?.price || unitPrice),
                platformMarkup: Math.max(0, Number((unitPrice - Number(menu?.price || unitPrice)).toFixed(2))),
                priceSource: 'PLATFORM:TALABAT',
                quantity: item.status === 'NOT_FOUND' ? 0 : item.quantity,
                notes: item.status !== 'IN_CART' ? `Talabat:${item.status}` : undefined,
                modifiers: [],
            } as any);
        }
        await tx.insert(orderStatusHistory).values({ orderId: (created as any).id, status: (created as any).status, changedBy: 'talabat-webhook', createdAt: now } as any);
        return (created as any).id as string;
    });

    // Best-effort side effects — never block the 200 ack.
    try {
        const lines = await db.select({ menuItemId: orderItems.menuItemId, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, createdId));
        const whs = await db.select({ id: (await import('../../../src/db/schema')).warehouses.id }).from((await import('../../../src/db/schema')).warehouses)
            .where(eq((await import('../../../src/db/schema')).warehouses.branchId, branchId));
        const wid = (whs as any[])[0]?.id;
        if (wid) {
            for (const l of lines) {
                if (!l.menuItemId || !(Number(l.quantity) > 0)) continue;
                inventoryService.deductIngredients(db as any, String(l.menuItemId), Number(l.quantity), wid, createdId, 'talabat-webhook', {} as any).catch(() => undefined);
            }
        }
    } catch { /* warn-only */ }
    kdsController.dispatchToKitchen(branchId, createdId, { enqueuePrintJobs: true }).catch(() => undefined);
    emitBranchEvent(branchId, 'order:created', { id: createdId, source: 'talabat', platformOrderId: orderId });
    webhookService.dispatch('order.created', { id: createdId, source: 'talabat', platformOrderId: orderId, branchId }, branchId).catch(() => {});

    await db.insert(idempotencyKeys).values({
        key: idemKey, scope: TALABAT_IDEMPOTENCY_SCOPE, requestHash: orderId,
        resourceId: createdId, status: 'COMPLETED', expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS), updatedAt: new Date(),
    }).catch(() => undefined);
    await logInbound(payload, talabatStatus, createdId);
    return { orderId: createdId, created: true, internalStatus };
};
