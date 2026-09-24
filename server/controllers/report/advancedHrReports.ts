import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import { orders, attendance, payrollPayouts, payrollCycles } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';

export const getStaffCostVsRevenue = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const revConditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') revConditions.push(eq(orders.branchId, branchId as string));

        const [rev] = await db.select({
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...revConditions));

        // Payroll leg joins the cycle: branch-scoped via the cycle's branch and
        // date-scoped by period overlap (a payout created in-range for an
        // out-of-range period, or vice versa, no longer leaks in).
        const payrollConditions: any[] = [
            sql`${payrollCycles.periodStart} <= ${end}`,
            sql`${payrollCycles.periodEnd} >= ${start}`,
        ];
        if (branchId && branchId !== 'undefined') payrollConditions.push(eq(payrollCycles.branchId, branchId as string));
        const [payroll] = await db.select({
            totalPayroll: sql<number>`coalesce(sum(${payrollPayouts.netPay}), 0)`,
            employeeCount: sql<number>`count(distinct ${payrollPayouts.employeeId})`,
        }).from(payrollPayouts)
            .innerJoin(payrollCycles, eq(payrollPayouts.cycleId, payrollCycles.id))
            .where(and(...payrollConditions));

        const revenue = Number(Number(rev?.revenue || 0).toFixed(2));
        const staffCost = Number(Number(payroll?.totalPayroll || 0).toFixed(2));
        const staffCostPercent = revenue > 0 ? Number(((staffCost / revenue) * 100).toFixed(1)) : 0;

        res.json({
            revenue,
            staffCost,
            staffCostPercent,
            employeeCount: Number(payroll?.employeeCount || 0),
            costPerEmployee: Number(payroll?.employeeCount || 0) > 0 ? Number((staffCost / Number(payroll?.employeeCount || 1)).toFixed(2)) : 0,
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSalesPerLaborHour = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const revConditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') revConditions.push(eq(orders.branchId, branchId as string));

        const [rev] = await db.select({
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...revConditions));

        const attConditions: any[] = [gte(attendance.clockIn, start), lte(attendance.clockIn, end)];
        if (branchId && branchId !== 'undefined') attConditions.push(eq(attendance.branchId, branchId as string));
        const [att] = await db.select({
            totalHours: sql<number>`coalesce(sum(${attendance.totalHours}), 0)`,
            totalDays: sql<number>`count(*)`,
        }).from(attendance).where(and(...attConditions));

        const revenue = Number(Number(rev?.revenue || 0).toFixed(2));
        const totalHours = Number(Number(att?.totalHours || 0).toFixed(1));
        const salesPerHour = totalHours > 0 ? Number((revenue / totalHours).toFixed(2)) : 0;

        res.json({
            revenue,
            totalLaborHours: totalHours,
            totalLaborDays: Number(att?.totalDays || 0),
            salesPerLaborHour: salesPerHour,
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getEmployeeProductivity = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            agentId: orders.callCenterAgentId,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions, sql`${orders.callCenterAgentId} is not null`))
            .groupBy(orders.callCenterAgentId)
            .orderBy(sql`sum(${orders.total}) desc`);

        // NOTE: call-center-attributed orders only (callCenterAgentId set) —
        // kitchen/waiter/driver labor is not in this dataset.
        res.json(rows.map(r => ({ userId: r.agentId, orderCount: Number(r.orderCount), revenue: Number(Number(r.revenue).toFixed(2)), avgTicket: Number(Number(r.avgTicket).toFixed(2)) })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
