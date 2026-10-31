import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { branches, idempotencyKeys, kdsTicketItems, kdsTickets, orderItems, orders } from '../src/db/schema';
import { getAggregatorsConfigRaw, saveProviderConfig } from '../server/modules/aggregators/aggregatorConfig';
import { ingestAggregatorOrder } from '../server/modules/aggregators/aggregatorIngestService';
import { buildAggregatorIdempotencyKey, type NormalizedOrder } from '../server/modules/aggregators/aggregatorTypes';

const provider = 'generic';
const externalId = `TEST-AGG-CONCURRENCY-${Date.now()}`;
const normalized: NormalizedOrder = {
    externalId,
    storeId: 'fixture-store',
    rawStatus: 'NEW',
    orderType: 'DELIVERY',
    items: [{ sku: 'FIXTURE-SKU', name: 'Fixture item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
    subtotal: 100,
    total: 110,
    deliveryFee: 10,
    customer: { name: 'Aggregator Fixture', phone: '01000000000', address: 'Cairo' },
};

describe('aggregator ingest concurrency', () => {
    let branchId = '';
    let previousConfig: any;

    beforeAll(async () => {
        const [branch] = await db.select({ id: branches.id }).top(1).from(branches);
        if (!branch) throw new Error('AGGREGATOR_TEST_BRANCH_MISSING');
        branchId = branch.id;
        previousConfig = (await getAggregatorsConfigRaw())[provider];
        await saveProviderConfig(provider, { enabled: true, defaultBranchId: branchId, storeBranchMap: {} }, 'integration-test');
    });

    afterAll(async () => {
        const found = await db.select({ id: orders.id }).from(orders).where(and(
            eq(orders.deliverySource, provider),
            eq(orders.platformOrderId, externalId),
        ));
        const orderIds = found.map((row) => row.id);
        if (orderIds.length) await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
        const tickets = orderIds.length
            ? await db.select({ id: kdsTickets.id }).from(kdsTickets).where(inArray(kdsTickets.orderId, orderIds))
            : [];
        const ticketIds = tickets.map((ticket) => ticket.id);
        if (ticketIds.length) await db.delete(kdsTicketItems).where(inArray(kdsTicketItems.kdsTicketId, ticketIds));
        if (ticketIds.length) await db.delete(kdsTickets).where(inArray(kdsTickets.id, ticketIds));
        if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
        await db.delete(idempotencyKeys).where(and(
            eq(idempotencyKeys.key, buildAggregatorIdempotencyKey(provider, externalId, 'NEW')),
            eq(idempotencyKeys.scope, 'AGGREGATOR_ORDER'),
        ));
        await saveProviderConfig(provider, previousConfig || { enabled: false }, 'integration-test');
    });

    it('creates one order when the same webhook arrives concurrently', async () => {
        const settled = await Promise.allSettled([
            ingestAggregatorOrder(provider, normalized, { order_id: externalId, status: 'NEW' }),
            ingestAggregatorOrder(provider, normalized, { order_id: externalId, status: 'NEW' }),
        ]);

        const saved = await db.select({ id: orders.id }).from(orders).where(and(
            eq(orders.deliverySource, provider),
            eq(orders.platformOrderId, externalId),
        ));
        expect(saved).toHaveLength(1);
        const successful = settled.filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled');
        const created = successful.filter((result) => result.value.created);
        expect(created).toHaveLength(1);
        expect(successful.every((result) => result.value.orderId === saved[0].id)).toBe(true);
        const rejected = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
        expect(rejected.every((result) => result.reason?.message === 'AGGREGATOR_ORDER_IN_PROGRESS')).toBe(true);
    });
});
