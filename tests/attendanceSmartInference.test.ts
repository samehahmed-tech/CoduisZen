import { describe, expect, it, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import attendanceOpsService from '../server/services/attendanceOpsService';
import { attendanceExceptions, attendancePolicies, attendanceRawLogs, attendanceSessions, branches, employees } from '../src/db/schema';

describe('attendance smart inference', () => {
    beforeEach(async () => {
        await db.insert(branches).values({
            id: 'test-smart-branch',
            name: 'Smart Branch',
            location: 'Cairo',
        });
        await db.insert(branches).values({
            id: 'test-smart-branch-2',
            name: 'Smart Branch 2',
            location: 'Giza',
        });
        await db.insert(employees).values({
            id: 'test-smart-employee',
            branchId: 'test-smart-branch',
            employeeCode: 'EMP-100',
            attendanceCode: '100',
            name: 'Smart Employee',
            role: 'Cashier',
            basicSalary: 5000,
        });
    });

    it('treats the first unknown biometric punch as clock-in', async () => {
        const result = await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'UNKNOWN',
            occurredAt: new Date('2026-05-18T08:00:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        expect(result.duplicate).toBe(false);
        expect(result.session?.status).toBe('OPEN');
        expect(result.rawLog?.eventType).toBe('IN');
        expect((result.rawLog?.rawPayload as any)?.smartInference?.reason).toBe('SMART_FIRST_UNKNOWN_IS_IN');
    });

    it('treats the next useful unknown punch as clock-out', async () => {
        await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'UNKNOWN',
            occurredAt: new Date('2026-05-18T08:00:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        const result = await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'UNKNOWN',
            occurredAt: new Date('2026-05-18T17:05:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        expect(result.duplicate).toBe(false);
        expect(result.rawLog?.eventType).toBe('OUT');
        expect(result.session?.status).toBe('CLOSED');
        expect(result.session?.totalHours).toBeGreaterThan(9);
    });

    it('skips near-duplicate unknown punches without creating another session', async () => {
        await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'UNKNOWN',
            occurredAt: new Date('2026-05-18T08:00:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        const duplicate = await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'UNKNOWN',
            occurredAt: new Date('2026-05-18T08:02:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        const sessions = await db.select().from(attendanceSessions)
            .where(eq(attendanceSessions.employeeId, 'test-smart-employee'));
        const rawLogs = await db.select().from(attendanceRawLogs)
            .where(eq(attendanceRawLogs.employeeId, 'test-smart-employee'));

        expect(duplicate.duplicate).toBe(true);
        expect((duplicate as any).smartDecision.reason).toBe('SMART_DUPLICATE_WITHIN_5_MINUTES');
        expect(sessions).toHaveLength(1);
        expect(rawLogs).toHaveLength(1);
    });

    it('closes an open session when the employee clocks out from another branch', async () => {
        await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'UNKNOWN',
            occurredAt: new Date('2026-05-18T08:00:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        const result = await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch-2',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'UNKNOWN',
            occurredAt: new Date('2026-05-18T17:00:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        expect(result.duplicate).toBe(false);
        expect(result.rawLog?.eventType).toBe('OUT');
        expect(result.session?.status).toBe('CLOSED');
        expect(result.session?.branchId).toBe('test-smart-branch');
        expect(result.session?.riskFlags).toContain('CROSS_BRANCH_EXIT');
    });

    it('treats a late explicit IN as OUT when a device sends all punches as IN', async () => {
        await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'IN',
            occurredAt: new Date('2026-05-18T08:00:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        const result = await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'IN',
            occurredAt: new Date('2026-05-18T17:00:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        expect(result.rawLog?.eventType).toBe('OUT');
        expect(result.session?.status).toBe('CLOSED');
        expect((result.rawLog?.rawPayload as any)?.smartInference?.reason).toBe('SMART_EXPLICIT_IN_WITH_OPEN_SESSION_TREATED_AS_OUT');
    });

    it('does not close a session from a near-duplicate explicit biometric punch', async () => {
        await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'IN',
            occurredAt: new Date('2026-05-18T08:00:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        const duplicate = await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'OUT',
            occurredAt: new Date('2026-05-18T08:02:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        const sessions = await db.select().from(attendanceSessions)
            .where(eq(attendanceSessions.employeeId, 'test-smart-employee'));
        const rawLogs = await db.select().from(attendanceRawLogs)
            .where(eq(attendanceRawLogs.employeeId, 'test-smart-employee'));

        expect(duplicate.duplicate).toBe(true);
        expect((duplicate as any).smartDecision.reason).toBe('SMART_BIOMETRIC_DUPLICATE_WITHIN_5_MINUTES');
        expect(sessions).toHaveLength(1);
        expect(sessions[0].status).toBe('OPEN');
        expect(sessions[0].clockOutAt).toBeNull();
        expect(rawLogs).toHaveLength(1);
    });

    it('keeps after-midnight clock-out on the previous operational day', async () => {
        await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'UNKNOWN',
            occurredAt: new Date('2026-05-18T18:00:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        const result = await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'UNKNOWN',
            occurredAt: new Date('2026-05-19T03:00:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        expect(result.rawLog?.eventType).toBe('OUT');
        expect(result.session?.status).toBe('CLOSED');
        expect(result.session?.totalHours).toBe(9);
    });

    it('does not turn an orphan after-midnight punch into a new clock-in', async () => {
        const result = await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'UNKNOWN',
            occurredAt: new Date('2026-05-19T03:00:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        const sessions = await db.select().from(attendanceSessions)
            .where(eq(attendanceSessions.employeeId, 'test-smart-employee'));
        const exceptions = await db.select().from(attendanceExceptions)
            .where(eq(attendanceExceptions.employeeId, 'test-smart-employee'));

        expect(result.rawLog?.eventType).toBe('OUT');
        expect(result.exception?.type).toBe('MISSING_IN');
        expect(sessions).toHaveLength(0);
        expect(exceptions.some(item => item.type === 'MISSING_IN')).toBe(true);
    });

    it('rebuilds biometric days using an 8am operational-day boundary', async () => {
        await db.insert(attendanceRawLogs).values([
            {
                id: 'raw-night-in',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                eventType: 'UNKNOWN',
                occurredAt: new Date('2026-05-18T18:00:00.000Z') as any,
                deviceOccurredAt: new Date('2026-05-18T18:00:00.000Z') as any,
                dedupeHash: 'raw-night-in-hash',
            },
            {
                id: 'raw-night-out',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                eventType: 'UNKNOWN',
                occurredAt: new Date('2026-05-19T03:00:00.000Z') as any,
                deviceOccurredAt: new Date('2026-05-19T03:00:00.000Z') as any,
                dedupeHash: 'raw-night-out-hash',
            },
        ]);

        const result = await attendanceOpsService.rebuildSmartDailySessions({
            branchId: 'test-smart-branch',
            employeeId: 'test-smart-employee',
            startDate: '2026-05-18',
            endDate: '2026-05-19',
        });

        const sessions = await db.select().from(attendanceSessions)
            .where(eq(attendanceSessions.employeeId, 'test-smart-employee'));

        expect(result.updatedSessions).toBe(1);
        expect(sessions).toHaveLength(1);
        expect(new Date(sessions[0].clockInAt).toISOString()).toBe('2026-05-18T18:00:00.000Z');
        expect(new Date(sessions[0].clockOutAt as any).toISOString()).toBe('2026-05-19T03:00:00.000Z');
        expect(sessions[0].totalHours).toBe(9);
    });

    it('auto rebuilds the previous operational day when only after-midnight raw dates arrive', async () => {
        await db.insert(attendanceRawLogs).values([
            {
                id: 'raw-auto-night-in',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                eventType: 'UNKNOWN',
                occurredAt: new Date('2026-05-18T18:00:00.000Z') as any,
                deviceOccurredAt: new Date('2026-05-18T18:00:00.000Z') as any,
                dedupeHash: 'raw-auto-night-in-hash',
            },
            {
                id: 'raw-auto-night-out',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                eventType: 'UNKNOWN',
                occurredAt: new Date('2026-05-19T03:00:00.000Z') as any,
                deviceOccurredAt: new Date('2026-05-19T03:00:00.000Z') as any,
                dedupeHash: 'raw-auto-night-out-hash',
            },
        ]);

        const result = await attendanceOpsService.rebuildSmartDailySessions({
            branchId: 'test-smart-branch',
            employeeId: 'test-smart-employee',
            startDate: '2026-05-19',
            endDate: '2026-05-19',
        });

        const sessions = await db.select().from(attendanceSessions)
            .where(eq(attendanceSessions.employeeId, 'test-smart-employee'));

        expect(result.updatedSessions).toBe(1);
        expect(sessions).toHaveLength(1);
        expect(new Date(sessions[0].clockInAt).toISOString()).toBe('2026-05-18T18:00:00.000Z');
        expect(new Date(sessions[0].clockOutAt as any).toISOString()).toBe('2026-05-19T03:00:00.000Z');
    });

    it('rebuilds duplicate same-minute punches as one open session, not instant in-out rows', async () => {
        await db.insert(attendanceRawLogs).values([
            {
                id: 'raw-duplicate-a',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                eventType: 'IN',
                occurredAt: new Date('2026-05-20T13:13:00.000Z') as any,
                deviceOccurredAt: new Date('2026-05-20T13:13:00.000Z') as any,
                dedupeHash: 'raw-duplicate-a-hash',
            },
            {
                id: 'raw-duplicate-b',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                eventType: 'OUT',
                occurredAt: new Date('2026-05-20T13:13:30.000Z') as any,
                deviceOccurredAt: new Date('2026-05-20T13:13:30.000Z') as any,
                dedupeHash: 'raw-duplicate-b-hash',
            },
        ]);
        await db.insert(attendanceSessions).values([
            {
                id: 'bad-session-a',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                status: 'CLOSED',
                checkInRawLogId: 'raw-duplicate-a',
                checkOutRawLogId: 'raw-duplicate-b',
                clockInAt: new Date('2026-05-20T13:13:00.000Z') as any,
                clockOutAt: new Date('2026-05-20T13:13:30.000Z') as any,
                totalHours: 0.01,
            },
            {
                id: 'bad-session-b',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                status: 'CLOSED',
                checkInRawLogId: 'raw-duplicate-a',
                checkOutRawLogId: 'raw-duplicate-b',
                clockInAt: new Date('2026-05-20T13:13:00.000Z') as any,
                clockOutAt: new Date('2026-05-20T13:13:30.000Z') as any,
                totalHours: 0.01,
            },
        ]);

        const result = await attendanceOpsService.rebuildSmartDailySessions({
            branchId: 'test-smart-branch',
            employeeId: 'test-smart-employee',
            startDate: '2026-05-20',
            endDate: '2026-05-20',
        });

        const sessions = await db.select().from(attendanceSessions)
            .where(eq(attendanceSessions.employeeId, 'test-smart-employee'));
        const duplicateRaw = await db.select().from(attendanceRawLogs)
            .where(eq(attendanceRawLogs.id, 'raw-duplicate-b'));

        expect(result.updatedSessions).toBe(1);
        expect(sessions).toHaveLength(1);
        expect(sessions[0].status).toBe('OPEN');
        expect(sessions[0].clockOutAt).toBeNull();
        expect(sessions[0].totalHours).toBe(0);
        expect(duplicateRaw[0].processingNotes).toBe('SMART_DAY_DUPLICATE_WITHIN_5_MINUTES');
    });

    it('hides invalid reversed clock-outs and duplicate sessions from daily listing', async () => {
        await db.insert(attendanceSessions).values([
            {
                id: 'bad-visible-session-a',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                status: 'CLOSED',
                clockInAt: new Date('2026-05-31T13:13:00.000Z') as any,
                clockOutAt: new Date('2026-05-31T02:00:00.000Z') as any,
                totalHours: 0,
            },
            {
                id: 'bad-visible-session-b',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                status: 'CLOSED',
                clockInAt: new Date('2026-05-31T13:13:30.000Z') as any,
                clockOutAt: new Date('2026-05-31T02:00:00.000Z') as any,
                totalHours: 0,
            },
        ]);

        const sessions = await attendanceOpsService.listSessions(
            'test-smart-branch',
            undefined,
            '2026-05-31',
            '2026-05-31',
            'test-smart-employee',
        );

        expect(sessions).toHaveLength(1);
        expect(sessions[0].status).toBe('OPEN');
        expect(sessions[0].clockOutAt).toBeNull();
        expect(sessions[0].riskFlags).toContain('INVALID_REVERSED_CLOCKS');
    });

    it('shows overnight shifts on the clock-in operational day, not the raw next day', async () => {
        await db.insert(attendanceSessions).values([
            {
                id: 'night-shift-session',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                status: 'CLOSED',
                clockInAt: new Date('2026-05-31T18:00:00.000Z') as any,
                clockOutAt: new Date('2026-06-01T02:00:00.000Z') as any,
                totalHours: 8,
            },
            {
                id: 'orphan-rollover-out-session',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                status: 'OPEN',
                clockInAt: new Date('2026-06-01T01:30:00.000Z') as any,
                clockOutAt: null,
                totalHours: 0,
            },
        ]);

        const may31Sessions = await attendanceOpsService.listSessions(
            'test-smart-branch',
            undefined,
            '2026-05-31',
            '2026-05-31',
            'test-smart-employee',
        );
        const june1Sessions = await attendanceOpsService.listSessions(
            'test-smart-branch',
            undefined,
            '2026-06-01',
            '2026-06-01',
            'test-smart-employee',
        );

        expect(may31Sessions.map(session => session.id)).toEqual(['night-shift-session']);
        expect(june1Sessions).toHaveLength(0);
    });

    it('supports rolling 24h branches without treating early morning as previous-day exit', async () => {
        await db.insert(attendancePolicies).values({
            id: 'test-rolling-policy',
            branchId: 'test-smart-branch',
            name: '24h Rolling',
            attendanceProcessingMode: 'ROLLING_24H',
            operationalDayStartHour: 8,
            operationalDayEndHour: 5,
            maxSmartSessionHours: 16,
            isDefault: true,
        });

        const result = await attendanceOpsService.ingestRawLog({
            branchId: 'test-smart-branch',
            sourceType: 'BIOMETRIC_ZK',
            eventType: 'UNKNOWN',
            occurredAt: new Date('2026-05-19T03:00:00.000Z'),
            deviceUserId: '100',
            employeeIdentifier: '100',
        });

        expect(result.rawLog?.eventType).toBe('IN');
        expect(result.session?.status).toBe('OPEN');
        expect((result.rawLog?.rawPayload as any)?.smartInference?.reason).toBe('SMART_FIRST_UNKNOWN_IS_IN');
    });

    it('rebuilds rolling 24h branches by pairing sequential safe punches', async () => {
        await db.insert(attendancePolicies).values({
            id: 'test-rolling-rebuild-policy',
            branchId: 'test-smart-branch',
            name: '24h Rolling Rebuild',
            attendanceProcessingMode: 'ROLLING_24H',
            maxSmartSessionHours: 16,
            isDefault: true,
        });

        await db.insert(attendanceRawLogs).values([
            {
                id: 'raw-rolling-in',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                eventType: 'UNKNOWN',
                occurredAt: new Date('2026-05-19T03:00:00.000Z') as any,
                deviceOccurredAt: new Date('2026-05-19T03:00:00.000Z') as any,
                dedupeHash: 'raw-rolling-in-hash',
            },
            {
                id: 'raw-rolling-out',
                employeeId: 'test-smart-employee',
                branchId: 'test-smart-branch',
                sourceType: 'BIOMETRIC_ZK',
                eventType: 'UNKNOWN',
                occurredAt: new Date('2026-05-19T11:00:00.000Z') as any,
                deviceOccurredAt: new Date('2026-05-19T11:00:00.000Z') as any,
                dedupeHash: 'raw-rolling-out-hash',
            },
        ]);

        const result = await attendanceOpsService.rebuildSmartDailySessions({
            branchId: 'test-smart-branch',
            employeeId: 'test-smart-employee',
            startDate: '2026-05-19',
            endDate: '2026-05-19',
        });

        const sessions = await db.select().from(attendanceSessions)
            .where(eq(attendanceSessions.employeeId, 'test-smart-employee'));

        expect(result.updatedSessions).toBe(1);
        expect(sessions).toHaveLength(1);
        expect(new Date(sessions[0].clockInAt).toISOString()).toBe('2026-05-19T03:00:00.000Z');
        expect(new Date(sessions[0].clockOutAt as any).toISOString()).toBe('2026-05-19T11:00:00.000Z');
        expect(sessions[0].totalHours).toBe(8);
    });
});
