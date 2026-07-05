import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Activity,
    AlertTriangle,
    CalendarDays,
    CheckCircle,
    Clock,
    FileWarning,
    Fingerprint,
    Link,
    RefreshCw,
    Search,
    ShieldAlert,
    Sparkles,
    UserCheck,
    Plus,
    Download,
    XCircle,
    ChevronLeft,
    PanelTop,
    ClipboardList,
} from 'lucide-react';
import { apiRequest, apiRequestBlob } from '../../../../services/api/core';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/useAuthStore';
import { translations } from '../../../../services/translations';

type AttendanceException = {
    id: string;
    branchId: string;
    employeeId?: string | null;
    rawLogId?: string | null;
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
    title: string;
    details?: string | null;
    metadata?: {
        deviceId?: string;
        deviceUserId?: string;
        employeeIdentifier?: string;
        [key: string]: any;
    } | null;
    createdAt?: string;
};

type Employee = {
    id: string;
    name: string;
    nameAr?: string;
    role?: string;
    employeeCode?: string;
    attendanceCode?: string;
    branchId: string;
};

type UnknownGroup = {
    key: string;
    deviceId: string;
    deviceUserId: string;
    branchId: string;
    count: number;
    severity: string;
    latestAt?: string;
    exceptionIds: string[];
    samples: AttendanceException[];
};

type QuickEmployeeDraft = {
    name: string;
    code: string;
    role: string;
};

type Device = {
    id: string;
    name: string;
    branchId: string;
    code?: string;
};

type HrReadinessAction = {
    key: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    details: string;
    count: number;
    routeHint?: string;
};

type HrReadiness = {
    branchId: string | null;
    period: { startDate: string; endDate: string };
    readinessScore: number;
    canClosePayroll: boolean;
    status: 'READY' | 'NEEDS_REVIEW' | 'NOT_READY' | string;
    totals: Record<string, number>;
    actions: HrReadinessAction[];
    samples?: Record<string, any[]>;
};

type ExceptionQueueSummary = {
    total: number;
    rows: Array<{ type: string; severity: string; count: number; latestAt?: string }>;
};

const api = {
    get: <T,>(url: string) => apiRequest<T>(url.replace(/^\/api(?=\/|$)/, '')),
    post: <T,>(url: string, data: any) => apiRequest<T>(url.replace(/^\/api(?=\/|$)/, ''), { method: 'POST', body: JSON.stringify(data) }),
    put: <T,>(url: string, data: any) => apiRequest<T>(url.replace(/^\/api(?=\/|$)/, ''), { method: 'PUT', body: JSON.stringify(data) }),
};

const severityRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const getUnknownIdentifier = (exception: AttendanceException) => {
    const fromMeta = exception.metadata?.deviceUserId || exception.metadata?.employeeIdentifier;
    if (fromMeta) return String(fromMeta);
    const match = String(exception.details || '').match(/for\s+(.+)$/i);
    return match?.[1]?.trim() || 'unknown';
};

const getSeverityLabel = (severity: string, t: any) => {
    if (severity === 'CRITICAL') return t.att_severity_critical;
    if (severity === 'HIGH') return t.att_severity_high;
    if (severity === 'MEDIUM') return t.att_severity_medium;
    return t.att_severity_low;
};

const normalizeCode = (value?: string | null) => String(value || '').trim().toLowerCase();

const employeeMatchesDeviceUser = (employee: Employee, deviceUserId: string) => {
    const deviceCode = normalizeCode(deviceUserId);
    return Boolean(deviceCode) && [
        employee.attendanceCode,
        employee.employeeCode,
        employee.id,
    ].some(value => normalizeCode(value) === deviceCode);
};

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};

const escapeHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const normalizeReportStatus = (status?: string | null) => {
    const value = String(status || '').toUpperCase();
    if (value === 'LEAVE') return 'إجازة';
    if (value === 'REST_DAY') return 'راحة أسبوعية';
    if (value === 'ABSENT' || value === 'NO_PUNCH') return 'غياب';
    if (value === 'CLOSED' || value === 'COMPLETED') return 'مكتملة';
    if (value === 'OPEN' || value === 'IN_PROGRESS') return 'مفتوحة';
    if (value === 'EXCEPTION') return 'تحتاج مراجعة';
    return value || '-';
};

const getReportDate = (value?: string | Date | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatReportDatePart = (value?: string | Date | null, lang: 'en' | 'ar' = 'ar') => {
    const date = getReportDate(value);
    if (!date) return '-';
    return date.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
};

const formatReportTimePart = (value?: string | Date | null, lang: 'en' | 'ar' = 'ar') => {
    const date = getReportDate(value);
    if (!date) return '-';
    return date.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
    });
};

const formatReportDateTime = (value?: string | Date | null, lang: 'en' | 'ar' = 'ar') => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const parseLocalDateKey = (value?: string | null) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
};

const toLocalDateKey = (value?: string | Date | null) => {
    const date = getReportDate(value);
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const buildDateColumns = (startKey: string, endKey: string, lang: 'en' | 'ar') => {
    const start = parseLocalDateKey(startKey);
    const end = parseLocalDateKey(endKey);
    if (!start || !end) return [];
    const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
    const columns: Array<{ key: string; label: string; weekday: string; shortDate: string }> = [];
    const cursor = new Date(start);
    const limit = new Date(end);
    while (cursor.getTime() <= limit.getTime() && columns.length < 62) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        columns.push({
            key,
            label: cursor.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }),
            weekday: cursor.toLocaleDateString(locale, { weekday: 'short' }),
            shortDate: cursor.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    return columns;
};

const numericReportValue = (value: unknown) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const sessionTone = (status?: string) => {
    if (status === 'CLOSED') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    if (status === 'OPEN') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
};

const toDateTimeLocalValue = (value?: string | Date | null) => {
    const date = value ? new Date(value) : new Date();
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const offsetMs = safeDate.getTimezoneOffset() * 60000;
    return new Date(safeDate.getTime() - offsetMs).toISOString().slice(0, 16);
};

const minutesLabel = (value?: number | string | null) => {
    const total = Math.max(0, Number(value || 0));
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    if (!hours) return `${minutes}د`;
    return `${hours}س ${minutes}د`;
};

const filterTone = (key: string) => {
    if (key === 'unknown') return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    if (key === 'readiness') return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    if (key === 'employee') return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    if (key === 'manual') return 'bg-violet-500/10 text-violet-600 border-violet-500/20';
    if (key === 'monitor') return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    return 'bg-slate-500/10 text-slate-600 border-slate-500/20';
};

const metricTextTone = (minutes?: number | null, kind: 'late' | 'early' | 'overtime' = 'late') => {
    if (!minutes || minutes <= 0) return 'text-slate-500';
    if (kind === 'overtime') return 'text-violet-600';
    if (kind === 'early') return 'text-blue-600';
    return 'text-rose-600';
};

export default function AttendanceManager() {
    const { settings, branches } = useAuthStore();
    const lang = (settings?.language || 'en') as 'en' | 'ar';
    const t = (translations as any)[lang] || translations['en'];
    const [exceptions, setExceptions] = useState<AttendanceException[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unknown' | 'other' | 'daily' | 'manual' | 'employee' | 'tools' | 'monitor' | 'readiness'>('unknown');
    const [search, setSearch] = useState('');
    const [selectedEmployees, setSelectedEmployees] = useState<Record<string, string>>({});
    const [quickEmployees, setQuickEmployees] = useState<Record<string, QuickEmployeeDraft>>({});
    const [quickCreateOpen, setQuickCreateOpen] = useState<Record<string, boolean>>({});
    const [busyGroup, setBusyGroup] = useState<string | null>(null);
    const todayDate = new Date().toISOString().slice(0, 10);
    const [dailyStartDate, setDailyStartDate] = useState(todayDate);
    const [dailyEndDate, setDailyEndDate] = useState(todayDate);
    const [dailyRecords, setDailyRecords] = useState<any[]>([]);
    const [dailyLeaveRequests, setDailyLeaveRequests] = useState<any[]>([]);
    const [loadingDaily, setLoadingDaily] = useState(false);
    const [dailyBranchFilter, setDailyBranchFilter] = useState<string>('ALL');
    const [dailyEmployeeFilter, setDailyEmployeeFilter] = useState<string>('ALL');
    const [dailySearchQuery, setDailySearchQuery] = useState('');
    const deferredDailySearchQuery = useDeferredValue(dailySearchQuery);
    const [dailyViewMode, setDailyViewMode] = useState<'cards' | 'table'>('cards');
    const [manualPunch, setManualPunch] = useState({
        employeeId: '',
        eventType: 'IN',
        occurredAt: new Date().toISOString().slice(0, 16),
        reason: '',
        deviceId: '',
    });
    const [submittingManual, setSubmittingManual] = useState(false);
    const [profileEmployeeId, setProfileEmployeeId] = useState('');
    const [profileStart, setProfileStart] = useState('');
    const [profileEnd, setProfileEnd] = useState('');
    const [employeeProfile, setEmployeeProfile] = useState<any>(null);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [profilePunchDraft, setProfilePunchDraft] = useState<{
        sessionId?: string;
        eventType: 'IN' | 'OUT' | 'UNKNOWN';
        occurredAt: string;
        reason: string;
        deviceId: string;
    } | null>(null);
    const [savingProfilePunch, setSavingProfilePunch] = useState(false);
    const [recalcForm, setRecalcForm] = useState({ startDate: '', endDate: '', employeeId: '' });
    const [reportForm, setReportForm] = useState({ startDate: '', endDate: '', employeeId: '' });
    const [recalculating, setRecalculating] = useState(false);
    const [monthlyCloseStartDate, setMonthlyCloseStartDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    });
    const [monthlyCloseEndDate, setMonthlyCloseEndDate] = useState(new Date().toISOString().slice(0, 10));
    const [monthlyClosing, setMonthlyClosing] = useState(false);
    const [bridgeMonitor, setBridgeMonitor] = useState<any>(null);
    const [loadingMonitor, setLoadingMonitor] = useState(false);
    const [readiness, setReadiness] = useState<HrReadiness | null>(null);
    const [loadingReadiness, setLoadingReadiness] = useState(false);
    const [exceptionSummary, setExceptionSummary] = useState<ExceptionQueueSummary | null>(null);
    const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
    const [expandedOtherGroup, setExpandedOtherGroup] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [employeeList, deviceList] = await Promise.all([
                api.get<Employee[]>('/api/hr/employees'),
                api.get<Device[]>('/api/attendance-ops/devices'),
            ]);

            const autoResolved = await api.post<any>('/api/attendance-ops/devices/mappings/auto-resolve-unknown', {
                branchId: settings.activeBranchId || undefined,
                limit: 500,
            }).catch(() => null);
            if (autoResolved?.resolvedGroups > 0) {
                toast.success(`تم حل ${autoResolved.resolvedGroups} مجموعة تلقائيا وإعادة معالجة ${autoResolved.reprocessed || 0} سجل`);
            }

            const [queue, queueSummary] = await Promise.all([
                api.get<AttendanceException[]>('/api/attendance-ops/exceptions/queue?limit=800'),
                api.get<ExceptionQueueSummary>('/api/attendance-ops/exceptions/queue-summary'),
            ]);
            setExceptions(queue || []);
            setExceptionSummary(queueSummary || null);
            setEmployees(employeeList || []);
            setDevices(deviceList || []);
        } catch (error: any) {
            toast.error(error.message || 'تعذر تحميل بيانات الحضور');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadDailyLog = async (startDate = dailyStartDate, endDate = dailyEndDate) => {
        if (!startDate || !endDate) {
            setDailyRecords([]);
            return;
        }
        const [rangeStart, rangeEnd] = [startDate, endDate].sort();
        setLoadingDaily(true);
        try {
            const params = new URLSearchParams();
            params.set('startDate', rangeStart);
            params.set('endDate', rangeEnd);
            if (dailyBranchFilter !== 'ALL') params.set('branchId', dailyBranchFilter);
            if (dailyEmployeeFilter !== 'ALL') params.set('employeeId', dailyEmployeeFilter);
            const [sessions, approvedLeaves] = await Promise.all([
                api.get<any[]>(`/api/attendance-ops/sessions?${params.toString()}`),
                api.get<any[]>(`/api/hr-extended/leave-requests?${new URLSearchParams({
                    status: 'APPROVED',
                    startDate: rangeStart,
                    endDate: rangeEnd,
                    ...(dailyBranchFilter !== 'ALL' ? { branchId: dailyBranchFilter } : {}),
                    ...(dailyEmployeeFilter !== 'ALL' ? { employeeId: dailyEmployeeFilter } : {}),
                    limit: '500',
                }).toString()}`).catch(() => []),
            ]);
            setDailyRecords(sessions || []);
            setDailyLeaveRequests(approvedLeaves || []);
        } catch { setDailyRecords([]); setDailyLeaveRequests([]); }
        finally { setLoadingDaily(false); }
    };

    const branchNameById = useMemo(() => {
        const map = new Map<string, string>();
        (branches || []).forEach((branch: any) => {
            if (branch?.id) map.set(String(branch.id), branch.nameAr || branch.name || String(branch.id));
        });
        (devices || []).forEach((device) => {
            if (device.branchId && !map.has(device.branchId)) map.set(device.branchId, device.branchId);
        });
        (employees || []).forEach((employee) => {
            if (employee.branchId && !map.has(employee.branchId)) map.set(employee.branchId, employee.branchId);
        });
        return map;
    }, [branches, devices, employees]);

    const dailyBranchOptions = useMemo(() => {
        const ids = new Set<string>();
        dailyRecords.forEach((record: any) => {
            if (record.branchId) ids.add(String(record.branchId));
        });
        employees.forEach((employee) => {
            if (employee.branchId) ids.add(String(employee.branchId));
        });
        return Array.from(ids).map((id) => ({
            id,
            name: branchNameById.get(id) || id,
        })).sort((a, b) => a.name.localeCompare(b.name));
    }, [dailyRecords, employees, branchNameById]);

    const dailyEmployeeOptions = useMemo(() => {
        const branchScoped = dailyBranchFilter === 'ALL'
            ? employees
            : employees.filter(employee => employee.branchId === dailyBranchFilter);
        return branchScoped
            .map(employee => ({
                id: employee.id,
                name: employee.nameAr || employee.name,
                branchId: employee.branchId,
                employeeCode: employee.employeeCode || employee.attendanceCode || '',
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [employees, dailyBranchFilter]);

    const visibleDailyRecords = useMemo(() => {
        const query = deferredDailySearchQuery.trim().toLowerCase();
        return dailyRecords.filter((record: any) => {
            if (dailyBranchFilter !== 'ALL' && String(record.branchId || '') !== dailyBranchFilter) return false;
            if (dailyEmployeeFilter !== 'ALL' && String(record.employeeId || '') !== dailyEmployeeFilter) return false;
            if (query) {
                const employee = employeeById.get(record.employeeId);
                const searchable = [
                    employee?.name,
                    employee?.nameAr,
                    employee?.employeeCode,
                    employee?.attendanceCode,
                    record.employeeId,
                ]
                    .filter(Boolean)
                    .map(value => String(value).toLowerCase());
                if (!searchable.some(value => value.includes(query))) return false;
            }
            return true;
        });
    }, [dailyRecords, dailyBranchFilter, dailyEmployeeFilter, deferredDailySearchQuery, employeeById]);

    const dailySummary = useMemo(() => {
        return visibleDailyRecords.reduce((acc, record: any) => {
            const clockOut = record.clockOutAt || record.clockOut;
            const totalHours = Number(record.totalHours || 0);
            acc.total += 1;
            if (clockOut) acc.completed += 1;
            else acc.open += 1;
            acc.hours += totalHours;
            acc.late += Number(record.lateMinutes || 0);
            acc.overtime += Number(record.overtimeMinutes || 0);
            return acc;
        }, { total: 0, completed: 0, open: 0, hours: 0, late: 0, overtime: 0 });
    }, [visibleDailyRecords]);

    const futureDailyRecords = useMemo(() => {
        const now = Date.now();
        const graceMs = 5 * 60 * 1000;
        return visibleDailyRecords
            .map((record: any) => {
                const clockIn = record.clockInAt || record.clockIn;
                const clockOut = record.clockOutAt || record.clockOut;
                const clockInTime = clockIn ? new Date(clockIn).getTime() : 0;
                const clockOutTime = clockOut ? new Date(clockOut).getTime() : 0;
                const futureTime = Math.max(clockInTime, clockOutTime);
                return { record, futureTime };
            })
            .filter(item => Number.isFinite(item.futureTime) && item.futureTime > now + graceMs)
            .sort((a, b) => b.futureTime - a.futureTime);
    }, [visibleDailyRecords]);

    const [dailyRangeStart, dailyRangeEnd] = [dailyStartDate, dailyEndDate].sort();
    const dailyRangeLabel = dailyRangeStart === dailyRangeEnd ? dailyRangeStart : `${dailyRangeStart}_${dailyRangeEnd}`;

    const dailyDateColumns = useMemo(() => buildDateColumns(dailyRangeStart, dailyRangeEnd, lang), [dailyRangeStart, dailyRangeEnd, lang]);

    const groupedDailyRecords = useMemo(() => {
        const query = deferredDailySearchQuery.trim().toLowerCase();
        const groups = new Map<string, any>();
        const findApprovedLeaveForDay = (employeeId: string, dayKey: string) => {
            const day = parseLocalDateKey(dayKey);
            if (!day) return null;
            day.setHours(12, 0, 0, 0);
            return dailyLeaveRequests.find((leave: any) => {
                if (String(leave.employeeId || '') !== String(employeeId)) return false;
                const start = getReportDate(leave.startDate);
                const end = getReportDate(leave.endDate);
                if (!start || !end) return false;
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                return day >= start && day <= end;
            }) || null;
        };
        const makeEmptyDayMap = (employeeId: string) => {
            const dayMap = new Map<string, any>();
            dailyDateColumns.forEach((column) => {
                const leave = findApprovedLeaveForDay(employeeId, column.key);
                dayMap.set(column.key, {
                    id: `${employeeId}-${column.key}`,
                    dayKey: column.key,
                    dayLabel: column.label,
                    clockIn: null,
                    clockOut: null,
                    totalHours: 0,
                    lateMinutes: 0,
                    earlyLeaveMinutes: 0,
                    overtimeMinutes: 0,
                    status: leave ? 'leave' : 'absent',
                    leaveName: leave?.leaveTypeNameAr || leave?.leaveTypeName || leave?.leaveTypeId || null,
                    isPaidLeave: leave?.isPaid !== false,
                });
            });
            return dayMap;
        };

        const employeePool = dailyEmployeeFilter === 'ALL'
            ? dailyEmployeeOptions
            : dailyEmployeeOptions.filter(employee => employee.id === dailyEmployeeFilter);

        employeePool.forEach((employee: any) => {
            const searchable = [employee.name, employee.employeeCode, employee.attendanceCode, employee.role]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            if (query && !searchable.includes(query)) return;
            const key = String(employee.id);
            groups.set(key, {
                employeeId: employee.id,
                employeeName: employee.name,
                employeeCode: employee.employeeCode || employee.attendanceCode || employee.id,
                role: employee.role || 'موظف',
                branchName: branchNameById.get(String(employee.branchId || '')) || employee.branchId || '-',
                dayMap: makeEmptyDayMap(key),
                hasRecords: false,
            });
        });

        visibleDailyRecords.forEach((record: any) => {
            const employee = employeeById.get(record.employeeId);
            const clockIn = record.clockInAt || record.clockIn;
            const clockOut = record.clockOutAt || record.clockOut;
            const dayKey = toLocalDateKey(clockIn);
            const column = dailyDateColumns.find(item => item.key === dayKey);
            if (!dayKey || !column) return;
            const key = String(record.employeeId || employee?.id || dayKey);
            if (!groups.has(key)) {
                groups.set(key, {
                    employeeId: record.employeeId,
                    employeeName: employee?.nameAr || employee?.name || record.employeeId,
                    employeeCode: employee?.employeeCode || employee?.attendanceCode || record.employeeId,
                    role: employee?.role || 'موظف',
                    branchName: record.branchName || branchNameById.get(String(record.branchId || '')) || record.branchId || '-',
                    dayMap: makeEmptyDayMap(key),
                    hasRecords: true,
                });
            }
            const group = groups.get(key);
            const previous = group.dayMap.get(dayKey);
            const previousWasAbsent = !previous || previous.status === 'absent';
            const totalHours = Number(record.totalHours || 0);
            const isClosed = Boolean(clockOut);
            const mergedClockIn = previous?.clockIn && clockIn
                ? (new Date(previous.clockIn).getTime() <= new Date(clockIn).getTime() ? previous.clockIn : clockIn)
                : (previous?.clockIn || clockIn);
            const mergedClockOut = previous?.clockOut && clockOut
                ? (new Date(previous.clockOut).getTime() >= new Date(clockOut).getTime() ? previous.clockOut : clockOut)
                : (previous?.clockOut || clockOut);
            group.dayMap.set(dayKey, {
                id: record.id || `${key}-${dayKey}`,
                dayKey,
                dayLabel: column.label,
                clockIn: mergedClockIn,
                clockOut: mergedClockOut,
                totalHours: (previousWasAbsent ? 0 : Number(previous?.totalHours || 0)) + totalHours,
                lateMinutes: (previousWasAbsent ? 0 : Number(previous?.lateMinutes || 0)) + Number(record.lateMinutes || 0),
                earlyLeaveMinutes: (previousWasAbsent ? 0 : Number(previous?.earlyLeaveMinutes || 0)) + Number(record.earlyLeaveMinutes || 0),
                overtimeMinutes: (previousWasAbsent ? 0 : Number(previous?.overtimeMinutes || 0)) + Number(record.overtimeMinutes || 0),
                status: isClosed ? 'completed' : 'in_progress',
            });
            group.hasRecords = true;
        });

        return Array.from(groups.values())
            .map((group: any) => {
                const days = dailyDateColumns.map(column => group.dayMap.get(column.key)).filter(Boolean);
                return {
                    ...group,
                    days,
                    totalHours: days.reduce((sum: number, day: any) => sum + Number(day.totalHours || 0), 0),
                    completed: days.filter((day: any) => day.status === 'completed').length,
                    open: days.filter((day: any) => day.status === 'in_progress').length,
                    leave: days.filter((day: any) => day.status === 'leave').length,
                    absent: days.filter((day: any) => day.status === 'absent').length,
                    lateMinutes: days.reduce((sum: number, day: any) => sum + Number(day.lateMinutes || 0), 0),
                    earlyLeaveMinutes: days.reduce((sum: number, day: any) => sum + Number(day.earlyLeaveMinutes || 0), 0),
                    overtimeMinutes: days.reduce((sum: number, day: any) => sum + Number(day.overtimeMinutes || 0), 0),
                };
            })
            .sort((a: any, b: any) => a.employeeName.localeCompare(b.employeeName));
    }, [visibleDailyRecords, employeeById, branchNameById, dailyEmployeeOptions, dailyEmployeeFilter, deferredDailySearchQuery, dailyDateColumns, dailyLeaveRequests]);
    useEffect(() => {
        if (filter === 'daily') loadDailyLog(dailyStartDate, dailyEndDate);
        if (filter === 'monitor') loadBridgeMonitor();
        if (filter === 'readiness') loadHrReadiness();
    }, [filter, dailyStartDate, dailyEndDate, dailyBranchFilter, dailyEmployeeFilter, settings.activeBranchId]);

    const loadBridgeMonitor = async () => {
        setLoadingMonitor(true);
        try {
            const params = new URLSearchParams();
            if (settings.activeBranchId) params.set('branchId', settings.activeBranchId);
            const data = await api.get<any>(`/api/attendance-ops/bridge-monitor?${params.toString()}`);
            setBridgeMonitor(data);
        } catch {
            setBridgeMonitor(null);
        } finally {
            setLoadingMonitor(false);
        }
    };

    const loadHrReadiness = async () => {
        setLoadingReadiness(true);
        try {
            const params = new URLSearchParams();
            if (settings.activeBranchId) params.set('branchId', settings.activeBranchId);
            params.set('startDate', monthlyCloseStartDate);
            params.set('endDate', monthlyCloseEndDate);
            const data = await api.get<HrReadiness>(`/api/attendance-ops/hr-readiness?${params.toString()}`);
            setReadiness(data);
        } catch (error: any) {
            toast.error(error.message || 'تعذر تحميل جاهزية الموارد البشرية');
            setReadiness(null);
        } finally {
            setLoadingReadiness(false);
        }
    };

    const recalculateAttendance = async () => {
        setRecalculating(true);
        try {
            const result = await api.post<any>('/api/attendance-ops/recalculate-sessions', {
                branchId: settings.activeBranchId || undefined,
                employeeId: recalcForm.employeeId || undefined,
                startDate: recalcForm.startDate || undefined,
                endDate: recalcForm.endDate || undefined,
                limit: 5000,
            });
            toast.success(`تم تحديث ${result?.updated || 0} سجل`);
            if (filter === 'daily') await loadDailyLog();
            if (profileEmployeeId) await loadEmployeeProfile(profileEmployeeId);
        } catch (error: any) {
            toast.error(error.message || 'تعذر إعادة حساب الحضور');
        } finally {
            setRecalculating(false);
        }
    };

    const getReportParams = () => {
        const params = new URLSearchParams();
        if (settings.activeBranchId) params.set('branchId', settings.activeBranchId);
        if (reportForm.employeeId) params.set('employeeId', reportForm.employeeId);
        if (reportForm.startDate) params.set('startDate', reportForm.startDate);
        if (reportForm.endDate) params.set('endDate', reportForm.endDate);
        return params;
    };

    const getDailyExportParams = () => {
        const params = new URLSearchParams();
        const [rangeStart, rangeEnd] = [dailyStartDate, dailyEndDate].sort();
        if (dailyBranchFilter !== 'ALL') params.set('branchId', dailyBranchFilter);
        if (dailyEmployeeFilter !== 'ALL') params.set('employeeId', dailyEmployeeFilter);
        params.set('startDate', rangeStart);
        params.set('endDate', rangeEnd);
        return params;
    };

    const exportAttendanceCsv = async () => {
        try {
            const blob = await apiRequestBlob(`/attendance-ops/reports/attendance.csv?${getReportParams().toString()}`);
            downloadBlob(blob, `hr_attendance_${reportForm.startDate || 'all'}_${reportForm.endDate || 'all'}.csv`);
            toast.success('تم تصدير التقرير');
        } catch (error: any) {
            toast.error(error.message || 'تعذر تصدير التقرير');
        }
    };

    const exportAttendancePdf = async () => {
        try {
            const params = getReportParams();
            params.set('lang', lang);
            window.open(`/api/attendance-ops/reports/attendance.pdf?${params.toString()}`, '_blank', 'noopener,noreferrer');
            toast.success('بدأ تجهيز ملف PDF');
        } catch (error: any) {
            toast.error(error.message || 'تعذر تصدير PDF');
        }
    };

    const exportAttendanceExcel = async () => {
        try {
            const params = getReportParams();
            params.set('lang', lang);
            window.location.href = `/api/attendance-ops/reports/attendance.xlsx?${params.toString()}`;
            toast.success('بدأ تجهيز ملف Excel');
        } catch (error: any) {
            toast.error(error.message || 'تعذر تصدير Excel');
        }
    };

    const exportDailyExcel = async () => {
        try {
            const params = getDailyExportParams();
            params.set('lang', lang);
            window.location.href = `/api/attendance-ops/reports/attendance.xlsx?${params.toString()}`;
            toast.success('بدأ تجهيز ملف Excel للفترة');
        } catch (error: any) {
            toast.error(error.message || 'تعذر تصدير فترة الحضور إلى Excel');
        }
    };
    const exportDailyPdf = async () => {
        try {
            const params = getDailyExportParams();
            params.set('lang', lang);
            window.open(`/api/attendance-ops/reports/attendance.pdf?${params.toString()}`, '_blank', 'noopener,noreferrer');
            toast.success('بدأ تجهيز ملف PDF للفترة');
        } catch (error: any) {
            toast.error(error.message || 'تعذر تصدير فترة الحضور إلى PDF');
        }
    };

    const rebuildSmartDays = async () => {
        setRecalculating(true);
        try {
            const result = await api.post<any>('/api/attendance-ops/rebuild-smart-days', {
                branchId: settings.activeBranchId || undefined,
                employeeId: recalcForm.employeeId || undefined,
                startDate: recalcForm.startDate || undefined,
                endDate: recalcForm.endDate || undefined,
                limit: 10000,
            });
            toast.success(`تمت معالجة ${result?.processedDays || 0} يوم بالمنطق الذكي`);
            if (filter === 'daily') await loadDailyLog();
            if (profileEmployeeId) await loadEmployeeProfile(profileEmployeeId);
        } catch (error: any) {
            toast.error(error.message || 'تعذرت المعالجة الذكية للفترة');
        } finally {
            setRecalculating(false);
        }
    };

    const rebuildDailySmartRange = async () => {
        setRecalculating(true);
        try {
            const result = await api.post<any>('/api/attendance-ops/rebuild-smart-days', {
                branchId: dailyBranchFilter !== 'ALL' ? dailyBranchFilter : settings.activeBranchId || undefined,
                employeeId: dailyEmployeeFilter !== 'ALL' ? dailyEmployeeFilter : undefined,
                startDate: dailyRangeStart,
                endDate: dailyRangeEnd,
                limit: 10000,
            });
            toast.success(`تمت معالجة الفترة الذكية لعدد ${result?.processedDays || 0} يوم`);
            await loadDailyLog();
            if (profileEmployeeId) await loadEmployeeProfile(profileEmployeeId);
        } catch (error: any) {
            toast.error(error.message || 'تعذرت معالجة الفترة الذكية');
        } finally {
            setRecalculating(false);
        }
    };

    const monthlyCloseAttendance = async () => {
        if (!settings.activeBranchId) return toast.error('اختر الفرع قبل إغلاق الفترة');
        if (!monthlyCloseStartDate || !monthlyCloseEndDate) return toast.error('حدد بداية ونهاية الفترة');
        if (new Date(monthlyCloseStartDate) > new Date(monthlyCloseEndDate)) return toast.error('بداية الفترة يجب أن تكون قبل النهاية');
        setMonthlyClosing(true);
        try {
            await api.post<any>('/api/attendance-ops/monthly-close', {
                branchId: settings.activeBranchId,
                startDate: monthlyCloseStartDate,
                endDate: monthlyCloseEndDate,
                includePayrollPreview: true,
            });
            toast.success(`تم إغلاق الفترة من ${monthlyCloseStartDate} إلى ${monthlyCloseEndDate} بنجاح`);
            if (filter === 'daily') await loadDailyLog();
            if (profileEmployeeId) await loadEmployeeProfile(profileEmployeeId);
            await loadData();
        } catch (error: any) {
            toast.error(error.message || 'تعذر إغلاق الفترة');
        } finally {
            setMonthlyClosing(false);
        }
    };

    const submitManualPunch = async () => {
        if (!manualPunch.employeeId) return toast.error('اختر الموظف');
        if (!manualPunch.occurredAt) return toast.error('حدد وقت البصمة');
        if (!manualPunch.reason.trim()) return toast.error('اكتب سبب الإضافة اليدوية');
        const employee = employees.find(emp => emp.id === manualPunch.employeeId);
        setSubmittingManual(true);
        try {
            await api.post('/api/attendance-ops/manual-punch', {
                employeeId: manualPunch.employeeId,
                branchId: employee?.branchId || settings.activeBranchId,
                eventType: manualPunch.eventType,
                occurredAt: new Date(manualPunch.occurredAt).toISOString(),
                reason: manualPunch.reason.trim(),
                deviceId: manualPunch.deviceId || undefined,
            });
            toast.success('تم حفظ البصمة اليدوية ومعالجتها');
            setManualPunch(prev => ({ ...prev, reason: '', occurredAt: new Date().toISOString().slice(0, 16) }));
            await loadData();
            if (filter === 'daily') await loadDailyLog();
        } catch (error: any) {
            toast.error(error.message || 'تعذر حفظ البصمة اليدوية');
        } finally {
            setSubmittingManual(false);
        }
    };

    const loadEmployeeProfile = async (employeeId = profileEmployeeId) => {
        if (!employeeId) return toast.error('اختر الموظف');
        setProfileEmployeeId(employeeId);
        setLoadingProfile(true);
        try {
            const params = new URLSearchParams();
            if (profileStart) params.set('startDate', profileStart);
            if (profileEnd) params.set('endDate', profileEnd);
            params.set('limit', '500');
            const profile = await api.get<any>(`/api/attendance-ops/employees/${employeeId}/profile?${params.toString()}`);
            setEmployeeProfile(profile);
        } catch (error: any) {
            toast.error(error.message || 'تعذر تحميل ملف الموظف');
            setEmployeeProfile(null);
        } finally {
            setLoadingProfile(false);
        }
    };

    const openProfilePunchDraft = (session: any | null, eventType: 'IN' | 'OUT' | 'UNKNOWN') => {
        const fallbackTime = eventType === 'OUT'
            ? session?.clockOutAt || session?.clockInAt || new Date()
            : session?.clockInAt || new Date();
        setProfilePunchDraft({
            sessionId: session?.id,
            eventType,
            occurredAt: toDateTimeLocalValue(fallbackTime),
            reason: eventType === 'OUT'
                ? 'إضافة بصمة خروج مفقودة'
                : eventType === 'IN'
                    ? 'إضافة بصمة دخول مفقودة'
                    : 'إضافة بصمة لتصحيح اليوم',
            deviceId: '',
        });
    };

    const submitProfilePunch = async () => {
        if (!profileEmployeeId) return toast.error('اختر الموظف أولا');
        if (!profilePunchDraft?.occurredAt) return toast.error('حدد وقت البصمة');
        if (!profilePunchDraft.reason.trim()) return toast.error('اكتب سبب الإضافة');
        const employee = employees.find(emp => emp.id === profileEmployeeId);
        setSavingProfilePunch(true);
        try {
            await api.post('/api/attendance-ops/manual-punch', {
                employeeId: profileEmployeeId,
                branchId: employee?.branchId || settings.activeBranchId,
                eventType: profilePunchDraft.eventType,
                occurredAt: new Date(profilePunchDraft.occurredAt).toISOString(),
                reason: profilePunchDraft.reason.trim(),
                deviceId: profilePunchDraft.deviceId || undefined,
            });
            toast.success('تم حفظ البصمة من ملف الموظف');
            setProfilePunchDraft(null);
            await loadEmployeeProfile(profileEmployeeId);
            if (filter === 'daily') await loadDailyLog();
        } catch (error: any) {
            toast.error(error.message || 'تعذر حفظ البصمة من ملف الموظف');
        } finally {
            setSavingProfilePunch(false);
        }
    };

    const rebuildEmployeeSmartDays = async () => {
        if (!profileEmployeeId) return toast.error('اختر الموظف أولا');
        setRecalculating(true);
        try {
            const result = await api.post<any>('/api/attendance-ops/rebuild-smart-days', {
                branchId: settings.activeBranchId || undefined,
                employeeId: profileEmployeeId,
                startDate: profileStart || undefined,
                endDate: profileEnd || undefined,
                limit: 5000,
            });
            toast.success(`تمت إعادة معالجة ${result?.processedDays || 0} يوم للموظف`);
            await loadEmployeeProfile(profileEmployeeId);
        } catch (error: any) {
            toast.error(error.message || 'تعذرت إعادة معالجة الموظف');
        } finally {
            setRecalculating(false);
        }
    };

    const unknownGroups = useMemo(() => {
        const map = new Map<string, UnknownGroup>();
        for (const exception of exceptions) {
            if (exception.type !== 'UNKNOWN_EMPLOYEE') continue;
            const deviceUserId = getUnknownIdentifier(exception);
            const deviceId = exception.metadata?.deviceId || 'unknown-device';
            const key = `${deviceId}:${deviceUserId}`;
            const existing = map.get(key);
            const rank = severityRank[exception.severity] || 0;
            const currentRank = severityRank[existing?.severity || ''] || 0;
            if (existing) {
                existing.count += 1;
                existing.exceptionIds.push(exception.id);
                existing.samples.push(exception);
                if (rank > currentRank) existing.severity = exception.severity;
                if (!existing.latestAt || (exception.createdAt && new Date(exception.createdAt) > new Date(existing.latestAt))) {
                    existing.latestAt = exception.createdAt;
                }
            } else {
                map.set(key, {
                    key,
                    deviceId,
                    deviceUserId,
                    branchId: exception.branchId,
                    count: 1,
                    severity: exception.severity,
                    latestAt: exception.createdAt,
                    exceptionIds: [exception.id],
                    samples: [exception],
                });
            }
        }
        return Array.from(map.values()).sort((a, b) => {
            const severityDelta = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
            if (severityDelta) return severityDelta;
            return b.count - a.count;
        });
    }, [exceptions]);

    const otherExceptions = useMemo(() => exceptions.filter(e => e.type !== 'UNKNOWN_EMPLOYEE'), [exceptions]);
    const otherExceptionGroups = useMemo(() => {
        if (exceptionSummary?.rows?.length) {
            return exceptionSummary.rows
                .filter(row => row.type !== 'UNKNOWN_EMPLOYEE')
                .map(row => ({
                    key: `${row.type}:${row.severity}`,
                    type: row.type,
                    severity: row.severity,
                    count: Number(row.count || 0),
                    latestAt: row.latestAt,
                    samples: otherExceptions.filter(exception => exception.type === row.type && exception.severity === row.severity).slice(0, 3),
                }));
        }
        const groups = new Map<string, { key: string; type: string; severity: string; count: number; latestAt?: string; samples: AttendanceException[] }>();
        for (const exception of otherExceptions) {
            const key = `${exception.type}:${exception.severity}`;
            const existing = groups.get(key);
            if (existing) {
                existing.count += 1;
                if (!existing.latestAt || String(exception.createdAt || '') > String(existing.latestAt)) existing.latestAt = exception.createdAt;
                if (existing.samples.length < 3) existing.samples.push(exception);
            } else {
                groups.set(key, {
                    key,
                    type: exception.type,
                    severity: exception.severity,
                    count: 1,
                    latestAt: exception.createdAt,
                    samples: [exception],
                });
            }
        }
        return Array.from(groups.values()).sort((a, b) => b.count - a.count);
    }, [exceptionSummary, otherExceptions]);

    const visibleUnknownGroups = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return unknownGroups;
        return unknownGroups.filter(group => {
            const employee = employees.find(emp => selectedEmployees[group.key] === emp.id);
            return group.deviceUserId.toLowerCase().includes(s)
                || group.deviceId.toLowerCase().includes(s)
                || (employee?.name || '').toLowerCase().includes(s)
                || (employee?.nameAr || '').toLowerCase().includes(s);
        });
    }, [employees, search, selectedEmployees, unknownGroups]);

    const profileRawLogMap = useMemo(() => {
        const map = new Map<string, any>();
        for (const log of employeeProfile?.rawLogs || []) map.set(log.id, log);
        return map;
    }, [employeeProfile]);

    const profileSessions = useMemo(() => employeeProfile?.sessions || [], [employeeProfile]);

    const missingProfilePunches = useMemo(() => (
        profileSessions.filter((session: any) => !session.clockInAt || !session.clockOutAt).length
    ), [profileSessions]);

    const getCandidateEmployees = (group: UnknownGroup) => {
        const seen = new Set<string>();
        const exactMatches = employees.filter(emp => employeeMatchesDeviceUser(emp, group.deviceUserId));
        const sameBranch = employees.filter(emp => emp.branchId === group.branchId);
        const ordered = [...exactMatches, ...sameBranch, ...employees];
        return ordered.filter(emp => {
            if (seen.has(emp.id)) return false;
            seen.add(emp.id);
            return true;
        });
    };

    const findBestEmployeeForGroup = (group: UnknownGroup) => {
        return getCandidateEmployees(group).find(emp => employeeMatchesDeviceUser(emp, group.deviceUserId));
    };

    useEffect(() => {
        if (!unknownGroups.length || !employees.length) return;
        setSelectedEmployees(prev => {
            let changed = false;
            const next = { ...prev };
            for (const group of unknownGroups) {
                if (next[group.key]) continue;
                const match = findBestEmployeeForGroup(group);
                if (match) {
                    next[group.key] = match.id;
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [employees, unknownGroups]);

    const stats = {
        total: exceptionSummary?.total || exceptions.length,
        unknownRows: exceptions.filter(e => e.type === 'UNKNOWN_EMPLOYEE').length,
        unknownGroups: unknownGroups.length,
        other: otherExceptionGroups.reduce((sum, group) => sum + group.count, 0),
        high: exceptions.filter(e => e.severity === 'HIGH' || e.severity === 'CRITICAL').length,
    };

    const resolveUnknownGroup = async (group: UnknownGroup) => {
        const employeeId = selectedEmployees[group.key] || findBestEmployeeForGroup(group)?.id;
        if (!employeeId) return toast.error('اختر الموظف المطابق');
        if (!group.deviceId || group.deviceId === 'unknown-device') return toast.error('لا يمكن الربط لأن الماكينة غير معروفة');

        setBusyGroup(group.key);
        try {
            const result = await api.post<any>('/api/attendance-ops/devices/mappings/link-unknown', {
                deviceId: group.deviceId,
                deviceUserId: group.deviceUserId,
                employeeId,
                resolutionNotes: `Linked biometric id ${group.deviceUserId} to employee ${employeeId}`,
                exceptionIds: group.exceptionIds,
            });
            setExceptions(prev => prev.filter(exception => !group.exceptionIds.includes(exception.id)));
            toast.success(`تم ربط الكود ${group.deviceUserId} وإعادة معالجة ${result?.reprocessed || 0} سجل`);
        } catch (error: any) {
            toast.error(error.message || 'تعذر ربط كود البصمة');
        } finally {
            setBusyGroup(null);
        }
    };

    const updateQuickEmployee = (groupKey: string, patch: Partial<QuickEmployeeDraft>) => {
        setQuickEmployees(prev => ({
            ...prev,
            [groupKey]: {
                name: '',
                code: '',
                role: 'STAFF',
                ...(prev[groupKey] || {}),
                ...patch,
            },
        }));
    };

    const createEmployeeAndLink = async (group: UnknownGroup) => {
        const draft = quickEmployees[group.key] || { name: '', code: '', role: 'STAFF' };
        const name = draft.name.trim();
        const employeeCode = draft.code.trim() || group.deviceUserId;
        if (!name) return toast.error('اكتب اسم الموظف');
        if (!employeeCode) return toast.error('اكتب كود الموظف');
        if (!group.deviceId || group.deviceId === 'unknown-device') return toast.error('لا يمكن الإنشاء لأن الماكينة غير معروفة');

        setBusyGroup(group.key);
        try {
            const employee = await api.post<Employee>('/api/hr/employees', {
                branchId: group.branchId,
                name,
                role: draft.role || 'STAFF',
                employeeCode,
                attendanceCode: group.deviceUserId,
            });
            const result = await api.post<any>('/api/attendance-ops/devices/mappings/link-unknown', {
                deviceId: group.deviceId,
                deviceUserId: group.deviceUserId,
                employeeId: employee.id,
                exceptionIds: group.exceptionIds,
                resolutionNotes: `Created employee ${employeeCode} and linked biometric id ${group.deviceUserId}`,
            });
            setEmployees(prev => [...prev, employee]);
            setExceptions(prev => prev.filter(exception => !group.exceptionIds.includes(exception.id)));
            setQuickCreateOpen(prev => ({ ...prev, [group.key]: false }));
            toast.success(`تم إنشاء الموظف وإعادة معالجة ${result?.reprocessed || 0} سجل`);
        } catch (error: any) {
            toast.error(error.message || 'تعذر إنشاء الموظف وربط البصمة');
        } finally {
            setBusyGroup(null);
        }
    };

    const ignoreGroup = async (group: UnknownGroup) => {
        if (!confirm(`تجاهل ${group.count} بصمة من هذه المجموعة؟`)) return;
        setBusyGroup(group.key);
        try {
            await api.put('/api/attendance-ops/exceptions/bulk/resolve', {
                ids: group.exceptionIds,
                resolutionNotes: `Bulk ignored unknown biometric id ${group.deviceUserId}`,
                resolvedBy: 'system',
            });
            setExceptions(prev => prev.filter(exception => !group.exceptionIds.includes(exception.id)));
            toast.success(`تم تجاهل ${group.count} بصمة`);
        } catch (error: any) {
            toast.error(error.message || 'تعذر تجاهل المجموعة');
        } finally {
            setBusyGroup(null);
        }
    };

    const dashboardStats = [
        { label: 'أكواد تحتاج مراجعة', value: stats.unknownGroups, icon: Fingerprint, tone: 'text-rose-500', helper: stats.unknownRows > 0 ? String(stats.unknownRows) + ' بصمة' : '' },
        { label: 'مشكلات عالية', value: stats.high, icon: AlertTriangle, tone: 'text-amber-500', helper: '' },
        { label: 'الموظفون', value: employees.length, icon: UserCheck, tone: 'text-emerald-500', helper: '' },
        { label: 'الماكينات', value: devices.length, icon: Activity, tone: 'text-blue-500', helper: '' },
    ];
    const workflowTabs = [
        { key: 'unknown', label: 'ربط البصمات', description: 'مراجعة الأكواد غير المعروفة وربطها', count: stats.unknownGroups, icon: Fingerprint },
        { key: 'daily', label: 'السجل الذكي', description: 'متابعة حضور الفترة حسب الموظف', count: dailySummary.total || null, icon: CalendarDays },
        { key: 'employee', label: 'ملف الموظف', description: 'جلسات اليوم والتاريخ الخام والمعالجة', count: null, icon: UserCheck },
        { key: 'readiness', label: 'جاهزية القفل', description: 'فحص النواقص قبل الرواتب', count: readiness?.actions?.length || null, icon: CheckCircle },
        { key: 'monitor', label: 'حالة السحب', description: 'المتابعة مع الماكينات والـ bridge', count: bridgeMonitor?.totals?.failed || bridgeMonitor?.totals?.stale || null, icon: Activity },
        { key: 'other', label: 'مشكلات أخرى', description: 'استثناءات تحتاج قرار', count: stats.other, icon: ShieldAlert },
        { key: 'tools', label: 'الأدوات', description: 'تصدير وإعادة حساب ومعالجة ذكية', count: null, icon: Download },
    ] as const;
    const activeTab = workflowTabs.find(tab => tab.key === filter) || workflowTabs[0];
    const mainReviewTabs = workflowTabs.filter(tab => ['unknown', 'daily', 'employee', 'readiness'].includes(tab.key));
    const opsTabs = workflowTabs.filter(tab => ['monitor', 'other', 'tools'].includes(tab.key));
    const focusChecklist = [
        { label: 'أكواد بصمة تحتاج ربط', value: stats.unknownGroups, tone: 'text-rose-600' },
        { label: 'مشكلات عالية', value: stats.high, tone: 'text-amber-600' },
        { label: 'ماكينات متعثرة', value: Number(bridgeMonitor?.totals?.failed || 0) + Number(bridgeMonitor?.totals?.stale || 0), tone: 'text-blue-600' },
    ];
    const todayFocus = focusChecklist.filter(item => item.value > 0).slice(0, 3);
    const quickActions = [
        { key: 'unknown', label: 'ربط البصمات', helper: '', icon: Fingerprint },
        { key: 'daily', label: 'السجل الذكي', helper: '', icon: CalendarDays },
        { key: 'employee', label: 'ملف موظف', helper: '', icon: UserCheck },
        { key: 'readiness', label: 'الجاهزية', helper: '', icon: CheckCircle },
    ] as const;
    const workspaceModes = [
        { key: 'review', label: 'الربط والمراجعة', description: 'الأكواد غير المعروفة والمشكلات التشغيلية', filters: ['unknown', 'other', 'monitor'] as const, icon: Fingerprint },
        { key: 'attendance', label: 'السجل والحضور', description: 'السجل الذكي ومتابعة الفترة', filters: ['daily'] as const, icon: CalendarDays },
        { key: 'employee', label: 'ملف الموظف', description: 'جلسات الموظف والمعالجة اليدوية', filters: ['employee', 'manual'] as const, icon: UserCheck },
        { key: 'closing', label: 'الجاهزية والإقفال', description: 'فحص النواقص والتصدير وإعادة الحساب', filters: ['readiness', 'tools'] as const, icon: CheckCircle },
    ] as const;
    const activeWorkspaceMode = workspaceModes.find(mode => mode.filters.some(modeFilter => modeFilter === filter)) || workspaceModes[0];
    return (
        <div className="attendance-workspace min-h-screen bg-app text-main pb-24" dir="rtl">
            <div className="w-full px-3 py-4 sm:px-4 lg:px-5 xl:px-6 lg:py-6 space-y-5">
                <header className="overflow-hidden rounded-[30px] border border-border/45 bg-card/80">
                    <div className="border-b border-border/25 px-5 py-5 sm:px-6 lg:px-7">
                        <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
                            <div className="flex items-start gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border/55 bg-elevated text-main">
                                    <Clock size={24} />
                                </div>
                                <div>
                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                        <span className="inline-flex h-8 items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 text-[11px] font-black text-blue-600">الحضور والبصمات</span>
                                        <span className="inline-flex h-8 items-center rounded-full border border-border/40 bg-app/60 px-3 text-[11px] font-black text-muted">{activeTab.label}</span>
                                    </div>
                                    <h1 className="text-2xl font-black tracking-tight lg:text-3xl">مراجعة الحضور والبصمات</h1>
                                    <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-muted">
                                        اربط البصمات، راجع السجل، وافتح ملف الموظف بسرعة.
                                    </p>
                                </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] 2xl:min-w-[600px]">
                                <div className="relative">
                                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                                    <input
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder="ابحث بكود البصمة أو اسم الموظف"
                                        className="h-11 w-full rounded-2xl border border-border/50 bg-elevated/70 pr-9 pl-3 text-xs font-bold outline-none transition focus:border-main/40"
                                    />
                                </div>
                                <button type="button" onClick={() => setFilter('employee')} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card px-4 text-xs font-black text-main transition hover:border-blue-500/30 hover:text-blue-600">
                                    <UserCheck size={15} /> ملف موظف
                                </button>
                                <button type="button" onClick={loadData} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card px-4 text-xs font-black text-muted transition hover:border-emerald-500/30 hover:text-main">
                                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> تحديث
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="grid gap-4 px-5 py-5 sm:px-6 xl:grid-cols-[1.2fr_0.8fr] lg:px-7">
                            <div className="space-y-4">
                            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                                {workspaceModes.map(mode => {
                                    const Icon = mode.icon;
                                    const isActive = activeWorkspaceMode.key === mode.key;
                                    const totalCount = mode.filters.reduce((sum, modeFilter) => {
                                        const current = workflowTabs.find(tab => tab.key === modeFilter)?.count;
                                        return sum + Number(current || 0);
                                    }, 0);
                                    return (
                                        <button
                                            key={mode.key}
                                            type="button"
                                            onClick={() => setFilter(mode.filters[0] as typeof filter)}
                                            className={`rounded-2xl border px-4 py-4 text-right transition ${isActive ? 'border-main/30 bg-main/5 text-main' : 'border-border/40 bg-app/45 text-main hover:bg-card'}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-black">{mode.label}</p>
                                                    <p className="mt-1 text-[11px] font-bold leading-5 text-muted">{mode.description}</p>
                                                </div>
                                                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${isActive ? 'border-main/20 bg-main text-app' : 'border-border/40 bg-card text-muted'}`}>
                                                    <Icon size={16} />
                                                </span>
                                            </div>
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                {mode.filters.map(modeFilter => {
                                                    const tab = workflowTabs.find(item => item.key === modeFilter);
                                                    if (!tab) return null;
                                                    return (
                                                        <span key={modeFilter} className={`rounded-full px-2.5 py-1 text-[10px] font-black ${filter === modeFilter ? 'bg-main/10 text-main' : 'bg-card text-muted'}`}>
                                                            {tab.label}
                                                        </span>
                                                    );
                                                })}
                                                {totalCount > 0 ? <span className="mr-auto rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] font-black text-rose-600">{totalCount}</span> : null}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {dashboardStats.map((stat, index) => (
                                    <motion.div key={stat.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="rounded-2xl border border-border/45 bg-elevated/45 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div><p className="text-[11px] font-black text-muted">{stat.label}</p><p className="mt-2 text-3xl font-black tabular-nums">{loading ? '...' : stat.value}</p></div>
                                            <stat.icon className={stat.tone} size={20} />
                                        </div>
                                        {stat.helper ? <p className="mt-2 text-[11px] font-bold leading-5 text-muted">{stat.helper}</p> : null}
                                    </motion.div>
                                ))}
                            </div>
                            <div className="rounded-2xl border border-border/45 bg-elevated/35 p-4">
                                <div className="mb-3 flex items-center gap-2"><Sparkles size={16} className="text-blue-500" /><p className="text-sm font-black">اختصارات هذا الوضع</p></div>
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    {quickActions.map((action) => (
                                        <button key={action.key} type="button" onClick={() => setFilter(action.key as typeof filter)} className={`rounded-2xl border p-4 text-right transition ${filter === action.key ? 'border-main/30 bg-card text-main' : 'border-border/40 bg-app/50 text-main hover:border-blue-500/25 hover:bg-card'}`}>
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/40 bg-card"><action.icon size={16} /></span>
                                                {workflowTabs.find(tab => tab.key === action.key)?.count !== null && workflowTabs.find(tab => tab.key === action.key)?.count !== undefined ? <span className="rounded-full bg-main/10 px-2.5 py-1 text-[10px] font-black tabular-nums">{workflowTabs.find(tab => tab.key === action.key)?.count}</span> : null}
                                            </div>
                                            <p className="text-xs font-black">{action.label}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
                            <div className="rounded-2xl border border-border/45 bg-elevated/40 p-4">
                                <div className="mb-3 flex items-center gap-2"><PanelTop size={16} className="text-main" /><p className="text-sm font-black">الآن</p></div>
                                {todayFocus.length > 0 ? <div className="space-y-2">{todayFocus.map(item => <div key={item.label} className="flex items-center justify-between rounded-2xl border border-border/40 bg-card/75 px-3 py-3"><span className="text-[11px] font-black">{item.label}</span><span className={`text-sm font-black tabular-nums ${item.tone}`}>{item.value}</span></div>)}</div> : <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-[11px] font-black text-emerald-600">لا توجد عناصر عاجلة</div>}
                            </div>
                            <div className="rounded-2xl border border-border/45 bg-elevated/40 p-4">
                                <div className="mb-3 flex items-center gap-2"><ClipboardList size={16} className="text-main" /><p className="text-sm font-black">داخل {activeWorkspaceMode.label}</p></div>
                                <div className="grid gap-2">
                                    {workflowTabs.filter(tab => activeWorkspaceMode.filters.some(modeFilter => modeFilter === tab.key)).map(tab => (
                                        <button key={tab.key} type="button" onClick={() => setFilter(tab.key as typeof filter)} className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-right transition ${filter === tab.key ? 'border-main/30 bg-card text-main' : 'border-border/35 bg-app/45 text-muted hover:bg-card hover:text-main'}`}>
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border/40 bg-card"><tab.icon size={15} /></span>
                                            <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-xs font-black">{tab.label}{tab.count !== null && <span className="rounded-full bg-main/10 px-2 py-0.5 text-[10px] tabular-nums">{tab.count}</span>}</span></span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </header>
                <nav className="grid gap-3 lg:grid-cols-[1fr_auto]">
                    <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${filterTone(activeTab.key)}`}>
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-white/10"><activeTab.icon size={16} /></span>
                            <div>
                                <p className="text-sm font-black">{activeTab.label}</p>
                                <p className="mt-1 text-[11px] font-bold opacity-80">{activeWorkspaceMode.label}</p>
                            </div>
                        </div>
                        {activeTab.count !== null && <span className="text-sm font-black tabular-nums">{activeTab.count}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {activeWorkspaceMode.filters.map(modeFilter => {
                            const tab = workflowTabs.find(item => item.key === modeFilter);
                            if (!tab) return null;
                            return (
                                <button
                                    key={modeFilter}
                                    type="button"
                                    onClick={() => setFilter(modeFilter as typeof filter)}
                                    className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-[11px] font-black transition ${filter === modeFilter ? 'border-main/30 bg-main/5 text-main' : 'border-border/40 bg-card/70 text-muted hover:bg-card hover:text-main'}`}
                                >
                                    <tab.icon size={14} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </nav>
                {filter === 'readiness' && (
                    <section className="rounded-2xl border border-border/40 bg-card/70 overflow-hidden">
                        <div className="border-b border-border/25 p-5">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                <div>
                                    <h2 className="flex items-center gap-2 text-base font-black">
                                        <CheckCircle size={18} className="text-emerald-500" />
                                        جاهزية HR قبل القفل
                                    </h2>
                                    <p className="mt-1 text-xs font-bold text-muted">
                                        ملخص عملي يوضح هل الفرع جاهز لقفل الحضور والرواتب، وما هي النواقص التي يجب حلها أولا.
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-end gap-2">
                                    <div>
                                        <label className="mb-1 block text-[10px] font-black text-muted">من</label>
                                        <input type="date" value={monthlyCloseStartDate} onChange={e => setMonthlyCloseStartDate(e.target.value)} className="h-10 rounded-xl border border-border/50 bg-elevated px-3 text-xs font-bold outline-none" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[10px] font-black text-muted">إلى</label>
                                        <input type="date" value={monthlyCloseEndDate} onChange={e => setMonthlyCloseEndDate(e.target.value)} className="h-10 rounded-xl border border-border/50 bg-elevated px-3 text-xs font-bold outline-none" />
                                    </div>
                                    <button onClick={loadHrReadiness} disabled={loadingReadiness} className="h-10 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-50">
                                        {loadingReadiness ? 'جاري الفحص...' : 'فحص الجاهزية'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {loadingReadiness ? (
                            <div className="p-12 text-center text-xs font-bold text-muted">جاري تحليل بيانات الحضور والرواتب...</div>
                        ) : !readiness ? (
                            <div className="p-12 text-center">
                                <ShieldAlert className="mx-auto mb-3 text-muted/40" size={34} />
                                <p className="text-sm font-black text-muted">اضغط فحص الجاهزية لعرض النواقص.</p>
                            </div>
                        ) : (
                            <div className="p-5 space-y-5">
                                <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
                                    <div className={`rounded-2xl border p-5 ${readiness.canClosePayroll ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-amber-500/25 bg-amber-500/10'}`}>
                                        <p className="text-[11px] font-black text-muted">درجة الجاهزية</p>
                                        <p className="mt-2 text-5xl font-black tabular-nums">{readiness.readinessScore}%</p>
                                        <p className="mt-3 text-xs font-black">
                                            {readiness.canClosePayroll ? 'جاهز للقفل بدون موانع عالية' : 'يوجد موانع يجب حلها قبل القفل'}
                                        </p>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                        {[
                                            ['الموظفون', readiness.totals.activeEmployees],
                                            ['الماكينات', readiness.totals.activeDevices],
                                            ['جلسات الحضور', readiness.totals.attendanceSessions],
                                            ['البصمات الخام', readiness.totals.rawLogs],
                                            ['استثناءات مفتوحة', readiness.totals.openExceptions],
                                            ['Bridge OK', readiness.totals.bridgeOk],
                                            ['إجازات معلقة', readiness.totals.pendingLeaves],
                                            ['سلف/خصومات معلقة', (readiness.totals.pendingLoans || 0) + (readiness.totals.pendingBonusPenalty || 0)],
                                        ].map(([label, value]) => (
                                            <div key={String(label)} className="rounded-xl border border-border/35 bg-elevated/45 p-4">
                                                <p className="text-[10px] font-black text-muted">{label}</p>
                                                <p className="mt-1 text-2xl font-black tabular-nums">{value as number}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-border/35 bg-elevated/30 overflow-hidden">
                                    <div className="border-b border-border/25 px-5 py-4">
                                        <h3 className="text-sm font-black">قائمة النواقص المقترحة</h3>
                                    </div>
                                    {readiness.actions.length === 0 ? (
                                        <div className="p-8 text-center text-sm font-black text-emerald-600">لا توجد نواقص واضحة في الفترة المحددة.</div>
                                    ) : (
                                        <div className="divide-y divide-border/20">
                                            {readiness.actions.map(action => {
                                                const tone = action.severity === 'HIGH' || action.severity === 'CRITICAL'
                                                    ? 'text-rose-600 bg-rose-500/10 border-rose-500/20'
                                                    : action.severity === 'MEDIUM'
                                                        ? 'text-amber-600 bg-amber-500/10 border-amber-500/20'
                                                        : 'text-blue-600 bg-blue-500/10 border-blue-500/20';
                                                return (
                                                    <div key={action.key} className="grid gap-3 p-4 lg:grid-cols-[140px_1fr_auto] lg:items-center">
                                                        <span className={`w-fit rounded-xl border px-3 py-2 text-[10px] font-black ${tone}`}>{action.severity}</span>
                                                        <div>
                                                            <p className="text-sm font-black">{action.title}</p>
                                                            <p className="mt-1 text-xs font-bold text-muted">{action.details}</p>
                                                        </div>
                                                        <span className="rounded-xl border border-border/45 bg-card px-3 py-2 text-xs font-black tabular-nums">{action.count}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {readiness.samples?.failedBridgeDevices?.length ? (
                                    <div className="rounded-2xl border border-border/35 bg-elevated/30 p-5">
                                        <h3 className="text-sm font-black mb-3">عينات تحتاج متابعة</h3>
                                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                            {readiness.samples.failedBridgeDevices.slice(0, 6).map((device: any) => (
                                                <div key={device.deviceId} className="rounded-xl border border-border/35 bg-card/60 p-3">
                                                    <p className="truncate text-xs font-black">{device.name || device.deviceId}</p>
                                                    <p className="mt-1 text-[10px] font-bold text-muted">{device.health} {device.lastError ? `- ${device.lastError}` : ''}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </section>
                )}

                {(filter === 'unknown' || filter === 'all') && (
                    <section className="rounded-2xl border border-border/40 bg-card/70">
                        <div className="border-b border-border/25 p-5">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <h2 className="flex items-center gap-2 text-base font-black">
                                        <Sparkles size={17} className="text-emerald-500" />
                                        مراجعة البصمات غير المربوطة
                                    </h2>
                                    <p className="mt-1 text-xs font-bold text-muted">
                                        لو الكود مطابق، اعتمد الربط مباشرة. ولو الكود جديد، أضف الموظف من نفس البطاقة.
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2 text-[11px] font-black">
                                    <span className="rounded-xl border border-border/40 bg-elevated px-3 py-2">{visibleUnknownGroups.length} كود ظاهر</span>
                                    <span className="rounded-xl border border-border/40 bg-elevated px-3 py-2">{stats.unknownRows} بصمة تحتاج مراجعة</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-3 p-3 lg:p-4">
                            {visibleUnknownGroups.map((group, index) => {
                                const bestEmployee = findBestEmployeeForGroup(group);
                                const selectedEmployeeId = selectedEmployees[group.key] || bestEmployee?.id || '';
                                const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId) || bestEmployee;
                                const exactMatch = selectedEmployee ? employeeMatchesDeviceUser(selectedEmployee, group.deviceUserId) : false;
                                return (
                                    <motion.article
                                        key={group.key}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(index * 0.025, 0.2) }}
                                        className="rounded-xl border border-border/35 bg-elevated/35 p-4"
                                    >
                                        <div className="grid gap-4 xl:grid-cols-[220px_1fr_auto] xl:items-center">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/45 bg-card text-main">
                                                    <Fingerprint size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-muted">كود البصمة</p>
                                                    <p className="mt-1 text-lg font-black tabular-nums" dir="ltr">{group.deviceUserId}</p>
                                                    <p className="mt-1 text-[10px] font-bold text-muted">{group.count} بصمة</p>
                                                </div>
                                            </div>

                                            <div className="grid gap-2 lg:grid-cols-[1fr_auto] lg:items-center">
                                                <div>
                                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                                        <span className="text-[11px] font-black text-muted">الموظف</span>
                                                        {exactMatch && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-500">مطابق للكود</span>}
                                                        {!selectedEmployee && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-600">يحتاج اختيار موظف</span>}
                                                    </div>
                                                    <select
                                                        value={selectedEmployeeId}
                                                        onChange={e => setSelectedEmployees(prev => ({ ...prev, [group.key]: e.target.value }))}
                                                        className="h-11 w-full rounded-xl border border-border/45 bg-card px-3 text-xs font-bold outline-none focus:border-main/40"
                                                    >
                                                        <option value="">اختر الموظف</option>
                                                        {getCandidateEmployees(group).map(emp => {
                                                            const hints = [
                                                                employeeMatchesDeviceUser(emp, group.deviceUserId) ? 'مطابق للكود' : '',
                                                                emp.branchId !== group.branchId ? 'فرع آخر' : '',
                                                            ].filter(Boolean).join(' - ');
                                                            return (
                                                                <option key={emp.id} value={emp.id}>
                                                                    {emp.nameAr || emp.name} {emp.employeeCode ? `(${emp.employeeCode})` : ''}{hints ? ` - ${hints}` : ''}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                    <p className="mt-2 text-[10px] font-bold text-muted">
                                                        آخر ظهور: {group.latestAt ? new Date(group.latestAt).toLocaleString('ar-EG') : '-'}
                                                    </p>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setQuickCreateOpen(prev => ({ ...prev, [group.key]: !prev[group.key] }));
                                                        updateQuickEmployee(group.key, { code: group.deviceUserId, role: 'STAFF' });
                                                    }}
                                                    className="h-10 rounded-xl border border-border/45 bg-card px-3 text-[10px] font-black text-muted transition hover:text-main"
                                                >
                                                    إضافة موظف جديد
                                                </button>
                                            </div>

                                            <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                                                <button
                                                    type="button"
                                                    onClick={() => resolveUnknownGroup(group)}
                                                    disabled={busyGroup === group.key || !selectedEmployeeId}
                                                    className="inline-flex h-11 min-w-[130px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-[10px] font-black text-white disabled:opacity-40"
                                                >
                                                    <UserCheck size={14} />
                                                    اعتماد الربط
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => ignoreGroup(group)}
                                                    disabled={busyGroup === group.key}
                                                    className="h-10 rounded-xl border border-border/45 bg-card px-3 text-[10px] font-black text-muted transition hover:text-rose-500 disabled:opacity-40"
                                                >
                                                    تجاهل
                                                </button>
                                            </div>
                                        </div>

                                        {quickCreateOpen[group.key] && (
                                            <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-border/35 bg-card/70 p-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
                                                <input
                                                    value={quickEmployees[group.key]?.name || ''}
                                                    onChange={e => updateQuickEmployee(group.key, { name: e.target.value })}
                                                    placeholder="اسم الموظف"
                                                    className="h-10 rounded-xl border border-border/40 bg-elevated px-3 text-xs font-bold outline-none focus:border-main/40"
                                                />
                                                <input
                                                    value={quickEmployees[group.key]?.code || group.deviceUserId}
                                                    onChange={e => updateQuickEmployee(group.key, { code: e.target.value })}
                                                    placeholder="كود الموظف"
                                                    className="h-10 rounded-xl border border-border/40 bg-elevated px-3 text-xs font-bold outline-none focus:border-main/40"
                                                />
                                                <select
                                                    value={quickEmployees[group.key]?.role || 'STAFF'}
                                                    onChange={e => updateQuickEmployee(group.key, { role: e.target.value })}
                                                    className="h-10 rounded-xl border border-border/40 bg-elevated px-3 text-xs font-bold outline-none focus:border-main/40"
                                                >
                                                    {['STAFF', 'CASHIER', 'WAITER', 'COOK', 'DRIVER', 'SUPERVISOR', 'MANAGER'].map(role => (
                                                        <option key={role} value={role}>{role}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => createEmployeeAndLink(group)}
                                                    disabled={busyGroup === group.key}
                                                    className="h-10 rounded-xl bg-main px-4 text-[10px] font-black text-app disabled:opacity-40"
                                                >
                                                    إنشاء وربط
                                                </button>
                                            </div>
                                        )}
                                    </motion.article>
                                );
                            })}
                        </div>

                        {!loading && visibleUnknownGroups.length === 0 && (
                            <div className="p-14 text-center">
                                <CheckCircle className="mx-auto text-emerald-500 mb-3" size={36} />
                                <p className="text-sm font-black text-main">لا توجد مشكلات عاجلة</p>
                                <p className="mt-2 text-xs font-bold text-muted">لو ظهر نوع جديد من الاستثناءات هتلاقيه هنا بشكل مجمع وأسهل للمراجعة.</p>
                            </div>
                        )}
                    </section>
                )}

                {(filter === 'other' || filter === 'all') && (
                    <section className="overflow-hidden rounded-2xl border border-border/35 bg-card/60">
                        <div className="border-b border-border/25 px-5 py-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <h2 className="flex items-center gap-2 text-sm font-black"><ShieldAlert size={16} className="text-violet-500" /> مشاكل تحتاج قرار</h2>
                                    <p className="mt-1 text-[10px] font-bold text-muted">الهدف من هذه الشاشة تقليل الضوضاء، لذلك بنجمع المشكلات المتشابهة في بطاقات أوضح وأسهل للحسم.</p>
                                </div>
                                <div className="flex flex-wrap gap-2 text-[10px] font-black">
                                    <span className="rounded-xl border border-border/35 bg-elevated/50 px-3 py-2">{stats.other} مشكلة مفتوحة</span>
                                    <span className="rounded-xl border border-border/35 bg-elevated/50 px-3 py-2">{otherExceptions.length} محملة للمعاينة</span>
                                </div>
                            </div>
                        </div>
                        <div className="grid gap-3 p-4">
                            {otherExceptionGroups.map(group => {
                                const isExpanded = expandedOtherGroup === group.key;
                                const sampleIds = group.samples.map(sample => sample.id);
                                return (
                                    <article key={group.key} className="rounded-xl border border-border/30 bg-elevated/30 p-4">
                                        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[10px] font-black text-violet-600">{group.type}</span>
                                                    <span className={`rounded-lg border px-2.5 py-1 text-[10px] font-black ${group.severity === 'CRITICAL' || group.severity === 'HIGH' ? 'border-rose-500/20 bg-rose-500/10 text-rose-600' : 'border-amber-500/20 bg-amber-500/10 text-amber-600'}`}>{getSeverityLabel(group.severity, t)}</span>
                                                </div>
                                                <p className="mt-2 text-2xl font-black tabular-nums">{group.count}</p>
                                                <p className="mt-1 text-[10px] font-bold text-muted">آخر ظهور: {group.latestAt ? new Date(group.latestAt).toLocaleString('ar-EG') : '-'}</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2 lg:justify-end">
                                                <button type="button" onClick={() => setExpandedOtherGroup(isExpanded ? null : group.key)} className="h-10 rounded-xl border border-border/40 bg-card px-4 text-[10px] font-black text-muted hover:text-main">{isExpanded ? 'إخفاء العينة' : 'عرض العينة'}</button>
                                                <button
                                                    type="button"
                                                    disabled={!sampleIds.length}
                                                    onClick={() => ignoreGroup({ key: group.key, deviceId: '', deviceUserId: group.type, branchId: group.samples[0]?.branchId || '', count: sampleIds.length, severity: group.severity, latestAt: group.latestAt, exceptionIds: sampleIds, samples: group.samples })}
                                                    className="h-10 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 text-[10px] font-black text-emerald-600 disabled:opacity-40"
                                                >
                                                    حل العينة المحملة
                                                </button>
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className="mt-4 divide-y divide-border/15 overflow-hidden rounded-xl border border-border/25 bg-card/60">
                                                {group.samples.length ? group.samples.map(exception => (
                                                    <div key={exception.id} className="flex items-center justify-between gap-3 p-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-xs font-black">{exception.title || exception.type}</p>
                                                            <p className="mt-1 truncate text-[10px] font-bold text-muted">{exception.details || exception.employeeId || exception.id}</p>
                                                        </div>
                                                        <button onClick={() => ignoreGroup({ key: exception.id, deviceId: '', deviceUserId: exception.type, branchId: exception.branchId, count: 1, severity: exception.severity, latestAt: exception.createdAt, exceptionIds: [exception.id], samples: [exception] })} className="h-8 rounded-lg bg-emerald-500/10 px-3 text-[10px] font-black text-emerald-600">حل</button>
                                                    </div>
                                                )) : <div className="p-4 text-xs font-bold text-muted">لا توجد عينة محملة لهذا النوع حاليا.</div>}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                        {!loading && otherExceptionGroups.length === 0 && (
                            <div className="p-10 text-center text-xs font-bold text-muted">{t.att_no_other}</div>
                        )}
                    </section>
                )}

                {filter === 'manual' && (
                    <section className="bg-card/60 border border-border/35 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-border/25">
                            <h2 className="font-black text-sm flex items-center gap-2"><Plus size={16} className="text-emerald-500" /> إضافة بصمة يدوية</h2>
                            <p className="text-[10px] text-muted font-bold mt-1">لإضافة بصمة منسية أو تصحيح بصمة خاطئة بدون الدخول في تفاصيل فنية معقدة.</p>
                        </div>
                        <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                            <select
                                value={manualPunch.employeeId}
                                onChange={e => setManualPunch(prev => ({ ...prev, employeeId: e.target.value }))}
                                className="h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500"
                            >
                                <option value="">اختر الموظف</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nameAr || emp.name} {emp.employeeCode ? `(${emp.employeeCode})` : ''}</option>
                                ))}
                            </select>
                            <select
                                value={manualPunch.eventType}
                                onChange={e => setManualPunch(prev => ({ ...prev, eventType: e.target.value }))}
                                className="h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500"
                            >
                                <option value="IN">دخول</option>
                                <option value="OUT">خروج</option>
                                <option value="UNKNOWN">ذكي/غير محدد</option>
                            </select>
                            <input
                                type="datetime-local"
                                value={manualPunch.occurredAt}
                                onChange={e => setManualPunch(prev => ({ ...prev, occurredAt: e.target.value }))}
                                className="h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500"
                            />
                            <select
                                value={manualPunch.deviceId}
                                onChange={e => setManualPunch(prev => ({ ...prev, deviceId: e.target.value }))}
                                className="h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500"
                            >
                                <option value="">بدون ماكينة</option>
                                {devices.map(device => (
                                    <option key={device.id} value={device.id}>{device.name} {device.code ? `(${device.code})` : ''}</option>
                                ))}
                            </select>
                            <button
                                onClick={submitManualPunch}
                                disabled={submittingManual}
                                className="h-11 rounded-xl bg-emerald-600 text-white text-[10px] font-black disabled:opacity-50"
                            >
                                {submittingManual ? 'جاري الحفظ...' : 'حفظ ومعالجة'}
                            </button>
                            <input
                                value={manualPunch.reason}
                                onChange={e => setManualPunch(prev => ({ ...prev, reason: e.target.value }))}
                                placeholder="سبب الإضافة اليدوية"
                                className="md:col-span-2 xl:col-span-5 h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500"
                            />
                        </div>
                    </section>
                )}

                {filter === 'employee' && (
                    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card/60 border border-border/35 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-border/25 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            <div>
                                <h2 className="font-black text-sm flex items-center gap-2"><UserCheck size={16} className="text-blue-500" /> ملف حضور الموظف</h2>
                                <p className="text-[10px] text-muted font-bold mt-1">كل الجلسات والبصمات الخام والماكينات والفروع في مكان واحد.</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-[220px_150px_150px_auto] gap-2">
                                <select value={profileEmployeeId} onChange={e => loadEmployeeProfile(e.target.value)} className="h-10 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-blue-500">
                                    <option value="">اختر الموظف</option>
                                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.nameAr || emp.name} {emp.employeeCode ? `(${emp.employeeCode})` : ''}</option>)}
                                </select>
                                <input type="date" value={profileStart} onChange={e => setProfileStart(e.target.value)} className="h-10 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                <input type="date" value={profileEnd} onChange={e => setProfileEnd(e.target.value)} className="h-10 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                <button onClick={() => loadEmployeeProfile()} disabled={loadingProfile || !profileEmployeeId} className="h-10 px-4 rounded-xl bg-blue-600 text-white text-[10px] font-black disabled:opacity-50">
                                    {loadingProfile ? 'تحميل...' : 'عرض'}
                                </button>
                            </div>
                        </div>

                        {employeeProfile && (
                            <div className="p-5 space-y-5">
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                                    {[
                                        ['أيام معالجة', profileSessions.length],
                                        ['إجمالي الساعات', Number(employeeProfile.totals?.totalHours || 0).toFixed(1)],
                                        ['تأخير', minutesLabel(employeeProfile.totals?.lateMinutes)],
                                        ['هدر / مبكر', minutesLabel(employeeProfile.totals?.earlyLeaveMinutes)],
                                        ['ناقص بصمة', missingProfilePunches],
                                    ].map(([label, value]) => (
                                        <div key={String(label)} className="rounded-xl bg-elevated/50 border border-border/25 p-4">
                                            <p className="text-[9px] text-muted font-black">{label}</p>
                                            <p className="text-xl font-black mt-1 tabular-nums">{value}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="rounded-2xl border border-border/30 bg-card/65 overflow-hidden">
                                    <div className="p-4 border-b border-border/25 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-sm font-black flex items-center gap-2"><Sparkles size={16} className="text-emerald-500" /> كشف الحضور المعالج</h3>
                                            <p className="text-[10px] text-muted font-bold mt-1">أول بصمة في اليوم دخول وآخر بصمة خروج، حتى لو الخروج من فرع أو ماكينة مختلفة.</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button onClick={() => openProfilePunchDraft(null, 'UNKNOWN')} disabled={!profileEmployeeId} className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-[10px] font-black disabled:opacity-50 flex items-center gap-2"><Plus size={14} /> إضافة بصمة للموظف</button>
                                            <button onClick={rebuildEmployeeSmartDays} disabled={recalculating || !profileEmployeeId} className="h-10 px-4 rounded-xl border border-border/40 bg-elevated text-[10px] font-black disabled:opacity-50 flex items-center gap-2"><RefreshCw size={14} className={recalculating ? 'animate-spin' : ''} /> إعادة معالجة ذكية</button>
                                        </div>
                                    </div>

                                    {profilePunchDraft && (
                                        <div className="m-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                                            <div className="flex items-center justify-between gap-3 mb-3">
                                                <p className="text-xs font-black text-emerald-600">إضافة بصمة منسية من ملف الموظف</p>
                                                <button onClick={() => setProfilePunchDraft(null)} className="h-8 w-8 rounded-lg border border-border/30 bg-card flex items-center justify-center"><XCircle size={14} /></button>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-[140px_210px_1fr_180px_auto] gap-2">
                                                <select value={profilePunchDraft.eventType} onChange={e => setProfilePunchDraft(prev => prev ? { ...prev, eventType: e.target.value as 'IN' | 'OUT' | 'UNKNOWN' } : prev)} className="h-11 rounded-xl bg-card border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500"><option value="IN">دخول</option><option value="OUT">خروج</option><option value="UNKNOWN">ذكي</option></select>
                                                <input type="datetime-local" value={profilePunchDraft.occurredAt} onChange={e => setProfilePunchDraft(prev => prev ? { ...prev, occurredAt: e.target.value } : prev)} className="h-11 rounded-xl bg-card border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500" />
                                                <input value={profilePunchDraft.reason} onChange={e => setProfilePunchDraft(prev => prev ? { ...prev, reason: e.target.value } : prev)} placeholder="سبب الإضافة" className="h-11 rounded-xl bg-card border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500" />
                                                <select value={profilePunchDraft.deviceId} onChange={e => setProfilePunchDraft(prev => prev ? { ...prev, deviceId: e.target.value } : prev)} className="h-11 rounded-xl bg-card border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500"><option value="">بدون ماكينة</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name} {device.code ? '(' + device.code + ')' : ''}</option>)}</select>
                                                <button onClick={submitProfilePunch} disabled={savingProfilePunch} className="h-11 px-4 rounded-xl bg-emerald-600 text-white text-[10px] font-black disabled:opacity-50">{savingProfilePunch ? 'حفظ...' : 'حفظ ومعالجة'}</button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid gap-3 p-4 lg:hidden">
                                        {profileSessions.map((session: any) => {
                                            const inLog = profileRawLogMap.get(session.checkInRawLogId);
                                            const outLog = profileRawLogMap.get(session.checkOutRawLogId);
                                            const hasMissingIn = !session.clockInAt;
                                            const hasMissingOut = !session.clockOutAt;
                                            const statusLabel = hasMissingIn ? 'ناقص دخول' : hasMissingOut ? 'ناقص خروج' : 'مكتمل';
                                            const statusClass = hasMissingIn || hasMissingOut ? 'bg-amber-500/10 text-amber-600 border-amber-500/25' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25';
                                            return (
                                                <div key={session.id} className="rounded-xl border border-border/30 bg-elevated/35 p-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-sm font-black">{session.clockInAt ? new Date(session.clockInAt).toLocaleDateString('ar-EG', { weekday: 'long' }) : 'يوم غير مكتمل'}</p>
                                                            <p className="mt-1 text-[10px] font-bold text-muted">{session.clockInAt ? new Date(session.clockInAt).toLocaleDateString('ar-EG') : '-'}</p>
                                                        </div>
                                                        <span className={`rounded-lg border px-2 py-1 text-[9px] font-black ${statusClass}`}>{statusLabel}</span>
                                                    </div>
                                                    <div className="mt-4 grid grid-cols-2 gap-2">
                                                        <div className="rounded-lg bg-card/80 p-2">
                                                            <p className="text-[9px] font-black text-muted">دخول</p>
                                                            <p className="mt-1 text-xs font-black text-emerald-600">{session.clockInAt ? new Date(session.clockInAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                                                        </div>
                                                        <div className="rounded-lg bg-card/80 p-2">
                                                            <p className="text-[9px] font-black text-muted">خروج</p>
                                                            <p className={`mt-1 text-xs font-black ${hasMissingOut ? 'text-amber-600' : 'text-blue-600'}`}>{session.clockOutAt ? new Date(session.clockOutAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'ناقص'}</p>
                                                        </div>
                                                        <div className="rounded-lg bg-card/80 p-2">
                                                            <p className="text-[9px] font-black text-muted">الفرع / الماكينة</p>
                                                            <p className="mt-1 text-[11px] font-black">{inLog?.branchName || session.branchName || session.branchId || '-'}</p>
                                                            <p className="mt-1 text-[10px] font-bold text-muted">{[inLog?.deviceName || inLog?.deviceId, outLog?.deviceName || outLog?.deviceId].filter(Boolean).join(' / ') || 'معالجة ذكية'}</p>
                                                        </div>
                                                        <div className="rounded-lg bg-card/80 p-2">
                                                            <p className="text-[9px] font-black text-muted">الساعات / الأثر</p>
                                                            <p className="mt-1 text-[11px] font-black tabular-nums">{Number(session.totalHours || 0).toFixed(1)}h</p>
                                                            <p className="mt-1 text-[10px] font-bold text-muted">تأخير {minutesLabel(session.lateMinutes)} - أوفر {minutesLabel(session.overtimeMinutes)}</p>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => openProfilePunchDraft(session, hasMissingIn ? 'IN' : 'OUT')} className="mt-3 h-10 w-full rounded-xl border border-border/40 bg-card text-[11px] font-black hover:border-emerald-500/50">
                                                        {hasMissingIn ? 'إضافة دخول' : hasMissingOut ? 'إضافة خروج' : 'إضافة بصمة'}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="hidden overflow-auto max-h-[62vh] lg:block">
                                        <table className="w-full min-w-[1120px] text-sm">
                                            <thead className="sticky top-0 z-10 bg-card border-b border-border/25"><tr className="text-[10px] text-muted font-black"><th className="p-4 text-right">اليوم</th><th className="p-4 text-right">دخول</th><th className="p-4 text-right">خروج</th><th className="p-4 text-right">الفرع / الماكينة</th><th className="p-4 text-right">ساعات</th><th className="p-4 text-right">تأخير</th><th className="p-4 text-right">هدر</th><th className="p-4 text-right">أوفر</th><th className="p-4 text-right">الحالة</th><th className="p-4 text-right">إجراء</th></tr></thead>
                                            <tbody>
                                                {profileSessions.map((session: any) => {
                                                    const inLog = profileRawLogMap.get(session.checkInRawLogId);
                                                    const outLog = profileRawLogMap.get(session.checkOutRawLogId);
                                                    const hasMissingIn = !session.clockInAt;
                                                    const hasMissingOut = !session.clockOutAt;
                                                    const statusLabel = hasMissingIn ? 'ناقص دخول' : hasMissingOut ? 'ناقص خروج' : 'مكتمل';
                                                    const statusClass = hasMissingIn || hasMissingOut ? 'bg-amber-500/10 text-amber-600 border-amber-500/25' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25';
                                                    return (
                                                        <tr key={session.id} className="border-b border-border/15 hover:bg-elevated/35">
                                                            <td className="p-4"><p className="text-xs font-black">{session.clockInAt ? new Date(session.clockInAt).toLocaleDateString('ar-EG', { weekday: 'long' }) : '-'}</p><p className="text-[10px] text-muted font-bold mt-1">{session.clockInAt ? new Date(session.clockInAt).toLocaleDateString('ar-EG') : '-'}</p></td>
                                                            <td className="p-4"><p className="font-black tabular-nums text-emerald-600">{session.clockInAt ? new Date(session.clockInAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'}</p></td>
                                                            <td className="p-4"><p className={hasMissingOut ? 'font-black text-amber-600' : 'font-black tabular-nums text-blue-600'}>{session.clockOutAt ? new Date(session.clockOutAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'ناقص'}</p></td>
                                                            <td className="p-4"><p className="text-[10px] font-black">دخول: {inLog?.branchName || session.branchName || session.branchId || '-'}</p><p className="text-[10px] font-bold text-muted mt-1">خروج: {outLog?.branchName || (session.clockOutAt ? session.branchName || session.branchId : 'لم يسجل')}</p><p className="text-[9px] text-muted mt-1">{[inLog?.deviceName || inLog?.deviceId, outLog?.deviceName || outLog?.deviceId].filter(Boolean).join(' / ') || 'معالجة ذكية'}</p></td>
                                                            <td className="p-4 font-black tabular-nums">{Number(session.totalHours || 0).toFixed(1)}</td>
                                                            <td className="p-4 text-[11px] font-black text-rose-600">{minutesLabel(session.lateMinutes)}</td>
                                                            <td className="p-4 text-[11px] font-black text-blue-600">{minutesLabel(session.earlyLeaveMinutes)}</td>
                                                            <td className="p-4 text-[11px] font-black text-amber-600">{minutesLabel(session.overtimeMinutes)}</td>
                                                            <td className="p-4"><span className={'px-2.5 py-1 rounded-lg text-[9px] font-black border ' + statusClass}>{statusLabel}</span>{Array.isArray(session.riskFlags) && session.riskFlags.length > 0 && <p className="text-[9px] text-muted mt-2 max-w-[180px] truncate">{session.riskFlags.join(' - ')}</p>}</td>
                                                            <td className="p-4"><button onClick={() => openProfilePunchDraft(session, hasMissingIn ? 'IN' : 'OUT')} className="h-9 px-3 rounded-xl border border-border/40 bg-elevated text-[10px] font-black hover:border-emerald-500/50">{hasMissingIn ? 'إضافة دخول' : hasMissingOut ? 'إضافة خروج' : 'إضافة بصمة'}</button></td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        {profileSessions.length === 0 && <div className="p-14 text-center text-xs font-black text-muted">لا توجد أيام معالجة في الفترة المختارة.</div>}
                                    </div>
                                </div>
                                {profileSessions.length === 0 && <div className="px-5 pb-5 text-center text-xs font-black text-muted lg:hidden">لا توجد أيام معالجة في الفترة المختارة.</div>}

                                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                                    <div className="rounded-2xl border border-border/30 bg-amber-500/5 p-5"><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-black flex items-center gap-2"><Clock size={16} className="text-amber-500" /> أوفر تايم</h3><span className="text-2xl font-black text-amber-600">{minutesLabel(employeeProfile.totals?.overtimeMinutes)}</span></div><p className="text-[10px] text-muted">محسوب تلقائيا من الجلسات المعالجة.</p></div>
                                    <div className="rounded-2xl border border-border/30 bg-rose-500/5 p-5"><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-black flex items-center gap-2"><AlertTriangle size={16} className="text-rose-500" /> تأخير</h3><span className="text-2xl font-black text-rose-600">{minutesLabel(employeeProfile.totals?.lateMinutes)}</span></div><p className="text-[10px] text-muted">أي تأخير ظاهر هنا محسوب من الجلسات المعالجة داخل الفترة.</p></div>
                                    <div className="rounded-2xl border border-border/30 bg-blue-500/5 p-5"><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-black flex items-center gap-2"><Clock size={16} className="text-blue-500" /> هدر / انصراف مبكر</h3><span className="text-2xl font-black text-blue-600">{minutesLabel(employeeProfile.totals?.earlyLeaveMinutes)}</span></div><p className="text-[10px] text-muted">يتحسب تلقائيا من وقت الانصراف مقارنة بجدول الشيفت.</p></div>
                                </div>

                                <details className="rounded-2xl border border-border/30 bg-elevated/30 overflow-hidden">
                                    <summary className="cursor-pointer p-4 text-xs font-black text-muted">تفاصيل فنية للبصمات الخام والماكينات</summary>
                                    <div className="overflow-auto max-h-[360px] border-t border-border/20">
                                        <table className="w-full min-w-[760px] text-xs">
                                            <thead className="bg-card text-muted text-[9px] font-black"><tr><th className="p-3 text-right">وقت</th><th className="p-3 text-right">نوع</th><th className="p-3 text-right">ماكينة</th><th className="p-3 text-right">فرع</th><th className="p-3 text-right">حالة</th></tr></thead>
                                            <tbody>{(employeeProfile.rawLogs || []).map((log: any) => (<tr key={log.id} className="border-t border-border/15"><td className="p-3 font-mono text-[10px]">{new Date(log.occurredAt).toLocaleString('ar-EG')}</td><td className="p-3 font-black">{log.eventType}</td><td className="p-3 text-[10px]">{log.deviceName || log.deviceId || (log.rawPayload?.manual ? 'Manual' : '-')}</td><td className="p-3 text-[10px]">{log.branchName || log.branchId}</td><td className="p-3 text-[10px]"><span className={'px-1.5 py-0.5 rounded text-[9px] font-black ' + (log.processingStatus === 'ACCEPTED' ? 'bg-emerald-500/10 text-emerald-500' : log.processingStatus === 'PENDING' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500')}>{log.processingStatus}</span></td></tr>))}</tbody>
                                        </table>
                                        {(employeeProfile.rawLogs || []).length === 0 && <p className="text-center text-muted text-xs py-5">لا توجد بصمات خام</p>}
                                    </div>
                                </details>
                            </div>
                        )}
                    </motion.section>
                )}

                {filter === 'tools' && (
                    <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                        <div className="bg-card/60 border border-border/35 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-border/25">
                                <h2 className="font-black text-sm flex items-center gap-2"><RefreshCw size={16} className="text-emerald-500" /> إعادة حساب الحضور</h2>
                                <p className="text-[10px] text-muted font-bold mt-1">استخدمها بعد تعديل الشيفتات أو قواعد الساعات المفتوحة لتحديث التأخير والأوفر تايم والغياب.</p>
                            </div>
                            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <select value={recalcForm.employeeId} onChange={e => setRecalcForm(prev => ({ ...prev, employeeId: e.target.value }))} className="h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500">
                                    <option value="">كل الموظفين</option>
                                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.nameAr || emp.name} {emp.employeeCode ? `(${emp.employeeCode})` : ''}</option>)}
                                </select>
                                <input type="date" value={recalcForm.startDate} onChange={e => setRecalcForm(prev => ({ ...prev, startDate: e.target.value }))} className="h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500" />
                                <input type="date" value={recalcForm.endDate} onChange={e => setRecalcForm(prev => ({ ...prev, endDate: e.target.value }))} className="h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500" />
                                <button onClick={recalculateAttendance} disabled={recalculating} className="h-11 rounded-xl bg-emerald-600 text-white text-[10px] font-black disabled:opacity-50">
                                    {recalculating ? 'جاري الحساب...' : 'إعادة الحساب'}
                                </button>
                                <button onClick={rebuildSmartDays} disabled={recalculating} className="h-11 rounded-xl bg-amber-600 text-white text-[10px] font-black disabled:opacity-50 md:col-span-2">
                                    معالجة ذكية: أول بصمة IN وآخر بصمة OUT
                                </button>
                            </div>
                        </div>

                        <div className="bg-card/60 border border-border/35 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-border/25">
                                <h2 className="font-black text-sm flex items-center gap-2"><Download size={16} className="text-blue-500" /> تصدير تقرير HR</h2>
                                <p className="text-[10px] text-muted font-bold mt-1">صدّر تقرير الحضور لكل موظف أو لكل الفرع مع الساعات والتأخير والانصراف المبكر والأوفر تايم.</p>
                            </div>
                            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <select value={reportForm.employeeId} onChange={e => setReportForm(prev => ({ ...prev, employeeId: e.target.value }))} className="h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-blue-500">
                                    <option value="">كل الموظفين</option>
                                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.nameAr || emp.name} {emp.employeeCode ? `(${emp.employeeCode})` : ''}</option>)}
                                </select>
                                <input type="date" value={reportForm.startDate} onChange={e => setReportForm(prev => ({ ...prev, startDate: e.target.value }))} className="h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                <input type="date" value={reportForm.endDate} onChange={e => setReportForm(prev => ({ ...prev, endDate: e.target.value }))} className="h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                <button onClick={exportAttendanceCsv} className="h-11 rounded-xl bg-blue-600 text-white text-[10px] font-black">CSV</button>
                                <button onClick={exportAttendanceExcel} className="h-11 rounded-xl bg-emerald-600 text-white text-[10px] font-black">Excel</button>
                                <button onClick={exportAttendancePdf} className="h-11 rounded-xl bg-rose-600 text-white text-[10px] font-black md:col-span-2">PDF</button>
                            </div>
                        </div>

                        <div className="bg-card/60 border border-border/35 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-border/25">
                                <h2 className="font-black text-sm flex items-center gap-2"><CalendarDays size={16} className="text-emerald-500" /> إغلاق فترة الحضور</h2>
                                <p className="text-[10px] text-muted font-bold mt-1">استخدمها عند قفل دورة المرتبات أو مراجعة فترة من يوم 27 ليوم 27.</p>
                            </div>
                            <div className="p-5 grid grid-cols-1 gap-3">
                                <label className="text-[10px] font-black text-muted">بداية الفترة</label>
                                <input type="date" value={monthlyCloseStartDate} onChange={e => setMonthlyCloseStartDate(e.target.value)} className="h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500" />
                                <label className="text-[10px] font-black text-muted">نهاية الفترة</label>
                                <input type="date" value={monthlyCloseEndDate} onChange={e => setMonthlyCloseEndDate(e.target.value)} className="h-11 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-emerald-500" />
                                <button onClick={monthlyCloseAttendance} disabled={monthlyClosing} className="h-11 rounded-xl bg-emerald-600 text-white text-[10px] font-black disabled:opacity-50">
                                    {monthlyClosing ? 'جاري الإغلاق...' : 'إغلاق الفترة'}
                                </button>
                            </div>
                        </div>
                    </section>
                )}

                {filter === 'monitor' && (
                    <section className="bg-card/60 border border-border/35 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-border/25 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="font-black text-sm flex items-center gap-2"><Activity size={16} className="text-amber-500" /> مراقبة سحب البصمات</h2>
                                <p className="text-[10px] text-muted font-bold mt-1">آخر مزامنة لكل ماكينة، آخر بصمة، وحالة التوقف أو الفشل.</p>
                            </div>
                            <button onClick={loadBridgeMonitor} disabled={loadingMonitor} className="h-10 px-4 rounded-xl border border-border/40 bg-elevated text-xs font-black disabled:opacity-50">
                                {loadingMonitor ? 'تحميل...' : 'تحديث'}
                            </button>
                        </div>
                        {bridgeMonitor && (
                            <div className="p-5 space-y-4">
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                                    {[
                                        ['ماكينات', bridgeMonitor.totals?.devices || 0],
                                        ['سليمة', bridgeMonitor.totals?.ok || 0],
                                        ['فشل', bridgeMonitor.totals?.failed || 0],
                                        ['متأخرة', bridgeMonitor.totals?.stale || 0],
                                        ['لم تسحب', bridgeMonitor.totals?.neverSynced || 0],
                                    ].map(([label, value]) => (
                                        <div key={String(label)} className="rounded-xl bg-elevated/50 border border-border/25 p-4">
                                            <p className="text-[9px] text-muted font-black">{label}</p>
                                            <p className="text-xl font-black mt-1 tabular-nums">{value}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="grid gap-3 md:hidden">
                                    {(bridgeMonitor.devices || []).map((row: any) => (
                                        <div key={row.device?.id} className="rounded-xl border border-border/30 bg-elevated/35 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-black">{row.device?.name || row.device?.id}</p>
                                                    <p className="mt-1 text-[10px] font-bold text-muted">{row.device?.code || row.device?.serialNumber || row.device?.ipAddress || ''}</p>
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black border ${row.health === 'OK' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : row.health === 'STALE' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>{row.health}</span>
                                            </div>
                                            <div className="mt-4 grid grid-cols-2 gap-2">
                                                <div className="rounded-lg bg-card/80 p-2">
                                                    <p className="text-[9px] font-black text-muted">آخر محاولة</p>
                                                    <p className="mt-1 text-[11px] font-black">{row.latestRun?.startedAt ? new Date(row.latestRun.startedAt).toLocaleString('ar-EG') : '-'}</p>
                                                </div>
                                                <div className="rounded-lg bg-card/80 p-2">
                                                    <p className="text-[9px] font-black text-muted">آخر بصمة</p>
                                                    <p className="mt-1 text-[11px] font-black">{row.latestLog?.occurredAt ? new Date(row.latestLog.occurredAt).toLocaleString('ar-EG') : '-'}</p>
                                                </div>
                                                <div className="rounded-lg bg-card/80 p-2">
                                                    <p className="text-[9px] font-black text-muted">مقبول / مرفوض</p>
                                                    <p className="mt-1 text-[11px] font-black tabular-nums">{row.latestRun?.logsAccepted || 0} / {row.latestRun?.logsRejected || 0}</p>
                                                </div>
                                                <div className="rounded-lg bg-card/80 p-2">
                                                    <p className="text-[9px] font-black text-muted">ملاحظات</p>
                                                    <p className="mt-1 text-[11px] font-bold text-muted">{row.latestRun?.errorMessage || row.syncConfig?.lastError || '-'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="hidden overflow-auto max-h-[58vh] md:block">
                                    <table className="w-full min-w-[960px] text-sm">
                                        <thead className="sticky top-0 bg-card z-10 border-b border-border/25">
                                            <tr className="text-[10px] text-muted font-black">
                                                <th className="p-4 text-right">الماكينة</th>
                                                <th className="p-4 text-right">الحالة</th>
                                                <th className="p-4 text-right">آخر محاولة</th>
                                                <th className="p-4 text-right">آخر بصمة</th>
                                                <th className="p-4 text-right">مقبول/مرفوض</th>
                                                <th className="p-4 text-right">ملاحظات</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(bridgeMonitor.devices || []).map((row: any) => (
                                                <tr key={row.device?.id} className="border-b border-border/15 hover:bg-elevated/35">
                                                    <td className="p-4">
                                                        <p className="font-black text-xs">{row.device?.name || row.device?.id}</p>
                                                        <p className="text-[9px] text-muted font-bold">{row.device?.code || row.device?.serialNumber || row.device?.ipAddress || ''}</p>
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black border ${row.health === 'OK' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : row.health === 'STALE' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>{row.health}</span>
                                                    </td>
                                                    <td className="p-4 text-xs">{row.latestRun?.startedAt ? new Date(row.latestRun.startedAt).toLocaleString('ar-EG') : '-'}</td>
                                                    <td className="p-4 text-xs">{row.latestLog?.occurredAt ? new Date(row.latestLog.occurredAt).toLocaleString('ar-EG') : '-'}</td>
                                                    <td className="p-4 text-xs font-black">{row.latestRun?.logsAccepted || 0} / {row.latestRun?.logsRejected || 0}</td>
                                                    <td className="p-4 text-xs text-muted">{row.latestRun?.errorMessage || row.syncConfig?.lastError || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {filter === 'daily' && (
                    <section className="flex h-[calc(100dvh-96px)] min-h-[780px] flex-col overflow-hidden rounded-2xl border border-border/35 bg-card/60">
                        <div className="space-y-4 border-b border-border/25 px-5 py-4">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                <div>
                                    <h2 className="flex items-center gap-2 text-sm font-black"><CalendarDays size={16} className="text-blue-500" /> سجل الحضور الذكي</h2>
                                    <p className="mt-1 max-w-2xl text-[11px] font-bold leading-6 text-muted">اعرض الفترة حسب الفرع أو الموظف، وشوف كل موظف مرة واحدة مع أيامه كاملة بشكل أسهل وأوضح.</p>
                                </div>
                                <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[1080px]">
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
                                        <label className="block">
                                            <span className="mb-1 block text-[9px] font-black text-muted">من</span>
                                            <input type="date" value={dailyStartDate} onChange={e => { setDailyStartDate(e.target.value); }} className="h-10 w-full rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1 block text-[9px] font-black text-muted">إلى</span>
                                            <input type="date" value={dailyEndDate} onChange={e => { setDailyEndDate(e.target.value); }} className="h-10 w-full rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                        </label>
                                        <select value={dailyBranchFilter} onChange={e => { setDailyBranchFilter(e.target.value); setDailyEmployeeFilter('ALL'); }} className="h-10 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-blue-500">
                                            <option value="ALL">كل الفروع</option>
                                            {dailyBranchOptions.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                                        </select>
                                        <select value={dailyEmployeeFilter} onChange={e => setDailyEmployeeFilter(e.target.value)} className="h-10 rounded-xl bg-elevated border border-border/40 px-3 text-xs font-bold outline-none focus:border-blue-500">
                                            <option value="ALL">كل الموظفين</option>
                                            {dailyEmployeeOptions.map(employee => <option key={employee.id} value={employee.id}>{employee.name}{employee.employeeCode ? ` (${employee.employeeCode})` : ''}</option>)}
                                        </select>
                                        <label className="relative block">
                                            <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                                            <input
                                                type="text"
                                                value={dailySearchQuery}
                                                onChange={e => setDailySearchQuery(e.target.value)}
                                                placeholder="ابحث بالاسم أو الكود"
                                                className="h-10 w-full rounded-xl border border-border/40 bg-elevated pr-9 pl-3 text-xs font-bold outline-none focus:border-blue-500"
                                            />
                                        </label>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button onClick={() => { setDailyStartDate(todayDate); setDailyEndDate(todayDate); }} className="inline-flex h-10 items-center rounded-xl border border-border/40 bg-elevated px-4 text-[11px] font-black text-muted hover:text-main">
                                            اليوم
                                        </button>
                                        <div className="inline-flex h-10 items-center rounded-xl border border-border/40 bg-elevated p-1">
                                            <button
                                                type="button"
                                                onClick={() => setDailyViewMode('cards')}
                                                className={`rounded-lg px-3 text-[11px] font-black transition ${dailyViewMode === 'cards' ? 'bg-card text-main' : 'text-muted'}`}
                                            >
                                                بطاقات
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDailyViewMode('table')}
                                                className={`rounded-lg px-3 text-[11px] font-black transition ${dailyViewMode === 'table' ? 'bg-card text-main' : 'text-muted'}`}
                                            >
                                                جدول
                                            </button>
                                        </div>
                                        <button onClick={rebuildDailySmartRange} disabled={recalculating} className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 text-[11px] font-black text-amber-700 disabled:opacity-50 dark:text-amber-300">
                                            <Sparkles size={14} />
                                            معالجة ذكية للفترة
                                        </button>
                                        <button onClick={exportDailyExcel} className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                                            <Download size={14} />
                                            Excel
                                        </button>
                                        <button onClick={exportDailyPdf} className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 text-[11px] font-black text-rose-700 dark:text-rose-300">
                                            <Download size={14} />
                                            PDF
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                                {[
                                    { label: 'السجلات الظاهرة', value: dailySummary.total, tone: 'text-main' },
                                    { label: 'مكتملة', value: dailySummary.completed, tone: 'text-emerald-600' },
                                    { label: 'مفتوحة', value: dailySummary.open, tone: 'text-amber-600' },
                                    { label: 'إجمالي الساعات', value: `${Number(dailySummary.hours || 0).toFixed(1)}h`, tone: 'text-blue-600' },
                                    { label: 'أوفر الفترة', value: minutesLabel(dailySummary.overtime), tone: 'text-violet-600' },
                                ].map(item => (
                                    <div key={item.label} className="rounded-xl border border-border/30 bg-elevated/35 px-4 py-3">
                                        <p className="text-[10px] font-black text-muted">{item.label}</p>
                                        <p className={`mt-1 text-2xl font-black tabular-nums ${item.tone}`}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                            {futureDailyRecords.length > 0 && (
                                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-amber-700 dark:text-amber-300">
                                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                        <div>
                                            <p className="flex items-center gap-2 text-xs font-black">
                                                <AlertTriangle size={15} />
                                                تنبيه وقت ماكينة البصمة
                                            </p>
                                            <p className="mt-1 text-[11px] font-bold leading-relaxed">
                                                يوجد {futureDailyRecords.length} سجل وقتُه أحدث من وقت النظام الحالي. غالبا ساعة ماكينة البصمة متقدمة، فراجع الوقت والتاريخ على الماكينة قبل الاعتماد على السجل.
                                            </p>
                                        </div>
                                        <div className="rounded-lg border border-amber-500/20 bg-card/65 px-3 py-2 text-[10px] font-black">
                                            أحدث وقت ظاهر: {new Date(futureDailyRecords[0].futureTime).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        {loadingDaily ? (
                            <div className="flex flex-1 items-center justify-center p-14 text-center text-xs font-bold text-muted">{t.loading}</div>
                        ) : groupedDailyRecords.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center p-14 text-center">
                                <CalendarDays className="mx-auto text-muted mb-3 opacity-30" size={36} />
                                <p className="text-xs font-black text-muted">لا توجد سجلات مطابقة للفلاتر الحالية.</p>
                            </div>
                        ) : (
                            <>
                                <div className="min-h-0 p-4">
                                    {dailyViewMode === 'cards' ? (
                                        <div className="space-y-4 overflow-auto max-h-[calc(100vh-340px)] min-h-[460px] pr-1">
                                            {groupedDailyRecords.map((group: any, rowIndex: number) => (
                                                <motion.article
                                                    key={group.employeeId}
                                                    initial={{ opacity: 0, y: 8 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: Math.min(rowIndex * 0.02, 0.18) }}
                                                    className="rounded-3xl border border-border/35 bg-card/70 p-4"
                                                >
                                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                                        <div className="flex items-start gap-3">
                                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-[11px] font-black text-blue-600">
                                                                {String(group.employeeName || '?').slice(0, 2).toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-black text-main">{group.employeeName}</p>
                                                                <p className="mt-1 text-[11px] font-bold text-muted">{group.employeeCode} • {group.role}</p>
                                                                <span className="mt-2 inline-flex rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[10px] font-black text-violet-700 dark:text-violet-300">
                                                                    {group.branchName}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:min-w-[520px]">
                                                            <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 px-3 py-2 text-center">
                                                                <p className="text-[10px] font-black text-muted">مكتملة</p>
                                                                <p className="mt-1 text-lg font-black text-emerald-600">{group.completed}</p>
                                                            </div>
                                                            <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-center">
                                                                <p className="text-[10px] font-black text-muted">مفتوحة</p>
                                                                <p className="mt-1 text-lg font-black text-amber-600">{group.open}</p>
                                                            </div>
                                                            <div className="rounded-2xl border border-sky-500/15 bg-sky-500/5 px-3 py-2 text-center">
                                                                <p className="text-[10px] font-black text-muted">إجازة</p>
                                                                <p className="mt-1 text-lg font-black text-sky-600">{group.leave || 0}</p>
                                                            </div>
                                                            <div className="rounded-2xl border border-rose-500/15 bg-rose-500/5 px-3 py-2 text-center">
                                                                <p className="text-[10px] font-black text-muted">غياب</p>
                                                                <p className="mt-1 text-lg font-black text-rose-600">{group.absent}</p>
                                                            </div>
                                                            <div className="rounded-2xl border border-border/25 bg-elevated/40 px-3 py-2 text-center">
                                                                <p className="text-[10px] font-black text-muted">الساعات</p>
                                                                <p className="mt-1 text-lg font-black text-main">{group.totalHours.toFixed(1)}h</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                                                        {group.days.map((day: any) => {
                                                            const isLeave = day.status === 'leave';
                                                            const isAbsent = day.status === 'absent';
                                                            const isCompleted = day.status === 'completed';
                                                            const clockIn = day.clockIn ? formatReportTimePart(day.clockIn, lang) : '-';
                                                            const clockOut = day.clockOut ? formatReportTimePart(day.clockOut, lang) : '-';
                                                            const tone = isLeave
                                                                ? 'border-sky-500/20 bg-sky-500/[0.07] text-sky-900 dark:text-sky-100'
                                                                : isAbsent
                                                                ? 'border-rose-500/20 bg-rose-500/[0.06] text-rose-800 dark:text-rose-200'
                                                                : isCompleted
                                                                ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-900 dark:text-emerald-100'
                                                                : 'border-amber-500/25 bg-amber-500/[0.10] text-amber-900 dark:text-amber-100';
                                                            return (
                                                                <div key={`${group.employeeId}-${day.dayKey}`} className={`rounded-2xl border p-3 ${tone}`}>
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <div>
                                                                            <p className="text-[10px] font-black text-muted">{day.dayLabel}</p>
                                                                            <p className="mt-1 text-xs font-black">{day.dayKey}</p>
                                                                        </div>
                                                                        <span className={`h-2.5 w-2.5 rounded-full ${isLeave ? 'bg-sky-500' : isAbsent ? 'bg-rose-500' : isCompleted ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                                    </div>
                                                                    {isLeave ? (
                                                                        <div className="mt-4">
                                                                            <p className="text-sm font-black">إجازة</p>
                                                                            <p className="mt-1 text-[10px] font-bold text-muted">{day.leaveName || 'إجازة معتمدة'}</p>
                                                                        </div>
                                                                    ) : isAbsent ? (
                                                                        <div className="mt-4">
                                                                            <p className="text-sm font-black">غياب</p>
                                                                            <p className="mt-1 text-[10px] font-bold text-muted">لا توجد بصمة لهذا اليوم</p>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            <div className="mt-4 grid grid-cols-2 gap-2">
                                                                                <div className="rounded-xl bg-card/60 px-3 py-2">
                                                                                    <p className="text-[10px] font-black text-muted">حضور</p>
                                                                                    <p className="mt-1 text-sm font-black tabular-nums">{clockIn}</p>
                                                                                </div>
                                                                                <div className="rounded-xl bg-card/60 px-3 py-2">
                                                                                    <p className="text-[10px] font-black text-muted">انصراف</p>
                                                                                    <p className="mt-1 text-sm font-black tabular-nums">{clockOut}</p>
                                                                                </div>
                                                                            </div>
                                                                            <div className="mt-3 flex items-center justify-between text-[10px] font-black">
                                                                                <span>{Number(day.totalHours || 0).toFixed(1)}h</span>
                                                                                <span className={metricTextTone(day.lateMinutes, 'late')}>{minutesLabel(day.lateMinutes)}</span>
                                                                                <span className={metricTextTone(day.overtimeMinutes, 'overtime')}>{minutesLabel(day.overtimeMinutes)}</span>
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </motion.article>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="overflow-hidden rounded-2xl border border-border/35 bg-card/60">
                                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/25 px-4 py-4">
                                                <div>
                                                    <p className="text-sm font-black text-main">عرض الفترة حسب الموظف</p>
                                                    <p className="mt-1 text-[11px] font-bold text-muted">كل موظف ظاهر مرة واحدة، وكل يوم واضح سواء فيه بصمة أو إجازة أو غياب.</p>
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-[10px] font-black">
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-500" /> مكتملة</span>
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-amber-700 dark:text-amber-300"><span className="h-2 w-2 rounded-full bg-amber-500" /> مفتوحة</span>
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-3 py-1 text-sky-700 dark:text-sky-300"><span className="h-2 w-2 rounded-full bg-sky-500" /> إجازة</span>
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-rose-700 dark:text-rose-300"><span className="h-2 w-2 rounded-full bg-rose-500" /> غياب</span>
                                                </div>
                                            </div>
                                            <div className="max-h-[calc(100vh-348px)] min-h-[460px] overflow-auto overscroll-contain">
                                                <table className="w-max min-w-full border-separate border-spacing-0 text-right text-[11px]">
                                                <thead className="sticky top-0 z-20 bg-card/95 backdrop-blur">
                                                    <tr>
                                                        <th className="sticky right-0 z-30 w-[300px] min-w-[300px] border-b border-l border-border/30 bg-card/95 px-4 py-3 text-xs font-black text-main">الموظف / الفرع</th>
                                                        <th className="w-[148px] min-w-[148px] border-b border-l border-border/30 px-3 py-3 text-center font-black text-muted">ملخص الفترة</th>
                                                        {dailyDateColumns.map((column) => (
                                                            <th key={column.key} className="w-[136px] min-w-[136px] border-b border-l border-border/30 px-3 py-3 text-center font-black text-muted">
                                                                <span className="block text-[10px]">{column.weekday}</span>
                                                                <span className="mt-1 block text-xs text-main">{column.shortDate}</span>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {groupedDailyRecords.map((group: any, rowIndex: number) => (
                                                        <motion.tr
                                                            key={group.employeeId}
                                                            initial={{ opacity: 0, y: 6 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ delay: Math.min(rowIndex * 0.015, 0.18) }}
                                                            className="group"
                                                        >
                                                            <td className="sticky right-0 z-10 w-[300px] min-w-[300px] border-b border-l border-border/25 bg-card/95 px-4 py-3 align-top">
                                                                <div className="flex items-start gap-3">
                                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-[11px] font-black text-blue-600">
                                                                        {String(group.employeeName || '?').slice(0, 2).toUpperCase()}
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="truncate text-sm font-black text-main">{group.employeeName}</p>
                                                                        <p className="mt-1 truncate text-[10px] font-bold text-muted">{group.employeeCode} • {group.role}</p>
                                                                        <span className="mt-2 inline-flex max-w-full rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[10px] font-black text-violet-700 dark:text-violet-300">
                                                                            <span className="truncate">{group.branchName}</span>
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="border-b border-l border-border/25 bg-elevated/25 px-3 py-3 align-top">
                                                                <div className="grid gap-1 text-center font-black">
                                                                    <div className="rounded-lg bg-emerald-500/10 py-1 text-emerald-700 dark:text-emerald-300">{group.completed} مكتملة</div>
                                                                    <div className="rounded-lg bg-amber-500/10 py-1 text-amber-700 dark:text-amber-300">{group.open} مفتوحة</div>
                                                                    <div className="rounded-lg bg-sky-500/10 py-1 text-sky-700 dark:text-sky-300">{group.leave || 0} إجازة</div>
                                                                    <div className="rounded-lg bg-rose-500/10 py-1 text-rose-700 dark:text-rose-300">{group.absent} غياب</div>
                                                                    <div className="pt-1 text-xs tabular-nums text-main">{group.totalHours.toFixed(1)}h</div>
                                                                </div>
                                                            </td>
                                                            {group.days.map((day: any) => {
                                                                const isLeave = day.status === 'leave';
                                                                const isAbsent = day.status === 'absent';
                                                                const isCompleted = day.status === 'completed';
                                                                const clockIn = day.clockIn ? formatReportTimePart(day.clockIn, lang) : '-';
                                                                const clockOut = day.clockOut ? formatReportTimePart(day.clockOut, lang) : '-';
                                                                const tone = isLeave
                                                                    ? 'border-sky-500/20 bg-sky-500/[0.07] text-sky-900 dark:text-sky-100'
                                                                    : isAbsent
                                                                    ? 'border-rose-500/20 bg-rose-500/[0.06] text-rose-800 dark:text-rose-200'
                                                                    : isCompleted
                                                                    ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-900 dark:text-emerald-100'
                                                                    : 'border-amber-500/25 bg-amber-500/[0.10] text-amber-900 dark:text-amber-100';
                                                                return (
                                                                    <td key={`${group.employeeId}-${day.dayKey}`} className="border-b border-l border-border/20 bg-card/45 p-2 align-top group-hover:bg-elevated/40">
                                                                        <div className={`min-h-[118px] rounded-xl border p-2.5 ${tone}`}>
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <span className={`h-2 w-2 rounded-full ${isLeave ? 'bg-sky-500' : isAbsent ? 'bg-rose-500' : isCompleted ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                                                <span className="text-[10px] font-black text-muted">{day.dayLabel}</span>
                                                                            </div>
                                                                            {isLeave ? (
                                                                                <div className="mt-4 text-center">
                                                                                    <p className="text-xs font-black">إجازة معتمدة</p>
                                                                                    <p className="mt-1 text-[10px] font-bold text-muted">{day.leaveName || 'إجازة'}</p>
                                                                                </div>
                                                                            ) : isAbsent ? (
                                                                                <div className="mt-4 text-center">
                                                                                    <p className="text-xs font-black">غياب</p>
                                                                                    <p className="mt-1 text-[10px] font-bold text-muted">لا توجد بصمة</p>
                                                                                </div>
                                                                            ) : (
                                                                                <>
                                                                                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-black">
                                                                                        <div>
                                                                                            <p className="text-muted">حضور</p>
                                                                                            <p className="mt-1 tabular-nums text-main">{clockIn}</p>
                                                                                        </div>
                                                                                        <div>
                                                                                            <p className="text-muted">انصراف</p>
                                                                                            <p className="mt-1 tabular-nums text-main">{clockOut}</p>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="mt-3 flex items-center justify-between border-t border-border/20 pt-2 text-[10px] font-black">
                                                                                        <span className="tabular-nums text-main">{Number(day.totalHours || 0).toFixed(1)}h</span>
                                                                                        <span className={metricTextTone(day.lateMinutes, 'late')}>{minutesLabel(day.lateMinutes)}</span>
                                                                                    </div>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                );
                                                            })}
                                                        </motion.tr>
                                                    ))}
                                                </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>                            </>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}
