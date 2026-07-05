import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import {
    attendanceExceptions,
    attendanceSessions,
    branches,
    employees,
    leaveRequests,
    managerApprovals,
    payrollCycles,
    payrollRuns,
} from '../../src/db/schema';

type ExecutiveReportsInput = {
    branchId?: string;
    startDate?: string;
    endDate?: string;
};

const startOfDay = (value?: string) => {
    const date = value ? new Date(value) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    date.setHours(0, 0, 0, 0);
    return date;
};

const endOfDay = (value?: string) => {
    const date = value ? new Date(value) : new Date();
    date.setHours(23, 59, 59, 999);
    return date;
};

const asNumber = (value: unknown) => Number(value || 0);

const makeBranchSummary = (input: { branchId: string; branchName?: string | null }) => ({
    branchId: input.branchId,
    branchName: input.branchName || input.branchId,
    employees: 0,
    activeEmployees: 0,
    newHires: 0,
    inactiveEmployees: 0,
    sessions: 0,
    openSessions: 0,
    totalHours: 0,
    overtimeMinutes: 0,
    openExceptions: 0,
    criticalExceptions: 0,
});

const labelDate = (value: Date | string | null | undefined) => {
    if (!value) return null;
    return new Date(value).toISOString().slice(0, 10);
};

const riskSeverityWeight = (severity?: string | null) => {
    switch (String(severity || '').toUpperCase()) {
        case 'CRITICAL':
            return 4;
        case 'HIGH':
            return 3;
        case 'MEDIUM':
            return 2;
        default:
            return 1;
    }
};

export default {
    async getExecutiveReports(input: ExecutiveReportsInput) {
        const periodStart = startOfDay(input.startDate);
        const periodEnd = endOfDay(input.endDate);
        const branchFilter = input.branchId ? eq(employees.branchId, input.branchId) : undefined;
        const sessionBranchFilter = input.branchId ? eq(attendanceSessions.branchId, input.branchId) : undefined;
        const exceptionBranchFilter = input.branchId ? eq(attendanceExceptions.branchId, input.branchId) : undefined;
        const leaveBranchFilter = input.branchId ? eq(employees.branchId, input.branchId) : undefined;
        const payrollBranchFilter = input.branchId ? eq(payrollRuns.branchId, input.branchId) : undefined;
        const managerBranchFilter = input.branchId ? eq(managerApprovals.branchId, input.branchId) : undefined;

        const [
            employeeRows,
            branchSessionRows,
            branchExceptionRows,
            dailySessionRows,
            leaveRows,
            payrollRows,
            performanceRows,
            openSessionRows,
        ] = await Promise.all([
            db.select({
                employeeId: employees.id,
                employeeName: employees.name,
                branchId: employees.branchId,
                branchName: branches.name,
                hourlyRate: employees.hourlyRate,
                joinedAt: employees.joinedAt,
                isActive: employees.isActive,
                updatedAt: employees.updatedAt,
            }).from(employees)
                .innerJoin(branches, eq(employees.branchId, branches.id))
                .where(branchFilter),
            db.select({
                branchId: attendanceSessions.branchId,
                branchName: branches.name,
                sessions: sql<number>`count(*)`,
                openSessions: sql<number>`sum(case when ${attendanceSessions.status} = 'OPEN' then 1 else 0 end)`,
                totalHours: sql<number>`coalesce(sum(${attendanceSessions.totalHours}), 0)`,
                overtimeMinutes: sql<number>`coalesce(sum(${attendanceSessions.overtimeMinutes}), 0)`,
            }).from(attendanceSessions)
                .innerJoin(branches, eq(attendanceSessions.branchId, branches.id))
                .where(and(
                    sessionBranchFilter,
                    gte(attendanceSessions.clockInAt, periodStart),
                    lte(attendanceSessions.clockInAt, periodEnd),
                ))
                .groupBy(attendanceSessions.branchId, branches.name),
            db.select({
                branchId: attendanceExceptions.branchId,
                openExceptions: sql<number>`count(*)`,
                highSeverity: sql<number>`sum(case when ${attendanceExceptions.severity} in ('HIGH', 'CRITICAL') then 1 else 0 end)`,
            }).from(attendanceExceptions)
                .where(and(
                    exceptionBranchFilter,
                    eq(attendanceExceptions.status, 'OPEN'),
                ))
                .groupBy(attendanceExceptions.branchId),
            db.select({
                day: sql<string>`to_char(${attendanceSessions.clockInAt}, 'YYYY-MM-DD')`,
                sessions: sql<number>`count(*)`,
                openSessions: sql<number>`sum(case when ${attendanceSessions.status} = 'OPEN' then 1 else 0 end)`,
                totalHours: sql<number>`coalesce(sum(${attendanceSessions.totalHours}), 0)`,
                overtimeMinutes: sql<number>`coalesce(sum(${attendanceSessions.overtimeMinutes}), 0)`,
            }).from(attendanceSessions)
                .where(and(
                    sessionBranchFilter,
                    gte(attendanceSessions.clockInAt, periodStart),
                    lte(attendanceSessions.clockInAt, periodEnd),
                ))
                .groupBy(sql`to_char(${attendanceSessions.clockInAt}, 'YYYY-MM-DD')`)
                .orderBy(sql`to_char(${attendanceSessions.clockInAt}, 'YYYY-MM-DD')`),
            db.select({
                id: leaveRequests.id,
                employeeId: leaveRequests.employeeId,
                employeeName: employees.name,
                branchId: employees.branchId,
                branchName: branches.name,
                status: leaveRequests.status,
                startDate: leaveRequests.startDate,
                endDate: leaveRequests.endDate,
                totalDays: leaveRequests.totalDays,
                createdAt: leaveRequests.createdAt,
            }).from(leaveRequests)
                .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
                .innerJoin(branches, eq(employees.branchId, branches.id))
                .where(and(
                    leaveBranchFilter,
                    gte(leaveRequests.startDate, periodStart),
                    lte(leaveRequests.startDate, periodEnd),
                ))
                .orderBy(desc(leaveRequests.startDate)),
            db.select({
                runId: payrollRuns.id,
                cycleId: payrollRuns.cycleId,
                branchId: payrollRuns.branchId,
                branchName: branches.name,
                status: payrollRuns.status,
                totalEmployees: payrollRuns.totalEmployees,
                grossTotal: payrollRuns.grossTotal,
                deductionsTotal: payrollRuns.deductionsTotal,
                netTotal: payrollRuns.netTotal,
                periodStart: payrollCycles.periodStart,
                periodEnd: payrollCycles.periodEnd,
                createdAt: payrollRuns.createdAt,
            }).from(payrollRuns)
                .innerJoin(payrollCycles, eq(payrollRuns.cycleId, payrollCycles.id))
                .innerJoin(branches, eq(payrollRuns.branchId, branches.id))
                .where(and(
                    payrollBranchFilter,
                    lte(payrollCycles.periodStart, periodEnd),
                    gte(payrollCycles.periodEnd, periodStart),
                ))
                .orderBy(desc(payrollCycles.periodEnd))
                .limit(8),
            db.select({
                id: managerApprovals.id,
                branchId: managerApprovals.branchId,
                relatedId: managerApprovals.relatedId,
                actionType: managerApprovals.actionType,
                details: managerApprovals.details,
                createdAt: managerApprovals.createdAt,
            }).from(managerApprovals)
                .where(and(
                    managerBranchFilter,
                    gte(managerApprovals.createdAt, periodStart),
                    lte(managerApprovals.createdAt, periodEnd),
                ))
                .orderBy(desc(managerApprovals.createdAt))
                .limit(300),
            db.select({
                employeeId: attendanceSessions.employeeId,
                branchId: attendanceSessions.branchId,
                count: sql<number>`count(*)`,
            }).from(attendanceSessions)
                .where(and(
                    sessionBranchFilter,
                    eq(attendanceSessions.status, 'OPEN'),
                    gte(attendanceSessions.clockInAt, periodStart),
                    lte(attendanceSessions.clockInAt, periodEnd),
                ))
                .groupBy(attendanceSessions.employeeId, attendanceSessions.branchId),
        ]);

        const branchSeed = new Map<string, any>();
        for (const row of employeeRows) {
            if (!branchSeed.has(row.branchId)) {
                branchSeed.set(row.branchId, makeBranchSummary(row));
            }
            const branch = branchSeed.get(row.branchId)!;
            branch.employees += 1;
            branch.activeEmployees += row.isActive ? 1 : 0;
            branch.inactiveEmployees += row.isActive ? 0 : 1;
            if (row.joinedAt && row.joinedAt >= periodStart && row.joinedAt <= periodEnd) branch.newHires += 1;
        }

        for (const row of branchSessionRows) {
            const branch = branchSeed.get(row.branchId) || makeBranchSummary(row);
            branch.sessions = asNumber(row.sessions);
            branch.openSessions = asNumber(row.openSessions);
            branch.totalHours = asNumber(row.totalHours);
            branch.overtimeMinutes = asNumber(row.overtimeMinutes);
            branchSeed.set(row.branchId, branch);
        }

        for (const row of branchExceptionRows) {
            const branch = branchSeed.get(row.branchId) || makeBranchSummary({ branchId: row.branchId });
            branch.openExceptions = asNumber(row.openExceptions);
            branch.criticalExceptions = asNumber(row.highSeverity);
            branchSeed.set(row.branchId, branch);
        }

        const branchComparison = Array.from(branchSeed.values())
            .sort((a, b) => b.totalHours - a.totalHours)
            .map((item) => ({
                ...item,
                overtimeHours: Math.round((item.overtimeMinutes / 60) * 10) / 10,
                averageHoursPerSession: item.sessions ? Math.round((item.totalHours / item.sessions) * 10) / 10 : 0,
            }));

        const leaveTrendMap = new Map<string, { date: string; pending: number; approved: number; rejected: number; totalDays: number }>();
        for (const row of leaveRows) {
            const date = labelDate(row.startDate) || labelDate(row.createdAt) || '';
            if (!date) continue;
            const current = leaveTrendMap.get(date) || { date, pending: 0, approved: 0, rejected: 0, totalDays: 0 };
            const status = String(row.status || '').toUpperCase();
            if (status === 'APPROVED') current.approved += 1;
            else if (status === 'REJECTED') current.rejected += 1;
            else current.pending += 1;
            current.totalDays += asNumber(row.totalDays);
            leaveTrendMap.set(date, current);
        }

        const payrollVariance = payrollRows
            .map((row, index, rows) => {
                const previous = rows[index + 1];
                const previousNet = asNumber(previous?.netTotal);
                const currentNet = asNumber(row.netTotal);
                return {
                    runId: row.runId,
                    cycleId: row.cycleId,
                    branchId: row.branchId,
                    branchName: row.branchName,
                    status: row.status,
                    totalEmployees: asNumber(row.totalEmployees),
                    grossTotal: asNumber(row.grossTotal),
                    deductionsTotal: asNumber(row.deductionsTotal),
                    netTotal: currentNet,
                    periodStart: labelDate(row.periodStart),
                    periodEnd: labelDate(row.periodEnd),
                    varianceFromPrevious: previous ? Math.round((currentNet - previousNet) * 100) / 100 : 0,
                };
            });

        const performanceItems = performanceRows.filter((item) =>
            ['HR_NOTE', 'HR_WARNING', 'HR_REVIEW', 'HR_PIP'].includes(String(item.actionType || '').toUpperCase())
        );
        const openPerformanceWarnings = performanceItems.filter((item) => {
            const status = String((item.details as any)?.status || 'OPEN').toUpperCase();
            return status !== 'CLOSED';
        });

        const employeeMap = new Map(employeeRows.map((item) => [item.employeeId, item]));
        const riskMap = new Map<string, {
            employeeId: string;
            employeeName: string;
            branchId: string;
            branchName: string;
            openExceptions: number;
            openSessions: number;
            openWarnings: number;
            riskScore: number;
            reasons: string[];
        }>();

        for (const row of openSessionRows) {
            const employee = employeeMap.get(row.employeeId);
            if (!employee) continue;
            riskMap.set(row.employeeId, {
                employeeId: row.employeeId,
                employeeName: employee.employeeName,
                branchId: employee.branchId,
                branchName: employee.branchName,
                openExceptions: 0,
                openSessions: asNumber(row.count),
                openWarnings: 0,
                riskScore: asNumber(row.count) * 2,
                reasons: ['Open attendance sessions'],
            });
        }

        const exceptionRows = await db.select({
            employeeId: attendanceExceptions.employeeId,
            title: attendanceExceptions.title,
            severity: attendanceExceptions.severity,
        }).from(attendanceExceptions)
            .where(and(
                exceptionBranchFilter,
                eq(attendanceExceptions.status, 'OPEN'),
                gte(attendanceExceptions.createdAt, periodStart),
                lte(attendanceExceptions.createdAt, periodEnd),
            ));

        for (const row of exceptionRows) {
            const employeeId = String(row.employeeId || '');
            if (!employeeId) continue;
            const employee = employeeMap.get(employeeId);
            if (!employee) continue;
            const current = riskMap.get(employeeId) || {
                employeeId,
                employeeName: employee.employeeName,
                branchId: employee.branchId,
                branchName: employee.branchName,
                openExceptions: 0,
                openSessions: 0,
                openWarnings: 0,
                riskScore: 0,
                reasons: [],
            };
            current.openExceptions += 1;
            current.riskScore += riskSeverityWeight(row.severity);
            if (row.title) current.reasons.push(String(row.title));
            riskMap.set(employeeId, current);
        }

        for (const item of openPerformanceWarnings) {
            const employeeId = String((item.details as any)?.employeeId || item.relatedId || '');
            if (!employeeId) continue;
            const employee = employeeMap.get(employeeId);
            if (!employee) continue;
            const current = riskMap.get(employeeId) || {
                employeeId,
                employeeName: employee.employeeName,
                branchId: employee.branchId,
                branchName: employee.branchName,
                openExceptions: 0,
                openSessions: 0,
                openWarnings: 0,
                riskScore: 0,
                reasons: [],
            };
            current.openWarnings += 1;
            current.riskScore += String(item.actionType).toUpperCase() === 'HR_WARNING' ? 2 : 1;
            current.reasons.push(String((item.details as any)?.title || item.actionType || 'Performance follow-up'));
            riskMap.set(employeeId, current);
        }

        const totalHours = branchComparison.reduce((sum, item) => sum + asNumber(item.totalHours), 0);
        const totalOvertimeMinutes = branchComparison.reduce((sum, item) => sum + asNumber(item.overtimeMinutes), 0);
        const totalEmployees = branchComparison.reduce((sum, item) => sum + asNumber(item.employees), 0);
        const newHires = branchComparison.reduce((sum, item) => sum + asNumber(item.newHires), 0);
        const inactiveEmployees = branchComparison.reduce((sum, item) => sum + asNumber(item.inactiveEmployees), 0);
        const pendingLeaves = leaveRows.filter((item) => String(item.status || '').toUpperCase() === 'PENDING').length;
        const approvedLeaves = leaveRows.filter((item) => String(item.status || '').toUpperCase() === 'APPROVED').length;
        const grossPayroll = payrollVariance.reduce((sum, item) => sum + asNumber(item.grossTotal), 0);
        const netPayroll = payrollVariance.reduce((sum, item) => sum + asNumber(item.netTotal), 0);

        return {
            branchId: input.branchId || null,
            period: {
                startDate: labelDate(periodStart),
                endDate: labelDate(periodEnd),
            },
            summary: {
                employees: totalEmployees,
                newHires,
                inactiveEmployees,
                totalHours: Math.round(totalHours * 10) / 10,
                overtimeMinutes: totalOvertimeMinutes,
                pendingLeaves,
                approvedLeaves,
                grossPayroll: Math.round(grossPayroll * 100) / 100,
                netPayroll: Math.round(netPayroll * 100) / 100,
                openRiskEmployees: Array.from(riskMap.values()).filter((item) => item.riskScore > 0).length,
            },
            reports: {
                branchComparison,
                dailyWorkforce: dailySessionRows.map((row) => ({
                    date: row.day,
                    sessions: asNumber(row.sessions),
                    openSessions: asNumber(row.openSessions),
                    totalHours: Math.round(asNumber(row.totalHours) * 10) / 10,
                    overtimeMinutes: asNumber(row.overtimeMinutes),
                })),
                leaveTrend: Array.from(leaveTrendMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
                payrollVariance,
                movement: branchComparison.map((item) => ({
                    branchId: item.branchId,
                    branchName: item.branchName,
                    employees: item.employees,
                    activeEmployees: item.activeEmployees,
                    newHires: item.newHires,
                    inactiveEmployees: item.inactiveEmployees,
                })),
                employeeRisk: Array.from(riskMap.values())
                    .sort((a, b) => b.riskScore - a.riskScore)
                    .slice(0, 12)
                    .map((item) => ({
                        ...item,
                        reasons: Array.from(new Set(item.reasons)).slice(0, 4),
                    })),
            },
        };
    },
};
