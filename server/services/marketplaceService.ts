/**
 * Marketplace Integration Service
 * Implements: Phase 3.14 (Talabat, Elmenus, Hungerstation)
 * 
 * Maps incoming orders from external delivery platforms into Coduis Zen schema.
 */

import { createHash } from 'node:crypto';
import { db } from '../db';
import { deliveryPlatforms, orders, orderItems } from '../../src/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import logger from '../utils/logger';

let platformSchemaReady: Promise<void> | null = null;
const ensurePlatformSchema = () => {
    if (!platformSchemaReady) {
        platformSchemaReady = db.execute(sql`
            IF COL_LENGTH('delivery_platforms', 'api_key') IS NULL
                ALTER TABLE delivery_platforms ADD api_key nvarchar(500) NULL
        `).then(() => undefined).catch((error) => {
            platformSchemaReady = null;
            throw error;
        });
    }
    return platformSchemaReady;
};

const log = logger.child({ service: 'marketplace' });

export type MarketplaceProvider = 'TALABAT' | 'ELMENUS' | 'HUNGERSTATION' | 'OTLOOB';

export interface MarketplaceOrder {
    orderNumber: string;
    items: {
        id: string;
        name: string;
        price: number;
        quantity: number;
        modifiers?: any[];
    }[];
    total: number;
    customer: {
        name: string;
        phone: string;
        address: string;
    };
    notes?: string;
    provider: MarketplaceProvider;
    isPaid: boolean;
}

export const marketplaceService = {

    /**
     * Common interface to ingest a marketplace order.
     */
    async ingestOrder(branchId: string, orderData: MarketplaceOrder) {
        log.info({ branchId, provider: orderData.provider, extId: orderData.orderNumber }, 'Ingesting marketplace order');

        try {
            await ensurePlatformSchema();
            if (typeof orderData.isPaid !== 'boolean') {
                throw new Error('MARKETPLACE_PAYMENT_STATUS_REQUIRED');
            }
            const normalizedProvider = String(orderData.provider || '').trim().toUpperCase();
            const normalizedOrderNumber = String(orderData.orderNumber || '').trim();
            if (!branchId || !normalizedOrderNumber || !normalizedProvider) {
                throw new Error('MARKETPLACE_IDENTITY_REQUIRED');
            }
            // 1. Transactionally insert the order
            const orderId = `ext-${normalizedProvider.toLowerCase()}-${normalizedOrderNumber}`;
            const sourceKey = normalizedProvider.toLowerCase();
            const payloadFingerprint = createHash('sha256')
                .update(JSON.stringify({
                    provider: normalizedProvider,
                    orderNumber: normalizedOrderNumber,
                    total: Number(orderData.total || 0),
                    isPaid: orderData.isPaid,
                    customer: orderData.customer,
                    items: orderData.items,
                }))
                .digest('hex');
            const [platform] = await db
                .select({
                    applyFeesToMenuPrice: deliveryPlatforms.applyFeesToMenuPrice,
                    priceMarkupPercentage: deliveryPlatforms.priceMarkupPercentage,
                    priceMarkupFixed: deliveryPlatforms.priceMarkupFixed,
                })
                .from(deliveryPlatforms)
                .where(and(
                    eq(deliveryPlatforms.isActive, true),
                    sql`(
                        lower(${deliveryPlatforms.id}) = ${sourceKey}
                        OR lower(${deliveryPlatforms.name}) = ${sourceKey}
                    )`,
                ))
                .top(1);
            const pricedItems = orderData.items.map((item) => {
                const basePrice = Number(item.price || 0);
                const price = platform?.applyFeesToMenuPrice
                    ? Number((basePrice * (1 + Number(platform.priceMarkupPercentage || 0) / 100) + Number(platform.priceMarkupFixed || 0)).toFixed(2))
                    : basePrice;
                return { ...item, price };
            });
            const platformTotal = pricedItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
            const orderTotal = platform?.applyFeesToMenuPrice ? Number(platformTotal.toFixed(2)) : orderData.total;

            const existing = await db.select().from(orders).where(eq(orders.id, orderId)).top(1);
            if (existing[0]) {
                const existingItems = await db.select({ name: orderItems.name, price: orderItems.price, quantity: orderItems.quantity, notes: orderItems.notes })
                    .from(orderItems)
                    .where(eq(orderItems.orderId, orderId));
                const incomingItems = pricedItems.map(item => ({
                    name: item.name,
                    price: Number(item.price || 0),
                    quantity: Number(item.quantity || 0),
                    notes: item.id,
                }));
                const sameItems = JSON.stringify(existingItems.map(item => ({ ...item, price: Number(item.price || 0), quantity: Number(item.quantity || 0) })))
                    === JSON.stringify(incomingItems);
                const samePayload = String(existing[0].branchId) === String(branchId)
                    && String(existing[0].source || '').toUpperCase() === normalizedProvider
                    && (!existing[0].traceId || existing[0].traceId === `marketplace:${payloadFingerprint}`)
                    && Number(existing[0].total || 0) === Number(orderTotal || 0)
                    && String(existing[0].customerPhone || '') === String(orderData.customer.phone || '')
                    && Boolean(existing[0].isPaid) === Boolean(orderData.isPaid)
                    && sameItems;
                if (!samePayload) {
                    throw new Error('MARKETPLACE_ORDER_PAYLOAD_CONFLICT');
                }
                return { success: true, orderId, replayed: true };
            }

            await db.transaction(async (tx) => {
                await tx.insert(orders).values({
                    id: orderId,
                    traceId: `marketplace:${payloadFingerprint}`,
                    branchId,
                    type: 'DELIVERY',
                    source: normalizedProvider,
                    customerName: orderData.customer.name,
                    customerPhone: orderData.customer.phone,
                    deliveryAddress: orderData.customer.address,
                    total: orderTotal,
                    subtotal: orderTotal, // Assume pre-tax for now
                    tax: 0,
                    status: 'PENDING',
                    isPaid: orderData.isPaid,
                    paymentMethod: orderData.isPaid ? 'ONLINE' : null,
                    notes: `[${normalizedProvider}] ${orderData.notes || ''}`,
                    createdAt: new Date(),
                });

                for (const item of pricedItems) {
                    await tx.insert(orderItems).values({
                        orderId,
                        name: item.name,
                        price: item.price,
                        quantity: item.quantity,
                        notes: item.id, // we should map back menu items ideally
                    });
                }
            });

            log.info({ orderId }, 'Marketplace order successfully ingested');
            return { success: true, orderId, replayed: false };
        } catch (error: any) {
            log.error({ err: error.message, extId: orderData.orderNumber }, 'Marketplace ingestion failed');
            return { success: false, error: error.message };
        }
    }
};
