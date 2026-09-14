/**
 * Drawer Reconciliation Service — P1 Financial Backbone
 *
 * Workflow (modeled on Foodics/Toast cashier workflows):
 * 1. openDrawer(branchId, openingCash, openedBy)  — opens the physical cash
 *    drawer at the start of a shift. Only one OPEN drawer allowed per branch.
 * 2. countDrawer(drawerId, countLines)            — cashier enters counted
 *    bills/coins (denominations) at shift close time.
 * 3. closeDrawer(drawerId, cashierId, shiftId)    — service computes expected
 *    cash from shift payments, variance, and closes the drawer. If the variance
 *    exceeds the tolerance it creates a drawer_discrepancy record.
 * 4. resolveDiscrepancy(discrepancyId, resolution, approvedBy) — SHORTAGE
 *    becomes a named debt (CASHIER_DEBT) that blocks the same cashier from
 *    opening a new drawer until it is cleared; OVERAGE can be approved as
 *    income or written off by a finance role.
 */

import { db } from '../db';
import {
    cashDrawers,
    drawerCountLines,
    drawerDiscrepancies,
    shifts,
    payments,
    paymentSessions,
    orders,
    branches,
    users,
    shifts as shiftsTable,
} from '../../src/db/schema';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';
import { randomUUID } from 'crypto';
import { reconcilePaymentRows } from './paymentReconciliation';

const DRAWER_VARIANCE_TOLERANCE = 1; // EGP — below this is considered exact

type CashShiftRow = { orderId: string; method: string | null; count: number; total: number };

const aggregateShiftCash = async (branchId: string, shiftId: string): Promise<number> => {
    const openTime = await db.select({ openingTime: shiftsTable.openingTime })
        .from(shiftsTable).where(eq(shiftsTable.id, shiftId));
    const fromTime = openTime[0]?.openingTime ?? new Date(0);

    let legacyRows: CashShiftRow[] = [];
    let sessionRows: CashShiftRow[] = [];
    try {
        legacyRows = (await db.select({
            orderId: payments.orderId,
            method: payments.method,
            count: sql<number>`count(*)`,
            total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
        }).from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(and(
                eq(orders.branchId, branchId),
                eq(orders.shiftId, shiftId),
                eq(payments.status, 'COMPLETED'),
                gte(payments.createdAt, fromTime),
            ))
            .groupBy(payments.orderId, payments.method)) as unknown as CashShiftRow[];
    } catch (err) {
        logger.warn({ err }, 'drawer: legacy payments aggregate failed');
    }
    try {
        sessionRows = (await db.select({
            orderId: paymentSessions.orderId,
            method: paymentSessions.providerType,
            count: sql<number>`count(*)`,
            total: sql<number>`coalesce(sum(${paymentSessions.amount}), 0)`,
        }).from(paymentSessions)
            .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
            .where(and(
                eq(orders.branchId, branchId),
                eq(orders.shiftId, shiftId),
                eq(paymentSessions.status, 'confirmed'),
                gte(paymentSessions.createdAt, fromTime),
            ))
            .groupBy(paymentSessions.orderId, paymentSessions.providerType)) as unknown as CashShiftRow[];
    } catch (err) {
        logger.warn({ err }, 'drawer: payment session aggregate failed');
    }

    const providerToMethod = (p: string | null | undefined) => {
        const provider = String(p || '').toLowerCase();
        if (provider === 'manual_cash') return 'CASH';
        if (provider === 'eft_pos') return 'VISA';
        return String(p || '').toUpperCase() || 'UNKNOWN';
    };

    const normalized = sessionRows.map(r => ({ ...r, method: providerToMethod(r.method) }));
    const breakdown = reconcilePaymentRows(
        legacyRows.map(r => ({ ...r, method: String(r.method || 'UNKNOWN'), count: Number(r.count), total: Number(r.total) })),
        normalized.map(r => ({ ...r, count: Number(r.count), total: Number(r.total) })),
    );
    return Number(breakdown.find(b => b.method === 'CASH')?.total || 0);
};

export const drawerService = {
    /** Returns the currently OPEN drawer for a branch (or null). */
    getOpenDrawer: async (branchId: string) => {
        const rows = await db.select().from(cashDrawers)
            .where(and(eq(cashDrawers.branchId, branchId), eq(cashDrawers.status, 'OPEN')))
            .orderBy(desc(cashDrawers.openedAt));
        return rows[0] || null;
    },

    openDrawer: async (input: { branchId: string; openingCash: number; openedBy: string }) => {
        const { branchId, openingCash, openedBy } = input;
        const existing = await drawerService.getOpenDrawer(branchId);
        if (existing) {
            return { status: 'already_open', drawer: existing } as const;
        }

        // Block cashiers who owe money from a previous shortage until it is cleared.
        const [user] = await db.select().top(1).from(users).where(eq(users.id, openedBy));
        if (user) {
            const unpaid = await db.select({ id: drawerDiscrepancies.id })
                .from(drawerDiscrepancies)
                .where(and(
                    eq(drawerDiscrepancies.cashierId, openedBy),
                    eq(drawerDiscrepancies.resolution, 'CASHIER_DEBT'),
                ));
            if (unpaid.length > 0) {
                throw Object.assign(new Error('OPEN_DRAWER_BLOCKED_BY_CASHIER_DEBT'), {
                    status: 423,
                    code: 'OPEN_DRAWER_BLOCKED_BY_CASHIER_DEBT',
                    unpaidCount: unpaid.length,
                });
            }
        }

        const id = `drawer-${nanoid(10)}`;
        await db.insert(cashDrawers).values({
            id,
            branchId,
            openedBy,
            openingCash: String(Number(openingCash) || 0),
            totalSalesCash: '0',
            totalRefundsCash: '0',
            totalPayoutsCash: '0',
            totalCollectionsCash: '0',
            variance: '0',
            status: 'OPEN',
        });
        const [drawer] = await db.select().from(cashDrawers).where(eq(cashDrawers.id, id));
        return { status: 'opened', drawer } as const;
    },

    /** Save a counted cash composition (denominations). Idempotent per drawer. */
    recordCount: async (drawerId: string, countedBy: string, lines: { label: string; faceValue: number; quantity: number }[]) => {
        const [drawer] = await db.select().from(cashDrawers).where(eq(cashDrawers.id, drawerId));
        if (!drawer) throw Object.assign(new Error('DRAWER_NOT_FOUND'), { status: 404, code: 'DRAWER_NOT_FOUND' });
        if (drawer.status !== 'OPEN' && drawer.status !== 'COUNTING') {
            throw Object.assign(new Error('DRAWER_NOT_OPEN_FOR_COUNT'), { status: 400, code: 'DRAWER_NOT_OPEN_FOR_COUNT' });
        }

        await db.delete(drawerCountLines).where(and(
            eq(drawerCountLines.drawerId, drawerId),
            eq(drawerCountLines.countType, 'DENOMINATION'),
        ));
        let total = 0;
        for (const l of lines) {
            const face = Number(l.faceValue || 0);
            const qty = Math.max(0, Math.floor(Number(l.quantity || 0)));
            if (qty === 0) continue;
            total += face * qty;
            await db.insert(drawerCountLines).values({
                drawerId,
                countType: 'DENOMINATION',
                label: String(l.label).trim(),
                faceValue: String(face),
                quantity: qty,
                lineTotal: String(face * qty),
                countedBy,
            });
        }
        return { drawerId, countedCash: total };
    },

    /** Get the counted cash total + full breakdown for a drawer. */
    getDrawerCount: async (drawerId: string) => {
        const rows = await db.select().from(drawerCountLines)
            .where(eq(drawerCountLines.drawerId, drawerId))
            .orderBy(drawerCountLines.id);
        const countedCash = rows.reduce((sum, r) => sum + Number(r.lineTotal || 0), 0);
        return { drawerId, lines: rows, countedCash };
    },

    closeDrawer: async (input: {
        drawerId: string;
        closedBy: string;
        cashierId: string;
        shiftId: string;
        countedCash?: number;
        notes?: string;
    }) => {
        const { drawerId, closedBy, cashierId, shiftId, countedCash, notes } = input;
        const [drawer] = await db.select().from(cashDrawers).where(eq(cashDrawers.id, drawerId));
        if (!drawer) throw Object.assign(new Error('DRAWER_NOT_FOUND'), { status: 404, code: 'DRAWER_NOT_FOUND' });
        if (drawer.status === 'CLOSED' || drawer.status === 'VOIDED') {
            throw Object.assign(new Error('DRAWER_ALREADY_CLOSED'), { status: 400, code: 'DRAWER_ALREADY_CLOSED' });
        }

        const [branch] = await db.select().top(1).from(branches).where(eq(branches.id, drawer.branchId));
        const cashSales = await aggregateShiftCash(drawer.branchId, shiftId);
        const expectedCash = Number(drawer.openingCash) + Number(cashSales)
            - Number(drawer.totalRefundsCash) - Number(drawer.totalPayoutsCash)
            + Number(drawer.totalCollectionsCash);
        const actualCash = countedCash !== undefined ? Number(countedCash) : expectedCash;
        const variance = Math.round((actualCash - expectedCash) * 100) / 100;

        await db.update(cashDrawers).set({
            status: 'CLOSED',
            closedBy,
            closedAt: new Date(),
            closingCash: String(actualCash),
            expectedCash: String(expectedCash),
            totalSalesCash: String(cashSales),
            variance: String(variance),
            notes: [drawer.notes, notes].filter(Boolean).join(' | ') || null,
            updatedAt: new Date(),
        }).where(eq(cashDrawers.id, drawerId));

        // Mirror the variance back onto the shift record so existing reports stay consistent.
        try {
            await db.update(shiftsTable).set({
                expectedBalance: expectedCash,
                actualBalance: actualCash,
                status: 'CLOSED',
                closingTime: new Date(),
                updatedAt: new Date(),
            }).where(eq(shiftsTable.id, shiftId));
        } catch (err) {
            logger.warn({ err }, 'drawer: shift mirror update failed (non-blocking)');
        }

        let discrepancy: { id: string; direction: string; variance: number; resolution: string } | null = null;
        if (Math.abs(variance) > DRAWER_VARIANCE_TOLERANCE) {
            const id = randomUUID();
            const direction = variance < 0 ? 'SHORTAGE' : 'OVERAGE';
            const resolution = variance < 0 ? 'PENDING' : 'PENDING';
            await db.insert(drawerDiscrepancies).values({
                id,
                drawerId,
                branchId: drawer.branchId,
                cashierId,
                shiftId,
                variance: String(variance),
                direction,
                resolution,
            });
            const [disc] = await db.select().from(drawerDiscrepancies).where(eq(drawerDiscrepancies.id, id));
            if (disc) {
                discrepancy = {
                    id: disc.id,
                    direction: disc.direction,
                    variance: Number(disc.variance),
                    resolution: disc.resolution,
                };
            }
        }

        return { drawerId, expectedCash, actualCash, variance, discrepancy };
    },

    /**
     * Resolve a shortage/overage.
     * - SHORTAGE + CASHIER_DEBT → blocks the cashier from opening new drawers
     *   until `markDebtPaid` is called.
     * - OVERAGE + APPROVED_OVERAGE → variance posts to a miscellaneous income
     *   account via the GL if configured.
     */
    resolveDiscrepancy: async (input: {
        discrepancyId: string;
        resolution: 'CASHIER_DEBT' | 'APPROVED_OVERAGE' | 'WRITE_OFF' | 'RESOLVED_PAID';
        approvedBy: string;
        amountPaid?: number;
        notes?: string;
    }) => {
        const { discrepancyId, resolution, approvedBy, amountPaid, notes } = input;
        const [disc] = await db.select().from(drawerDiscrepancies)
            .where(eq(drawerDiscrepancies.id, discrepancyId));
        if (!disc) throw Object.assign(new Error('DISCREPANCY_NOT_FOUND'), { status: 404, code: 'DISCREPANCY_NOT_FOUND' });
        if (disc.resolution !== 'PENDING' && disc.resolution !== resolution) {
            throw Object.assign(new Error('DISCREPANCY_ALREADY_RESOLVED'), { status: 400, code: 'DISCREPANCY_ALREADY_RESOLVED' });
        }

        await db.update(drawerDiscrepancies).set({
            resolution,
            approvedBy,
            approvedAt: new Date(),
            amountPaid: amountPaid !== undefined ? String(amountPaid) : (disc.amountPaid ? String(disc.amountPaid) : '0'),
            notes: [disc.notes, notes].filter(Boolean).join(' | ') || null,
            resolvedAt: resolution === 'RESOLVED_PAID' ? new Date() : disc.resolvedAt,
            updatedAt: new Date(),
        }).where(eq(drawerDiscrepancies.id, discrepancyId));

        // GL posting for write-offs / approved overages (pure informational posting;
        // uses GLService only if configured payment/tax mappings exist).
        if (resolution === 'WRITE_OFF' || resolution === 'APPROVED_OVERAGE') {
            try {
                const { GLService } = await import('./glService');
                const accountType = resolution === 'WRITE_OFF' ? 'EXPENSE' : 'REVENUE';
                await GLService.postJournalEntry({
                    reference: `DISC-${disc.id}`,
                    referenceType: 'EXPENSE',
                    description: `Drawer ${resolution === 'WRITE_OFF' ? 'shortage write-off' : 'overage approval'} ${disc.variance} EGP`,
                    branchId: disc.branchId,
                    lines: resolution === 'WRITE_OFF'
                        ? [
                            { accountCode: '5150', debit: Number(Math.abs(Number(disc.variance))), credit: 0, description: 'Petty cash shortage write-off' },
                            { accountCode: '1110', debit: 0, credit: Number(Math.abs(Number(disc.variance))), description: 'Cash on hand correction' },
                        ]
                        : [
                            { accountCode: '1110', debit: Number(Math.abs(Number(disc.variance))), credit: 0, description: 'Cash on hand correction' },
                            { accountCode: '4300', debit: 0, credit: Number(Math.abs(Number(disc.variance))), description: 'Cash overage miscellaneous income' },
                        ],
                    createdBy: approvedBy,
                }).catch(err => logger.warn({ err }, 'drawer: GL posting for discrepancy skipped'));
            } catch {
                logger.warn('drawer: GL posting skipped (account not mapped)');
            }
        }

        const [updated] = await db.select().from(drawerDiscrepancies).where(eq(drawerDiscrepancies.id, discrepancyId));
        return { discrepancy: updated };
    },

    /** Cashier pays back a shortage debt; unblocks future drawer opens. */
    markDebtPaid: async (discrepancyId: string, amount: number, notes?: string) => {
        const [disc] = await db.select().from(drawerDiscrepancies)
            .where(eq(drawerDiscrepancies.id, discrepancyId));
        if (!disc) throw Object.assign(new Error('DISCREPANCY_NOT_FOUND'), { status: 404, code: 'DISCREPANCY_NOT_FOUND' });
        const remaining = Math.round((Number(disc.variance) - Number(disc.amountPaid || 0)) * 100) / 100;
        if (Math.abs(remaining) <= 0) {
            throw Object.assign(new Error('DEBT_ALREADY_CLEARED'), { status: 400, code: 'DEBT_ALREADY_CLEARED' });
        }
        const paid = Math.min(amount, Math.abs(remaining));
        const newPaid = Math.round((Number(disc.amountPaid || 0) + paid) * 100) / 100;
        const fullyPaid = newPaid >= Math.abs(remaining);
        await db.update(drawerDiscrepancies).set({
            amountPaid: String(newPaid),
            resolution: fullyPaid ? 'RESOLVED_PAID' : disc.resolution,
            resolvedAt: fullyPaid ? new Date() : disc.resolvedAt,
            notes: [disc.notes, notes, `Debt payment ${paid} EGP`].filter(Boolean).join(' | ') || null,
            updatedAt: new Date(),
        }).where(eq(drawerDiscrepancies.id, discrepancyId));
        return { discrepancyId, paid, remaining: Math.round((Math.abs(remaining) - paid) * 100) / 100, fullyPaid };
    },

    listDrawers: async (branchId: string, limit = 50) => {
        return db.select().from(cashDrawers)
            .where(eq(cashDrawers.branchId, branchId))
            .orderBy(desc(cashDrawers.openedAt)).limit(limit);
    },

    listDiscrepancies: async (branchId: string) => {
        return db.select().from(drawerDiscrepancies)
            .where(eq(drawerDiscrepancies.branchId, branchId))
            .orderBy(desc(drawerDiscrepancies.createdAt));
    },

    /** Unpaid cashier debts per branch — used by day-close and shift-open readiness. */
    unpaidCashierDebts: async (branchId: string) => {
        return db.select({
            id: drawerDiscrepancies.id,
            cashierId: drawerDiscrepancies.cashierId,
            variance: drawerDiscrepancies.variance,
            amountPaid: drawerDiscrepancies.amountPaid,
        }).from(drawerDiscrepancies)
            .where(and(
                eq(drawerDiscrepancies.branchId, branchId),
                eq(drawerDiscrepancies.resolution, 'CASHIER_DEBT'),
            ));
    },
};

export default drawerService;
