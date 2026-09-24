import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import { employees, attendance, payrollCycles, payrollPayouts } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';

export const getPayrollSummary = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const conditions: any[] = [
            gte(payrollCycles.periodStart, start),
            lte(payrollCycles.periodEnd, end),
        ];
        if (branchId) conditions.push(eq(payrollCycles.branchId, branchId as string));

        const cycles = await db.select().from(payrollCycles).where(and(...conditions)).orderBy(desc(payrollCycles.periodStart));

        if (cycles.length === 0) return res.json({ cycles: [], payouts: [], totalPayroll: 0 });

        const cycleIds = cycles.map(c => c.id);
        const payouts = await db.select({
            cycleId: payrollPayouts.cycleId,
            employeeName: employees.name,
            role: employees.role,
            basicSalary: payrollPayouts.basicSalary,
            deductions: payrollPayouts.deductions,
            overtime: payrollPayouts.overtime,
            netPay: payrollPayouts.netPay,
            status: payrollPayouts.status,
        })
            .from(payrollPayouts)
            .innerJoin(employees, eq(payrollPayouts.employeeId, employees.id))
            .where(inArray(payrollPayouts.cycleId, cycleIds))
            .orderBy(employees.name);

        const totalPayroll = payouts.reduce((s, p) => s + Number(p.netPay), 0);
        // DRAFT cycles are plans, not paid money — break the total down so
        // unapproved payroll never silently inflates the headline.
        const approvedCycleIds = new Set(cycles.filter((c) => c.status === 'APPROVED' || c.status === 'PAID').map((c) => c.id));
        const approvedTotal = payouts
            .filter((p) => approvedCycleIds.has((p as any).cycleId))
            .reduce((s, p) => s + Number(p.netPay), 0);
        res.json({ cycles, payouts, totalPayroll, approvedTotal, payrollBasis: 'ALL_CYCLES_WITH_APPROVED_SPLIT' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getAttendanceReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const conditions: any[] = [
            gte(attendance.clockIn, start),
            lte(attendance.clockIn, end),
        ];
        if (branchId) conditions.push(eq(attendance.branchId, branchId as string));

        // Group by employee ID — grouping by name+role merged homonyms across
        // branches into one row.
        const rows = await db.select({
            employeeId: employees.id,
            employeeName: employees.name,
            role: employees.role,
            totalDays: sql<number>`count(*)`,
            presentDays: sql<number>`sum(case when ${attendance.status} = 'PRESENT' then 1 else 0 end)`,
            lateDays: sql<number>`sum(case when ${attendance.status} = 'LATE' then 1 else 0 end)`,
            absentDays: sql<number>`sum(case when ${attendance.status} = 'ABSENT' then 1 else 0 end)`,
            sickDays: sql<number>`sum(case when ${attendance.status} = 'SICK_LEAVE' then 1 else 0 end)`,
            totalHours: sql<number>`coalesce(sum(${attendance.totalHours}), 0)`,
            avgHoursPerDay: sql<number>`coalesce(avg(${attendance.totalHours}), 0)`,
        })
            .from(attendance)
            .innerJoin(employees, eq(attendance.employeeId, employees.id))
            .where(and(...conditions))
            .groupBy(employees.id, employees.name, employees.role)
            .orderBy(employees.name);

        res.json(rows.map(r => ({
            ...r,
            totalDays: Number(r.totalDays),
            presentDays: Number(r.presentDays),
            lateDays: Number(r.lateDays),
            absentDays: Number(r.absentDays),
            sickDays: Number(r.sickDays),
            totalHours: Number(Number(r.totalHours).toFixed(1)),
            avgHoursPerDay: Number(Number(r.avgHoursPerDay).toFixed(1)),
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getOvertimeReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const conditions: any[] = [
            gte(attendance.clockIn, start),
            lte(attendance.clockIn, end),
        ];
        if (branchId) conditions.push(eq(attendance.branchId, branchId as string));

        // - Group by employee ID (homonyms no longer merge).
        // - CASE WHEN instead of greatest(): older SQL Server has no GREATEST().
        // - Overtime = hours past 8/day (documented house rule).
        const overtimeExpr = sql`case when ${attendance.totalHours} > 8 then ${attendance.totalHours} - 8 else 0 end`;
        const rows = await db.select({
            employeeId: employees.id,
            employeeName: employees.name,
            role: employees.role,
            hourlyRate: employees.hourlyRate,
            basicSalary: employees.basicSalary,
            totalHours: sql<number>`coalesce(sum(${attendance.totalHours}), 0)`,
            workDays: sql<number>`count(*)`,
            overtimeHours: sql<number>`coalesce(sum(${overtimeExpr}), 0)`,
        })
            .from(attendance)
            .innerJoin(employees, eq(attendance.employeeId, employees.id))
            .where(and(...conditions))
            .groupBy(employees.id, employees.name, employees.role, employees.hourlyRate, employees.basicSalary)
            .having(sql`sum(${overtimeExpr}) > 0`)
            .orderBy(sql`sum(${overtimeExpr}) desc`);

        res.json(rows.map(r => {
            // Hourly rate fallback: monthly basic / 240h (30d × 8h) when no
            // explicit rate is set — flagged so finance can review.
            const rate = Number(r.hourlyRate || 0) > 0 ? Number(r.hourlyRate) : Number(r.basicSalary || 0) / 240;
            return {
                ...r,
                totalHours: Number(Number(r.totalHours).toFixed(1)),
                workDays: Number(r.workDays),
                overtimeHours: Number(Number(r.overtimeHours).toFixed(1)),
                effectiveHourlyRate: Number(rate.toFixed(2)),
                rateEstimated: !(Number(r.hourlyRate || 0) > 0),
                overtimeCost: Number((Number(r.overtimeHours) * rate * 1.5).toFixed(2)),
            };
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
