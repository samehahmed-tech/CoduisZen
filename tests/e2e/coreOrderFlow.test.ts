import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
let app: any;
let db: typeof import('../../server/db')['db'];
import { branches, costCenters, customers, fiscalPeriods, inventoryItems, inventoryStock, kdsTickets, menuCategories, menuItems, recipeIngredients, recipes, shifts, users, warehouses } from '../../src/db/schema';
import { COASeedService } from '../../server/services/coaSeedService';

const FIXTURES = {
    branchId: 'test-branch-e2e',
    userId: 'test-user-e2e',
    warehouseId: 'test-warehouse-e2e',
    shiftId: 'test-shift-e2e',
    categoryId: 'test-category-e2e',
    itemId: 'test-item-e2e',
    costCenterId: 'test-cost-center-e2e',
    fiscalPeriodId: 'test-fiscal-period-e2e',
    email: 'e2e-admin@restoflow.local',
    password: 'Test123!',
};

describe('Core Order Flow E2E', () => {
    let testUserToken = '';

    beforeAll(async () => {
        await COASeedService.seed();
    });

    beforeEach(async () => {
        if (!app || !db) {
            const appModule = await import('../../server/app');
            app = appModule.default;
            const dbModule = await import('../../server/db');
            db = dbModule.db;
        }

        await db.insert(branches).values({
            id: FIXTURES.branchId,
            name: 'E2E Branch',
            address: 'Cairo',
            isActive: true,
        }).onConflictDoNothing();

        await db.insert(costCenters).values({
            id: FIXTURES.costCenterId,
            branchId: FIXTURES.branchId,
            code: 'CC-E2E-01',
            name: 'E2E Cost Center',
            isActive: true,
        }).onConflictDoNothing();

        await db.insert(fiscalPeriods).values({
            id: FIXTURES.fiscalPeriodId,
            name: 'E2E Fiscal Period',
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T23:59:59.999Z'),
            status: 'OPEN',
        }).onConflictDoNothing();

        await db.insert(users).values({
            id: FIXTURES.userId,
            name: 'E2E Admin',
            email: FIXTURES.email,
            role: 'SUPER_ADMIN',
            permissions: ['*'],
            assignedBranchId: FIXTURES.branchId,
            isActive: true,
            mfaEnabled: false,
        }).onConflictDoNothing();

        await db.insert(warehouses).values({
            id: FIXTURES.warehouseId,
            name: 'E2E Kitchen Warehouse',
            branchId: FIXTURES.branchId,
            type: 'KITCHEN',
            isActive: true,
        }).onConflictDoNothing();

        await db.insert(shifts).values({
            id: FIXTURES.shiftId,
            branchId: FIXTURES.branchId,
            userId: FIXTURES.userId,
            openingBalance: 0,
            status: 'OPEN',
        }).onConflictDoNothing();

        await db.insert(menuCategories).values({
            id: FIXTURES.categoryId,
            name: 'E2E Category',
            isActive: true,
            menuIds: ['menu-1'],
            printerIds: [],
            targetOrderTypes: ['TAKEAWAY'],
        }).onConflictDoNothing();

        await db.insert(menuItems).values({
            id: FIXTURES.itemId,
            categoryId: FIXTURES.categoryId,
            name: 'E2E Item',
            price: 150,
            cost: 50,
            isAvailable: true,
            printerIds: [],
            modifierGroups: [],
        }).onConflictDoNothing();

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({
                email: FIXTURES.email,
                password: FIXTURES.password,
            });

        expect(loginRes.status).toBe(200);
        expect(loginRes.body.token).toBeTruthy();

        testUserToken = loginRes.body.token;
    });

    it('Environment Health Check', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('creates, progresses, and lists a takeaway order end-to-end', async () => {
        const orderPayload = {
            type: 'TAKEAWAY',
            branchId: FIXTURES.branchId,
            customerName: 'E2E Test User',
            items: [
                {
                    menu_item_id: FIXTURES.itemId,
                    name: 'E2E Item',
                    quantity: 2,
                    price: 150,
                    notes: 'Extra spicy',
                },
            ],
            subtotal: 300,
            tax: 42,
            total: 342,
        };

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send(orderPayload);

        if (res.status !== 201) {
            console.error('Failed to create order. Response:', res.body);
        }

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.status).toBe('PENDING');
        const activeOrderId = res.body.id as string;

        let statusRes = await request(app)
            .put(`/api/orders/${activeOrderId}/status`)
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ status: 'PREPARING' });

        expect(statusRes.status).toBe(200);
        expect(statusRes.body.status).toBe('PREPARING');

        statusRes = await request(app)
            .put(`/api/orders/${activeOrderId}/status`)
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ status: 'READY' });

        expect(statusRes.status).toBe(200);
        expect(statusRes.body.status).toBe('READY');

        statusRes = await request(app)
            .put(`/api/orders/${activeOrderId}/status`)
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ status: 'DELIVERED' });

        expect(statusRes.status).toBe(200);
        expect(statusRes.body.status).toBe('DELIVERED');

        const historyRes = await request(app)
            .get(`/api/orders?branch_id=${FIXTURES.branchId}`)
            .set('Authorization', `Bearer ${testUserToken}`);

        expect(historyRes.status).toBe(200);
        const foundOrder = historyRes.body.find((order: any) => order.id === activeOrderId);
        expect(foundOrder).toBeDefined();
        expect(foundOrder.status).toBe('DELIVERED');
    });

    it('filters call-center order desk queries on the server by source, branch, and day range', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const callCenterOrderId = `test-call-center-order-${Date.now()}`;
        const posOrderId = `test-pos-order-${Date.now()}`;

        const basePayload = {
            type: 'DELIVERY',
            branchId: FIXTURES.branchId,
            customerName: 'Order Desk User',
            customerPhone: '01000000000',
            deliveryAddress: 'Order Desk Test Address',
            items: [{ menu_item_id: FIXTURES.itemId, name: 'E2E Item', quantity: 1, price: 150 }],
            subtotal: 150,
            tax: 21,
            total: 171,
        };

        const callCenterRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                ...basePayload,
                id: callCenterOrderId,
                source: 'call_center',
                isCallCenterOrder: true,
            });
        expect(callCenterRes.status).toBe(201);

        const posRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                ...basePayload,
                id: posOrderId,
                source: 'pos',
                isCallCenterOrder: false,
            });
        expect(posRes.status).toBe(201);

        const deskRes = await request(app)
            .get(`/api/orders?branch_id=${FIXTURES.branchId}&from_date=${today}&to_date=${today}&source=call_center&is_call_center_order=true&limit=500`)
            .set('Authorization', `Bearer ${testUserToken}`);

        expect(deskRes.status).toBe(200);
        expect(deskRes.body.some((order: any) => order.id === callCenterOrderId)).toBe(true);
        expect(deskRes.body.some((order: any) => order.id === posOrderId)).toBe(false);
        expect(deskRes.body.every((order: any) => order.branchId === FIXTURES.branchId)).toBe(true);
        expect(deskRes.body.every((order: any) => order.source === 'call_center' && order.isCallCenterOrder === true)).toBe(true);
    });

    it('creates a referenced call-center customer before inserting the order', async () => {
        const customerId = `test-customer-${Date.now()}`;
        const orderId = `test-order-new-customer-${Date.now()}`;
        const phone = `010${String(Date.now()).slice(-8)}`;

        const createRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                id: orderId,
                type: 'DELIVERY',
                source: 'call_center',
                isCallCenterOrder: true,
                branchId: FIXTURES.branchId,
                customerId,
                customerName: 'New Referenced Customer',
                customerPhone: phone,
                deliveryAddress: 'Customer FK Test Address',
                items: [{ menu_item_id: FIXTURES.itemId, name: 'E2E Item', quantity: 1, price: 150 }],
                subtotal: 150,
                tax: 21,
                total: 171,
            });

        expect(createRes.status).toBe(201);
        expect(createRes.body.customerId).toBe(customerId);

        const [savedCustomer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
        expect(savedCustomer).toBeDefined();
        expect(savedCustomer.phone).toBe(phone);
    });

    it('saves call-center customers into CRM and reuses existing phone records', async () => {
        const phone = `011${String(Date.now()).slice(-8)}`;
        const firstRes = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                id: `crm-customer-${Date.now()}`,
                name: 'CRM Call Center Customer',
                phone,
                address: 'CRM Address',
                source: 'call_center',
            });

        expect(firstRes.status).toBe(201);
        expect(firstRes.body.phone).toBe(phone);
        expect(firstRes.body.source).toBe('call_center');

        const duplicateRes = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                id: `crm-customer-duplicate-${Date.now()}`,
                name: 'Duplicate CRM Customer',
                phone,
                address: 'Duplicate Address',
                source: 'call_center',
            });

        expect(duplicateRes.status).toBe(201);
        expect(duplicateRes.body.id).toBe(firstRes.body.id);

        const rows = await db.select().from(customers).where(eq(customers.phone, phone));
        expect(rows).toHaveLength(1);
    });

    it('auto-registers order customers in CRM by phone even without a customer id', async () => {
        const phone = `012${String(Date.now()).slice(-8)}`;
        const orderId = `test-auto-crm-${Date.now()}`;

        const createRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                id: orderId,
                type: 'DELIVERY',
                source: 'pos',
                branchId: FIXTURES.branchId,
                customerName: 'Auto CRM Customer',
                customerPhone: phone,
                deliveryAddress: 'Auto CRM Address',
                items: [{ menu_item_id: FIXTURES.itemId, name: 'E2E Item', quantity: 1, price: 150 }],
                subtotal: 150,
                tax: 21,
                total: 171,
            });

        expect(createRes.status).toBe(201);
        expect(createRes.body.customerId).toBeTruthy();

        const [savedCustomer] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
        expect(savedCustomer).toBeDefined();
        expect(savedCustomer.id).toBe(createRes.body.customerId);
        expect(savedCustomer.name).toBe('Auto CRM Customer');
        expect(Number(savedCustomer.visits || 0)).toBeGreaterThanOrEqual(1);
        expect(Number(savedCustomer.totalSpent || 0)).toBeGreaterThanOrEqual(171);
    });

    it('loads and updates full CRM customer data from an order', async () => {
        const phone = `015${String(Date.now()).slice(-8)}`;
        const createRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                id: `test-order-customer-edit-${Date.now()}`,
                type: 'DELIVERY',
                branchId: FIXTURES.branchId,
                customerName: 'Editable Customer',
                customerPhone: phone,
                deliveryAddress: 'Old Address',
                items: [{ menu_item_id: FIXTURES.itemId, name: 'E2E Item', quantity: 1, price: 150 }],
                subtotal: 150,
                tax: 21,
                total: 171,
            });

        expect(createRes.status).toBe(201);

        const updateRes = await request(app)
            .put(`/api/orders/${createRes.body.id}/customer`)
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                customerId: createRes.body.customerId,
                name: 'Editable Customer Updated',
                phone,
                email: 'customer@example.com',
                address: 'New Address',
                area: 'Nasr City',
                building: 'B12',
                floor: '3',
                apartment: '9',
                landmark: 'Near mall',
                notes: 'VIP preference',
            });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.order.customerName).toBe('Editable Customer Updated');
        expect(updateRes.body.order.deliveryAddress).toBe('New Address');
        expect(updateRes.body.customer.email).toBe('customer@example.com');

        const profileRes = await request(app)
            .get(`/api/customers/${createRes.body.customerId}`)
            .set('Authorization', `Bearer ${testUserToken}`);

        expect(profileRes.status).toBe(200);
        expect(profileRes.body.name).toBe('Editable Customer Updated');
        expect(profileRes.body.area).toBe('Nasr City');
        expect(profileRes.body.addresses.length).toBeGreaterThanOrEqual(1);
    });

    it('keeps paid branch revenue visible before KDS completion and scopes KDS by branch', async () => {
        const otherBranchId = 'test-branch-e2e-other';
        await db.insert(branches).values({
            id: otherBranchId,
            name: 'Other E2E Branch',
            address: 'Giza',
            isActive: true,
        }).onConflictDoNothing();

        const orderId = `test-paid-kds-${Date.now()}`;
        const createRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                id: orderId,
                type: 'TAKEAWAY',
                branchId: FIXTURES.branchId,
                customerName: 'Paid Dashboard User',
                items: [
                    {
                        menu_item_id: FIXTURES.itemId,
                        name: 'E2E Item',
                        quantity: 1,
                        price: 150,
                    },
                ],
                subtotal: 150,
                tax: 21,
                total: 171,
                payments: [{ method: 'CASH', amount: 171 }],
            });

        expect(createRes.status).toBe(201);
        expect(createRes.body.branchId || createRes.body.branch_id).toBe(FIXTURES.branchId);
        expect(createRes.body.status).toBe('PENDING');

        for (let attempt = 0; attempt < 10; attempt += 1) {
            const tickets = await db.select().from(kdsTickets).where(eq(kdsTickets.orderId, orderId));
            if (tickets.length > 0) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const today = new Date().toISOString().slice(0, 10);
        const dashboardRes = await request(app)
            .get(`/api/reports/dashboard-kpis?branchId=${FIXTURES.branchId}&startDate=${today}&endDate=${today}&scope=DAILY`)
            .set('Authorization', `Bearer ${testUserToken}`);

        expect(dashboardRes.status).toBe(200);
        expect(Number(dashboardRes.body.totals.revenue)).toBeGreaterThanOrEqual(171);
        expect(Number(dashboardRes.body.totals.paidRevenue)).toBeGreaterThanOrEqual(171);

        const branchTicketsRes = await request(app)
            .get(`/api/kds?branchId=${FIXTURES.branchId}`)
            .set('Authorization', `Bearer ${testUserToken}`);

        expect(branchTicketsRes.status).toBe(200);
        expect(branchTicketsRes.body.some((ticket: any) => ticket.orderId === orderId)).toBe(true);
        expect(branchTicketsRes.body.every((ticket: any) => ticket.branchId === FIXTURES.branchId)).toBe(true);

        const otherBranchTicketsRes = await request(app)
            .get(`/api/kds?branchId=${otherBranchId}`)
            .set('Authorization', `Bearer ${testUserToken}`);

        expect(otherBranchTicketsRes.status).toBe(200);
        expect(otherBranchTicketsRes.body.some((ticket: any) => ticket.orderId === orderId)).toBe(false);
    });

    it('keeps open shifts scoped per branch until an explicit close', async () => {
        const firstOpenRes = await request(app)
            .post('/api/shifts/open')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                id: `test-duplicate-shift-${Date.now()}`,
                branchId: FIXTURES.branchId,
                userId: FIXTURES.userId,
                openingBalance: 25,
            });

        expect(firstOpenRes.status).toBe(200);
        expect(firstOpenRes.body.id).toBe(FIXTURES.shiftId);
        expect(firstOpenRes.body.branchId).toBe(FIXTURES.branchId);
        expect(firstOpenRes.body.status).toBe('OPEN');

        const secondBranchId = `test-shift-branch-${Date.now()}`;
        const secondShiftId = `test-shift-${Date.now()}`;
        await db.insert(branches).values({
            id: secondBranchId,
            name: 'Second Shift Branch',
            address: 'Alex',
            isActive: true,
        }).onConflictDoNothing();

        const secondOpenRes = await request(app)
            .post('/api/shifts/open')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                id: secondShiftId,
                branchId: secondBranchId,
                userId: FIXTURES.userId,
                openingBalance: 50,
            });

        expect(secondOpenRes.status).toBe(201);
        expect(secondOpenRes.body.id).toBe(secondShiftId);
        expect(secondOpenRes.body.branchId).toBe(secondBranchId);
        expect(secondOpenRes.body.status).toBe('OPEN');

        const activeFixtureShiftRes = await request(app)
            .get(`/api/shifts/active?branchId=${FIXTURES.branchId}`)
            .set('Authorization', `Bearer ${testUserToken}`);

        expect(activeFixtureShiftRes.status).toBe(200);
        expect(activeFixtureShiftRes.body.id).toBe(FIXTURES.shiftId);

        const activeSecondShiftRes = await request(app)
            .get(`/api/shifts/active?branchId=${secondBranchId}`)
            .set('Authorization', `Bearer ${testUserToken}`);

        expect(activeSecondShiftRes.status).toBe(200);
        expect(activeSecondShiftRes.body.id).toBe(secondShiftId);

        const forbiddenCloseRes = await request(app)
            .put(`/api/shifts/${secondShiftId}/close`)
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ branchId: FIXTURES.branchId, actualBalance: 50 });

        expect(forbiddenCloseRes.status).toBe(403);

        const stillOpenRes = await request(app)
            .get(`/api/shifts/active?branchId=${secondBranchId}`)
            .set('Authorization', `Bearer ${testUserToken}`);

        expect(stillOpenRes.status).toBe(200);
        expect(stillOpenRes.body.id).toBe(secondShiftId);

        const closeRes = await request(app)
            .put(`/api/shifts/${secondShiftId}/close`)
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({ branchId: secondBranchId, actualBalance: 50 });

        expect(closeRes.status).toBe(200);
        expect(closeRes.body.status).toBe('CLOSED');
    });

    it('rejects orders that try to use a shift from another branch', async () => {
        const otherBranchId = `test-order-shift-branch-${Date.now()}`;
        await db.insert(branches).values({
            id: otherBranchId,
            name: 'Order Shift Branch',
            address: 'Mansoura',
            isActive: true,
        }).onConflictDoNothing();

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                type: 'TAKEAWAY',
                branchId: otherBranchId,
                shiftId: FIXTURES.shiftId,
                customerName: 'Wrong Shift User',
                items: [
                    {
                        menu_item_id: FIXTURES.itemId,
                        name: 'E2E Item',
                        quantity: 1,
                        price: 150,
                    },
                ],
                subtotal: 150,
                tax: 21,
                total: 171,
            });

        expect(res.status).toBe(400);
        expect(res.body.code || res.body.error).toBe('INVALID_SHIFT_BRANCH');
    });

    it('preserves an offline-created order when it syncs after its shift was closed', async () => {
        const now = Date.now();
        const offlineShiftId = `test-offline-shift-${now}`;
        const openedAt = new Date(now - 60 * 60 * 1000);
        const orderCreatedAt = new Date(now - 30 * 60 * 1000);
        const closedAt = new Date(now - 5 * 60 * 1000);

        await db.insert(shifts).values({
            id: offlineShiftId,
            branchId: FIXTURES.branchId,
            userId: FIXTURES.userId,
            openingTime: openedAt,
            closingTime: closedAt,
            openingBalance: 0,
            expectedBalance: 0,
            actualBalance: 0,
            status: 'CLOSED',
        }).onConflictDoNothing();

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                type: 'TAKEAWAY',
                branchId: FIXTURES.branchId,
                shiftId: offlineShiftId,
                createdAt: orderCreatedAt.toISOString(),
                customerName: 'Offline Sync User',
                items: [
                    {
                        menu_item_id: FIXTURES.itemId,
                        name: 'E2E Item',
                        quantity: 1,
                        price: 150,
                    },
                ],
                subtotal: 150,
                tax: 21,
                total: 171,
                payments: [{ method: 'CASH', amount: 171 }],
            });

        expect(res.status).toBe(201);
        expect(res.body.shiftId || res.body.shift_id).toBe(offlineShiftId);
        expect(new Date(res.body.createdAt || res.body.created_at).getTime()).toBe(orderCreatedAt.getTime());
    });

    it('keeps day-close revenue and payments scoped to the selected branch', async () => {
        const ownBranchId = `test-dayclose-own-branch-${Date.now()}`;
        const ownShiftId = `test-dayclose-own-shift-${Date.now()}`;
        const otherBranchId = `test-dayclose-other-${Date.now()}`;
        const otherShiftId = `test-dayclose-shift-${Date.now()}`;
        const businessDate = new Date().toISOString().slice(0, 10);

        await db.insert(branches).values({
            id: ownBranchId,
            name: 'Own Day Close Branch',
            address: 'Cairo',
            businessDate,
            isActive: true,
        }).onConflictDoNothing();

        await db.insert(branches).values({
            id: otherBranchId,
            name: 'Other Day Close Branch',
            address: 'Tanta',
            businessDate,
            isActive: true,
        }).onConflictDoNothing();

        await db.insert(shifts).values({
            id: ownShiftId,
            branchId: ownBranchId,
            userId: FIXTURES.userId,
            openingBalance: 0,
            status: 'OPEN',
        }).onConflictDoNothing();

        await db.insert(shifts).values({
            id: otherShiftId,
            branchId: otherBranchId,
            userId: FIXTURES.userId,
            openingBalance: 0,
            status: 'OPEN',
        }).onConflictDoNothing();

        const ownOrderId = `test-dayclose-own-${Date.now()}`;
        const otherOrderId = `test-dayclose-other-order-${Date.now()}`;

        const ownOrderRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                id: ownOrderId,
                type: 'TAKEAWAY',
                branchId: ownBranchId,
                customerName: 'Day Close Own',
                items: [{ menu_item_id: FIXTURES.itemId, name: 'E2E Item', quantity: 1, price: 150 }],
                subtotal: 150,
                tax: 21,
                total: 171,
                payments: [{ method: 'CASH', amount: 171 }],
            });

        expect(ownOrderRes.status).toBe(201);

        const otherOrderRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                id: otherOrderId,
                type: 'TAKEAWAY',
                branchId: otherBranchId,
                customerName: 'Day Close Other',
                items: [{ menu_item_id: FIXTURES.itemId, name: 'E2E Item', quantity: 1, price: 150 }],
                subtotal: 150,
                tax: 21,
                total: 171,
                payments: [{ method: 'CASH', amount: 171 }],
            });

        expect(otherOrderRes.status).toBe(201);

        const reportRes = await request(app)
            .get(`/api/day-close/${ownBranchId}/${businessDate}`)
            .set('Authorization', `Bearer ${testUserToken}`);

        expect(reportRes.status).toBe(200);
        expect(Number(reportRes.body.salesSummary.totalRevenue)).toBe(171);
        const cashRow = reportRes.body.paymentBreakdown.find((row: any) => row.method === 'CASH');
        expect(Number(cashRow?.total || 0)).toBe(171);
    });

    it('saves orders with insufficient recipe stock and returns an inventory warning', async () => {
        const now = Date.now();
        const lowStockItemId = `test-low-stock-item-${now}`;
        const lowStockMenuItemId = `test-low-stock-menu-${now}`;
        const lowStockRecipeId = `test-low-stock-recipe-${now}`;

        await db.insert(inventoryItems).values({
            id: lowStockItemId,
            name: 'Low Stock Ingredient',
            unit: 'kg',
            isActive: true,
        });

        await db.insert(menuItems).values({
            id: lowStockMenuItemId,
            categoryId: FIXTURES.categoryId,
            name: 'Low Stock Menu Item',
            price: 150,
            cost: 50,
            isAvailable: true,
            printerIds: [],
            modifierGroups: [],
        });

        await db.insert(recipes).values({
            id: lowStockRecipeId,
            menuItemId: lowStockMenuItemId,
            yield: 1,
        });

        await db.insert(recipeIngredients).values({
            recipeId: lowStockRecipeId,
            inventoryItemId: lowStockItemId,
            quantity: 1,
            unit: 'kg',
        });

        await db.insert(inventoryStock).values({
            itemId: lowStockItemId,
            warehouseId: FIXTURES.warehouseId,
            quantity: 0,
        });

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
                type: 'TAKEAWAY',
                branchId: FIXTURES.branchId,
                customerName: 'Low Stock Customer',
                items: [{ menu_item_id: lowStockMenuItemId, name: 'Low Stock Menu Item', quantity: 1, price: 150 }],
                subtotal: 150,
                tax: 21,
                total: 171,
                payments: [{ method: 'CASH', amount: 171 }],
            });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.warnings).toEqual(expect.arrayContaining([
            expect.objectContaining({
                code: 'INSUFFICIENT_INVENTORY',
                menuItemId: lowStockMenuItemId,
                warehouseId: FIXTURES.warehouseId,
            }),
        ]));
    });
});
