import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';

let app: any;
let db: typeof import('../server/db')['db'];
import { branches, dayCloseReports, orders, orderStatusHistory, shifts, tables, users } from '../src/db/schema';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const F = {
    branchId: `test-reopen-branch-${suffix}`,
    userId: `test-reopen-admin-${suffix}`,
    email: `reopen-${suffix}@restoflow.local`,
    password: 'Test123!',
    shiftId: `test-reopen-shift-${suffix}`,
    tableId: `test-reopen-table-${suffix}`,
    date: (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })(),
};

const mkOrder = (tag: string, type: string, status: string, minsAgo: number) => ({
    id: `test-reopen-order-${tag}-${suffix}`,
    type: type as any,
    branchId: F.branchId,
    tableId: type === 'DINE_IN' ? F.tableId : undefined,
    items: [],
    status: status as any,
    subtotal: 100,
    tax: 0,
    total: 100,
    createdAt: new Date(Date.now() - (minsAgo + 60) * 60000),
    updatedAt: new Date(Date.now() - minsAgo * 60000),
});

describe('reopen a wrongly-closed business day', () => {
    let token = '';

    beforeEach(async () => {
        if (!app || !db) {
            const appModule = await import('../server/app');
            app = appModule.default;
            const dbModule = await import('../server/db');
            db = dbModule.db;
        }

        await db.insert(branches).values({
            id: F.branchId, name: 'Reopen Branch', isActive: true, businessDate: F.date,
        }).onConflictDoNothing();
        await db.update(branches).set({ businessDate: F.date }).where(eq(branches.id, F.branchId));

        await db.insert(users).values({
            id: F.userId, name: 'Reopen Admin', email: F.email,
            role: 'SUPER_ADMIN', permissions: ['*'],
            assignedBranchId: F.branchId, isActive: true, mfaEnabled: false,
        } as any).onConflictDoNothing();

        await db.insert(shifts).values({
            id: F.shiftId, branchId: F.branchId, userId: F.userId,
            openingBalance: 0, status: 'CLOSED',
        }).onConflictDoNothing();

        await db.insert(tables).values({
            id: F.tableId, branchId: F.branchId, zoneId: null, name: 'T1',
            x: 0, y: 0, width: 100, height: 100, seats: 4,
            status: 'AVAILABLE', currentOrderId: null,
        } as any).onConflictDoNothing();

        // Two auto-finalized victims (touched minutes ago) + one real
        // completion from 3 days ago (must stay terminal).
        const list = [
            mkOrder('dine', 'DINE_IN', 'COMPLETED', 20),
            mkOrder('deliv', 'DELIVERY', 'DELIVERED', 25),
            mkOrder('old', 'TAKEAWAY', 'COMPLETED', 3 * 24 * 60),
        ];
        for (const o of list) {
            await db.insert(orders).values(o as any).onConflictDoNothing();
            await db.insert(orderStatusHistory).values({
                orderId: o.id,
                status: o.status,
                changedBy: F.userId,
                notes: 'Auto finalized on day close',
                createdAt: new Date(),
            }).onConflictDoNothing();
        }

        // The closed report for F.date.
        await db.insert(dayCloseReports).values({
            id: `dayclose_${F.branchId}_${F.date}`,
            branchId: F.branchId,
            businessDate: F.date as any,
            closedBy: F.userId,
            date: F.date as any,
            status: 'CLOSED',
            totalOrders: 3,
        } as any).onConflictDoNothing();

        const loginRes = await request(app).post('/api/auth/login').send({
            email: F.email, password: F.password,
        });
        expect(loginRes.status).toBe(200);
        token = loginRes.body.token;
    });

    it('refuses missing reason and non-closed days', async () => {
        const noReason = await request(app)
            .post(`/api/day-close/${F.branchId}/${F.date}/reopen`)
            .set('Authorization', `Bearer ${token}`)
            .send({ reason: '' });
        expect(noReason.status).toBe(400);

        const notClosed = await request(app)
            .post(`/api/day-close/${F.branchId}/1999-01-01/reopen`)
            .set('Authorization', `Bearer ${token}`)
            .send({ reason: 'test reason' });
        expect(notClosed.status).toBe(404);
    });

    it('reopens the day: report deleted, victims re-activated, date rewound', async () => {
        const res = await request(app)
            .post(`/api/day-close/${F.branchId}/${F.date}/reopen`)
            .set('Authorization', `Bearer ${token}`)
            .send({ reason: 'closed by mistake' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.dateReverted).toBe(true);

        // Report row is gone.
        const report = await db.select().from(dayCloseReports).where(eq(dayCloseReports.id, `dayclose_${F.branchId}_${F.date}`));
        expect(report).toHaveLength(0);

        // Auto-finalized victims are back to PENDING (old real completion stays).
        const dine = (await db.select().from(orders).where(eq(orders.id, mkOrder('dine', 'DINE_IN', 'COMPLETED', 20).id)))[0] as any;
        const deliv = (await db.select().from(orders).where(eq(orders.id, mkOrder('deliv', 'DELIVERY', 'DELIVERED', 25).id)))[0] as any;
        const old = (await db.select().from(orders).where(eq(orders.id, mkOrder('old', 'TAKEAWAY', 'COMPLETED', 3 * 24 * 60).id)))[0] as any;
        expect(String(dine.status).toUpperCase()).toBe('PENDING');
        expect(String(deliv.status).toUpperCase()).toBe('PENDING');
        expect(String(old.status).toUpperCase()).toBe('COMPLETED');

        // Business date rewound to the reopened day.
        const [branch] = await db.select().from(branches).where(eq(branches.id, F.branchId));
        expect(String(branch.businessDate).slice(0, 10)).toBe(F.date);
    });
});
