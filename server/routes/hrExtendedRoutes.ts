import { Router } from 'express';
import { hrExtendedService } from '../services/hrExtendedService';
import payrollCalculationService from '../services/payrollCalculationService';
import payrollCloseService from '../services/payrollCloseService';
import payslipService from '../services/payslipService';
import payrollReopenService from '../services/payrollReopenService';
import payrollComplianceService from '../services/payrollComplianceService';
import schedulingService from '../services/schedulingService';
import shiftTaskService from '../services/shiftTaskService';
import attendanceOpsService from '../services/attendanceOpsService';
import hrExecutiveReportsService from '../services/hrExecutiveReportsService';
import { Request, Response } from 'express';
import { db } from '../db';
import { attendanceCorrections, attendanceExceptions, attendanceSessions, auditLogs, employeeCompensationItems, employeePayrollAssignments, employeeShiftAssignments, employees, leaveRequests, leaveTypes, managerApprovals, notifications, payrollCycles, payrollRuns, payslips, users } from '../../src/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const router = Router();
const makeId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

const getScopedBranches = (req: Request) => {
    const role = String(req.user?.role || '').toUpperCase();
    if (role === 'SUPER_ADMIN' || role === 'OWNER') return null;
    const scoped = new Set<string>();
    if (req.user?.branchId) scoped.add(String(req.user.branchId));
    for (const branchId of req.user?.allowedBranches || []) {
        if (branchId) scoped.add(String(branchId));
    }
    return scoped;
};

const assertBranchScope = (req: Request, branchId?: string | null) => {
    const scopedBranches = getScopedBranches(req);
    if (!scopedBranches) return;
    if (!branchId || !scopedBranches.has(String(branchId))) {
        const error: any = new Error('FORBIDDEN_BRANCH_SCOPE');
        error.status = 403;
        throw error;
    }
};

const resolveScopedBranchId = (req: Request, explicitBranchId?: string | null) => {
    const branchId =
        explicitBranchId ||
        (req.query.branchId ? String(req.query.branchId) : undefined) ||
        (req.body?.branchId ? String(req.body.branchId) : undefined) ||
        req.user?.branchId ||
        null;
    assertBranchScope(req, branchId);
    return branchId;
};

const loadScopedEmployee = async (req: Request, employeeId: string) => {
    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (!employee) {
        const error: any = new Error('EMPLOYEE_NOT_FOUND');
        error.status = 404;
        throw error;
    }
    assertBranchScope(req, employee.branchId);
    return employee;
};

const resolveCurrentEmployee = async (userId: string) => {
    const [linkedEmployee] = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
    if (linkedEmployee) return linkedEmployee;

    const [currentUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!currentUser?.email) return null;

    const [employeeByEmail] = await db.select().from(employees).where(eq(employees.email, currentUser.email)).limit(1);
    if (!employeeByEmail) return null;

    if (!employeeByEmail.userId) {
        const [updated] = await db.update(employees)
            .set({ userId, updatedAt: new Date() })
            .output()
            .where(eq(employees.id, employeeByEmail.id));
        return updated || employeeByEmail;
    }

    return employeeByEmail;
};

router.post('/bootstrap-defaults', async (req: Request, res: Response) => {
    try {
        const branchId = String(req.body.branchId || req.query.branchId || '');
        res.status(201).json(await hrExtendedService.bootstrapHrDefaults(branchId));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/self-service/overview', async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

        const [currentUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        const employee = await resolveCurrentEmployee(userId);
        if (!employee) {
            return res.status(404).json({ error: 'EMPLOYEE_LINK_REQUIRED' });
        }
        const currentUserRole = String(currentUser?.role || '').toUpperCase();
        const hasManagerView = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'HR', 'MANAGER', 'BRANCH_MANAGER'].some(role => currentUserRole.includes(role));

        const now = new Date();
        const attendanceStart = new Date(now);
        attendanceStart.setDate(attendanceStart.getDate() - 13);

        const [
            attendanceProfile,
            leaveBalances,
            employeeLeaveRequests,
            documents,
            overtimeEntries,
            loans,
            adjustments,
            shiftAssignments,
            leaveTypesData,
            recentPayslips,
            pendingCorrections,
            pendingExceptions,
            managerLeaveRequests,
        ] = await Promise.all([
            attendanceOpsService.getEmployeeAttendanceProfile({
                employeeId: employee.id,
                startDate: attendanceStart.toISOString().slice(0, 10),
                endDate: now.toISOString().slice(0, 10),
                limit: 30,
            }),
            hrExtendedService.getAllBalances(employee.id),
            hrExtendedService.getLeaveRequests({ employeeId: employee.id }),
            hrExtendedService.getEmployeeDocuments({ employeeId: employee.id }),
            hrExtendedService.getOvertimeEntries({ employeeId: employee.id }),
            hrExtendedService.getEmployeeLoans({ employeeId: employee.id }),
            hrExtendedService.getBonusPenaltyRecords({ employeeId: employee.id }),
            hrExtendedService.getEmployeeShiftAssignments(employee.id),
            hrExtendedService.getLeaveTypes(),
            db.select({
                id: payslips.id,
                issuedAt: payslips.issuedAt,
                generatedAt: payslips.generatedAt,
                pdfUrl: payslips.pdfUrl,
                version: payslips.version,
                payload: payslips.payload,
                runStatus: payrollRuns.status,
                periodStart: payrollCycles.periodStart,
                periodEnd: payrollCycles.periodEnd,
            }).from(payslips)
                .leftJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
                .leftJoin(payrollCycles, eq(payslips.cycleId, payrollCycles.id))
                .where(eq(payslips.employeeId, employee.id))
                .orderBy(desc(payslips.issuedAt))
                .limit(6),
            hasManagerView ? attendanceOpsService.listCorrections(employee.branchId, 'PENDING') : Promise.resolve([]),
            hasManagerView ? attendanceOpsService.listExceptionQueue({ branchId: employee.branchId, status: 'OPEN' }) : Promise.resolve([]),
            hasManagerView
                ? db.select({
                    id: leaveRequests.id,
                    employeeId: leaveRequests.employeeId,
                    startDate: leaveRequests.startDate,
                    endDate: leaveRequests.endDate,
                    totalDays: leaveRequests.totalDays,
                    reason: leaveRequests.reason,
                    status: leaveRequests.status,
                    employeeName: employees.name,
                    leaveTypeId: leaveRequests.leaveTypeId,
                    leaveTypeName: leaveTypes.name,
                    leaveTypeNameAr: leaveTypes.nameAr,
                }).from(leaveRequests)
                    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
                    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
                    .where(eq(employees.branchId, employee.branchId))
                    .orderBy(desc(leaveRequests.createdAt))
                    .limit(6)
                : Promise.resolve([]),
        ]);

        const summary = {
            pendingLeaveRequests: employeeLeaveRequests.filter(item => item.status === 'PENDING').length,
            approvedLeaveRequests: employeeLeaveRequests.filter(item => item.status === 'APPROVED').length,
            expiringDocuments: documents.filter(item => item.computedStatus === 'EXPIRING_SOON' || item.computedStatus === 'EXPIRED').length,
            activeLoans: loans.filter(item => !['REJECTED', 'CLOSED', 'PAID'].includes(String(item.status || '').toUpperCase())).length,
            pendingAdjustments: adjustments.filter(item => item.status === 'PENDING').length,
            overtimePending: overtimeEntries.filter(item => item.status === 'PENDING').length,
            openAttendanceSessions: Number(attendanceProfile?.totals?.openSessions || 0),
            exceptionAttendanceSessions: Number(attendanceProfile?.totals?.exceptionSessions || 0),
            totalAttendanceHours: Number(attendanceProfile?.totals?.totalHours || 0),
            overtimeMinutes: Number(attendanceProfile?.totals?.overtimeMinutes || 0),
            lastAttendanceAt: attendanceProfile?.rawLogs?.[0]?.occurredAt || attendanceProfile?.sessions?.[0]?.clockInAt || null,
        };
        const leaveTypeMap = new Map(leaveTypesData.map(item => [item.id, item.nameAr || item.name]));

        return res.json({
            linked: true,
            managerMode: hasManagerView,
            employee,
            summary,
            attendance: {
                periodStart: attendanceStart.toISOString().slice(0, 10),
                periodEnd: now.toISOString().slice(0, 10),
                totals: attendanceProfile.totals,
                sessions: attendanceProfile.sessions.slice(0, 10),
            },
            leaveBalances,
            leaveRequests: employeeLeaveRequests.slice(0, 8).map(item => ({
                ...item,
                leaveTypeName: leaveTypeMap.get(item.leaveTypeId) || item.leaveTypeId,
            })),
            documents: documents.slice(0, 8),
            overtimeEntries: overtimeEntries.slice(0, 8),
            loans: loans.slice(0, 6),
            adjustments: adjustments.slice(0, 8),
            shiftAssignments: shiftAssignments.slice(0, 6),
            managerQueue: hasManagerView ? {
                pendingCorrections: pendingCorrections.slice(0, 6),
                openExceptions: pendingExceptions.slice(0, 6),
                pendingLeaveRequests: managerLeaveRequests.filter(item => item.status === 'PENDING').slice(0, 6).map(item => ({
                    ...item,
                    leaveTypeName: item.leaveTypeNameAr || item.leaveTypeName || item.leaveTypeId,
                })),
                totals: {
                    pendingCorrections: pendingCorrections.length,
                    openExceptions: pendingExceptions.length,
                    pendingLeaveRequests: managerLeaveRequests.filter(item => item.status === 'PENDING').length,
                },
            } : null,
            payslips: recentPayslips.map(item => ({
                ...item,
                netPay: Number((item.payload as any)?.netPay || (item.payload as any)?.summary?.netPay || 0),
                grossPay: Number((item.payload as any)?.grossPay || (item.payload as any)?.summary?.grossPay || 0),
            })),
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/executive-dashboard', async (req: Request, res: Response) => {
    try {
        const branchId = resolveScopedBranchId(req, req.query.branchId ? String(req.query.branchId) : undefined) || undefined;
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const periodEnd = now.toISOString().slice(0, 10);

        const [
            readiness,
            bridgeMonitor,
            branchEmployees,
            branchLeaves,
            branchDocs,
            performanceRecords,
            offboardingRecords,
            openExceptions,
            openSessions,
        ] = await Promise.all([
            attendanceOpsService.getHrOperationalReadiness({ branchId, startDate: periodStart, endDate: periodEnd }),
            attendanceOpsService.getBridgeMonitor(branchId),
            db.select().from(employees).where(branchId ? eq(employees.branchId, branchId) : undefined),
            db.select({
                id: leaveRequests.id,
                employeeId: leaveRequests.employeeId,
                status: leaveRequests.status,
                startDate: leaveRequests.startDate,
                endDate: leaveRequests.endDate,
                employeeName: employees.name,
                leaveTypeName: leaveTypes.nameAr,
            }).from(leaveRequests)
                .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
                .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
                .where(branchId ? eq(employees.branchId, branchId) : undefined)
                .orderBy(desc(leaveRequests.createdAt))
                .limit(12),
            hrExtendedService.getEmployeeDocuments({ branchId, expiringWithinDays: 30 }),
            db.select().from(managerApprovals).where(branchId ? eq(managerApprovals.branchId, branchId) : undefined).orderBy(desc(managerApprovals.createdAt)).limit(200),
            db.select().from(managerApprovals).where(branchId ? eq(managerApprovals.branchId, branchId) : undefined).orderBy(desc(managerApprovals.createdAt)).limit(200),
            attendanceOpsService.listExceptionQueue({ branchId, status: 'OPEN' }),
            attendanceOpsService.listSessions(branchId, 'OPEN'),
        ]);

        const performanceItems = performanceRecords.filter(item => ['HR_NOTE', 'HR_WARNING', 'HR_REVIEW', 'HR_PIP'].includes(String(item.actionType || '').toUpperCase()));
        const openPerformanceItems = performanceItems.filter(item => !['CLOSED'].includes(String((item.details as any)?.status || 'OPEN').toUpperCase()));
        const offboardingItems = offboardingRecords.filter(item => String(item.actionType || '').toUpperCase() === 'HR_OFFBOARD_TASK');
        const openOffboardingItems = offboardingItems.filter(item => !['DONE', 'WAIVED'].includes(String((item.details as any)?.status || 'OPEN').toUpperCase()));
        const highRiskEmployees = new Map<string, { employeeId: string; employeeName: string; score: number; reasons: string[] }>();

        for (const exception of openExceptions.slice(0, 40)) {
            const employeeId = String((exception as any).employeeId || '');
            if (!employeeId) continue;
            const employeeName = branchEmployees.find(emp => emp.id === employeeId)?.name || employeeId;
            const current = highRiskEmployees.get(employeeId) || { employeeId, employeeName, score: 0, reasons: [] };
            current.score += String((exception as any).severity || '').toUpperCase() === 'HIGH' ? 3 : 2;
            current.reasons.push((exception as any).title || 'Attendance exception');
            highRiskEmployees.set(employeeId, current);
        }
        for (const session of openSessions.slice(0, 40)) {
            const employeeId = String((session as any).employeeId || '');
            if (!employeeId) continue;
            const employeeName = branchEmployees.find(emp => emp.id === employeeId)?.name || employeeId;
            const current = highRiskEmployees.get(employeeId) || { employeeId, employeeName, score: 0, reasons: [] };
            current.score += 2;
            current.reasons.push('Open attendance session');
            highRiskEmployees.set(employeeId, current);
        }

        const alerts = [
            readiness.canClosePayroll ? null : {
                key: 'payroll_not_ready',
                severity: 'HIGH',
                title: 'Payroll is not ready to close',
                count: readiness.actions.filter(item => ['HIGH', 'CRITICAL'].includes(item.severity)).length,
                details: 'Resolve high-severity blockers before closing the current cycle.',
            },
            bridgeMonitor.totals.failed > 0 ? {
                key: 'bridge_failed',
                severity: 'HIGH',
                title: 'Bridge or device connection issues',
                count: bridgeMonitor.totals.failed,
                details: 'Some biometric devices failed or stopped syncing.',
            } : null,
            branchLeaves.filter(item => item.status === 'PENDING').length > 0 ? {
                key: 'pending_leave_requests',
                severity: 'MEDIUM',
                title: 'Pending leave approvals',
                count: branchLeaves.filter(item => item.status === 'PENDING').length,
                details: 'Managers still have leave requests waiting for a decision.',
            } : null,
            openOffboardingItems.length > 0 ? {
                key: 'offboarding_open',
                severity: 'MEDIUM',
                title: 'Open offboarding tasks',
                count: openOffboardingItems.length,
                details: 'Some employee exits still have unfinished clearance tasks.',
            } : null,
            openPerformanceItems.filter(item => String(item.actionType).toUpperCase() === 'HR_WARNING').length > 0 ? {
                key: 'performance_warnings',
                severity: 'MEDIUM',
                title: 'Employee warnings need follow-up',
                count: openPerformanceItems.filter(item => String(item.actionType).toUpperCase() === 'HR_WARNING').length,
                details: 'Warnings and performance items are still open.',
            } : null,
            branchDocs.filter(item => item.computedStatus === 'EXPIRED').length > 0 ? {
                key: 'expired_documents',
                severity: 'LOW',
                title: 'Expired employee documents',
                count: branchDocs.filter(item => item.computedStatus === 'EXPIRED').length,
                details: 'Some contracts, IDs, or certificates are expired.',
            } : null,
        ].filter(Boolean);

        res.json({
            branchId: branchId || null,
            period: { startDate: periodStart, endDate: periodEnd },
            summary: {
                readinessScore: readiness.readinessScore,
                canClosePayroll: readiness.canClosePayroll,
                activeEmployees: branchEmployees.length,
                pendingLeaves: branchLeaves.filter(item => item.status === 'PENDING').length,
                openExceptions: openExceptions.length,
                openSessions: openSessions.length,
                bridgeOk: bridgeMonitor.totals.ok,
                bridgeFailed: bridgeMonitor.totals.failed,
                expiringDocuments: branchDocs.filter(item => ['EXPIRED', 'EXPIRING_SOON'].includes(String(item.computedStatus))).length,
                openPerformanceItems: openPerformanceItems.length,
                openOffboardingItems: openOffboardingItems.length,
            },
            alerts,
            queues: {
                readinessActions: readiness.actions.slice(0, 8),
                pendingLeaves: branchLeaves.filter(item => item.status === 'PENDING').slice(0, 6),
                offboardingTasks: openOffboardingItems.slice(0, 6).map(item => ({
                    id: item.id,
                    title: (item.details as any)?.title || item.reason,
                    employeeId: (item.details as any)?.employeeId || item.relatedId,
                    employeeName: (item.details as any)?.employeeName || null,
                    status: (item.details as any)?.status || 'OPEN',
                    dueDate: (item.details as any)?.dueDate || null,
                    ownerName: (item.details as any)?.ownerName || null,
                })),
                performanceItems: openPerformanceItems.slice(0, 6).map(item => ({
                    id: item.id,
                    title: (item.details as any)?.title || item.reason,
                    employeeId: (item.details as any)?.employeeId || item.relatedId,
                    employeeName: (item.details as any)?.employeeName || null,
                    actionType: item.actionType,
                    status: (item.details as any)?.status || 'OPEN',
                    dueDate: (item.details as any)?.dueDate || null,
                })),
                highRiskEmployees: Array.from(highRiskEmployees.values())
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 6),
            },
        });
    } catch (e: any) { res.status(e?.status || 500).json({ error: e.message }); }
});

router.get('/executive-reports', async (req: Request, res: Response) => {
    try {
        const branchId = resolveScopedBranchId(req, req.query.branchId ? String(req.query.branchId) : undefined) || undefined;
        res.json(await hrExecutiveReportsService.getExecutiveReports({
            branchId,
            startDate: req.query.startDate ? String(req.query.startDate) : undefined,
            endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        }));
    } catch (e: any) { res.status(e?.status || 500).json({ error: e.message }); }
});

router.post('/self-service/leave-requests', async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const employee = await resolveCurrentEmployee(userId);
        if (!employee) {
            return res.status(404).json({ error: 'EMPLOYEE_LINK_REQUIRED' });
        }
        if (!req.body.leaveTypeId || !req.body.startDate || !req.body.endDate || !req.body.reason) {
            return res.status(400).json({ error: 'LEAVE_TYPE_DATES_AND_REASON_REQUIRED' });
        }
        res.status(201).json(await hrExtendedService.createLeaveRequest({
            employeeId: employee.id,
            employeeName: employee.name,
            leaveTypeId: String(req.body.leaveTypeId),
            startDate: String(req.body.startDate),
            endDate: String(req.body.endDate),
            reason: String(req.body.reason),
        }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post('/self-service/attendance-corrections', async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const employee = await resolveCurrentEmployee(userId);
        if (!employee) {
            return res.status(404).json({ error: 'EMPLOYEE_LINK_REQUIRED' });
        }
        if (!req.body.sessionId || !req.body.reason) {
            return res.status(400).json({ error: 'SESSION_ID_AND_REASON_REQUIRED' });
        }
        res.status(201).json(await attendanceOpsService.requestCorrection({
            sessionId: String(req.body.sessionId),
            requestedBy: userId,
            requestedClockInAt: req.body.requestedClockInAt || undefined,
            requestedClockOutAt: req.body.requestedClockOutAt || undefined,
            reason: String(req.body.reason),
        }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Attendance Policies
router.get('/attendance-policies', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.getAttendancePolicies(req.query.branchId ? String(req.query.branchId) : undefined)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/attendance-policies', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.upsertAttendancePolicy(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Employee Document Vault
router.get('/employee-documents', async (req: Request, res: Response) => {
    try {
        const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;
        if (employeeId) await loadScopedEmployee(req, employeeId);
        const branchId = resolveScopedBranchId(req, req.query.branchId ? String(req.query.branchId) : undefined) || undefined;
        res.json(await hrExtendedService.getEmployeeDocuments({
            employeeId,
            branchId,
            expiringWithinDays: req.query.expiringWithinDays !== undefined ? Number(req.query.expiringWithinDays) : undefined,
            status: req.query.status ? String(req.query.status) : undefined,
        }));
    } catch (e: any) { res.status(e?.status || 500).json({ error: e.message }); }
});

router.get('/employee-lifecycle/:employeeId', async (req: Request, res: Response) => {
    try {
        const employeeId = String(req.params.employeeId);
        const employee = await loadScopedEmployee(req, employeeId);
        const today = new Date();
        const profileStart = new Date(today);
        profileStart.setDate(profileStart.getDate() - 29);

        const [
            docs,
            balances,
            leaves,
            loans,
            adjustments,
            shifts,
            payrollAssignments,
            openSessions,
            pendingCorrections,
            openExceptions,
            attendanceProfile,
        ] = await Promise.all([
            hrExtendedService.getEmployeeDocuments({ employeeId }),
            hrExtendedService.getAllBalances(employeeId),
            hrExtendedService.getLeaveRequests({ employeeId }),
            hrExtendedService.getEmployeeLoans({ employeeId }),
            hrExtendedService.getBonusPenaltyRecords({ employeeId }),
            hrExtendedService.getEmployeeShiftAssignments(employeeId),
            hrExtendedService.getEmployeePayrollAssignments(employeeId),
            db.select({ id: attendanceSessions.id }).from(attendanceSessions).where(eq(attendanceSessions.employeeId, employeeId)),
            db.select({ id: attendanceCorrections.id }).from(attendanceCorrections).where(eq(attendanceCorrections.employeeId, employeeId)),
            db.select({ id: attendanceExceptions.id, severity: attendanceExceptions.severity }).from(attendanceExceptions).where(eq(attendanceExceptions.employeeId, employeeId)),
            attendanceOpsService.getEmployeeAttendanceProfile({
                employeeId,
                startDate: profileStart.toISOString().slice(0, 10),
                endDate: today.toISOString().slice(0, 10),
                limit: 40,
            }),
        ]);

        const activeShift = shifts.find(item => !item.effectiveTo || item.effectiveTo >= today);
        const activePayrollAssignment = payrollAssignments.find(item => !item.effectiveTo || item.effectiveTo >= today);
        const hasAttendanceCode = Boolean(String(employee.attendanceCode || employee.employeeCode || '').trim());
        const hasUserLink = Boolean(employee.userId);
        const hasSalarySetup = Number(employee.basicSalary || employee.hourlyRate || 0) > 0;
        const validDocuments = docs.filter(item => item.computedStatus === 'ACTIVE').length;
        const expiringDocuments = docs.filter(item => item.computedStatus === 'EXPIRING_SOON' || item.computedStatus === 'EXPIRED').length;
        const pendingLeaves = leaves.filter(item => item.status === 'PENDING').length;
        const activeLoans = loans.filter(item => !['REJECTED', 'CLOSED', 'PAID'].includes(String(item.status || '').toUpperCase())).length;
        const pendingAdjustments = adjustments.filter(item => item.status === 'PENDING').length;
        const unresolvedCorrections = pendingCorrections.filter(item => item.id).length;
        const unresolvedExceptions = openExceptions.filter(item => String((item as any).severity || '').toUpperCase() !== 'RESOLVED').length;
        const currentOpenSessions = openSessions.filter(item => item.id).length;

        const onboardingChecklist = [
            { key: 'identity', label: 'البيانات الأساسية', ok: Boolean(employee.name && employee.role && employee.branchId) },
            { key: 'attendance_code', label: 'كود البصمة', ok: hasAttendanceCode },
            { key: 'system_link', label: 'ربط حساب النظام', ok: hasUserLink },
            { key: 'shift_assignment', label: 'ورديه / شيفت', ok: Boolean(activeShift) },
            { key: 'payroll_assignment', label: 'ملف المرتب', ok: Boolean(activePayrollAssignment) },
            { key: 'salary_setup', label: 'مرتب أو أجر ساعة', ok: hasSalarySetup },
            { key: 'documents', label: 'مستند واحد نشط على الأقل', ok: validDocuments > 0 },
        ];

        const offboardingBlockers = [
            { key: 'open_sessions', label: 'جلسات حضور مفتوحة', count: currentOpenSessions, severity: 'HIGH' },
            { key: 'pending_leaves', label: 'طلبات إجازة معلقة', count: pendingLeaves, severity: 'MEDIUM' },
            { key: 'active_loans', label: 'سلف أو أقساط نشطة', count: activeLoans, severity: 'HIGH' },
            { key: 'pending_adjustments', label: 'جزاءات/مكافآت معلقة', count: pendingAdjustments, severity: 'MEDIUM' },
            { key: 'pending_corrections', label: 'طلبات تعديل حضور معلقة', count: unresolvedCorrections, severity: 'MEDIUM' },
            { key: 'open_exceptions', label: 'استثناءات حضور مفتوحة', count: unresolvedExceptions, severity: 'HIGH' },
            { key: 'expiring_documents', label: 'مستندات تحتاج مراجعة', count: expiringDocuments, severity: 'LOW' },
        ].filter(item => item.count > 0);
        const lifecycleSignals = [
            Number(attendanceProfile?.totals?.lateMinutes || 0) >= 120 ? { key: 'late_minutes', label: 'تأخير متكرر خلال آخر 30 يوم', severity: 'MEDIUM', value: Number(attendanceProfile.totals.lateMinutes || 0) } : null,
            Number(attendanceProfile?.totals?.exceptionSessions || 0) >= 2 ? { key: 'exception_sessions', label: 'جلسات حضور بها مشاكل متكررة', severity: 'HIGH', value: Number(attendanceProfile.totals.exceptionSessions || 0) } : null,
            Number(attendanceProfile?.totals?.openSessions || 0) >= 1 ? { key: 'open_sessions_recent', label: 'لا تزال هناك جلسات غير مكتملة', severity: 'HIGH', value: Number(attendanceProfile.totals.openSessions || 0) } : null,
            Number(attendanceProfile?.totals?.overtimeMinutes || 0) >= 600 ? { key: 'high_overtime', label: 'أوفر تايم مرتفع يحتاج مراجعة', severity: 'LOW', value: Number(attendanceProfile.totals.overtimeMinutes || 0) } : null,
        ].filter(Boolean);

        const onboardingProgress = onboardingChecklist.filter(item => item.ok).length;
        res.json({
            employee: {
                id: employee.id,
                name: employee.name,
                role: employee.role,
                branchId: employee.branchId,
                attendanceCode: employee.attendanceCode,
                employeeCode: employee.employeeCode,
            },
            onboarding: {
                ready: onboardingProgress === onboardingChecklist.length,
                progress: onboardingProgress,
                total: onboardingChecklist.length,
                checklist: onboardingChecklist,
            },
            offboarding: {
                ready: offboardingBlockers.length === 0,
                blockers: offboardingBlockers,
            },
            metrics: {
                activeDocuments: validDocuments,
                leaveBalanceTypes: balances.length,
                pendingLeaves,
                activeLoans,
                openSessions: currentOpenSessions,
                openExceptions: unresolvedExceptions,
            },
            signals: lifecycleSignals,
        });
    } catch (e: any) { res.status(e?.status || 500).json({ error: e.message }); }
});

router.get('/performance-records', async (req: Request, res: Response) => {
    try {
        const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;
        if (employeeId) await loadScopedEmployee(req, employeeId);
        const branchId = resolveScopedBranchId(req, req.query.branchId ? String(req.query.branchId) : undefined) || undefined;
        const records = await db.select().from(managerApprovals)
            .where(branchId ? eq(managerApprovals.branchId, branchId) : undefined)
            .orderBy(desc(managerApprovals.createdAt))
            .limit(200);

        const filtered = records
            .filter(item => ['HR_NOTE', 'HR_WARNING', 'HR_REVIEW', 'HR_PIP'].includes(String(item.actionType || '').toUpperCase()))
            .filter(item => !employeeId || String((item.details as any)?.employeeId || '') === employeeId);

        res.json(filtered.map(item => ({
            ...item,
            title: (item.details as any)?.title || item.reason,
            employeeId: (item.details as any)?.employeeId || null,
            employeeName: (item.details as any)?.employeeName || null,
            status: (item.details as any)?.status || 'OPEN',
            category: (item.details as any)?.category || item.actionType,
            rating: (item.details as any)?.rating ?? null,
            dueDate: (item.details as any)?.dueDate || null,
            noteBody: (item.details as any)?.noteBody || item.reason,
            followUpAction: (item.details as any)?.followUpAction || null,
            acknowledgedAt: (item.details as any)?.acknowledgedAt || null,
        })));
    } catch (e: any) { res.status(e?.status || 500).json({ error: e.message }); }
});

router.post('/performance-records', async (req: Request, res: Response) => {
    try {
        const employeeId = String(req.body.employeeId || '');
        const actionType = String(req.body.actionType || '');
        const title = String(req.body.title || '').trim();
        const noteBody = String(req.body.noteBody || '').trim();
        if (!employeeId || !actionType || !title || !noteBody) {
            return res.status(400).json({ error: 'EMPLOYEE_ACTION_TITLE_AND_NOTE_REQUIRED' });
        }
        const employee = await loadScopedEmployee(req, employeeId);

        const normalizedActionType = ['HR_NOTE', 'HR_WARNING', 'HR_REVIEW', 'HR_PIP'].includes(actionType.toUpperCase())
            ? actionType.toUpperCase()
            : 'HR_NOTE';

        const details = {
            employeeId: employee.id,
            employeeName: employee.name,
            title,
            noteBody,
            status: String(req.body.status || 'OPEN').toUpperCase(),
            category: String(req.body.category || normalizedActionType).toUpperCase(),
            rating: req.body.rating !== undefined ? Number(req.body.rating) : null,
            dueDate: req.body.dueDate || null,
            followUpAction: req.body.followUpAction ? String(req.body.followUpAction) : null,
            createdBy: req.user?.id || 'system',
        };

        const [created] = await db.insert(managerApprovals).output().values({
            managerId: req.user?.id || 'system',
            branchId: employee.branchId,
            actionType: normalizedActionType,
            relatedId: employee.id,
            reason: title,
            details,
            createdAt: new Date(),
        });

        await db.insert(auditLogs).values({
            eventType: `HR_${normalizedActionType}_CREATED`,
            userId: req.user?.id || 'system',
            branchId: employee.branchId,
            reason: title,
            payload: details,
            createdAt: new Date(),
        });

        if (employee.userId) {
            await db.insert(notifications).values({
                userId: employee.userId,
                title: title,
                message: noteBody,
                type: normalizedActionType === 'HR_WARNING' ? 'WARNING' : 'INFO',
                actionUrl: '/hr',
                metadata: { employeeId: employee.id, recordId: created.id, actionType: normalizedActionType },
                createdAt: new Date(),
            });
        }

        res.status(201).json(created);
    } catch (e: any) { res.status(e?.status || 400).json({ error: e.message }); }
});

router.put('/performance-records/:id/status', async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'INVALID_RECORD_ID' });
        const [existing] = await db.select().from(managerApprovals).where(eq(managerApprovals.id, id)).limit(1);
        if (!existing) return res.status(404).json({ error: 'PERFORMANCE_RECORD_NOT_FOUND' });

        const nextStatus = String(req.body.status || '').toUpperCase();
        if (!nextStatus) return res.status(400).json({ error: 'STATUS_REQUIRED' });
        const nextDetails = {
            ...((existing.details as any) || {}),
            status: nextStatus,
            statusNotes: req.body.statusNotes ? String(req.body.statusNotes) : ((existing.details as any)?.statusNotes || null),
            acknowledgedAt: ['ACKNOWLEDGED', 'CLOSED'].includes(nextStatus) ? new Date().toISOString() : ((existing.details as any)?.acknowledgedAt || null),
            updatedBy: req.user?.id || 'system',
        };

        const [updated] = await db.update(managerApprovals)
            .set({ details: nextDetails })
            .output()
            .where(eq(managerApprovals.id, id));

        await db.insert(auditLogs).values({
            eventType: 'HR_PERFORMANCE_STATUS_UPDATED',
            userId: req.user?.id || 'system',
            branchId: existing.branchId,
            reason: `${existing.reason} -> ${nextStatus}`,
            payload: { recordId: id, status: nextStatus, statusNotes: req.body.statusNotes || null },
            createdAt: new Date(),
        });

        res.json(updated);
    } catch (e: any) { res.status(e?.status || 400).json({ error: e.message }); }
});

router.get('/onboarding-records', async (req: Request, res: Response) => {
    try {
        const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;
        if (employeeId) await loadScopedEmployee(req, employeeId);
        const branchId = resolveScopedBranchId(req, req.query.branchId ? String(req.query.branchId) : undefined) || undefined;
        const records = await db.select().from(managerApprovals)
            .where(branchId ? eq(managerApprovals.branchId, branchId) : undefined)
            .orderBy(desc(managerApprovals.createdAt))
            .limit(200);

        const filtered = records
            .filter(item => String(item.actionType || '').toUpperCase() === 'HR_ONBOARD_TASK')
            .filter(item => !employeeId || String((item.details as any)?.employeeId || '') === employeeId);

        res.json(filtered.map(item => ({
            ...item,
            title: (item.details as any)?.title || item.reason,
            employeeId: (item.details as any)?.employeeId || null,
            employeeName: (item.details as any)?.employeeName || null,
            taskType: (item.details as any)?.taskType || 'GENERAL',
            status: (item.details as any)?.status || 'OPEN',
            ownerName: (item.details as any)?.ownerName || null,
            dueDate: (item.details as any)?.dueDate || null,
            resultNotes: (item.details as any)?.resultNotes || null,
        })));
    } catch (e: any) { res.status(e?.status || 500).json({ error: e.message }); }
});

router.post('/onboarding-records', async (req: Request, res: Response) => {
    try {
        const employeeId = String(req.body.employeeId || '');
        const title = String(req.body.title || '').trim();
        if (!employeeId || !title) return res.status(400).json({ error: 'EMPLOYEE_AND_TITLE_REQUIRED' });
        const employee = await loadScopedEmployee(req, employeeId);

        const details = {
            employeeId: employee.id,
            employeeName: employee.name,
            title,
            taskType: String(req.body.taskType || 'GENERAL').toUpperCase(),
            status: String(req.body.status || 'OPEN').toUpperCase(),
            dueDate: req.body.dueDate || null,
            ownerName: req.body.ownerName ? String(req.body.ownerName) : null,
            resultNotes: req.body.resultNotes ? String(req.body.resultNotes) : null,
            createdBy: req.user?.id || 'system',
        };

        const [created] = await db.insert(managerApprovals).output().values({
            managerId: req.user?.id || 'system',
            branchId: employee.branchId,
            actionType: 'HR_ONBOARD_TASK',
            relatedId: employee.id,
            reason: title,
            details,
            createdAt: new Date(),
        });


        await db.insert(auditLogs).values({
            eventType: 'HR_ONBOARD_TASK_CREATED',
            userId: req.user?.id || 'system',
            branchId: employee.branchId,
            reason: title,
            payload: details,
            createdAt: new Date(),
        });

        res.status(201).json(created);
    } catch (e: any) { res.status(e?.status || 400).json({ error: e.message }); }
});

router.put('/onboarding-records/:id/status', async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'INVALID_RECORD_ID' });
        const [existing] = await db.select().from(managerApprovals).where(eq(managerApprovals.id, id)).limit(1);
        if (!existing) return res.status(404).json({ error: 'ONBOARD_RECORD_NOT_FOUND' });

        const nextStatus = String(req.body.status || '').toUpperCase();
        if (!nextStatus) return res.status(400).json({ error: 'STATUS_REQUIRED' });
        const nextDetails = {
            ...((existing.details as any) || {}),
            status: nextStatus,
            resultNotes: req.body.resultNotes ? String(req.body.resultNotes) : ((existing.details as any)?.resultNotes || null),
            completedAt: nextStatus === 'DONE' ? new Date().toISOString() : ((existing.details as any)?.completedAt || null),
            updatedBy: req.user?.id || 'system',
        };

        const [updated] = await db.update(managerApprovals)
            .set({ details: nextDetails })
            .output()
            .where(eq(managerApprovals.id, id));

        await db.insert(auditLogs).values({
            eventType: 'HR_ONBOARD_TASK_STATUS_UPDATED',
            userId: req.user?.id || 'system',
            branchId: existing.branchId,
            reason: `${existing.reason} -> ${nextStatus}`,
            payload: { recordId: id, status: nextStatus, resultNotes: req.body.resultNotes || null },
            createdAt: new Date(),
        });

        res.json(updated);
    } catch (e: any) { res.status(e?.status || 400).json({ error: e.message }); }
});

router.get('/offboarding-records', async (req: Request, res: Response) => {
    try {
        const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;
        if (employeeId) await loadScopedEmployee(req, employeeId);
        const branchId = resolveScopedBranchId(req, req.query.branchId ? String(req.query.branchId) : undefined) || undefined;
        const records = await db.select().from(managerApprovals)
            .where(branchId ? eq(managerApprovals.branchId, branchId) : undefined)
            .orderBy(desc(managerApprovals.createdAt))
            .limit(200);

        const filtered = records
            .filter(item => String(item.actionType || '').toUpperCase() === 'HR_OFFBOARD_TASK')
            .filter(item => !employeeId || String((item.details as any)?.employeeId || '') === employeeId);

        res.json(filtered.map(item => ({
            ...item,
            title: (item.details as any)?.title || item.reason,
            employeeId: (item.details as any)?.employeeId || null,
            employeeName: (item.details as any)?.employeeName || null,
            taskType: (item.details as any)?.taskType || 'GENERAL',
            status: (item.details as any)?.status || 'OPEN',
            ownerName: (item.details as any)?.ownerName || null,
            dueDate: (item.details as any)?.dueDate || null,
            resultNotes: (item.details as any)?.resultNotes || null,
            waivedReason: (item.details as any)?.waivedReason || null,
        })));
    } catch (e: any) { res.status(e?.status || 500).json({ error: e.message }); }
});

router.post('/offboarding-records', async (req: Request, res: Response) => {
    try {
        const employeeId = String(req.body.employeeId || '');
        const title = String(req.body.title || '').trim();
        if (!employeeId || !title) return res.status(400).json({ error: 'EMPLOYEE_AND_TITLE_REQUIRED' });
        const employee = await loadScopedEmployee(req, employeeId);

        const details = {
            employeeId: employee.id,
            employeeName: employee.name,
            title,
            taskType: String(req.body.taskType || 'GENERAL').toUpperCase(),
            status: String(req.body.status || 'OPEN').toUpperCase(),
            dueDate: req.body.dueDate || null,
            ownerName: req.body.ownerName ? String(req.body.ownerName) : null,
            resultNotes: req.body.resultNotes ? String(req.body.resultNotes) : null,
            waivedReason: null,
            createdBy: req.user?.id || 'system',
        };

        const [created] = await db.insert(managerApprovals).output().values({
            managerId: req.user?.id || 'system',
            branchId: employee.branchId,
            actionType: 'HR_OFFBOARD_TASK',
            relatedId: employee.id,
            reason: title,
            details,
            createdAt: new Date(),
        });

        await db.insert(auditLogs).values({
            eventType: 'HR_OFFBOARD_TASK_CREATED',
            userId: req.user?.id || 'system',
            branchId: employee.branchId,
            reason: title,
            payload: details,
            createdAt: new Date(),
        });

        res.status(201).json(created);
    } catch (e: any) { res.status(e?.status || 400).json({ error: e.message }); }
});

router.put('/offboarding-records/:id/status', async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'INVALID_RECORD_ID' });
        const [existing] = await db.select().from(managerApprovals).where(eq(managerApprovals.id, id)).limit(1);
        if (!existing) return res.status(404).json({ error: 'OFFBOARD_RECORD_NOT_FOUND' });

        const nextStatus = String(req.body.status || '').toUpperCase();
        if (!nextStatus) return res.status(400).json({ error: 'STATUS_REQUIRED' });
        const nextDetails = {
            ...((existing.details as any) || {}),
            status: nextStatus,
            resultNotes: req.body.resultNotes ? String(req.body.resultNotes) : ((existing.details as any)?.resultNotes || null),
            waivedReason: nextStatus === 'WAIVED' ? String(req.body.waivedReason || '').trim() || ((existing.details as any)?.waivedReason || null) : ((existing.details as any)?.waivedReason || null),
            completedAt: nextStatus === 'DONE' ? new Date().toISOString() : ((existing.details as any)?.completedAt || null),
            updatedBy: req.user?.id || 'system',
        };

        const [updated] = await db.update(managerApprovals)
            .set({ details: nextDetails })
            .output()
            .where(eq(managerApprovals.id, id));

        await db.insert(auditLogs).values({
            eventType: 'HR_OFFBOARD_TASK_STATUS_UPDATED',
            userId: req.user?.id || 'system',
            branchId: existing.branchId,
            reason: `${existing.reason} -> ${nextStatus}`,
            payload: { recordId: id, status: nextStatus, resultNotes: req.body.resultNotes || null },
            createdAt: new Date(),
        });

        res.json(updated);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.post('/employee-documents', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.upsertEmployeeDocument(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/employee-documents/:id', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.archiveEmployeeDocument(String(req.params.id))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Shift Templates
router.get('/shift-templates', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.getShiftTemplates(req.query.branchId ? String(req.query.branchId) : undefined)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/shift-templates', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.upsertShiftTemplate(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.get('/shift-assignments', async (req: Request, res: Response) => {
    try {
        res.json(await hrExtendedService.getEmployeeShiftAssignments(
            req.query.employeeId ? String(req.query.employeeId) : undefined,
            req.query.branchId ? String(req.query.branchId) : undefined,
        ));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/shift-assignments', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.assignShiftTemplate(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Payroll Profiles
router.get('/payroll-profiles', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.getPayrollProfiles(req.query.branchId ? String(req.query.branchId) : undefined)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/payroll-profiles', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.upsertPayrollProfile(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.get('/payroll-assignments', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.getEmployeePayrollAssignments(req.query.employeeId ? String(req.query.employeeId) : undefined)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/payroll-assignments', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.assignPayrollProfile(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Payroll Components
router.get('/payroll-components', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.getPayrollComponents(req.query.branchId ? String(req.query.branchId) : undefined)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/payroll-components', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.upsertPayrollComponent(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/employee-compensation-items', async (req: Request, res: Response) => {
    try {
        const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;
        if (employeeId) {
            const employee = await loadScopedEmployee(req, employeeId);
            return res.json(await hrExtendedService.getEmployeeCompensationItems({
                employeeId,
                branchId: employee.branchId,
                activeOnly: req.query.activeOnly === 'false' ? false : true,
            }));
        }

        const branchId = resolveScopedBranchId(req, req.query.branchId ? String(req.query.branchId) : undefined) || undefined;
        return res.json(await hrExtendedService.getEmployeeCompensationItems({
            branchId,
            activeOnly: req.query.activeOnly === 'false' ? false : true,
        }));
    } catch (e: any) { res.status(e?.status || 500).json({ error: e.message }); }
});
router.post('/employee-compensation-items', async (req: Request, res: Response) => {
    try {
        const employee = await loadScopedEmployee(req, String(req.body.employeeId));
        res.status(201).json(await hrExtendedService.upsertEmployeeCompensationItem({
            ...req.body,
            employeeId: employee.id,
            branchId: employee.branchId,
        }));
    } catch (e: any) { res.status(e?.status || 400).json({ error: e.message }); }
});
router.delete('/employee-compensation-items/:id', async (req: Request, res: Response) => {
    try {
        const [item] = await db.select().from(employeeCompensationItems).where(eq(employeeCompensationItems.id, String(req.params.id))).limit(1);
        if (!item) return res.status(404).json({ error: 'EMPLOYEE_COMPENSATION_ITEM_NOT_FOUND' });
        assertBranchScope(req, item.branchId);
        res.json(await hrExtendedService.archiveEmployeeCompensationItem(String(req.params.id)));
    } catch (e: any) { res.status(e?.status || 400).json({ error: e.message }); }
});

// Payroll Rules
router.get('/payroll-rules', async (req: Request, res: Response) => {
    try {
        res.json(await hrExtendedService.getPayrollRules(
            req.query.payrollProfileId ? String(req.query.payrollProfileId) : undefined,
            req.query.branchId ? String(req.query.branchId) : undefined,
        ));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/payroll-rules', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.upsertPayrollRule(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Payroll Calculation
router.get('/payroll-cycles', async (req: Request, res: Response) => {
    try {
        const rows = await db.select().from(payrollCycles)
            .where(req.query.branchId ? eq(payrollCycles.branchId, String(req.query.branchId)) : undefined)
            .orderBy(desc(payrollCycles.periodStart));
        res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/payroll-cycles', async (req: Request, res: Response) => {
    try {
        if (!req.body.branchId || !req.body.periodStart || !req.body.periodEnd) {
            return res.status(400).json({ error: 'BRANCH_AND_PERIOD_REQUIRED' });
        }
        const [created] = await db.insert(payrollCycles).output().values({
            id: req.body.id || makeId('CYC'),
            branchId: String(req.body.branchId),
            periodStart: new Date(req.body.periodStart),
            periodEnd: new Date(req.body.periodEnd),
            status: 'DRAFT',
            executedBy: req.user?.id,
        });
        res.status(201).json(created);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.get('/payroll-calculate/:cycleId/preview', async (req: Request, res: Response) => {
    try { res.json(await payrollCalculationService.previewCycle(String(req.params.cycleId))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.post('/payroll-calculate/:cycleId', async (req: Request, res: Response) => {
    try { res.status(201).json(await payrollCalculationService.calculateCycle(String(req.params.cycleId))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.get('/payroll-runs', async (req: Request, res: Response) => {
    try {
        const rows = await db.select().from(payrollRuns)
            .where(req.query.branchId ? eq(payrollRuns.branchId, String(req.query.branchId)) : undefined)
            .orderBy(desc(payrollRuns.createdAt));
        res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Loans / Advances
router.get('/loans', async (req: Request, res: Response) => {
    try {
        res.json(await hrExtendedService.getEmployeeLoans({
            employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
            branchId: req.query.branchId ? String(req.query.branchId) : undefined,
            status: req.query.status ? String(req.query.status) : undefined,
        }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/loans', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.createEmployeeLoan({ ...req.body, requestedBy: req.user?.id || req.body.requestedBy })); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/loans/:id/approve', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.approveEmployeeLoan(String(req.params.id), req.user?.id || 'system', req.body.status || 'APPROVED')); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.get('/loans/:id/installments', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.getLoanInstallments(String(req.params.id))); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Persisted Leave Balances
router.get('/leave-balances', async (req: Request, res: Response) => {
    try {
        res.json(await hrExtendedService.getPersistedLeaveBalances(
            req.query.employeeId ? String(req.query.employeeId) : undefined,
            req.query.year ? Number(req.query.year) : undefined,
        ));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/leave-balances', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.upsertLeaveBalance(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Bonuses / Penalties
router.get('/bonus-penalties', async (req: Request, res: Response) => {
    try {
        res.json(await hrExtendedService.getBonusPenaltyRecords({
            employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
            branchId: req.query.branchId ? String(req.query.branchId) : undefined,
            status: req.query.status ? String(req.query.status) : undefined,
            type: req.query.type ? String(req.query.type) : undefined,
        }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/bonus-penalties', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.createBonusPenaltyRecord({ ...req.body, requestedBy: req.user?.id || req.body.requestedBy })); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/bonus-penalties/:id/approve', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.approveBonusPenaltyRecord(String(req.params.id), req.user?.id || 'system', req.body.status || 'APPROVED')); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Payroll Close
router.get('/payroll-close/locks/:branchId', async (req: Request, res: Response) => {
    try { res.json(await payrollCloseService.getLock(String(req.params.branchId))); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/payroll-close/locks', async (req: Request, res: Response) => {
    try {
        res.status(201).json(await payrollCloseService.setLock({
            branchId: req.body.branchId,
            lockedThrough: new Date(req.body.lockedThrough),
            lockedBy: req.user?.id || req.body.lockedBy,
            reason: req.body.reason,
        }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.get('/payroll-close/:cycleId/preview', async (req: Request, res: Response) => {
    try { res.json(await payrollCloseService.previewCycle(String(req.params.cycleId))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.get('/payroll-compliance/:cycleId/summary', async (req: Request, res: Response) => {
    try { res.json(await payrollComplianceService.getCycleSummary(String(req.params.cycleId), req.query)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.get('/payroll-compliance/:cycleId/export', async (req: Request, res: Response) => {
    try {
        const template = String(req.query.template || 'eta_monthly_private');
        const format = String(req.query.format || 'csv').toLowerCase();
        const exported = await payrollComplianceService.exportCycle(String(req.params.cycleId), template, format, req.query);
        res.setHeader('Content-Type', exported.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
        return res.send(exported.body);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.post('/payroll-close/:cycleId/close', async (req: Request, res: Response) => {
    try {
        res.status(201).json(await payrollCloseService.closeCycle({
            cycleId: String(req.params.cycleId),
            closedBy: req.user?.id || req.body.closedBy,
            notes: req.body.notes,
        }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.post('/payroll-close/:cycleId/reopen', async (req: Request, res: Response) => {
    try {
        const reopenedBy = req.user?.id || req.body.reopenedBy;
        if (!reopenedBy || !req.body.reason) {
            return res.status(400).json({ error: 'REOPEN_REASON_REQUIRED' });
        }
        res.status(201).json(await payrollReopenService.reopenCycle({
            cycleId: String(req.params.cycleId),
            reopenedBy,
            reason: String(req.body.reason),
        }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Scheduling Engine
router.get('/schedules/plans', async (req: Request, res: Response) => {
    try { res.json(await schedulingService.listPlans(req.query.branchId ? String(req.query.branchId) : undefined)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/schedules/plans', async (req: Request, res: Response) => {
    try {
        res.status(201).json(await schedulingService.createPlan({
            branchId: req.body.branchId,
            name: req.body.name,
            weekStart: req.body.weekStart,
            weekEnd: req.body.weekEnd,
            createdBy: req.user?.id || req.body.createdBy,
        }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/schedules/plans/:id', async (req: Request, res: Response) => {
    try {
        res.json(await schedulingService.updatePlan({
            id: String(req.params.id),
            name: req.body.name,
            status: req.body.status,
            approvedBy: req.user?.id || req.body.approvedBy,
        }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.get('/schedules/entries', async (req: Request, res: Response) => {
    try {
        res.json(await schedulingService.listEntries({
            planId: req.query.planId ? String(req.query.planId) : undefined,
            branchId: req.query.branchId ? String(req.query.branchId) : undefined,
            employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
            dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : undefined,
            dateTo: req.query.dateTo ? String(req.query.dateTo) : undefined,
        }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/schedules/entries', async (req: Request, res: Response) => {
    try {
        res.status(201).json(await schedulingService.createEntry(req.body));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/schedules/entries/:id', async (req: Request, res: Response) => {
    try {
        res.json(await schedulingService.updateEntry({
            id: Number(req.params.id),
            shiftTemplateId: req.body.shiftTemplateId,
            startTime: req.body.startTime,
            endTime: req.body.endTime,
            status: req.body.status,
            notes: req.body.notes,
        }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Task & Shift Execution
router.get('/shift-tasks', async (req: Request, res: Response) => {
    try { res.json(await shiftTaskService.listTasks(req.query.branchId ? String(req.query.branchId) : undefined)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/shift-tasks', async (req: Request, res: Response) => {
    try { res.status(201).json(await shiftTaskService.upsertTask(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.get('/shift-task-runs', async (req: Request, res: Response) => {
    try {
        if (!req.query.shiftId) return res.status(400).json({ error: 'SHIFT_ID_REQUIRED' });
        res.json(await shiftTaskService.listTaskRuns(String(req.query.shiftId)));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/shift-task-runs', async (req: Request, res: Response) => {
    try { res.status(201).json(await shiftTaskService.createTaskRun({ shiftId: req.body.shiftId, taskId: req.body.taskId })); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/shift-task-runs/:id/complete', async (req: Request, res: Response) => {
    try {
        const completedBy = req.user?.id || req.body.completedBy;
        if (!completedBy) return res.status(401).json({ error: 'COMPLETED_BY_REQUIRED' });
        res.json(await shiftTaskService.completeTaskRun({
            id: Number(req.params.id),
            completedBy,
            status: req.body.status,
            notes: req.body.notes,
        }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Payslip PDF
router.get('/payslips', async (req: Request, res: Response) => {
    try {
        const runId = req.query.runId ? String(req.query.runId) : undefined;
        const cycleId = req.query.cycleId ? String(req.query.cycleId) : undefined;
        const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;

        const filters = [];

        if (runId) {
            const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1);
            if (!run) return res.status(404).json({ error: 'PAYROLL_RUN_NOT_FOUND' });
            assertBranchScope(req, run.branchId);
            filters.push(eq(payslips.runId, runId));
        }

        if (cycleId) {
            const [cycle] = await db.select().from(payrollCycles).where(eq(payrollCycles.id, cycleId)).limit(1);
            if (!cycle) return res.status(404).json({ error: 'PAYROLL_CYCLE_NOT_FOUND' });
            assertBranchScope(req, cycle.branchId);
            filters.push(eq(payslips.cycleId, cycleId));
        }

        if (employeeId) {
            const employee = await loadScopedEmployee(req, employeeId);
            filters.push(eq(payslips.employeeId, employee.id));
        }

        const rows = await db.select({
            id: payslips.id,
            runId: payslips.runId,
            cycleId: payslips.cycleId,
            employeeId: payslips.employeeId,
            issuedAt: payslips.issuedAt,
            generatedAt: payslips.generatedAt,
            version: payslips.version,
            pdfHash: payslips.pdfHash,
            payload: payslips.payload,
            employeeName: employees.name,
            employeeCode: employees.employeeNumber,
        }).from(payslips)
            .leftJoin(employees, eq(payslips.employeeId, employees.id))
            .where(filters.length ? and(...filters) : undefined)
            .orderBy(desc(payslips.issuedAt));

        res.json(rows);
    } catch (e: any) {
        res.status(e?.status || 500).json({ error: e.message || 'FAILED_TO_LOAD_PAYSLIPS' });
    }
});

router.post('/payslips/:runId/generate', async (req: Request, res: Response) => {
    try {
        const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, String(req.params.runId))).limit(1);
        if (!run) return res.status(404).json({ error: 'PAYROLL_RUN_NOT_FOUND' });
        assertBranchScope(req, run.branchId);
        res.status(201).json(await payslipService.generatePayslips({
            runId: String(req.params.runId),
            generatedBy: req.user?.id || req.body.generatedBy,
        }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/payslips/:id/pdf', async (req: Request, res: Response) => {
    try {
        const { payslip, buffer, filename } = await payslipService.getPayslipPdf(String(req.params.id));
        const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, String(payslip.runId))).limit(1);
        assertBranchScope(req, run?.branchId || null);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (e: any) {
        res.status(e?.message === 'PAYSLIP_NOT_FOUND' ? 404 : 400).json({ error: e.message });
    }
});

// Departments
router.get('/departments', async (_req: Request, res: Response) => {
    try { res.json(await hrExtendedService.getDepartments()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/departments', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.upsertDepartment(req.body, req.user?.id)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/departments/:id', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.deleteDepartment(String(req.params.id))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Job Titles
router.get('/job-titles', async (_req: Request, res: Response) => {
    try { res.json(await hrExtendedService.getJobTitles()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/job-titles', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.upsertJobTitle(req.body, req.user?.id)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/job-titles/:id', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.deleteJobTitle(String(req.params.id))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Leave Types
router.get('/leave-types', async (_req: Request, res: Response) => {
    try { res.json(await hrExtendedService.getLeaveTypes()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Leave Requests
router.get('/leave-requests', async (req: Request, res: Response) => {
    try {
        res.json(await hrExtendedService.getLeaveRequests({
            employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
            status: req.query.status ? String(req.query.status) : undefined,
            branchId: req.query.branchId ? String(req.query.branchId) : undefined,
            startDate: req.query.startDate ? String(req.query.startDate) : undefined,
            endDate: req.query.endDate ? String(req.query.endDate) : undefined,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
        }));
    } catch (e: any) {
        console.error('[hr-extended/leave-requests] failed', {
            employeeId: req.query.employeeId,
            status: req.query.status,
            branchId: req.query.branchId,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            limit: req.query.limit,
            error: e?.message,
        });
        res.status(500).json({ error: e.message });
    }
});
router.post('/leave-requests', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.createLeaveRequest(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/leave-requests/:id/approve', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.approveLeaveRequest(String(req.params.id), req.user?.id || 'system')); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/leave-requests/:id/reject', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.rejectLeaveRequest(String(req.params.id), req.user?.id || 'system', req.body.reason || '')); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Leave Balance
router.get('/leave-balance/:employeeId', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.getAllBalances(String(req.params.employeeId))); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Overtime
router.get('/overtime', async (req: Request, res: Response) => {
    try {
        res.json(await hrExtendedService.getOvertimeEntries({
            employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
            status: req.query.status ? String(req.query.status) : undefined,
            month: req.query.month ? String(req.query.month) : undefined,
        }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/overtime', async (req: Request, res: Response) => {
    try { res.status(201).json(await hrExtendedService.recordOvertime(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.put('/overtime/:id/approve', async (req: Request, res: Response) => {
    try { res.json(await hrExtendedService.approveOvertime(String(req.params.id), req.user?.id || 'system')); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
