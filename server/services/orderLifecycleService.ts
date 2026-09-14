import { and, eq, sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { branches, dayCloseReports, drivers, kdsTickets, managerApprovals, orderItems, orderStatusHistory, orders, tables, warehouses } from '../../src/db/schema';
import { evaluateOrderStatusUpdate } from './orderStatusPolicy';
import { emitBranchEvent } from '../utils/socketEmit';
import { webhookService } from './webhookService';
import { analyticsService } from './analyticsService';
import { loyaltyService } from './loyaltyService';
import { submitOrderToFiscal } from './fiscalSubmitService';
import { sendWhatsAppText } from './whatsappService';
import { whatsappAutomationService } from './whatsappAutomationService';
import { getDateKeyInTimeZone } from '../utils/businessDate';
import logger from '../utils/logger';
import { reverseCogsForOrderEntry } from './financePostingService';

type LifecycleUser = {
    role?: string | null;
    branchId?: string | null;
    allowedBranches?: string[] | null;
    permissions?: string[] | null;
};

type TransitionInput = {
    orderId: string;
    nextStatus: string;
    notes?: string;
    changedBy?: string;
    user?: LifecycleUser;
    expectedUpdatedAt?: string;
    skipPolicy?: boolean;
    approvalId?: number;
    requireKitchenReady?: boolean;
};

const terminalStatuses = new Set(['DELIVERED', 'COMPLETED', 'CANCELLED']);
const kitchenReadyStatuses = new Set(['READY', 'SERVED', 'DELIVERED']);

const lifecycleError = (code: string, status: number) => {
    const error: any = new Error(code);
    error.code = code;
    error.status = status;
    return error;
};

const getStatusPatch = (nextStatus: string, now: Date, notes?: string) => {
    const patch: Record<string, any> = { status: nextStatus, updatedAt: now };
    if (nextStatus === 'DELIVERED') patch.actualDeliveryTime = now;
    if (nextStatus === 'COMPLETED') patch.completedAt = now;
    if (nextStatus === 'CANCELLED') {
        patch.cancelledAt = now;
        if (notes) patch.cancelReason = notes;
    }
    return patch;
};

const notifyCustomer = (order: any, status: string) => {
    if (!order.customerPhone || !['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(status)) return;

    let message = '';
    switch (status) {
        case 'PREPARING':
            message = `مرحبا ${order.customerName || ''}، جاري تحضير طلبك #${order.orderNumber}.`;
            break;
        case 'READY':
            message = `طلبك #${order.orderNumber} جاهز الآن!`;
            break;
        case 'OUT_FOR_DELIVERY':
            message = `طلبك #${order.orderNumber} في الطريق إليك مع المندوب.`;
            break;
        case 'DELIVERED':
            message = `نتمنى أن تكون قد استمتعت بطلبك #${order.orderNumber}. بالهناء والشفاء!`;
            break;
        case 'CANCELLED':
            message = `تم إلغاء طلبك #${order.orderNumber}. نعتذر عن أي إزعاج.`;
            break;
    }

    if (message) sendWhatsAppText({ to: order.customerPhone, text: message }).catch(() => {});
};

const runPostTransitionEffects = async (order: any, previousStatus: string, nextStatus: string) => {
    const branchId = order.branchId;
    if (branchId) {
        emitBranchEvent(branchId, 'order:status', {
            id: order.id,
            status: order.status,
            updatedAt: order.updatedAt,
            cancelledAt: order.cancelledAt,
            cancelReason: order.cancelReason,
        });
        if (nextStatus === 'CANCELLED') {
            emitBranchEvent(branchId, 'analytics:refresh', {
                reason: 'ORDER_CANCELLED',
                orderId: order.id,
                updatedAt: order.updatedAt,
            });
            // The sale never happened: reverse posted COGS so profit reports
            // don't carry phantom food cost. Best-effort, never blocks.
            reverseCogsForOrderEntry({
                orderId: order.id,
                branchId: order.branchId || undefined,
            }).catch(() => undefined);
            // Claw back loyalty points awarded for this order (best-effort).
            if ((order as any).customerId) {
                const { loyaltyService } = await import('./loyaltyService');
                loyaltyService.clawbackPoints(
                    String((order as any).customerId), Number((order as any).total || 0),
                    String(order.id), order.branchId || undefined,
                ).catch(() => undefined);
            }
        }

        if (terminalStatuses.has(nextStatus) && order.driverId) {
            emitBranchEvent(branchId, 'driver:status', { id: order.driverId, status: 'AVAILABLE' });
        }

        if (['COMPLETED', 'CANCELLED'].includes(nextStatus) && order.type === 'DINE_IN' && order.tableId) {
        emitBranchEvent(branchId, 'table:status', { id: order.tableId, status: 'AVAILABLE', currentOrderId: null, lockedByUserId: null });
        }
    }

    const webhookEvent = nextStatus === 'COMPLETED' || nextStatus === 'DELIVERED'
        ? 'order.completed' as const
        : nextStatus === 'CANCELLED'
            ? 'order.cancelled' as const
            : 'order.status_changed' as const;

    webhookService.dispatch(webhookEvent, {
        id: order.id,
        status: order.status,
        previousStatus,
        branchId: order.branchId,
        driverId: order.driverId,
        updatedAt: order.updatedAt,
    }, order.branchId || undefined).catch(() => {});

    whatsappAutomationService.onOrderStatusChanged(order, nextStatus).catch(() => {});

    if (['DELIVERED', 'COMPLETED'].includes(nextStatus)) {
        analyticsService.recordOrderImpact(order.id).catch(() => {});
        if (order.customerId) {
            loyaltyService.awardPoints(order.customerId, Number(order.total || 0), order.branchId || undefined).catch(() => {});
        }
        setTimeout(() => {
            submitOrderToFiscal(order.id).catch(() => {});
        }, 0);
    }
};

export const transitionOrderStatus = async ({
    orderId,
    nextStatus,
    notes,
    changedBy,
    user,
    expectedUpdatedAt,
    skipPolicy = false,
    approvalId,
    requireKitchenReady = false,
}: TransitionInput) => {
    const normalizedStatus = String(nextStatus || '').toUpperCase();
    const result = await db.transaction(async (tx) => {
        const [currentOrder] = await tx.select().top(1).from(orders).where(eq(orders.id, orderId));
        if (!currentOrder) {
            throw lifecycleError('ORDER_NOT_FOUND', 404);
        }

        if (String(currentOrder.status) === normalizedStatus) {
            return { order: currentOrder, previousStatus: String(currentOrder.status), changed: false };
        }

        const [branch] = await tx.select({
            businessDate: branches.businessDate,
            timezone: branches.timezone,
        }).top(1).from(branches).where(eq(branches.id, currentOrder.branchId));
        if (!branch) throw lifecycleError('INVALID_BRANCH_REFERENCE', 400);

        const timezone = branch.timezone || 'Africa/Cairo';
        const orderBusinessDate = currentOrder.businessDate
            || getDateKeyInTimeZone(currentOrder.createdAt || new Date(), timezone);
        const activeBusinessDate = branch.businessDate
            || getDateKeyInTimeZone(new Date(), timezone);
        const [closedDay] = await tx.select({ id: dayCloseReports.id })
            .top(1)
            .from(dayCloseReports)
            .where(and(
                eq(dayCloseReports.branchId, currentOrder.branchId),
                sql`${dayCloseReports.businessDate} = CAST(${orderBusinessDate} AS DATE)`,
            ));
        if (closedDay) throw lifecycleError('ORDER_BUSINESS_DAY_CLOSED', 409);
        if (orderBusinessDate !== activeBusinessDate) throw lifecycleError('ORDER_HISTORY_READ_ONLY', 409);

        if (requireKitchenReady) {
            const tickets = await tx.select({ status: kdsTickets.status })
                .from(kdsTickets)
                .where(eq(kdsTickets.orderId, orderId));
            if (tickets.length === 0) {
                throw lifecycleError('KITCHEN_TICKETS_MISSING', 409);
            }
            if (tickets.some(ticket => !kitchenReadyStatuses.has(String(ticket.status)))) {
                throw lifecycleError('KITCHEN_TICKETS_NOT_READY', 409);
            }
        }

        let managerApproved = false;
        if (normalizedStatus === 'CANCELLED' && approvalId) {
            const [approval] = await tx.select().top(1).from(managerApprovals).where(eq(managerApprovals.id, approvalId));
            const details = approval?.details as Record<string, unknown> | null;
            managerApproved = Boolean(
                approval
                && approval.actionType === 'VOID_ORDER'
                && approval.relatedId === orderId
                && approval.branchId === currentOrder.branchId
                && details?.status === 'APPROVED'
            );
            if (!managerApproved) {
                const error: any = new Error('MANAGER_APPROVAL_INVALID');
                error.status = 403;
                throw error;
            }
        }

        if (!skipPolicy) {
            const statusPolicy = evaluateOrderStatusUpdate({
                currentStatus: String(currentOrder.status || ''),
                nextStatus: normalizedStatus,
                notes,
                userRole: user?.role || undefined,
                userBranchId: user?.branchId || undefined,
                orderBranchId: currentOrder.branchId,
                allowedBranches: user?.allowedBranches,
                userPermissions: user?.permissions,
                orderType: currentOrder.type,
                orderDriverId: (currentOrder as any).driverId,
                deliverySource: (currentOrder as any).deliverySource,
                orderSource: (currentOrder as any).source,
                managerApproved,
            });
            if (!statusPolicy.ok) {
                const policyCode = statusPolicy.code || 'INVALID_STATUS_TRANSITION';
                const policyError: any = new Error(policyCode);
                policyError.status = policyCode === 'FORBIDDEN_BRANCH_SCOPE' || policyCode === 'STATUS_TRANSITION_FORBIDDEN' ? 403 : 400;
                throw policyError;
            }
        }

        if (expectedUpdatedAt && currentOrder.updatedAt) {
            const expected = new Date(expectedUpdatedAt).getTime();
            const actual = new Date(currentOrder.updatedAt).getTime();
            if (!Number.isNaN(expected) && expected !== actual) {
                const conflict: any = new Error('ORDER_VERSION_CONFLICT');
                conflict.status = 409;
                conflict.currentUpdatedAt = currentOrder.updatedAt;
                throw conflict;
            }
        }

        const now = new Date();
        const [updatedOrder] = await tx.update(orders)
            .set(getStatusPatch(normalizedStatus, now, notes))
            .output()
            .where(eq(orders.id, orderId));
        if (!updatedOrder) throw new Error('ORDER_NOT_FOUND');

        await tx.insert(orderStatusHistory).values({
            orderId,
            status: normalizedStatus,
            changedBy,
            notes,
            createdAt: now,
        });

        if (requireKitchenReady && normalizedStatus === 'DELIVERED') {
            await tx.update(kdsTickets)
                .set({ status: 'DELIVERED', updatedAt: now })
                .where(eq(kdsTickets.orderId, orderId));
        }

        // Cancelling from anywhere (POS, branch, call center) must also kill
        // the open kitchen tickets by consequence: the KDS view hides the
        // cancelled order, but open tickets would linger in day-close
        // readiness + branch reprints. Terminal tickets stay untouched.
        if (normalizedStatus === 'CANCELLED') {
            await tx.update(kdsTickets)
                .set({ status: 'CANCELLED', updatedAt: now })
                .where(and(
                    eq(kdsTickets.orderId, orderId),
                    sql`${kdsTickets.status} NOT IN ('DELIVERED', 'CANCELLED')`,
                ));
            // Stock return (warn-only, never blocks the cancel): credit back
            // what this order consumed, per line. Depleted batches are not
            // resurrected — counts reconcile via the daily stock count.
            try {
                const lines = await tx.select({
                    menuItemId: orderItems.menuItemId,
                    sizeId: orderItems.sizeId,
                    quantity: orderItems.quantity,
                    modifiers: orderItems.modifiers,
                }).from(orderItems).where(eq(orderItems.orderId, orderId));
                const branchWarehouses = await tx.select({ id: warehouses.id }).from(warehouses)
                    .where(eq(warehouses.branchId, currentOrder.branchId))
                    .orderBy(sql`CASE ${warehouses.type} WHEN 'KITCHEN' THEN 0 WHEN 'MAIN' THEN 1 WHEN 'POINT_OF_SALE' THEN 2 ELSE 3 END`);
                const fallbackWarehouseId = branchWarehouses[0]?.id;
                const { inventoryService } = await import('./inventoryService');
                for (const line of lines) {
                    if (!line.menuItemId || !(Number(line.quantity || 0) > 0)) continue;
                    await inventoryService.returnIngredients(
                        tx, String(line.menuItemId), Number(line.quantity),
                        orderId, changedBy || 'system',
                        {
                            sizeId: String((line as any).sizeId || '').trim() || undefined,
                            selectedModifiers: Array.isArray(line.modifiers) ? line.modifiers : [],
                            fallbackWarehouseId,
                            reason: 'Order cancelled',
                        },
                    ).catch(() => undefined);
                }
            } catch {
                // Return is best-effort; the cancel itself must succeed.
            }
        }

        if (terminalStatuses.has(normalizedStatus) && updatedOrder.driverId) {
            await tx.update(drivers)
                .set({ status: 'AVAILABLE' })
                .where(eq(drivers.id, updatedOrder.driverId));
        }

        if (['COMPLETED', 'CANCELLED'].includes(normalizedStatus) && updatedOrder.type === 'DINE_IN' && updatedOrder.tableId) {
            await tx.update(tables)
                .set({ status: 'AVAILABLE', currentOrderId: null, lockedByUserId: null, updatedAt: now })
                .where(eq(tables.id, updatedOrder.tableId));
        }

        return { order: updatedOrder, previousStatus: String(currentOrder.status), changed: true };
    });

    if (result.changed) {
        void runPostTransitionEffects(result.order, result.previousStatus, normalizedStatus);
    }

    return result.order;
};

export const markOrderKdsTicketsDelivered = async (orderId: string) => {
    const { kdsTickets } = await import('../../src/db/schema');
    await db.update(kdsTickets)
        .set({ status: 'DELIVERED', updatedAt: new Date() })
        .where(and(eq(kdsTickets.orderId, orderId)));
};

const sweepThrottleByBranch = new Map<string, number>();
const SWEEP_THROTTLE_MS = 30_000;

/**
 * Self-healing cleanup: any non-terminal order whose business day is already
 * closed gets finalized automatically (and its kitchen tickets delivered), so
 * the kitchen/handover screens can never stay stuck on stale tickets — even if
 * the day was closed before the finalize step existed or a close partially
 * failed. Safe to call from polling endpoints; throttled per branch.
 */
export const sweepStaleBranchOrders = async (branchId?: string | null): Promise<number> => {
    if (!branchId) return 0;
    const now = Date.now();
    const lastSweepAt = sweepThrottleByBranch.get(branchId) || 0;
    if (now - lastSweepAt < SWEEP_THROTTLE_MS) return 0;
    sweepThrottleByBranch.set(branchId, now);

    try {
        const [branch] = await db.select({ businessDate: branches.businessDate })
            .from(branches)
            .where(eq(branches.id, branchId))
            .top(1);
        const activeBusinessDate = branch?.businessDate;
        if (!activeBusinessDate) return 0;

        const nowDate = new Date();
        let sweptTotal = 0;

        // 1) Orphaned kitchen tickets: parent order is already terminal
        // (settled dine-in, cancelled, delivered...) but its ticket was never
        // closed — clear them so the kitchen screen cannot stay stuck.
        const orphanTicketResult = await pool.query(`
            SELECT kt.id
            FROM kds_tickets AS kt
            WHERE kt.branch_id = $1
              AND kt.status NOT IN ('DELIVERED', 'CANCELLED')
              AND EXISTS (
                    SELECT 1
                    FROM orders AS o
                    WHERE o.id = kt.order_id
                      AND o.branch_id = $1
                      AND o.status IN ('DELIVERED', 'COMPLETED', 'CANCELLED')
              )
        `, [branchId]);
        const orphanTicketRows = orphanTicketResult.rows.map((row: any) => ({ id: row.id }));
        if (orphanTicketRows.length > 0) {
            const ticketPlaceholders = orphanTicketRows.map((_, index) => `$${index + 2}`).join(', ');
            await pool.query(`
                UPDATE kds_tickets
                SET status = 'DELIVERED', updated_at = GETDATE()
                WHERE branch_id = $1 AND id IN (${ticketPlaceholders})
            `, [branchId, ...orphanTicketRows.map(row => row.id)]);
            emitBranchEvent(branchId, 'kds:update', { reason: 'ORPHAN_TICKETS_SWEPT' });
            sweptTotal += orphanTicketRows.length;
        }

        const staleOrdersResult = await pool.query(`
            SELECT id, type, table_id, total
            FROM orders
            WHERE branch_id = $1
              AND status IN ('PENDING', 'PREPARING', 'READY', 'SERVED', 'OUT_FOR_DELIVERY')
              AND (
                    (business_date IS NOT NULL AND business_date < CAST($2 AS DATE))
                    OR (business_date IS NULL AND created_at < CAST($2 AS DATE))
              )
        `, [branchId, activeBusinessDate]);
        const staleOrders = staleOrdersResult.rows.map((row: any) => ({
            id: row.id,
            type: row.type,
            tableId: row.table_id,
            total: Number(row.total || 0),
        }));

        for (const order of staleOrders) {
            // Never fabricate revenue: only paid-covered orders finalize as
            // delivered/completed; unpaid stale orders are cancelled for
            // manager review (history notes explain why).
            let paidCovered = false;
            try {
                const paidResult = await pool.query(
                    `SELECT COALESCE(SUM(amount), 0) AS paid FROM payments
                     WHERE order_id = $1 AND status = 'COMPLETED'`,
                    [order.id],
                );
                paidCovered = Number(paidResult.rows?.[0]?.paid || 0) + 0.01 >= order.total;
            } catch { paidCovered = false; }
            const nextStatus = !paidCovered
                ? 'CANCELLED'
                : (String(order.type || '').toUpperCase() === 'DINE_IN' ? 'COMPLETED' : 'DELIVERED');
            await db.update(orders)
                .set({
                    status: nextStatus,
                    ...(nextStatus === 'DELIVERED' ? { actualDeliveryTime: nowDate } : {}),
                    ...(nextStatus === 'COMPLETED' ? { completedAt: nowDate } : {}),
                    ...(nextStatus === 'CANCELLED' ? { cancelledAt: nowDate, cancelReason: 'Auto cancelled: unpaid when business day closed' } : {}),
                    updatedAt: nowDate,
                })
                .where(eq(orders.id, order.id));
            await db.insert(orderStatusHistory).values({
                orderId: order.id,
                status: nextStatus,
                notes: nextStatus === 'CANCELLED'
                    ? 'Auto cancelled: business day closed with no covering payment — review before re-fire'
                    : 'Auto cleared: business day already closed',
                createdAt: nowDate,
            });
            (order as any).sweptStatus = nextStatus;
            if ((nextStatus === 'COMPLETED' || nextStatus === 'CANCELLED') && order.tableId) {
                await db.update(tables)
                    .set({ status: 'AVAILABLE', currentOrderId: null, lockedByUserId: null, updatedAt: nowDate })
                    .where(eq(tables.id, order.tableId));
            }
            emitBranchEvent(branchId, 'order:status', { id: order.id, status: nextStatus });
        }

        if (staleOrders.length > 0) {
            const orderPlaceholders = staleOrders.map((_, index) => `$${index + 2}`).join(', ');
            await pool.query(`
                UPDATE kds_tickets
                SET status = 'DELIVERED', updated_at = GETDATE()
                WHERE branch_id = $1
                  AND order_id IN (${orderPlaceholders})
                  AND status NOT IN ('DELIVERED', 'CANCELLED')
            `, [branchId, ...staleOrders.map(order => order.id)]);
            // Tickets of auto-cancelled orders must read CANCELLED, not DELIVERED.
            const cancelledIds = staleOrders.filter(o => (o as any).sweptStatus === 'CANCELLED').map(o => o.id);
            if (cancelledIds.length > 0) {
                const cancelledPlaceholders = cancelledIds.map((_, index) => `$${index + 2}`).join(', ');
                await pool.query(`
                    UPDATE kds_tickets
                    SET status = 'CANCELLED', updated_at = GETDATE()
                    WHERE branch_id = $1
                      AND order_id IN (${cancelledPlaceholders})
                      AND status NOT IN ('DELIVERED', 'CANCELLED')
                `, [branchId, ...cancelledIds]);
            }
        }
        emitBranchEvent(branchId, 'kds:update', { reason: 'STALE_ORDERS_SWEPT' });

        sweptTotal += staleOrders.length;
        logger.info({ branchId, swept: sweptTotal, staleOrders: staleOrders.length }, 'STALE_ORDERS_SWEEP');
        return sweptTotal;
    } catch (error) {
        // Never break the listing endpoints that call this — but make failures visible.
        logger.error({ err: error, branchId }, 'STALE_ORDERS_SWEEP_FAILED');
        return 0;
    }
};
