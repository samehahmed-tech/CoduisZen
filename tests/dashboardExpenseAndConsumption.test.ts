import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { branches, inventoryItems, inventoryStock, stockMovements, userSessions, users, warehouses } from '../src/db/schema';
import { COASeedService } from '../server/services/coaSeedService';
import { GLService } from '../server/services/glService';

let app: any;
let db: typeof import('../server/db')['db'];

const createAuthContext = async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const branchId = `test-dashboard-expense-${suffix}`;
    const userId = `test-dashboard-user-${suffix}`;
    const sessionId = `test-dashboard-session-${suffix}`;
    const tokenId = `test-dashboard-token-${suffix}`;

    await db.insert(branches).values({ id: branchId, name: 'Dashboard Expense Branch', isActive: true });
    await db.insert(users).values({
        id: userId,
        name: 'Dashboard Test User',
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

    const token = jwt.sign({
        sub: userId,
        id: userId,
        role: 'SUPER_ADMIN',
        permissions: ['*'],
        branchId,
        allowedBranches: [branchId],
        sid: sessionId,
        jti: tokenId,
    }, process.env.JWT_SECRET || 'test-jwt-secret-dashboard-expenses');

    return { branchId, userId, auth: `Bearer ${token}`, suffix };
};

describe('dashboard expenses and recipe consumption regressions', () => {
    beforeEach(async () => {
        if (!app || !db) {
            const appModule = await import('../server/app');
            app = appModule.default;
            const dbModule = await import('../server/db');
            db = dbModule.db;
            await COASeedService.seed();
        }
    });

    it('keeps stock COGS out of operating expenses on dashboard and expense report', async () => {
        const { branchId, userId, auth, suffix } = await createAuthContext();
        await GLService.postJournalEntry({
            reference: `COGS-${suffix}`,
            referenceType: 'COGS',
            description: 'Recipe stock consumption',
            branchId,
            createdBy: userId,
            status: 'POSTED',
            lines: [
                { accountCode: '5110', debit: 100, credit: 0 },
                { accountCode: '1210', debit: 0, credit: 100 },
            ],
        });
        await GLService.postJournalEntry({
            reference: `EXPENSE-${suffix}`,
            referenceType: 'EXPENSE',
            description: 'Actual operating expense',
            branchId,
            createdBy: userId,
            status: 'POSTED',
            lines: [
                { accountCode: '6200', debit: 25, credit: 0 },
                { accountCode: '1110', debit: 0, credit: 25 },
            ],
        });

        const today = new Date().toISOString().slice(0, 10);
        const dashboard = await request(app)
            .get(`/api/reports/dashboard-kpis?branchId=${branchId}&startDate=${today}&endDate=${today}&scope=DAILY`)
            .set('Authorization', auth);
        const expenses = await request(app)
            .get(`/api/reports/expenses?branchId=${branchId}&startDate=${today}&endDate=${today}`)
            .set('Authorization', auth);

        expect(dashboard.status).toBe(200);
        expect(dashboard.body.totals.expenses).toBe(25);
        expect(dashboard.body.totals.cogs).toBe(100);
        expect(expenses.status, JSON.stringify(expenses.body)).toBe(200);
        expect(expenses.body.rows).toHaveLength(1);
        expect(expenses.body.rows[0].referenceType).toBe('EXPENSE');
    });

    it('returns current stock across the branch even when an old deduction points at another warehouse', async () => {
        const { branchId, userId, auth, suffix } = await createAuthContext();
        const warehouseId = `test-consumption-wh-${suffix}`;
        const oldMovementWarehouseId = `test-consumption-old-wh-${suffix}`;
        const itemId = `test-consumption-item-${suffix}`;
        await db.insert(warehouses).values({ id: warehouseId, name: 'Main Stock', branchId, type: 'MAIN', isActive: true });
        await db.insert(warehouses).values({ id: oldMovementWarehouseId, name: 'Old POS Stock', branchId, type: 'POINT_OF_SALE', isActive: true });
        await db.insert(inventoryItems).values({ id: itemId, name: 'Flour', unit: 'KG', costPrice: 30, isActive: true });
        await db.insert(inventoryStock).values({ itemId, warehouseId, quantity: 9.5 });
        await db.insert(stockMovements).values({
            itemId,
            fromWarehouseId: oldMovementWarehouseId,
            quantity: 0.5,
            type: 'SALE_CONSUMPTION',
            reason: 'Recipe deduction',
            performedBy: userId,
            referenceId: `ORDER-${suffix}`,
            createdAt: new Date(),
        });

        const today = new Date().toISOString().slice(0, 10);
        const response = await request(app)
            .get(`/api/inventory/stock/recipe-consumption?branchId=${branchId}&startDate=${today}&endDate=${today}`)
            .set('Authorization', auth);

        expect(response.status).toBe(200);
        const row = response.body.find((entry: any) => entry.itemId === itemId);
        expect(row).toBeDefined();
        expect(row.totalQuantity).toBe(0.5);
        expect(row.currentStock).toBe(9.5);
    });
});
