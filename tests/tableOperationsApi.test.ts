import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { branches, orderItems, orders, tables, users } from '../src/db/schema';

const businessDate = '2026-08-03';

describe('table operations API', () => {
    let app: any;
    let db: typeof import('../server/db')['db'];
    let token = '';
    let branchId = '';
    let userId = '';
    let email = '';
    let tableA = '';
    let tableB = '';
    let tableC = '';
    let orderId = '';
    let staleOrderId = '';

    beforeEach(async () => {
        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        branchId = `test-table-ops-branch-${suffix}`;
        userId = `test-table-ops-user-${suffix}`;
        email = `table-ops-${suffix}@restoflow.local`;
        tableA = `test-table-a-${suffix}`;
        tableB = `test-table-b-${suffix}`;
        tableC = `test-table-c-${suffix}`;
        orderId = `test-table-order-${suffix}`;
        staleOrderId = `test-table-stale-order-${suffix}`;
        app = (await import('../server/app')).default;
        db = (await import('../server/db')).db;

        await db.insert(branches).values({
            id: branchId,
            name: 'Table Operations Branch',
            address: 'Cairo',
            businessDate,
            serviceCharge: 0,
            isActive: true,
        });
        await db.insert(users).values({
            id: userId,
            name: 'Table Operations Admin',
            email,
            role: 'SUPER_ADMIN',
            permissions: ['*'],
            assignedBranchId: branchId,
            isActive: true,
            mfaEnabled: false,
        });
        await db.insert(tables).values([
            { id: tableA, name: 'A', branchId, status: 'OCCUPIED', currentOrderId: orderId },
            { id: tableB, name: 'B', branchId, status: 'AVAILABLE' },
            { id: tableC, name: 'C', branchId, status: 'AVAILABLE' },
        ]);
        await db.insert(orders).values({
            id: orderId,
            orderNumber: 1,
            type: 'DINE_IN',
            source: 'pos',
            branchId,
            tableId: tableA,
            status: 'PENDING',
            subtotal: 200,
            discount: 20,
            tax: 25.2,
            serviceCharge: 0,
            total: 205.2,
            businessDate,
        });
        await db.insert(orders).values({
            id: staleOrderId,
            orderNumber: 99,
            type: 'DINE_IN',
            source: 'pos',
            branchId,
            tableId: tableB,
            status: 'PENDING',
            subtotal: 10,
            discount: 0,
            tax: 1.4,
            serviceCharge: 0,
            total: 11.4,
            businessDate: '2026-08-02',
        });
        await db.insert(orderItems).values({
            orderId,
            name: 'Pizza',
            price: 100,
            quantity: 2,
            tax: 28,
            status: 'PENDING',
        });

        const login = await request(app).post('/api/auth/login').send({ email, password: 'Test123!' });
        expect(login.status).toBe(200);
        token = login.body.token;
    });

    it('transfers, splits, merges, and closes tables without stale references', async () => {
        const auth = { Authorization: `Bearer ${token}` };
        const transfer = await request(app).post('/api/tables/transfer').set(auth).send({
            sourceTableId: tableA,
            targetTableId: tableB,
            branchId,
        });
        expect(transfer.status).toBe(200);
        expect(transfer.body.movedOrder.id).toBe(orderId);

        const [movedItem] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        const split = await request(app).post('/api/tables/split').set(auth).send({
            sourceTableId: tableB,
            targetTableId: tableC,
            branchId,
            items: [{ id: movedItem.id, name: 'wrong legacy name', price: 1, quantity: 1 }],
        });
        expect(split.status).toBe(200);
        expect(split.body.targetOrder.parentOrderId).toBe(orderId);
        expect(split.body.targetOrder.businessDate).toBe(businessDate);
        expect(split.body.targetOrder.orderNumber).toBe(2);

        const sourceItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        const splitItems = await db.select().from(orderItems).where(eq(orderItems.orderId, split.body.targetOrder.id));
        expect(sourceItems).toHaveLength(1);
        expect(sourceItems[0].quantity).toBe(1);
        expect(Number(sourceItems[0].tax)).toBe(14);
        expect(splitItems).toHaveLength(1);
        expect(Number(splitItems[0].tax)).toBe(14);

        const merge = await request(app).post('/api/tables/merge').set(auth).send({
            sourceTableId: tableC,
            targetTableId: tableB,
            branchId,
            items: [{ id: splitItems[0].id, name: splitItems[0].name, price: splitItems[0].price, quantity: 1 }],
        });
        expect(merge.status).toBe(200);
        expect(merge.body.sourceOrder.status).toBe('COMPLETED');

        const staleClose = await request(app).put(`/api/orders/${orderId}/status`).set(auth).send({
            status: 'COMPLETED',
            expected_updated_at: '2000-01-01T00:00:00.000Z',
        });
        expect(staleClose.status).toBe(409);

        const close = await request(app).put(`/api/orders/${orderId}/status`).set(auth).send({ status: 'COMPLETED' });
        expect(close.status).toBe(200);

        const [savedTableA] = await db.select().from(tables).where(and(eq(tables.id, tableA), eq(tables.branchId, branchId)));
        const [savedTableB] = await db.select().from(tables).where(and(eq(tables.id, tableB), eq(tables.branchId, branchId)));
        const [savedTableC] = await db.select().from(tables).where(and(eq(tables.id, tableC), eq(tables.branchId, branchId)));
        expect(savedTableA.status).toBe('AVAILABLE');
        expect(savedTableB.status).toBe('AVAILABLE');
        expect(savedTableB.currentOrderId).toBeNull();
        expect(savedTableC.status).toBe('AVAILABLE');
        expect(savedTableC.currentOrderId).toBeNull();
    });
});
