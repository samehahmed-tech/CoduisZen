/**
 * ZKTeco Biometric Device Connector Service
 * ==========================================
 * Implements communication with ZKTeco attendance machines using 'node-zklib'
 * 
 * Architecture:
 *   1. CRON auto-sync every N minutes pulls logs from all active devices
 *   2. Each raw attendance log is fed into attendanceOpsService.ingestRawLog()
 *   3. TXT file import as fallback when network is unavailable
 */

import ZKLib from 'node-zklib';
import crypto from 'crypto';
import { db } from '../db';
import { attendanceDevices, attendanceDeviceMappings, attendanceRawLogs, attendanceSessions, employees } from '../../src/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import attendanceOpsService from './attendanceOpsService';
import logger from '../utils/logger';

const log = logger.child({ domain: 'ZKTecoConnector' });

// ─── ZKTeco Device Connection Class (via node-zklib) ─────────────────────

interface ZKConnectionOptions {
    ip: string;
    port: number;
    timeout?: number;
}

type PulledAttendanceLog = { uid: string; timestamp: Date; status: number | null };

class ZKDevice {
    private ip: string;
    private port: number;
    private timeout: number;
    private zkInstance: any = null;
    private connected = false;

    constructor(options: ZKConnectionOptions) {
        this.ip = options.ip;
        this.port = options.port;
        this.timeout = options.timeout || 120000; // Increased to 120s for huge ADSL downloads
        this.zkInstance = new ZKLib(this.ip, this.port, this.timeout, 5200);
    }

    async connect(): Promise<boolean> {
        try {
            await this.zkInstance.createSocket();
            this.connected = true;
            log.info({ ip: this.ip, port: this.port }, 'ZKTeco device connected');
            return true;
        } catch (err: any) {
            this.connected = false;
            throw new Error(`Connection to ZK failed (${this.ip}:${this.port}): ${err.message}`);
        }
    }

    async disconnect(): Promise<void> {
        if (this.zkInstance && this.connected) {
            try {
                await this.zkInstance.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
            this.connected = false;
        }
    }

    /**
     * Fetch attendance logs from the device. 
     * ALWAYS uses getAttendances() (full fetch) because getRecentAttendances()
     * has a buffer offset bug that returns corrupted timestamps (year 2000).
     * Filtering by date/count is done later in the sync pipeline.
     */
    async getAttendanceLogs(_limit = 0): Promise<PulledAttendanceLog[]> {
        const parsedLogs: PulledAttendanceLog[] = [];

        if (!this.connected) throw new Error('Not connected');

        try {
            // IMPORTANT: Always use getAttendances() for full fetch.
            // getRecentAttendances() has a buffer offset bug that reads from
            // the wrong position, returning records with year-2000 timestamps.
            const logsResponse = await this.zkInstance.getAttendances();
            
            if (logsResponse && logsResponse.err) {
                log.warn({ err: logsResponse.err, ip: this.ip }, 'Received partial/error response from device');
                throw new Error(logsResponse.err.message || String(logsResponse.err));
            }
            
            if (logsResponse && Array.isArray(logsResponse.data)) {
                for (const record of logsResponse.data) {
                    const uid = record.deviceUserId || record.userId || record.uid;
                    const timestamp = new Date(record.recordTime || record.attTime || record.timestamp);
                    const rawStatus = record.state ?? record.status ?? record.punch ?? record.punchState ?? record.type;
                    const status = rawStatus === undefined || rawStatus === null || rawStatus === ''
                        ? null
                        : Number.parseInt(String(rawStatus), 10);
                    
                    if (uid && !isNaN(timestamp.getTime()) && timestamp.getFullYear() > 2010) {
                        parsedLogs.push({ uid: uid.toString(), timestamp, status: Number.isNaN(status as number) ? null : status });
                    }
                }
            }
            
            log.info({ ip: this.ip, totalParsed: parsedLogs.length }, 'Fetched attendance logs from device');
        } catch (err: any) {
            log.error({ err: err.message, ip: this.ip }, 'Failed fetching attendances');
            throw err;
        }

        return parsedLogs;
    }

    async getDeviceInfo(): Promise<{ records: number; users: number; fingers: number } | null> {
        if (!this.connected) return null;
        try {
            const info = await this.zkInstance.getInfo();
            return {
                records: info.logCounts || 0,
                users: info.userCounts || 0,
                fingers: 0
            };
        } catch {
            return null;
        }
    }

    async getLogStats(): Promise<{ records: number; users: number; capacity?: number | null }> {
        if (!this.connected) throw new Error('Not connected');
        const info = await this.zkInstance.getInfo();
        return {
            records: Number(info?.logCounts || 0),
            users: Number(info?.userCounts || 0),
            capacity: info?.logCapacity === undefined ? null : Number(info.logCapacity),
        };
    }

    async getDeviceTime(): Promise<Date | null> {
        if (!this.connected) return null;
        try {
            const deviceTime = await this.zkInstance.getTime?.();
            const parsed = new Date(deviceTime || new Date());
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        } catch {
            return null;
        }
    }

    /**
     * Requirement: fetchAllLogs
     * Fetches all logs. Used mostly for initial bulk loads. 
     * WARNING: Fails gracefully and advises DateRange fallback on WAN devices with large payload.
     */
    async fetchAllLogs(): Promise<PulledAttendanceLog[]> {
        return this.getAttendanceLogs(0); // 0 limit means fetch ALL from modified ZKLib
    }

    /**
     * Requirement: fetchLogsByDateRange
     * Due to ZKTeco's lack of native Date querying over socket, we leverage `getRecentAttendances`
     * and filter locally, heavily avoiding full 2MB chunk transfers.
     */
    async fetchLogsByDateRange(startDate: Date, endDate: Date): Promise<PulledAttendanceLog[]> {
        // Fetch ALL logs for date range searches to ensure we don't miss records 
        // that are outside the "recent" buffer.
        const logs = await this.getAttendanceLogs(0); 
        return logs.filter(l => l.timestamp >= startDate && l.timestamp <= endDate);
    }

    /**
     * Requirement: streamRealTimeLogs
     * Opens a persistent TCP listener that waits for live attendances and executes the callback.
     */
    async streamRealTimeLogs(onLogArrival: (log: PulledAttendanceLog) => void): Promise<void> {
        if (!this.connected) throw new Error('Not connected');
        
        try {
            await this.zkInstance.getRealTimeLogs((data: any) => {
                const uid = data.userId || data.uid || data.deviceUserId;
                if (!uid) return;
                const timestamp = new Date(data.recordTime || new Date());
                const rawStatus = data.state ?? data.status ?? data.punch ?? data.type;
                const status = rawStatus === undefined || rawStatus === null || rawStatus === ''
                    ? null
                    : Number.parseInt(String(rawStatus), 10);
                onLogArrival({ uid: uid.toString(), timestamp, status });
            });
            log.info({ ip: this.ip }, 'Real-time log stream connected successfully');
        } catch (err: any) {
            log.error({ ip: this.ip, err: err.message }, 'Failed to start real-time streams');
            throw err;
        }
    }

    async clearAttendanceLog(): Promise<boolean> {
        if (!this.connected) throw new Error('Not connected');
        try {
            await this.zkInstance.clearAttendanceLog();
            log.info({ ip: this.ip }, 'Attendance logs cleared on device');
            return true;
        } catch (err: any) {
            log.error({ ip: this.ip, err: err.message }, 'Failed to clear attendance logs');
            throw err;
        }
    }

    async restart(): Promise<boolean> {
        if (!this.connected) throw new Error('Not connected');
        try {
            if (typeof this.zkInstance.restart === 'function') {
                await this.zkInstance.restart(true);
            } else {
                await this.zkInstance.executeCmd(1004, '');
            }
            log.info({ ip: this.ip }, 'Device restart command sent');
            return true;
        } catch (err: any) {
            log.error({ ip: this.ip, err: err.message }, 'Failed to restart device');
            throw err;
        }
    }

    async setTime(date: Date = new Date()): Promise<boolean> {
        if (!this.connected) throw new Error('Not connected');
        try {
            await this.zkInstance.setTime(date);
            log.info({ ip: this.ip, time: date.toISOString() }, 'Device time updated');
            return true;
        } catch (err: any) {
            log.error({ ip: this.ip, err: err.message }, 'Failed to set device time');
            throw err;
        }
    }

    isConnected(): boolean {
        return this.connected;
    }
}

// ─── Sync Orchestrator ───────────────────────────────────────────────────

export interface DeviceSyncResult {
    deviceId: string;
    deviceName: string;
    branchId: string;
    success: boolean;
    fetchMode: 'AUTO' | 'RECENT' | 'ALL' | 'RANGE';
    logsReceived: number;
    logsFilteredOut: number;
    logsIngested: number;
    logsSkipped: number;
    unknownEmployees: number;
    exceptionsRaised: number;
    sessionsOpened: number;
    sessionsClosed: number;
    processedRange: {
        startDate: string | null;
        endDate: string | null;
    };
    errors: string[];
    durationMs: number;
    autoProcessing?: AttendanceAutoProcessingSummary;
}

interface AttendanceAutoProcessingSummary {
    autoResolvedGroups: number;
    reprocessedUnknownLogs: number;
    rebuiltDays: number;
    updatedSessions: number;
    ignoredDuplicatePunches: number;
    recalculatedSessions: number;
    recalculatedUpdated: number;
    errors: string[];
}

export interface DeviceSyncOptions {
    startDate?: Date;
    endDate?: Date;
    fetchMode?: 'AUTO' | 'RECENT' | 'ALL' | 'RANGE';
    limit?: number;
    overlapHours?: number;
    branchId?: string;
    deviceIds?: string[];
}

export interface DevicePreviewRecord {
    id: string;
    uid: string;
    status: number | null;
    eventType: 'IN' | 'OUT';
    occurredAt: string;
    employeeId: string | null;
    employeeName: string | null;
    employeeNameAr: string | null;
    duplicate: boolean;
    selected: boolean;
    disabled: boolean;
    issues: string[];
    openSessionId?: string | null;
}

export interface DeviceSyncPreviewResult {
    deviceId: string;
    deviceName: string;
    branchId: string;
    logsReceived: number;
    logsFilteredOut: number;
    records: DevicePreviewRecord[];
    summary: {
        newRecords: number;
        duplicates: number;
        unknownEmployees: number;
        missingIns: number;
        missingOuts: number;
        selectable: number;
    };
    processedRange: {
        startDate: string | null;
        endDate: string | null;
    };
}

export interface DevicePreviewCommitRecord {
    uid: string;
    status?: number | null;
    occurredAt: string;
    eventType?: 'IN' | 'OUT';
}

const normalizeSyncOptions = (options?: DeviceSyncOptions): Required<Pick<DeviceSyncOptions, 'fetchMode' | 'limit' | 'overlapHours'>> & Omit<DeviceSyncOptions, 'fetchMode' | 'limit' | 'overlapHours'> => {
    const fetchMode = options?.fetchMode || (options?.startDate || options?.endDate ? 'RANGE' : 'AUTO');
    const limit = Math.max(0, Math.min(Number(options?.limit || 2500), 50000));
    const overlapHours = Math.max(0, Math.min(Number(options?.overlapHours ?? 24), 168));
    return { ...options, fetchMode, limit, overlapHours };
};

const toIsoOrNull = (value?: Date | null) => value ? value.toISOString() : null;

type DeviceNotes = {
    text?: string;
    sync?: {
        autoEnabled?: boolean;
        intervalMinutes?: number;
        failureCount?: number;
        lastError?: string | null;
        lastFailedAt?: string | null;
        lastSuccessAt?: string | null;
        nextRetryAt?: string | null;
        lastAttemptAt?: string | null;
        lastDurationMs?: number;
        lastIngested?: number;
        lastSkipped?: number;
        autoClearAfterSync?: boolean;
        lastAutoClearAt?: string | null;
        lastAutoClearError?: string | null;
    };
};

const parseDeviceNotes = (notes?: string | null): DeviceNotes => {
    if (!notes) return {};
    try {
        const parsed = JSON.parse(notes);
        return parsed && typeof parsed === 'object' ? parsed : { text: notes };
    } catch {
        return { text: notes };
    }
};

const stringifyDeviceNotes = (notes: DeviceNotes) => JSON.stringify(notes);

const getDeviceSyncConfig = (device: typeof attendanceDevices.$inferSelect) => {
    const notes = parseDeviceNotes(device.notes);
    const sync = notes.sync || {};
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
    };
};

const computeDeviceBackoffMinutes = (failureCount: number) => {
    const schedule = [5, 15, 30, 60, 120];
    return schedule[Math.min(Math.max(0, failureCount - 1), schedule.length - 1)];
};

const shouldAutoSyncDevice = (device: typeof attendanceDevices.$inferSelect, now = new Date()) => {
    const cfg = getDeviceSyncConfig(device);
    if (!cfg.autoEnabled) return false;
    if (device.communicationMode === 'BRANCH_BRIDGE') {
        if (!device.branchGatewayId) return false;
    } else if (!device.ipAddress) {
        return false;
    }

    if (cfg.nextRetryAt) {
        const retryAt = new Date(cfg.nextRetryAt);
        if (!Number.isNaN(retryAt.getTime()) && retryAt > now) return false;
    }

    const lastAttemptSource = cfg.lastAttemptAt || device.lastSyncAt?.toISOString?.() || null;
    if (!lastAttemptSource) return true;
    const lastAttempt = new Date(lastAttemptSource);
    if (Number.isNaN(lastAttempt.getTime())) return true;

    return now.getTime() - lastAttempt.getTime() >= cfg.intervalMinutes * 60_000;
};

const updateDeviceSyncNotes = async (
    device: typeof attendanceDevices.$inferSelect,
    result: DeviceSyncResult,
) => {
    const existing = parseDeviceNotes(device.notes);
    const previous = getDeviceSyncConfig(device);
    const now = new Date();
    const nextFailureCount = result.success ? 0 : previous.failureCount + 1;
    const backoffMinutes = result.success ? previous.intervalMinutes : computeDeviceBackoffMinutes(nextFailureCount);
    existing.sync = {
        ...existing.sync,
        autoEnabled: previous.autoEnabled,
        intervalMinutes: previous.intervalMinutes,
        failureCount: nextFailureCount,
        lastError: result.success ? null : (result.errors[0] || 'SYNC_FAILED'),
        lastFailedAt: result.success ? existing.sync?.lastFailedAt || null : now.toISOString(),
        lastSuccessAt: result.success ? now.toISOString() : existing.sync?.lastSuccessAt || null,
        nextRetryAt: new Date(now.getTime() + backoffMinutes * 60_000).toISOString(),
        lastAttemptAt: now.toISOString(),
        lastDurationMs: result.durationMs,
        lastIngested: result.logsIngested,
        lastSkipped: result.logsSkipped,
        autoClearAfterSync: previous.autoClearAfterSync,
        lastAutoClearAt: existing.sync?.lastAutoClearAt || null,
        lastAutoClearError: existing.sync?.lastAutoClearError || null,
    };

    await db.update(attendanceDevices)
        .set({ notes: stringifyDeviceNotes(existing), updatedAt: new Date() })
        .where(eq(attendanceDevices.id, device.id));
};

const markAutoClearResult = async (deviceId: string, patch: { at?: string | null; error?: string | null }) => {
    const [fresh] = await db.select().from(attendanceDevices).where(eq(attendanceDevices.id, deviceId)).limit(1);
    if (!fresh) return;
    const notes = parseDeviceNotes(fresh.notes);
    notes.sync = {
        ...(notes.sync || {}),
        lastAutoClearAt: patch.at ?? notes.sync?.lastAutoClearAt ?? null,
        lastAutoClearError: patch.error ?? null,
    };
    await db.update(attendanceDevices)
        .set({ notes: stringifyDeviceNotes(notes), updatedAt: new Date() })
        .where(eq(attendanceDevices.id, deviceId));
};

const autoClearDirectDeviceLogsWithBackup = async (device: typeof attendanceDevices.$inferSelect) => {
    if (!device.ipAddress) throw new Error('DEVICE_NOT_FOUND_OR_NO_IP');
    const zk = new ZKDevice({ ip: device.ipAddress, port: device.port || 4370 });
    try {
        await zk.connect();
        const logs = await zk.fetchAllLogs();
        await attendanceOpsService.saveDeviceLogBackup({
            branchId: device.branchId,
            deviceId: device.id,
            gatewayId: null,
            sourceType: 'DIRECT_IP',
            operation: 'AUTO_CLEAR_AFTER_SYNC_BACKUP',
            recordCount: logs.length,
            backupFormat: 'JSON',
            rawPayload: {
                device: {
                    id: device.id,
                    name: device.name,
                    code: device.code,
                    ipAddress: device.ipAddress,
                    port: device.port || 4370,
                },
                logs,
                backedUpAt: new Date().toISOString(),
            },
        });
        await zk.clearAttendanceLog();
        await markAutoClearResult(device.id, { at: new Date().toISOString(), error: null });
    } catch (error: any) {
        await markAutoClearResult(device.id, { error: error?.message || 'AUTO_CLEAR_FAILED' });
        throw error;
    } finally {
        await zk.disconnect().catch(() => undefined);
    }
};

const getEventTypeFromStatus = (status?: number | null): 'IN' | 'OUT' | null => (
    typeof status === 'number' && Number.isFinite(status) ? (status % 2 === 0 ? 'IN' : 'OUT') : null
);

const computeAttendanceHash = (
    device: typeof attendanceDevices.$inferSelect,
    mappingIndex: Map<string, string>,
    attLog: PulledAttendanceLog,
    fallbackEventType?: 'IN' | 'OUT',
) => crypto.createHash('sha256')
    .update(JSON.stringify({
        branchId: device.branchId,
        sourceType: 'BIOMETRIC_ZK',
        eventType: fallbackEventType || getEventTypeFromStatus(attLog.status) || 'UNKNOWN',
        deviceId: device.id,
        deviceUserId: attLog.uid,
        employeeId: mappingIndex.get(attLog.uid) || null,
        employeeIdentifier: attLog.uid,
        occurredAt: attLog.timestamp.toISOString(),
    }))
    .digest('hex');

const fetchDeviceLogsForOptions = async (
    device: typeof attendanceDevices.$inferSelect,
    options?: DeviceSyncOptions,
    onProgress?: (step: string, progress: number, total: number, extra?: any) => void,
) => {
    const normalizedOptions = normalizeSyncOptions(options);
    if (!device.ipAddress) throw new Error('DEVICE_HAS_NO_IP_ADDRESS');

    const zk = new ZKDevice({
        ip: device.ipAddress,
        port: device.port || 4370,
        timeout: 900000,
    });

    try {
        onProgress?.('CONNECTING', 10, 100);
        await zk.connect();

        await db.update(attendanceDevices)
            .set({ lastSeenAt: new Date(), updatedAt: new Date() })
            .where(eq(attendanceDevices.id, device.id));

        onProgress?.('FETCHING_LOGS', 30, 100);
        let logs: PulledAttendanceLog[] = [];
        if (normalizedOptions.fetchMode === 'ALL') {
            logs = await zk.fetchAllLogs();
        } else if (normalizedOptions.fetchMode === 'RANGE') {
            if (normalizedOptions.startDate && normalizedOptions.endDate) {
                logs = await zk.fetchLogsByDateRange(normalizedOptions.startDate, normalizedOptions.endDate);
            } else {
                logs = await zk.getAttendanceLogs(0);
            }
        } else {
            logs = await zk.getAttendanceLogs(normalizedOptions.limit);
        }

        const rawCount = logs.length;
        onProgress?.('FILTERING_LOGS', 60, 100, { rawFetched: rawCount });
        logs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        const initialLogCount = logs.length;
        let filterTime = 0;
        if (normalizedOptions.fetchMode === 'ALL') {
            filterTime = new Date('1990-01-01').getTime();
        } else if (normalizedOptions.startDate) {
            filterTime = normalizedOptions.startDate.getTime();
        } else {
            const [lastLog] = await db.select({ occurredAt: attendanceRawLogs.occurredAt })
                .from(attendanceRawLogs)
                .where(eq(attendanceRawLogs.deviceId, device.id))
                .orderBy(desc(attendanceRawLogs.occurredAt))
                .limit(1);
            filterTime = lastLog?.occurredAt
                ? new Date(lastLog.occurredAt).getTime() - (normalizedOptions.overlapHours * 60 * 60 * 1000)
                : new Date('1990-01-01').getTime();
        }

        logs = logs.filter(l => {
            const time = l.timestamp.getTime();
            if (time < filterTime) return false;
            if (normalizedOptions.endDate && time > normalizedOptions.endDate.getTime()) return false;
            return true;
        });

        return {
            logs,
            logsFilteredOut: Math.max(0, initialLogCount - logs.length),
            rawFetched: rawCount,
            processedRange: {
                startDate: logs[0]?.timestamp.toISOString() || toIsoOrNull(normalizedOptions.startDate || null),
                endDate: logs[logs.length - 1]?.timestamp.toISOString() || toIsoOrNull(normalizedOptions.endDate || null),
            },
        };
    } finally {
        try { await zk.disconnect(); } catch { /* noop */ }
    }
};

const buildDevicePreview = async (
    device: typeof attendanceDevices.$inferSelect,
    logs: PulledAttendanceLog[],
    logsFilteredOut: number,
    processedRange: { startDate: string | null; endDate: string | null },
): Promise<DeviceSyncPreviewResult> => {
    const mappings = await db.select().from(attendanceDeviceMappings)
        .where(and(
            eq(attendanceDeviceMappings.deviceId, device.id),
            eq(attendanceDeviceMappings.isActive, true),
        ));
    const mappingIndex = new Map(mappings.map(m => [m.deviceUserId, m.employeeId]));

    const employeeIds = Array.from(new Set(mappings.map(m => m.employeeId).filter(Boolean)));
    const employeeRows = employeeIds.length
        ? await db.select({
            id: employees.id,
            name: employees.name,
            nameAr: employees.nameAr,
        }).from(employees).where(inArray(employees.id, employeeIds))
        : [];
    const employeeIndex = new Map(employeeRows.map(e => [e.id, e]));

    const existingHashRows = await db.select({ hash: attendanceRawLogs.dedupeHash })
        .from(attendanceRawLogs)
        .where(eq(attendanceRawLogs.deviceId, device.id));
    const existingHashes = new Set(existingHashRows.map(r => r.hash));

    const openSessions = employeeIds.length
        ? await db.select().from(attendanceSessions)
            .where(and(
                eq(attendanceSessions.branchId, device.branchId),
                eq(attendanceSessions.status, 'OPEN'),
                inArray(attendanceSessions.employeeId, employeeIds),
            ))
            .orderBy(desc(attendanceSessions.clockInAt))
        : [];
    const sessionState = new Map<string, any>();
    for (const session of openSessions) {
        if (!sessionState.has(session.employeeId)) sessionState.set(session.employeeId, session);
    }

    const records: DevicePreviewRecord[] = logs.map((attLog) => {
        const employeeId = mappingIndex.get(attLog.uid) || null;
        const employee = employeeId ? employeeIndex.get(employeeId) : null;
        const issues: string[] = [];
        let openSessionId: string | null = null;
        const openSession = employeeId ? sessionState.get(employeeId) : null;
        const statusEventType = getEventTypeFromStatus(attLog.status);
        let eventType = statusEventType || (openSession ? 'OUT' : 'IN');

        if (employeeId) {
            if (eventType === 'IN' && openSession) {
                const minutesSinceIn = Math.round((attLog.timestamp.getTime() - new Date(openSession.clockInAt).getTime()) / 60000);
                const minOutAfterIn = Number(process.env.ATTENDANCE_SMART_MIN_OUT_AFTER_IN_MINUTES || 30);
                if (minutesSinceIn >= minOutAfterIn) {
                    eventType = 'OUT';
                }
            } else if (eventType === 'IN' && !openSession && attLog.timestamp.getHours() < Number(process.env.ATTENDANCE_OPERATIONAL_DAY_START_HOUR || 8)) {
                eventType = 'OUT';
            } else if (eventType === 'OUT' && !openSession && attLog.timestamp.getHours() >= Number(process.env.ATTENDANCE_OPERATIONAL_DAY_START_HOUR || 8)) {
                eventType = 'IN';
            }
        }

        const hash = computeAttendanceHash(device, mappingIndex, attLog, eventType);
        const duplicate = existingHashes.has(hash);

        if (duplicate) issues.push('DUPLICATE');
        if (!employeeId) issues.push('UNKNOWN_EMPLOYEE');
        if (!statusEventType) issues.push('INFERRED_DIRECTION');

        if (employeeId && !duplicate) {
            if (eventType === 'IN') {
                if (openSession) {
                    openSessionId = openSession.id;
                    issues.push('MISSING_OUT');
                } else {
                    sessionState.set(employeeId, { id: null, employeeId, clockInAt: attLog.timestamp, preview: true });
                }
            } else if (eventType === 'OUT') {
                if (!openSession) {
                    issues.push('MISSING_IN');
                } else {
                    openSessionId = openSession.id;
                    sessionState.delete(employeeId);
                }
            }
        }

        return {
            id: hash,
            uid: attLog.uid,
            status: attLog.status,
            eventType,
            occurredAt: attLog.timestamp.toISOString(),
            employeeId,
            employeeName: employee?.name || null,
            employeeNameAr: employee?.nameAr || null,
            duplicate,
            selected: !duplicate && !!employeeId,
            disabled: duplicate,
            issues,
            openSessionId,
        };
    });

    return {
        deviceId: device.id,
        deviceName: device.name,
        branchId: device.branchId,
        logsReceived: logs.length,
        logsFilteredOut,
        records,
        summary: {
            newRecords: records.filter(r => !r.duplicate).length,
            duplicates: records.filter(r => r.duplicate).length,
            unknownEmployees: records.filter(r => r.issues.includes('UNKNOWN_EMPLOYEE')).length,
            missingIns: records.filter(r => r.issues.includes('MISSING_IN')).length,
            missingOuts: records.filter(r => r.issues.includes('MISSING_OUT')).length,
            selectable: records.filter(r => !r.disabled).length,
        },
        processedRange,
    };
};

const normalizeAutoProcessingRange = (range?: { startDate?: string | null; endDate?: string | null }) => {
    const startDate = range?.startDate ? new Date(range.startDate) : null;
    const endDate = range?.endDate ? new Date(range.endDate) : null;
    return {
        startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate.toISOString().slice(0, 10) : undefined,
        endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate.toISOString().slice(0, 10) : undefined,
    };
};

const runAttendanceAutoProcessing = async (
    branchId: string,
    range?: { startDate?: string | null; endDate?: string | null },
): Promise<AttendanceAutoProcessingSummary> => {
    const errors: string[] = [];
    const { startDate, endDate } = normalizeAutoProcessingRange(range);
    const limit = Math.max(100, Math.min(Number(process.env.ATTENDANCE_AUTO_PROCESS_LIMIT || 10000), 50000));
    const unknownLimit = Math.max(100, Math.min(Number(process.env.ATTENDANCE_AUTO_RESOLVE_LIMIT || 5000), 50000));

    let autoResolvedGroups = 0;
    let reprocessedUnknownLogs = 0;
    let rebuiltDays = 0;
    let updatedSessions = 0;
    let ignoredDuplicatePunches = 0;
    let recalculatedSessions = 0;
    let recalculatedUpdated = 0;

    try {
        const autoResolved = await attendanceOpsService.autoResolveUnknownBiometricMatches({
            branchId,
            resolvedBy: 'AUTO_PROCESSOR',
            limit: unknownLimit,
        });
        autoResolvedGroups = Number(autoResolved?.resolvedGroups || 0);
        reprocessedUnknownLogs = Number(autoResolved?.reprocessed || 0);
    } catch (error: any) {
        errors.push(`auto-resolve: ${error.message}`);
    }

    try {
        const rebuilt = await attendanceOpsService.rebuildSmartDailySessions({
            branchId,
            startDate,
            endDate,
            limit,
        });
        rebuiltDays = Number(rebuilt?.processedDays || 0);
        updatedSessions = Number(rebuilt?.updatedSessions || 0);
        ignoredDuplicatePunches = Number(rebuilt?.ignoredDuplicates || 0);
    } catch (error: any) {
        errors.push(`smart-rebuild: ${error.message}`);
    }

    try {
        const recalculated = await attendanceOpsService.recalculateAttendanceSessions({
            branchId,
            startDate,
            endDate,
            limit,
        });
        recalculatedSessions = Number(recalculated?.processed || 0);
        recalculatedUpdated = Number(recalculated?.updated || 0);
    } catch (error: any) {
        errors.push(`recalculate: ${error.message}`);
    }

    return {
        autoResolvedGroups,
        reprocessedUnknownLogs,
        rebuiltDays,
        updatedSessions,
        ignoredDuplicatePunches,
        recalculatedSessions,
        recalculatedUpdated,
        errors,
    };
};

const syncDevice = async (device: typeof attendanceDevices.$inferSelect, onProgress?: (data: any) => void, options?: DeviceSyncOptions): Promise<DeviceSyncResult> => {
    const normalizedOptions = normalizeSyncOptions(options);
    const report = (step: string, progress: number, total: number, extra?: any) => {
        if (onProgress) onProgress({ step, progress, total, ...extra });
    };
    const start = Date.now();
    const result: DeviceSyncResult = {
        deviceId: device.id,
        deviceName: device.name,
        branchId: device.branchId,
        success: false,
        fetchMode: normalizedOptions.fetchMode,
        logsReceived: 0,
        logsFilteredOut: 0,
        logsIngested: 0,
        logsSkipped: 0,
        unknownEmployees: 0,
        exceptionsRaised: 0,
        sessionsOpened: 0,
        sessionsClosed: 0,
        processedRange: {
            startDate: toIsoOrNull(normalizedOptions.startDate || null),
            endDate: toIsoOrNull(normalizedOptions.endDate || null),
        },
        errors: [],
        durationMs: 0,
    };

    if (device.communicationMode === 'BRANCH_BRIDGE') {
        result.errors.push('Device is configured for Branch Bridge. Send a bridge sync command instead.');
        result.durationMs = Date.now() - start;
        return result;
    }

    if (!device.ipAddress) {
        result.errors.push('Device has no IP address configured');
        result.success = result.errors.length === 0 && result.logsReceived >= 0;
        result.durationMs = Date.now() - start;
        return result;
    }

    const zk = new ZKDevice({
        ip: device.ipAddress,
        port: device.port || 4370,
        timeout: 900000, // 15 minutes — full fetch of 47K+ logs over WAN takes ~13 min
    });

    try {
        // Create sync run for tracking
        const syncRun = await attendanceOpsService.startSyncRun({
            branchId: device.branchId,
            deviceId: device.id,
            sourceType: device.sourceType || 'BIOMETRIC_ZK',
            metadata: {
                fetchMode: normalizedOptions.fetchMode,
                requestedStartDate: toIsoOrNull(normalizedOptions.startDate || null),
                requestedEndDate: toIsoOrNull(normalizedOptions.endDate || null),
                limit: normalizedOptions.limit,
                overlapHours: normalizedOptions.overlapHours,
            },
        });

        report('CONNECTING', 10, 100);
        await zk.connect();

        // Update lastSeenAt
        await db.update(attendanceDevices)
            .set({ lastSeenAt: new Date(), updatedAt: new Date() })
            .where(eq(attendanceDevices.id, device.id));

        report('FETCHING_LOGS', 30, 100);
        let logs: PulledAttendanceLog[] = [];
        
        if (normalizedOptions.fetchMode === 'ALL') {
            logs = await zk.fetchAllLogs();
        } else if (normalizedOptions.fetchMode === 'RANGE') {
            // If range, we need to be thorough. Start and End are optional but logic prefers both.
            // We use fetchLogsByDateRange if both exist, otherwise fetch all and filter in next step.
            if (normalizedOptions.startDate && normalizedOptions.endDate) {
                logs = await zk.fetchLogsByDateRange(normalizedOptions.startDate, normalizedOptions.endDate);
            } else {
                logs = await zk.getAttendanceLogs(0); // Fetch ALL if it's a loose range
            }
        } else {
            logs = await zk.getAttendanceLogs(normalizedOptions.limit);
        }
        
        const rawCount = logs.length;
        report('FILTERING_LOGS', 60, 100, { rawFetched: rawCount });
        
        // Sort logs chronologically to ensure correct session building (IN before OUT)
        logs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        result.logsReceived = logs.length;

        // Optimize: skip old logs so we don't spam the DB checking for duplicates
        try {
            const [lastLog] = await db.select({ occurredAt: attendanceRawLogs.occurredAt })
                .from(attendanceRawLogs)
                .where(eq(attendanceRawLogs.deviceId, device.id))
                .orderBy(desc(attendanceRawLogs.occurredAt))
                .limit(1);

            let filterTime = 0;
            if (normalizedOptions.fetchMode === 'ALL') {
                filterTime = new Date('1990-01-01').getTime();
            } else if (normalizedOptions.startDate) {
                filterTime = normalizedOptions.startDate.getTime();
            } else if (lastLog && lastLog.occurredAt) {
                filterTime = new Date(lastLog.occurredAt).getTime() - (normalizedOptions.overlapHours * 60 * 60 * 1000);
            } else {
                filterTime = new Date('1990-01-01').getTime();
            }
            
            const initialLogCount = logs.length;
            let finalLogs = logs;
            if (normalizedOptions.endDate) {
                finalLogs = logs.filter(l => l.timestamp.getTime() >= filterTime && l.timestamp.getTime() <= normalizedOptions.endDate!.getTime());
            } else {
                finalLogs = logs.filter(l => l.timestamp.getTime() >= filterTime);
            }
            logs = finalLogs;
            result.logsFilteredOut = Math.max(0, initialLogCount - logs.length);
            if (logs.length > 0) {
                result.processedRange = {
                    startDate: logs[0].timestamp.toISOString(),
                    endDate: logs[logs.length - 1].timestamp.toISOString(),
                };
            }
            
            if (initialLogCount !== logs.length) {
                log.info({ 
                    deviceId: device.id, 
                    totalLogs: initialLogCount,
                    newLogsToProcess: logs.length
                }, 'Filtered old attendance logs');
            }
        } catch (filterErr: any) {
            log.warn({ err: filterErr.message }, 'Failed to filter old logs, will process all logs sequentially');
        }

        // Get device mappings to resolve employee IDs
        const mappings = await db.select().from(attendanceDeviceMappings)
            .where(and(
                eq(attendanceDeviceMappings.deviceId, device.id),
                eq(attendanceDeviceMappings.isActive, true),
            ));
        const mappingIndex = new Map(mappings.map(m => [m.deviceUserId, m.employeeId]));

        // ── OPTIMIZATION: Pre-fetch existing dedupeHashes to skip duplicates in memory ──
        // Instead of hitting the DB for each of the ~47K logs, we load ALL existing
        // hashes for this device into a Set and check in O(1) memory.
        report('LOADING_EXISTING_HASHES', 65, 100);
        const existingHashRows = await db.select({ hash: attendanceRawLogs.dedupeHash })
            .from(attendanceRawLogs)
            .where(eq(attendanceRawLogs.deviceId, device.id));
        const existingHashes = new Set(existingHashRows.map(r => r.hash));
        log.info({ deviceId: device.id, existingCount: existingHashes.size }, 'Loaded existing hashes for dedup');

        // Pre-compute hashes for incoming logs and separate new vs duplicate
        const sessionStateRows = mappings.length
            ? await db.select().from(attendanceSessions)
                .where(and(
                    eq(attendanceSessions.branchId, device.branchId),
                    eq(attendanceSessions.status, 'OPEN'),
                    inArray(attendanceSessions.employeeId, mappings.map(m => m.employeeId)),
                ))
                .orderBy(desc(attendanceSessions.clockInAt))
            : [];
        const sessionState = new Map<string, any>();
        for (const session of sessionStateRows) {
            if (!sessionState.has(session.employeeId)) sessionState.set(session.employeeId, session);
        }

        const preparedLogs = logs.map((attLog) => {
            const employeeId = mappingIndex.get(attLog.uid) || null;
            const statusEventType = getEventTypeFromStatus(attLog.status);
            const openSession = employeeId ? sessionState.get(employeeId) : null;
            let eventType = statusEventType || (openSession ? 'OUT' : 'IN');
            if (employeeId) {
                if (eventType === 'IN' && openSession) {
                    const minutesSinceIn = Math.round((attLog.timestamp.getTime() - new Date(openSession.clockInAt).getTime()) / 60000);
                    const minOutAfterIn = Number(process.env.ATTENDANCE_SMART_MIN_OUT_AFTER_IN_MINUTES || 30);
                    if (minutesSinceIn >= minOutAfterIn) {
                        eventType = 'OUT';
                    }
                } else if (eventType === 'IN' && !openSession && attLog.timestamp.getHours() < Number(process.env.ATTENDANCE_OPERATIONAL_DAY_START_HOUR || 8)) {
                    eventType = 'OUT';
                } else if (eventType === 'OUT' && !openSession && attLog.timestamp.getHours() >= Number(process.env.ATTENDANCE_OPERATIONAL_DAY_START_HOUR || 8)) {
                    eventType = 'IN';
                }

                if (eventType === 'IN') {
                    sessionState.set(employeeId, { employeeId, clockInAt: attLog.timestamp, preview: true });
                } else {
                    sessionState.delete(employeeId);
                }
            }
            return {
                ...attLog,
                eventType,
                dedupeHash: computeAttendanceHash(device, mappingIndex, attLog, eventType),
            };
        });

        const incomingHashes = new Set<string>();
        const newLogs = preparedLogs.filter((log) => {
            if (existingHashes.has(log.dedupeHash) || incomingHashes.has(log.dedupeHash)) {
                return false;
            }
            incomingHashes.add(log.dedupeHash);
            return true;
        });
        result.logsSkipped = logs.length - newLogs.length;
        
        log.info({ 
            deviceId: device.id, 
            totalFetched: logs.length, 
            duplicatesSkipped: result.logsSkipped, 
            newToIngest: newLogs.length 
        }, 'Dedup complete');

        report('INGESTING_LOGS', 70, 100, { 
            totalFetched: logs.length, 
            newToIngest: newLogs.length, 
            duplicatesSkipped: result.logsSkipped 
        });

        let processed = 0;
        for (const attLog of newLogs) {
            processed++;
            if (processed % 100 === 0 || processed === newLogs.length) {
                report('INGESTING_LOGS', 70 + Math.floor((processed / (newLogs.length || 1)) * 25), 100, { 
                    processed, 
                    total: newLogs.length,
                    currentLog: attLog.timestamp 
                });
            }
            try {
                const eventType = attLog.eventType;

                const ingestionResult = await attendanceOpsService.ingestRawLog({
                    branchId: device.branchId,
                    sourceType: 'BIOMETRIC_ZK',
                    eventType: eventType as 'IN' | 'OUT',
                    occurredAt: attLog.timestamp,
                    deviceId: device.id,
                    deviceUserId: attLog.uid,
                    employeeId: mappingIndex.get(attLog.uid) || undefined,
                    employeeIdentifier: attLog.uid,
                    rawPayload: { uid: attLog.uid, status: attLog.status, timestamp: attLog.timestamp.toISOString() },
                    syncRunId: syncRun.id,
                });

                if (ingestionResult.duplicate) {
                    result.logsSkipped++;
                } else {
                    result.logsIngested++;
                }
                if (!ingestionResult.rawLog?.employeeId) {
                    result.unknownEmployees++;
                }
                if (ingestionResult.exception) {
                    result.exceptionsRaised++;
                }
                if (ingestionResult.session?.checkInRawLogId === ingestionResult.rawLog?.id) {
                    result.sessionsOpened++;
                }
                if (ingestionResult.session?.checkOutRawLogId === ingestionResult.rawLog?.id) {
                    result.sessionsClosed++;
                }
            } catch (err: any) {
                result.errors.push(`Log uid=${attLog.uid}: ${err.message}`);
            }
        }

        // Update device lastSyncAt
        await db.update(attendanceDevices)
            .set({ lastSyncAt: new Date(), updatedAt: new Date() })
            .where(eq(attendanceDevices.id, device.id));

        // Complete sync run
        await attendanceOpsService.completeSyncRun({
            syncRunId: syncRun.id,
            status: result.errors.length > 0 ? 'PARTIAL' : 'COMPLETED',
            logsReceived: result.logsReceived,
            logsAccepted: result.logsIngested,
            logsRejected: result.logsSkipped,
            errorMessage: result.errors.length > 0 ? result.errors.join('; ') : undefined,
        });

        report('AUTO_PROCESSING_ATTENDANCE', 98, 100, { branchId: device.branchId });
        result.autoProcessing = await runAttendanceAutoProcessing(device.branchId, result.processedRange);
        if (result.autoProcessing.errors.length > 0) {
            result.errors.push(...result.autoProcessing.errors.map(error => `Auto-processing ${error}`));
        }

        result.success = result.errors.length === 0;
    } catch (err: any) {
        result.errors.push(err.message);
        log.error({ deviceId: device.id, ip: device.ipAddress, err: err.message }, 'ZKTeco sync failed');
    } finally {
        try { await zk.disconnect(); } catch { /* */ }
    }

    result.durationMs = Date.now() - start;
    try {
        await updateDeviceSyncNotes(device, result);
        if (result.success && getDeviceSyncConfig(device).autoClearAfterSync && result.logsReceived > 0) {
            try {
                await autoClearDirectDeviceLogsWithBackup(device);
            } catch (autoClearError: any) {
                result.success = false;
                result.errors.push(`Auto-clear failed: ${autoClearError.message}`);
            }
        }
    } catch (notesErr: any) {
        log.warn({ deviceId: device.id, err: notesErr.message }, 'Failed to update biometric sync metadata');
    }
    return result;
};

// ─── TXT File Parser ─────────────────────────────────────────────────────
// Supports common ZKTeco export formats:
// Format 1 (TAB-separated): "1\t2026-04-01 08:15:00\t0\t1\t\t0\t0"
// Format 2 (Comma):         "1,2026-04-01 08:15:00,0,1,,0,0"

export interface TxtImportResult {
    totalLines: number;
    parsed: number;
    ingested: number;
    skipped: number;
    errors: string[];
    autoProcessing?: AttendanceAutoProcessingSummary;
}

const parseTxtFile = (content: string, branchId: string, deviceId?: string): Array<{
    uid: string;
    timestamp: Date;
    eventType: 'IN' | 'OUT' | 'UNKNOWN';
    rawLine: string;
}> => {
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    const records: ReturnType<typeof parseTxtFile> = [];

    for (const line of lines) {
        // Skip header lines
        if (line.startsWith('#') || line.toLowerCase().includes('user id') || line.toLowerCase().includes('no.')) continue;

        // Try tab-separated, then comma, then space
        const parts = line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : line.split(/\s{2,}/);

        if (parts.length < 2) continue;

        const uid = parts[0].trim();
        const timestampStr = parts[1].trim();
        const statusStr = parts.length > 2 ? parts[2].trim() : '0';
        const verifyModeStr = parts.length > 3 ? parts[3].trim() : '';

        // Parse timestamp — try multiple formats
        let timestamp: Date;
        try {
            timestamp = new Date(timestampStr);
            if (isNaN(timestamp.getTime())) {
                // Try DD/MM/YYYY HH:mm:ss
                const match = timestampStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?/);
                if (match) {
                    timestamp = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]),
                        parseInt(match[4]), parseInt(match[5]), parseInt(match[6] || '0'));
                } else {
                    continue;
                }
            }
        } catch {
            continue;
        }

        if (isNaN(timestamp.getTime())) continue;

        const statusNum = parseInt(statusStr) || 0;
        const eventType = statusNum % 2 === 0 ? 'IN' : 'OUT';

        records.push({ uid, timestamp, eventType: eventType as any, rawLine: line });
    }

    return records;
};

// ─── CRON Auto-Sync ──────────────────────────────────────────────────────

let syncInterval: NodeJS.Timeout | null = null;
let isSyncing = false;

const autoSync = async () => {
    if (isSyncing) {
        log.warn('ZKTeco auto-sync skipped (previous sync still running)');
        return;
    }
    isSyncing = true;

    try {
        const activeDevices = (await db.select().from(attendanceDevices)
            .where(and(
                eq(attendanceDevices.isActive, true),
                eq(attendanceDevices.sourceType, 'BIOMETRIC_ZK'),
            ))).filter(device => device.communicationMode !== 'USB');

        if (activeDevices.length === 0) {
            log.debug('No active ZKTeco devices to sync');
            return;
        }

        log.info({ deviceCount: activeDevices.length }, 'ZKTeco auto-sync scan starting');

        const results: DeviceSyncResult[] = [];
        let skipped = 0;
        const now = new Date();
        // Sync devices sequentially to avoid overwhelming the network
        for (const device of activeDevices) {
            if (!shouldAutoSyncDevice(device, now)) {
                skipped++;
                continue;
            }
            if (device.communicationMode === 'BRANCH_BRIDGE') {
                const start = Date.now();
                const result: DeviceSyncResult = {
                    deviceId: device.id,
                    deviceName: device.name,
                    branchId: device.branchId,
                    success: false,
                    fetchMode: 'AUTO',
                    logsReceived: 0,
                    logsFilteredOut: 0,
                    logsIngested: 0,
                    logsSkipped: 0,
                    unknownEmployees: 0,
                    exceptionsRaised: 0,
                    sessionsOpened: 0,
                    sessionsClosed: 0,
                    processedRange: { startDate: null, endDate: null },
                    errors: [],
                    durationMs: 0,
                };
                try {
                    await attendanceOpsService.requestBridgeDeviceSync(device.id, 'AUTO_SYNC');
                    result.success = true;
                    result.logsSkipped = 0;
                } catch (error: any) {
                    result.errors.push(error?.message || 'BRANCH_BRIDGE_COMMAND_FAILED');
                }
                result.durationMs = Date.now() - start;
                await updateDeviceSyncNotes(device, result);
                results.push(result);
                continue;
            }

            const result = await syncDevice(device);
            results.push(result);
        }

        const totalIngested = results.reduce((s, r) => s + r.logsIngested, 0);
        const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
        log.info({ synced: results.length, skipped, totalIngested, totalErrors }, 'ZKTeco auto-sync scan completed');
    } catch (err: any) {
        log.error({ err: err.message }, 'ZKTeco auto-sync critical failure');
    } finally {
        isSyncing = false;
    }
};

// ─── Public API ──────────────────────────────────────────────────────────

export const zktecoConnectorService = {

    /**
     * Start the CRON-based auto-sync for all active biometric devices.
     * Default interval: 15 minutes.
     */
    startAutoSync(intervalMinutes = 1) {
        if (syncInterval) {
            clearInterval(syncInterval);
        }
        const ms = intervalMinutes * 60 * 1000;
        syncInterval = setInterval(autoSync, ms);
        if (typeof syncInterval.unref === 'function') syncInterval.unref();
        log.info({ intervalMinutes }, 'ZKTeco auto-sync scheduler started');
    },

    stopAutoSync() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
            log.info('ZKTeco auto-sync CRON stopped');
        }
    },

    /**
     * Manually trigger sync for all active devices.
     */
    async syncAllDevices(options?: DeviceSyncOptions): Promise<DeviceSyncResult[]> {
        return this.syncDevices(options);
    },

    /**
     * Sync a specific device by ID.
     */
    async syncSingleDevice(deviceId: string, options?: DeviceSyncOptions): Promise<DeviceSyncResult> {
        const [device] = await db.select().from(attendanceDevices)
            .where(eq(attendanceDevices.id, deviceId))
            .limit(1);
        if (!device) throw new Error('DEVICE_NOT_FOUND');
        return syncDevice(device, undefined, options);
    },

    /**
     * Sync a specific device by ID supporting stream callback
     */
    async syncDeviceStream(deviceId: string, onProgress: (data: any) => void, options?: DeviceSyncOptions): Promise<DeviceSyncResult> {
        const [device] = await db.select().from(attendanceDevices).where(eq(attendanceDevices.id, deviceId)).limit(1);
        if (!device) throw new Error('DEVICE_NOT_FOUND');
        
        // Keep-alive heartbeat every 15s
        const heartbeat = setInterval(() => {
            onProgress({ step: 'HEARTBEAT', progress: 0, total: 100 });
        }, 15000);

        try {
            const result = await syncDevice(device, onProgress, options);
            return result;
        } finally {
            clearInterval(heartbeat);
        }
    },

    async previewDeviceSync(deviceId: string, options?: DeviceSyncOptions): Promise<DeviceSyncPreviewResult> {
        const [device] = await db.select().from(attendanceDevices)
            .where(eq(attendanceDevices.id, deviceId))
            .limit(1);
        if (!device) throw new Error('DEVICE_NOT_FOUND');

        const pulled = await fetchDeviceLogsForOptions(device, options);
        return buildDevicePreview(device, pulled.logs, pulled.logsFilteredOut, pulled.processedRange);
    },

    async commitDevicePreview(deviceId: string, records: DevicePreviewCommitRecord[]): Promise<DeviceSyncResult> {
        const [device] = await db.select().from(attendanceDevices)
            .where(eq(attendanceDevices.id, deviceId))
            .limit(1);
        if (!device) throw new Error('DEVICE_NOT_FOUND');
        if (!Array.isArray(records)) throw new Error('RECORDS_REQUIRED');
        if (records.length > 10000) throw new Error('TOO_MANY_RECORDS_SELECTED');

        const start = Date.now();
        const result: DeviceSyncResult = {
            deviceId: device.id,
            deviceName: device.name,
            branchId: device.branchId,
            success: false,
            fetchMode: 'RANGE',
            logsReceived: records.length,
            logsFilteredOut: 0,
            logsIngested: 0,
            logsSkipped: 0,
            unknownEmployees: 0,
            exceptionsRaised: 0,
            sessionsOpened: 0,
            sessionsClosed: 0,
            processedRange: {
                startDate: records[0]?.occurredAt || null,
                endDate: records[records.length - 1]?.occurredAt || null,
            },
            errors: [],
            durationMs: 0,
        };

        const syncRun = await attendanceOpsService.startSyncRun({
            branchId: device.branchId,
            deviceId: device.id,
            sourceType: device.sourceType || 'BIOMETRIC_ZK',
            metadata: { importMethod: 'REVIEW_COMMIT', selectedRecords: records.length },
        });

        const mappings = await db.select().from(attendanceDeviceMappings)
            .where(and(
                eq(attendanceDeviceMappings.deviceId, device.id),
                eq(attendanceDeviceMappings.isActive, true),
            ));
        const mappingIndex = new Map(mappings.map(m => [m.deviceUserId, m.employeeId]));

        const sortedRecords = [...records]
            .map(record => ({
                uid: String(record.uid || '').trim(),
                status: record.status === undefined || record.status === null ? null : Number(record.status),
                timestamp: new Date(record.occurredAt),
                eventType: record.eventType,
            }))
            .filter(record => record.uid && !Number.isNaN(record.timestamp.getTime()))
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        for (const record of sortedRecords) {
            try {
                const eventType = record.eventType || getEventTypeFromStatus(record.status) || 'IN';
                const ingestionResult = await attendanceOpsService.ingestRawLog({
                    branchId: device.branchId,
                    sourceType: 'BIOMETRIC_ZK',
                    eventType,
                    occurredAt: record.timestamp,
                    deviceId: device.id,
                    deviceUserId: record.uid,
                    employeeId: mappingIndex.get(record.uid) || undefined,
                    employeeIdentifier: record.uid,
                    rawPayload: {
                        uid: record.uid,
                        status: record.status,
                        timestamp: record.timestamp.toISOString(),
                        importMethod: 'REVIEW_COMMIT',
                    },
                    syncRunId: syncRun.id,
                });

                if (ingestionResult.duplicate) {
                    result.logsSkipped++;
                } else {
                    result.logsIngested++;
                }
                if (!ingestionResult.rawLog?.employeeId) result.unknownEmployees++;
                if (ingestionResult.exception) result.exceptionsRaised++;
                if (ingestionResult.session?.checkInRawLogId === ingestionResult.rawLog?.id) result.sessionsOpened++;
                if (ingestionResult.session?.checkOutRawLogId === ingestionResult.rawLog?.id) result.sessionsClosed++;
            } catch (err: any) {
                result.errors.push(`Log uid=${record.uid}: ${err.message}`);
            }
        }

        await db.update(attendanceDevices)
            .set({ lastSyncAt: new Date(), updatedAt: new Date() })
            .where(eq(attendanceDevices.id, device.id));

        await attendanceOpsService.completeSyncRun({
            syncRunId: syncRun.id,
            status: result.errors.length > 0 ? 'PARTIAL' : 'COMPLETED',
            logsReceived: result.logsReceived,
            logsAccepted: result.logsIngested,
            logsRejected: result.logsSkipped,
            errorMessage: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : undefined,
        });

        result.processedRange = {
            startDate: sortedRecords[0]?.timestamp.toISOString() || null,
            endDate: sortedRecords[sortedRecords.length - 1]?.timestamp.toISOString() || null,
        };
        result.autoProcessing = await runAttendanceAutoProcessing(device.branchId, result.processedRange);
        if (result.autoProcessing.errors.length > 0) {
            result.errors.push(...result.autoProcessing.errors.map(error => `Auto-processing ${error}`));
        }
        result.success = result.errors.length === 0;
        result.durationMs = Date.now() - start;
        try {
            await updateDeviceSyncNotes(device, result);
        } catch (notesErr: any) {
            log.warn({ deviceId: device.id, err: notesErr.message }, 'Failed to update biometric sync metadata');
        }
        return result;
    },

    async syncDevices(options?: DeviceSyncOptions): Promise<DeviceSyncResult[]> {
        const activeDevices = (await db.select().from(attendanceDevices)
            .where(and(
                eq(attendanceDevices.isActive, true),
                eq(attendanceDevices.sourceType, 'BIOMETRIC_ZK'),
                options?.branchId ? eq(attendanceDevices.branchId, options.branchId) : undefined,
                options?.deviceIds?.length ? inArray(attendanceDevices.id, options.deviceIds) : undefined,
            ))).filter(device => device.communicationMode !== 'BRANCH_BRIDGE' && device.communicationMode !== 'USB');

        const results: DeviceSyncResult[] = [];
        for (const device of activeDevices) {
            if (!device.ipAddress) continue;
            results.push(await syncDevice(device, undefined, options));
        }
        return results;
    },

    async getDeviceSyncSettings(deviceId: string) {
        const [device] = await db.select().from(attendanceDevices).where(eq(attendanceDevices.id, deviceId)).limit(1);
        if (!device) throw new Error('DEVICE_NOT_FOUND');
        return getDeviceSyncConfig(device);
    },

    async updateDeviceSyncSettings(deviceId: string, input: { autoEnabled?: boolean; intervalMinutes?: number; autoClearAfterSync?: boolean }) {
        const [device] = await db.select().from(attendanceDevices).where(eq(attendanceDevices.id, deviceId)).limit(1);
        if (!device) throw new Error('DEVICE_NOT_FOUND');

        const existing = parseDeviceNotes(device.notes);
        const current = getDeviceSyncConfig(device);
        const intervalMinutes = input.intervalMinutes !== undefined
            ? Math.max(5, Math.min(Number(input.intervalMinutes), 1440))
            : current.intervalMinutes;

        existing.sync = {
            ...existing.sync,
            autoEnabled: input.autoEnabled !== undefined ? !!input.autoEnabled : current.autoEnabled,
            intervalMinutes,
            autoClearAfterSync: input.autoClearAfterSync !== undefined ? !!input.autoClearAfterSync : current.autoClearAfterSync,
            nextRetryAt: null,
        };

        const [updated] = await db.update(attendanceDevices)
            .set({ notes: stringifyDeviceNotes(existing), updatedAt: new Date() })
            .where(eq(attendanceDevices.id, deviceId))
            .returning();

        return {
            deviceId,
            settings: getDeviceSyncConfig(updated),
        };
    },

    /**
     * Test connection to a device (connect, get info, disconnect).
     */
    async testConnection(ip: string, port = 4370): Promise<{
        connected: boolean;
        deviceTime?: string;
        info?: { records: number; users: number; fingers: number };
        error?: string;
        latencyMs: number;
    }> {
        const start = Date.now();
        const zk = new ZKDevice({ ip, port, timeout: 10000 });
        try {
            await zk.connect();
            const deviceTime = await zk.getDeviceTime();
            const info = await zk.getDeviceInfo();
            await zk.disconnect();
            return {
                connected: true,
                deviceTime: deviceTime?.toISOString(),
                info: info || undefined,
                latencyMs: Date.now() - start,
            };
        } catch (err: any) {
            return {
                connected: false,
                error: err.message,
                latencyMs: Date.now() - start,
            };
        }
    },

    /**
     * Import attendance data from a TXT/CSV file content.
     * Fallback for when direct device connection is not possible.
     */
    async importTxtFile(content: string, branchId: string, deviceId?: string): Promise<TxtImportResult> {
        const records = parseTxtFile(content, branchId, deviceId);
        const result: TxtImportResult = {
            totalLines: content.split(/\r?\n/).filter(l => l.trim()).length,
            parsed: records.length,
            ingested: 0,
            skipped: 0,
            errors: [],
        };

        // Start sync run for tracking
        const syncRun = await attendanceOpsService.startSyncRun({
            branchId,
            deviceId,
            sourceType: 'BIOMETRIC_ZK',
            metadata: { importMethod: 'TXT_FILE', totalRecords: records.length },
        });

        // Load device mappings if deviceId provided
        let mappingIndex = new Map<string, string>();
        if (deviceId) {
            const mappings = await db.select().from(attendanceDeviceMappings)
                .where(and(
                    eq(attendanceDeviceMappings.deviceId, deviceId),
                    eq(attendanceDeviceMappings.isActive, true),
                ));
            mappingIndex = new Map(mappings.map(m => [m.deviceUserId, m.employeeId]));
        }

        for (const record of records) {
            try {
                const ingestionResult = await attendanceOpsService.ingestRawLog({
                    branchId,
                    sourceType: 'BIOMETRIC_ZK',
                    eventType: record.eventType,
                    occurredAt: record.timestamp,
                    deviceId,
                    deviceUserId: record.uid,
                    employeeId: mappingIndex.get(record.uid) || undefined,
                    employeeIdentifier: record.uid,
                    rawPayload: { rawLine: record.rawLine, importMethod: 'TXT_FILE' },
                    syncRunId: syncRun.id,
                });

                if (ingestionResult.duplicate) {
                    result.skipped++;
                } else {
                    result.ingested++;
                }
            } catch (err: any) {
                result.errors.push(`UID ${record.uid}: ${err.message}`);
            }
        }

        await attendanceOpsService.completeSyncRun({
            syncRunId: syncRun.id,
            status: result.errors.length > 0 ? 'PARTIAL' : 'COMPLETED',
            logsReceived: result.parsed,
            logsAccepted: result.ingested,
            logsRejected: result.skipped,
            errorMessage: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : undefined,
        });

        const recordDates = records.map(record => record.timestamp).filter(date => !Number.isNaN(date.getTime()));
        result.autoProcessing = await runAttendanceAutoProcessing(branchId, {
            startDate: recordDates.length ? new Date(Math.min(...recordDates.map(date => date.getTime()))).toISOString() : null,
            endDate: recordDates.length ? new Date(Math.max(...recordDates.map(date => date.getTime()))).toISOString() : null,
        });
        if (result.autoProcessing.errors.length > 0) {
            result.errors.push(...result.autoProcessing.errors.map(error => `Auto-processing ${error}`));
        }

        return result;
    },

    /**
     * Get sync status for all devices.
     */
    async getDeviceStatuses(): Promise<Array<{
        id: string;
        name: string;
        branchId: string;
        ip: string | null;
        lastSeen: string | null;
        lastSync: string | null;
        isActive: boolean;
    }>> {
        const devices = await db.select().from(attendanceDevices);
        return devices.map(d => ({
            id: d.id,
            name: d.name,
            branchId: d.branchId,
            ip: d.ipAddress,
            lastSeen: d.lastSeenAt?.toISOString() || null,
            lastSync: d.lastSyncAt?.toISOString() || null,
            isActive: d.isActive ?? true,
        }));
    },

    async clearDeviceLogs(deviceId: string): Promise<{ success: boolean; recordsBackedUp: number; backupId?: string }> {
        const [device] = await db.select().from(attendanceDevices).where(eq(attendanceDevices.id, deviceId)).limit(1);
        if (!device || !device.ipAddress) throw new Error('DEVICE_NOT_FOUND_OR_NO_IP');
        
        const zk = new ZKDevice({ ip: device.ipAddress, port: device.port || 4370 });
        try {
            await zk.connect();
            const logs = await zk.fetchAllLogs();
            const backup = await attendanceOpsService.saveDeviceLogBackup({
                branchId: device.branchId,
                deviceId: device.id,
                gatewayId: null,
                sourceType: 'DIRECT_IP',
                operation: 'CLEAR_LOGS_BACKUP',
                recordCount: logs.length,
                backupFormat: 'JSON',
                rawPayload: {
                    device: {
                        id: device.id,
                        name: device.name,
                        code: device.code,
                        ipAddress: device.ipAddress,
                        port: device.port || 4370,
                    },
                    logs,
                    backedUpAt: new Date().toISOString(),
                },
            });
            await zk.clearAttendanceLog();
            return { success: true, recordsBackedUp: logs.length, backupId: backup.id };
        } finally {
            await zk.disconnect();
        }
    },

    async getDeviceLogStats(deviceId: string): Promise<{
        success: boolean;
        deviceId: string;
        records: number;
        users: number;
        capacity: number | null;
        checkedAt: string;
    }> {
        const [device] = await db.select().from(attendanceDevices).where(eq(attendanceDevices.id, deviceId)).limit(1);
        if (!device || !device.ipAddress) throw new Error('DEVICE_NOT_FOUND_OR_NO_IP');

        const zk = new ZKDevice({ ip: device.ipAddress, port: device.port || 4370 });
        try {
            await zk.connect();
            const stats = await zk.getLogStats();
            return {
                success: true,
                deviceId,
                records: stats.records,
                users: stats.users,
                capacity: stats.capacity ?? null,
                checkedAt: new Date().toISOString(),
            };
        } finally {
            await zk.disconnect();
        }
    },

    async restartDevice(deviceId: string): Promise<{ success: boolean }> {
        const [device] = await db.select().from(attendanceDevices).where(eq(attendanceDevices.id, deviceId)).limit(1);
        if (!device || !device.ipAddress) throw new Error('DEVICE_NOT_FOUND_OR_NO_IP');
        
        const zk = new ZKDevice({ ip: device.ipAddress, port: device.port || 4370 });
        try {
            await zk.connect();
            await zk.restart();
            return { success: true };
        } finally {
            await zk.disconnect();
        }
    },

    async setDeviceTime(deviceId: string, time?: string): Promise<{ success: boolean; newTime: string }> {
        const [device] = await db.select().from(attendanceDevices).where(eq(attendanceDevices.id, deviceId)).limit(1);
        if (!device || !device.ipAddress) throw new Error('DEVICE_NOT_FOUND_OR_NO_IP');
        
        const targetTime = time ? new Date(time) : new Date();
        const zk = new ZKDevice({ ip: device.ipAddress, port: device.port || 4370 });
        try {
            await zk.connect();
            await zk.setTime(targetTime);
            return { success: true, newTime: targetTime.toISOString() };
        } finally {
            await zk.disconnect();
        }
    },
};

export default zktecoConnectorService;
