import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { branches, dayCloseReports, drivers, kdsTickets, managerApprovals, orderStatusHistory, orders, tables } from '../../src/db/schema';
import { evaluateOrderStatusUpdate } from './orderStatusPolicy';
import { emitBranchEvent } from '../utils/socketEmit';
import { webhookService } from './webhookService';
import { analyticsService } from './analyticsService';
import { loyaltyService } from './loyaltyService';
import { submitOrderToFiscal } from './fiscalSubmitService';
import { sendWhatsAppText } from './whatsappService';
import { whatsappAutomationService } from './whatsappAutomationService';
import { getDateKeyInTimeZone } from '../utils/businessDate';

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

const runPostTransitionEffects = (order: any, previousStatus: string, nextStatus: string) => {
    const branchId = order.branchId;
    if (branchId) {
        emitBranchEvent(branchId, 'order:status', { id: order.id, status: order.status, updatedAt: order.updatedAt });

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
        runPostTransitionEffects(result.order, result.previousStatus, normalizedStatus);
    }

    return result.order;
};

export const markOrderKdsTicketsDelivered = async (orderId: string) => {
    const { kdsTickets } = await import('../../src/db/schema');
    await db.update(kdsTickets)
        .set({ status: 'DELIVERED', updatedAt: new Date() })
        .where(and(eq(kdsTickets.orderId, orderId)));
};
