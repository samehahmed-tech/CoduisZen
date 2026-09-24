import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';

let app: any;
let db: typeof import('../server/db')['db'];
import {
    branches, kdsTickets, menuCategories, menuItems, orderItems, orders,
    orderStatusHistory, payments, shifts, users,
} from '../src/db/schema';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const F = {
    branchId: `test-tableedit-branch-${suffix}`,
    userId: `test-tableedit-user-${suffix}`,
    email: `tableedit-${suffix}@restoflow.local`,
    password: 'Test123!',
    shiftId: `test-tableedit-shift-${suffix}`,
    categoryId: `test-tableedit-cat-${suffix}`,
    itemA: `test-tableedit-itemA-${suffix}`,
    itemB: `test-tableedit-itemB-${suffix}`,
};

const localDateKey = (date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

describe('Table order edit (remove line reconciles totals)', () => {
    let token = '';
    let orderId = '';

    beforeEach(async () => {
        if (!app || !db) {
            const appModule = await import('../server/app');
            app = appModule.default;
            const dbModule = await import('../server/db');
            db = dbModule.db;
        }

        await db.insert(branches).values({
            id: F.branchId, name: 'Table Edit Branch', isActive: true,
        }).onConflictDoNothing();
        await db.update(branches)
            .set({ businessDate: localDateKey() })
            .where(eq(branches.id, F.branchId));

        await db.insert(users).values({
            id: F.userId, name: 'Table Edit User', email: F.email,
            role: 'SUPER_ADMIN', permissions: ['*'],
            assignedBranchId: F.branchId, isActive: true, mfaEnabled: false,
        }).onConflictDoNothing();

        await db.insert(shifts).values({
            id: F.shiftId, branchId: F.branchId, userId: F.userId,
            openingBalance: 0, status: 'OPEN',
        }).onConflictDoNothing();

        await db.insert(menuCategories).values({
            id: F.categoryId, name: 'Table Edit Cat', isActive: true,
            menuIds: ['menu-1'], printerIds: [], targetOrderTypes: ['DINE_IN'],
        }).onConflictDoNothing();

        for (const [id, name, price] of [
            [F.itemA, 'Table Edit Item A', 100],
            [F.itemB, 'Table Edit Item B', 50],
        ] as const) {
            await db.insert(menuItems).values({
                id, categoryId: F.categoryId, name, price,
                isAvailable: true, printerIds: [], modifierGroups: [],
            }).onConflictDoNothing();
        }

        const loginRes = await request(app).post('/api/auth/login').send({
            email: F.email, password: F.password,
        });
        expect(loginRes.status).toBe(200);
        token = loginRes.body.token;

        // Open PENDING order with two lines (the "table" state).
        const createRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${token}`)
            .send({
                type: 'TAKEAWAY',
                branchId: F.branchId,
                shiftId: F.shiftId,
                items: [
                    { menu_item_id: F.itemA, name: 'Table Edit Item A', quantity: 2, price: 100 },
                    { menu_item_id: F.itemB, name: 'Table Edit Item B', quantity: 1, price: 50 },
                ],
                subtotal: 250,
                tax: 0,
                total: 250,
            });
        expect(createRes.status).toBe(201);
        orderId = createRes.body.id as string;
    });

    it('removing a line replaces lines and recomputes totals from scratch', async () => {
        const before = await request(app)
            .put(`/api/orders/${orderId}/items`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                items: [{ menu_item_id: F.itemA, name: 'Table Edit Item A', quantity: 1, price: 100 }],
            });

        expect(before.status).toBe(200);
        expect(Array.isArray(before.body.items)).toBe(true);
        expect(before.body.items).toHaveLength(1);
        expect(before.body.items[0].menuItemId).toBe(F.itemA);
        expect(Number(before.body.items[0].quantity)).toBe(1);
        // From-scratch math: subtotal is exactly the remaining line.
        expect(Number(before.body.subtotal)).toBe(100);
        expect(Number(before.body.total)).toBeCloseTo(
            Number(before.body.subtotal) - Number(before.body.discount || 0) + Number(before.body.tax || 0), 2,
        );

        // Re-saving the same content is stable (no duplicates accumulate).
        const again = await request(app)
            .put(`/api/orders/${orderId}/items`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                items: [{ menu_item_id: F.itemA, name: 'Table Edit Item A', quantity: 1, price: 100 }],
            });
        expect(again.status).toBe(200);
        expect(again.body.items).toHaveLength(1);
        expect(Number(again.body.subtotal)).toBe(100);

        // DB holds exactly one line — the removed item is gone, not lingering.
        const rows = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        expect(rows).toHaveLength(1);
        expect(rows[0].menuItemId).toBe(F.itemA);
    });

    it('rejects emptying the whole ticket instead of zeroing it silently', async () => {
        const res = await request(app)
            .put(`/api/orders/${orderId}/items`)
            .set('Authorization', `Bearer ${token}`)
            .send({ items: [] });
        expect(res.status).toBe(400);
    });

    it('rejects stale-version edits with a conflict code and serves fresh truth', async () => {
        const stale = await request(app)
            .put(`/api/orders/${orderId}/items`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                items: [{ menu_item_id: F.itemA, name: 'Table Edit Item A', quantity: 1, price: 100 }],
                expectedUpdatedAt: new Date(Date.now() - 3600_000).toISOString(),
            });
        expect(stale.status).toBe(409);
        expect(stale.body.code || stale.body.error).toMatch(/ORDER_VERSION_CONFLICT/);
        // NOTE: app error-contract middleware nests extra fields under details.
        expect(stale.body.details?.currentUpdatedAt || stale.body.currentUpdatedAt).toBeTruthy();

        // Fresh-truth endpoint used by the client auto-retry path.
        const fresh = await request(app)
            .get(`/api/orders/${orderId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(fresh.status).toBe(200);
        expect(fresh.body.id).toBe(orderId);
        expect(Array.isArray(fresh.body.items)).toBe(true);

        // Retry with the fresh timestamp succeeds (mirrors client auto-retry).
        const retry = await request(app)
            .put(`/api/orders/${orderId}/items`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                items: [{ menu_item_id: F.itemA, name: 'Table Edit Item A', quantity: 1, price: 100 }],
                expectedUpdatedAt: fresh.body.updated_at || fresh.body.updatedAt,
            });
        expect(retry.status).toBe(200);
        expect(retry.body.items).toHaveLength(1);
    });

    it('rewrites a fired (PREPARING) dine-in ticket when still unpaid', async () => {
        const dineRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${token}`)
            .send({
                type: 'DINE_IN',
                branchId: F.branchId,
                shiftId: F.shiftId,
                items: [
                    { menu_item_id: F.itemA, name: 'Table Edit Item A', quantity: 2, price: 100 },
                    { menu_item_id: F.itemB, name: 'Table Edit Item B', quantity: 1, price: 50 },
                ],
                subtotal: 250,
                tax: 0,
                total: 250,
            });
        expect(dineRes.status).toBe(201);
        const dineId = dineRes.body.id as string;

        const fireRes = await request(app)
            .put(`/api/orders/${dineId}/status`)
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'PREPARING' });
        expect(fireRes.status).toBe(200);

        const editRes = await request(app)
            .put(`/api/orders/${dineId}/items`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                items: [{ menu_item_id: F.itemA, name: 'Table Edit Item A', quantity: 1, price: 100 }],
            });
        expect(editRes.status).toBe(200);
        expect(editRes.body.items).toHaveLength(1);
        expect(Number(editRes.body.subtotal)).toBe(100);

        const rows = await db.select().from(orderItems).where(eq(orderItems.orderId, dineId));
        expect(rows).toHaveLength(1);
    });

    it('refuses item edits on non-dine-in fired tickets', async () => {
        const fireRes = await request(app)
            .put(`/api/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'PREPARING' });
        expect(fireRes.status).toBe(200);

        const editRes = await request(app)
            .put(`/api/orders/${orderId}/items`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                items: [{ menu_item_id: F.itemA, name: 'Table Edit Item A', quantity: 1, price: 100 }],
            });
        expect(editRes.status).toBe(409);
        expect(editRes.body.code || editRes.body.error).toMatch(/ORDER_NOT_EDITABLE/);
    });
});
