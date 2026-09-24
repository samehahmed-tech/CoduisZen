import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import {
    branches,
    butcheryOperations,
    butcheryOutputs,
    inventoryBatches,
    inventoryItems,
    inventoryStock,
    stockMovements,
    users,
    userSessions,
    warehouses,
} from '../src/db/schema';

let app: any;
let db: typeof import('../server/db')['db'];

const jwtSecret = () => process.env.JWT_SECRET || 'test-jwt-secret-for-wastage-validation';

const createAuth = async (suffix: string, branchId: string) => {
    const userId = `test-butchery-user-${suffix}`;
    const sessionId = `${userId}-session`;
    const tokenId = `${userId}-token`;
    await db.insert(users).values({
        id: userId,
        name: 'Butchery Tester',
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

const stockOf = async (itemId: string, warehouseId: string) => {
    const [row] = await db.select().from(inventoryStock).where(and(eq(inventoryStock.itemId, itemId), eq(inventoryStock.warehouseId, warehouseId)));
    return Number(row?.quantity || 0);
};

const costOf = async (itemId: string) => {
    const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
    return Number((row as any)?.costPrice || 0);
};

describe('butchery end-to-end (post, edit posted, cancel, delete)', () => {
    it('runs the full lifecycle with correct stock and cost effects', { timeout: 120000 }, async () => {
        const appModule = await import('../server/app');
        app = appModule.default;
        const dbModule = await import('../server/db');
        db = dbModule.db;

        const suffix = Date.now().toString();
        const branchId = `test-butchery-branch-${suffix}`;
        const warehouseId = `test-butchery-warehouse-${suffix}`;
        const src = `test-butchery-leg-${suffix}`;
        const steak = `test-butchery-steak-${suffix}`;
        const cubes = `test-butchery-cubes-${suffix}`;
        const mince = `test-butchery-mince-${suffix}`;
        const fat = `test-butchery-fat-${suffix}`;
        const bones = `test-butchery-bones-${suffix}`;

        await db.insert(branches).values({ id: branchId, name: 'Butchery Branch', isActive: true });
        await db.insert(warehouses).values({ id: warehouseId, name: 'Butchery Warehouse', branchId, type: 'MAIN', isActive: true });
        await db.insert(inventoryItems).values({ id: src, name: 'Whole Beef Leg', unit: 'kg', costPrice: 500, isActive: true });
        for (const [id, name] of [[steak, 'Steak'], [cubes, 'Beef Cubes'], [mince, 'Minced Beef'], [fat, 'Fat'], [bones, 'Bones']] as const) {
            await db.insert(inventoryItems).values({ id, name, unit: 'kg', costPrice: 0, isActive: true });
        }
        await db.insert(inventoryStock).values({ itemId: src, warehouseId, quantity: 20 });
        const expiry = new Date();
        expiry.setFullYear(expiry.getFullYear() + 1);
        await db.insert(inventoryBatches).values({
            id: `test-butchery-batch-${suffix}`,
            itemId: src,
            warehouseId,
            batchNumber: `TEST-BUTCH-${suffix}`,
            receivedDate: new Date(),
            expiryDate: expiry,
            initialQty: 20,
            currentQty: 20,
            unitCost: 500,
            status: 'ACTIVE',
            createdAt: new Date(),
        });

        const auth = await createAuth(suffix, branchId);
        const outputs = [
            { itemId: steak, quantity: 6, unit: 'KG', outputType: 'USABLE' },
            { itemId: cubes, quantity: 4, unit: 'KG', outputType: 'USABLE' },
            { itemId: mince, quantity: 3, unit: 'KG', outputType: 'USABLE' },
            { itemId: fat, quantity: 2, unit: 'KG', outputType: 'BY_PRODUCT' },
            { itemId: bones, quantity: 3, unit: 'KG', outputType: 'BY_PRODUCT' },
            { quantity: 2, unit: 'KG', outputType: 'WASTE', wasteReason: 'Trim' },
        ];

        // ---- create (DRAFT): cost locked from live costPrice (20 * 500 = 10,000)
        const created = await request(app).post('/api/butchery/operations').set('Authorization', auth).send({
            sourceItemId: src, sourceQty: 20, warehouseId, outputs,
        });
        expect(created.status).toBe(201);
        const opId = created.body.id;
        expect(created.body.status).toBe('DRAFT');
        expect(created.body.sourceTotalCost).toBeCloseTo(10000, 2);
        const allocatedSum = (created.body.outputs || []).reduce((s: number, o: any) => s + Number(o.totalAllocatedCost || 0), 0);
        expect(allocatedSum).toBeCloseTo(10000, 2);
        expect(await stockOf(src, warehouseId)).toBe(20); // DRAFT moves nothing

        // ---- validation: empty outputs rejected
        const bad = await request(app).post('/api/butchery/operations').set('Authorization', auth).send({
            sourceItemId: src, sourceQty: 5, warehouseId, outputs: [],
        });
        expect(bad.status).toBe(400);

        // ---- post: source consumed, outputs stocked, waste recorded
        const posted = await request(app).post(`/api/butchery/operations/${opId}/post`).set('Authorization', auth);
        expect(posted.status).toBe(200);
        expect(posted.body.status).toBe('POSTED');
        expect(await stockOf(src, warehouseId)).toBe(0);
        expect(await stockOf(steak, warehouseId)).toBe(6);
        expect(await stockOf(cubes, warehouseId)).toBe(4);
        expect(await stockOf(bones, warehouseId)).toBe(3);
        expect(await costOf(steak)).toBeCloseTo(500, 2); // yield-adjusted MAC
        const wasteMoves = await db.select().from(stockMovements).where(and(eq(stockMovements.referenceId, opId), eq(stockMovements.type, 'WASTE')));
        expect(wasteMoves.length).toBeGreaterThan(0);

        // ---- double post refused
        const repost = await request(app).post(`/api/butchery/operations/${opId}/post`).set('Authorization', auth);
        expect(repost.status).toBe(400);

        // ---- edit POSTED: steak 6 -> 5, cubes 4 -> 5 (reverse + re-apply)
        const edited = await request(app).put(`/api/butchery/operations/${opId}`).set('Authorization', auth).send({
            outputs: [
                { itemId: steak, quantity: 5, unit: 'KG', outputType: 'USABLE' },
                { itemId: cubes, quantity: 5, unit: 'KG', outputType: 'USABLE' },
                { itemId: mince, quantity: 3, unit: 'KG', outputType: 'USABLE' },
                { itemId: fat, quantity: 2, unit: 'KG', outputType: 'BY_PRODUCT' },
                { itemId: bones, quantity: 3, unit: 'KG', outputType: 'BY_PRODUCT' },
                { quantity: 2, unit: 'KG', outputType: 'WASTE', wasteReason: 'Trim' },
            ],
        });
        expect(edited.status).toBe(200);
        expect(edited.body.status).toBe('POSTED');
        expect(await stockOf(steak, warehouseId)).toBe(5);
        expect(await stockOf(cubes, warehouseId)).toBe(5);
        expect(await stockOf(src, warehouseId)).toBe(0);

        // ---- cancel (reversal): source back, outputs taken away
        const cancelled = await request(app).post(`/api/butchery/operations/${opId}/cancel`).set('Authorization', auth);
        expect(cancelled.status).toBe(200);
        expect(await stockOf(src, warehouseId)).toBe(20);
        expect(await stockOf(steak, warehouseId)).toBe(0);
        expect(await stockOf(cubes, warehouseId)).toBe(0);

        // ---- delete cancelled operation
        const deleted = await request(app).delete(`/api/butchery/operations/${opId}`).set('Authorization', auth);
        expect(deleted.status).toBe(200);
        const gone = await request(app).get(`/api/butchery/operations/${opId}`).set('Authorization', auth);
        expect(gone.status).toBe(404);

        // ---- delete a POSTED operation directly (reverse + delete)
        const created2 = await request(app).post('/api/butchery/operations').set('Authorization', auth).send({
            sourceItemId: src, sourceQty: 10, warehouseId,
            outputs: [{ itemId: steak, quantity: 9, unit: 'KG', outputType: 'USABLE' }, { quantity: 1, unit: 'KG', outputType: 'WASTE' }],
        });
        expect(created2.status).toBe(201);
        const op2 = created2.body.id;
        const posted2 = await request(app).post(`/api/butchery/operations/${op2}/post`).set('Authorization', auth);
        expect(posted2.status).toBe(200);
        expect(await stockOf(src, warehouseId)).toBe(10);
        const deletedPosted = await request(app).delete(`/api/butchery/operations/${op2}`).set('Authorization', auth);
        expect(deletedPosted.status).toBe(200);
        expect(await stockOf(src, warehouseId)).toBe(20);
        expect(await stockOf(steak, warehouseId)).toBe(0);

        // ---- tidy up our operation rows (movements/audit stay as history)
        await db.delete(butcheryOutputs).where(eq(butcheryOutputs.operationId, op2));
        await db.delete(butcheryOperations).where(eq(butcheryOperations.id, op2));
    });
});
