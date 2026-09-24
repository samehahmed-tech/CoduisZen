import { Request, Response } from 'express';
import { db } from '../db';
import { shifts, orders, payments, paymentSessions, users, branches } from '../../src/db/schema';
import { eq, and, sql, gte, desc } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { parseNonNegativeShiftAmount, requireShiftVarianceReason } from '../services/shiftReconciliation';
import { reconcilePaymentRows } from '../services/paymentReconciliation';
import { revenueEligibleOrder } from '../utils/orderRevenue';

const canAccessShiftBranch = (req: Request, branchId: string | null | undefined) => {
    if (!branchId) return false;
    const user = req.user;
    if (req.effectiveBranchId) return req.effectiveBranchId === branchId;
    if (user?.role === 'SUPER_ADMIN') return true;
    const allowedBranches = new Set<string>();
    if (user?.branchId) allowedBranches.add(user.branchId);
    for (const allowedBranchId of user?.allowedBranches || []) {
        if (allowedBranchId) allowedBranches.add(allowedBranchId);
    }
    return allowedBranches.has(branchId);
};

/**
 * Orders whose tender must be EXPLAINED, not counted, in shift cash math:
 * cancelled / voided / refunded / soft-deleted. Their COMPLETED payment
 * rows stay in the tables (tender view), so without this the shift close
 * silently inflates cash vs the drawer and vs the dashboard (which uses
 * revenue-recognized semantics). We report them separately instead.
 */
const excludedShiftOrderCondition = () => sql`(
    ${orders.deletedAt} is not null
    or ${orders.status} in ('CANCELLED', 'REFUNDED', 'VOID')
    or ${orders.status} is null
)`;

type ShiftPaymentRow = { orderId: string; method: string | null; count: number; total: number };

const getExcludedShiftPayments = async (branchId: string, shiftId: string, openedAt: Date) => {
    const legacyRows = await db.select({
        orderId: payments.orderId,
        method: payments.method,
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
    }).from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .where(
            and(
                eq(orders.branchId, branchId),
                eq(orders.shiftId, shiftId),
                eq(payments.status, 'COMPLETED'),
                gte(payments.createdAt, openedAt),
                excludedShiftOrderCondition(),
            )
        ).groupBy(payments.orderId, payments.method);

    let sessionRows: ShiftPaymentRow[] = [];
    try {
        sessionRows = await db.select({
            orderId: paymentSessions.orderId,
            method: paymentSessions.providerType,
            count: sql<number>`count(*)`,
            total: sql<number>`coalesce(sum(${paymentSessions.amount}), 0)`,
        }).from(paymentSessions)
            .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
            .where(
                and(
                    eq(orders.branchId, branchId),
                    eq(orders.shiftId, shiftId),
                    eq(paymentSessions.status, 'confirmed'),
                    gte(paymentSessions.createdAt, openedAt),
                    excludedShiftOrderCondition(),
                )
            ).groupBy(paymentSessions.orderId, paymentSessions.providerType);
    } catch {
        // ponytail: old client DBs may not have payment_sessions migrated.
    }

    const rows = reconcilePaymentRows(
        legacyRows.map(row => ({ ...row, count: Number(row.count), total: Number(row.total) })),
        sessionRows.map(row => ({ ...row, count: Number(row.count), total: Number(row.total) })),
    );
    return {
        orderCount: new Set([...legacyRows.map(r => r.orderId), ...sessionRows.map(r => r.orderId)]).size,
        paymentCount: rows.reduce((sum, row) => sum + Number(row.count || 0), 0),
        total: rows.reduce((sum, row) => sum + Number(row.total || 0), 0),
        byMethod: rows,
    };
};

export const openShift = async (req: Request, res: Response) => {
    try {
        const { id, openingBalance, notes } = req.body;
        const branchId = req.effectiveBranchId || getStringParam(req.body?.branchId) || getStringParam(req.body?.branch_id);
        const userId = getStringParam(req.body?.userId || req.body?.user_id) || req.user?.id;
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        if (!userId) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
        if (!canAccessShiftBranch(req, branchId)) {
            return res.status(403).json({ error: 'FORBIDDEN_BRANCH_SCOPE' });
        }
        // Check if branch already has an open shift
        const existingOpenShift = await db.select().from(shifts).where(
            and(
                eq(shifts.branchId, branchId),
                eq(shifts.status, 'OPEN')
            )
        ).orderBy(desc(shifts.openingTime)).offset(0).fetch(1);

        if (existingOpenShift.length > 0) {
            return res.status(200).json(existingOpenShift[0]);
        }
        const openingBalanceNum = parseNonNegativeShiftAmount(openingBalance, 'OPENING_BALANCE_REQUIRED');

        const [newShift] = await db.insert(shifts).output().values({
            id: id || `SFT-${Date.now()}`,
            branchId,
            userId,
            openingBalance: openingBalanceNum,
            status: 'OPEN',
            notes,
            openingTime: new Date(),
        });

        res.status(201).json(newShift);
    } catch (error: any) {
        res.status(Number(error?.status) || 500).json({
            error: error?.code || error?.message,
            message: error?.message,
        });
    }
};


export const closeShift = async (req: Request, res: Response) => {
    try {
        const { actualBalance, notes } = req.body;
        const shiftId = getStringParam((req.params as any).id);
        if (!shiftId) return res.status(400).json({ error: 'SHIFT_ID_REQUIRED' });
        const actualNum = parseNonNegativeShiftAmount(actualBalance, 'ACTUAL_BALANCE_REQUIRED');

        const shift = await db.select().from(shifts).where(eq(shifts.id, shiftId));
        if (shift.length === 0) return res.status(404).json({ error: 'Shift not found' });
        if (!canAccessShiftBranch(req, shift[0].branchId)) {
            return res.status(403).json({ error: 'FORBIDDEN_BRANCH_SCOPE' });
        }
        if (shift[0].status === 'CLOSED') return res.status(400).json({ error: 'Shift is already closed' });

        // Reconcile every tender, then use cash only for drawer variance.
        const paymentRows = await db.select({
            orderId: payments.orderId,
            method: payments.method,
            count: sql<number>`count(*)`,
            total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
        }).from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(
                and(
                    eq(orders.branchId, shift[0].branchId),
                    eq(orders.shiftId, shiftId),
                    eq(payments.status, 'COMPLETED'),
                    gte(payments.createdAt, shift[0].openingTime)
                )
            ).groupBy(payments.orderId, payments.method);

        let sessionRows: Array<{ orderId: string; method: string | null; count: number; total: number }> = [];
        try {
            sessionRows = await db.select({
                orderId: paymentSessions.orderId,
                method: paymentSessions.providerType,
                count: sql<number>`count(*)`,
                total: sql<number>`coalesce(sum(${paymentSessions.amount}), 0)`,
            }).from(paymentSessions)
                .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
                .where(
                    and(
                        eq(orders.branchId, shift[0].branchId),
                        eq(orders.shiftId, shiftId),
                        eq(paymentSessions.status, 'confirmed'),
                        gte(paymentSessions.createdAt, shift[0].openingTime)
                    )
                ).groupBy(paymentSessions.orderId, paymentSessions.providerType);
        } catch {
            // ponytail: old client DBs may not have payment_sessions migrated; payments table still covers normal POS cash.
        }

        const paymentBreakdown = reconcilePaymentRows(
            paymentRows.map(row => ({ ...row, count: Number(row.count), total: Number(row.total) })),
            sessionRows.map(row => ({ ...row, count: Number(row.count), total: Number(row.total) })),
        );
        // Tender left out of cash on purpose (cancelled/void/refunded/deleted
        // orders) — reported separately so the cashier sees exactly why the
        // close total differs from gross sales instead of a mystery "double".
        const excluded = await getExcludedShiftPayments(shift[0].branchId, shiftId, shift[0].openingTime);
        const cashTotal = paymentBreakdown.find(row => row.method === 'CASH')?.total || 0;
        const expectedBalance = Number(shift[0].openingBalance) + cashTotal;
        const variance = requireShiftVarianceReason(actualNum, expectedBalance, notes);
        const varianceAbs = Math.abs(variance);

        // Flag significant discrepancies (> 1 EGP)
        const hasDiscrepancy = varianceAbs > 1;
        const varianceNote = hasDiscrepancy
            ? `Cash variance: ${variance > 0 ? '+' : ''}${variance.toFixed(2)} (expected: ${expectedBalance.toFixed(2)}, actual: ${actualNum.toFixed(2)})`
            : null;

        const [updatedShift] = await db.update(shifts)
            .set({
                status: 'CLOSED',
                closingTime: new Date(),
                expectedBalance,
                actualBalance: actualNum,
                notes: [notes, varianceNote].filter(Boolean).join(' | ') || shift[0].notes,
                updatedAt: new Date(),
            })
            .output()
            .where(eq(shifts.id, shiftId));

        res.json({
            ...updatedShift,
            cashReconciliation: {
                openingBalance: Number(shift[0].openingBalance),
                cashReceived: cashTotal,
                expectedBalance,
                actualBalance: actualNum,
                variance,
                hasDiscrepancy,
            },
            payments: paymentBreakdown,
            excluded,
        });
    } catch (error: any) {
        res.status(Number(error?.status) || 500).json({
            error: error?.code || error?.message,
            message: error?.message,
        });
    }
};

export const getActiveShift = async (req: Request, res: Response) => {
    try {
        const branchId = getStringParam(req.query.branchId);
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        const activeShift = await db.select().from(shifts).where(
            and(
                eq(shifts.branchId, branchId),
                eq(shifts.status, 'OPEN')
            )
        ).orderBy(desc(shifts.openingTime)).offset(0).fetch(1);

        if (activeShift.length === 0) return res.status(404).json({ error: 'No active shift found' });

        const [branch] = await db.select({ businessDate: branches.businessDate })
            .from(branches)
            .where(eq(branches.id, branchId))
            .top(1);

        const shiftRecord = activeShift[0];
        let isStale = false;

        if (branch?.businessDate && shiftRecord.openingTime) {
            const shiftDateStr = new Date(shiftRecord.openingTime).toISOString().split('T')[0];
            if (shiftDateStr < branch.businessDate) {
                isStale = true;
            }
        }

        res.json({
            ...shiftRecord,
            isStale,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getOpenShifts = async (req: Request, res: Response) => {
    try {
        const branchId = getStringParam(req.query.branchId);
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        if (!canAccessShiftBranch(req, branchId)) {
            return res.status(403).json({ error: 'FORBIDDEN_BRANCH_SCOPE' });
        }

        const openShifts = await db.select({
            id: shifts.id,
            branchId: shifts.branchId,
            userId: shifts.userId,
            openingBalance: shifts.openingBalance,
            status: shifts.status,
            notes: shifts.notes,
            openingTime: shifts.openingTime,
            userName: users.name,
            username: users.name,
        })
            .from(shifts)
            .leftJoin(users, eq(shifts.userId, users.id))
            .where(and(
                eq(shifts.branchId, branchId),
                eq(shifts.status, 'OPEN')
            ))
            .orderBy(desc(shifts.openingTime));

        const [branch] = await db.select({ businessDate: branches.businessDate })
            .from(branches)
            .where(eq(branches.id, branchId))
            .top(1);

        const result = openShifts.map(s => {
            let isStale = false;
            if (branch?.businessDate && s.openingTime) {
                const shiftDateStr = new Date(s.openingTime).toISOString().split('T')[0];
                if (shiftDateStr < branch.businessDate) {
                    isStale = true;
                }
            }
            return {
                ...s,
                openingBalance: Number(s.openingBalance || 0),
                isStale,
            };
        });

        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * X-Report: Mid-shift summary (running totals without closing)
 */
export const getXReport = async (req: Request, res: Response) => {
    try {
        const shiftId = getStringParam((req.params as any).id);
        if (!shiftId) return res.status(400).json({ error: 'SHIFT_ID_REQUIRED' });

        const shift = await db.select().from(shifts).where(eq(shifts.id, shiftId));
        if (shift.length === 0) return res.status(404).json({ error: 'Shift not found' });
        if (!canAccessShiftBranch(req, shift[0].branchId)) {
            return res.status(403).json({ error: 'FORBIDDEN_BRANCH_SCOPE' });
        }

        // Get all orders linked to this shift
        const orderStats = await db.select({
            count: sql<number>`count(*)`,
            totalSales: sql<number>`coalesce(sum(total), 0)`,
            netSales: sql<number>`coalesce(sum(subtotal - coalesce(discount, 0)), 0)`,
            discountsAndRefunds: sql<number>`coalesce(sum(coalesce(discount, 0)), 0)`,
            totalTax: sql<number>`coalesce(sum(tax), 0)`,
            totalServiceCharge: sql<number>`coalesce(sum(service_charge), 0)`
        }).from(orders).where(and(eq(orders.shiftId, shiftId), revenueEligibleOrder()));

        // Get payment breakdown (same scope as closeShift: this shift's orders,
        // COMPLETED rows created after opening — so the preview the cashier
        // approves is exactly what the close will compute)
        const paymentBreakdown = await db.select({
            orderId: payments.orderId,
            method: payments.method,
            total: sql<number>`coalesce(sum(amount), 0)`,
            count: sql<number>`count(*)`
        }).from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(and(eq(orders.shiftId, shiftId), eq(payments.status, 'COMPLETED'), gte(payments.createdAt, shift[0].openingTime)))
            .groupBy(payments.orderId, payments.method);

        let sessionBreakdown: Array<{ orderId: string; method: string | null; total: number; count: number }> = [];
        try {
            sessionBreakdown = await db.select({
                orderId: paymentSessions.orderId,
                method: paymentSessions.providerType,
                total: sql<number>`coalesce(sum(${paymentSessions.amount}), 0)`,
                count: sql<number>`count(*)`
            }).from(paymentSessions)
                .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
                .where(and(eq(orders.shiftId, shiftId), eq(paymentSessions.status, 'confirmed'), gte(paymentSessions.createdAt, shift[0].openingTime)))
                .groupBy(paymentSessions.orderId, paymentSessions.providerType);
        } catch {
            // ponytail: old client DBs may not have payment_sessions migrated; don't break shift report.
        }

        const combinedPaymentBreakdown = reconcilePaymentRows(
            paymentBreakdown.map(row => ({ ...row, count: Number(row.count), total: Number(row.total) })),
            sessionBreakdown.map(row => ({ ...row, count: Number(row.count), total: Number(row.total) })),
        );
        const excluded = await getExcludedShiftPayments(shift[0].branchId, shiftId, shift[0].openingTime);

        const cashPayments = combinedPaymentBreakdown.find(p => p.method === 'CASH');
        const visaPayments = combinedPaymentBreakdown.find(p => ['VISA', 'CARD', 'CREDIT_CARD', 'DEBIT_CARD'].includes(String(p.method || '').toUpperCase()));
        const expectedCash = Number(shift[0].openingBalance) + Number(cashPayments?.total || 0);
        const grossSales = Number(orderStats[0]?.totalSales || 0);
        const netSales = Number(orderStats[0]?.netSales || 0);
        const discountsAndRefunds = Number(orderStats[0]?.discountsAndRefunds || 0);
        const totalTax = Number(orderStats[0]?.totalTax || 0);
        const totalServiceCharge = Number(orderStats[0]?.totalServiceCharge || 0);

        res.json({
            shiftId,
            openingBalance: shift[0].openingBalance,
            openingTime: shift[0].openingTime,
            reportTime: new Date(),
            orderCount: Number(orderStats[0]?.count || 0),
            grossSales,
            netSales,
            vatCollected: totalTax,
            serviceChargeCollected: totalServiceCharge,
            discountsAndRefunds,
            cashCollected: Number(cashPayments?.total || 0),
            visaCollected: Number(visaPayments?.total || 0),
            expectedCashBalance: expectedCash,
            expectedCashInDrawer: expectedCash,
            sales: {
                orderCount: Number(orderStats[0]?.count || 0),
                grossSales,
                netSales,
                vatCollected: totalTax,
                serviceChargeCollected: totalServiceCharge
            },
            payments: combinedPaymentBreakdown,
            excluded,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
