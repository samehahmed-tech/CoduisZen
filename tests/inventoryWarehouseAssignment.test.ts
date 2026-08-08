import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { branches, inventoryItems, inventoryStock, userSessions, users, warehouses } from '../src/db/schema';

let app: any;
let db: typeof import('../server/db')['db'];

describe('inventory item warehouse assignment', () => {
    beforeEach(async () => {
        if (!app || !db) {
            app = (await import('../server/app')).default;
            db = (await import('../server/db')).db;
        }
    });

    it('persists zero-stock assignments, allows reassignment, and protects non-zero stock', async () => {
        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const branchId = `test-inventory-branch-${suffix}`;
        const userId = `test-inventory-user-${suffix}`;
        const sessionId = `test-inventory-session-${suffix}`;
        const tokenId = `test-inventory-token-${suffix}`;
        const itemId = `test-inventory-item-${suffix}`;
        const firstWarehouseId = `test-inventory-wh-a-${suffix}`;
        const secondWarehouseId = `test-inventory-wh-b-${suffix}`;

        await db.insert(branches).values({ id: branchId, name: 'Inventory Assignment Branch', isActive: true });
        await db.insert(users).values({
            id: userId,
            name: 'Inventory Assignment User',
            email: `${userId}@restoflow.local`,
            role: 'SUPER_ADMIN',
            permissions: ['*'],
            assignedBranchId: branchId,
            allowedBranches: [branchId],
            isActive: true,
        });
        await db.insert(userSessions).values({
            id: sessionId,
            userId,
            tokenId,
            isActive: true,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        });
        await db.insert(warehouses).values([
            { id: firstWarehouseId, name: 'Warehouse A', branchId, type: 'MAIN', isActive: true },
            { id: secondWarehouseId, name: 'Warehouse B', branchId, type: 'SECONDARY', isActive: true },
        ]);

        const token = jwt.sign({
            sub: userId,
            id: userId,
            role: 'SUPER_ADMIN',
            permissions: ['*'],
            branchId,
            allowedBranches: [branchId],
            sid: sessionId,
            jti: tokenId,
        }, process.env.JWT_SECRET || 'test-jwt-secret-inventory-assignment');
        const auth = `Bearer ${token}`;

        const created = await request(app)
            .post('/api/inventory')
            .set('Authorization', auth)
            .send({
                id: itemId,
                name: 'Assigned Item',
                name_ar: 'صنف موزع',
                sku: itemId,
                unit: 'COUNT',
                warehouse_ids: [firstWarehouseId],
            });
        expect(created.status, JSON.stringify(created.body)).toBe(201);

        let stockRows = await db.select().from(inventoryStock).where(eq(inventoryStock.itemId, itemId));
        expect(stockRows.map(row => [row.warehouseId, Number(row.quantity)])).toEqual([[firstWarehouseId, 0]]);

        const reassigned = await request(app)
            .put(`/api/inventory/${itemId}`)
            .set('Authorization', auth)
            .send({ warehouse_ids: [secondWarehouseId] });
        expect(reassigned.status, JSON.stringify(reassigned.body)).toBe(200);

        stockRows = await db.select().from(inventoryStock).where(eq(inventoryStock.itemId, itemId));
        expect(stockRows.map(row => [row.warehouseId, Number(row.quantity)])).toEqual([[secondWarehouseId, 0]]);

        await db.update(inventoryStock).set({ quantity: 4 }).where(eq(inventoryStock.itemId, itemId));
        const blocked = await request(app)
            .put(`/api/inventory/${itemId}`)
            .set('Authorization', auth)
            .send({ warehouse_ids: [firstWarehouseId] });
        expect(blocked.status).toBe(409);
        expect(blocked.body.code).toBe('WAREHOUSE_STOCK_NOT_EMPTY');

        stockRows = await db.select().from(inventoryStock).where(eq(inventoryStock.itemId, itemId));
        expect(stockRows.map(row => [row.warehouseId, Number(row.quantity)])).toEqual([[secondWarehouseId, 4]]);

        await db.delete(inventoryStock).where(eq(inventoryStock.itemId, itemId));
        await db.delete(inventoryItems).where(eq(inventoryItems.id, itemId));
        await db.delete(warehouses).where(eq(warehouses.id, firstWarehouseId));
        await db.delete(warehouses).where(eq(warehouses.id, secondWarehouseId));
        await db.delete(userSessions).where(eq(userSessions.id, sessionId));
        await db.delete(users).where(eq(users.id, userId));
        await db.delete(branches).where(eq(branches.id, branchId));
    });
});
