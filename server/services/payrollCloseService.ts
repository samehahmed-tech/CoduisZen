import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import {
    bonusPenaltyRecords,
    attendanceSessions,
    employeeCompensationItems,
    employeeLoans,
    employeeShiftAssignments,
    employees,
    leaveRequests,
    leaveTypes,
    loanInstallments,
    payrollCycles,
    payrollLocks,
    payrollProfiles,
    payrollPayouts,
    payrollRunLines,
    payrollRuns,
    payslips,
    shiftTemplates,
} from '../../src/db/schema';
import payrollGlPostingService from './payrollGlPostingService';
import eventBusService from './eventBusService';
import payrollCalculationService from './payrollCalculationService';

const makeId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

const normalizeDateOnly = (value: Date | string | null | undefined) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
};

const getWorkDaysInRange = (start: Date, end: Date, workDays: string[]) => {
    const dayMap: Record<string, number> = {
        sun: 0,
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
    };
    const allowed = new Set(workDays.map((day) => dayMap[day]).filter((value) => value !== undefined));
    let count = 0;
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);
    while (cursor <= endDay) {
        if (allowed.has(cursor.getDay())) count += 1;
        cursor.setDate(cursor.getDate() + 1);
    }
    return count;
};

const getActiveShiftTemplate = async (employeeId: string, branchId: string, periodStart: Date, periodEnd: Date) => {
    const periodStartIso = dayKey(periodStart);
    const periodEndIso = dayKey(periodEnd);
    const assignments = await db.select().from(employeeShiftAssignments)
        .where(and(eq(employeeShiftAssignments.employeeId, employeeId), eq(employeeShiftAssignments.branchId, branchId)))
        .orderBy(desc(employeeShiftAssignments.effectiveFrom));

    const activeAssignment = assignments.find((item) => {
        const from = normalizeDateOnly(item.effectiveFrom);
        const to = normalizeDateOnly(item.effectiveTo);
        return Boolean(from && from <= periodEndIso && (!to || to >= periodStartIso));
    });

        if (activeAssignment) {
        const [template] = await db.select().top(1).from(shiftTemplates)
            .where(eq(shiftTemplates.id, activeAssignment.shiftTemplateId));
        if (template?.isActive !== false) return template;
    }

    const [defaultTemplate] = await db.select().top(1).from(shiftTemplates)
        .where(and(eq(shiftTemplates.branchId, branchId), eq(shiftTemplates.code, 'DEFAULT'), eq(shiftTemplates.isActive, true)));
    if (defaultTemplate) return defaultTemplate;

    const [firstActiveTemplate] = await db.select().top(1).from(shiftTemplates)
        .where(and(eq(shiftTemplates.branchId, branchId), eq(shiftTemplates.isActive, true)));
    return firstActiveTemplate || null;
};

const isFlexibleShiftTemplate = (template: typeof shiftTemplates.$inferSelect | null | undefined) => {
    const code = String(template?.code || '').trim().toUpperCase();
    return code === 'FLEXIBLE' || code === 'OPEN_HOURS' || code === 'OPEN';
};

type PreviewResult = {
    cycleId: string;
    branchId: string;
    totals: {
        employees: number;
        gross: number;
        deductions: number;
        net: number;
        blockers: number;
        warnings: number;
    };
    lines: Array<{
        employeeId: string;
        employeeName?: string;
        role?: string | null;
        hasPayrollLine?: boolean;
        baseSalary: number;
        overtime: number;
        bonuses: number;
        penalties: number;
        loanDeductions: number;
        otherDeductions: number;
        grossPay: number;
        netPay: number;
        fixedAllowances?: number;
        fixedDeductions?: number;
        attendanceDeductions?: number;
        compensationItems?: Array<{
            id: string;
            name: string;
            nameAr?: string | null;
            category?: string | null;
            type: string;
            amount: number;
        }>;
        attendance?: {
            sessions: number;
            totalHours: number;
            lateMinutes: number;
            earlyLeaveMinutes: number;
            overtimeMinutes: number;
            openSessions: number;
            exceptionSessions: number;
            crossBranchExits: number;
            expectedWorkDays?: number;
            absenceDays?: number;
        };
        leaves?: {
            approvedDays: number;
            unpaidDays: number;
            pendingDays: number;
        };
        warnings?: string[];
        blockers?: string[];
    }>;
};

export const payrollCloseService = {
    async getLock(branchId: string) {
        const [lock] = await db.select().top(1).from(payrollLocks).where(eq(payrollLocks.branchId, branchId));
        return lock || null;
    },

    async setLock(input: { branchId: string; lockedThrough: Date; lockedBy?: string; reason?: string }) {
        const [existing] = await db.select().top(1).from(payrollLocks).where(eq(payrollLocks.branchId, input.branchId));
        if (existing) {
            const [updated] = await db.update(payrollLocks)
                .set({
                    lockedThrough: input.lockedThrough,
                    lockedBy: input.lockedBy,
                    reason: input.reason,
                    updatedAt: new Date(),
                })
                .output()
                .where(eq(payrollLocks.id, existing.id));
            return updated;
        }

        const [created] = await db.insert(payrollLocks).output().values({
            id: makeId('PRL'),
            branchId: input.branchId,
            lockedThrough: input.lockedThrough,
            lockedBy: input.lockedBy,
            reason: input.reason,
        });
        return created;
    },

    async previewCycle(cycleId: string): Promise<PreviewResult> {
        const [cycle] = await db.select().top(1).from(payrollCycles).where(eq(payrollCycles.id, cycleId));
        if (!cycle) throw new Error('PAYROLL_CYCLE_NOT_FOUND');

        const calculationPreview = await payrollCalculationService.previewCycle(cycleId);
        const payouts = await db.select().from(payrollPayouts).where(eq(payrollPayouts.cycleId, cycleId));
        const cycleEmployees = await db.select().from(employees).where(eq(employees.branchId, cycle.branchId));
        const sessions = await db.select().from(attendanceSessions)
            .where(and(
                eq(attendanceSessions.branchId, cycle.branchId),
                gte(attendanceSessions.clockInAt, cycle.periodStart),
                lte(attendanceSessions.clockInAt, cycle.periodEnd),
            ));
        const leaves = await db.select({
            employeeId: leaveRequests.employeeId,
            status: leaveRequests.status,
            totalDays: leaveRequests.totalDays,
            startDate: leaveRequests.startDate,
            endDate: leaveRequests.endDate,
            leaveTypeId: leaveRequests.leaveTypeId,
            isPaid: leaveTypes.isPaid,
            typeName: leaveTypes.name,
            typeNameAr: leaveTypes.nameAr,
        }).from(leaveRequests)
            .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
            .where(and(
                lte(leaveRequests.startDate, cycle.periodEnd),
                gte(leaveRequests.endDate, cycle.periodStart),
            ));
        const bonusPenalties = await db.select().from(bonusPenaltyRecords)
            .where(and(
                eq(bonusPenaltyRecords.branchId, cycle.branchId),
                eq(bonusPenaltyRecords.status, 'APPROVED'),
                gte(bonusPenaltyRecords.effectiveDate, cycle.periodStart),
                lte(bonusPenaltyRecords.effectiveDate, cycle.periodEnd),
            ));
        const installments = await db.select().from(loanInstallments)
            .innerJoin(employeeLoans, eq(loanInstallments.loanId, employeeLoans.id))
            .where(and(
                eq(employeeLoans.branchId, cycle.branchId),
                eq(loanInstallments.status, 'PENDING'),
                gte(loanInstallments.dueDate, cycle.periodStart),
                lte(loanInstallments.dueDate, cycle.periodEnd),
            ));
        const compensationRows = await db.select().from(employeeCompensationItems)
            .where(and(
                eq(employeeCompensationItems.branchId, cycle.branchId),
                eq(employeeCompensationItems.isActive, true),
            ));

        const payoutByEmployeeId = new Map(payouts.map(payout => [payout.employeeId, payout]));
        const calculatedByEmployeeId = new Map(calculationPreview.lines.map(line => [line.employeeId, line]));
        const employeesToReview = cycleEmployees.filter(employee => employee.isActive !== false);

        const lines: PreviewResult['lines'] = [];

        for (const employee of employeesToReview) {
            const payout = payoutByEmployeeId.get(employee.id);
            const calculatedLine = calculatedByEmployeeId.get(employee.id);
            const employeeBonus = bonusPenalties
                .filter(item => item.employeeId === employee.id && item.type === 'BONUS')
                .reduce((sum, item) => sum + Number(item.amount || 0), 0);
            const employeePenalty = bonusPenalties
                .filter(item => item.employeeId === employee.id && item.type === 'PENALTY')
                .reduce((sum, item) => sum + Number(item.amount || 0), 0);
            const employeeLoans = installments
                .filter(item => item.employee_loans.employeeId === employee.id)
                .reduce((sum, item) => sum + Number(item.loan_installments.amount || 0), 0);
            const employeeCompensationItemsRows = compensationRows.filter(item => item.employeeId === employee.id);

            const baseSalary = Number(calculatedLine?.baseSalary || payout?.basicSalary || 0);
            const overtime = Number(calculatedLine?.overtime || payout?.overtime || 0);
            const fixedAllowances = Number(calculatedLine?.adjustments?.fixedAllowances || 0);
            const fixedDeductions = Number(calculatedLine?.adjustments?.fixedDeductions || 0);
            const attendanceDeductions = Number(calculatedLine?.adjustments?.attendanceDeductions || 0);
            const otherDeductions = attendanceDeductions + fixedDeductions;
            const grossPay = Number(calculatedLine?.grossPay || (baseSalary + overtime + employeeBonus + fixedAllowances));
            const totalDeductions = Number(calculatedLine?.deductions || (employeePenalty + employeeLoans + otherDeductions));
            const netPay = Number(calculatedLine?.netPay || (grossPay - totalDeductions));
            const employeeSessions = sessions.filter(session => session.employeeId === employee.id);
            const employeeLeaves = leaves.filter(leave => leave.employeeId === employee.id);
            const attendanceDays = new Set(employeeSessions.map(session => new Date(session.clockInAt).toISOString().slice(0, 10))).size;
            const activeShiftTemplate = await getActiveShiftTemplate(employee.id, cycle.branchId, new Date(cycle.periodStart), new Date(cycle.periodEnd));
            const expectedWorkDays = isFlexibleShiftTemplate(activeShiftTemplate)
                ? attendanceDays
                : activeShiftTemplate
                ? getWorkDaysInRange(new Date(cycle.periodStart), new Date(cycle.periodEnd), Array.isArray(activeShiftTemplate.workDays) ? activeShiftTemplate.workDays : ['sun', 'mon', 'tue', 'wed', 'thu'])
                : Math.max(1, Math.round((new Date(cycle.periodEnd).getTime() - new Date(cycle.periodStart).getTime()) / 86400000) + 1);
            const approvedLeaveDays = employeeLeaves
                .filter(leave => leave.status === 'APPROVED' && leave.isPaid !== false)
                .reduce((sum, leave) => sum + Number(leave.totalDays || 0), 0);
            const unpaidLeaveDays = employeeLeaves
                .filter(leave => leave.status === 'APPROVED' && leave.isPaid === false)
                .reduce((sum, leave) => sum + Number(leave.totalDays || 0), 0);
            const pendingLeaveDays = employeeLeaves
                .filter(leave => leave.status === 'PENDING')
                .reduce((sum, leave) => sum + Number(leave.totalDays || 0), 0);
            const attendanceSummary = {
                sessions: employeeSessions.length,
                totalHours: employeeSessions.reduce((sum, session) => sum + Number(session.totalHours || 0), 0),
                lateMinutes: employeeSessions.reduce((sum, session) => sum + Number(session.lateMinutes || 0), 0),
                earlyLeaveMinutes: employeeSessions.reduce((sum, session) => sum + Number(session.earlyLeaveMinutes || 0), 0),
                overtimeMinutes: employeeSessions.reduce((sum, session) => sum + Number(session.overtimeMinutes || 0), 0),
                openSessions: employeeSessions.filter(session => session.status === 'OPEN').length,
                exceptionSessions: employeeSessions.filter(session => session.status === 'EXCEPTION').length,
                crossBranchExits: employeeSessions.filter(session => Array.isArray(session.riskFlags) && session.riskFlags.includes('CROSS_BRANCH_EXIT')).length,
                expectedWorkDays,
                absenceDays: Math.max(0, expectedWorkDays - attendanceDays - approvedLeaveDays),
            };
            const warnings = [
                attendanceSummary.crossBranchExits > 0 ? `${attendanceSummary.crossBranchExits} cross-branch exits` : '',
                pendingLeaveDays > 0 ? `${pendingLeaveDays} pending leave days` : '',
                attendanceSummary.absenceDays > 0 ? `${attendanceSummary.absenceDays} estimated absence days` : '',
            ].filter(Boolean);
            const blockers = [
                !payout ? 'Missing payroll calculation' : '',
                attendanceSummary.openSessions > 0 ? `${attendanceSummary.openSessions} open attendance sessions` : '',
                attendanceSummary.exceptionSessions > 0 ? `${attendanceSummary.exceptionSessions} attendance exceptions` : '',
                netPay < 0 ? 'Negative net pay' : '',
            ].filter(Boolean);

            lines.push({
                employeeId: employee.id,
                employeeName: employee?.name,
                role: employee?.role,
                hasPayrollLine: Boolean(payout),
                baseSalary,
                overtime,
                bonuses: employeeBonus,
                penalties: employeePenalty,
                loanDeductions: employeeLoans,
                otherDeductions,
                grossPay,
                netPay,
                fixedAllowances,
                fixedDeductions,
                attendanceDeductions,
                compensationItems: employeeCompensationItemsRows.map(item => ({
                    id: item.id,
                    name: item.name,
                    nameAr: item.nameAr,
                    category: item.category,
                    type: item.type,
                    amount: Number(item.amount || 0),
                })),
                attendance: attendanceSummary,
                leaves: {
                    approvedDays: approvedLeaveDays,
                    unpaidDays: unpaidLeaveDays,
                    pendingDays: pendingLeaveDays,
                },
                warnings,
                blockers,
            });
        }

        const totals = lines.reduce((acc, line) => {
            acc.employees += 1;
            acc.gross += line.grossPay;
            acc.deductions += (line.penalties + line.loanDeductions + line.otherDeductions);
            acc.net += line.netPay;
            acc.blockers += line.blockers?.length || 0;
            acc.warnings += line.warnings?.length || 0;
            return acc;
        }, { employees: 0, gross: 0, deductions: 0, net: 0, blockers: 0, warnings: 0 });

        return {
            cycleId,
            branchId: cycle.branchId,
            totals,
            lines,
        };
    },

    async closeCycle(input: { cycleId: string; closedBy?: string; notes?: string }) {
        const [cycle] = await db.select().top(1).from(payrollCycles).where(eq(payrollCycles.id, input.cycleId));
        if (!cycle) throw new Error('PAYROLL_CYCLE_NOT_FOUND');
        if (cycle.status === 'CLOSED') throw new Error('PAYROLL_CYCLE_ALREADY_CLOSED');

        const [existingRun] = await db.select({ id: payrollRuns.id }).top(1).from(payrollRuns)
            .where(and(eq(payrollRuns.cycleId, input.cycleId), eq(payrollRuns.status, 'CLOSED')));
        if (existingRun) throw new Error('PAYROLL_CYCLE_ALREADY_CLOSED');

        const preview = await this.previewCycle(input.cycleId);
        if (preview.totals.blockers > 0) {
            throw new Error(`PAYROLL_REVIEW_HAS_BLOCKERS:${preview.totals.blockers}`);
        }

        const run = await db.transaction(async (tx) => {
            const [createdRun] = await tx.insert(payrollRuns).output().values({
                id: makeId('PRN'),
                cycleId: input.cycleId,
                branchId: cycle.branchId,
                status: 'CLOSED',
                totalEmployees: preview.totals.employees,
                grossTotal: preview.totals.gross,
                deductionsTotal: preview.totals.deductions,
                netTotal: preview.totals.net,
                createdBy: input.closedBy,
                closedBy: input.closedBy,
                closedAt: new Date(),
                notes: input.notes,
            });

            for (const line of preview.lines) {
                await tx.insert(payrollRunLines).values({
                    id: makeId('PRL'),
                    runId: createdRun.id,
                    employeeId: line.employeeId,
                    baseSalary: line.baseSalary,
                    overtime: line.overtime,
                    bonuses: line.bonuses,
                    penalties: line.penalties,
                    loanDeductions: line.loanDeductions,
                    otherDeductions: line.otherDeductions,
                    grossPay: line.grossPay,
                    netPay: line.netPay,
                    components: {
                        fixedAllowances: line.fixedAllowances || 0,
                        fixedDeductions: line.fixedDeductions || 0,
                        attendanceDeductions: line.attendanceDeductions || 0,
                        bonuses: line.bonuses,
                        penalties: line.penalties,
                        loanDeductions: line.loanDeductions,
                        otherDeductions: line.otherDeductions,
                    },
                });
                await tx.insert(payslips).values({
                    id: makeId('PSL'),
                    runId: createdRun.id,
                    cycleId: input.cycleId,
                    employeeId: line.employeeId,
                    payload: {
                        baseSalary: line.baseSalary,
                        overtime: line.overtime,
                        fixedAllowances: line.fixedAllowances || 0,
                        fixedDeductions: line.fixedDeductions || 0,
                        attendanceDeductions: line.attendanceDeductions || 0,
                        bonuses: line.bonuses,
                        penalties: line.penalties,
                        loanDeductions: line.loanDeductions,
                        otherDeductions: line.otherDeductions,
                        grossPay: line.grossPay,
                        netPay: line.netPay,
                    },
                });
            }

            await tx.update(bonusPenaltyRecords)
                .set({ status: 'APPLIED', updatedAt: new Date() })
                .where(and(
                    eq(bonusPenaltyRecords.branchId, cycle.branchId),
                    eq(bonusPenaltyRecords.status, 'APPROVED'),
                    gte(bonusPenaltyRecords.effectiveDate, cycle.periodStart),
                    lte(bonusPenaltyRecords.effectiveDate, cycle.periodEnd),
                ));

            const branchLoans = await tx.select({ id: employeeLoans.id }).from(employeeLoans)
                .where(eq(employeeLoans.branchId, cycle.branchId));
            if (branchLoans.length) {
                await tx.update(loanInstallments)
                    .set({ status: 'DEDUCTED', paidAt: new Date(), updatedAt: new Date() })
                    .where(and(
                        inArray(loanInstallments.loanId, branchLoans.map(loan => loan.id)),
                        eq(loanInstallments.status, 'PENDING'),
                        gte(loanInstallments.dueDate, cycle.periodStart),
                        lte(loanInstallments.dueDate, cycle.periodEnd),
                    ));
            }

            await tx.update(payrollCycles)
                .set({ status: 'CLOSED', updatedAt: new Date() })
                .where(eq(payrollCycles.id, input.cycleId));

            const [existingLock] = await tx.select().top(1).from(payrollLocks)
                .where(eq(payrollLocks.branchId, cycle.branchId));
            const lockValues = {
                lockedThrough: new Date(cycle.periodEnd),
                lockedBy: input.closedBy,
                reason: `Payroll cycle closed ${input.cycleId}`,
                updatedAt: new Date(),
            };
            if (existingLock) {
                await tx.update(payrollLocks).set(lockValues).where(eq(payrollLocks.id, existingLock.id));
            } else {
                await tx.insert(payrollLocks).values({ id: makeId('PRL'), branchId: cycle.branchId, ...lockValues });
            }
            return createdRun;
        });

        const [profile] = await db.select().from(payrollProfiles)
            .where(and(
                eq(payrollProfiles.branchId, cycle.branchId),
                eq(payrollProfiles.isDefault, true),
                eq(payrollProfiles.isActive, true),
            ))
            .top(1);

        if (profile?.autoPostToGl !== false) {
            await payrollGlPostingService.postPayrollRun(run.id, cycle.branchId, input.closedBy);
        }

        await eventBusService.emitEvent({
            type: 'payroll.closed',
            entityType: 'payroll_cycle',
            entityId: cycle.id,
            branchId: cycle.branchId,
            payload: {
                runId: run.id,
                grossTotal: run.grossTotal,
                netTotal: run.netTotal,
            },
        });

        return run;
    },
};

export default payrollCloseService;
