import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import payrollCalculationService from '../server/services/payrollCalculationService';
import {
    attendanceSessions,
    bonusPenaltyRecords,
    branches,
    employeeLoans,
    employeeShiftAssignments,
    employees,
    loanInstallments,
    payrollComponents,
    payrollCycles,
    payrollPayouts,
    payrollProfiles,
    payrollRules,
    shiftTemplates,
} from '../src/db/schema';

const id = (prefix: string) => `test-${prefix}-${randomUUID().slice(0, 8)}`;

describe('payroll work rules', () => {
    it('uses the branch default shift to calculate expected work days and absence deductions', async () => {
        const branchId = id('branch');
        const employeeId = id('employee');
        const profileId = id('profile');
        const componentId = id('component');
        const shiftId = id('shift');
        const cycleId = id('cycle');

        await db.insert(branches).values({
            id: branchId,
            name: 'Payroll Work Rules Branch',
            location: 'Cairo',
        });
        await db.insert(employees).values({
            id: employeeId,
            branchId,
            name: 'Payroll Work Rules Employee',
            role: 'Cashier',
            basicSalary: 3000,
            hourlyRate: 25,
            isActive: true,
        });
        await db.insert(shiftTemplates).values({
            id: shiftId,
            branchId,
            name: 'Default Test Shift',
            code: 'DEFAULT',
            startTime: '09:00',
            endTime: '17:00',
            workDays: ['sun', 'mon', 'tue', 'wed', 'thu'],
            isActive: true,
        });
        await db.insert(payrollProfiles).values({
            id: profileId,
            branchId,
            name: 'Default Test Payroll',
            code: 'DEFAULT',
            salaryMode: 'MONTHLY',
            defaultOvertimeRate: 1.5,
            isDefault: true,
            isActive: true,
        });
        await db.insert(payrollComponents).values({
            id: componentId,
            branchId,
            code: 'ABSENCE_DEDUCTION_TEST',
            name: 'Absence Deduction Test',
            type: 'DEDUCTION',
            amountType: 'PERCENTAGE',
            calculationBasis: 'BASE_SALARY',
            defaultValue: 3.3333,
            affectsNetPay: true,
        });
        await db.insert(payrollRules).values({
            id: id('rule'),
            payrollProfileId: profileId,
            branchId,
            code: 'ABSENCE_DEDUCTION_RULE_TEST',
            name: 'Deduct absent days',
            triggerType: 'ABSENCE_DAYS',
            operation: 'DEDUCT',
            componentId,
            thresholdValue: 0,
            rateValue: 3.3333,
            priority: 10,
            isActive: true,
        });
        await db.insert(payrollCycles).values({
            id: cycleId,
            branchId,
            periodStart: new Date('2026-05-17T00:00:00.000Z'),
            periodEnd: new Date('2026-05-21T23:59:59.000Z'),
            status: 'DRAFT',
        });
        await db.insert(attendanceSessions).values({
            id: id('session'),
            employeeId,
            branchId,
            sourceType: 'BIOMETRIC_ZK',
            status: 'CLOSED',
            clockInAt: new Date('2026-05-17T09:00:00.000Z'),
            clockOutAt: new Date('2026-05-17T17:00:00.000Z'),
            totalHours: 8,
        });

        const preview = await payrollCalculationService.previewCycle(cycleId);
        const line = preview.lines.find(item => item.employeeId === employeeId);

        expect(line?.attendance.expectedDays).toBe(5);
        expect(line?.attendance.attendanceDays).toBe(1);
        expect(line?.attendance.absenceDays).toBe(4);
        expect(line?.deductions).toBeGreaterThan(399);
        expect(line?.netPay).toBeLessThan(3000);
    });

    it('does not count absences for employees assigned to flexible open hours', async () => {
        const branchId = id('branch');
        const employeeId = id('employee');
        const profileId = id('profile');
        const componentId = id('component');
        const shiftId = id('shift');
        const cycleId = id('cycle');

        await db.insert(branches).values({ id: branchId, name: 'Flexible Branch', location: 'Cairo' });
        await db.insert(employees).values({
            id: employeeId,
            branchId,
            name: 'Flexible Manager',
            role: 'Manager',
            basicSalary: 8000,
            hourlyRate: 50,
            isActive: true,
        });
        await db.insert(shiftTemplates).values({
            id: shiftId,
            branchId,
            name: 'Flexible Open Hours',
            code: 'FLEXIBLE',
            startTime: '00:00',
            endTime: '23:59',
            workDays: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
            isActive: true,
        });
        await db.insert(employeeShiftAssignments).values({
            employeeId,
            branchId,
            shiftTemplateId: shiftId,
            effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
            isPrimary: true,
        });
        await db.insert(payrollProfiles).values({
            id: profileId,
            branchId,
            name: 'Default Test Payroll',
            code: 'DEFAULT',
            salaryMode: 'MONTHLY',
            defaultOvertimeRate: 1.5,
            isDefault: true,
            isActive: true,
        });
        await db.insert(payrollComponents).values({
            id: componentId,
            branchId,
            code: 'ABSENCE_DEDUCTION_TEST',
            name: 'Absence Deduction Test',
            type: 'DEDUCTION',
            amountType: 'PERCENTAGE',
            calculationBasis: 'BASE_SALARY',
            defaultValue: 3.3333,
            affectsNetPay: true,
        });
        await db.insert(payrollRules).values({
            id: id('rule'),
            payrollProfileId: profileId,
            branchId,
            code: 'ABSENCE_DEDUCTION_RULE_TEST',
            name: 'Deduct absent days',
            triggerType: 'ABSENCE_DAYS',
            operation: 'DEDUCT',
            componentId,
            thresholdValue: 0,
            rateValue: 3.3333,
            priority: 10,
            isActive: true,
        });
        await db.insert(payrollCycles).values({
            id: cycleId,
            branchId,
            periodStart: new Date('2026-05-17T00:00:00.000Z'),
            periodEnd: new Date('2026-05-21T23:59:59.000Z'),
            status: 'DRAFT',
        });

        const preview = await payrollCalculationService.previewCycle(cycleId);
        const line = preview.lines.find(item => item.employeeId === employeeId);

        expect(line?.attendance.expectedDays).toBe(0);
        expect(line?.attendance.absenceDays).toBe(0);
        expect(line?.deductions).toBe(0);
        expect(line?.netPay).toBe(8000);
    });

    it('includes approved bonuses, penalties, and loan installments in payroll calculation', async () => {
        const branchId = id('branch');
        const employeeId = id('employee');
        const profileId = id('profile');
        const cycleId = id('cycle');
        const loanId = id('loan');

        await db.insert(branches).values({ id: branchId, name: 'Adjustment Branch', location: 'Alex' });
        await db.insert(employees).values({
            id: employeeId,
            branchId,
            name: 'Adjusted Employee',
            role: 'Supervisor',
            basicSalary: 5000,
            hourlyRate: 40,
            isActive: true,
        });
        await db.insert(payrollProfiles).values({
            id: profileId,
            branchId,
            name: 'Adjustment Payroll',
            code: 'DEFAULT',
            salaryMode: 'MONTHLY',
            defaultOvertimeRate: 1.5,
            isDefault: true,
            isActive: true,
        });
        await db.insert(payrollCycles).values({
            id: cycleId,
            branchId,
            periodStart: new Date('2026-05-01T00:00:00.000Z'),
            periodEnd: new Date('2026-05-31T23:59:59.000Z'),
            status: 'DRAFT',
        });
        await db.insert(bonusPenaltyRecords).values([
            {
                id: id('bonus'),
                employeeId,
                branchId,
                type: 'BONUS',
                status: 'APPROVED',
                amount: 700,
                effectiveDate: new Date('2026-05-10T00:00:00.000Z'),
                reason: 'Target bonus',
            },
            {
                id: id('penalty'),
                employeeId,
                branchId,
                type: 'PENALTY',
                status: 'APPROVED',
                amount: 200,
                effectiveDate: new Date('2026-05-11T00:00:00.000Z'),
                reason: 'Policy penalty',
            },
        ]);
        await db.insert(employeeLoans).values({
            id: loanId,
            employeeId,
            branchId,
            type: 'ADVANCE',
            status: 'APPROVED',
            principalAmount: 1200,
            installmentAmount: 300,
            installmentsCount: 4,
            outstandingAmount: 1200,
        });
        await db.insert(loanInstallments).values({
            loanId,
            dueDate: new Date('2026-05-15T00:00:00.000Z'),
            amount: 300,
            status: 'PENDING',
        });

        const preview = await payrollCalculationService.previewCycle(cycleId);
        const line = preview.lines.find(item => item.employeeId === employeeId);
        expect(line?.baseSalary).toBe(5000);
        expect(line?.adjustments.bonuses).toBe(700);
        expect(line?.adjustments.penalties).toBe(200);
        expect(line?.adjustments.loanDeductions).toBe(300);
        expect(line?.grossPay).toBe(5700);
        expect(line?.deductions).toBe(500);
        expect(line?.netPay).toBe(5200);

        await payrollCalculationService.calculateCycle(cycleId);

        const [payout] = await db.select().from(payrollPayouts).where(eq(payrollPayouts.cycleId, cycleId));
        const [installment] = await db.select().from(loanInstallments).where(eq(loanInstallments.loanId, loanId));
        const linkedRecords = await db.select().from(bonusPenaltyRecords).where(eq(bonusPenaltyRecords.employeeId, employeeId));

        expect(payout?.netPay).toBe(5200);
        expect(installment?.status).toBe('PAID');
        expect(installment?.payrollCycleId).toBe(cycleId);
        expect(linkedRecords.every(record => record.payrollCycleId === cycleId)).toBe(true);
    });
});
