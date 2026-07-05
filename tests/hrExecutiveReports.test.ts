import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { db } from '../server/db';
import hrExecutiveReportsService from '../server/services/hrExecutiveReportsService';
import {
    attendanceExceptions,
    attendanceSessions,
    branches,
    employees,
    leaveRequests,
    leaveTypes,
    managerApprovals,
    payrollCycles,
    payrollRuns,
    users,
} from '../src/db/schema';

const id = (prefix: string) => `test-${prefix}-${randomUUID().slice(0, 8)}`;

describe('hr executive reports', () => {
    it('builds branch, leave, payroll, and risk insights for the selected period', async () => {
        const branchId = id('branch');
        const employeeId = id('employee');
        const leaveTypeId = id('leave-type');
        const cycleId = id('cycle');
        const runId = id('run');
        const managerId = id('manager');

        await db.insert(branches).values({
            id: branchId,
            name: 'Samouha',
            location: 'Alex',
            currency: 'EGP',
        });
        await db.insert(users).values({
            id: managerId,
            name: 'HR Manager',
            email: `${managerId}@example.com`,
            role: 'HR',
        });
        await db.insert(employees).values({
            id: employeeId,
            branchId,
            name: 'High Risk Employee',
            role: 'Cashier',
            employeeCode: 'EMP-500',
            hourlyRate: 40,
            basicSalary: 5000,
            joinedAt: new Date('2026-05-05T00:00:00.000Z'),
            isActive: true,
        });
        await db.insert(attendanceSessions).values({
            id: id('session-open'),
            employeeId,
            branchId,
            sourceType: 'BIOMETRIC_ZK',
            status: 'OPEN',
            clockInAt: new Date('2026-05-10T08:00:00.000Z'),
            totalHours: 0,
            overtimeMinutes: 0,
        });
        await db.insert(attendanceSessions).values({
            id: id('session-closed'),
            employeeId,
            branchId,
            sourceType: 'BIOMETRIC_ZK',
            status: 'CLOSED',
            clockInAt: new Date('2026-05-11T08:00:00.000Z'),
            clockOutAt: new Date('2026-05-11T17:00:00.000Z'),
            totalHours: 8,
            overtimeMinutes: 90,
        });
        await db.insert(attendanceExceptions).values({
            id: id('exception'),
            branchId,
            employeeId,
            type: 'MISSING_OUT',
            severity: 'HIGH',
            status: 'OPEN',
            title: 'Missing clock-out',
            details: 'Employee forgot to clock out',
        });
        await db.insert(leaveTypes).values({
            id: leaveTypeId,
            name: 'Annual Leave',
            nameAr: 'إجازة سنوية',
            daysPerYear: 21,
            isPaid: true,
            requiresApproval: true,
        });
        await db.insert(leaveRequests).values({
            id: id('leave'),
            employeeId,
            leaveTypeId,
            startDate: new Date('2026-05-12T00:00:00.000Z'),
            endDate: new Date('2026-05-13T00:00:00.000Z'),
            totalDays: 2,
            status: 'PENDING',
            reason: 'Family',
        });
        await db.insert(managerApprovals).values({
            managerId,
            branchId,
            relatedId: employeeId,
            actionType: 'HR_WARNING',
            reason: 'Follow-up required',
            details: {
                employeeId,
                employeeName: 'High Risk Employee',
                title: 'Repeated lateness',
                status: 'OPEN',
            },
        });
        await db.insert(payrollCycles).values({
            id: cycleId,
            branchId,
            periodStart: new Date('2026-05-01T00:00:00.000Z'),
            periodEnd: new Date('2026-05-31T23:59:59.000Z'),
            status: 'DRAFT',
        });
        await db.insert(payrollRuns).values({
            id: runId,
            cycleId,
            branchId,
            status: 'DRAFT',
            totalEmployees: 1,
            grossTotal: 5800,
            deductionsTotal: 300,
            netTotal: 5500,
        });

        const result = await hrExecutiveReportsService.getExecutiveReports({
            branchId,
            startDate: '2026-05-01',
            endDate: '2026-05-31',
        });

        expect(result.summary.employees).toBe(1);
        expect(result.summary.newHires).toBe(1);
        expect(result.summary.pendingLeaves).toBe(1);
        expect(result.summary.netPayroll).toBe(5500);
        expect(result.reports.branchComparison[0]?.branchId).toBe(branchId);
        expect(result.reports.branchComparison[0]?.openExceptions).toBe(1);
        expect(result.reports.leaveTrend[0]?.pending).toBe(1);
        expect(result.reports.payrollVariance[0]?.netTotal).toBe(5500);
        expect(result.reports.employeeRisk[0]?.employeeId).toBe(employeeId);
        expect(result.reports.employeeRisk[0]?.riskScore).toBeGreaterThan(0);
    });
});
