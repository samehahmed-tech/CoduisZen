import { randomUUID } from 'crypto';
import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '../db';
import {
    attendanceSessions,
    bonusPenaltyRecords,
    employeeCompensationItems,
    employeeLoans,
    employeePayrollAssignments,
    employeeShiftAssignments,
    employees,
    leaveRequests,
    leaveTypes,
    loanInstallments,
    payrollComponents,
    payrollCycles,
    payrollPayouts,
    payrollProfiles,
    payrollRules,
    shiftTemplates,
} from '../../src/db/schema';
import eventBusService from './eventBusService';

type PayrollContext = {
    profile: typeof payrollProfiles.$inferSelect | null;
    rules: Array<typeof payrollRules.$inferSelect>;
};

const makeId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

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
    const allowed = new Set(workDays.map((d) => dayMap[d]).filter((v) => v !== undefined));
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

const normalizeDateOnly = (value: Date | string | null | undefined) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
};

const isDateRangeOverlapping = (
    rangeStart: string,
    rangeEnd: string,
    effectiveFrom?: Date | string | null,
    effectiveTo?: Date | string | null,
) => {
    const from = normalizeDateOnly(effectiveFrom);
    const to = normalizeDateOnly(effectiveTo);
    return (!from || from <= rangeEnd) && (!to || to >= rangeStart);
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
        const [template] = await db.select().from(shiftTemplates)
            .where(eq(shiftTemplates.id, activeAssignment.shiftTemplateId))
            .limit(1);
        if (template?.isActive !== false) return template;
    }

    const [defaultTemplate] = await db.select().from(shiftTemplates)
        .where(and(eq(shiftTemplates.branchId, branchId), eq(shiftTemplates.code, 'DEFAULT'), eq(shiftTemplates.isActive, true)))
        .limit(1);
    if (defaultTemplate) return defaultTemplate;

    const [firstActiveTemplate] = await db.select().from(shiftTemplates)
        .where(and(eq(shiftTemplates.branchId, branchId), eq(shiftTemplates.isActive, true)))
        .orderBy(desc(shiftTemplates.createdAt))
        .limit(1);
    return firstActiveTemplate || null;
};

const isFlexibleShiftTemplate = (template: typeof shiftTemplates.$inferSelect | null | undefined) => {
    const code = String(template?.code || '').trim().toUpperCase();
    return code === 'FLEXIBLE' || code === 'OPEN_HOURS' || code === 'OPEN';
};

const calculateRuleAmount = (rule: typeof payrollRules.$inferSelect, component: typeof payrollComponents.$inferSelect | null, baseSalary: number, hourlyRate: number, unitCount: number) => {
    if (!component) return 0;
    let base = 0;
    switch (component.calculationBasis) {
        case 'HOURLY_RATE':
            base = hourlyRate;
            break;
        case 'BASE_SALARY':
        case 'NET_PAY':
        case 'GROSS_PAY':
        default:
            base = baseSalary;
            break;
    }

    let amount = 0;
    if (component.amountType === 'PERCENTAGE') {
        amount = base * (Number(rule.rateValue || 0) / 100);
    } else if (component.amountType === 'FIXED') {
        amount = Number(rule.rateValue || 0);
    } else {
        amount = Number(rule.rateValue || 0);
    }

    return amount * unitCount;
};

const getPayrollContext = async (employeeId: string, branchId: string, periodStart: Date): Promise<PayrollContext> => {
    const dateIso = dayKey(periodStart);
    const assignments = await db.select().from(employeePayrollAssignments)
        .where(eq(employeePayrollAssignments.employeeId, employeeId))
        .orderBy(desc(employeePayrollAssignments.effectiveFrom));

    const assignment = assignments.find((item) => {
        const from = String(item.effectiveFrom);
        const to = item.effectiveTo ? String(item.effectiveTo) : null;
        return from <= dateIso && (!to || to >= dateIso);
    });

    let profile: typeof payrollProfiles.$inferSelect | null = null;
    if (assignment) {
        profile = (await db.select().from(payrollProfiles)
            .where(eq(payrollProfiles.id, assignment.payrollProfileId))
            .limit(1))[0] || null;
    }

    if (!profile) {
        profile = (await db.select().from(payrollProfiles)
            .where(and(eq(payrollProfiles.branchId, branchId), eq(payrollProfiles.isDefault, true), eq(payrollProfiles.isActive, true)))
            .limit(1))[0] || null;
    }

    const rules = profile
        ? await db.select().from(payrollRules).where(and(eq(payrollRules.payrollProfileId, profile.id), eq(payrollRules.isActive, true)))
        : [];

    return { profile, rules };
};

const resolveBasePay = (profile: typeof payrollProfiles.$inferSelect | null, baseSalary: number, hourlyRate: number, totalHours: number, attendanceDays: number, expectedDays: number) => {
    const salaryMode = profile?.salaryMode || 'MONTHLY';
    if (salaryMode === 'HOURLY') {
        return totalHours * hourlyRate;
    }
    if (salaryMode === 'SHIFT') {
        if (expectedDays > 0) {
            return (baseSalary / expectedDays) * attendanceDays;
        }
        return baseSalary;
    }
    if (salaryMode === 'MIXED') {
        return baseSalary + (totalHours * hourlyRate);
    }
    return baseSalary;
};

const buildCycleCalculation = async (cycleId: string) => {
    const [cycle] = await db.select().from(payrollCycles).where(eq(payrollCycles.id, cycleId)).limit(1);
    if (!cycle) throw new Error('PAYROLL_CYCLE_NOT_FOUND');

    const periodStart = new Date(cycle.periodStart);
    const periodEnd = new Date(cycle.periodEnd);

    const allEmployees = await db.select().from(employees).where(eq(employees.isActive, true));
    const sessions = await db.select().from(attendanceSessions)
        .where(and(
            eq(attendanceSessions.branchId, cycle.branchId),
            gte(attendanceSessions.clockInAt, periodStart),
            lte(attendanceSessions.clockInAt, periodEnd),
        ));

    const components = await db.select().from(payrollComponents)
        .where(eq(payrollComponents.branchId, cycle.branchId));
    const componentById = new Map(components.map((c) => [c.id, c]));
    const periodStartIso = dayKey(periodStart);
    const periodEndIso = dayKey(periodEnd);
    const approvedBonusPenaltyRows = await db.select().from(bonusPenaltyRecords)
        .where(and(
            eq(bonusPenaltyRecords.branchId, cycle.branchId),
            eq(bonusPenaltyRecords.status, 'APPROVED'),
            gte(bonusPenaltyRecords.effectiveDate, periodStart),
            lte(bonusPenaltyRecords.effectiveDate, periodEnd),
            or(isNull(bonusPenaltyRecords.payrollCycleId), eq(bonusPenaltyRecords.payrollCycleId, cycle.id)),
        ));
    const activeLoans = await db.select().from(employeeLoans)
        .where(and(
            eq(employeeLoans.branchId, cycle.branchId),
            or(eq(employeeLoans.status, 'APPROVED'), eq(employeeLoans.status, 'DISBURSED')),
        ));
    const activeCompensationItems = await db.select().from(employeeCompensationItems)
        .where(and(
            eq(employeeCompensationItems.branchId, cycle.branchId),
            eq(employeeCompensationItems.isActive, true),
        ));
    const activeLoanById = new Map(activeLoans.map((loan) => [loan.id, loan]));
    const pendingLoanInstallments = activeLoans.length
        ? await db.select().from(loanInstallments)
            .where(and(
                inArray(loanInstallments.loanId, activeLoans.map(loan => loan.id)),
                or(eq(loanInstallments.status, 'PENDING'), eq(loanInstallments.status, 'SCHEDULED')),
                gte(loanInstallments.dueDate, periodStart),
                lte(loanInstallments.dueDate, periodEnd),
                or(isNull(loanInstallments.payrollCycleId), eq(loanInstallments.payrollCycleId, cycle.id)),
            ))
        : [];
    const approvedLeaves = await db.select({
        employeeId: leaveRequests.employeeId,
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
            eq(leaveRequests.status, 'APPROVED'),
            lte(leaveRequests.startDate, periodEnd),
            gte(leaveRequests.endDate, periodStart),
        ));

    const lines: Array<{
        employeeId: string;
        baseSalary: number;
        overtime: number;
        earnings: number;
        deductions: number;
        grossPay: number;
        netPay: number;
        adjustments: {
            attendanceDeductions: number;
            bonuses: number;
            penalties: number;
            loanDeductions: number;
            fixedAllowances: number;
            fixedDeductions: number;
            bonusPenaltyIds: string[];
            loanInstallmentIds: number[];
            compensationItemIds: string[];
        };
        attendance: {
            totalHours: number;
            lateMinutes: number;
            overtimeMinutes: number;
            attendanceDays: number;
            expectedDays: number;
            absenceDays: number;
            paidLeaveDays: number;
            unpaidLeaveDays: number;
        };
    }> = [];

    let totalAmount = 0;

    for (const employee of allEmployees) {
        if (employee.branchId !== cycle.branchId) continue;
        const employeeSessions = sessions.filter(s => s.employeeId === employee.id && s.status !== 'EXCEPTION');
        const totalHours = employeeSessions.reduce((sum, s) => sum + Number(s.totalHours || 0), 0);
        const lateMinutes = employeeSessions.reduce((sum, s) => sum + Number(s.lateMinutes || 0), 0);
        const overtimeMinutes = employeeSessions.reduce((sum, s) => sum + Number(s.overtimeMinutes || 0), 0);

        const context = await getPayrollContext(employee.id, cycle.branchId, periodStart);
        const profile = context.profile;
        const rules = context.rules;

        const hourlyRate = Number(employee.hourlyRate || 0);
        const baseSalary = Number(employee.basicSalary || 0);

        let attendanceDays = new Set(employeeSessions.map((s) => dayKey(new Date(s.clockInAt)))).size;
        let expectedDays = attendanceDays;
        let overtimeRate = profile?.defaultOvertimeRate ?? 1.5;

        const activeShiftTemplate = await getActiveShiftTemplate(employee.id, cycle.branchId, periodStart, periodEnd);
        if (isFlexibleShiftTemplate(activeShiftTemplate)) {
            expectedDays = attendanceDays;
        } else if (activeShiftTemplate) {
            expectedDays = getWorkDaysInRange(periodStart, periodEnd, Array.isArray(activeShiftTemplate.workDays) ? activeShiftTemplate.workDays : ['sun', 'mon', 'tue', 'wed', 'thu']);
        }

        const employeeApprovedLeaves = approvedLeaves.filter(row => row.employeeId === employee.id);
        const paidLeaveDays = employeeApprovedLeaves
            .filter(row => row.isPaid !== false)
            .reduce((sum, row) => sum + Number(row.totalDays || 0), 0);
        const unpaidLeaveDays = employeeApprovedLeaves
            .filter(row => row.isPaid === false)
            .reduce((sum, row) => sum + Number(row.totalDays || 0), 0);
        const absenceDays = Math.max(0, expectedDays - attendanceDays - paidLeaveDays);

        let earnings = 0;
        let deductions = 0;

        for (const rule of rules) {
            let unitCount = 0;
            if (rule.triggerType === 'LATE_MINUTES') {
                unitCount = Math.max(0, lateMinutes - Number(rule.thresholdValue || 0)) / 60;
            } else if (rule.triggerType === 'OVERTIME_MINUTES') {
                unitCount = Math.max(0, overtimeMinutes - Number(rule.thresholdValue || 0)) / 60;
            } else if (rule.triggerType === 'ABSENCE_DAYS') {
                unitCount = Math.max(0, absenceDays - Number(rule.thresholdValue || 0));
            }

            if (unitCount <= 0) continue;
            const component = rule.componentId ? componentById.get(rule.componentId) || null : null;
            const amount = calculateRuleAmount(rule, component, baseSalary, hourlyRate, unitCount);
            if (rule.operation === 'DEDUCT') {
                deductions += amount;
            } else {
                earnings += amount;
            }
        }

        const employeeBonusPenaltyRows = approvedBonusPenaltyRows.filter(row => row.employeeId === employee.id);
        const employeeCompensationRows = activeCompensationItems.filter(row =>
            row.employeeId === employee.id && isDateRangeOverlapping(periodStartIso, periodEndIso, row.effectiveFrom, row.effectiveTo)
        );
        const bonusAmount = employeeBonusPenaltyRows
            .filter(row => String(row.type).toUpperCase() === 'BONUS')
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const penaltyAmount = employeeBonusPenaltyRows
            .filter(row => String(row.type).toUpperCase() !== 'BONUS')
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const fixedAllowanceAmount = employeeCompensationRows
            .filter(row => String(row.type).toUpperCase() === 'ALLOWANCE')
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const fixedDeductionAmount = employeeCompensationRows
            .filter(row => String(row.type).toUpperCase() === 'DEDUCTION')
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const employeeLoanInstallments = pendingLoanInstallments.filter(row => activeLoanById.get(row.loanId)?.employeeId === employee.id);
        const loanDeductionAmount = employeeLoanInstallments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const attendanceDeductions = deductions;
        const totalDeductions = attendanceDeductions + penaltyAmount + loanDeductionAmount + fixedDeductionAmount;
        const overtimePay = (overtimeMinutes / 60) * hourlyRate * overtimeRate;
        const basePay = resolveBasePay(profile, baseSalary, hourlyRate, totalHours, attendanceDays, expectedDays);
        const grossPay = basePay + overtimePay + earnings + bonusAmount + fixedAllowanceAmount;
        const netPay = grossPay - totalDeductions;

        totalAmount += netPay;

        lines.push({
            employeeId: employee.id,
            baseSalary: basePay,
            overtime: overtimePay,
            earnings,
            deductions: totalDeductions,
            grossPay,
            netPay,
            adjustments: {
                attendanceDeductions,
                bonuses: bonusAmount,
                penalties: penaltyAmount,
                loanDeductions: loanDeductionAmount,
                fixedAllowances: fixedAllowanceAmount,
                fixedDeductions: fixedDeductionAmount,
                bonusPenaltyIds: employeeBonusPenaltyRows.map(row => row.id),
                loanInstallmentIds: employeeLoanInstallments.map(row => row.id),
                compensationItemIds: employeeCompensationRows.map(row => row.id),
            },
            attendance: {
                totalHours,
                lateMinutes,
                overtimeMinutes,
                attendanceDays,
                expectedDays,
                absenceDays,
                paidLeaveDays,
                unpaidLeaveDays,
            },
        });
    }

    return { cycle, lines, totalAmount };
};

export const payrollCalculationService = {
    async previewCycle(cycleId: string) {
        const { cycle, lines, totalAmount } = await buildCycleCalculation(cycleId);
        return {
            cycleId: cycle.id,
            branchId: cycle.branchId,
            totalAmount,
            lines,
        };
    },

    async calculateCycle(cycleId: string) {
        const { cycle, lines, totalAmount } = await buildCycleCalculation(cycleId);

        for (const line of lines) {
            const [existing] = await db.select().from(payrollPayouts)
                .where(and(eq(payrollPayouts.cycleId, cycle.id), eq(payrollPayouts.employeeId, line.employeeId)))
                .limit(1);

            if (existing) {
                await db.update(payrollPayouts)
                    .set({
                        basicSalary: line.baseSalary,
                        overtime: line.overtime,
                        deductions: line.deductions,
                        netPay: line.netPay,
                        status: 'PENDING',
                    })
                    .where(eq(payrollPayouts.id, existing.id));
            } else {
                await db.insert(payrollPayouts).values({
                    id: makeId('PPO'),
                    cycleId: cycle.id,
                    employeeId: line.employeeId,
                    basicSalary: line.baseSalary,
                    overtime: line.overtime,
                    deductions: line.deductions,
                    netPay: line.netPay,
                    status: 'PENDING',
                });
            }
        }

        for (const line of lines) {
            if (line.adjustments.bonusPenaltyIds.length) {
                await db.update(bonusPenaltyRecords)
                    .set({ payrollCycleId: cycle.id, updatedAt: new Date() })
                    .where(inArray(bonusPenaltyRecords.id, line.adjustments.bonusPenaltyIds));
            }

            if (line.adjustments.loanInstallmentIds.length) {
                await db.update(loanInstallments)
                    .set({
                        status: 'PAID',
                        payrollCycleId: cycle.id,
                        paidAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(inArray(loanInstallments.id, line.adjustments.loanInstallmentIds));
            }
        }

        await db.update(payrollCycles)
            .set({ totalAmount, updatedAt: new Date() })
            .where(eq(payrollCycles.id, cycle.id));

        await eventBusService.emitEvent({
            type: 'payroll.calculated',
            entityType: 'payroll_cycle',
            entityId: cycle.id,
            branchId: cycle.branchId,
            payload: {
                totalAmount,
                employees: lines.length,
            },
        });

        return { cycleId: cycle.id, totalAmount, lines };
    },
};

export default payrollCalculationService;
