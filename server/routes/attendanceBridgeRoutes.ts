import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { and, desc, eq, or } from 'drizzle-orm';
import { db } from '../db';
import { attendanceDevices, attendanceSyncRuns, branches } from '../../src/db/schema';
import attendanceOpsService from '../services/attendanceOpsService';

const router = Router();

const getBridgeToken = () => process.env.ATTENDANCE_BRIDGE_TOKEN || process.env.PRINT_GATEWAY_TOKEN || '';

const readBearerToken = (req: Request) => {
    const auth = String(req.headers.authorization || '');
    if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
    return String(req.headers['x-bridge-token'] || '').trim();
};

const tokensMatch = (actual: string, expected: string) => {
    if (!actual || !expected) return false;
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

const requireBridgeToken = (req: Request, res: Response) => {
    const expected = getBridgeToken();
    const actual = readBearerToken(req);
    if (!tokensMatch(actual, expected)) {
        res.status(401).json({ ok: false, code: 'INVALID_ATTENDANCE_BRIDGE_TOKEN' });
        return false;
    }
    return true;
};

const normalizeEventType = (value: unknown): 'IN' | 'OUT' | 'UNKNOWN' => {
    const raw = String(value || '').trim().toUpperCase();
    if (['IN', 'CHECK_IN', 'CLOCK_IN', '0', 'I'].includes(raw)) return 'IN';
    if (['OUT', 'CHECK_OUT', 'CLOCK_OUT', '1', 'O'].includes(raw)) return 'OUT';
    return 'UNKNOWN';
};

const branchExists = async (branchId: string) => {
    const [branch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1);
    return Boolean(branch);
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

const bridgeErrorMessage = (message?: string | null) => {
    const raw = String(message || '').trim();
    if (!raw) return 'تعذر الوصول إلى ماكينة البصمة من جهاز الفرع';
    if (/DEVICE_UNREACHABLE|ECONN|ETIMEDOUT|EHOST|ENET|timeout|not reachable|refused/i.test(raw)) {
        return 'ماكينة البصمة غير متصلة أو غير واصلة بجهاز الفرع. راجع كهرباء الماكينة وكابل الشبكة أو الواي فاي.';
    }
    return raw;
};

type BridgeCommandMetadata = {
    command?: string;
    forceFull?: boolean;
    sinceAt?: string | null;
    untilAt?: string | null;
};

const updateDeviceBridgeSyncState = async (deviceId: string | null | undefined, input: {
    ok: boolean;
    logsAccepted: number;
    logsRejected: number;
    errorMessage?: string | null;
}) => {
    if (!deviceId) return;
    const [device] = await db.select().from(attendanceDevices).where(eq(attendanceDevices.id, deviceId)).limit(1);
    if (!device) return;

    const now = new Date().toISOString();
    const notes: any = parseDeviceNotes(device.notes);
    const previous = notes.sync || {};
    const failureCount = input.ok ? 0 : Math.max(0, Number(previous.failureCount || 0)) + 1;
    notes.sync = {
        ...previous,
        lastAttemptAt: now,
        lastDurationMs: 0,
        lastIngested: input.logsAccepted,
        lastSkipped: input.logsRejected,
        failureCount,
        lastSuccessAt: input.ok ? now : previous.lastSuccessAt || null,
        lastFailedAt: input.ok ? previous.lastFailedAt || null : now,
        lastError: input.ok ? null : bridgeErrorMessage(input.errorMessage),
    };

    await db.update(attendanceDevices)
        .set({
            notes: JSON.stringify(notes),
            lastSyncAt: input.ok ? new Date() : device.lastSyncAt,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(attendanceDevices.id, deviceId));
};

const runBridgeAutoProcessing = async (input: { branchId: string; startDate?: string; endDate?: string }) => {
    const limit = Math.max(100, Math.min(Number(process.env.ATTENDANCE_AUTO_PROCESS_LIMIT || 10000), 50000));
    const unknownLimit = Math.max(100, Math.min(Number(process.env.ATTENDANCE_AUTO_RESOLVE_LIMIT || 5000), 50000));
    try {
        await attendanceOpsService.autoResolveUnknownBiometricMatches({
            branchId: input.branchId,
            resolvedBy: 'BRANCH_BRIDGE_AUTO_PROCESSOR',
            limit: unknownLimit,
        });
        await attendanceOpsService.rebuildSmartDailySessions({
            branchId: input.branchId,
            startDate: input.startDate,
            endDate: input.endDate,
            limit,
        });
        await attendanceOpsService.recalculateAttendanceSessions({
            branchId: input.branchId,
            startDate: input.startDate,
            endDate: input.endDate,
            limit,
        });
    } catch (error: any) {
        console.error('[attendance-bridge] auto-processing failed', {
            branchId: input.branchId,
            startDate: input.startDate,
            endDate: input.endDate,
            error: error?.message,
        });
    }
};

const ensureBridgeDevice = async (input: {
    branchId: string;
    gatewayId?: string;
    device?: Record<string, any>;
}) => {
    const device = input.device || {};
    const requestedId = device.serverDeviceId || device.id;
    const code = device.code || device.serialNumber || device.sn || device.ipAddress;
    const serialNumber = device.serialNumber || device.sn || null;

    if (requestedId) {
        const [existing] = await db.select().from(attendanceDevices)
            .where(and(
                eq(attendanceDevices.id, String(requestedId)),
                eq(attendanceDevices.isActive, true),
            ))
            .limit(1);
        if (existing) return existing;
    }

    const conditions = [
        code ? eq(attendanceDevices.code, String(code)) : undefined,
        serialNumber ? eq(attendanceDevices.serialNumber, String(serialNumber)) : undefined,
    ].filter(Boolean) as any[];

    if (conditions.length) {
        const [existing] = await db.select().from(attendanceDevices)
            .where(and(
                eq(attendanceDevices.branchId, input.branchId),
                eq(attendanceDevices.isActive, true),
                conditions.length === 1 ? conditions[0] : or(...conditions),
            ))
            .limit(1);
        if (existing) {
            const [updated] = await db.update(attendanceDevices)
                .set({
                    ipAddress: device.ipAddress ? String(device.ipAddress) : existing.ipAddress,
                    port: device.port ? Number(device.port) : existing.port,
                    branchGatewayId: input.gatewayId || existing.branchGatewayId,
                    communicationMode: 'BRANCH_BRIDGE',
                    lastSeenAt: new Date(),
                    updatedAt: new Date(),
                })
                .output()
                .where(eq(attendanceDevices.id, existing.id));
            return updated || existing;
        }
    }

    return attendanceOpsService.upsertDevice({
        branchId: input.branchId,
        name: String(device.name || code || 'Branch biometric device'),
        code: code ? String(code) : undefined,
        vendor: String(device.vendor || 'ZKTeco'),
        model: device.model ? String(device.model) : undefined,
        sourceType: 'BIOMETRIC_ZK',
        ipAddress: device.ipAddress ? String(device.ipAddress) : undefined,
        port: device.port ? Number(device.port) : 4370,
        serialNumber: serialNumber ? String(serialNumber) : undefined,
        communicationMode: 'BRANCH_BRIDGE',
        branchGatewayId: input.gatewayId,
        notes: JSON.stringify({ bridge: { gatewayId: input.gatewayId, firstSeenAt: new Date().toISOString() } }),
        isActive: true,
    });
};

router.post('/register', async (req: Request, res: Response) => {
    if (!requireBridgeToken(req, res)) return;

    try {
        const branchId = String(req.body?.branchId || '').trim();
        const gatewayId = String(req.body?.gatewayId || '').trim() || undefined;
        const devices = Array.isArray(req.body?.devices) ? req.body.devices : [];

        if (!branchId) {
            return res.status(400).json({ ok: false, code: 'BRANCH_ID_REQUIRED' });
        }
        if (!(await branchExists(branchId))) {
            return res.status(404).json({ ok: false, code: 'UNKNOWN_BRANCH', branchId });
        }

        const results = [];
        for (const device of devices) {
            const ensured = await ensureBridgeDevice({ branchId, gatewayId, device });
            results.push({
                id: ensured.id,
                branchId: ensured.branchId,
                name: ensured.name,
                code: ensured.code,
                gatewayId: ensured.branchGatewayId || gatewayId || null,
                communicationMode: ensured.communicationMode,
            });
        }

        res.json({
            ok: true,
            branchId,
            gatewayId: gatewayId || null,
            registered: results.length,
            devices: results,
            registeredAt: new Date().toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({ ok: false, code: 'ATTENDANCE_BRIDGE_REGISTER_FAILED', message: error.message });
    }
});

router.get('/health', (req: Request, res: Response) => {
    if (!requireBridgeToken(req, res)) return;
    res.json({ ok: true, service: 'attendance-bridge', serverTime: new Date().toISOString() });
});

router.get('/commands', async (req: Request, res: Response) => {
    if (!requireBridgeToken(req, res)) return;

    try {
        const branchId = String(req.query.branchId || '').trim();
        const gatewayId = String(req.query.gatewayId || '').trim();
        if (!branchId || !gatewayId) {
            return res.status(400).json({ ok: false, code: 'BRANCH_AND_GATEWAY_REQUIRED' });
        }

        const rows = await db.select().from(attendanceSyncRuns)
            .where(and(
                eq(attendanceSyncRuns.branchId, branchId),
                eq(attendanceSyncRuns.sourceType, 'BRANCH_BRIDGE_COMMAND'),
                eq(attendanceSyncRuns.status, 'QUEUED'),
            ))
            .orderBy(desc(attendanceSyncRuns.startedAt))
            .limit(20);

        const commands = rows
            .filter((row: any) => row.metadata?.gatewayId === gatewayId)
            .slice(0, 3)
            .map((row: any) => ({
                id: row.id,
                command: row.metadata?.command || 'SYNC_DEVICE',
                device: row.metadata?.device || {},
                sinceAt: row.metadata?.sinceAt || null,
                untilAt: row.metadata?.untilAt || null,
                forceFull: Boolean(row.metadata?.forceFull),
                autoClearAfterSync: Boolean(row.metadata?.autoClearAfterSync),
                requestedAt: row.metadata?.requestedAt || row.startedAt,
            }));

        for (const command of commands) {
            await db.update(attendanceSyncRuns)
                .set({
                    status: 'IN_PROGRESS',
                    metadata: {
                        ...(rows.find(row => row.id === command.id) as any)?.metadata,
                        claimedAt: new Date().toISOString(),
                    },
                } as any)
                .where(eq(attendanceSyncRuns.id, command.id));
        }

        res.json({ ok: true, commands });
    } catch (error: any) {
        res.status(500).json({ ok: false, code: 'ATTENDANCE_BRIDGE_COMMANDS_FAILED', message: error.message });
    }
});

router.post('/commands/:id/complete', async (req: Request, res: Response) => {
    if (!requireBridgeToken(req, res)) return;

    try {
        const commandId = String(req.params.id);
        const ok = req.body?.ok !== false;
        const [existing] = await db.select().from(attendanceSyncRuns).where(eq(attendanceSyncRuns.id, commandId)).limit(1);
        const existingMetadata = (existing?.metadata || {}) as BridgeCommandMetadata;
        const logsReceived = Number(req.body?.logsReceived || 0);
        const logsAccepted = Number(req.body?.logsAccepted || req.body?.accepted || 0);
        const logsRejected = Number(req.body?.logsRejected || req.body?.rejected || 0);
        const metadata = req.body?.metadata || {};
        const summaryDevices = metadata?.summary?.devices && typeof metadata.summary.devices === 'object'
            ? Object.values(metadata.summary.devices as Record<string, any>)
            : [];
        const summaryDeviceErrors = summaryDevices.filter((device: any) => device?.lastError);
        const summaryAttempted = Number(metadata?.summary?.devicesAttempted || 0);
        const summarySucceeded = Number(metadata?.summary?.devicesSucceeded || 0);
        const allAttemptedDevicesFailed = summaryAttempted > 0 && summarySucceeded === 0;
        const hasBridgeErrors = (Array.isArray(metadata?.errors) && metadata.errors.length > 0) || summaryDeviceErrors.length > 0 || allAttemptedDevicesFailed;
        const rawErrorMessage = String(
            req.body?.error
            || req.body?.message
            || metadata?.errors?.[0]?.message
            || (summaryDeviceErrors[0] as any)?.lastError
            || (allAttemptedDevicesFailed ? 'DEVICE_UNREACHABLE' : 'BRIDGE_COMMAND_FAILED')
        );
        const normalizedErrorMessage = bridgeErrorMessage(rawErrorMessage);
        await db.update(attendanceSyncRuns)
            .set({
                status: ok ? (hasBridgeErrors ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED') : 'FAILED',
                logsReceived,
                logsAccepted,
                logsRejected,
                errorMessage: ok && !hasBridgeErrors ? null : normalizedErrorMessage,
                metadata: {
                    ...metadata,
                    gatewayId: req.body?.gatewayId,
                    completedByBridgeAt: new Date().toISOString(),
                    result: req.body?.result || null,
                },
                completedAt: new Date(),
            } as any)
            .where(eq(attendanceSyncRuns.id, commandId));

        await updateDeviceBridgeSyncState(existing?.deviceId, {
            ok: ok && !hasBridgeErrors,
            logsAccepted,
            logsRejected,
            errorMessage: normalizedErrorMessage,
        });

        if (ok && !hasBridgeErrors && existing?.deviceId && existingMetadata.command === 'SYNC_DEVICE' && existingMetadata.forceFull) {
            await attendanceOpsService.setDeviceInitialHistoryLoaded(existing.deviceId, new Date().toISOString());
        }

        res.json({ ok: true, commandId });

        if (ok && !hasBridgeErrors && logsAccepted > 0 && existing?.branchId && existingMetadata.command === 'SYNC_DEVICE') {
            setImmediate(() => {
                void runBridgeAutoProcessing({
                    branchId: existing.branchId,
                    startDate: existingMetadata.sinceAt || undefined,
                    endDate: existingMetadata.untilAt || undefined,
                });
            });
        }
    } catch (error: any) {
        res.status(500).json({ ok: false, code: 'ATTENDANCE_BRIDGE_COMMAND_COMPLETE_FAILED', message: error.message });
    }
});

router.post('/backups', async (req: Request, res: Response) => {
    if (!requireBridgeToken(req, res)) return;

    try {
        const branchId = String(req.body?.branchId || '').trim();
        const gatewayId = String(req.body?.gatewayId || '').trim() || undefined;
        const logs = Array.isArray(req.body?.logs) ? req.body.logs : [];

        if (!branchId) {
            return res.status(400).json({ ok: false, code: 'BRANCH_ID_REQUIRED' });
        }
        if (logs.length > 5000) {
            return res.status(400).json({ ok: false, code: 'TOO_MANY_BACKUP_LOGS', max: 5000 });
        }

        const device = await ensureBridgeDevice({ branchId, gatewayId, device: req.body?.device || {} });
        const backup = await attendanceOpsService.saveDeviceLogBackup({
            id: req.body?.backupId ? String(req.body.backupId) : undefined,
            branchId,
            deviceId: device.id,
            gatewayId,
            sourceType: 'BRANCH_BRIDGE',
            operation: String(req.body?.operation || 'CLEAR_LOGS_BACKUP'),
            recordCount: Number(req.body?.recordCount || logs.length || 0),
            backupFormat: String(req.body?.backupFormat || 'JSON'),
            localFilePath: req.body?.localFilePath ? String(req.body.localFilePath) : null,
            rawPayload: {
                backupMeta: req.body?.backupMeta || {},
                device: req.body?.device || {},
                logs,
            },
            createdBy: req.body?.createdBy ? String(req.body.createdBy) : null,
        });

        res.json({ ok: true, backupId: backup.id, received: logs.length, deviceId: device.id });
    } catch (error: any) {
        res.status(500).json({ ok: false, code: 'ATTENDANCE_BRIDGE_BACKUP_FAILED', message: error.message });
    }
});

router.post('/ingest', async (req: Request, res: Response) => {
    if (!requireBridgeToken(req, res)) return;

    try {
        const branchId = String(req.body?.branchId || '').trim();
        const gatewayId = String(req.body?.gatewayId || '').trim() || undefined;
        const logs = Array.isArray(req.body?.logs) ? req.body.logs : [];

        if (!branchId) {
            return res.status(400).json({ ok: false, code: 'BRANCH_ID_REQUIRED' });
        }
        if (!(await branchExists(branchId))) {
            return res.status(404).json({ ok: false, code: 'UNKNOWN_BRANCH', branchId });
        }
        if (!logs.length) {
            return res.json({ ok: true, received: 0, accepted: 0, duplicates: 0, rejected: 0, errors: [] });
        }
        if (logs.length > 1000) {
            return res.status(400).json({ ok: false, code: 'TOO_MANY_LOGS', max: 1000 });
        }

        const device = await ensureBridgeDevice({ branchId, gatewayId, device: req.body?.device || {} });
        const syncRunId = `BRG-${randomUUID().slice(0, 12)}`;
        await db.insert(attendanceSyncRuns).values({
            id: syncRunId,
            branchId,
            deviceId: device.id,
            sourceType: 'BRANCH_BRIDGE',
            status: 'IN_PROGRESS',
            logsReceived: logs.length,
            metadata: {
                gatewayId,
                device: req.body?.device || {},
                receivedAt: new Date().toISOString(),
            },
        } as any);

        let accepted = 0;
        let duplicates = 0;
        let rejected = 0;
        const errors: Array<{ index: number; code: string }> = [];
        const acceptedDates: Date[] = [];

        for (const [index, log] of logs.entries()) {
            try {
                const occurredAt = log.occurredAt || log.timestamp || log.punchTime || log.time;
                const parsed = occurredAt ? new Date(String(occurredAt)) : null;
                if (!parsed || Number.isNaN(parsed.getTime())) {
                    throw new Error('INVALID_OCCURRED_AT');
                }

                const result = await attendanceOpsService.ingestRawLog({
                    branchId,
                    sourceType: 'BIOMETRIC_ZK',
                    eventType: normalizeEventType(log.eventType || log.type || log.status || log.punch),
                    occurredAt: parsed,
                    deviceId: device.id,
                    deviceUserId: log.deviceUserId ? String(log.deviceUserId) : log.uid ? String(log.uid) : undefined,
                    employeeIdentifier: log.employeeIdentifier ? String(log.employeeIdentifier) : log.userId ? String(log.userId) : undefined,
                    rawPayload: {
                        ...log,
                        bridgeGatewayId: gatewayId,
                        bridgeDevice: req.body?.device || {},
                    },
                    syncRunId,
                });
                if (result.duplicate) duplicates += 1;
                else {
                    accepted += 1;
                    acceptedDates.push(parsed);
                }
            } catch (error: any) {
                rejected += 1;
                errors.push({ index, code: String(error?.message || 'INGEST_FAILED') });
            }
        }

        await db.update(attendanceSyncRuns)
            .set({
                status: rejected > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
                logsAccepted: accepted,
                logsRejected: rejected,
                metadata: {
                    gatewayId,
                    device: req.body?.device || {},
                    receivedAt: new Date().toISOString(),
                    duplicates,
                    errors: errors.slice(0, 20),
                },
                completedAt: new Date(),
            } as any)
            .where(eq(attendanceSyncRuns.id, syncRunId));

        await db.update(attendanceDevices)
            .set({ lastSeenAt: new Date(), lastSyncAt: new Date(), updatedAt: new Date() })
            .where(eq(attendanceDevices.id, device.id));

        const dateRange = acceptedDates.length
            ? {
                startDate: new Date(Math.min(...acceptedDates.map(date => date.getTime()))).toISOString().slice(0, 10),
                endDate: new Date(Math.max(...acceptedDates.map(date => date.getTime()))).toISOString().slice(0, 10),
            }
            : {};

        res.json({
            ok: true,
            branchId,
            gatewayId,
            deviceId: device.id,
            syncRunId,
            received: logs.length,
            accepted,
            duplicates,
            rejected,
            errors,
            autoProcessing: accepted > 0 ? 'QUEUED' : 'NO_NEW_LOGS',
        });

        if (accepted > 0) {
            setImmediate(() => {
                void runBridgeAutoProcessing({ branchId, ...dateRange });
            });
        }
    } catch (error: any) {
        res.status(500).json({ ok: false, code: 'ATTENDANCE_BRIDGE_INGEST_FAILED', message: error.message });
    }
});

export default router;
