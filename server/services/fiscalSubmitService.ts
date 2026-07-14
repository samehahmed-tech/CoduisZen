import { db } from '../db';
import { fiscalLogs, menuItems, orderItems, orders } from '../../src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { fiscalService } from './fiscalService';
import { etaService } from './etaService';

const SUBMITTED_STATES = new Set(['SUBMITTED', 'PENDING']);

export const submitOrderToFiscal = async (orderId: string, options?: { force?: boolean, isReturn?: boolean, originalReceiptNumber?: string, branchId?: string }) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (options?.branchId && order.branchId !== options.branchId) throw new Error('FORBIDDEN_BRANCH_ACCESS');

    const existing = await db.select()
        .from(fiscalLogs)
        .where(eq(fiscalLogs.orderId, orderId))
        .orderBy(desc(fiscalLogs.createdAt))
        .offset(0).fetch(1);

    if (!options?.force && existing[0] && SUBMITTED_STATES.has(existing[0].status)) {
        return { skipped: true, reason: 'ALREADY_SUBMITTED' };
    }

    const itemRows = await db.select({
        item: orderItems,
        barcode: menuItems.barcode,
        sku: menuItems.sku,
    }).from(orderItems)
        .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
        .where(eq(orderItems.orderId, orderId));
    const items = itemRows.map(row => ({
        ...row.item,
        fiscalCode: row.barcode || row.sku || undefined,
    }));

    let payload: any;
    try {
        payload = fiscalService.prepareETAReceipt({
            id: order.id,
            type: order.type as any,
            branchId: order.branchId,
            tableId: order.tableId || undefined,
            customerId: order.customerId || undefined,
            customerName: order.customerName || undefined,
            customerPhone: order.customerPhone || undefined,
            deliveryAddress: order.deliveryAddress || undefined,
            isCallCenterOrder: order.isCallCenterOrder || undefined,
            items: [],
            status: order.status as any,
            syncStatus: order.syncStatus as any,
            subtotal: order.subtotal,
            tax: order.tax,
            total: order.total,
            discount: order.discount || undefined,
            freeDelivery: order.freeDelivery || undefined,
            isUrgent: order.isUrgent || undefined,
            createdAt: order.createdAt || new Date(),
            paymentMethod: order.paymentMethod as any,
            payments: [],
            notes: order.notes || undefined,
            kitchenNotes: order.kitchenNotes || undefined,
            driverId: order.driverId || undefined,
        } as any, items as any, { isReturn: options?.isReturn, originalReceiptNumber: options?.originalReceiptNumber });
    } catch (error: any) {
        await db.insert(fiscalLogs).values({
            orderId: order.id,
            branchId: order.branchId,
            status: 'FAILED',
            attempt: 1,
            lastError: error?.message || 'Payload preparation failed',
            payload: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        throw error;
    }

    const log = await db.insert(fiscalLogs).output().values({
        orderId: order.id,
        branchId: order.branchId,
        status: 'PENDING',
        attempt: 0,
        payload,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    try {
        const response = await etaService.submitWithRetry(payload, order.id, order.branchId);
        await db.update(fiscalLogs)
            .set({
                status: 'SUBMITTED',
                response,
                attempt: (log[0]?.attempt || 0) + 1,
                updatedAt: new Date()
            })
            .where(eq(fiscalLogs.id, log[0].id));

        return { submitted: true, response };
    } catch (error: any) {
        await db.update(fiscalLogs)
            .set({
                status: 'FAILED',
                lastError: error.message,
                attempt: (log[0]?.attempt || 0) + 1,
                updatedAt: new Date()
            })
            .where(eq(fiscalLogs.id, log[0].id));

        throw error;
    }
};
