/**
 * Marketplace Integration Service
 * Implements: Phase 3.14 (Talabat, Elmenus, Hungerstation)
 * 
 * Maps incoming orders from external delivery platforms into Coduis Zen schema.
 */

import { db } from '../db';
import { deliveryPlatforms, orders, orderItems } from '../../src/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import logger from '../utils/logger';

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
            if (typeof orderData.isPaid !== 'boolean') {
                throw new Error('MARKETPLACE_PAYMENT_STATUS_REQUIRED');
            }
            // 1. Transactionally insert the order
            const orderId = `ext-${orderData.provider.toLowerCase()}-${orderData.orderNumber}`;
            const sourceKey = String(orderData.provider || '').trim().toLowerCase();
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

            await db.transaction(async (tx) => {
                await tx.insert(orders).values({
                    id: orderId,
                    branchId,
                    type: 'DELIVERY',
                    source: orderData.provider,
                    customerName: orderData.customer.name,
                    customerPhone: orderData.customer.phone,
                    deliveryAddress: orderData.customer.address,
                    total: orderTotal,
                    subtotal: orderTotal, // Assume pre-tax for now
                    tax: 0,
                    status: 'PENDING',
                    isPaid: orderData.isPaid,
                    paymentMethod: orderData.isPaid ? 'ONLINE' : null,
                    notes: `[${orderData.provider}] ${orderData.notes || ''}`,
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
            return { success: true, orderId };
        } catch (error: any) {
            log.error({ err: error.message, extId: orderData.orderNumber }, 'Marketplace ingestion failed');
            return { success: false, error: error.message };
        }
    }
};
