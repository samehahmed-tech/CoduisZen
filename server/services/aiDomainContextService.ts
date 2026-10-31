import { desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db';
import { customers, inventoryItems, menuCategories, menuItems, orderItems, orders } from '../../src/db/schema';

type ContextUser = { role?: string; branchId?: string; allowedBranches?: string[] };

export const buildAiDomainContext = async (input: { user?: ContextUser; branchId?: string }) => {
    const branchId = String(input.branchId || input.user?.branchId || '').trim();
    if (!branchId) return null;

    const orderRows = await db.select({ id: orders.id, total: orders.total, status: orders.status, createdAt: orders.createdAt, source: orders.source, customerId: orders.customerId })
        .top(250).from(orders).where(eq(orders.branchId, branchId)).orderBy(desc(orders.createdAt));
    const orderIds = orderRows.map((row) => row.id);
    const orderItemRows = orderIds.length
        ? await db.select({ orderId: orderItems.orderId, menuItemId: orderItems.menuItemId, name: orderItems.name, nameAr: orderItems.nameAr, price: orderItems.price, quantity: orderItems.quantity, sizeId: orderItems.sizeId, modifiers: orderItems.modifiers })
            .from(orderItems).where(inArray(orderItems.orderId, orderIds))
        : [];
    const itemsByOrder = new Map<string, any[]>();
    for (const item of orderItemRows) {
        const list = itemsByOrder.get(String(item.orderId)) || [];
        list.push(item);
        itemsByOrder.set(String(item.orderId), list);
    }
    const ordersWithItems = orderRows.map((row) => ({ ...row, items: itemsByOrder.get(String(row.id)) || [] }));
    const customerIds = [...new Set(orderRows.map((row) => row.customerId).filter(Boolean))] as string[];
    const [customerRows, categoryRows, menuRows, inventoryRows] = await Promise.all([
        customerIds.length
            ? db.select({ id: customers.id, name: customers.name, visits: customers.visits, totalSpent: customers.totalSpent, loyaltyTier: customers.loyaltyTier })
                .top(100).from(customers).where(inArray(customers.id, customerIds))
            : Promise.resolve([]),
        db.select({ id: menuCategories.id, name: menuCategories.name, nameAr: menuCategories.nameAr, isActive: menuCategories.isActive })
            .top(100).from(menuCategories).where(isNull(menuCategories.deletedAt)),
        db.select({ id: menuItems.id, name: menuItems.name, nameAr: menuItems.nameAr, categoryId: menuItems.categoryId, price: menuItems.price, cost: menuItems.cost, isAvailable: menuItems.isAvailable, status: menuItems.status })
            .top(300).from(menuItems).where(isNull(menuItems.deletedAt)),
        db.select({ id: inventoryItems.id, name: inventoryItems.name, threshold: inventoryItems.threshold, costPrice: inventoryItems.costPrice, isActive: inventoryItems.isActive })
            .top(300).from(inventoryItems).where(isNull(inventoryItems.deletedAt)),
    ]);

    const totalRevenue = orderRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    return {
        provenance: {
            source: 'server-db',
            branchId,
            generatedAt: new Date().toISOString(),
            dataFreshnessHours: 0,
            note: 'Orders are branch-scoped. Menu and inventory definitions are shared master data; quantities require the inventory report for warehouse scope.',
        },
        orders: {
            rows: ordersWithItems,
            count: orderRows.length,
            total: totalRevenue,
            open: orderRows.filter((row) => !['COMPLETED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(String(row.status || '').toUpperCase())).length,
        },
        customers: {
            rows: customerRows,
            branchLinkedCount: customerIds.length,
        },
        categories: categoryRows,
        menuItems: menuRows,
        inventory: inventoryRows,
    };
};
