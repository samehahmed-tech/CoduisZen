import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { db } from '../server/db';
import payrollCalculationService from '../server/services/payrollCalculationService';
import payrollComplianceService from '../server/services/payrollComplianceService';
import {
    attendanceSessions,
    bonusPenaltyRecords,
    branches,
    employees,
    payrollCycles,
    payrollProfiles,
} from '../src/db/schema';

const id = (prefix: string) => `test-${prefix}-${randomUUID().slice(0, 8)}`;

describe('payroll compliance service', () => {
    it('builds a statutory summary with insurance, tax, and missing-data signals', async () => {
        const branchId = id('branch');
        const employeeId = id('employee');
        const cycleId = id('cycle');
        const profileId = id('profile');

        await db.insert(branches).values({
            id: branchId,
            name: 'Compliance Branch',
            location: 'Cairo',
            currency: 'EGP',
        });
        await db.insert(employees).values({
            id: employeeId,
            branchId,
            name: 'Compliance Employee',
            role: 'Cashier',
            employeeCode: 'EMP-100',
            nationalId: '29901010101010',
            basicSalary: 9000,
            hourlyRate: 50,
            isActive: true,
        });
        await db.insert(payrollProfiles).values({
            id: profileId,
            branchId,
            name: 'Compliance Payroll',
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
        await db.insert(attendanceSessions).values({
            id: id('session'),
            employeeId,
            branchId,
            sourceType: 'BIOMETRIC_ZK',
            status: 'CLOSED',
            clockInAt: new Date('2026-05-05T09:00:00.000Z'),
            clockOutAt: new Date('2026-05-05T17:00:00.000Z'),
            totalHours: 8,
            overtimeMinutes: 120,
        });
        await db.insert(bonusPenaltyRecords).values({
            id: id('bonus'),
            employeeId,
            branchId,
            type: 'BONUS',
            status: 'APPROVED',
            amount: 500,
            effectiveDate: new Date('2026-05-10T00:00:00.000Z'),
            reason: 'Performance bonus',
        });

        await payrollCalculationService.calculateCycle(cycleId);
        const summary = await payrollComplianceService.getCycleSummary(cycleId, {
            martyrsContributionRate: '0.001',
        });

        expect(summary.cycle.branchId).toBe(branchId);
        expect(summary.totals.employees).toBe(1);
        expect(summary.totals.employeeInsurance).toBeGreaterThan(0);
        expect(summary.totals.salaryTax).toBeGreaterThanOrEqual(0);
        expect(summary.totals.martyrsContribution).toBeGreaterThan(0);
        expect(summary.totals.missingNationalIds).toBe(0);
        expect(summary.lines[0]?.employeeCode).toBe('EMP-100');
        expect(summary.lines[0]?.netAfterStatutory).toBeLessThan(summary.lines[0]?.payrollNet);
    });

    it('exports compliance templates as csv for payroll and insurance workflows', async () => {
        const branchId = id('branch');
        const employeeId = id('employee');
        const cycleId = id('cycle');
        const profileId = id('profile');

        await db.insert(branches).values({
            id: branchId,
            name: 'Insurance Export Branch',
            location: 'Alex',
            currency: 'EGP',
        });
        await db.insert(employees).values({
            id: employeeId,
            branchId,
            name: 'New Hire Employee',
            role: 'Sales',
            employeeCode: 'EMP-200',
            nationalId: '29902020202020',
            basicSalary: 4500,
            hourlyRate: 30,
            joinedAt: new Date('2026-05-07T00:00:00.000Z'),
            isActive: true,
        });
        await db.insert(payrollProfiles).values({
            id: profileId,
            branchId,
            name: 'Insurance Payroll',
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

        await payrollCalculationService.calculateCycle(cycleId);
        const exported = await payrollComplianceService.exportCycle(cycleId, 'insurance_form_1', 'csv');

        expect(exported.contentType).toContain('text/csv');
        expect(String(exported.body)).toContain('employeeCode');
        expect(String(exported.body)).toContain('EMP-200');
        expect(String(exported.body)).toContain('New Hire Employee');
    });

    it('exports one-click payroll sheet with statutory and operational payroll columns', async () => {
        const branchId = id('branch');
        const employeeId = id('employee');
        const cycleId = id('cycle');
        const profileId = id('profile');

        await db.insert(branches).values({
            id: branchId,
            name: 'Payroll Sheet Branch',
            location: 'Cairo',
            currency: 'EGP',
        });
        await db.insert(employees).values({
            id: employeeId,
            branchId,
            name: 'Sheet Employee',
            role: 'Cashier',
            employeeCode: 'EMP-SHEET',
            nationalId: '29903030303030',
            basicSalary: 8000,
            hourlyRate: 40,
            isActive: true,
        });
        await db.insert(payrollProfiles).values({
            id: profileId,
            branchId,
            name: 'Sheet Payroll',
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

        await payrollCalculationService.calculateCycle(cycleId);
        const exported = await payrollComplianceService.exportCycle(cycleId, 'payroll_sheet', 'csv');
        const body = String(exported.body);

        expect(exported.filename).toContain('payroll_sheet');
        expect(body).toContain('employeeCode');
        expect(body).toContain('employeeInsurance');
        expect(body).toContain('employerCost');
        expect(body).toContain('EMP-SHEET');
        expect(body).toContain('Sheet Employee');
    });
});
