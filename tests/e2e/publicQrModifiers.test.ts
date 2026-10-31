import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { signPublicQrToken } from '../../server/utils/publicQrToken';
import { branches, menuCategories, menuItems, orderItems, tables } from '../../src/db/schema';

process.env.PUBLIC_QR_SECRET = 'integration-public-qr-secret';

describe('Public QR modifiers E2E', () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const branchId = `test-qr-mod-branch-${suffix}`;
    const categoryId = `test-qr-mod-category-${suffix}`;
    const itemId = `test-qr-mod-item-${suffix}`;
    const tableId = `test-qr-mod-table-${suffix}`;
    let app: any;
    let db: typeof import('../../server/db')['db'];

    beforeAll(async () => {
        app = (await import('../../server/app')).default;
        db = (await import('../../server/db')).db;
        await db.insert(branches).values({ id: branchId, name: 'QR Modifier Branch', isActive: true }).onConflictDoNothing();
        await db.insert(menuCategories).values({ id: categoryId, name: 'QR Category', isActive: true, menuIds: ['menu-1'], printerIds: [] }).onConflictDoNothing();
        await db.insert(menuItems).values({
            id: itemId, categoryId, name: 'QR Burger', price: 100, isAvailable: true, status: 'published',
            sizes: [{ id: 'qr-large', name: 'Large', nameAr: 'كبير', price: 140 }],
            modifierGroups: [{ id: 'qr-extras', name: 'Extras', minSelection: 0, maxSelection: 2, options: [{ id: 'qr-cheese', name: 'Cheese', price: 25 }] }],
        } as any).onConflictDoNothing();
        await db.insert(tables).values({ id: tableId, branchId, name: 'QR-1', status: 'AVAILABLE', zoneId: null } as any).onConflictDoNothing();
    });

    it('returns authoritative modifier pricing and persists the selected option', async () => {
        const token = signPublicQrToken(branchId, tableId);
        expect(token).toBeTruthy();

        const menu = await request(app)
            .get(`/api/v1/qr/branches/${branchId}/tables/${tableId}/menu`)
            .set('X-RestoFlow-QR-Token', token as string);
        expect(menu.status).toBe(200);
        expect(menu.body.items.find((item: any) => item.id === itemId).modifierGroups[0].options[0].id).toBe('qr-cheese');
        expect(menu.body.items.find((item: any) => item.id === itemId).sizes[0].id).toBe('qr-large');

        const created = await request(app)
            .post(`/api/v1/qr/branches/${branchId}/tables/${tableId}/orders`)
            .set('X-RestoFlow-QR-Token', token as string)
            .set('Idempotency-Key', `qr-modifier-${suffix}`)
            .send({ type: 'DINE_IN', items: [{ menuItemId: itemId, sizeId: 'qr-large', quantity: 1, modifiers: [{ id: 'qr-cheese', price: 999 }] }] });
        expect(created.status).toBe(201);
        expect(Number(created.body.order.total)).toBeGreaterThanOrEqual(165);

        const [savedLine] = await db.select({ price: orderItems.price, sizeId: orderItems.sizeId, modifiers: orderItems.modifiers })
            .from(orderItems).where(eq(orderItems.orderId, created.body.order.id));
        // Order items store the base unit price separately; canonical modifier
        // pricing is persisted in the modifiers JSON and reflected in totals.
        expect(Number(savedLine.price)).toBe(140);
        expect(savedLine.sizeId).toBe('qr-large');
        expect((savedLine.modifiers as any[])[0]).toMatchObject({ id: 'qr-cheese', price: 25 });
    });
});
