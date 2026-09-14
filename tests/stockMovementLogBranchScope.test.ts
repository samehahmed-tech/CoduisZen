import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { branches, inventoryItems, stockMovements, users, userSessions, warehouses } from '../src/db/schema';

let app: any;
let db: typeof import('../server/db')['db'];

const jwtSecret = () => process.env.JWT_SECRET || 'test-jwt-secret-for-movement-log';

const createAuth = async (suffix: string, branchId: string) => {
    const userId = `test-mvlog-user-${suffix}`;
    const sessionId = `${userId}-session`;
    const tokenId = `${userId}-token`;
    await db.insert(users).values({
        id: userId,
        name: 'Movement Tester',
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

describe('stock movement log shows PO receipts under branch scope', () => {
    it('returns PURCHASE movements that only carry toWarehouseId', async () => {
        if (!app || !db) {
            const appModule = await import('../server/app');
            app = appModule.default;
            const dbModule = await import('../server/db');
            db = dbModule.db;
        }
        const suffix = Date.now().toString();
        const branchId = `test-mvlog-branch-${suffix}`;
        const warehouseId = `test-mvlog-wh-${suffix}`;
        const itemId = `test-mvlog-item-${suffix}`;

        await db.insert(branches).values({ id: branchId, name: 'MV Branch', isActive: true });
        await db.insert(warehouses).values({ id: warehouseId, name: 'Receiving WH', branchId, type: 'KITCHEN', isActive: true });
        await db.insert(inventoryItems).values({ id: itemId, name: 'PO Received Item', unit: 'kg', costPrice: 10, isActive: true });

        // Mirrors purchaseOrderController.receivePurchaseOrder: PURCHASE rows
        // have ONLY toWarehouseId set.
        await db.insert(stockMovements).values({
            itemId,
            toWarehouseId: warehouseId,
            quantity: 25,
            unitCost: 10,
            totalCost: 250,
            type: 'PURCHASE',
            referenceId: `po-test-${suffix}`,
            reason: 'Goods Receipt from PO',
            performedBy: 'system',
            createdAt: new Date(),
        });

        const auth = await createAuth(suffix, branchId);
        const today = new Date().toISOString().split('T')[0];

        const res = await request(app)
            .get('/api/reports/stock-movements')
            .query({ startDate: today, endDate: today, branchId })
            .set('Authorization', auth);

        expect(res.status).toBe(200);
        const rows = res.body as any[];
        const purchaseRow = rows.find((r) => r.type === 'PURCHASE' && r.referenceId === `po-test-${suffix}`);
        expect(purchaseRow).toBeDefined();
        expect(Number(purchaseRow.quantity)).toBe(25);
        expect(purchaseRow.warehouseName).toBe('Receiving WH');
        expect(purchaseRow.itemName).toBe('PO Received Item');

        // Outbound movement from the same branch must still resolve its warehouse
        await db.insert(stockMovements).values({
            itemId,
            fromWarehouseId: warehouseId,
            quantity: -5,
            unitCost: 10,
            totalCost: 50,
            type: 'WASTE',
            reason: 'Spoilage',
            performedBy: 'system',
            createdAt: new Date(),
        });
        const res2 = await request(app)
            .get('/api/reports/stock-movements')
            .query({ startDate: today, endDate: today, branchId })
            .set('Authorization', auth);
        const wasteRow = (res2.body as any[]).find((r) => r.type === 'WASTE');
        expect(wasteRow).toBeDefined();
        expect(wasteRow.warehouseName).toBe('Receiving WH');
    });
});
