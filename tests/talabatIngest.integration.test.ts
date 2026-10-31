import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { branches, idempotencyKeys, kdsTicketItems, kdsTickets, orderItems, orders } from '../src/db/schema';
import { getTalabatConfigRaw, saveTalabatConfig } from '../server/modules/talabat/talabatConfig';
import { ingestTalabatWebhook } from '../server/modules/talabat/talabatIngestService';
import { buildTalabatIdempotencyKey, TALABAT_IDEMPOTENCY_SCOPE } from '../server/modules/talabat/talabatMapper';

const orderId = `TEST-TALABAT-CONCURRENCY-${Date.now()}`;
const payload = {
    order_id: orderId,
    status: 'RECEIVED',
    store_id: 'fixture-store',
    order_type: 'DELIVERY',
    sub_total: 100,
    order_total: 110,
    delivery_fee: 10,
    customer: { name: 'Talabat Fixture', phone: '01000000000', address: 'Cairo' },
    items: [{ sku: 'FIXTURE-SKU', pricing: { quantity: 1, unit_price: 100, total_price: 100 }, status: 'IN_CART' }],
};

describe('Talabat ingest concurrency', () => {
    let branchId = '';
    let previousConfig: any;

    beforeAll(async () => {
        const [branch] = await db.select({ id: branches.id }).top(1).from(branches);
        if (!branch) throw new Error('TALABAT_TEST_BRANCH_MISSING');
        branchId = branch.id;
        previousConfig = await getTalabatConfigRaw();
        await saveTalabatConfig({ enabled: true, defaultBranchId: branchId, storeBranchMap: {} }, 'integration-test');
    });

    afterAll(async () => {
        const found = await db.select({ id: orders.id }).from(orders).where(and(
            eq(orders.deliverySource, 'talabat'),
            eq(orders.platformOrderId, orderId),
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
            eq(idempotencyKeys.key, buildTalabatIdempotencyKey(orderId, 'RECEIVED')),
            eq(idempotencyKeys.scope, TALABAT_IDEMPOTENCY_SCOPE),
        ));
        await saveTalabatConfig(previousConfig || { enabled: false }, 'integration-test');
    });

    it('creates one order when the same Talabat webhook arrives concurrently', async () => {
        const settled = await Promise.allSettled([
            ingestTalabatWebhook(payload),
            ingestTalabatWebhook(payload),
        ]);
        const saved = await db.select({ id: orders.id }).from(orders).where(and(
            eq(orders.deliverySource, 'talabat'),
            eq(orders.platformOrderId, orderId),
        ));
        expect(saved).toHaveLength(1);
        const successful = settled.filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled');
        expect(successful.filter((result) => result.value.created)).toHaveLength(1);
        expect(successful.every((result) => result.value.orderId === saved[0].id)).toBe(true);
        const rejected = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
        expect(rejected.every((result) => result.reason?.message === 'TALABAT_ORDER_IN_PROGRESS')).toBe(true);
    });

    it('rejects a changed financial payload for the same order and status', async () => {
        await expect(ingestTalabatWebhook({ ...payload, order_total: 999 })).rejects.toMatchObject({
            message: 'TALABAT_ORDER_PAYLOAD_CONFLICT',
            status: 409,
        });
    });
});
