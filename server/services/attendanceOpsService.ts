import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
    attendance,
    attendanceCorrections,
    attendanceDeviceMappings,
    attendanceDevices,
    attendanceExceptions,
    attendanceGeofences,
    attendancePolicies,
    attendanceRawLogs,
    attendanceSessions,
    attendanceSyncRuns,
    bonusPenaltyRecords,
    branches,
    employeeLoans,
    employeeShiftAssignments,
    employeePayrollAssignments,
    employees,
    leaveRequests,
    leaveTypes,
    payrollComponents,
    payrollCycles,
    payrollProfiles,
    payrollRules,
    shiftTemplates,
} from '../../src/db/schema';
import eventBusService from './eventBusService';

const makeId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

const normalizeAttendanceIdentifier = (value?: string | null) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    const withoutLeadingZeros = trimmed.replace(/^0+/, '') || trimmed;
    return withoutLeadingZeros;
};

const getAttendanceIdentifierCandidates = (...values: Array<string | null | undefined>) => {
    const candidates: string[] = [];
    for (const value of values) {
        const trimmed = String(value || '').trim();
        if (!trimmed) continue;
        candidates.push(trimmed);
        const normalized = normalizeAttendanceIdentifier(trimmed);
        if (normalized) candidates.push(normalized);
    }
    return Array.from(new Set(candidates));
};

const getUnknownExceptionIdentifier = (exception: any) => {
    const metadata = exception?.metadata || {};
    const fromMeta = metadata.deviceUserId || metadata.employeeIdentifier;
    if (fromMeta) return String(fromMeta).trim();
    const match = String(exception?.details || '').match(/for\s+(.+)$/i);
    return match?.[1]?.trim() || '';
};

const nullableUserReference = (value?: string | null) => {
    const trimmed = String(value || '').trim();
    if (!trimmed || trimmed === 'system' || trimmed.startsWith('codex-')) return null;
    return trimmed;
};

const parseDeviceNotes = (notes?: string | null) => {
    if (!notes) return {};
    try {
        const parsed = JSON.parse(notes);
        return parsed && typeof parsed === 'object' ? parsed : { text: notes };
    } catch {
        return { text: notes };
    }
};

const getDeviceSyncConfig = (notes?: string | null) => {
    const parsed: any = parseDeviceNotes(notes);
    const sync = parsed.sync || {};
    return {
        autoEnabled: sync.autoEnabled !== false,
        intervalMinutes: Math.max(5, Math.min(Number(sync.intervalMinutes || 15), 1440)),
        failureCount: Math.max(0, Number(sync.failureCount || 0)),
        lastError: sync.lastError || null,
        lastFailedAt: sync.lastFailedAt || null,
        lastSuccessAt: sync.lastSuccessAt || null,
        nextRetryAt: sync.nextRetryAt || null,
        lastAttemptAt: sync.lastAttemptAt || null,
        lastDurationMs: Number(sync.lastDurationMs || 0),
        lastIngested: Number(sync.lastIngested || 0),
        lastSkipped: Number(sync.lastSkipped || 0),
        autoClearAfterSync: sync.autoClearAfterSync === true,
        lastAutoClearAt: sync.lastAutoClearAt || null,
        lastAutoClearError: sync.lastAutoClearError || null,
        initialHistoryLoadedAt: sync.initialHistoryLoadedAt || null,
    };
};

const isFlexibleShiftTemplate = (template: typeof shiftTemplates.$inferSelect | null | undefined) => {
    const code = String(template?.code || '').trim().toUpperCase();
    return code === 'FLEXIBLE' || code === 'OPEN_HOURS' || code === 'OPEN';
};

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const parseDateOnly = (value?: string) => {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
};

const buildDateRange = (startDate?: string, endDate?: string) => {
    const start = parseDateOnly(startDate || undefined);
    if (start) start.setHours(0, 0, 0, 0);
    const end = parseDateOnly(endDate || startDate || undefined);
    if (end) end.setHours(23, 59, 59, 999);
    if (start && end && start > end) {
        const orderedStart = new Date(end);
        orderedStart.setHours(0, 0, 0, 0);
        const orderedEnd = new Date(start);
        orderedEnd.setHours(23, 59, 59, 999);
        return { start: orderedStart, end: orderedEnd };
    }
    return { start, end };
};

const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const enumerateDateKeys = (start?: Date | null, end?: Date | null) => {
    if (!start || !end) return [];
    const keys: string[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const limit = new Date(end);
    limit.setHours(0, 0, 0, 0);
    while (cursor <= limit && keys.length < 62) {
        keys.push(formatDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const distanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const earthRadius = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
};

const parseTimeParts = (value?: string | null) => {
    if (!value) return null;
    const [hoursRaw, minutesRaw] = value.split(':');
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return { hours, minutes };
};

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

const getOperationalDayStartHour = () => {
    const parsed = Number(process.env.ATTENDANCE_OPERATIONAL_DAY_START_HOUR || 8);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 23)) : 8;
};

const getOperationalDayEndHour = () => {
    const parsed = Number(process.env.ATTENDANCE_OPERATIONAL_DAY_END_HOUR || 5);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 23)) : 5;
};

const getMaxSmartSessionHours = () => {
    const parsed = Number(process.env.ATTENDANCE_SMART_MAX_SESSION_HOURS || 22);
    return Number.isFinite(parsed) ? Math.max(4, Math.min(parsed, 30)) : 22;
};

const getOperationalDayKey = (date: Date) => {
    const businessDate = new Date(date);
    if (businessDate.getHours() < getOperationalDayStartHour()) {
        businessDate.setDate(businessDate.getDate() - 1);
    }
    return dayKey(businessDate);
};

const getOperationalWindow = (operationalDay: string) => {
    const start = new Date(operationalDay);
    start.setHours(getOperationalDayStartHour(), 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(getOperationalDayEndHour(), 0, 0, 0);
    if (end <= start) end.setDate(end.getDate() + 1);
    return { start, end };
};

const isRolloverExitPunch = (date: Date) => date.getHours() < getOperationalDayStartHour();

type AttendanceProcessingMode = 'AUTO' | 'OPERATIONAL_DAY' | 'SHIFT_BASED' | 'ROLLING_24H';

type AttendanceProcessingConfig = {
    mode: AttendanceProcessingMode;
    operationalDayStartHour: number;
    operationalDayEndHour: number;
    maxSmartSessionHours: number;
};

const clampHour = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 23)) : fallback;
};

const normalizeProcessingMode = (value?: string | null): AttendanceProcessingMode => {
    const mode = String(value || 'AUTO').trim().toUpperCase();
    if (mode === 'OPERATIONAL_DAY' || mode === 'SHIFT_BASED' || mode === 'ROLLING_24H') return mode;
    return 'AUTO';
};

const getAttendanceProcessingConfig = (context?: AttendanceContext | null): AttendanceProcessingConfig => {
    const policy = context?.policy || {};
    const requestedMode = normalizeProcessingMode(policy.attendanceProcessingMode);
    const mode = requestedMode === 'AUTO'
        ? (context?.template && !isFlexibleShiftTemplate(context.template) ? 'SHIFT_BASED' : 'OPERATIONAL_DAY')
        : requestedMode;
    const maxSmartSessionHours = Number(policy.maxSmartSessionHours ?? getMaxSmartSessionHours());
    return {
        mode,
        operationalDayStartHour: clampHour(policy.operationalDayStartHour, getOperationalDayStartHour()),
        operationalDayEndHour: clampHour(policy.operationalDayEndHour, getOperationalDayEndHour()),
        maxSmartSessionHours: Number.isFinite(maxSmartSessionHours) ? Math.max(4, Math.min(maxSmartSessionHours, 30)) : getMaxSmartSessionHours(),
    };
};

const getOperationalDayKeyForConfig = (date: Date, config: AttendanceProcessingConfig) => {
    const businessDate = new Date(date);
    if (businessDate.getHours() < config.operationalDayStartHour) {
        businessDate.setDate(businessDate.getDate() - 1);
    }
    return dayKey(businessDate);
};

const getOperationalWindowForConfig = (operationalDay: string, config: AttendanceProcessingConfig) => {
    const start = new Date(operationalDay);
    start.setHours(config.operationalDayStartHour, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(config.operationalDayEndHour, 0, 0, 0);
    if (end <= start) end.setDate(end.getDate() + 1);
    return { start, end };
};

const isRolloverExitPunchForConfig = (date: Date, config: AttendanceProcessingConfig) => (
    config.mode === 'OPERATIONAL_DAY' && date.getHours() < config.operationalDayStartHour
);

const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const getWeekdayKey = (date: Date) => dayNames[date.getDay()];

const getSlaMinutes = (severity: string) => {
    switch (severity) {
        case 'CRITICAL':
            return 120;
        case 'HIGH':
            return 360;
        case 'MEDIUM':
            return 1440;
        case 'LOW':
        default:
            return 4320;
    }
};

const buildShiftDateTime = (baseDate: Date, timeValue?: string | null, nextDay = false) => {
    const parts = parseTimeParts(timeValue);
    if (!parts) return null;
    const next = new Date(baseDate);
    next.setHours(parts.hours, parts.minutes, 0, 0);
    if (nextDay) next.setDate(next.getDate() + 1);
    return next;
};

type RawLogInput = {
    branchId: string;
    sourceType: 'BIOMETRIC_ZK' | 'BIOMETRIC_ADMS' | 'LOCATION' | 'FACE_ID' | 'MANUAL_APPROVED';
    eventType: 'IN' | 'OUT' | 'UNKNOWN';
    occurredAt?: string | Date;
    deviceId?: string;
    deviceUserId?: string;
    employeeId?: string;
    employeeIdentifier?: string;
    geoLat?: number;
    geoLng?: number;
    geoAccuracyMeters?: number;
    confidenceScore?: number;
    imageUrl?: string;
    rawPayload?: Record<string, any>;
    syncRunId?: string;
};

type AttendanceContext = {
    assignment: any | null;
    template: any | null;
    policy: any | null;
};

type SmartAttendanceDecision = {
    eventType: 'IN' | 'OUT' | 'UNKNOWN';
    confidence: number;
    reason: string;
    duplicate?: boolean;
    relatedSessionId?: string;
};

const getSmartMinOutAfterInMinutes = () => Number(process.env.ATTENDANCE_SMART_MIN_OUT_AFTER_IN_MINUTES || 30);

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

const getPayrollContextForDate = async (employeeId: string, branchId: string, date: Date) => {
    const dateIso = dayKey(date);
    const assignments = await db.select().from(employeePayrollAssignments)
        .where(eq(employeePayrollAssignments.employeeId, employeeId))
        .orderBy(desc(employeePayrollAssignments.effectiveFrom));

    const assignment = assignments.find((item) => {
        const from = String(item.effectiveFrom);
        const to = item.effectiveTo ? String(item.effectiveTo) : null;
        return from <= dateIso && (!to || to >= dateIso);
    }) || null;

    let profile: typeof payrollProfiles.$inferSelect | null = null;
    if (assignment) {
        profile = (await db.select().top(1).from(payrollProfiles).where(eq(payrollProfiles.id, assignment.payrollProfileId)))[0] || null;
    }

    if (!profile) {
        profile = (await db.select().top(1).from(payrollProfiles).where(and(
            eq(payrollProfiles.branchId, branchId),
            eq(payrollProfiles.isDefault, true),
            eq(payrollProfiles.isActive, true),
        )))[0] || null;
    }

    const rules = profile
        ? await db.select().from(payrollRules).where(and(
            eq(payrollRules.payrollProfileId, profile.id),
            eq(payrollRules.isActive, true),
        ))
        : [];

    return { profile, rules };
};

export const attendanceOpsService = {
    async getAttendanceContext(employeeId: string, branchId: string, occurredAt: Date): Promise<AttendanceContext> {
        const dateIso = occurredAt.toISOString().slice(0, 10);
        const assignments = await db.select().from(employeeShiftAssignments)
            .where(and(
                eq(employeeShiftAssignments.employeeId, employeeId),
                eq(employeeShiftAssignments.branchId, branchId),
            ))
            .orderBy(desc(employeeShiftAssignments.effectiveFrom));

        const assignment = assignments.find((item) => {
            const from = String(item.effectiveFrom);
            const to = item.effectiveTo ? String(item.effectiveTo) : null;
            return from <= dateIso && (!to || to >= dateIso);
        }) || null;

        const template = assignment
            ? (await db.select().top(1).from(shiftTemplates).where(eq(shiftTemplates.id, assignment.shiftTemplateId)))[0] || null
            : null;

        let policy = null;
        try {
            if (template?.attendancePolicyId) {
                policy = (await db.select().top(1).from(attendancePolicies).where(eq(attendancePolicies.id, template.attendancePolicyId)))[0] || null;
            }
            if (!policy) {
                policy = (await db.select().top(1).from(attendancePolicies).where(and(
                    eq(attendancePolicies.branchId, branchId),
                    eq(attendancePolicies.isDefault, true),
                    eq(attendancePolicies.isActive, true),
                )))[0] || null;
            }
        } catch (error: any) {
            console.warn('[attendance-ops] attendance policy lookup failed; using smart defaults', {
                branchId,
                employeeId,
                error: error?.message,
            });
            policy = null;
        }

        return { assignment, template, policy };
    },

    calculateShiftMetrics(clockInAt: Date, clockOutAt: Date | null, context: AttendanceContext) {
        const template = context.template;
        const policy = context.policy;
        if (!template || isFlexibleShiftTemplate(template)) {
            return { lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
        }

        const shiftStart = buildShiftDateTime(clockInAt, template.startTime, false);
        let shiftEnd = buildShiftDateTime(clockInAt, template.endTime, Boolean(template.isOvernight));

        if (!shiftStart || !shiftEnd) {
            return { lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
        }

        if (!template.isOvernight && shiftEnd <= shiftStart) {
            shiftEnd = buildShiftDateTime(clockInAt, template.endTime, true)!;
        }

        const graceLateMinutes = Number(template.graceLateMinutes ?? policy?.graceLateMinutes ?? 15);
        const earlyLeaveToleranceMinutes = Number(template.earlyLeaveToleranceMinutes ?? policy?.earlyLeaveToleranceMinutes ?? 10);
        const overtimeThresholdMinutes = Number(template.overtimeThresholdMinutes ?? policy?.overtimeThresholdMinutes ?? 30);

        const allowedLate = new Date(shiftStart.getTime() + (graceLateMinutes * 60000));
        const lateMinutes = clockInAt > allowedLate
            ? Math.max(0, Math.round((clockInAt.getTime() - allowedLate.getTime()) / 60000))
            : 0;

        if (!clockOutAt) {
            return { lateMinutes, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
        }

        const allowedEarlyLeave = new Date(shiftEnd.getTime() - (earlyLeaveToleranceMinutes * 60000));
        const earlyLeaveMinutes = clockOutAt < allowedEarlyLeave
            ? Math.max(0, Math.round((allowedEarlyLeave.getTime() - clockOutAt.getTime()) / 60000))
            : 0;

        const overtimeStart = new Date(shiftEnd.getTime() + (overtimeThresholdMinutes * 60000));
        const overtimeMinutes = clockOutAt > overtimeStart
            ? Math.max(0, Math.round((clockOutAt.getTime() - overtimeStart.getTime()) / 60000))
            : 0;

        return { lateMinutes, earlyLeaveMinutes, overtimeMinutes };
    },

    async listDevices(branchId?: string) {
        const devices = await db.select().from(attendanceDevices)
            .where(branchId ? eq(attendanceDevices.branchId, branchId) : undefined)
            .orderBy(desc(attendanceDevices.createdAt));
        return devices
            .filter(device => !(parseDeviceNotes(device.notes) as any).archivedAt)
            .map(device => ({
                ...device,
                syncConfig: getDeviceSyncConfig(device.notes),
            }));
    },

    async upsertDevice(input: {
        id?: string;
        branchId: string;
        name: string;
        code?: string;
        vendor?: string;
        model?: string;
        sourceType?: 'BIOMETRIC_ZK' | 'BIOMETRIC_ADMS' | 'LOCATION' | 'FACE_ID';
        ipAddress?: string;
        port?: number;
        serialNumber?: string;
        communicationMode?: string;
        branchGatewayId?: string;
        notes?: string;
        isActive?: boolean;
    }) {
        if (input.id) {
            const [updated] = await db.update(attendanceDevices)
                .set({
                    name: input.name,
                    code: input.code,
                    vendor: input.vendor || 'ZKTeco',
                    model: input.model,
                    sourceType: input.sourceType || 'BIOMETRIC_ZK',
                    ipAddress: input.ipAddress,
                    port: input.port,
                    serialNumber: input.serialNumber,
                    communicationMode: input.communicationMode || 'LAN',
                    branchGatewayId: input.branchGatewayId,
                    notes: input.notes,
                    isActive: input.isActive !== false,
                    updatedAt: new Date(),
                })
            .output()
            .where(eq(attendanceDevices.id, input.id));
            return updated;
        }

        const [created] = await db.insert(attendanceDevices).output().values({
            id: makeId('ATD'),
            branchId: input.branchId,
            name: input.name,
            code: input.code,
            vendor: input.vendor || 'ZKTeco',
            model: input.model,
            sourceType: input.sourceType || 'BIOMETRIC_ZK',
            ipAddress: input.ipAddress,
            port: input.port,
            serialNumber: input.serialNumber,
            communicationMode: input.communicationMode || 'LAN',
            branchGatewayId: input.branchGatewayId,
            notes: input.notes,
            isActive: input.isActive !== false,
        });
        return created;
    },

    async deleteDevice(deviceId: string, deletedBy?: string | null) {
        const [device] = await db.select().top(1).from(attendanceDevices)
            .where(eq(attendanceDevices.id, deviceId));
        if (!device) throw new Error('DEVICE_NOT_FOUND');

        const notes = parseDeviceNotes(device.notes) as any;
        const archivedAt = new Date().toISOString();

        await db.update(attendanceDeviceMappings)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(attendanceDeviceMappings.deviceId, deviceId));

        const [updated] = await db.update(attendanceDevices)
            .set({
                isActive: false,
                notes: JSON.stringify({
                    ...notes,
                    archivedAt,
                    archivedBy: nullableUserReference(deletedBy),
                }),
                updatedAt: new Date(),
            })
            .output()
            .where(eq(attendanceDevices.id, deviceId));

        return { ok: true, deviceId, archivedAt, device: updated };
    },

    async requestBridgeDeviceSync(deviceId: string, requestedBy?: string | null, options: { startDate?: string | null; endDate?: string | null; forceFull?: boolean | null } = {}) {
        const [device] = await db.select().top(1).from(attendanceDevices)
            .where(eq(attendanceDevices.id, deviceId));
        if (!device) throw new Error('DEVICE_NOT_FOUND');
        if (device.communicationMode !== 'BRANCH_BRIDGE') {
            throw new Error('DEVICE_IS_NOT_BRANCH_BRIDGE');
        }
        if (!device.branchGatewayId) {
            throw new Error('BRANCH_GATEWAY_ID_REQUIRED');
        }

        const pendingCommands = await db.select().from(attendanceSyncRuns)
            .where(and(
                eq(attendanceSyncRuns.branchId, device.branchId),
                eq(attendanceSyncRuns.deviceId, device.id),
                eq(attendanceSyncRuns.sourceType, 'BRANCH_BRIDGE_COMMAND'),
            ))
            .orderBy(desc(attendanceSyncRuns.createdAt))
            .offset(0).fetch(10);

        const activeCommand = pendingCommands.find((run: any) => (
            ['QUEUED', 'IN_PROGRESS'].includes(String(run.status || '').toUpperCase())
            && run.metadata?.gatewayId === device.branchGatewayId
        ));
        if (activeCommand) {
            return {
                ok: true,
                commandId: activeCommand.id,
                gatewayId: device.branchGatewayId,
                deviceId: device.id,
                branchId: device.branchId,
                status: activeCommand.status,
                reused: true,
            };
        }

        const syncConfig = getDeviceSyncConfig(device.notes);
        const requestedStart = options.startDate ? new Date(options.startDate) : null;
        const requestedEnd = options.endDate ? new Date(options.endDate) : null;
        const shouldForceFull = Boolean(options.forceFull)
            || (requestedStart !== null && !Number.isNaN(requestedStart.getTime()))
            || !syncConfig.initialHistoryLoadedAt;
        const [latestRawLog] = shouldForceFull
            ? [null]
            : await db.select({ occurredAt: attendanceRawLogs.occurredAt })
                .from(attendanceRawLogs)
                .where(eq(attendanceRawLogs.deviceId, device.id))
                .orderBy(desc(attendanceRawLogs.occurredAt))
                .offset(0).fetch(1);
        const sinceAt = requestedStart && !Number.isNaN(requestedStart.getTime())
            ? requestedStart.toISOString()
            : shouldForceFull
                ? null
                : latestRawLog?.occurredAt ? new Date(latestRawLog.occurredAt).toISOString() : null;
        const untilAt = requestedEnd && !Number.isNaN(requestedEnd.getTime()) ? requestedEnd.toISOString() : null;

        const commandId = `BRG-CMD-${randomUUID().slice(0, 12)}`;
        await db.insert(attendanceSyncRuns).values({
            id: commandId,
            branchId: device.branchId,
            deviceId: device.id,
            sourceType: 'BRANCH_BRIDGE_COMMAND',
            status: 'QUEUED',
            logsReceived: 0,
            logsAccepted: 0,
            logsRejected: 0,
            metadata: {
                command: 'SYNC_DEVICE',
                gatewayId: device.branchGatewayId,
                requestedBy: requestedBy || null,
                requestedAt: new Date().toISOString(),
                sinceAt,
                untilAt,
                forceFull: shouldForceFull,
                autoClearAfterSync: getDeviceSyncConfig(device.notes).autoClearAfterSync === true,
                device: {
                    id: device.id,
                    code: device.code,
                    serialNumber: device.serialNumber,
                    ipAddress: device.ipAddress,
                    port: device.port,
                    name: device.name,
                },
            },
        } as any);

        return {
            ok: true,
            commandId,
            gatewayId: device.branchGatewayId,
            deviceId: device.id,
            branchId: device.branchId,
            status: 'QUEUED',
        };
    },

    async requestBridgePing(deviceId: string, requestedBy?: string | null) {
        const [device] = await db.select().top(1).from(attendanceDevices)
            .where(eq(attendanceDevices.id, deviceId));
        if (!device) throw new Error('DEVICE_NOT_FOUND');
        if (device.communicationMode !== 'BRANCH_BRIDGE') {
            throw new Error('DEVICE_IS_NOT_BRANCH_BRIDGE');
        }
        if (!device.branchGatewayId) {
            throw new Error('BRANCH_GATEWAY_ID_REQUIRED');
        }

        const commandId = `BRG-PING-${randomUUID().slice(0, 12)}`;
        await db.insert(attendanceSyncRuns).values({
            id: commandId,
            branchId: device.branchId,
            deviceId: device.id,
            sourceType: 'BRANCH_BRIDGE_COMMAND',
            status: 'QUEUED',
            logsReceived: 0,
            logsAccepted: 0,
            logsRejected: 0,
            metadata: {
                command: 'PING_BRIDGE',
                gatewayId: device.branchGatewayId,
                requestedBy: nullableUserReference(requestedBy),
                requestedAt: new Date().toISOString(),
                device: {
                    id: device.id,
                    code: device.code,
                    serialNumber: device.serialNumber,
                    ipAddress: device.ipAddress,
                    port: device.port,
                    name: device.name,
                },
            },
        } as any);

        return {
            ok: true,
            commandId,
            gatewayId: device.branchGatewayId,
            deviceId: device.id,
            branchId: device.branchId,
            status: 'QUEUED',
        };
    },

    async requestBridgeDeviceOperation(deviceId: string, command: 'RESTART_DEVICE' | 'CLEAR_DEVICE_LOGS_WITH_BACKUP', requestedBy?: string | null) {
        const [device] = await db.select().top(1).from(attendanceDevices)
            .where(eq(attendanceDevices.id, deviceId));
        if (!device) throw new Error('DEVICE_NOT_FOUND');
        if (device.communicationMode !== 'BRANCH_BRIDGE') {
            throw new Error('DEVICE_IS_NOT_BRANCH_BRIDGE');
        }
        if (!device.branchGatewayId) {
            throw new Error('BRANCH_GATEWAY_ID_REQUIRED');
        }

        const commandId = `BRG-${command === 'RESTART_DEVICE' ? 'RST' : 'CLR'}-${randomUUID().slice(0, 12)}`;
        await db.insert(attendanceSyncRuns).values({
            id: commandId,
            branchId: device.branchId,
            deviceId: device.id,
            sourceType: 'BRANCH_BRIDGE_COMMAND',
            status: 'QUEUED',
            logsReceived: 0,
            logsAccepted: 0,
            logsRejected: 0,
            metadata: {
                command,
                gatewayId: device.branchGatewayId,
                requestedBy: nullableUserReference(requestedBy),
                requestedAt: new Date().toISOString(),
                device: {
                    id: device.id,
                    code: device.code,
                    serialNumber: device.serialNumber,
                    ipAddress: device.ipAddress,
                    port: device.port,
                    name: device.name,
                },
            },
        } as any);

        return {
            ok: true,
            commandId,
            command,
            gatewayId: device.branchGatewayId,
            deviceId: device.id,
            branchId: device.branchId,
            status: 'QUEUED',
        };
    },

    async saveDeviceLogBackup(input: {
        id?: string;
        branchId: string;
        deviceId?: string | null;
        gatewayId?: string | null;
        sourceType?: string;
        operation?: string;
        recordCount: number;
        backupFormat?: string;
        localFilePath?: string | null;
        rawPayload: any;
        createdBy?: string | null;
    }) {
        const id = input.id || makeId('BAK');
        await db.execute(sql`
            insert into attendance_device_log_backups (
                id, branch_id, device_id, gateway_id, source_type, operation,
                record_count, backup_format, local_file_path, raw_payload, created_by, created_at
            ) values (
                ${id},
                ${input.branchId},
                ${input.deviceId || null},
                ${input.gatewayId || null},
                ${input.sourceType || 'BRANCH_BRIDGE'},
                ${input.operation || 'CLEAR_LOGS_BACKUP'},
                ${Math.max(0, Number(input.recordCount || 0))},
                ${input.backupFormat || 'JSON'},
                ${input.localFilePath || null},
                ${JSON.stringify(input.rawPayload)},
                ${nullableUserReference(input.createdBy)},
getdate()
            )
        `);
        return { ok: true, id };
    },

    async getSyncRun(runId: string) {
        const [run] = await db.select().top(1).from(attendanceSyncRuns)
            .where(eq(attendanceSyncRuns.id, runId));
        if (!run) throw new Error('SYNC_RUN_NOT_FOUND');
        return run;
    },

    async upsertGeofence(input: {
        id?: string;
        branchId: string;
        name: string;
        latitude: number;
        longitude: number;
        radiusMeters?: number;
        isActive?: boolean;
    }) {
        if (input.id) {
            const [updated] = await db.update(attendanceGeofences)
                .set({
                    name: input.name,
                    latitude: input.latitude,
                    longitude: input.longitude,
                    radiusMeters: input.radiusMeters || 150,
                    isActive: input.isActive !== false,
                    updatedAt: new Date(),
                })
                .output()
                .where(eq(attendanceGeofences.id, input.id));
            return updated;
        }

        const [created] = await db.insert(attendanceGeofences).output().values({
            id: makeId('GEO'),
            branchId: input.branchId,
            name: input.name,
            latitude: input.latitude,
            longitude: input.longitude,
            radiusMeters: input.radiusMeters || 150,
            isActive: input.isActive !== false,
        });
        return created;
    },

    async listGeofences(branchId?: string) {
        return db.select().from(attendanceGeofences)
            .where(branchId ? eq(attendanceGeofences.branchId, branchId) : undefined)
            .orderBy(desc(attendanceGeofences.createdAt));
    },

    async listRawLogs(branchId?: string, deviceId?: string, limit = 100) {
        return db.select().from(attendanceRawLogs)
            .where(and(
                branchId ? eq(attendanceRawLogs.branchId, branchId) : undefined,
                deviceId ? eq(attendanceRawLogs.deviceId, deviceId) : undefined,
            ))
            .orderBy(desc(attendanceRawLogs.occurredAt))
            .offset(0).fetch(limit);
    },

    async getEmployeeAttendanceProfile(input: {
        employeeId: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
    }) {
        const limit = Math.max(1, Math.min(Number(input.limit || 250), 1000));
        const start = input.startDate ? new Date(input.startDate) : undefined;
        const end = input.endDate ? new Date(input.endDate) : undefined;
        if (end) end.setHours(23, 59, 59, 999);

        const [employee] = await db.select().top(1).from(employees)
            .where(eq(employees.id, input.employeeId));
        if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

        // Auto-process unprocessed raw logs into sessions for better profile view
        const unprocessedLogs = await db.select()
            .top(100)
            .from(attendanceRawLogs)
            .where(and(
                eq(attendanceRawLogs.employeeId, input.employeeId),
                eq(attendanceRawLogs.processingStatus, 'PENDING'),
                start ? gte(attendanceRawLogs.occurredAt, start) : undefined,
                end ? lte(attendanceRawLogs.occurredAt, end) : undefined,
            ));

        for (const log of unprocessedLogs) {
            try {
                await this.ingestRawLog({
                    branchId: log.branchId,
                    sourceType: log.sourceType as any,
                    eventType: log.eventType as any,
                    occurredAt: log.occurredAt,
                    deviceId: log.deviceId || undefined,
                    deviceUserId: log.deviceUserId || undefined,
                    employeeId: log.employeeId || undefined,
                    employeeIdentifier: log.employeeIdentifier || undefined,
                });
            } catch (err: any) {
                console.warn('[ProfileLoad] Failed to process raw log', log.id, err.message);
            }
        }

        const sessions = await db.select({
            id: attendanceSessions.id,
            employeeId: attendanceSessions.employeeId,
            branchId: attendanceSessions.branchId,
            branchName: branches.name,
            sourceType: attendanceSessions.sourceType,
            status: attendanceSessions.status,
            checkInRawLogId: attendanceSessions.checkInRawLogId,
            checkOutRawLogId: attendanceSessions.checkOutRawLogId,
            clockInAt: attendanceSessions.clockInAt,
            clockOutAt: attendanceSessions.clockOutAt,
            totalHours: attendanceSessions.totalHours,
            lateMinutes: attendanceSessions.lateMinutes,
            earlyLeaveMinutes: attendanceSessions.earlyLeaveMinutes,
            overtimeMinutes: attendanceSessions.overtimeMinutes,
            riskFlags: attendanceSessions.riskFlags,
            notes: attendanceSessions.notes,
        }).from(attendanceSessions)
            .leftJoin(branches, eq(attendanceSessions.branchId, branches.id))
            .where(and(
                eq(attendanceSessions.employeeId, input.employeeId),
                start ? gte(attendanceSessions.clockInAt, start) : undefined,
                end ? lte(attendanceSessions.clockInAt, end) : undefined,
            ))
            .orderBy(desc(attendanceSessions.clockInAt))
            .offset(0).fetch(limit);

        const rawLogIdentityConditions = [
            eq(attendanceRawLogs.employeeId, input.employeeId),
            employee.employeeCode ? eq(attendanceRawLogs.employeeIdentifier, employee.employeeCode) : undefined,
            employee.attendanceCode ? eq(attendanceRawLogs.employeeIdentifier, employee.attendanceCode) : undefined,
            employee.attendanceCode ? eq(attendanceRawLogs.deviceUserId, employee.attendanceCode) : undefined,
            employee.employeeCode ? eq(attendanceRawLogs.deviceUserId, employee.employeeCode) : undefined,
        ].filter(Boolean) as any[];

        const rawLogs = await db.select({
            id: attendanceRawLogs.id,
            branchId: attendanceRawLogs.branchId,
            branchName: branches.name,
            deviceId: attendanceRawLogs.deviceId,
            deviceName: attendanceDevices.name,
            sourceType: attendanceRawLogs.sourceType,
            eventType: attendanceRawLogs.eventType,
            employeeIdentifier: attendanceRawLogs.employeeIdentifier,
            deviceUserId: attendanceRawLogs.deviceUserId,
            occurredAt: attendanceRawLogs.occurredAt,
            processingStatus: attendanceRawLogs.processingStatus,
            processingNotes: attendanceRawLogs.processingNotes,
            rawPayload: attendanceRawLogs.rawPayload,
        }).from(attendanceRawLogs)
            .leftJoin(attendanceDevices, eq(attendanceRawLogs.deviceId, attendanceDevices.id))
            .leftJoin(branches, eq(attendanceRawLogs.branchId, branches.id))
            .where(and(
                or(...rawLogIdentityConditions)!,
                start ? gte(attendanceRawLogs.occurredAt, start) : undefined,
                end ? lte(attendanceRawLogs.occurredAt, end) : undefined,
            ))
            .orderBy(desc(attendanceRawLogs.occurredAt))
            .offset(0).fetch(limit);

        const totals = sessions.reduce((acc, session) => {
            acc.totalHours += Number(session.totalHours || 0);
            acc.lateMinutes += Number(session.lateMinutes || 0);
            acc.earlyLeaveMinutes += Number(session.earlyLeaveMinutes || 0);
            acc.overtimeMinutes += Number(session.overtimeMinutes || 0);
            if (session.status === 'OPEN') acc.openSessions += 1;
            if (session.status === 'EXCEPTION') acc.exceptionSessions += 1;
            return acc;
        }, { totalHours: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, openSessions: 0, exceptionSessions: 0 });

        return {
            employee,
            totals,
            sessions,
            rawLogs,
        };
    },

    async recalculateAttendanceSessions(input: {
        branchId?: string;
        employeeId?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
    }) {
        const limit = Math.max(1, Math.min(Number(input.limit || 1000), 5000));
        const start = input.startDate ? new Date(input.startDate) : undefined;
        const end = input.endDate ? new Date(input.endDate) : undefined;
        if (start) start.setDate(start.getDate() - 1);
        if (end) end.setHours(23, 59, 59, 999);

        const sessions = await db.select().from(attendanceSessions)
            .where(and(
                input.branchId ? eq(attendanceSessions.branchId, input.branchId) : undefined,
                input.employeeId ? eq(attendanceSessions.employeeId, input.employeeId) : undefined,
                start ? gte(attendanceSessions.clockInAt, start) : undefined,
                end ? lte(attendanceSessions.clockInAt, end) : undefined,
            ))
            .orderBy(desc(attendanceSessions.clockInAt))
            .offset(0).fetch(limit);

        let updated = 0;
        let flexibleSessions = 0;
        let openSessions = 0;
        for (const session of sessions) {
            const clockInAt = new Date(session.clockInAt);
            const clockOutAt = session.clockOutAt ? new Date(session.clockOutAt) : null;
            const context = await this.getAttendanceContext(session.employeeId, session.branchId, clockInAt);
            const metrics = this.calculateShiftMetrics(clockInAt, clockOutAt, context);
            const totalHours = clockOutAt
                ? Number(Math.max(0, (clockOutAt.getTime() - clockInAt.getTime()) / 3600000).toFixed(2))
                : Number(session.totalHours || 0);
            if (!clockOutAt) openSessions += 1;
            if (isFlexibleShiftTemplate(context.template)) flexibleSessions += 1;

            await db.update(attendanceSessions)
                .set({
                    totalHours,
                    lateMinutes: metrics.lateMinutes,
                    earlyLeaveMinutes: metrics.earlyLeaveMinutes,
                    overtimeMinutes: metrics.overtimeMinutes,
                    updatedAt: new Date(),
                })
                .where(eq(attendanceSessions.id, session.id));
            updated += 1;
        }

        await eventBusService.emitEvent({
            type: 'attendance.recalculated',
            entityType: 'attendance_sessions',
            entityId: input.branchId || input.employeeId || 'all',
            branchId: input.branchId,
            payload: { processed: sessions.length, updated, flexibleSessions, openSessions },
        });

        return { processed: sessions.length, updated, flexibleSessions, openSessions };
    },

    async rebuildSmartDailySessions(input: {
        branchId?: string;
        employeeId?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
    }) {
        const limit = Math.max(1, Math.min(Number(input.limit || 5000), 10000));
        const start = input.startDate ? new Date(input.startDate) : undefined;
        const end = input.endDate ? new Date(input.endDate) : undefined;
        if (start) start.setDate(start.getDate() - 1);
        if (end) end.setHours(23, 59, 59, 999);

        const logs = await db.select().from(attendanceRawLogs)
            .where(and(
                input.branchId ? eq(attendanceRawLogs.branchId, input.branchId) : undefined,
                input.employeeId ? eq(attendanceRawLogs.employeeId, input.employeeId) : undefined,
                start ? gte(attendanceRawLogs.occurredAt, start) : undefined,
                end ? lte(attendanceRawLogs.occurredAt, end) : undefined,
            ))
            .orderBy(attendanceRawLogs.occurredAt)
            .offset(0).fetch(limit);

        const knownLogs = logs.filter(log => log.employeeId);
        const groups = new Map<string, typeof knownLogs>();
        const rollingGroups = new Map<string, typeof knownLogs>();
        const groupConfigs = new Map<string, AttendanceProcessingConfig>();
        for (const log of knownLogs) {
            const occurredAt = new Date(log.occurredAt);
            const context = await this.getAttendanceContext(log.employeeId!, log.branchId, occurredAt);
            const processingConfig = getAttendanceProcessingConfig(context);
            if (processingConfig.mode === 'ROLLING_24H') {
                const key = `${log.employeeId}:${log.branchId}:ROLLING`;
                const list = rollingGroups.get(key) || [];
                list.push(log);
                rollingGroups.set(key, list);
                groupConfigs.set(key, processingConfig);
                continue;
            }
            const key = `${log.employeeId}:${getOperationalDayKeyForConfig(occurredAt, processingConfig)}`;
            const list = groups.get(key) || [];
            list.push(log);
            groups.set(key, list);
            groupConfigs.set(key, processingConfig);
        }

        let processedDays = 0;
        let updatedSessions = 0;
        let ignoredDuplicates = 0;
        let reviewExceptions = 0;
        let suspiciousSessions = 0;
        const duplicateWindowMinutes = Number(process.env.ATTENDANCE_SMART_DUPLICATE_WINDOW_MINUTES || 5);
        const duplicateWindowMs = duplicateWindowMinutes * 60000;
        for (const [groupKey, groupLogs] of groups.entries()) {
            const sorted = [...groupLogs].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
            const compacted: typeof sorted = [];
            const duplicateRawLogIds: string[] = [];
            for (const log of sorted) {
                const previous = compacted[compacted.length - 1];
                const minutesFromPrevious = previous
                    ? Math.abs(new Date(log.occurredAt).getTime() - new Date(previous.occurredAt).getTime())
                    : Number.POSITIVE_INFINITY;
                if (
                    previous &&
                    previous.employeeId === log.employeeId &&
                    previous.branchId === log.branchId &&
                    minutesFromPrevious <= duplicateWindowMs
                ) {
                    duplicateRawLogIds.push(log.id);
                    continue;
                }
                compacted.push(log);
            }
            if (duplicateRawLogIds.length) {
                await db.update(attendanceRawLogs)
                    .set({
                        eventType: 'UNKNOWN',
                        processingStatus: 'PROCESSED',
                        processingNotes: `SMART_DAY_DUPLICATE_WITHIN_${duplicateWindowMinutes}_MINUTES`,
                        updatedAt: new Date(),
                    })
                    .where(inArray(attendanceRawLogs.id, duplicateRawLogIds));
                ignoredDuplicates += duplicateRawLogIds.length;
            }
            const first = compacted[0];
            const last = compacted[compacted.length - 1];
            if (!first?.employeeId) continue;

            const processingConfig = groupConfigs.get(groupKey) || getAttendanceProcessingConfig();
            const operationalDay = groupKey.split(':').slice(1).join(':');
            const { start: dayStart, end: dayEnd } = getOperationalWindowForConfig(operationalDay, processingConfig);
            const clockInAt = new Date(first.occurredAt);
            let clockOutAt = last.id !== first.id ? new Date(last.occurredAt) : null;
            const singlePunch = compacted.length === 1;
            const singleRolloverExit = singlePunch && isRolloverExitPunchForConfig(clockInAt, processingConfig);
            let suspiciousLongSession = false;

            if (singleRolloverExit) {
                await db.update(attendanceRawLogs)
                    .set({
                        eventType: 'OUT',
                        processingStatus: 'REJECTED',
                        processingNotes: 'SMART_ROLLOVER_OUT_WITHOUT_IN',
                        updatedAt: new Date(),
                    })
                    .where(eq(attendanceRawLogs.id, first.id));

                const [existingException] = await db.select().from(attendanceExceptions)
                    .where(and(
                        eq(attendanceExceptions.rawLogId, first.id),
                        eq(attendanceExceptions.type, 'MISSING_IN'),
                    ))
                    .top(1);
                if (!existingException) {
                    await this.createException({
                        employeeId: first.employeeId,
                        branchId: first.branchId,
                        rawLogId: first.id,
                        type: 'MISSING_IN',
                        severity: 'HIGH',
                        title: 'Early-morning clock-out has no matching clock-in',
                        details: 'This punch falls in the after-midnight closing window, so it was treated as an exit that needs review instead of a new day clock-in.',
                        metadata: {
                            operationalDay,
                            occurredAt: first.occurredAt,
                            reason: 'SMART_ROLLOVER_OUT_WITHOUT_IN',
                        },
                    });
                    reviewExceptions += 1;
                }
                processedDays += 1;
                continue;
            }

            if (clockOutAt) {
                const sessionHours = (clockOutAt.getTime() - clockInAt.getTime()) / 3600000;
                if (sessionHours > processingConfig.maxSmartSessionHours) {
                    clockOutAt = null;
                    suspiciousLongSession = true;
                    suspiciousSessions += 1;
                }
            }

            const context = await this.getAttendanceContext(first.employeeId, first.branchId, clockInAt);
            const metrics = this.calculateShiftMetrics(clockInAt, clockOutAt, context);
            const totalHours = clockOutAt
                ? Number(Math.max(0, (clockOutAt.getTime() - clockInAt.getTime()) / 3600000).toFixed(2))
                : 0;

            const existingSessions = await db.select().from(attendanceSessions)
                .where(and(
                    eq(attendanceSessions.employeeId, first.employeeId),
                    gte(attendanceSessions.clockInAt, dayStart),
                    lte(attendanceSessions.clockInAt, dayEnd),
                ))
                .orderBy(attendanceSessions.clockInAt);
            const existingSession = existingSessions[0];
            const duplicateSessionIds = existingSessions.slice(1).map(session => session.id);

            const sessionPatch = {
                branchId: first.branchId,
                sourceType: first.sourceType,
                status: clockOutAt ? 'CLOSED' : 'OPEN',
                checkInRawLogId: first.id,
                checkOutRawLogId: clockOutAt ? last.id : null,
                clockInAt,
                clockOutAt: clockOutAt || null,
                totalHours,
                lateMinutes: metrics.lateMinutes,
                earlyLeaveMinutes: metrics.earlyLeaveMinutes,
                overtimeMinutes: metrics.overtimeMinutes,
                riskFlags: [
                    ...(singlePunch ? ['MISSING_OUT'] : []),
                    ...(suspiciousLongSession ? ['SUSPICIOUS_LONG_SESSION'] : []),
                ],
                notes: `Smart rebuilt from operational day ${operationalDay}: first punch is IN and last valid punch is OUT`,
                updatedAt: new Date(),
            } as any;

            if (existingSession) {
                await db.update(attendanceSessions)
                    .set(sessionPatch)
                    .where(eq(attendanceSessions.id, existingSession.id));
                if (duplicateSessionIds.length) {
                    await db.delete(attendanceSessions)
                        .where(inArray(attendanceSessions.id, duplicateSessionIds));
                    ignoredDuplicates += duplicateSessionIds.length;
                }
            } else {
                await db.insert(attendanceSessions).values({
                    id: makeId('SES'),
                    employeeId: first.employeeId,
                    ...sessionPatch,
                });
            }

            await db.update(attendanceRawLogs)
                .set({ eventType: 'IN', processingStatus: 'PROCESSED', processingNotes: 'SMART_DAY_FIRST_IN', updatedAt: new Date() })
                .where(eq(attendanceRawLogs.id, first.id));
            if (clockOutAt) {
                await db.update(attendanceRawLogs)
                    .set({ eventType: 'OUT', processingStatus: 'PROCESSED', processingNotes: 'SMART_DAY_LAST_OUT', updatedAt: new Date() })
                    .where(eq(attendanceRawLogs.id, last.id));
            } else if (singlePunch || suspiciousLongSession) {
                if (suspiciousLongSession && last.id !== first.id) {
                    await db.update(attendanceRawLogs)
                        .set({
                            eventType: 'UNKNOWN',
                            processingStatus: 'REJECTED',
                            processingNotes: 'SMART_SUSPICIOUS_LONG_SESSION_NEEDS_REVIEW',
                            updatedAt: new Date(),
                        })
                        .where(eq(attendanceRawLogs.id, last.id));
                }
                const [existingException] = await db.select()
                    .top(1)
                    .from(attendanceExceptions)
                    .where(and(
                        eq(attendanceExceptions.rawLogId, suspiciousLongSession ? last.id : first.id),
                        eq(attendanceExceptions.type, 'MISSING_OUT'),
                    ));
                if (!existingException) {
                    await this.createException({
                        employeeId: first.employeeId,
                        branchId: first.branchId,
                        rawLogId: suspiciousLongSession ? last.id : first.id,
                        type: 'MISSING_OUT',
                        severity: suspiciousLongSession ? 'HIGH' : 'MEDIUM',
                        title: suspiciousLongSession ? 'Suspiciously long biometric session needs review' : 'Only one punch found for the operational day',
                        details: suspiciousLongSession
                            ? 'The first and last punches are too far apart to close automatically, so the session stayed open and the later punch was marked for review.'
                            : 'The system opened the session from this punch and marked it for review because no matching exit punch was found.',
                        metadata: {
                            operationalDay,
                            occurredAt: suspiciousLongSession ? last.occurredAt : first.occurredAt,
                            reason: suspiciousLongSession ? 'SMART_SUSPICIOUS_LONG_SESSION_NEEDS_REVIEW' : 'SMART_SINGLE_PUNCH_MISSING_OUT',
                        },
                    });
                    reviewExceptions += 1;
                }
            }
            const middleIds = compacted
                .slice(1, suspiciousLongSession ? undefined : -1)
                .filter(log => log.id !== last.id || !suspiciousLongSession)
                .map(log => log.id);
            if (middleIds.length) {
                await db.update(attendanceRawLogs)
                    .set({ eventType: 'UNKNOWN', processingStatus: 'PROCESSED', processingNotes: 'SMART_DAY_MIDDLE_IGNORED', updatedAt: new Date() })
                    .where(inArray(attendanceRawLogs.id, middleIds));
                ignoredDuplicates += middleIds.length;
            }

            processedDays += 1;
            updatedSessions += 1;
        }

        const minOutAfterInMinutes = getSmartMinOutAfterInMinutes();
        for (const [groupKey, groupLogs] of rollingGroups.entries()) {
            const processingConfig = groupConfigs.get(groupKey) || getAttendanceProcessingConfig();
            const sorted = [...groupLogs].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
            let openFirst: typeof sorted[number] | null = null;

            const createOrUpdateOpenSession = async (firstLog: typeof sorted[number], reason: string) => {
                if (!firstLog?.employeeId) return;
                const clockInAt = new Date(firstLog.occurredAt);
                const context = await this.getAttendanceContext(firstLog.employeeId, firstLog.branchId, clockInAt);
                const metrics = this.calculateShiftMetrics(clockInAt, null, context);
                const [existingSession] = await db.select()
                    .top(1)
                    .from(attendanceSessions)
                    .where(and(
                        eq(attendanceSessions.employeeId, firstLog.employeeId),
                        gte(attendanceSessions.clockInAt, new Date(clockInAt.getTime() - duplicateWindowMinutes * 60000)),
                        lte(attendanceSessions.clockInAt, new Date(clockInAt.getTime() + duplicateWindowMinutes * 60000)),
                    ));

                const sessionPatch = {
                    branchId: firstLog.branchId,
                    sourceType: firstLog.sourceType,
                    status: 'OPEN',
                    checkInRawLogId: firstLog.id,
                    clockInAt,
                    clockOutAt: undefined,
                    checkOutRawLogId: undefined,
                    totalHours: 0,
                    lateMinutes: metrics.lateMinutes,
                    earlyLeaveMinutes: metrics.earlyLeaveMinutes,
                    overtimeMinutes: metrics.overtimeMinutes,
                    riskFlags: ['MISSING_OUT'],
                    notes: `Smart rolling 24h session opened from biometric punch: ${reason}`,
                    updatedAt: new Date(),
                } as any;

                if (existingSession) {
                    await db.update(attendanceSessions)
                        .set(sessionPatch)
                        .where(eq(attendanceSessions.id, existingSession.id));
                } else {
                    await db.insert(attendanceSessions).values({
                        id: makeId('SES'),
                        employeeId: firstLog.employeeId,
                        ...sessionPatch,
                    });
                }

                await db.update(attendanceRawLogs)
                    .set({ eventType: 'IN', processingStatus: 'PROCESSED', processingNotes: reason, updatedAt: new Date() })
                    .where(eq(attendanceRawLogs.id, firstLog.id));

                const [existingException] = await db.select()
                    .top(1)
                    .from(attendanceExceptions)
                    .where(and(
                        eq(attendanceExceptions.rawLogId, firstLog.id),
                        eq(attendanceExceptions.type, 'MISSING_OUT'),
                    ));
                if (!existingException) {
                    await this.createException({
                        employeeId: firstLog.employeeId,
                        branchId: firstLog.branchId,
                        rawLogId: firstLog.id,
                        type: 'MISSING_OUT',
                        severity: reason === 'SMART_ROLLING_LONG_SESSION_NEEDS_REVIEW' ? 'HIGH' : 'MEDIUM',
                        title: 'Rolling 24h biometric session needs review',
                        details: 'The system could not find a safe matching exit punch within the configured 24h rolling session window.',
                        metadata: { reason, maxSmartSessionHours: processingConfig.maxSmartSessionHours },
                    });
                    reviewExceptions += 1;
                }
            };

            const closePair = async (firstLog: typeof sorted[number], lastLog: typeof sorted[number]) => {
                if (!firstLog?.employeeId) return;
                const clockInAt = new Date(firstLog.occurredAt);
                const clockOutAt = new Date(lastLog.occurredAt);
                const context = await this.getAttendanceContext(firstLog.employeeId, firstLog.branchId, clockInAt);
                const metrics = this.calculateShiftMetrics(clockInAt, clockOutAt, context);
                const totalHours = Number(Math.max(0, (clockOutAt.getTime() - clockInAt.getTime()) / 3600000).toFixed(2));
                const [existingSession] = await db.select()
                    .top(1)
                    .from(attendanceSessions)
                    .where(and(
                        eq(attendanceSessions.employeeId, firstLog.employeeId),
                        gte(attendanceSessions.clockInAt, new Date(clockInAt.getTime() - duplicateWindowMinutes * 60000)),
                        lte(attendanceSessions.clockInAt, new Date(clockInAt.getTime() + duplicateWindowMinutes * 60000)),
                    ));

                const sessionPatch = {
                    branchId: firstLog.branchId,
                    sourceType: firstLog.sourceType,
                    status: 'CLOSED',
                    checkInRawLogId: firstLog.id,
                    checkOutRawLogId: lastLog.id,
                    clockInAt,
                    clockOutAt,
                    totalHours,
                    lateMinutes: metrics.lateMinutes,
                    earlyLeaveMinutes: metrics.earlyLeaveMinutes,
                    overtimeMinutes: metrics.overtimeMinutes,
                    riskFlags: firstLog.branchId !== lastLog.branchId ? ['CROSS_BRANCH_EXIT'] : [],
                    notes: 'Smart rebuilt by rolling 24h pairing: each entry is paired with the next safe biometric punch',
                    updatedAt: new Date(),
                } as any;

                if (existingSession) {
                    await db.update(attendanceSessions)
                        .set(sessionPatch)
                        .where(eq(attendanceSessions.id, existingSession.id));
                } else {
                    await db.insert(attendanceSessions).values({
                        id: makeId('SES'),
                        employeeId: firstLog.employeeId,
                        ...sessionPatch,
                    });
                }

                await db.update(attendanceRawLogs)
                    .set({ eventType: 'IN', processingStatus: 'PROCESSED', processingNotes: 'SMART_ROLLING_PAIR_IN', updatedAt: new Date() })
                    .where(eq(attendanceRawLogs.id, firstLog.id));
                await db.update(attendanceRawLogs)
                    .set({ eventType: 'OUT', processingStatus: 'PROCESSED', processingNotes: 'SMART_ROLLING_PAIR_OUT', updatedAt: new Date() })
                    .where(eq(attendanceRawLogs.id, lastLog.id));
                processedDays += 1;
                updatedSessions += 1;
            };

            for (const log of sorted) {
                if (!openFirst) {
                    openFirst = log;
                    continue;
                }

                const minutesSinceIn = Math.round((new Date(log.occurredAt).getTime() - new Date(openFirst.occurredAt).getTime()) / 60000);
                if (minutesSinceIn < duplicateWindowMinutes) {
                    await db.update(attendanceRawLogs)
                        .set({ eventType: 'UNKNOWN', processingStatus: 'PROCESSED', processingNotes: `SMART_ROLLING_DUPLICATE_WITHIN_${duplicateWindowMinutes}_MINUTES`, updatedAt: new Date() })
                        .where(eq(attendanceRawLogs.id, log.id));
                    ignoredDuplicates += 1;
                    continue;
                }

                if (minutesSinceIn < minOutAfterInMinutes) {
                    await db.update(attendanceRawLogs)
                        .set({ eventType: 'UNKNOWN', processingStatus: 'PROCESSED', processingNotes: `SMART_ROLLING_TOO_SOON_UNDER_${minOutAfterInMinutes}_MINUTES`, updatedAt: new Date() })
                        .where(eq(attendanceRawLogs.id, log.id));
                    ignoredDuplicates += 1;
                    continue;
                }

                if (minutesSinceIn / 60 > processingConfig.maxSmartSessionHours) {
                    await createOrUpdateOpenSession(openFirst, 'SMART_ROLLING_LONG_SESSION_NEEDS_REVIEW');
                    suspiciousSessions += 1;
                    openFirst = log;
                    continue;
                }

                await closePair(openFirst, log);
                openFirst = null;
            }

            if (openFirst) {
                await createOrUpdateOpenSession(openFirst, 'SMART_ROLLING_SINGLE_PUNCH_MISSING_OUT');
                processedDays += 1;
                updatedSessions += 1;
            }
        }

        return { rawLogs: knownLogs.length, processedDays, updatedSessions, ignoredDuplicates, reviewExceptions, suspiciousSessions };
    },

    async getBridgeMonitor(branchId?: string) {
        const devices = await this.listDevices(branchId);
        const rows = [];
        const now = Date.now();
        for (const device of devices) {
            const [latestRun] = await db.select().from(attendanceSyncRuns)
                .where(eq(attendanceSyncRuns.deviceId, device.id))
                .orderBy(desc(attendanceSyncRuns.startedAt))
                .offset(0).fetch(1);
            const [latestLog] = await db.select().from(attendanceRawLogs)
                .where(eq(attendanceRawLogs.deviceId, device.id))
                .orderBy(desc(attendanceRawLogs.occurredAt))
                .offset(0).fetch(1);
            const syncConfig = (device as any).syncConfig || getDeviceSyncConfig(device.notes);
            const lastSuccessAt = syncConfig.lastSuccessAt || (latestRun?.status === 'COMPLETED' ? latestRun.completedAt : null);
            const lastAttemptAt = syncConfig.lastAttemptAt || latestRun?.startedAt || null;
            const minutesSinceSuccess = lastSuccessAt ? Math.round((now - new Date(lastSuccessAt).getTime()) / 60000) : null;
            const staleAfterMinutes = Math.max(30, Number(syncConfig.intervalMinutes || 15) * 3);
            const health = !lastAttemptAt
                ? 'NEVER_SYNCED'
                : latestRun?.status === 'FAILED' || syncConfig.failureCount >= 3
                    ? 'FAILED'
                    : minutesSinceSuccess !== null && minutesSinceSuccess > staleAfterMinutes
                        ? 'STALE'
                        : 'OK';
            rows.push({
                device,
                health,
                latestRun,
                latestLog,
                syncConfig,
                minutesSinceSuccess,
                staleAfterMinutes,
            });
        }

        return {
            branchId: branchId || null,
            totals: {
                devices: rows.length,
                ok: rows.filter(row => row.health === 'OK').length,
                failed: rows.filter(row => row.health === 'FAILED').length,
                stale: rows.filter(row => row.health === 'STALE').length,
                neverSynced: rows.filter(row => row.health === 'NEVER_SYNCED').length,
            },
            devices: rows,
        };
    },

    async getHrOperationalReadiness(input: { branchId?: string; startDate?: string; endDate?: string }) {
        const start = input.startDate ? new Date(input.startDate) : new Date();
        if (!input.startDate) start.setDate(1);
        start.setHours(0, 0, 0, 0);

        const end = input.endDate ? new Date(input.endDate) : new Date();
        end.setHours(23, 59, 59, 999);

        if (start > end) throw new Error('START_DATE_AFTER_END_DATE');

        const [
            employeeRows,
            deviceRows,
            sessionRows,
            rawLogRows,
            exceptionRows,
            leaveRows,
            loanRows,
            bonusPenaltyRows,
            payrollCycleRows,
            bridgeMonitor,
        ] = await Promise.all([
            db.select().from(employees).where(and(
                input.branchId ? eq(employees.branchId, input.branchId) : undefined,
                eq(employees.isActive, true),
            )),
            this.listDevices(input.branchId),
            db.select().from(attendanceSessions).where(and(
                input.branchId ? eq(attendanceSessions.branchId, input.branchId) : undefined,
                gte(attendanceSessions.clockInAt, start),
                lte(attendanceSessions.clockInAt, end),
            )),
            db.select().from(attendanceRawLogs).where(and(
                input.branchId ? eq(attendanceRawLogs.branchId, input.branchId) : undefined,
                gte(attendanceRawLogs.occurredAt, start),
                lte(attendanceRawLogs.occurredAt, end),
            )),
            db.select().from(attendanceExceptions).where(and(
                input.branchId ? eq(attendanceExceptions.branchId, input.branchId) : undefined,
                eq(attendanceExceptions.status, 'OPEN'),
            )),
            db.select().from(leaveRequests).where(and(
                eq(leaveRequests.status, 'PENDING'),
                lte(leaveRequests.startDate, end),
                gte(leaveRequests.endDate, start),
            )),
            db.select().from(employeeLoans).where(and(
                input.branchId ? eq(employeeLoans.branchId, input.branchId) : undefined,
                or(eq(employeeLoans.status, 'PENDING'), eq(employeeLoans.status, 'APPROVED')),
            )),
            db.select().from(bonusPenaltyRecords).where(and(
                input.branchId ? eq(bonusPenaltyRecords.branchId, input.branchId) : undefined,
                eq(bonusPenaltyRecords.status, 'PENDING'),
                gte(bonusPenaltyRecords.effectiveDate, start),
                lte(bonusPenaltyRecords.effectiveDate, end),
            )),
            db.select().from(payrollCycles).where(and(
                input.branchId ? eq(payrollCycles.branchId, input.branchId) : undefined,
                lte(payrollCycles.periodStart, end),
                gte(payrollCycles.periodEnd, start),
            )),
            this.getBridgeMonitor(input.branchId),
        ]);

        const employeeIds = new Set(employeeRows.map(employee => employee.id));
        const pendingLeaves = input.branchId
            ? leaveRows.filter(row => employeeIds.has(row.employeeId))
            : leaveRows;

        const employeesWithoutAttendanceCode = employeeRows.filter(employee => {
            const code = String(employee.attendanceCode || employee.employeeCode || '').trim();
            return !code;
        });
        const employeesWithoutPaySetup = employeeRows.filter(employee => Number(employee.basicSalary || 0) <= 0 && Number(employee.hourlyRate || 0) <= 0);
        const openSessions = sessionRows.filter(session => session.status === 'OPEN');
        const exceptionSessions = sessionRows.filter(session => session.status === 'EXCEPTION');
        const unprocessedRawLogs = rawLogRows.filter(log => log.processingStatus === 'PENDING' || log.processingStatus === 'UNMATCHED');
        const unmatchedRawLogs = rawLogRows.filter(log => !log.employeeId);
        const unknownExceptions = exceptionRows.filter(exception => exception.type === 'UNKNOWN_EMPLOYEE');
        const missingOutExceptions = exceptionRows.filter(exception => exception.type === 'MISSING_OUT');
        const failedBridgeDevices = bridgeMonitor.devices.filter((row: any) => row.health === 'FAILED' || row.health === 'STALE' || row.health === 'NEVER_SYNCED');
        const activeDevices = deviceRows.filter((device: any) => device.isActive !== false);
        const activeDevicesWithoutAutoSync = activeDevices.filter((device: any) => device.syncConfig?.autoEnabled === false);
        const draftPayrollCycles = payrollCycleRows.filter(cycle => cycle.status === 'DRAFT');

        const actions: Array<{ key: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; title: string; details: string; count: number; routeHint?: string }> = [];
        const pushAction = (key: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', title: string, details: string, count: number, routeHint?: string) => {
            if (count > 0) actions.push({ key, severity, title, details, count, routeHint });
        };

        pushAction('bridge_health', 'HIGH', 'Bridge/device sync needs attention', 'Some attendance devices are offline, stale, or have never synced.', failedBridgeDevices.length, 'hr.attendance.devices');
        pushAction('missing_codes', 'HIGH', 'Employees missing attendance codes', 'Active employees without employeeCode/attendanceCode cannot be matched reliably to biometric punches.', employeesWithoutAttendanceCode.length, 'hr.employees');
        pushAction('unknown_biometrics', 'HIGH', 'Unknown biometric IDs need linking', 'There are biometric punches that could not be linked to employees.', unknownExceptions.length || unmatchedRawLogs.length, 'hr.attendance.link_unknown');
        pushAction('open_sessions', 'HIGH', 'Open attendance sessions need review', 'Employees still have clock-in sessions without a resolved clock-out in this period.', openSessions.length, 'hr.attendance.daily');
        pushAction('missing_out', 'MEDIUM', 'Missing clock-out exceptions', 'Some sessions need manual clock-out, auto-close, or manager approval.', missingOutExceptions.length, 'hr.attendance.exceptions');
        pushAction('unprocessed_logs', 'MEDIUM', 'Raw logs still pending processing', 'Some pulled biometric rows are still pending/unmatched and should be reprocessed before payroll close.', unprocessedRawLogs.length, 'hr.attendance.tools');
        pushAction('pending_leaves', 'MEDIUM', 'Pending leave requests overlap this period', 'Approve or reject leave requests before calculating payroll.', pendingLeaves.length, 'hr.leave');
        pushAction('pending_loans', 'MEDIUM', 'Loans/advances still pending', 'Approve, reject, or disburse loans/advances before payroll close.', loanRows.length, 'hr.payroll.loans');
        pushAction('pending_bonus_penalty', 'MEDIUM', 'Bonus/penalty records pending approval', 'Pending rewards, penalties, deductions, or allowances should be approved before payroll calculation.', bonusPenaltyRows.length, 'hr.payroll.adjustments');
        pushAction('pay_setup', 'LOW', 'Employees missing pay setup', 'Employees without salary or hourly rate will calculate as zero pay unless this is intentional.', employeesWithoutPaySetup.length, 'hr.payroll.profiles');
        pushAction('auto_sync_disabled', 'LOW', 'Auto sync disabled on devices', 'Some active devices are not configured to pull punches automatically.', activeDevicesWithoutAutoSync.length, 'hr.attendance.devices');
        pushAction('draft_payroll_cycles', 'LOW', 'Draft payroll cycles exist', 'Draft cycles should be calculated, reviewed, closed, or deleted if obsolete.', draftPayrollCycles.length, 'hr.payroll.cycles');

        const weights: Record<string, number> = {
            bridge_health: 14,
            missing_codes: 16,
            unknown_biometrics: 16,
            open_sessions: 14,
            missing_out: 10,
            unprocessed_logs: 8,
            pending_leaves: 6,
            pending_loans: 5,
            pending_bonus_penalty: 5,
            pay_setup: 3,
            auto_sync_disabled: 2,
            draft_payroll_cycles: 1,
        };
        const readinessScore = Math.max(0, Math.min(100, 100 - actions.reduce((sum, action) => sum + Math.min(weights[action.key] || 1, action.count * (weights[action.key] || 1)), 0)));
        const blockingActions = actions.filter(action => action.severity === 'HIGH' || action.severity === 'CRITICAL');
        const canClosePayroll = blockingActions.length === 0;

        return {
            branchId: input.branchId || null,
            period: {
                startDate: start.toISOString(),
                endDate: end.toISOString(),
            },
            readinessScore,
            canClosePayroll,
            status: readinessScore >= 90 && canClosePayroll ? 'READY' : readinessScore >= 70 ? 'NEEDS_REVIEW' : 'NOT_READY',
            totals: {
                activeEmployees: employeeRows.length,
                activeDevices: activeDevices.length,
                attendanceSessions: sessionRows.length,
                rawLogs: rawLogRows.length,
                openExceptions: exceptionRows.length,
                bridgeOk: bridgeMonitor.totals.ok,
                bridgeFailed: bridgeMonitor.totals.failed,
                bridgeStale: bridgeMonitor.totals.stale,
                bridgeNeverSynced: bridgeMonitor.totals.neverSynced,
                pendingLeaves: pendingLeaves.length,
                pendingLoans: loanRows.length,
                pendingBonusPenalty: bonusPenaltyRows.length,
                payrollCycles: payrollCycleRows.length,
            },
            actions: actions.sort((a, b) => {
                const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
                return rank[b.severity] - rank[a.severity] || b.count - a.count;
            }),
            samples: {
                employeesWithoutAttendanceCode: employeesWithoutAttendanceCode.slice(0, 25).map(employee => ({
                    id: employee.id,
                    name: employee.nameAr || employee.name,
                    employeeCode: employee.employeeCode,
                    attendanceCode: employee.attendanceCode,
                })),
                employeesWithoutPaySetup: employeesWithoutPaySetup.slice(0, 25).map(employee => ({
                    id: employee.id,
                    name: employee.nameAr || employee.name,
                    employeeCode: employee.employeeCode,
                })),
                failedBridgeDevices: failedBridgeDevices.slice(0, 25).map((row: any) => ({
                    deviceId: row.device?.id,
                    name: row.device?.name,
                    branchId: row.device?.branchId,
                    health: row.health,
                    lastError: row.latestRun?.errorMessage || row.syncConfig?.lastError || null,
                })),
                openSessions: openSessions.slice(0, 25).map(session => ({
                    id: session.id,
                    employeeId: session.employeeId,
                    branchId: session.branchId,
                    clockInAt: session.clockInAt,
                })),
                unknownExceptions: unknownExceptions.slice(0, 25).map(exception => ({
                    id: exception.id,
                    branchId: exception.branchId,
                    title: exception.title,
                    details: exception.details,
                    metadata: exception.metadata,
                })),
            },
        };
    },

    async buildHrAttendanceReport(
        input: { branchId?: string; employeeId?: string; startDate?: string; endDate?: string },
        options?: { includeCsv?: boolean; includeSyntheticDays?: boolean },
    ) {
        const { start, end } = buildDateRange(input.startDate, input.endDate);
        const includeCsv = options?.includeCsv === true;
        const includeSyntheticDays = options?.includeSyntheticDays !== false;

        const sessions = await db.select({
            employeeId: attendanceSessions.employeeId,
            employeeName: employees.name,
            employeeCode: employees.employeeCode,
            branchId: attendanceSessions.branchId,
            branchName: branches.name,
            status: attendanceSessions.status,
            sourceType: attendanceSessions.sourceType,
            clockInAt: attendanceSessions.clockInAt,
            clockOutAt: attendanceSessions.clockOutAt,
            totalHours: attendanceSessions.totalHours,
            lateMinutes: attendanceSessions.lateMinutes,
            earlyLeaveMinutes: attendanceSessions.earlyLeaveMinutes,
            overtimeMinutes: attendanceSessions.overtimeMinutes,
            riskFlags: attendanceSessions.riskFlags,
        }).from(attendanceSessions)
            .leftJoin(employees, eq(attendanceSessions.employeeId, employees.id))
            .leftJoin(branches, eq(attendanceSessions.branchId, branches.id))
            .where(and(
                input.branchId ? eq(attendanceSessions.branchId, input.branchId) : undefined,
                input.employeeId ? eq(attendanceSessions.employeeId, input.employeeId) : undefined,
                start ? gte(attendanceSessions.clockInAt, start) : undefined,
                end ? lte(attendanceSessions.clockInAt, end) : undefined,
            ))
            .orderBy(desc(attendanceSessions.clockInAt));

        const employeeRows = await db.select({
            id: employees.id,
            name: employees.name,
            nameAr: employees.nameAr,
            employeeCode: employees.employeeCode,
            attendanceCode: employees.attendanceCode,
            branchId: employees.branchId,
            isActive: employees.isActive,
            branchName: branches.name,
        }).from(employees)
            .leftJoin(branches, eq(employees.branchId, branches.id))
            .where(and(
                input.branchId ? eq(employees.branchId, input.branchId) : undefined,
                input.employeeId ? eq(employees.id, input.employeeId) : undefined,
                eq(employees.isActive, true),
            ));

        const leaveRows = await db.select({
            employeeId: leaveRequests.employeeId,
            startDate: leaveRequests.startDate,
            endDate: leaveRequests.endDate,
            totalDays: leaveRequests.totalDays,
            status: leaveRequests.status,
            leaveTypeId: leaveRequests.leaveTypeId,
            typeName: leaveTypes.name,
            typeNameAr: leaveTypes.nameAr,
            isPaid: leaveTypes.isPaid,
        }).from(leaveRequests)
            .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
            .where(and(
                eq(leaveRequests.status, 'APPROVED'),
                input.employeeId ? eq(leaveRequests.employeeId, input.employeeId) : undefined,
                start ? lte(leaveRequests.startDate, end || start) : undefined,
                end ? gte(leaveRequests.endDate, start || end) : undefined,
            ));

        const rowKey = (employeeId: string | null | undefined, dateValue: Date | string | null | undefined) => {
            if (!employeeId || !dateValue) return '';
            const date = new Date(dateValue);
            if (Number.isNaN(date.getTime())) return '';
            return `${employeeId}:${formatDateKey(date)}`;
        };

        const rows: any[] = [...sessions];
        const existing = new Set(sessions.map(row => rowKey(row.employeeId, row.clockInAt)).filter(Boolean));
        const dateKeys = enumerateDateKeys(start, end);
        const leaveRowsByEmployee = new Map<string, typeof leaveRows>();
        for (const leave of leaveRows) {
            if (!leave.employeeId) continue;
            const list = leaveRowsByEmployee.get(leave.employeeId) || [];
            list.push(leave);
            leaveRowsByEmployee.set(leave.employeeId, list);
        }

        if (includeSyntheticDays && dateKeys.length > 0) {
            for (const employee of employeeRows) {
                const employeeLeaves = leaveRowsByEmployee.get(employee.id) || [];
                const missingDateKeys = dateKeys.filter((dateKey) => !existing.has(`${employee.id}:${dateKey}`));
                if (missingDateKeys.length === 0) continue;

                const missingRows = await Promise.all(missingDateKeys.map(async (dateKey) => {
                    const dayDate = new Date(`${dateKey}T12:00:00`);
                    const employeeLeave = employeeLeaves.find((leave) => {
                        const leaveStart = new Date(leave.startDate);
                        const leaveEnd = new Date(leave.endDate);
                        leaveStart.setHours(0, 0, 0, 0);
                        leaveEnd.setHours(23, 59, 59, 999);
                        return dayDate >= leaveStart && dayDate <= leaveEnd;
                    });
                    const context = employeeLeave
                        ? null
                        : await this.getAttendanceContext(employee.id, employee.branchId, dayDate);
                    const workDays = Array.isArray(context?.template?.workDays) ? context.template.workDays : ['sun', 'mon', 'tue', 'wed', 'thu'];
                    const isRestDay = Boolean(context?.template && !isFlexibleShiftTemplate(context.template) && !workDays.includes(getWeekdayKey(dayDate)));
                    const status = employeeLeave ? 'LEAVE' : isRestDay ? 'REST_DAY' : 'ABSENT';
                    const sourceType = employeeLeave
                        ? (employeeLeave.isPaid === false ? 'UNPAID_LEAVE' : 'APPROVED_LEAVE')
                        : isRestDay ? 'SHIFT_REST_DAY' : 'SMART_PERIOD_MATRIX';
                    const note = employeeLeave
                        ? `${employeeLeave.typeNameAr || employeeLeave.typeName || employeeLeave.leaveTypeId || 'Leave'}`
                        : isRestDay ? 'Weekly rest day' : 'No punch in period';
                    return {
                        employeeId: employee.id,
                        employeeName: employee.nameAr || employee.name,
                        employeeCode: employee.employeeCode || employee.attendanceCode,
                        branchId: employee.branchId,
                        branchName: employee.branchName || employee.branchId,
                        status,
                        sourceType,
                        clockInAt: new Date(`${dateKey}T00:00:00`),
                        clockOutAt: null,
                        totalHours: 0,
                        lateMinutes: 0,
                        earlyLeaveMinutes: 0,
                        overtimeMinutes: 0,
                        riskFlags: [note],
                    };
                }));
                rows.push(...missingRows);
            }
        }

        rows.sort((a, b) => {
            const name = String(a.employeeName || a.employeeId || '').localeCompare(String(b.employeeName || b.employeeId || ''));
            if (name !== 0) return name;
            return new Date(a.clockInAt || 0).getTime() - new Date(b.clockInAt || 0).getTime();
        });

        const headers = [
            'employee_code',
            'employee_name',
            'branch',
            'status',
            'source',
            'clock_in',
            'clock_out',
            'total_hours',
            'late_minutes',
            'early_leave_minutes',
            'overtime_minutes',
            'risk_flags',
        ];
        return {
            rows,
            csv: includeCsv
                ? `\uFEFF${[
                    headers.map(csvEscape).join(','),
                    ...rows.map(row => [
                        row.employeeCode || row.employeeId,
                        row.employeeName || row.employeeId,
                        row.branchName || row.branchId,
                        row.status,
                        row.sourceType,
                        ['ABSENT', 'LEAVE', 'REST_DAY'].includes(String(row.status || '').toUpperCase()) ? formatDateKey(new Date(row.clockInAt)) : row.clockInAt ? new Date(row.clockInAt).toISOString() : '',
                        row.clockOutAt ? new Date(row.clockOutAt).toISOString() : '',
                        Number(row.totalHours || 0),
                        Number(row.lateMinutes || 0),
                        Number(row.earlyLeaveMinutes || 0),
                        Number(row.overtimeMinutes || 0),
                        Array.isArray(row.riskFlags) ? row.riskFlags.join('|') : '',
                    ].map(csvEscape).join(',')),
                ].join('\n')}`
                : undefined,
            filename: `hr_attendance_${input.startDate || 'all'}_${input.endDate || 'all'}.csv`,
            period: {
                startDate: input.startDate || 'all',
                endDate: input.endDate || 'all',
            },
        };
    },
    async createManualPunch(input: {
        employeeId: string;
        branchId?: string;
        eventType: 'IN' | 'OUT' | 'UNKNOWN';
        occurredAt: string | Date;
        reason: string;
        requestedBy?: string;
        deviceId?: string;
        notes?: string;
    }) {
        const [employee] = await db.select().top(1).from(employees)
            .where(eq(employees.id, input.employeeId));
        if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');
        if (!input.reason || !String(input.reason).trim()) throw new Error('MANUAL_PUNCH_REASON_REQUIRED');

        const branchId = input.branchId || employee.branchId;
        return this.ingestRawLog({
            branchId,
            sourceType: 'MANUAL_APPROVED',
            eventType: input.eventType,
            occurredAt: input.occurredAt,
            deviceId: input.deviceId,
            deviceUserId: employee.attendanceCode || employee.employeeCode || employee.id,
            employeeId: employee.id,
            employeeIdentifier: employee.attendanceCode || employee.employeeCode || employee.id,
            confidenceScore: 1,
            rawPayload: {
                manual: true,
                reason: input.reason,
                notes: input.notes,
                requestedBy: input.requestedBy,
            },
        });
    },

    async listExceptions(branchId?: string, status?: string) {
        return db.select().from(attendanceExceptions)
            .where(and(
                branchId ? eq(attendanceExceptions.branchId, branchId) : undefined,
                status ? eq(attendanceExceptions.status, status) : undefined,
            ))
            .orderBy(desc(attendanceExceptions.createdAt));
    },

    async listCorrections(branchId?: string, status?: string) {
        return db.select({
            id: attendanceCorrections.id,
            sessionId: attendanceCorrections.sessionId,
            employeeId: attendanceCorrections.employeeId,
            requestedBy: attendanceCorrections.requestedBy,
            approvedBy: attendanceCorrections.approvedBy,
            status: attendanceCorrections.status,
            requestedClockInAt: attendanceCorrections.requestedClockInAt,
            requestedClockOutAt: attendanceCorrections.requestedClockOutAt,
            reason: attendanceCorrections.reason,
            approverNotes: attendanceCorrections.approverNotes,
            createdAt: attendanceCorrections.createdAt,
            updatedAt: attendanceCorrections.updatedAt,
            branchId: attendanceSessions.branchId,
        }).from(attendanceCorrections)
            .innerJoin(attendanceSessions, eq(attendanceCorrections.sessionId, attendanceSessions.id))
            .where(and(
                branchId ? eq(attendanceSessions.branchId, branchId) : undefined,
                status ? eq(attendanceCorrections.status, status) : undefined,
            ))
            .orderBy(desc(attendanceCorrections.createdAt));
    },

    async resolveException(input: { id: string; resolvedBy: string; resolutionNotes?: string }) {
        const [updated] = await db.update(attendanceExceptions)
            .set({
                status: 'RESOLVED',
                resolvedBy: nullableUserReference(input.resolvedBy),
                resolvedAt: new Date(),
                resolutionNotes: input.resolutionNotes,
                updatedAt: new Date(),
            })
            .output()
            .where(eq(attendanceExceptions.id, input.id));
        return updated;
    },

    async resolveExceptionsBulk(input: { ids: string[]; resolvedBy: string; resolutionNotes?: string }) {
        const ids = Array.from(new Set(input.ids.filter(Boolean)));
        if (!ids.length) return { resolved: 0 };

        const updated = await db.update(attendanceExceptions)
            .set({
                status: 'RESOLVED',
                resolvedBy: nullableUserReference(input.resolvedBy),
                resolvedAt: new Date(),
                resolutionNotes: input.resolutionNotes,
                updatedAt: new Date(),
            })
            .output()
            .where(inArray(attendanceExceptions.id, ids));

        return { resolved: updated.length, ids: updated.map(row => row.id) };
    },

    async assignException(input: { id: string; assignedTo: string }) {
        const [updated] = await db.update(attendanceExceptions)
            .set({
                assignedTo: input.assignedTo,
                updatedAt: new Date(),
            })
            .output()
            .where(eq(attendanceExceptions.id, input.id));
        return updated;
    },

    async escalateException(input: { id: string; escalatedBy: string; notes?: string }) {
        const [current] = await db.select().top(1).from(attendanceExceptions)
            .where(eq(attendanceExceptions.id, input.id));
        if (!current) throw new Error('ATTENDANCE_EXCEPTION_NOT_FOUND');

        const nextLevel = Number(current.escalationLevel || 0) + 1;
        const [updated] = await db.update(attendanceExceptions)
            .set({
                escalationLevel: nextLevel,
                lastEscalatedAt: new Date(),
                updatedAt: new Date(),
            })
            .output()
            .where(eq(attendanceExceptions.id, input.id));

        await this.createException({
            employeeId: current.employeeId,
            branchId: current.branchId,
            sessionId: current.sessionId,
            type: 'ESCALATION',
            severity: current.severity as any,
            title: `Exception escalated (level ${nextLevel})`,
            details: input.notes || `Escalated by ${input.escalatedBy}`,
            metadata: { originalExceptionId: current.id, escalatedBy: input.escalatedBy },
        });

        return updated;
    },

    async listExceptionQueue(input: { branchId?: string; status?: string; assignedTo?: string; limit?: number }) {
        const status = input.status || 'OPEN';
        const limit = Math.max(50, Math.min(Number(input.limit || 800), 2000));
        return db.select().from(attendanceExceptions)
            .where(and(
                input.branchId ? eq(attendanceExceptions.branchId, input.branchId) : undefined,
                status ? eq(attendanceExceptions.status, status) : undefined,
                input.assignedTo ? eq(attendanceExceptions.assignedTo, input.assignedTo) : undefined,
            ))
            .orderBy(
                desc(attendanceExceptions.severity),
                attendanceExceptions.slaDueAt,
                desc(attendanceExceptions.createdAt),
            )
            .offset(0).fetch(limit);
    },

    async getExceptionQueueSummary(input: { branchId?: string; status?: string }) {
        const status = input.status || 'OPEN';
        const rows = await db.select({
            type: attendanceExceptions.type,
            severity: attendanceExceptions.severity,
            count: sql<number>`count(*)`,
            latestAt: sql<Date>`max(${attendanceExceptions.createdAt})`,
        }).from(attendanceExceptions)
            .where(and(
                input.branchId ? eq(attendanceExceptions.branchId, input.branchId) : undefined,
                status ? eq(attendanceExceptions.status, status) : undefined,
            ))
            .groupBy(attendanceExceptions.type, attendanceExceptions.severity)
            .orderBy(sql`count(*) desc`);

        const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
        return { total, rows };
    },

    async requestCorrection(input: {
        sessionId: string;
        requestedBy: string;
        requestedClockInAt?: string | Date;
        requestedClockOutAt?: string | Date;
        reason: string;
    }) {
        const [session] = await db.select().top(1).from(attendanceSessions)
            .where(eq(attendanceSessions.id, input.sessionId));
        if (!session) throw new Error('ATTENDANCE_SESSION_NOT_FOUND');

        const [created] = await db.insert(attendanceCorrections).output().values({
            id: makeId('COR'),
            sessionId: input.sessionId,
            employeeId: session.employeeId,
            requestedBy: input.requestedBy,
            requestedClockInAt: input.requestedClockInAt ? new Date(input.requestedClockInAt) : undefined,
            requestedClockOutAt: input.requestedClockOutAt ? new Date(input.requestedClockOutAt) : undefined,
            reason: input.reason,
        });

        await this.createException({
            employeeId: session.employeeId,
            branchId: session.branchId,
            sessionId: session.id,
            type: 'CORRECTION_REQUEST',
            severity: 'MEDIUM',
            title: 'Attendance correction pending review',
            details: input.reason,
            metadata: {
                correctionId: created.id,
                requestedClockInAt: created.requestedClockInAt,
                requestedClockOutAt: created.requestedClockOutAt,
            },
        });

        return created;
    },

    async approveCorrection(input: { correctionId: string; approvedBy: string; approverNotes?: string }) {
        const [correction] = await db.select().top(1).from(attendanceCorrections)
            .where(eq(attendanceCorrections.id, input.correctionId));
        if (!correction) throw new Error('ATTENDANCE_CORRECTION_NOT_FOUND');
        if (correction.status !== 'PENDING') throw new Error('ATTENDANCE_CORRECTION_NOT_PENDING');

        const [session] = await db.select().top(1).from(attendanceSessions)
            .where(eq(attendanceSessions.id, correction.sessionId));
        if (!session) throw new Error('ATTENDANCE_SESSION_NOT_FOUND');

        const nextClockIn = correction.requestedClockInAt || session.clockInAt;
        const nextClockOut = correction.requestedClockOutAt === null
            ? null
            : (correction.requestedClockOutAt || session.clockOutAt);
        const totalHours = nextClockOut
            ? Number((((new Date(nextClockOut).getTime() - new Date(nextClockIn).getTime()) / 3600000)).toFixed(2))
            : 0;

        const [updatedSession] = await db.update(attendanceSessions)
            .set({
                clockInAt: nextClockIn,
                clockOutAt: nextClockOut || undefined,
                totalHours: totalHours > 0 ? totalHours : 0,
                status: nextClockOut ? 'CLOSED' : 'OPEN',
                updatedAt: new Date(),
            })
            .output()
            .where(eq(attendanceSessions.id, session.id));

        const [updatedCorrection] = await db.update(attendanceCorrections)
            .set({
                status: 'APPROVED',
                approvedBy: input.approvedBy,
                approverNotes: input.approverNotes,
                updatedAt: new Date(),
            })
            .output()
            .where(eq(attendanceCorrections.id, correction.id));

        const relatedExceptions = await db.select().from(attendanceExceptions).where(and(
            eq(attendanceExceptions.sessionId, session.id),
            eq(attendanceExceptions.status, 'OPEN'),
        ));

        for (const exception of relatedExceptions) {
            await db.update(attendanceExceptions)
                .set({
                    status: 'RESOLVED',
                    resolvedBy: input.approvedBy,
                    resolvedAt: new Date(),
                    resolutionNotes: `Resolved by correction approval ${correction.id}`,
                    updatedAt: new Date(),
                })
                .where(eq(attendanceExceptions.id, exception.id));
        }

        return { correction: updatedCorrection, session: updatedSession };
    },

    async rejectCorrection(input: { correctionId: string; approvedBy: string; approverNotes?: string }) {
        const [correction] = await db.select().top(1).from(attendanceCorrections)
            .where(eq(attendanceCorrections.id, input.correctionId));
        if (!correction) throw new Error('ATTENDANCE_CORRECTION_NOT_FOUND');
        if (correction.status !== 'PENDING') throw new Error('ATTENDANCE_CORRECTION_NOT_PENDING');

        const [updatedCorrection] = await db.update(attendanceCorrections)
            .set({
                status: 'REJECTED',
                approvedBy: input.approvedBy,
                approverNotes: input.approverNotes,
                updatedAt: new Date(),
            })
            .output()
            .where(eq(attendanceCorrections.id, correction.id));

        return updatedCorrection;
    },

    async startSyncRun(input: { branchId?: string; deviceId?: string; sourceType: string; metadata?: Record<string, any> }) {
        const [run] = await db.insert(attendanceSyncRuns).output().values({
            id: makeId('SYNC'),
            branchId: input.branchId,
            deviceId: input.deviceId,
            sourceType: input.sourceType,
            metadata: input.metadata || {},
        });
        return run;
    },

    async completeSyncRun(input: { syncRunId: string; status: 'COMPLETED' | 'PARTIAL' | 'FAILED'; logsReceived: number; logsAccepted: number; logsRejected: number; errorMessage?: string }) {
        const [updated] = await db.update(attendanceSyncRuns)
            .set({
                status: input.status,
                logsReceived: input.logsReceived,
                logsAccepted: input.logsAccepted,
                logsRejected: input.logsRejected,
                errorMessage: input.errorMessage,
                completedAt: new Date(),
            })
            .output()
            .where(eq(attendanceSyncRuns.id, input.syncRunId));
        return updated;
    },

    async upsertDeviceMapping(input: { deviceId: string; employeeId: string; deviceUserId: string }) {
        const [employee] = await db.select().top(1).from(employees).where(eq(employees.id, input.employeeId));
        if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

        const existing = await db.select()
            .top(1)
            .from(attendanceDeviceMappings)
            .where(and(
                eq(attendanceDeviceMappings.deviceId, input.deviceId),
                eq(attendanceDeviceMappings.deviceUserId, input.deviceUserId),
            ));

        if (existing[0]) {
            const [updated] = await db.update(attendanceDeviceMappings)
                .set({
                    employeeId: input.employeeId,
                    employeeCodeSnapshot: employee.employeeCode || employee.attendanceCode || employee.id,
                    isActive: true,
                    updatedAt: new Date(),
                })
                .output()
                .where(eq(attendanceDeviceMappings.id, existing[0].id));
            return updated;
        }

        const [created] = await db.insert(attendanceDeviceMappings).output().values({
            deviceId: input.deviceId,
            employeeId: input.employeeId,
            deviceUserId: input.deviceUserId,
            employeeCodeSnapshot: employee.employeeCode || employee.attendanceCode || employee.id,
            isActive: true,
        });
        return created;
    },

    async linkUnknownBiometricGroup(input: {
        deviceId: string;
        deviceUserId: string;
        employeeId: string;
        exceptionIds: string[];
        resolvedBy?: string;
        resolutionNotes?: string;
    }) {
        const mapping = await this.upsertDeviceMapping({
            deviceId: input.deviceId,
            deviceUserId: input.deviceUserId,
            employeeId: input.employeeId,
        });

        const exceptionIds = Array.from(new Set((input.exceptionIds || []).filter(Boolean)));
        const exceptions = exceptionIds.length
            ? await db.select().from(attendanceExceptions).where(inArray(attendanceExceptions.id, exceptionIds))
            : [];
        const rawLogIds = Array.from(new Set(exceptions.map(item => item.rawLogId).filter(Boolean))) as string[];
        const referencedRawLogs = rawLogIds.length
            ? await db.select().from(attendanceRawLogs).where(inArray(attendanceRawLogs.id, rawLogIds))
            : [];
        const relatedRawLogs = await db.select().from(attendanceRawLogs)
            .where(and(
                eq(attendanceRawLogs.deviceId, input.deviceId),
                or(
                    eq(attendanceRawLogs.deviceUserId, input.deviceUserId),
                    eq(attendanceRawLogs.employeeIdentifier, input.deviceUserId),
                ),
                or(
                    eq(attendanceRawLogs.processingStatus, 'PENDING'),
                    eq(attendanceRawLogs.processingStatus, 'REJECTED'),
                    isNull(attendanceRawLogs.employeeId),
                ),
            ))
            .orderBy(attendanceRawLogs.occurredAt)
            .offset(0).fetch(5000);
        const rawLogs = Array.from(
            new Map([...referencedRawLogs, ...relatedRawLogs].map(rawLog => [rawLog.id, rawLog])).values(),
        );

        let reprocessed = 0;
        let duplicates = 0;
        let failed = 0;
        const errors: Array<{ rawLogId: string; code: string }> = [];

        for (const rawLog of rawLogs.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())) {
            try {
                const result = await this.ingestRawLog({
                    branchId: rawLog.branchId,
                    sourceType: rawLog.sourceType as RawLogInput['sourceType'],
                    eventType: rawLog.eventType === 'OUT' ? 'OUT' : 'UNKNOWN',
                    occurredAt: rawLog.occurredAt,
                    deviceId: rawLog.deviceId || input.deviceId,
                    deviceUserId: rawLog.deviceUserId || input.deviceUserId,
                    employeeId: input.employeeId,
                    employeeIdentifier: rawLog.employeeIdentifier || input.deviceUserId,
                    rawPayload: {
                        ...(rawLog.rawPayload as Record<string, any> || {}),
                        reprocessedFromRawLogId: rawLog.id,
                        linkedEmployeeId: input.employeeId,
                        linkedDeviceUserId: input.deviceUserId,
                    },
                    syncRunId: rawLog.syncRunId || undefined,
                });
                if (result.duplicate) duplicates += 1;
                else reprocessed += 1;

                await db.update(attendanceRawLogs)
                    .set({
                        processingStatus: 'REPROCESSED',
                        processingNotes: `Linked to employee ${input.employeeId}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(attendanceRawLogs.id, rawLog.id));
            } catch (error: any) {
                failed += 1;
                errors.push({ rawLogId: rawLog.id, code: String(error?.message || 'REPROCESS_FAILED') });
            }
        }

        const resolved = exceptionIds.length
            ? await this.resolveExceptionsBulk({
                ids: exceptionIds,
                resolvedBy: input.resolvedBy || 'system',
                resolutionNotes: input.resolutionNotes || `Linked biometric id ${input.deviceUserId} to employee ${input.employeeId}`,
            })
            : { resolved: 0, ids: [] };

        return {
            mapping,
            resolved,
            reprocessed,
            duplicates,
            failed,
            errors,
        };
    },

    async autoResolveUnknownBiometricMatches(input: { branchId?: string; resolvedBy?: string; limit?: number } = {}) {
        const openUnknownExceptions = await db.select().from(attendanceExceptions)
            .where(and(
                eq(attendanceExceptions.type, 'UNKNOWN_EMPLOYEE'),
                eq(attendanceExceptions.status, 'OPEN'),
                input.branchId ? eq(attendanceExceptions.branchId, input.branchId) : undefined,
            ))
            .orderBy(desc(attendanceExceptions.createdAt))
            .offset(0).fetch(Math.max(1, Math.min(Number(input.limit || 200), 1000)));

        const groups = new Map<string, {
            deviceId: string;
            deviceUserId: string;
            branchId: string;
            exceptionIds: string[];
        }>();

        for (const exception of openUnknownExceptions) {
            const deviceId = String((exception.metadata as any)?.deviceId || '').trim();
            const deviceUserId = getUnknownExceptionIdentifier(exception);
            if (!deviceId || !deviceUserId || deviceId === 'unknown-device' || deviceUserId === 'unknown') continue;
            const key = `${deviceId}:${deviceUserId}`;
            const existing = groups.get(key);
            if (existing) {
                existing.exceptionIds.push(exception.id);
            } else {
                groups.set(key, {
                    deviceId,
                    deviceUserId,
                    branchId: exception.branchId,
                    exceptionIds: [exception.id],
                });
            }
        }

        const resolvedGroups: Array<{
            deviceId: string;
            deviceUserId: string;
            employeeId: string;
            reprocessed: number;
            duplicates: number;
            resolved: number;
        }> = [];
        const skippedGroups: Array<{ deviceId: string; deviceUserId: string; reason: string }> = [];
        let failedGroups = 0;

        for (const group of groups.values()) {
            const employeeId = await this.resolveEmployeeIdFromAttendanceCode({
                branchId: group.branchId,
                deviceId: group.deviceId,
                deviceUserId: group.deviceUserId,
                employeeIdentifier: group.deviceUserId,
            });
            if (!employeeId) {
                skippedGroups.push({ deviceId: group.deviceId, deviceUserId: group.deviceUserId, reason: 'NO_MATCHING_EMPLOYEE_CODE' });
                continue;
            }

            try {
                const result = await this.linkUnknownBiometricGroup({
                    deviceId: group.deviceId,
                    deviceUserId: group.deviceUserId,
                    employeeId,
                    exceptionIds: group.exceptionIds,
                    resolvedBy: input.resolvedBy || 'system',
                    resolutionNotes: `Auto-resolved biometric id ${group.deviceUserId} by matching employee attendance code`,
                });
                resolvedGroups.push({
                    deviceId: group.deviceId,
                    deviceUserId: group.deviceUserId,
                    employeeId,
                    reprocessed: result.reprocessed || 0,
                    duplicates: result.duplicates || 0,
                    resolved: result.resolved?.resolved || 0,
                });
            } catch (error: any) {
                failedGroups += 1;
                skippedGroups.push({ deviceId: group.deviceId, deviceUserId: group.deviceUserId, reason: String(error?.message || 'AUTO_RESOLVE_FAILED') });
            }
        }

        return {
            scannedExceptions: openUnknownExceptions.length,
            scannedGroups: groups.size,
            resolvedGroups: resolvedGroups.length,
            reprocessed: resolvedGroups.reduce((sum, group) => sum + group.reprocessed, 0),
            duplicates: resolvedGroups.reduce((sum, group) => sum + group.duplicates, 0),
            resolvedExceptions: resolvedGroups.reduce((sum, group) => sum + group.resolved, 0),
            failedGroups,
            skippedGroups,
            groups: resolvedGroups,
        };
    },

    async listDeviceMappings(deviceId: string) {
        const mappings = await db.select({
            id: attendanceDeviceMappings.id,
            deviceId: attendanceDeviceMappings.deviceId,
            employeeId: attendanceDeviceMappings.employeeId,
            deviceUserId: attendanceDeviceMappings.deviceUserId,
            employeeCodeSnapshot: attendanceDeviceMappings.employeeCodeSnapshot,
            isActive: attendanceDeviceMappings.isActive,
            createdAt: attendanceDeviceMappings.createdAt,
            updatedAt: attendanceDeviceMappings.updatedAt,
            employeeName: employees.name,
            employeeNameAr: employees.nameAr,
            employeeRole: employees.role,
            employeeBranchId: employees.branchId,
        }).from(attendanceDeviceMappings)
            .leftJoin(employees, eq(attendanceDeviceMappings.employeeId, employees.id))
            .where(and(
                eq(attendanceDeviceMappings.deviceId, deviceId),
                eq(attendanceDeviceMappings.isActive, true),
            ))
            .orderBy(attendanceDeviceMappings.deviceUserId);
        return mappings;
    },

    async deactivateDeviceMapping(id: number) {
        const [updated] = await db.update(attendanceDeviceMappings)
            .set({ isActive: false, updatedAt: new Date() })
            .output()
            .where(eq(attendanceDeviceMappings.id, id));
        if (!updated) throw new Error('MAPPING_NOT_FOUND');
        return updated;
    },

    async resolveEmployeeIdFromAttendanceCode(input: { branchId?: string; deviceId?: string; deviceUserId?: string; employeeIdentifier?: string; employeeId?: string }) {
        if (input.employeeId) return input.employeeId;

        const deviceUserId = normalizeAttendanceIdentifier(input.deviceUserId);
        const employeeIdentifier = normalizeAttendanceIdentifier(input.employeeIdentifier);
        const candidates = getAttendanceIdentifierCandidates(input.deviceUserId, input.employeeIdentifier);

        if (input.deviceId && deviceUserId) {
            const [mapping] = await db.select()
                .top(1)
                .from(attendanceDeviceMappings)
                .where(and(
                    eq(attendanceDeviceMappings.deviceId, input.deviceId),
                    eq(attendanceDeviceMappings.deviceUserId, deviceUserId),
                    eq(attendanceDeviceMappings.isActive, true),
                ));
            if (mapping?.employeeId) return mapping.employeeId;
        }

        for (const code of candidates) {
            const conditions = [
                eq(employees.employeeCode, code),
                eq(employees.attendanceCode, code),
                eq(employees.id, code),
            ];

            if (!input.deviceId && deviceUserId) {
                const [globalMapping] = await db.select()
                    .top(1)
                    .from(attendanceDeviceMappings)
                    .where(and(
                        eq(attendanceDeviceMappings.deviceUserId, deviceUserId),
                        eq(attendanceDeviceMappings.isActive, true),
                    ));
                if (globalMapping?.employeeId) return globalMapping.employeeId;
            }

            if (input.branchId) {
                const branchMatches = await db.select({ id: employees.id })
                    .top(2)
                    .from(employees)
                    .where(and(
                        eq(employees.branchId, input.branchId),
                        eq(employees.isActive, true),
                        or(...conditions)!,
                    ));
                if (branchMatches.length === 1) return branchMatches[0].id;
                if (branchMatches.length > 1) return branchMatches[0].id;
            }

            const globalMatches = await db.select({ id: employees.id })
                .top(2)
                .from(employees)
                .where(and(
                    eq(employees.isActive, true),
                    or(...conditions)!,
                ));
            if (globalMatches.length === 1) return globalMatches[0].id;
            if (globalMatches.length > 1) return globalMatches[0].id;
        }

        return null;
    },

    async inferUnknownPunch(input: {
        employeeId: string;
        branchId: string;
        occurredAt: Date;
        deviceId?: string;
        deviceUserId?: string;
        employeeIdentifier?: string;
    }): Promise<SmartAttendanceDecision> {
        const duplicateWindowMinutes = Number(process.env.ATTENDANCE_SMART_DUPLICATE_WINDOW_MINUTES || 5);
        const minOutAfterInMinutes = getSmartMinOutAfterInMinutes();
        const context = await this.getAttendanceContext(input.employeeId, input.branchId, input.occurredAt);
        const processingConfig = getAttendanceProcessingConfig(context);
        const operationalDay = getOperationalDayKeyForConfig(input.occurredAt, processingConfig);
        const { start: dayStart, end: dayEnd } = processingConfig.mode === 'ROLLING_24H'
            ? {
                start: new Date(input.occurredAt.getTime() - processingConfig.maxSmartSessionHours * 3600000),
                end: new Date(input.occurredAt.getTime() + processingConfig.maxSmartSessionHours * 3600000),
            }
            : getOperationalWindowForConfig(operationalDay, processingConfig);
        const duplicateWindowStart = new Date(input.occurredAt.getTime() - duplicateWindowMinutes * 60000);
        const duplicateWindowEnd = new Date(input.occurredAt.getTime() + duplicateWindowMinutes * 60000);

        const [nearRawLog] = await db.select().from(attendanceRawLogs)
            .where(and(
                eq(attendanceRawLogs.employeeId, input.employeeId),
                input.deviceId ? eq(attendanceRawLogs.deviceId, input.deviceId) : undefined,
                gte(attendanceRawLogs.occurredAt, duplicateWindowStart),
                lte(attendanceRawLogs.occurredAt, duplicateWindowEnd),
            ))
            .orderBy(desc(attendanceRawLogs.occurredAt))
            .offset(0).fetch(1);

        if (nearRawLog) {
            return {
                eventType: 'UNKNOWN',
                confidence: 0.98,
                reason: `SMART_DUPLICATE_WITHIN_${duplicateWindowMinutes}_MINUTES`,
                duplicate: true,
            };
        }

        const [openSession] = await db.select().from(attendanceSessions)
            .where(and(
                eq(attendanceSessions.employeeId, input.employeeId),
                eq(attendanceSessions.status, 'OPEN'),
            ))
            .orderBy(desc(attendanceSessions.clockInAt))
            .offset(0).fetch(1);

        if (openSession) {
            const minutesSinceIn = Math.round((input.occurredAt.getTime() - new Date(openSession.clockInAt).getTime()) / 60000);
            if (minutesSinceIn < 0) {
                return {
                    eventType: 'UNKNOWN',
                    confidence: 0.2,
                    reason: 'SMART_PUNCH_BEFORE_OPEN_CLOCK_IN',
                    relatedSessionId: openSession.id,
                };
            }
            if (minutesSinceIn < minOutAfterInMinutes) {
                return {
                    eventType: 'UNKNOWN',
                    confidence: 0.9,
                    reason: `SMART_DUPLICATE_OPEN_SESSION_UNDER_${minOutAfterInMinutes}_MINUTES`,
                    duplicate: true,
                    relatedSessionId: openSession.id,
                };
            }
            return {
                eventType: 'OUT',
                confidence: 0.85,
                reason: 'SMART_OPEN_SESSION_NEXT_UNKNOWN_IS_OUT',
                relatedSessionId: openSession.id,
            };
        }

        const sameDaySessions = await db.select().from(attendanceSessions)
            .where(and(
                eq(attendanceSessions.employeeId, input.employeeId),
                gte(attendanceSessions.clockInAt, dayStart),
                lte(attendanceSessions.clockInAt, dayEnd),
            ))
            .orderBy(desc(attendanceSessions.clockInAt))
            .offset(0).fetch(1);

        if (sameDaySessions[0]?.clockOutAt) {
            const minutesAfterOut = Math.round((input.occurredAt.getTime() - new Date(sameDaySessions[0].clockOutAt).getTime()) / 60000);
            if (minutesAfterOut >= 0 && minutesAfterOut < duplicateWindowMinutes) {
                return {
                    eventType: 'UNKNOWN',
                    confidence: 0.95,
                    reason: `SMART_DUPLICATE_AFTER_CLOCK_OUT_WITHIN_${duplicateWindowMinutes}_MINUTES`,
                    duplicate: true,
                    relatedSessionId: sameDaySessions[0].id,
                };
            }
        }

        if (isRolloverExitPunchForConfig(input.occurredAt, processingConfig)) {
            return {
                eventType: 'OUT',
                confidence: 0.7,
                reason: 'SMART_ROLLOVER_OUT_WITHOUT_IN',
            };
        }

        return {
            eventType: 'IN',
            confidence: sameDaySessions.length > 0 ? 0.7 : 0.9,
            reason: sameDaySessions.length > 0 ? 'SMART_NO_OPEN_SESSION_START_NEW_SPLIT_SESSION' : 'SMART_FIRST_UNKNOWN_IS_IN',
        };
    },

    async ingestRawLog(input: RawLogInput) {
        const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
        const resolvedEmployeeId = await this.resolveEmployeeIdFromAttendanceCode(input);

        // Auto-link: if employee was resolved by code match (not existing mapping), create mapping for future syncs
        const mappingIdentifier = input.deviceUserId || input.employeeIdentifier;
        if (resolvedEmployeeId && input.deviceId && mappingIdentifier && !input.employeeId) {
            try {
                const [existingMapping] = await db.select()
                    .top(1)
                    .from(attendanceDeviceMappings)
                    .where(and(
                        eq(attendanceDeviceMappings.deviceId, input.deviceId),
                        eq(attendanceDeviceMappings.deviceUserId, mappingIdentifier),
                        eq(attendanceDeviceMappings.isActive, true),
                    ));
                if (!existingMapping) {
                    await this.upsertDeviceMapping({
                        deviceId: input.deviceId,
                        employeeId: resolvedEmployeeId,
                        deviceUserId: mappingIdentifier,
                    });
                    console.log('[AutoLink] Linked biometric ID', mappingIdentifier, 'to employee', resolvedEmployeeId, 'on device', input.deviceId);
                }
            } catch (autoLinkErr: any) {
                console.warn('[AutoLink] Auto-link mapping failed (non-fatal):', autoLinkErr.message);
            }
        }
        let effectiveEventType = input.eventType;
        let smartDecision: SmartAttendanceDecision | null = null;
        if (resolvedEmployeeId && input.eventType === 'UNKNOWN') {
            smartDecision = await this.inferUnknownPunch({
                employeeId: resolvedEmployeeId,
                branchId: input.branchId,
                occurredAt,
                deviceId: input.deviceId,
                deviceUserId: input.deviceUserId,
                employeeIdentifier: input.employeeIdentifier,
            });
            if (smartDecision.duplicate) {
                return {
                    rawLog: null,
                    session: null,
                    exception: null,
                    duplicate: true,
                    smartDecision,
                };
            }
            effectiveEventType = smartDecision.eventType;
        }

        if (resolvedEmployeeId && input.eventType === 'IN') {
            const [openSession] = await db.select().from(attendanceSessions)
                .where(and(
                    eq(attendanceSessions.employeeId, resolvedEmployeeId),
                    eq(attendanceSessions.status, 'OPEN'),
                ))
                .orderBy(desc(attendanceSessions.clockInAt))
                .offset(0).fetch(1);
            if (openSession) {
                const minutesSinceIn = Math.round((occurredAt.getTime() - new Date(openSession.clockInAt).getTime()) / 60000);
                if (minutesSinceIn >= getSmartMinOutAfterInMinutes()) {
                    effectiveEventType = 'OUT';
                    smartDecision = {
                        eventType: 'OUT',
                        confidence: 0.8,
                        reason: 'SMART_EXPLICIT_IN_WITH_OPEN_SESSION_TREATED_AS_OUT',
                        relatedSessionId: openSession.id,
                    };
                }
            } else if (input.sourceType === 'BIOMETRIC_ZK') {
                const explicitInProcessingConfig = getAttendanceProcessingConfig(await this.getAttendanceContext(resolvedEmployeeId, input.branchId, occurredAt));
                if (isRolloverExitPunchForConfig(occurredAt, explicitInProcessingConfig)) {
                    effectiveEventType = 'OUT';
                    smartDecision = {
                        eventType: 'OUT',
                        confidence: 0.7,
                        reason: 'SMART_ROLLOVER_IN_WITHOUT_OPEN_SESSION_TREATED_AS_OUT',
                    };
                }
            }
        }

        if (resolvedEmployeeId && input.eventType === 'OUT') {
            const [openSession] = await db.select().from(attendanceSessions)
                .where(and(
                    eq(attendanceSessions.employeeId, resolvedEmployeeId),
                    eq(attendanceSessions.status, 'OPEN'),
                ))
                .orderBy(desc(attendanceSessions.clockInAt))
                .offset(0).fetch(1);
            if (!openSession) {
                const explicitOutProcessingConfig = getAttendanceProcessingConfig(await this.getAttendanceContext(resolvedEmployeeId, input.branchId, occurredAt));
                if (smartDecision?.reason === 'SMART_ROLLOVER_OUT_WITHOUT_IN' || isRolloverExitPunchForConfig(occurredAt, explicitOutProcessingConfig)) {
                    effectiveEventType = 'OUT';
                    smartDecision = smartDecision || {
                        eventType: 'OUT',
                        confidence: 0.7,
                        reason: 'SMART_ROLLOVER_OUT_WITHOUT_IN',
                    };
                } else {
                    effectiveEventType = 'IN';
                    smartDecision = {
                        eventType: 'IN',
                        confidence: 0.8,
                        reason: 'SMART_EXPLICIT_OUT_WITHOUT_OPEN_SESSION_TREATED_AS_IN',
                    };
                }
            }
        }

        if (resolvedEmployeeId && input.sourceType === 'BIOMETRIC_ZK') {
            const duplicateWindowMinutes = Number(process.env.ATTENDANCE_SMART_DUPLICATE_WINDOW_MINUTES || 5);
            const duplicateWindowStart = new Date(occurredAt.getTime() - duplicateWindowMinutes * 60000);
            const duplicateWindowEnd = new Date(occurredAt.getTime() + duplicateWindowMinutes * 60000);
            const [nearRawLog] = await db.select().from(attendanceRawLogs)
                .where(and(
                    eq(attendanceRawLogs.employeeId, resolvedEmployeeId),
                    input.deviceId ? eq(attendanceRawLogs.deviceId, input.deviceId) : undefined,
                    gte(attendanceRawLogs.occurredAt, duplicateWindowStart),
                    lte(attendanceRawLogs.occurredAt, duplicateWindowEnd),
                ))
                .orderBy(desc(attendanceRawLogs.occurredAt))
                .offset(0).fetch(1);

        if (nearRawLog) {
                return {
                    rawLog: nearRawLog,
                    session: null,
                    exception: null,
                    duplicate: true,
                    smartDecision: {
                        eventType: 'UNKNOWN',
                        confidence: 0.98,
                        reason: `SMART_BIOMETRIC_DUPLICATE_WITHIN_${duplicateWindowMinutes}_MINUTES`,
                        duplicate: true,
                    },
                };
            }
        }

        const dedupeHash = crypto.createHash('sha256')
            .update(JSON.stringify({
                branchId: input.branchId,
                sourceType: input.sourceType,
                eventType: effectiveEventType,
                deviceId: input.deviceId || null,
                deviceUserId: input.deviceUserId || null,
                employeeId: resolvedEmployeeId || null,
                employeeIdentifier: input.employeeIdentifier || null,
                occurredAt: occurredAt.toISOString(),
            }))
            .digest('hex');

        const [existing] = await db.select().top(1).from(attendanceRawLogs)
            .where(eq(attendanceRawLogs.dedupeHash, dedupeHash));
        if (existing) {
            return { rawLog: existing, session: null, exception: null, duplicate: true };
        }

        const insertedRawLogs = await db.insert(attendanceRawLogs).values({
            id: makeId('RAW'),
            syncRunId: input.syncRunId,
            deviceId: input.deviceId,
            employeeId: resolvedEmployeeId || undefined,
            branchId: input.branchId,
            sourceType: input.sourceType,
            eventType: effectiveEventType,
            employeeIdentifier: input.employeeIdentifier,
            deviceUserId: input.deviceUserId,
            occurredAt,
            deviceOccurredAt: occurredAt,
            geoLat: input.geoLat,
            geoLng: input.geoLng,
            geoAccuracyMeters: input.geoAccuracyMeters,
            confidenceScore: input.confidenceScore,
            imageUrl: input.imageUrl,
            dedupeHash,
            rawPayload: {
                ...(input.rawPayload || {}),
                smartInference: smartDecision || undefined,
                originalEventType: input.eventType,
            },
        }).output();

        const rawLog = insertedRawLogs[0] || (await db.select().top(1).from(attendanceRawLogs)
            .where(eq(attendanceRawLogs.dedupeHash, dedupeHash)))[0];
        if (!insertedRawLogs[0] && rawLog) {
            return { rawLog, session: null, exception: null, duplicate: true };
        }
        if (!rawLog) {
            return { rawLog: existing, session: null, exception: null, duplicate: true };
        }

        await eventBusService.emitEvent({
            type: 'attendance.logged',
            entityType: 'attendance_raw_log',
            entityId: rawLog.id,
            branchId: input.branchId,
            payload: {
                sourceType: input.sourceType,
                eventType: effectiveEventType,
                occurredAt: rawLog.occurredAt,
                employeeId: resolvedEmployeeId,
                smartInference: smartDecision,
            },
        });

        if (!resolvedEmployeeId) {
            const exception = await this.createException({
                branchId: input.branchId,
                rawLogId: rawLog.id,
                type: 'UNKNOWN_EMPLOYEE',
                severity: 'HIGH',
                title: 'Raw attendance log could not be matched to an employee',
                details: `No employee mapping found for ${input.deviceUserId || input.employeeIdentifier || 'unknown identifier'}`,
                metadata: { deviceId: input.deviceId, deviceUserId: input.deviceUserId, employeeIdentifier: input.employeeIdentifier },
            });

            await db.update(attendanceRawLogs)
                .set({ processingStatus: 'REJECTED', processingNotes: 'UNKNOWN_EMPLOYEE', updatedAt: new Date() })
                .where(eq(attendanceRawLogs.id, rawLog.id));

            return { rawLog, session: null, exception, duplicate: false };
        }

        let geofenceBreach = false;
        const context = await this.getAttendanceContext(resolvedEmployeeId, input.branchId, occurredAt);
        if (input.sourceType === 'LOCATION' && typeof input.geoLat === 'number' && typeof input.geoLng === 'number') {
            const activeGeofences = await db.select().from(attendanceGeofences)
                .where(and(
                    eq(attendanceGeofences.branchId, input.branchId),
                    eq(attendanceGeofences.isActive, true),
                ));
            if (activeGeofences.length > 0) {
                const withinAnyFence = activeGeofences.some((fence) => (
                    distanceMeters(input.geoLat!, input.geoLng!, Number(fence.latitude), Number(fence.longitude)) <= Number(fence.radiusMeters)
                ));
                geofenceBreach = !withinAnyFence;
            }
        }

        let session: any = null;
        let exception: any = null;

        if (effectiveEventType === 'IN') {
            const [openSession] = await db.select().from(attendanceSessions)
                .where(and(
                    eq(attendanceSessions.employeeId, resolvedEmployeeId),
                    eq(attendanceSessions.status, 'OPEN'),
                ))
                .orderBy(desc(attendanceSessions.clockInAt))
                .offset(0).fetch(1);

            if (openSession) {
                exception = await this.createException({
                    employeeId: resolvedEmployeeId,
                    branchId: input.branchId,
                    rawLogId: rawLog.id,
                    sessionId: openSession.id,
                    type: 'DUPLICATE',
                    severity: 'MEDIUM',
                    title: 'Duplicate clock-in detected',
                    details: smartDecision?.reason || 'Employee already has an open attendance session',
                    metadata: { existingSessionId: openSession.id, smartDecision },
                });
                await db.update(attendanceRawLogs)
                    .set({ processingStatus: 'REJECTED', processingNotes: 'DUPLICATE_OPEN_SESSION', updatedAt: new Date() })
                    .where(eq(attendanceRawLogs.id, rawLog.id));
            } else {
                [session] = await db.insert(attendanceSessions).output().values({
                    ...this.calculateShiftMetrics(occurredAt, null, context),
                    id: makeId('SES'),
                    employeeId: resolvedEmployeeId,
                    branchId: input.branchId,
                    sourceType: input.sourceType,
                    status: geofenceBreach ? 'EXCEPTION' : 'OPEN',
                    checkInRawLogId: rawLog.id,
                    clockInAt: occurredAt,
                    riskFlags: geofenceBreach ? ['OFF_GEOFENCE'] : [],
                });
                await db.update(attendanceRawLogs)
                    .set({ processingStatus: 'PROCESSED', updatedAt: new Date() })
                    .where(eq(attendanceRawLogs.id, rawLog.id));
            }
        } else if (effectiveEventType === 'OUT') {
            const [openSession] = await db.select().from(attendanceSessions)
                .where(and(
                    eq(attendanceSessions.employeeId, resolvedEmployeeId),
                    eq(attendanceSessions.status, 'OPEN'),
                ))
                .orderBy(desc(attendanceSessions.clockInAt))
                .offset(0).fetch(1);

            if (!openSession) {
                exception = await this.createException({
                    employeeId: resolvedEmployeeId,
                    branchId: input.branchId,
                    rawLogId: rawLog.id,
                    type: 'MISSING_IN',
                    severity: 'HIGH',
                    title: 'Clock-out detected without an open attendance session',
                    details: smartDecision?.reason || 'No open attendance session was found for this employee',
                    metadata: { smartDecision },
                });
                await db.update(attendanceRawLogs)
                    .set({ processingStatus: 'REJECTED', processingNotes: 'MISSING_IN', updatedAt: new Date() })
                    .where(eq(attendanceRawLogs.id, rawLog.id));
            } else {
                const crossBranchExit = openSession.branchId !== input.branchId;
                const totalHours = Number((((occurredAt.getTime() - new Date(openSession.clockInAt).getTime()) / 3600000)).toFixed(2));
                const sessionContext = crossBranchExit
                    ? await this.getAttendanceContext(resolvedEmployeeId, openSession.branchId, new Date(openSession.clockInAt))
                    : context;
                const metrics = this.calculateShiftMetrics(new Date(openSession.clockInAt), occurredAt, sessionContext);
                const existingFlags = Array.isArray(openSession.riskFlags) ? openSession.riskFlags : [];
                const riskFlags = [
                    ...existingFlags,
                    ...(geofenceBreach ? ['OFF_GEOFENCE'] : []),
                    ...(crossBranchExit ? ['CROSS_BRANCH_EXIT'] : []),
                ];
                [session] = await db.update(attendanceSessions)
                    .set({
                        checkOutRawLogId: rawLog.id,
                        clockOutAt: occurredAt,
                        totalHours: totalHours > 0 ? totalHours : 0,
                        lateMinutes: metrics.lateMinutes,
                        earlyLeaveMinutes: metrics.earlyLeaveMinutes,
                        overtimeMinutes: metrics.overtimeMinutes,
                        status: geofenceBreach ? 'EXCEPTION' : 'CLOSED',
                        riskFlags,
                        notes: [
                            openSession.notes,
                            crossBranchExit ? `Clock-out captured from branch ${input.branchId}` : '',
                        ].filter(Boolean).join('\n') || openSession.notes,
                        updatedAt: new Date(),
                    })
                    .output()
                    .where(eq(attendanceSessions.id, openSession.id));
                await db.update(attendanceRawLogs)
                    .set({ processingStatus: 'PROCESSED', updatedAt: new Date() })
                    .where(eq(attendanceRawLogs.id, rawLog.id));
            }
        } else {
            exception = await this.createException({
                employeeId: resolvedEmployeeId,
                branchId: input.branchId,
                rawLogId: rawLog.id,
                type: 'UNKNOWN_EVENT',
                severity: 'MEDIUM',
                title: 'Attendance log has unknown direction',
                details: smartDecision?.reason || 'The event type could not be classified as IN or OUT',
                metadata: { smartDecision },
            });
            await db.update(attendanceRawLogs)
                .set({ processingStatus: 'REJECTED', processingNotes: 'UNKNOWN_EVENT', updatedAt: new Date() })
                .where(eq(attendanceRawLogs.id, rawLog.id));
        }

        if (geofenceBreach) {
            const geoException = await this.createException({
                employeeId: resolvedEmployeeId,
                branchId: input.branchId,
                rawLogId: rawLog.id,
                sessionId: session?.id,
                type: 'OFF_GEOFENCE',
                severity: 'HIGH',
                title: 'Location attendance recorded outside branch geofence',
                details: 'Check-in/check-out happened outside the allowed branch radius',
                metadata: { lat: input.geoLat, lng: input.geoLng, accuracy: input.geoAccuracyMeters },
            });
            exception = exception || geoException;
        }

        return { rawLog, session, exception, duplicate: false };
    },

    async getOpenSession(employeeId: string, branchId?: string) {
        const [openSession] = await db.select().from(attendanceSessions)
            .where(and(
                eq(attendanceSessions.employeeId, employeeId),
                branchId ? eq(attendanceSessions.branchId, branchId) : undefined,
                eq(attendanceSessions.status, 'OPEN'),
            ))
            .orderBy(desc(attendanceSessions.clockInAt))
            .offset(0).fetch(1);
        return openSession || null;
    },

    async locationClock(employeeId: string, branchId: string, eventType: 'IN' | 'OUT', lat: number, lng: number, accuracy?: number) {
        return this.ingestRawLog({
            employeeId,
            branchId,
            sourceType: 'LOCATION',
            eventType,
            geoLat: lat,
            geoLng: lng,
            geoAccuracyMeters: accuracy,
            employeeIdentifier: employeeId,
            rawPayload: { employeeId, branchId, eventType, lat, lng, accuracy },
        });
    },

    async createException(input: {
        employeeId?: string | null;
        branchId: string;
        rawLogId?: string;
        sessionId?: string;
        type: string;
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        title: string;
        details?: string;
        metadata?: Record<string, any>;
    }) {
        const now = new Date();
        const slaMinutes = getSlaMinutes(input.severity);
        const slaDueAt = new Date(now.getTime() + (slaMinutes * 60000));
        const [created] = await db.insert(attendanceExceptions).output().values({
            id: makeId('AEX'),
            employeeId: input.employeeId || undefined,
            branchId: input.branchId,
            rawLogId: input.rawLogId,
            sessionId: input.sessionId,
            type: input.type,
            severity: input.severity,
            title: input.title,
            details: input.details,
            metadata: input.metadata || {},
            slaDueAt,
        });

        await eventBusService.emitEvent({
            type: 'attendance.exception.raised',
            entityType: 'attendance_exception',
            entityId: created.id,
            branchId: input.branchId,
            payload: {
                severity: input.severity,
                type: input.type,
                title: input.title,
            },
        });
        return created;
    },

    async listSessions(branchId?: string, status?: string, startDate?: string, endDate?: string, employeeId?: string) {
        const { start, end } = buildDateRange(startDate, endDate);
        const duplicateWindowMs = Number(process.env.ATTENDANCE_SMART_DUPLICATE_WINDOW_MINUTES || 5) * 60000;
        const requestedStartDay = startDate ? String(startDate).slice(0, 10) : null;
        const requestedEndDay = (endDate || startDate) ? String(endDate || startDate).slice(0, 10) : null;
        const [rangeStartDay, rangeEndDay] = requestedStartDay && requestedEndDay
            ? [requestedStartDay, requestedEndDay].sort()
            : [requestedStartDay, requestedEndDay];
        const defaultOperationalConfig = getAttendanceProcessingConfig();
        const operationalRangeStart = rangeStartDay ? getOperationalWindowForConfig(rangeStartDay, defaultOperationalConfig).start : start;
        const operationalRangeEnd = rangeEndDay ? getOperationalWindowForConfig(rangeEndDay, defaultOperationalConfig).end : end;

        const sessions = await db.select().from(attendanceSessions)
            .where(and(
                branchId ? eq(attendanceSessions.branchId, branchId) : undefined,
                status ? eq(attendanceSessions.status, status) : undefined,
                employeeId ? eq(attendanceSessions.employeeId, employeeId) : undefined,
                operationalRangeStart ? gte(attendanceSessions.clockInAt, operationalRangeStart) : undefined,
                operationalRangeEnd ? lte(attendanceSessions.clockInAt, operationalRangeEnd) : undefined,
            ))
            .orderBy(desc(attendanceSessions.clockInAt));

        const visible: typeof sessions = [];
        for (const session of sessions) {
            const clockInAt = new Date(session.clockInAt);
            const clockOutAt = session.clockOutAt ? new Date(session.clockOutAt) : null;
            const context = await this.getAttendanceContext(session.employeeId, session.branchId, clockInAt);
            const processingConfig = getAttendanceProcessingConfig(context);
            const operationalDay = getOperationalDayKeyForConfig(clockInAt, processingConfig);
            if (rangeStartDay && rangeEndDay && (operationalDay < rangeStartDay || operationalDay > rangeEndDay)) {
                continue;
            }
            if (
                isRolloverExitPunchForConfig(clockInAt, processingConfig) &&
                !clockOutAt &&
                Number(session.totalHours || 0) <= 0
            ) {
                continue;
            }
            const samePunchDuplicate = visible.some(existing => (
                existing.employeeId === session.employeeId &&
                existing.branchId === session.branchId &&
                Math.abs(new Date(existing.clockInAt).getTime() - clockInAt.getTime()) <= duplicateWindowMs
            ));
            if (samePunchDuplicate) continue;

            if (clockOutAt && clockOutAt < clockInAt) {
                const cleanedFlags = Array.from(new Set([...(Array.isArray(session.riskFlags) ? session.riskFlags : []), 'INVALID_REVERSED_CLOCKS']));
                visible.push({
                    ...session,
                    status: 'OPEN',
                    checkOutRawLogId: null,
                    clockOutAt: null,
                    totalHours: 0,
                    riskFlags: cleanedFlags as any,
                    notes: [session.notes, 'Hidden invalid clock-out because it is earlier than clock-in. Run smart rebuild for the period.'].filter(Boolean).join('\n'),
                });
                continue;
            }

            visible.push(session);
        }
        return visible;
    },

    async backfillLegacyAttendanceSessions(limit = 250) {
        const legacyRows = await db.select().from(attendance)
            .orderBy(desc(attendance.clockIn))
            .offset(0).fetch(limit);

        let createdCount = 0;
        for (const row of legacyRows) {
            const [existing] = await db.select().top(1).from(attendanceSessions)
                .where(and(
                    eq(attendanceSessions.employeeId, row.employeeId),
                    eq(attendanceSessions.branchId, row.branchId),
                    eq(attendanceSessions.clockInAt, row.clockIn),
                ));
            if (existing) continue;

            await db.insert(attendanceSessions).values({
                id: makeId('SES'),
                employeeId: row.employeeId,
                branchId: row.branchId,
                sourceType: 'MANUAL_APPROVED',
                status: row.clockOut ? 'CLOSED' : 'OPEN',
                clockInAt: row.clockIn,
                clockOutAt: row.clockOut,
                totalHours: row.totalHours || 0,
                notes: row.notes,
            });
            createdCount += 1;
        }

        return { processed: legacyRows.length, created: createdCount };
    },

    async dailyCloseAttendance(input: { branchId: string; date: string; closedBy?: string; forceClose?: boolean; includePayrollPreview?: boolean }) {
        const targetDate = new Date(input.date);
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const sessions = await db.select().from(attendanceSessions)
            .where(and(
                eq(attendanceSessions.branchId, input.branchId),
                gte(attendanceSessions.clockInAt, startOfDay),
                lte(attendanceSessions.clockInAt, endOfDay),
            ))
            .orderBy(desc(attendanceSessions.clockInAt));

        const openSessions = sessions.filter((s) => s.status === 'OPEN');
        let closedSessions = 0;
        let exceptionsCreated = 0;

        for (const session of openSessions) {
            const context = await this.getAttendanceContext(session.employeeId, session.branchId, new Date(session.clockInAt));
            const allowAutoClose = input.forceClose || Boolean(context.policy?.autoCloseOpenSessions);
            if (!allowAutoClose) {
                const existing = await db.select()
                    .top(1)
                    .from(attendanceExceptions)
                    .where(and(
                        eq(attendanceExceptions.sessionId, session.id),
                        eq(attendanceExceptions.type, 'MISSING_OUT'),
                        eq(attendanceExceptions.status, 'OPEN'),
                    ));
                if (!existing[0]) {
                    await this.createException({
                        employeeId: session.employeeId,
                        branchId: session.branchId,
                        sessionId: session.id,
                        type: 'MISSING_OUT',
                        severity: 'HIGH',
                        title: 'Open attendance session missing clock-out',
                        details: 'Daily close detected open session without clock-out.',
                    });
                    exceptionsCreated += 1;
                }
                continue;
            }

            let clockOutAt: Date | null = null;
            if (context.template) {
                let shiftEnd = buildShiftDateTime(new Date(session.clockInAt), context.template.endTime, Boolean(context.template.isOvernight));
                if (shiftEnd && shiftEnd <= new Date(session.clockInAt)) {
                    shiftEnd = buildShiftDateTime(new Date(session.clockInAt), context.template.endTime, true);
                }
                clockOutAt = shiftEnd || endOfDay;
            } else {
                clockOutAt = endOfDay;
            }

            const totalHours = clockOutAt
                ? Number((((clockOutAt.getTime() - new Date(session.clockInAt).getTime()) / 3600000)).toFixed(2))
                : 0;
            const metrics = this.calculateShiftMetrics(new Date(session.clockInAt), clockOutAt, context);

            const autoResolveMissingOut = input.forceClose || Boolean(context.policy?.autoResolveMissingOut);
            const nextStatus = autoResolveMissingOut ? 'CLOSED' : 'EXCEPTION';

            await db.update(attendanceSessions)
                .set({
                    clockOutAt: clockOutAt || undefined,
                    totalHours: totalHours > 0 ? totalHours : 0,
                    lateMinutes: metrics.lateMinutes,
                    earlyLeaveMinutes: metrics.earlyLeaveMinutes,
                    overtimeMinutes: metrics.overtimeMinutes,
                    status: nextStatus,
                    updatedAt: new Date(),
                })
                .where(eq(attendanceSessions.id, session.id));

            closedSessions += 1;

            if (!autoResolveMissingOut) {
                await this.createException({
                    employeeId: session.employeeId,
                    branchId: session.branchId,
                    sessionId: session.id,
                    type: 'MISSING_OUT',
                    severity: 'MEDIUM',
                    title: 'Auto-closed session requires review',
                    details: 'Clock-out auto generated at daily close.',
                });
                exceptionsCreated += 1;
            }
        }

        let payrollPreview: any = null;
        if (input.includePayrollPreview) {
            const employeesList = await db.select().from(employees)
                .where(and(eq(employees.branchId, input.branchId), eq(employees.isActive, true)));

            const components = await db.select().from(payrollComponents)
                .where(eq(payrollComponents.branchId, input.branchId));
            const componentById = new Map(components.map((c) => [c.id, c]));

            const lines = [];
            let totalImpact = 0;

            for (const employee of employeesList) {
                const employeeSessions = sessions.filter((s) => s.employeeId === employee.id && s.status !== 'EXCEPTION');
                const totalHours = employeeSessions.reduce((sum, s) => sum + Number(s.totalHours || 0), 0);
                const lateMinutes = employeeSessions.reduce((sum, s) => sum + Number(s.lateMinutes || 0), 0);
                const overtimeMinutes = employeeSessions.reduce((sum, s) => sum + Number(s.overtimeMinutes || 0), 0);
                const attendanceDays = employeeSessions.length > 0 ? 1 : 0;

                const context = await this.getAttendanceContext(employee.id, input.branchId, targetDate);
                const expectedDays = context.template?.workDays?.includes(getWeekdayKey(targetDate)) ? 1 : 0;
                const absenceDays = Math.max(0, expectedDays - attendanceDays);

                const payrollContext = await getPayrollContextForDate(employee.id, input.branchId, targetDate);
                const rules = payrollContext.rules;
                const baseSalary = Number(employee.basicSalary || 0);
                const hourlyRate = Number(employee.hourlyRate || 0);

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

                const overtimeRate = payrollContext.profile?.defaultOvertimeRate ?? 1.5;
                const overtimePay = (overtimeMinutes / 60) * hourlyRate * overtimeRate;
                const estimatedImpact = overtimePay + earnings - deductions;
                totalImpact += estimatedImpact;

                lines.push({
                    employeeId: employee.id,
                    totalHours,
                    lateMinutes,
                    overtimeMinutes,
                    attendanceDays,
                    expectedDays,
                    absenceDays,
                    overtimePay,
                    earnings,
                    deductions,
                    estimatedNetImpact: estimatedImpact,
                });
            }

            payrollPreview = {
                date: input.date,
                branchId: input.branchId,
                totals: {
                    employees: lines.length,
                    estimatedNetImpact: totalImpact,
                },
                lines,
            };
        }

        const result = {
            date: input.date,
            branchId: input.branchId,
            closedSessions,
            exceptionsCreated,
            openSessionsRemaining: openSessions.length - closedSessions,
            payrollPreview,
        };

        await eventBusService.emitEvent({
            type: 'attendance.day_closed',
            entityType: 'attendance_day',
            entityId: `${input.branchId}:${input.date}`,
            branchId: input.branchId,
            payload: {
                closedSessions,
                exceptionsCreated,
            },
        });

        return result;
    },

    async monthlyCloseAttendance(input: { branchId: string; startDate: string; endDate: string; closedBy?: string; forceClose?: boolean; includePayrollPreview?: boolean; purgeRawLogs?: boolean }) {
        const periodStart = new Date(input.startDate);
        const periodEnd = new Date(input.endDate);
        const startOfPeriod = new Date(periodStart);
        startOfPeriod.setHours(0, 0, 0, 0);
        const endOfPeriod = new Date(periodEnd);
        endOfPeriod.setHours(23, 59, 59, 999);

        const sessions = await db.select().from(attendanceSessions)
            .where(and(
                eq(attendanceSessions.branchId, input.branchId),
                gte(attendanceSessions.clockInAt, startOfPeriod),
                lte(attendanceSessions.clockInAt, endOfPeriod),
            ))
            .orderBy(desc(attendanceSessions.clockInAt));

        const openSessions = sessions.filter((s) => s.status === 'OPEN');
        let closedSessions = 0;
        let exceptionsCreated = 0;

        for (const session of openSessions) {
            const context = await this.getAttendanceContext(session.employeeId, session.branchId, new Date(session.clockInAt));
            const allowAutoClose = input.forceClose || Boolean(context.policy?.autoCloseOpenSessions);
            if (!allowAutoClose) {
                const existing = await db.select()
                    .top(1)
                    .from(attendanceExceptions)
                    .where(and(
                        eq(attendanceExceptions.sessionId, session.id),
                        eq(attendanceExceptions.type, 'MISSING_OUT'),
                        eq(attendanceExceptions.status, 'OPEN'),
                    ));
                if (!existing[0]) {
                    await this.createException({
                        employeeId: session.employeeId,
                        branchId: session.branchId,
                        sessionId: session.id,
                        type: 'MISSING_OUT',
                        severity: 'HIGH',
                        title: 'Open attendance session missing clock-out',
                        details: 'Periodic close detected open session without clock-out.',
                    });
                    exceptionsCreated += 1;
                }
                continue;
            }

            let clockOutAt: Date | null = null;
            if (context.template) {
                let shiftEnd = buildShiftDateTime(new Date(session.clockInAt), context.template.endTime, Boolean(context.template.isOvernight));
                if (shiftEnd && shiftEnd <= new Date(session.clockInAt)) {
                    shiftEnd = buildShiftDateTime(new Date(session.clockInAt), context.template.endTime, true);
                }
                clockOutAt = shiftEnd || endOfPeriod;
            } else {
                clockOutAt = endOfPeriod;
            }

            const totalHours = clockOutAt
                ? Number((((clockOutAt.getTime() - new Date(session.clockInAt).getTime()) / 3600000)).toFixed(2))
                : 0;
            const metrics = this.calculateShiftMetrics(new Date(session.clockInAt), clockOutAt, context);

            const autoResolveMissingOut = input.forceClose || Boolean(context.policy?.autoResolveMissingOut);
            const nextStatus = autoResolveMissingOut ? 'CLOSED' : 'EXCEPTION';

            await db.update(attendanceSessions)
                .set({
                    clockOutAt: clockOutAt || undefined,
                    totalHours: totalHours > 0 ? totalHours : 0,
                    lateMinutes: metrics.lateMinutes,
                    earlyLeaveMinutes: metrics.earlyLeaveMinutes,
                    overtimeMinutes: metrics.overtimeMinutes,
                    status: nextStatus,
                    updatedAt: new Date(),
                })
                .where(eq(attendanceSessions.id, session.id));

            closedSessions += 1;

            if (!autoResolveMissingOut) {
                await this.createException({
                    employeeId: session.employeeId,
                    branchId: session.branchId,
                    sessionId: session.id,
                    type: 'MISSING_OUT',
                    severity: 'MEDIUM',
                    title: 'Auto-closed session requires review',
                    details: 'Clock-out auto generated during periodic close.',
                });
                exceptionsCreated += 1;
            }
        }

        let payrollPreview: any = null;
        if (input.includePayrollPreview) {
            const employeesList = await db.select().from(employees)
                .where(and(eq(employees.branchId, input.branchId), eq(employees.isActive, true)));

            const components = await db.select().from(payrollComponents)
                .where(eq(payrollComponents.branchId, input.branchId));
            const componentById = new Map(components.map((c) => [c.id, c]));

            const lines = [];
            let totalImpact = 0;

            for (const employee of employeesList) {
                const employeeSessions = sessions.filter((s) => s.employeeId === employee.id && s.status !== 'EXCEPTION');
                const totalHours = employeeSessions.reduce((sum, s) => sum + Number(s.totalHours || 0), 0);
                const lateMinutes = employeeSessions.reduce((sum, s) => sum + Number(s.lateMinutes || 0), 0);
                const overtimeMinutes = employeeSessions.reduce((sum, s) => sum + Number(s.overtimeMinutes || 0), 0);
                const attendanceDays = new Set(employeeSessions.map((s) => new Date(s.clockInAt).toISOString().slice(0, 10))).size;

                const context = await this.getAttendanceContext(employee.id, input.branchId, startOfPeriod);
                const expectedDays = context.template?.workDays?.length
                    ? (() => {
                        const workDays = new Set<string>(context.template.workDays || []);
                        let count = 0;
                        const cursor = new Date(startOfPeriod);
                        while (cursor <= endOfPeriod) {
                            if (workDays.has(getWeekdayKey(cursor))) count += 1;
                            cursor.setDate(cursor.getDate() + 1);
                        }
                        return count;
                    })()
                    : 0;
                const absenceDays = Math.max(0, expectedDays - attendanceDays);

                const payrollContext = await getPayrollContextForDate(employee.id, input.branchId, startOfPeriod);
                const rules = payrollContext.rules;
                const baseSalary = Number(employee.basicSalary || 0);
                const hourlyRate = Number(employee.hourlyRate || 0);

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

                const overtimeRate = payrollContext.profile?.defaultOvertimeRate ?? 1.5;
                const overtimePay = (overtimeMinutes / 60) * hourlyRate * overtimeRate;
                const estimatedImpact = overtimePay + earnings - deductions;
                totalImpact += estimatedImpact;

                lines.push({
                    employeeId: employee.id,
                    totalHours,
                    lateMinutes,
                    overtimeMinutes,
                    attendanceDays,
                    expectedDays,
                    absenceDays,
                    overtimePay,
                    earnings,
                    deductions,
                    estimatedNetImpact: estimatedImpact,
                });
            }

            payrollPreview = {
                startDate: input.startDate,
                endDate: input.endDate,
                branchId: input.branchId,
                totals: {
                    employees: lines.length,
                    estimatedNetImpact: totalImpact,
                },
                lines,
            };
        }

        let logsPurgedCount = 0;
        if (input.purgeRawLogs) {
            const rawLogsToPurge = await db.select({ id: attendanceRawLogs.id })
                .from(attendanceRawLogs)
                .where(and(
                    eq(attendanceRawLogs.branchId, input.branchId),
                    gte(attendanceRawLogs.occurredAt, startOfPeriod),
                    lte(attendanceRawLogs.occurredAt, endOfPeriod)
                ));
            const logIds = rawLogsToPurge.map(l => l.id);
            if (logIds.length > 0) {
                const chunkSize = 2000;
                for (let i = 0; i < logIds.length; i += chunkSize) {
                    const chunk = logIds.slice(i, i + chunkSize);
                    await db.update(attendanceSessions)
                        .set({ checkInRawLogId: null, checkOutRawLogId: null })
                        .where(and(
                            eq(attendanceSessions.branchId, input.branchId),
                            or(
                                inArray(attendanceSessions.checkInRawLogId, chunk),
                                inArray(attendanceSessions.checkOutRawLogId, chunk)
                            )
                        ));
                    await db.update(attendanceExceptions)
                        .set({ rawLogId: null })
                        .where(and(
                            eq(attendanceExceptions.branchId, input.branchId),
                            inArray(attendanceExceptions.rawLogId, chunk)
                        ));
                }
                const deleteResult = await db.delete(attendanceRawLogs)
                    .output({ id: attendanceRawLogs.id })
                    .where(and(
                        eq(attendanceRawLogs.branchId, input.branchId),
                        gte(attendanceRawLogs.occurredAt, startOfPeriod),
                        lte(attendanceRawLogs.occurredAt, endOfPeriod)
                    ));
                logsPurgedCount = deleteResult.length;
            }
        }

        const result = {
            startDate: input.startDate,
            endDate: input.endDate,
            branchId: input.branchId,
            closedSessions,
            exceptionsCreated,
            openSessionsRemaining: openSessions.length - closedSessions,
            payrollPreview,
            logsPurged: logsPurgedCount,
        };

        await eventBusService.emitEvent({
            type: 'attendance.period_closed',
            entityType: 'attendance_period',
            entityId: `${input.branchId}:${input.startDate}:${input.endDate}`,
            branchId: input.branchId,
            payload: {
                closedSessions,
                exceptionsCreated,
                logsPurged: logsPurgedCount,
            },
        });

        return result;
    },

    async clearAllAttendanceData(branchId?: string) {
        if (branchId) {
            const branchEmployees = await db.select({ id: employees.id })
                .from(employees)
                .where(eq(employees.branchId, branchId));
            
            const employeeIds = branchEmployees.map(e => e.id);

            if (employeeIds.length > 0) {
                await db.delete(attendanceCorrections)
                    .where(inArray(attendanceCorrections.employeeId, employeeIds));
            }

            await db.delete(attendanceExceptions).where(eq(attendanceExceptions.branchId, branchId));
            await db.delete(attendanceSessions).where(eq(attendanceSessions.branchId, branchId));
            await db.delete(attendanceRawLogs).where(eq(attendanceRawLogs.branchId, branchId));
            await db.delete(attendanceSyncRuns).where(eq(attendanceSyncRuns.branchId, branchId));
            await db.delete(attendance).where(eq(attendance.branchId, branchId));

            const branchDevices = await db.select().from(attendanceDevices).where(eq(attendanceDevices.branchId, branchId));
            for (const device of branchDevices) {
                const notes: any = parseDeviceNotes(device.notes);
                notes.sync = {
                    ...(notes.sync || {}),
                    initialHistoryLoadedAt: null,
                };
                await db.update(attendanceDevices)
                    .set({ notes: JSON.stringify(notes), updatedAt: new Date() })
                    .where(eq(attendanceDevices.id, device.id));
            }
        } else {
            await db.delete(attendanceCorrections);
            await db.delete(attendanceExceptions);
            await db.delete(attendanceSessions);
            await db.delete(attendanceRawLogs);
            await db.delete(attendanceSyncRuns);
            await db.delete(attendance);

            const devices = await db.select().from(attendanceDevices);
            for (const device of devices) {
                const notes: any = parseDeviceNotes(device.notes);
                notes.sync = {
                    ...(notes.sync || {}),
                    initialHistoryLoadedAt: null,
                };
                await db.update(attendanceDevices)
                    .set({ notes: JSON.stringify(notes), updatedAt: new Date() })
                    .where(eq(attendanceDevices.id, device.id));
            }
        }
        return { success: true };
    },

    async setDeviceInitialHistoryLoaded(deviceId: string, loadedAt: string | null = new Date().toISOString()) {
        const [device] = await db.select().top(1).from(attendanceDevices).where(eq(attendanceDevices.id, deviceId));
        if (!device) return null;
        const notes: any = parseDeviceNotes(device.notes);
        notes.sync = {
            ...(notes.sync || {}),
            initialHistoryLoadedAt: loadedAt,
        };
        const [updated] = await db.update(attendanceDevices)
            .set({ notes: JSON.stringify(notes), updatedAt: new Date() })
            .output()
            .where(eq(attendanceDevices.id, deviceId));
        return updated;
    },
};

export default attendanceOpsService;

