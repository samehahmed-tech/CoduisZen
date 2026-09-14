/**
 * Scheduled-order dispatcher: wakes SCHEDULED orders when their fire time
 * arrives — deducts stock (warn-only), flips to PENDING, dispatches the
 * kitchen, posts finance, and notifies the branch. Runs every 60s.
 */
import { db } from '../db';
import { branches, dayCloseReports, orderItems, orderStatusHistory, orders, warehouses } from '../../src/db/schema';
import { and, eq, lte, sql } from 'drizzle-orm';
import { inventoryService } from './inventoryService';
import { postCogsForOrderEntry, postPosOrderEntry } from './financePostingService';
import { emitBranchEvent } from '../utils/socketEmit';
import { kdsController } from '../controllers/kdsController';
import { whatsappAutomationService } from './whatsappAutomationService';
import logger from '../utils/logger';

const log = logger.child({ service: 'scheduledOrders' });
const POLL_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

const INVENTORY_WARNING_PATTERN = /^(INSUFFICIENT_STOCK|INSUFFICIENT_STOCK_BATCHES|INVALID_DEDUCTION_QUANTITY|MISSING_RECIPE)\|/;

export const wakeDueScheduledOrders = async (): Promise<number> => {
    if (running) return 0;
    running = true;
    try {
        const now = new Date();
        const due = await db.select({ id: orders.id }).from(orders).where(and(
            eq(orders.status, 'SCHEDULED'),
            lte(orders.scheduledFor as any, now),
        ));
        let woken = 0;
        for (const row of due) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const didWake = await wakeOne(row.id, now);
                if (didWake) woken += 1;
            } catch (error: any) {
                log.warn({ err: error?.message, orderId: row.id }, 'Scheduled wake failed');
            }
        }
        return woken;
    } finally {
        running = false;
    }
};

const wakeOne = async (orderId: string, now: Date): Promise<boolean> => {
    const [order] = await db.select().top(1).from(orders).where(eq(orders.id, orderId));
    if (!order || String(order.status || '').toUpperCase() !== 'SCHEDULED') return false;

    const [branch] = await db.select({ businessDate: branches.businessDate }).top(1)
        .from(branches).where(eq(branches.id, (order as any).branchId));
    if (!branch) return false;
    const activeDay = (branch as any).businessDate
        ? String((branch as any).businessDate).slice(0, 10)
        : now.toISOString().slice(0, 10);
    const [closedDay] = await db.select({ id: dayCloseReports.id }).top(1).from(dayCloseReports)
        .where(and(
            eq(dayCloseReports.branchId, (order as any).branchId),
            sql`${dayCloseReports.businessDate} = CAST(${activeDay} AS DATE)`,
        ));
    // Day already closed for the fire day: re-date to the active day so the
    // order is never stranded, then proceed normally.
    void closedDay;

    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const branchWarehouses = await db.select({ id: warehouses.id }).from(warehouses)
        .where(eq(warehouses.branchId, (order as any).branchId))
        .orderBy(sql`CASE ${warehouses.type} WHEN 'KITCHEN' THEN 0 WHEN 'MAIN' THEN 1 WHEN 'POINT_OF_SALE' THEN 2 ELSE 3 END`);

    let cogsCost = 0;
    await db.transaction(async (tx) => {
        const [fresh] = await tx.select({ status: orders.status }).top(1).from(orders).where(eq(orders.id, orderId));
        if (!fresh || String((fresh as any).status || '').toUpperCase() !== 'SCHEDULED') {
            throw new Error('SCHEDULED_NO_LONGER_DUE');
        }
        for (const line of lines) {
            const menuItemId = String((line as any).menuItemId || (line as any).menu_item_id || '');
            const qty = Number((line as any).quantity || 0);
            if (!menuItemId || !(qty > 0) || branchWarehouses.length === 0) continue;
            let applied = false;
            for (const candidate of branchWarehouses) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const deduction = await inventoryService.deductIngredients(
                        tx, menuItemId, qty, candidate.id, orderId,
                        (order as any).callCenterAgentId || 'system',
                        {
                            sizeId: String((line as any).sizeId || (line as any).size_id || '').trim() || undefined,
                            selectedModifiers: Array.isArray((line as any).modifiers) ? (line as any).modifiers : [],
                        },
                    );
                    cogsCost += Number(Array.isArray(deduction) ? 0 : (deduction as any)?.totalCost || 0);
                    applied = true;
                    break;
                } catch (error: any) {
                    if (!INVENTORY_WARNING_PATTERN.test(String(error?.message || ''))) throw error;
                }
            }
            void applied;
        }
        await tx.update(orders).set({
            status: 'PENDING',
            businessDate: activeDay,
            updatedAt: now,
        }).where(eq(orders.id, orderId));
        await tx.insert(orderStatusHistory).values({
            orderId,
            status: 'PENDING',
            changedBy: 'scheduled-dispatcher',
            notes: `Woke at scheduled time ${(order as any).scheduledFor ? new Date((order as any).scheduledFor).toLocaleString() : ''}`,
            createdAt: now,
        });
    });

    const [fired] = await db.select().top(1).from(orders).where(eq(orders.id, orderId));
    if (!fired) return false;
    const branchId = (fired as any).branchId;
    await kdsController.dispatchToKitchen(branchId, orderId).catch(() => undefined);
    emitBranchEvent(branchId, 'order:status', { id: orderId, status: 'PENDING', updatedAt: now });
    emitBranchEvent(branchId, 'order:created', fired);
    whatsappAutomationService.onOrderCreated(fired as any).catch(() => undefined);
    void (async () => {
        await postPosOrderEntry({
            orderId, amount: Number((fired as any).total || 0), branchId,
            userId: (fired as any).callCenterAgentId || 'system',
        });
        await postCogsForOrderEntry({
            orderId, amount: Number(cogsCost || 0), branchId,
            userId: (fired as any).callCenterAgentId || 'system',
        });
    })().catch(() => undefined);
    return true;
};

export const scheduledOrderService = {
    start: (intervalMs: number = POLL_MS) => {
        if (timer) return;
        timer = setInterval(() => {
            wakeDueScheduledOrders().catch(() => undefined);
        }, intervalMs);
        if (typeof (timer as any).unref === 'function') (timer as any).unref();
        // First sweep shortly after boot so restarts don't stall due orders.
        setTimeout(() => wakeDueScheduledOrders().catch(() => undefined), 15_000);
    },
    wakeDueScheduledOrders,
};
