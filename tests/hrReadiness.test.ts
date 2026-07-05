import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { db } from '../server/db';
import attendanceOpsService from '../server/services/attendanceOpsService';
import {
    attendanceDevices,
    attendanceExceptions,
    attendanceRawLogs,
    attendanceSessions,
    bonusPenaltyRecords,
    branches,
    employeeLoans,
    employees,
    leaveRequests,
    leaveTypes,
} from '../src/db/schema';

const id = (prefix: string) => `test-${prefix}-${randomUUID().slice(0, 8)}`;

describe('hr readiness', () => {
    it('flags operational blockers before payroll close', async () => {
        const branchId = id('branch');
        const employeeId = id('employee');
        const leaveTypeId = id('leave-type');
        const deviceId = id('device');
        const leaveId = id('leave');
        const loanId = id('loan');

        await db.insert(branches).values({ id: branchId, name: 'Readiness Branch', location: 'Tanta' });
        await db.insert(employees).values({
            id: employeeId,
            branchId,
            name: 'Missing Code Employee',
            role: 'Cashier',
            basicSalary: 0,
            hourlyRate: 0,
            isActive: true,
        });
        await db.insert(attendanceDevices).values({
            id: deviceId,
            branchId,
            name: 'Offline Device',
            communicationMode: 'BRANCH_BRIDGE',
            branchGatewayId: 'gateway-offline',
            isActive: true,
            notes: JSON.stringify({
                sync: {
                    autoEnabled: false,
                    failureCount: 3,
                    lastError: 'fetch failed',
                    lastAttemptAt: '2026-05-20T10:00:00.000Z',
                    lastSuccessAt: '2026-05-01T10:00:00.000Z',
                    intervalMinutes: 15,
                },
            }),
        });
        await db.insert(attendanceSessions).values({
            id: id('session'),
            employeeId,
            branchId,
            sourceType: 'BIOMETRIC_ZK',
            status: 'OPEN',
            clockInAt: new Date('2026-05-10T08:00:00.000Z'),
            totalHours: 0,
        });
        await db.insert(attendanceRawLogs).values({
            id: id('raw'),
            branchId,
            deviceId,
            employeeIdentifier: '9999',
            deviceUserId: '9999',
            occurredAt: new Date('2026-05-10T08:01:00.000Z'),
            processingStatus: 'PENDING',
            rawPayload: {},
        });
        await db.insert(attendanceExceptions).values({
            id: id('exception'),
            branchId,
            employeeId,
            type: 'UNKNOWN_EMPLOYEE',
            severity: 'HIGH',
            status: 'OPEN',
            title: 'Unknown biometric',
            details: 'Raw attendance log could not be matched',
            metadata: { deviceId, deviceUserId: '9999' },
        });
        await db.insert(leaveTypes).values({
            id: leaveTypeId,
            name: 'Annual Leave',
            daysPerYear: 21,
            isPaid: true,
            requiresApproval: true,
        });
        await db.insert(leaveRequests).values({
            id: leaveId,
            employeeId,
            leaveTypeId,
            startDate: new Date('2026-05-12T00:00:00.000Z'),
            endDate: new Date('2026-05-12T00:00:00.000Z'),
            totalDays: 1,
            status: 'PENDING',
        });
        await db.insert(employeeLoans).values({
            id: loanId,
            employeeId,
            branchId,
            type: 'ADVANCE',
            status: 'PENDING',
            principalAmount: 1000,
            installmentAmount: 250,
            installmentsCount: 4,
            outstandingAmount: 1000,
        });
        await db.insert(bonusPenaltyRecords).values({
            id: id('penalty'),
            employeeId,
            branchId,
            type: 'PENALTY',
            status: 'PENDING',
            amount: 150,
            effectiveDate: new Date('2026-05-14T00:00:00.000Z'),
            reason: 'Review pending',
        });

        const result = await attendanceOpsService.getHrOperationalReadiness({
            branchId,
            startDate: '2026-05-01',
            endDate: '2026-05-31',
        });

        expect(result.canClosePayroll).toBe(false);
        expect(result.status).toBe('NOT_READY');
        expect(result.actions.some(action => action.key === 'bridge_health')).toBe(true);
        expect(result.actions.some(action => action.key === 'missing_codes')).toBe(true);
        expect(result.actions.some(action => action.key === 'unknown_biometrics')).toBe(true);
        expect(result.actions.some(action => action.key === 'open_sessions')).toBe(true);
        expect(result.actions.some(action => action.key === 'pending_leaves')).toBe(true);
        expect(result.actions.some(action => action.key === 'pending_loans')).toBe(true);
        expect(result.actions.some(action => action.key === 'pending_bonus_penalty')).toBe(true);
        expect(result.samples?.failedBridgeDevices?.[0]?.deviceId).toBe(deviceId);
    });
});
