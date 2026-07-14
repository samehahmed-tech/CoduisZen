import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { sql, eq, and, inArray } from 'drizzle-orm';
import { 
    branches, 
    menuCategories, 
    menuItems, 
    shifts, 
    users, 
    warehouses, 
    inventoryItems, 
    inventoryStock, 
    inventoryBatches, 
    recipes, 
    recipeIngredients,
    costCenters,
    fiscalPeriods,
    journalEntries,
    journalLines,
    stockMovements
} from '../../src/db/schema';
import { COASeedService } from '../../server/services/coaSeedService';

let app: any;
let db: typeof import('../../server/db')['db'];

const FIXTURES = {
    branchId: 'test-comp-branch',
    userId: 'test-comp-user',
    warehouseId: 'test-comp-warehouse',
    shiftId: 'test-comp-shift',
    categoryId: 'test-comp-category',
    menuItemId: 'test-comp-menu-item',
    invItemId: 'test-comp-inv-item',
    recipeId: 'test-comp-recipe',
    costCenterId: 'test-comp-cost-center',
    fiscalPeriodId: 'test-comp-period',
    email: 'comp-admin@restoflow.local',
    password: 'Test123!',
};

describe('Comprehensive POS -> Inventory -> Finance Flow', () => {
    let testUserToken = '';

    beforeAll(async () => {
        const appModule = await import('../../server/app');
        app = appModule.default;
        const dbModule = await import('../../server/db');
        db = dbModule.db;

        // Seed COA once for the whole test suite
        await COASeedService.seed();
    });

    beforeEach(async () => {
        await db.execute(sql`DELETE FROM batch_transactions WHERE batch_id = 'batch-comp-1'`);
        await db.execute(sql`DELETE FROM stock_movements WHERE item_id = ${FIXTURES.invItemId}`);
        await db.execute(sql`DELETE FROM recipe_ingredients WHERE recipe_id = ${FIXTURES.recipeId}`);
        await db.execute(sql`DELETE FROM recipes WHERE id = ${FIXTURES.recipeId}`);
        await db.execute(sql`DELETE FROM inventory_stock WHERE item_id = ${FIXTURES.invItemId} AND warehouse_id = ${FIXTURES.warehouseId}`);
        await db.execute(sql`DELETE FROM inventory_batches WHERE id = 'batch-comp-1'`);

        // 1. Setup Branch & User
        await db.insert(branches).values({
            id: FIXTURES.branchId,
            name: 'Comp Branch',
            isActive: true,
        }).onConflictDoNothing();

        await db.insert(costCenters).values({
            id: FIXTURES.costCenterId,
            branchId: FIXTURES.branchId,
            code: 'CC-COMP-01',
            name: 'Comp Branch Cost Center',
            isActive: true,
        }).onConflictDoNothing();

        await db.insert(fiscalPeriods).values({
            id: FIXTURES.fiscalPeriodId,
            name: 'Current Test Period',
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T23:59:59.999Z'),
            status: 'OPEN',
        }).onConflictDoNothing();

        await db.insert(users).values({
            id: FIXTURES.userId,
            name: 'Comp Admin',
            email: FIXTURES.email,
            role: 'SUPER_ADMIN',
            assignedBranchId: FIXTURES.branchId,
            isActive: true,
        }).onConflictDoNothing();

        // 2. Setup Warehouse & Initial Stock
        await db.insert(warehouses).values({
            id: FIXTURES.warehouseId,
            name: 'Comp Warehouse',
            branchId: FIXTURES.branchId,
            type: 'KITCHEN',
            isActive: true,
        }).onConflictDoNothing();

        await db.insert(inventoryItems).values({
            id: FIXTURES.invItemId,
            name: 'Comp Raw Material (Tomato)',
            unit: 'kg',
            isActive: true,
        }).onConflictDoNothing();

        // Add 10kg of stock via a batch (for FEFO)
        await db.insert(inventoryBatches).values({
            id: 'batch-comp-1',
            itemId: FIXTURES.invItemId,
            warehouseId: FIXTURES.warehouseId,
            batchNumber: 'B001',
            expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
            initialQty: 10,
            currentQty: 10,
            unitCost: 20, // 20 EGP/kg
            status: 'ACTIVE',
        });

        await db.insert(inventoryStock).values({
            itemId: FIXTURES.invItemId,
            warehouseId: FIXTURES.warehouseId,
            quantity: 10,
        });

        // 3. Setup Menu & Recipe
        await db.insert(menuCategories).values({
            id: FIXTURES.categoryId,
            name: 'Comp Category',
            isActive: true,
        }).onConflictDoNothing();

        await db.insert(menuItems).values({
            id: FIXTURES.menuItemId,
            categoryId: FIXTURES.categoryId,
            name: 'Comp Menu Item (Soup)',
            price: 100,
            cost: 10, // Theoretical cost
            isAvailable: true,
        }).onConflictDoNothing();

        await db.insert(recipes).values({
            id: FIXTURES.recipeId,
            menuItemId: FIXTURES.menuItemId,
            yield: 1,
        });

        await db.insert(recipeIngredients).values({
            recipeId: FIXTURES.recipeId,
            inventoryItemId: FIXTURES.invItemId,
            quantity: 0.5, // 0.5kg per soup
            unit: 'kg',
        });

        // 4. Open Shift
        await db.insert(shifts).values({
            id: FIXTURES.shiftId,
            branchId: FIXTURES.branchId,
            userId: FIXTURES.userId,
            openingBalance: 0,
            status: 'OPEN',
        }).onConflictDoNothing();

        // 5. Login
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({
                email: FIXTURES.email,
                password: FIXTURES.password,
            });
        testUserToken = loginRes.body.token;
    });

    it('should complete the full POS -> Inventory -> Finance lifecycle', async () => {
        // 1. Create Order
        const orderPayload = {
            type: 'TAKEAWAY',
            branchId: FIXTURES.branchId,
            shiftId: FIXTURES.shiftId,
            items: [
                {
                    menu_item_id: FIXTURES.menuItemId,
                    name: 'Comp Menu Item (Soup)',
                    quantity: 2,
                    price: 100,
                },
            ],
            subtotal: 200,
            tax: 28, // 14%
            total: 228,
            paymentMethod: 'CASH',
        };

        const createRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send(orderPayload);

        expect(createRes.status).toBe(201);
        const orderId = createRes.body.id;

        // 2. Complete Order using the valid workflow enforced by the API
        let statusRes = await request(app)
            .put(`/api/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ status: 'PREPARING' });

        expect(statusRes.status).toBe(200);

        statusRes = await request(app)
            .put(`/api/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ status: 'READY' });

        expect(statusRes.status).toBe(200);

        statusRes = await request(app)
            .put(`/api/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ status: 'DELIVERED' });

        expect(statusRes.status).toBe(200);

        // 3. Verify Inventory Depletion
        // 2 soups * 0.5kg = 1kg should be deducted.
        const stockRecord = await db.select()
            .from(inventoryStock)
            .where(and(
                eq(inventoryStock.itemId, FIXTURES.invItemId),
                eq(inventoryStock.warehouseId, FIXTURES.warehouseId)
            ));
        
        expect(stockRecord[0].quantity).toBe(9); // 10 - 1

        const batchRecord = await db.select()
            .from(inventoryBatches)
            .where(eq(inventoryBatches.id, 'batch-comp-1'));
        
        expect(batchRecord[0].currentQty).toBe(9);

        const movement = await db.select()
            .from(stockMovements)
            .where(eq(stockMovements.referenceId, orderId));
        
        expect(movement.length).toBeGreaterThan(0);
        expect(movement[0].type).toBe('SALE_CONSUMPTION');

        // 4. Verify Finance Posting (Journal Entries)
        let entries = await db.select()
            .from(journalEntries)
            .where(eq(journalEntries.reference, orderId));

        for (let attempt = 0; entries.length === 0 && attempt < 10; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            entries = await db.select()
                .from(journalEntries)
                .where(eq(journalEntries.reference, orderId));
        }
        
        expect(entries.length).toBeGreaterThan(0);
        
        const lines = await db.select()
            .from(journalLines)
            .where(inArray(journalLines.journalEntryId, entries.map((entry) => entry.id)));
        
        // Lines should include:
        // - Debit Cash: 228
        // - Credit Revenue (Takeaway): 200
        // - Credit Tax: 28
        
        const cashLine = lines.find(l => l.debit === 228);
        const revenueLine = lines.find(l => l.credit === 200);
        const taxLine = lines.find(l => l.credit === 28);

        expect(cashLine).toBeDefined();
        expect(revenueLine).toBeDefined();
        expect(taxLine).toBeDefined();
    });
});
