import { NextFunction, Router, Request, Response } from 'express';
import attendanceOpsService from '../services/attendanceOpsService';
import { scopeBranchQuery } from '../middleware/branchIsolation';
import { generateHrAttendancePDF } from '../services/pdfService';
import { generateHrAttendanceXlsx, streamHrAttendanceXlsx } from '../services/hrReportExportService';
import zktecoConnectorService, { DeviceSyncOptions } from '../services/zktecoConnectorService';

const router = Router();

router.use((req: Request, res: Response, next: NextFunction) => {
    if (['SUPER_ADMIN', 'OWNER'].includes(String(req.user?.role || '').toUpperCase())) return next();
    return scopeBranchQuery(req, res, next);
});

const parseDateInput = (value: unknown) => {
    if (!value) return undefined;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`INVALID_DATE:${String(value)}`);
    }
    return parsed;
};

const parseSyncOptions = (input: Record<string, any>): DeviceSyncOptions => {
    const startDate = parseDateInput(input.startDate);
    const endDate = parseDateInput(input.endDate);

    if (startDate && endDate && startDate > endDate) {
        throw new Error('START_DATE_AFTER_END_DATE');
    }

    const fetchModeRaw = input.fetchMode ? String(input.fetchMode).toUpperCase() : undefined;
    const fetchMode = fetchModeRaw && ['AUTO', 'RECENT', 'ALL', 'RANGE'].includes(fetchModeRaw)
        ? fetchModeRaw as DeviceSyncOptions['fetchMode']
        : undefined;

    const deviceIds = Array.isArray(input.deviceIds)
        ? input.deviceIds.map((item: unknown) => String(item)).filter(Boolean)
        : undefined;

    return {
        startDate,
        endDate,
        fetchMode,
        limit: input.limit !== undefined ? Number(input.limit) : undefined,
        overlapHours: input.overlapHours !== undefined ? Number(input.overlapHours) : undefined,
        branchId: input.branchId ? String(input.branchId) : undefined,
        deviceIds,
    };
};

const biometricErrorPayload = (error: any) => {
    const code = String(error?.message || 'BIOMETRIC_SYNC_FAILED');
    const messages: Record<string, string> = {
        DEVICE_HAS_NO_IP_ADDRESS: 'هذه الماكينة ليس لها IP مسجل. أضف IP أو استخدم استيراد ملف TXT.',
        DEVICE_NOT_FOUND: 'لم يتم العثور على ماكينة البصمة.',
        CONNECTION_FAILED: 'فشل الاتصال بماكينة البصمة. راجع IP والبورت وأن الماكينة على نفس الشبكة.',
        START_DATE_AFTER_END_DATE: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية.',
    };
    const connectionMessage = code.startsWith('Connection to ZK failed')
        ? messages.CONNECTION_FAILED
        : undefined;
    const missingDeviceMessage = code === 'DEVICE_NOT_FOUND_OR_NO_IP'
        ? 'لم يتم العثور على الماكينة أو أنها لا تحتوي على IP مسجل.'
        : undefined;
    return {
        code,
        error: code,
        message: messages[code] || missingDeviceMessage || connectionMessage || code,
    };
};

router.get('/devices', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.listDevices(req.query.branchId ? String(req.query.branchId) : undefined));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/devices', async (req: Request, res: Response) => {
    try {
        res.status(201).json(await attendanceOpsService.upsertDevice(req.body));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/devices/:id', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.deleteDevice(String(req.params.id), req.user?.id || 'system'));
    } catch (error: any) {
        const status = error.message === 'DEVICE_NOT_FOUND' ? 404 : 400;
        res.status(status).json({ error: error.message });
    }
});

router.post('/devices/mappings', async (req: Request, res: Response) => {
    try {
        res.status(201).json(await attendanceOpsService.upsertDeviceMapping(req.body));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/devices/mappings/link-unknown', async (req: Request, res: Response) => {
    try {
        const { deviceId, deviceUserId, employeeId, exceptionIds, resolutionNotes } = req.body || {};
        if (!deviceId || !deviceUserId || !employeeId) {
            return res.status(400).json({ error: 'DEVICE_USER_AND_EMPLOYEE_REQUIRED' });
        }
        res.status(201).json(await attendanceOpsService.linkUnknownBiometricGroup({
            deviceId: String(deviceId),
            deviceUserId: String(deviceUserId),
            employeeId: String(employeeId),
            exceptionIds: Array.isArray(exceptionIds) ? exceptionIds.map(String) : [],
            resolutionNotes,
            resolvedBy: req.user?.id || req.body?.resolvedBy || 'system',
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/devices/mappings/auto-resolve-unknown', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.autoResolveUnknownBiometricMatches({
            branchId: req.body?.branchId ? String(req.body.branchId) : undefined,
            resolvedBy: req.user?.id || req.body?.resolvedBy || 'system',
            limit: req.body?.limit !== undefined ? Number(req.body.limit) : undefined,
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/devices/:deviceId/mappings', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.listDeviceMappings(String(req.params.deviceId)));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/devices/mappings/:id', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.deactivateDeviceMapping(Number(req.params.id)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/geofences', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.listGeofences(req.query.branchId ? String(req.query.branchId) : undefined));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/geofences', async (req: Request, res: Response) => {
    try {
        res.status(201).json(await attendanceOpsService.upsertGeofence(req.body));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/raw-logs', async (req: Request, res: Response) => {
    try {
        const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
        const deviceId = req.query.deviceId ? String(req.query.deviceId) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : 100;
        res.json(await attendanceOpsService.listRawLogs(branchId, deviceId, limit));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/bridge-monitor', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.getBridgeMonitor(req.query.branchId ? String(req.query.branchId) : undefined));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/hr-readiness', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.getHrOperationalReadiness({
            branchId: req.query.branchId ? String(req.query.branchId) : undefined,
            startDate: req.query.startDate ? String(req.query.startDate) : undefined,
            endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        }));
    } catch (error: any) {
        const status = error.message === 'START_DATE_AFTER_END_DATE' ? 400 : 500;
        res.status(status).json({ error: error.message });
    }
});

router.get('/reports/attendance.csv', async (req: Request, res: Response) => {
    try {
        const report = await attendanceOpsService.buildHrAttendanceReport({
            branchId: req.query.branchId ? String(req.query.branchId) : undefined,
            employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
            startDate: req.query.startDate ? String(req.query.startDate) : undefined,
            endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        }, { includeCsv: true });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
        res.send(report.csv);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/reports/attendance.pdf', async (req: Request, res: Response) => {
    try {
        const report = await attendanceOpsService.buildHrAttendanceReport({
            branchId: req.query.branchId ? String(req.query.branchId) : undefined,
            employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
            startDate: req.query.startDate ? String(req.query.startDate) : undefined,
            endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        }, { includeCsv: false });
        const lang = String(req.query.lang || 'ar').toLowerCase() === 'en' ? 'en' : 'ar';
        const pdf = await generateHrAttendancePDF(report, lang);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${report.filename.replace(/\.csv$/i, '.pdf')}"`);
        res.send(pdf);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/reports/attendance.xlsx', async (req: Request, res: Response) => {
    try {
        const report = await attendanceOpsService.buildHrAttendanceReport({
            branchId: req.query.branchId ? String(req.query.branchId) : undefined,
            employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
            startDate: req.query.startDate ? String(req.query.startDate) : undefined,
            endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        }, { includeCsv: false });
        const lang = String(req.query.lang || 'ar').toLowerCase() === 'en' ? 'en' : 'ar';
        const rowCount = Array.isArray(report.rows) ? report.rows.length : 0;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${report.filename.replace(/\.csv$/i, '.xlsx')}"`);
        if (rowCount <= 10000) {
            const buffer = await generateHrAttendanceXlsx(report, lang);
            res.end(buffer);
            return;
        }
        await streamHrAttendanceXlsx(report, res, lang);
    } catch (error: any) {
        console.error('[attendance.xlsx] export failed', {
            branchId: req.query.branchId,
            employeeId: req.query.employeeId,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            lang: req.query.lang,
            rowHint: 'build-or-stream',
            error: error?.message,
        });
        res.status(400).json({ error: error.message });
    }
});

router.get('/employees/:employeeId/profile', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.getEmployeeAttendanceProfile({
            employeeId: String(req.params.employeeId),
            startDate: req.query.startDate ? String(req.query.startDate) : undefined,
            endDate: req.query.endDate ? String(req.query.endDate) : undefined,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/manual-punch', async (req: Request, res: Response) => {
    try {
        const { employeeId, branchId, eventType, occurredAt, reason, deviceId, notes } = req.body || {};
        if (!employeeId || !eventType || !occurredAt || !reason) {
            return res.status(400).json({ error: 'EMPLOYEE_EVENT_TIME_AND_REASON_REQUIRED' });
        }
        if (!['IN', 'OUT', 'UNKNOWN'].includes(String(eventType))) {
            return res.status(400).json({ error: 'INVALID_EVENT_TYPE' });
        }
        res.status(201).json(await attendanceOpsService.createManualPunch({
            employeeId: String(employeeId),
            branchId: branchId ? String(branchId) : undefined,
            eventType: String(eventType) as 'IN' | 'OUT' | 'UNKNOWN',
            occurredAt,
            reason: String(reason),
            requestedBy: req.user?.id || req.body?.requestedBy || 'system',
            deviceId: deviceId ? String(deviceId) : undefined,
            notes,
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/raw-logs', async (req: Request, res: Response) => {
    try {
        res.status(201).json(await attendanceOpsService.ingestRawLog(req.body));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/sessions', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.listSessions(
            req.query.branchId ? String(req.query.branchId) : undefined,
            req.query.status ? String(req.query.status) : undefined,
            req.query.startDate ? String(req.query.startDate) : undefined,
            req.query.endDate ? String(req.query.endDate) : undefined,
            req.query.employeeId ? String(req.query.employeeId) : undefined,
        ));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/exceptions', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.listExceptions(
            req.query.branchId ? String(req.query.branchId) : undefined,
            req.query.status ? String(req.query.status) : undefined,
        ));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/exceptions/queue', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.listExceptionQueue({
            branchId: req.query.branchId ? String(req.query.branchId) : undefined,
            status: req.query.status ? String(req.query.status) : undefined,
            assignedTo: req.query.assignedTo ? String(req.query.assignedTo) : undefined,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
        }));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/exceptions/queue-summary', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.getExceptionQueueSummary({
            branchId: req.query.branchId ? String(req.query.branchId) : undefined,
            status: req.query.status ? String(req.query.status) : undefined,
        }));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/corrections', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.listCorrections(
            req.query.branchId ? String(req.query.branchId) : undefined,
            req.query.status ? String(req.query.status) : undefined,
        ));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/corrections', async (req: Request, res: Response) => {
    try {
        const requestedBy = req.user?.id || req.body.requestedBy;
        if (!requestedBy) {
            return res.status(401).json({ error: 'REQUESTED_BY_REQUIRED' });
        }
        if (!req.body.sessionId || !req.body.reason) {
            return res.status(400).json({ error: 'SESSION_ID_AND_REASON_REQUIRED' });
        }
        res.status(201).json(await attendanceOpsService.requestCorrection({
            sessionId: String(req.body.sessionId),
            requestedBy,
            requestedClockInAt: req.body.requestedClockInAt,
            requestedClockOutAt: req.body.requestedClockOutAt,
            reason: String(req.body.reason),
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/corrections/:id/approve', async (req: Request, res: Response) => {
    try {
        const approvedBy = req.user?.id || req.body.approvedBy;
        if (!approvedBy) {
            return res.status(401).json({ error: 'APPROVED_BY_REQUIRED' });
        }
        res.json(await attendanceOpsService.approveCorrection({
            correctionId: String(req.params.id),
            approvedBy,
            approverNotes: req.body.approverNotes,
        }));
        
        // Log manager override metric asynchronously
        import('../services/accountabilityService').then(({ accountabilityService }) => {
            accountabilityService.logManagerOverride(approvedBy, String(req.query.branchId || req.body.branchId || 'system'), String(req.params.id), req.body.approverNotes || 'Attendance correction approved');
        });

    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/corrections/:id/reject', async (req: Request, res: Response) => {
    try {
        const approvedBy = req.user?.id || req.body.approvedBy;
        if (!approvedBy) {
            return res.status(401).json({ error: 'APPROVED_BY_REQUIRED' });
        }
        res.json(await attendanceOpsService.rejectCorrection({
            correctionId: String(req.params.id),
            approvedBy,
            approverNotes: req.body.approverNotes,
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/exceptions/bulk/resolve', async (req: Request, res: Response) => {
    try {
        const resolvedBy = req.user?.id || req.body.resolvedBy || 'system';
        const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id: unknown) => String(id)).filter(Boolean) : [];
        if (!ids.length) {
            return res.status(400).json({ error: 'EXCEPTION_IDS_REQUIRED' });
        }
        res.json(await attendanceOpsService.resolveExceptionsBulk({
            ids,
            resolvedBy,
            resolutionNotes: req.body.resolutionNotes,
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/exceptions/:id/resolve', async (req: Request, res: Response) => {
    try {
        const resolvedBy = req.user?.id || req.body.resolvedBy;
        if (!resolvedBy) {
            return res.status(401).json({ error: 'RESOLVED_BY_REQUIRED' });
        }
        res.json(await attendanceOpsService.resolveException({
            id: String(req.params.id),
            resolvedBy,
            resolutionNotes: req.body.resolutionNotes,
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/exceptions/:id/assign', async (req: Request, res: Response) => {
    try {
        const assignedTo = req.body.assignedTo;
        if (!assignedTo) {
            return res.status(400).json({ error: 'ASSIGNED_TO_REQUIRED' });
        }
        res.json(await attendanceOpsService.assignException({
            id: String(req.params.id),
            assignedTo: String(assignedTo),
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/exceptions/:id/escalate', async (req: Request, res: Response) => {
    try {
        const escalatedBy = req.user?.id || req.body.escalatedBy;
        if (!escalatedBy) {
            return res.status(401).json({ error: 'ESCALATED_BY_REQUIRED' });
        }
        res.json(await attendanceOpsService.escalateException({
            id: String(req.params.id),
            escalatedBy,
            notes: req.body.notes,
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/location/check-in', async (req: Request, res: Response) => {
    try {
        const { employeeId, branchId, lat, lng, accuracy } = req.body;
        if (!employeeId || !branchId || typeof lat !== 'number' || typeof lng !== 'number') {
            return res.status(400).json({ error: 'EMPLOYEE_BRANCH_AND_COORDINATES_REQUIRED' });
        }
        res.status(201).json(await attendanceOpsService.locationClock(employeeId, branchId, 'IN', lat, lng, accuracy));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/location/check-out', async (req: Request, res: Response) => {
    try {
        const { employeeId, branchId, lat, lng, accuracy } = req.body;
        if (!employeeId || !branchId || typeof lat !== 'number' || typeof lng !== 'number') {
            return res.status(400).json({ error: 'EMPLOYEE_BRANCH_AND_COORDINATES_REQUIRED' });
        }
        res.status(201).json(await attendanceOpsService.locationClock(employeeId, branchId, 'OUT', lat, lng, accuracy));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/backfill-sessions', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.backfillLegacyAttendanceSessions(Number(req.body.limit || 250)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/recalculate-sessions', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.recalculateAttendanceSessions({
            branchId: req.body.branchId ? String(req.body.branchId) : undefined,
            employeeId: req.body.employeeId ? String(req.body.employeeId) : undefined,
            startDate: req.body.startDate ? String(req.body.startDate) : undefined,
            endDate: req.body.endDate ? String(req.body.endDate) : undefined,
            limit: req.body.limit ? Number(req.body.limit) : undefined,
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/rebuild-smart-days', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.rebuildSmartDailySessions({
            branchId: req.body.branchId ? String(req.body.branchId) : undefined,
            employeeId: req.body.employeeId ? String(req.body.employeeId) : undefined,
            startDate: req.body.startDate ? String(req.body.startDate) : undefined,
            endDate: req.body.endDate ? String(req.body.endDate) : undefined,
            limit: req.body.limit ? Number(req.body.limit) : undefined,
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/daily-close', async (req: Request, res: Response) => {
    try {
        const { branchId, date, forceClose, includePayrollPreview } = req.body;
        if (!branchId || !date) {
            return res.status(400).json({ error: 'BRANCH_ID_AND_DATE_REQUIRED' });
        }
        const closedBy = req.user?.id || req.body.closedBy;
        res.json(await attendanceOpsService.dailyCloseAttendance({
            branchId: String(branchId),
            date: String(date),
            closedBy,
            forceClose: Boolean(forceClose),
            includePayrollPreview: Boolean(includePayrollPreview),
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/monthly-close', async (req: Request, res: Response) => {
    try {
        const { branchId, startDate, endDate, forceClose, includePayrollPreview, purgeRawLogs } = req.body;
        if (!branchId || !startDate || !endDate) {
            return res.status(400).json({ error: 'BRANCH_ID_AND_PERIOD_REQUIRED' });
        }
        const closedBy = req.user?.id || req.body.closedBy;
        res.json(await attendanceOpsService.monthlyCloseAttendance({
            branchId: String(branchId),
            startDate: String(startDate),
            endDate: String(endDate),
            closedBy,
            forceClose: Boolean(forceClose),
            includePayrollPreview: Boolean(includePayrollPreview),
            purgeRawLogs: purgeRawLogs === undefined ? true : Boolean(purgeRawLogs),
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/clear-all', async (req: Request, res: Response) => {
    try {
        const { branchId } = req.body;
        res.json(await attendanceOpsService.clearAllAttendanceData(branchId ? String(branchId) : undefined));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// ─── ZKTeco Biometric Connector Routes ───────────────────────────────────


// Test connection to a device by IP
router.post('/devices/test-connection', async (req: Request, res: Response) => {
    try {
        const { ip, port } = req.body;
        if (!ip) return res.status(400).json({ error: 'IP_ADDRESS_REQUIRED' });
        res.json(await zktecoConnectorService.testConnection(ip, port || 4370));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Sync a single device
router.post('/devices/:id/sync', async (req: Request, res: Response) => {
    try {
        const options = parseSyncOptions(req.body || {});
        res.json(await zktecoConnectorService.syncSingleDevice(String(req.params.id), options));
    } catch (error: any) {
        res.status(400).json(biometricErrorPayload(error));
    }
});

// Pull logs from a device and return a reviewable preview without saving anything.
router.post('/devices/:id/sync/preview', async (req: Request, res: Response) => {
    try {
        const options = parseSyncOptions(req.body || {});
        res.json(await zktecoConnectorService.previewDeviceSync(String(req.params.id), options));
    } catch (error: any) {
        res.status(400).json(biometricErrorPayload(error));
    }
});

// Save only the records approved by the operator from the preview.
router.post('/devices/:id/sync/commit', async (req: Request, res: Response) => {
    try {
        res.json(await zktecoConnectorService.commitDevicePreview(String(req.params.id), req.body?.records || []));
    } catch (error: any) {
        res.status(400).json(biometricErrorPayload(error));
    }
});

router.get('/devices/:id/sync-settings', async (req: Request, res: Response) => {
    try {
        res.json(await zktecoConnectorService.getDeviceSyncSettings(String(req.params.id)));
    } catch (error: any) {
        res.status(400).json(biometricErrorPayload(error));
    }
});

router.put('/devices/:id/sync-settings', async (req: Request, res: Response) => {
    try {
        res.json(await zktecoConnectorService.updateDeviceSyncSettings(String(req.params.id), req.body || {}));
    } catch (error: any) {
        res.status(400).json(biometricErrorPayload(error));
    }
});

router.post('/devices/:id/bridge-sync', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.requestBridgeDeviceSync(String(req.params.id), req.user?.id || null, {
            startDate: req.body?.startDate ? String(req.body.startDate) : null,
            endDate: req.body?.endDate ? String(req.body.endDate) : null,
            forceFull: req.body?.forceFull === true || req.body?.fullHistory === true,
        }));
    } catch (error: any) {
        console.error('[attendance-ops] bridge-sync failed', {
            deviceId: req.params.id,
            userId: req.user?.id || null,
            error: error?.message,
            stack: error?.stack,
        });
        res.status(400).json(biometricErrorPayload(error));
    }
});

router.post('/devices/:id/bridge-test', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.requestBridgePing(String(req.params.id), req.user?.id || null));
    } catch (error: any) {
        console.error('[attendance-ops] bridge-test failed', {
            deviceId: req.params.id,
            userId: req.user?.id || null,
            error: error?.message,
            stack: error?.stack,
        });
        res.status(400).json(biometricErrorPayload(error));
    }
});

router.post('/devices/:id/bridge-clear-logs', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.requestBridgeDeviceOperation(String(req.params.id), 'CLEAR_DEVICE_LOGS_WITH_BACKUP', req.user?.id || null));
    } catch (error: any) {
        console.error('[attendance-ops] bridge-clear-logs failed', {
            deviceId: req.params.id,
            userId: req.user?.id || null,
            error: error?.message,
            stack: error?.stack,
        });
        res.status(400).json(biometricErrorPayload(error));
    }
});

router.post('/devices/:id/bridge-restart', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.requestBridgeDeviceOperation(String(req.params.id), 'RESTART_DEVICE', req.user?.id || null));
    } catch (error: any) {
        console.error('[attendance-ops] bridge-restart failed', {
            deviceId: req.params.id,
            userId: req.user?.id || null,
            error: error?.message,
            stack: error?.stack,
        });
        res.status(400).json(biometricErrorPayload(error));
    }
});

router.get('/sync-runs/:id', async (req: Request, res: Response) => {
    try {
        res.json(await attendanceOpsService.getSyncRun(String(req.params.id)));
    } catch (error: any) {
        res.status(404).json({ error: error.message, code: error.message });
    }
});

// Stream sync progress via SSE
router.get('/devices/:id/sync/stream', async (req: Request, res: Response) => {
    // Disable all timeouts — this endpoint can run for 15+ minutes on large devices (47K logs over WAN)
    req.setTimeout(900000);           // 15 min request timeout
    res.setTimeout?.(900000);         // 15 min response timeout  
    req.socket?.setTimeout?.(900000); // 15 min socket timeout (kills Node's default 2min)
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if behind proxy
    res.flushHeaders();

    const deviceId = String(req.params.id);

    try {
        const options = parseSyncOptions(req.query as Record<string, any>);
        const result = await zktecoConnectorService.syncDeviceStream(deviceId, (data) => {
            try {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            } catch { /* connection closed by client */ }
        }, options);
        res.write(`data: ${JSON.stringify({ step: 'DONE', result })}\n\n`);
    } catch (err: any) {
        res.write(`data: ${JSON.stringify({ step: 'ERROR', error: err.message })}\n\n`);
    } finally {
        res.end();
    }
});

// Sync ALL active biometric devices
router.post('/sync-all', async (req: Request, res: Response) => {
    try {
        const options = parseSyncOptions(req.body || {});
        const results = await zktecoConnectorService.syncDevices(options);
        res.json({
            totalDevices: results.length,
            successCount: results.filter(r => r.success).length,
            totalIngested: results.reduce((s, r) => s + r.logsIngested, 0),
            totalSkipped: results.reduce((s, r) => s + r.logsSkipped, 0),
            totalUnknownEmployees: results.reduce((s, r) => s + r.unknownEmployees, 0),
            totalExceptions: results.reduce((s, r) => s + r.exceptionsRaised, 0),
            results,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Import attendance from TXT file (fallback)
router.post('/import-txt', async (req: Request, res: Response) => {
    try {
        const { content, branchId, deviceId } = req.body;
        if (!content || !branchId) {
            return res.status(400).json({ error: 'CONTENT_AND_BRANCH_ID_REQUIRED' });
        }
        res.json(await zktecoConnectorService.importTxtFile(content, branchId, deviceId));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Get all device statuses
router.get('/devices/status', async (req: Request, res: Response) => {
    try {
        res.json(await zktecoConnectorService.getDeviceStatuses());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Start/Stop auto-sync CRON
router.post('/auto-sync/start', async (req: Request, res: Response) => {
    try {
        const intervalMinutes = Number(req.body.intervalMinutes) || 15;
        zktecoConnectorService.startAutoSync(intervalMinutes);
        res.json({ status: 'STARTED', intervalMinutes });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/auto-sync/stop', async (req: Request, res: Response) => {
    try {
        zktecoConnectorService.stopAutoSync();
        res.json({ status: 'STOPPED' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Advanced Device Management
router.get('/devices/:id/log-stats', async (req: Request, res: Response) => {
    try {
        res.json(await zktecoConnectorService.getDeviceLogStats(String(req.params.id)));
    } catch (error: any) {
        const payload = biometricErrorPayload(error);
        res.json({
            success: false,
            deviceId: String(req.params.id),
            records: null,
            users: 0,
            capacity: null,
            checkedAt: new Date().toISOString(),
            ...payload,
        });
    }
});

router.post('/devices/:id/clear-logs', async (req: Request, res: Response) => {
    try {
        res.json(await zktecoConnectorService.clearDeviceLogs(String(req.params.id)));
    } catch (error: any) {
        res.status(400).json(biometricErrorPayload(error));
    }
});

router.post('/devices/:id/restart', async (req: Request, res: Response) => {
    try {
        res.json(await zktecoConnectorService.restartDevice(String(req.params.id)));
    } catch (error: any) {
        res.status(400).json(biometricErrorPayload(error));
    }
});

router.post('/devices/:id/set-time', async (req: Request, res: Response) => {
    try {
        res.json(await zktecoConnectorService.setDeviceTime(String(req.params.id), req.body.time));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Attendance Sessions ────────────────────────────────────────────────
export default router;
