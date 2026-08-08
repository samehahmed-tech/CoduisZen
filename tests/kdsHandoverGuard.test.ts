import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import { transitionOrderStatus } from '../server/services/orderLifecycleService';
import { branches, kdsTickets, orders, orderStatusHistory } from '../src/db/schema';
import { getDateKeyInTimeZone } from '../server/utils/businessDate';

const orderId = `TST-KDS-HANDOVER-${Date.now()}`;
const firstTicketId = `${orderId}-READY`;
const secondTicketId = `${orderId}-PREPARING`;
let branchId = '';

beforeAll(async () => {
    const [branch] = await db.select({
        id: branches.id,
        businessDate: branches.businessDate,
        timezone: branches.timezone,
    }).top(1).from(branches);
    if (!branch) throw new Error('KDS_HANDOVER_FIXTURE_MISSING');
    branchId = branch.id;
    await db.insert(orders).values({
        id: orderId,
        type: 'TAKEAWAY',
        branchId,
        businessDate: branch.businessDate || getDateKeyInTimeZone(new Date(), branch.timezone || 'Africa/Cairo'),
        status: 'READY',
        subtotal: 100,
        tax: 0,
        total: 100,
    });
});

afterAll(async () => {
    await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId));
    await db.delete(kdsTickets).where(eq(kdsTickets.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
    expect(await db.select().from(kdsTickets).where(eq(kdsTickets.orderId, orderId))).toHaveLength(0);
    expect(await db.select().from(orders).where(eq(orders.id, orderId))).toHaveLength(0);
});

describe('KDS handover readiness guard', () => {
    it('rejects missing and unfinished tickets, then accepts all-ready tickets', async () => {
        const handover = () => transitionOrderStatus({
            orderId,
            nextStatus: 'DELIVERED',
            notes: 'Test packing handover',
            user: { role: 'SUPER_ADMIN', branchId },
            requireKitchenReady: true,
        });

        await expect(handover()).rejects.toThrow('KITCHEN_TICKETS_MISSING');

        await db.insert(kdsTickets).values([
            {
                id: firstTicketId,
                branchId,
                orderId,
                routingStation: 'KITCHEN',
                status: 'READY',
            },
            {
                id: secondTicketId,
                branchId,
                orderId,
                routingStation: 'BAR',
                status: 'PREPARING',
            },
        ]);

        await expect(handover()).rejects.toThrow('KITCHEN_TICKETS_NOT_READY');

        await db.update(kdsTickets)
            .set({ status: 'READY', updatedAt: new Date() })
            .where(eq(kdsTickets.id, secondTicketId));

        const delivered = await handover();
        expect(delivered.status).toBe('DELIVERED');
        const deliveredTickets = await db.select({ status: kdsTickets.status })
            .from(kdsTickets)
            .where(eq(kdsTickets.orderId, orderId));
        expect(deliveredTickets.map(ticket => ticket.status)).toEqual(['DELIVERED', 'DELIVERED']);
    });
});
