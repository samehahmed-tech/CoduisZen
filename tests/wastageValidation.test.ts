import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import { branches, inventoryItems, inventoryStock, users, userSessions, warehouses } from '../src/db/schema';

let app: any;
let db: typeof import('../server/db')['db'];

const jwtSecret = () => process.env.JWT_SECRET || 'test-jwt-secret-for-wastage-validation';

const createAuth = async (suffix: string, branchId: string) => {
    const userId = `test-wastage-user-${suffix}`;
    const sessionId = `${userId}-session`;
    const tokenId = `${userId}-token`;
    await db.insert(users).values({
        id: userId,
        name: 'Wastage Tester',
        email: `${userId}@restoflow.local`,
        role: 'SUPER_ADMIN',
        permissions: ['*'],
        assignedBranchId: branchId,
        isActive: true,
    });
    await db.insert(userSessions).values({
        id: sessionId,
        userId,
        tokenId,
        isActive: true,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const token = jwt.sign({ sub: userId, id: userId, role: 'SUPER_ADMIN', permissions: ['*'], branchId, sid: sessionId, jti: tokenId }, jwtSecret());
    return `Bearer ${token}`;
};

describe('wastage validation', () => {
    beforeEach(async () => {
        if (!app || !db) {
            const appModule = await import('../server/app');
            app = appModule.default;
            const dbModule = await import('../server/db');
            db = dbModule.db;
        }
    });

    it('rejects invalid and over-stock wastage without driving stock negative', async () => {
        const suffix = Date.now().toString();
        const branchId = `test-wastage-branch-${suffix}`;
        const warehouseId = `test-wastage-warehouse-${suffix}`;
        const itemId = `test-wastage-item-${suffix}`;

        await db.insert(branches).values({ id: branchId, name: 'Wastage Branch', isActive: true });
        await db.insert(warehouses).values({ id: warehouseId, name: 'Wastage Warehouse', branchId, type: 'KITCHEN', isActive: true });
        await db.insert(inventoryItems).values({ id: itemId, name: 'Wastage Item', unit: 'kg', costPrice: 10, isActive: true });
        await db.insert(inventoryStock).values({ itemId, warehouseId, quantity: 5 });

        const auth = await createAuth(suffix, branchId);

        const invalid = await request(app)
            .post('/api/wastage')
            .set('Authorization', auth)
            .send({ itemId, warehouseId, quantity: 0, reason: 'Expired' });
        expect(invalid.status).toBe(400);

        const overStock = await request(app)
            .post('/api/wastage')
            .set('Authorization', auth)
            .send({ itemId, warehouseId, quantity: 6, reason: 'Expired' });
        expect(overStock.status).toBe(400);

        const [stock] = await db.select().from(inventoryStock).where(and(eq(inventoryStock.itemId, itemId), eq(inventoryStock.warehouseId, warehouseId)));
        expect(stock.quantity).toBe(5);
    });
});
