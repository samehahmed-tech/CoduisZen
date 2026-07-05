import { Request, Response } from 'express';
import { db } from '../db';
import { shifts, orders, payments, paymentSessions } from '../../src/db/schema';
import { eq, and, sql, gte, desc } from 'drizzle-orm';
import { getStringParam } from '../utils/request';

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

const sessionProviderToMethod = (providerType: string | null | undefined) => {
    const provider = String(providerType || '').toLowerCase();
    if (provider === 'manual_cash') return 'CASH';
    if (provider === 'eft_pos') return 'VISA';
    return provider.toUpperCase();
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
        ).orderBy(desc(shifts.openingTime)).limit(1);

        if (existingOpenShift.length > 0) {
            return res.status(200).json(existingOpenShift[0]);
        }

        const [newShift] = await db.insert(shifts).values({
            id,
            branchId,
            userId,
            openingBalance: Number(openingBalance || 0),
            status: 'OPEN',
            notes,
            openingTime: new Date(),
        }).returning();

        res.status(201).json(newShift);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};


export const closeShift = async (req: Request, res: Response) => {
    try {
        const { actualBalance, notes } = req.body;
        const shiftId = getStringParam((req.params as any).id);
        if (!shiftId) return res.status(400).json({ error: 'SHIFT_ID_REQUIRED' });
        if (actualBalance === undefined || actualBalance === null) {
            return res.status(400).json({ error: 'ACTUAL_BALANCE_REQUIRED', message: 'Cash count (actualBalance) is required to close a shift.' });
        }

        const shift = await db.select().from(shifts).where(eq(shifts.id, shiftId));
        if (shift.length === 0) return res.status(404).json({ error: 'Shift not found' });
        if (!canAccessShiftBranch(req, shift[0].branchId)) {
            return res.status(403).json({ error: 'FORBIDDEN_BRANCH_SCOPE' });
        }
        if (shift[0].status === 'CLOSED') return res.status(400).json({ error: 'Shift is already closed' });

        // Calculate expected balance: Opening + Cash Payments
        const cashTotalResult = await db.select({
            sum: sql<number>`sum(amount)`
        }).from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(
                and(
                    eq(orders.branchId, shift[0].branchId),
                    eq(orders.shiftId, shiftId),
                    eq(payments.method, 'CASH'),
                    eq(payments.status, 'COMPLETED'),
                    gte(payments.createdAt, shift[0].openingTime)
                )
            );

        let cashSessionTotal = 0;
        try {
            const cashSessionTotalResult = await db.select({
                sum: sql<number>`coalesce(sum(${paymentSessions.amount}), 0)`
            }).from(paymentSessions)
                .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
                .where(
                    and(
                        eq(orders.branchId, shift[0].branchId),
                        eq(orders.shiftId, shiftId),
                        eq(paymentSessions.providerType, 'manual_cash'),
                        eq(paymentSessions.status, 'confirmed'),
                        gte(paymentSessions.createdAt, shift[0].openingTime)
                    )
                );
            cashSessionTotal = Number(cashSessionTotalResult[0]?.sum || 0);
        } catch {
            // ponytail: old client DBs may not have payment_sessions migrated; payments table still covers normal POS cash.
        }

        const cashTotal = Number(cashTotalResult[0]?.sum || 0) + cashSessionTotal;
        const expectedBalance = Number(shift[0].openingBalance) + cashTotal;
        const actualNum = Number(actualBalance);
        const variance = actualNum - expectedBalance;
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
            .where(eq(shifts.id, shiftId))
            .returning();

        res.json({
            ...updatedShift,
            cashReconciliation: {
                openingBalance: Number(shift[0].openingBalance),
                cashReceived: cashTotal,
                expectedBalance,
                actualBalance: actualNum,
                variance,
                hasDiscrepancy,
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
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
        ).orderBy(desc(shifts.openingTime)).limit(1);

        if (activeShift.length === 0) return res.status(404).json({ error: 'No active shift found' });
        res.json(activeShift[0]);
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
        }).from(orders).where(eq(orders.shiftId, shiftId));

        // Get payment breakdown
        const paymentBreakdown = await db.select({
            method: payments.method,
            total: sql<number>`coalesce(sum(amount), 0)`,
            count: sql<number>`count(*)`
        }).from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(and(eq(orders.shiftId, shiftId), eq(payments.status, 'COMPLETED')))
            .groupBy(payments.method);

        let sessionBreakdown: Array<{ providerType: string | null; total: number; count: number }> = [];
        try {
            sessionBreakdown = await db.select({
                providerType: paymentSessions.providerType,
                total: sql<number>`coalesce(sum(${paymentSessions.amount}), 0)`,
                count: sql<number>`count(*)`
            }).from(paymentSessions)
                .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
                .where(and(eq(orders.shiftId, shiftId), eq(paymentSessions.status, 'confirmed')))
                .groupBy(paymentSessions.providerType);
        } catch {
            // ponytail: old client DBs may not have payment_sessions migrated; don't break shift report.
        }

        const totalsByMethod = new Map<string, { method: string; total: number; count: number }>();
        for (const p of paymentBreakdown) {
            totalsByMethod.set(String(p.method), { method: String(p.method), total: Number(p.total || 0), count: Number(p.count || 0) });
        }
        for (const p of sessionBreakdown) {
            const method = sessionProviderToMethod(p.providerType);
            const current = totalsByMethod.get(method) || { method, total: 0, count: 0 };
            totalsByMethod.set(method, {
                method,
                total: current.total + Number(p.total || 0),
                count: current.count + Number(p.count || 0),
            });
        }
        const combinedPaymentBreakdown = Array.from(totalsByMethod.values());

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
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
