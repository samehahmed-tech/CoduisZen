import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CheckCircle,
    Clock,
    Edit3,
    Eraser,
    Fingerprint,
    Globe,
    Link,
    Loader2,
    Plus,
    Power,
    RefreshCw,
    Search,
    Server,
    TestTube,
    Timer,
    Trash2,
    Unlink,
    Users,
    Wifi,
    X,
} from 'lucide-react';
import { apiRequest } from '@/services/api/core';
import { branchesApi } from '@/services/api/branches';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';

interface Device {
    id: string;
    branchId: string;
    name: string;
    code?: string;
    vendor: string;
    model?: string;
    sourceType: string;
    ipAddress?: string;
    port?: number;
    serialNumber?: string;
    communicationMode?: string;
    branchGatewayId?: string;
    isActive: boolean;
    lastSeenAt?: string;
    lastSyncAt?: string;
    syncConfig?: {
        autoEnabled: boolean;
        intervalMinutes: number;
        failureCount: number;
        lastError?: string | null;
        lastFailedAt?: string | null;
        lastSuccessAt?: string | null;
        lastAttemptAt?: string | null;
        lastDurationMs?: number;
        lastIngested?: number;
        lastSkipped?: number;
        autoClearAfterSync?: boolean;
        lastAutoClearAt?: string | null;
        lastAutoClearError?: string | null;
    };
}

interface DeviceMapping {
    id: number;
    deviceId: string;
    employeeId: string;
    deviceUserId: string;
    employeeCodeSnapshot?: string;
    isActive: boolean;
    employeeName?: string;
    employeeNameAr?: string;
    employeeRole?: string;
    employeeBranchId?: string;
    createdAt?: string;
}

interface Employee {
    id: string;
    name: string;
    nameAr?: string;
    employeeCode?: string;
    attendanceCode?: string;
    role?: string;
    branchId?: string;
    isActive?: boolean;
}

interface Branch {
    id: string;
    name?: string;
    nameAr?: string;
    code?: string;
}

interface DeviceLogStats {
    success: boolean;
    deviceId: string;
    records: number | null;
    users: number;
    capacity: number | null;
    checkedAt: string;
    message?: string;
    error?: string;
}

interface SyncRun {
    id: string;
    branchId?: string;
    deviceId?: string;
    sourceType: string;
    status: string;
    logsReceived?: number;
    logsAccepted?: number;
    logsRejected?: number;
    errorMessage?: string | null;
    metadata?: any;
    completedAt?: string | null;
}

interface SyncResult {
    deviceId: string;
    deviceName: string;
    success: boolean;
    logsReceived: number;
    logsIngested: number;
    logsSkipped: number;
    unknownEmployees?: number;
    sessionsOpened?: number;
    sessionsClosed?: number;
    errors?: string[];
    durationMs?: number;
}

interface BridgeMonitorRow {
    device: Device;
    health: 'OK' | 'FAILED' | 'STALE' | 'NEVER_SYNCED' | string;
    latestRun?: SyncRun | null;
    latestLog?: any;
    syncConfig?: Device['syncConfig'];
    minutesSinceSuccess?: number | null;
    staleAfterMinutes?: number;
}

type BridgeTestState = {
    status: 'CHECKING' | 'OK' | 'FAILED' | 'OFFLINE';
    message: string;
    checkedAt: string;
    commandId?: string;
};

type SyncProgressStatus = 'SENDING' | 'QUEUED' | 'IN_PROGRESS' | 'SAVING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT';

interface SyncProgressState {
    deviceId: string;
    deviceName: string;
    mode: 'BRIDGE' | 'DIRECT';
    status: SyncProgressStatus;
    title: string;
    detail: string;
    progress: number;
    commandId?: string;
    gatewayId?: string;
    logsRead?: number;
    logsSaved?: number;
    logsSkipped?: number;
    attempt?: number;
    startedAt: string;
}

type DeviceConnectionMode = 'LAN' | 'BRANCH_BRIDGE' | 'USB';

type DeviceFormState = {
    id?: string;
    branchId: string;
    name: string;
    code: string;
    ipAddress: string;
    port: number;
    serialNumber: string;
    communicationMode: DeviceConnectionMode;
    branchGatewayId: string;
    isActive: boolean;
};

const emptyDeviceForm: DeviceFormState = {
    branchId: '',
    name: '',
    code: '',
    ipAddress: '',
    port: 4370,
    serialNumber: '',
    communicationMode: 'LAN',
    branchGatewayId: '',
    isActive: true,
};

const inputClass = 'w-full h-11 rounded-xl border border-border/60 bg-elevated/70 px-3 text-sm font-bold outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10';
const labelClass = 'mb-2 block text-[11px] font-black text-muted';
const iconButtonClass = 'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card text-muted transition hover:border-violet-500/40 hover:text-violet-500 disabled:cursor-not-allowed disabled:opacity-40';

function branchTitle(branches: Branch[], branchId: string) {
    const branch = branches.find(item => item.id === branchId);
    return branch?.nameAr || branch?.name || branch?.code || branchId || 'بدون فرع';
}

function modeLabel(device: Pick<Device, 'communicationMode'>) {
    if (device.communicationMode === 'BRANCH_BRIDGE') return 'اتصال الفرع';
    if (device.communicationMode === 'USB') return 'ملف أو USB';
    return 'اتصال مباشر';
}

function modeTone(device: Pick<Device, 'communicationMode'>) {
    if (device.communicationMode === 'BRANCH_BRIDGE') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600';
    if (device.communicationMode === 'USB') return 'border-slate-500/25 bg-slate-500/10 text-slate-500';
    return 'border-sky-500/25 bg-sky-500/10 text-sky-600';
}

function timeAgo(value?: string) {
    if (!value) return 'لم يحدث بعد';
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return 'غير معروف';
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return 'منذ ' + minutes + ' دقيقة';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return 'منذ ' + hours + ' ساعة';
    return 'منذ ' + Math.floor(hours / 24) + ' يوم';
}

function employeeTitle(employee: Employee) {
    const code = employee.attendanceCode || employee.employeeCode;
    return (employee.nameAr || employee.name || 'موظف') + (code ? ' - ' + code : '');
}

function deviceIsBridge(device: Device) {
    return device.communicationMode === 'BRANCH_BRIDGE';
}

function deviceIsDirect(device: Device) {
    return !deviceIsBridge(device) && device.communicationMode !== 'USB';
}

function bridgeHealthLabel(health?: string) {
    if (health === 'OK') return 'متصلة';
    if (health === 'FAILED') return 'غير متصلة';
    if (health === 'STALE') return 'متأخرة';
    if (health === 'NEVER_SYNCED') return 'لم يتم السحب بعد';
    return 'غير معروف';
}

function bridgeHealthTone(health?: string) {
    if (health === 'OK') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700';
    if (health === 'FAILED') return 'border-rose-500/25 bg-rose-500/10 text-rose-700';
    if (health === 'STALE') return 'border-amber-500/25 bg-amber-500/10 text-amber-700';
    return 'border-slate-500/20 bg-slate-500/10 text-slate-600';
}

function getBridgeRunCounts(run: SyncRun) {
    const summary = run.metadata?.summary;
    return {
        logsRead: Number(run.logsReceived || summary?.totalFetched || summary?.totalPulled || 0),
        logsSaved: Number(run.logsAccepted || summary?.push?.accepted || summary?.accepted || 0),
        logsSkipped: Number(run.logsRejected || summary?.push?.duplicates || summary?.totalFilteredOut || summary?.duplicates || 0),
    };
}

function friendlyBridgeError(run: SyncRun) {
    const summary = run.metadata?.summary;
    const firstError = summary?.errors?.[0] || run.metadata?.errors?.[0];
    const summaryDevices = summary?.devices && typeof summary.devices === 'object' ? Object.values(summary.devices) : [];
    const firstDeviceError = summaryDevices.find((device: any) => device?.lastError) as any;
    const raw = String(run.errorMessage || firstError?.message || firstError?.code || firstDeviceError?.lastError || '').trim();
    if (!raw) return 'تعذر سحب البصمات. راجع حالة الماكينة وحاول مرة أخرى.';
    if (/DEVICE_UNREACHABLE|ECONN|ETIMEDOUT|EHOST|ENET|timeout|not reachable|refused/i.test(raw)) {
        return 'ماكينة البصمة غير متصلة حاليا. تأكد من تشغيل الماكينة واتصالها بالشبكة داخل الفرع ثم جرّب السحب مرة أخرى.';
    }
    return raw;
}
function buildBridgeProgress(run: SyncRun, attempt: number, gatewayId?: string): Pick<SyncProgressState, 'status' | 'title' | 'detail' | 'progress' | 'logsRead' | 'logsSaved' | 'logsSkipped' | 'attempt'> {
    const status = String(run.status || '').toUpperCase();
    const operation = String(run.metadata?.operation || run.metadata?.command || '').toUpperCase();
    const counts = getBridgeRunCounts(run);
    const summary = run.metadata?.summary;
    const deviceErrors = Array.isArray(summary?.errors) ? summary.errors : [];
    const summaryDevices = summary?.devices && typeof summary.devices === 'object' ? Object.values(summary.devices) : [];
    const summaryAttempted = Number(summary?.devicesAttempted || 0);
    const summarySucceeded = Number(summary?.devicesSucceeded || 0);
    const allAttemptedDevicesFailed = summaryAttempted > 0 && summarySucceeded === 0;
    const hasDeviceFailures = deviceErrors.length > 0 || summaryDevices.some((device: any) => device?.lastError) || allAttemptedDevicesFailed || Boolean(run.errorMessage);

    if (status === 'COMPLETED' || status === 'COMPLETED_WITH_ERRORS') {
        if (operation === 'RESTART_DEVICE') {
            return {
                status: 'COMPLETED',
                title: 'تم إرسال أمر إعادة التشغيل',
                detail: 'تم تنفيذ أمر إعادة تشغيل ماكينة البصمة.',
                progress: 100,
                ...counts,
                attempt,
            };
        }
        if (operation === 'CLEAR_DEVICE_LOGS_WITH_BACKUP' || operation === 'CLEAR_LOGS_BACKUP') {
            return {
                status: 'COMPLETED',
                title: 'تم تفريغ السجلات بأمان',
                detail: 'تم حفظ نسخة احتياطية قبل تفريغ سجلات الماكينة.',
                progress: 100,
                ...counts,
                attempt,
            };
        }
        const rejectedAll = counts.logsRead > 0 && counts.logsSaved === 0 && Number(run.logsRejected || 0) >= counts.logsRead;
        if (status === 'COMPLETED_WITH_ERRORS' || rejectedAll || hasDeviceFailures) {
            return {
                status: 'FAILED',
                title: counts.logsRead > 0 ? 'السحب تم جزئيا' : 'الماكينة غير متصلة',
                detail: friendlyBridgeError(run),
                progress: 100,
                ...counts,
                attempt,
            };
        }
        return {
            status: 'COMPLETED',
            title: counts.logsSaved > 0 ? 'اكتمل سحب البصمات' : 'لا توجد بصمات جديدة',
            detail: counts.logsSaved > 0
                ? 'تمت قراءة سجلات الماكينة وحفظ البصمات الجديدة.'
                : 'لم تصل بصمات جديدة من جهاز الفرع. لو الماكينة مطفية أو الشبكة فاصلة، حدّث برنامج جهاز الفرع ثم جرّب الاختبار والسحب مرة أخرى.',
            progress: 100,
            ...counts,
            attempt,
        };
    }

    if (status === 'FAILED') {
        return {
            status: 'FAILED',
            title: 'فشل سحب البصمات',
            detail: friendlyBridgeError(run),
            progress: 100,
            ...counts,
            attempt,
        };
    }

    if (status === 'IN_PROGRESS' || status === 'CLAIMED' || status === 'RUNNING') {
        return {
            status: counts.logsRead > 0 || counts.logsSaved > 0 ? 'SAVING' : 'IN_PROGRESS',
            title: counts.logsRead > 0 || counts.logsSaved > 0 ? 'جاري حفظ البصمات' : 'جاري الاتصال بالماكينة',
            detail: counts.logsRead > 0 || counts.logsSaved > 0
                ? 'تمت قراءة سجلات من الماكينة وجاري حفظ الجديد فقط.'
                : 'جاري محاولة الوصول إلى ماكينة البصمة داخل الفرع.',
            progress: counts.logsRead > 0 || counts.logsSaved > 0 ? 72 : 52,
            ...counts,
            attempt,
        };
    }

    return {
        status: 'QUEUED',
        title: 'في انتظار جهاز الفرع',
        detail: 'تم إرسال طلب السحب، وجاري انتظار جهاز الفرع يبدأ التواصل مع ماكينة البصمة.',
        progress: attempt > 8 ? 38 : 28,
        ...counts,
        attempt,
    };
}
export default function BiometricDeviceManager() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [modeFilter, setModeFilter] = useState<'ALL' | DeviceConnectionMode>('ALL');
    const [syncing, setSyncing] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);
    const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
    const [syncProgress, setSyncProgress] = useState<SyncProgressState | null>(null);
    const [showDeviceModal, setShowDeviceModal] = useState(false);
    const [editingDevice, setEditingDevice] = useState<Device | null>(null);
    const [deviceForm, setDeviceForm] = useState<DeviceFormState>(emptyDeviceForm);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
    const [mappings, setMappings] = useState<DeviceMapping[]>([]);
    const [loadingMappings, setLoadingMappings] = useState(false);
    const [mappingSearch, setMappingSearch] = useState('');
    const [newMappingDeviceUserId, setNewMappingDeviceUserId] = useState('');
    const [newMappingEmployeeId, setNewMappingEmployeeId] = useState('');
    const [savingMapping, setSavingMapping] = useState(false);
    const [deviceLogStats, setDeviceLogStats] = useState<Record<string, DeviceLogStats>>({});
    const [loadingLogStats, setLoadingLogStats] = useState<string | null>(null);
    const [performingAction, setPerformingAction] = useState<string | null>(null);
    const [savingSyncSettings, setSavingSyncSettings] = useState<string | null>(null);
    const [deletingDevice, setDeletingDevice] = useState<string | null>(null);
    const [bridgeMonitorByDevice, setBridgeMonitorByDevice] = useState<Record<string, BridgeMonitorRow>>({});
    const [bridgeTests, setBridgeTests] = useState<Record<string, BridgeTestState>>({});
    const [testingBridge, setTestingBridge] = useState<string | null>(null);
    const [rangeDevice, setRangeDevice] = useState<Device | null>(null);
    const [rangeForm, setRangeForm] = useState({ startDate: '', endDate: '' });

    const loadDevices = useCallback(async () => {
        try {
            setLoading(true);
            const data = await apiRequest<Device[]>('/attendance-ops/devices');
            setDevices(data || []);
        } catch (err: any) {
            if (err?.status !== 401 && err?.status !== 403) {
                toast.error('فشل تحميل أجهزة البصمة');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDevices();
    }, [loadDevices]);

    const loadBridgeMonitor = useCallback(async () => {
        try {
            const data = await apiRequest<{ devices: BridgeMonitorRow[] }>('/attendance-ops/bridge-monitor');
            const next: Record<string, BridgeMonitorRow> = {};
            for (const row of data.devices || []) {
                if (row.device?.id) next[row.device.id] = row;
            }
            setBridgeMonitorByDevice(next);
        } catch {
            setBridgeMonitorByDevice({});
        }
    }, []);

    useEffect(() => {
        loadBridgeMonitor();
    }, [loadBridgeMonitor]);

    useEffect(() => {
        apiRequest<Employee[]>('/hr/employees')
            .then(data => setEmployees(data || []))
            .catch(() => setEmployees([]));
        branchesApi.getAll()
            .then(data => setBranches(data || []))
            .catch(() => setBranches([]));
    }, []);

    const stats = useMemo(() => {
        return {
            total: devices.length,
            active: devices.filter(device => device.isActive).length,
            direct: devices.filter(device => deviceIsDirect(device)).length,
            bridge: devices.filter(device => deviceIsBridge(device)).length,
            waiting: devices.filter(device => device.isActive && !device.lastSyncAt).length,
        };
    }, [devices]);

    const filteredDevices = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return devices.filter(device => {
            const matchesMode = modeFilter === 'ALL' || device.communicationMode === modeFilter || (modeFilter === 'LAN' && !device.communicationMode);
            const branch = branchTitle(branches, device.branchId).toLowerCase();
            const matchesQuery = !needle
                || device.name.toLowerCase().includes(needle)
                || (device.code || '').toLowerCase().includes(needle)
                || (device.ipAddress || '').toLowerCase().includes(needle)
                || (device.branchGatewayId || '').toLowerCase().includes(needle)
                || branch.includes(needle);
            return matchesMode && matchesQuery;
        });
    }, [branches, devices, modeFilter, query]);

    const mappedEmployeeIds = useMemo(() => new Set(mappings.map(mapping => mapping.employeeId)), [mappings]);

    const filteredEmployeesForMapping = useMemo(() => {
        const needle = mappingSearch.trim().toLowerCase();
        return employees.filter(employee => {
            if (!needle) return true;
            return (employee.name || '').toLowerCase().includes(needle)
                || (employee.nameAr || '').includes(mappingSearch)
                || (employee.employeeCode || '').toLowerCase().includes(needle)
                || (employee.attendanceCode || '').toLowerCase().includes(needle)
                || employee.id.toLowerCase().includes(needle);
        });
    }, [employees, mappingSearch]);

    const resetDeviceForm = () => {
        setDeviceForm(emptyDeviceForm);
        setEditingDevice(null);
        setTestResult(null);
    };

    const openCreateModal = () => {
        resetDeviceForm();
        setShowDeviceModal(true);
    };

    const openEditModal = (device: Device) => {
        setEditingDevice(device);
        setDeviceForm({
            id: device.id,
            branchId: device.branchId,
            name: device.name || '',
            code: device.code || '',
            ipAddress: device.ipAddress || '',
            port: device.port || 4370,
            serialNumber: device.serialNumber || '',
            communicationMode: (device.communicationMode === 'BRANCH_BRIDGE' || device.communicationMode === 'USB' ? device.communicationMode : 'LAN') as DeviceConnectionMode,
            branchGatewayId: device.branchGatewayId || '',
            isActive: device.isActive !== false,
        });
        setTestResult(null);
        setShowDeviceModal(true);
    };

    const closeDeviceModal = () => {
        setShowDeviceModal(false);
        resetDeviceForm();
    };

    const handleSaveDevice = async () => {
        if (!deviceForm.branchId) return toast.error('اختار الفرع الأول');
        if (!deviceForm.name.trim()) return toast.error('اكتب اسم الماكينة');
        if (deviceForm.communicationMode === 'LAN' && !deviceForm.ipAddress.trim()) return toast.error('اكتب IP الماكينة');
        if (deviceForm.communicationMode === 'BRANCH_BRIDGE' && !deviceForm.branchGatewayId.trim()) return toast.error('اكتب Gateway ID الخاص بالبريدج');

        try {
            await apiRequest('/attendance-ops/devices', {
                method: 'POST',
                body: JSON.stringify({
                    id: deviceForm.id,
                    name: deviceForm.name.trim(),
                    branchId: deviceForm.branchId,
                    code: deviceForm.code.trim() || undefined,
                    ipAddress: deviceForm.ipAddress.trim() || undefined,
                    port: deviceForm.ipAddress.trim() ? Number(deviceForm.port || 4370) : undefined,
                    serialNumber: deviceForm.serialNumber.trim() || undefined,
                    vendor: editingDevice?.vendor || 'ZKTeco',
                    model: editingDevice?.model,
                    communicationMode: deviceForm.communicationMode,
                    branchGatewayId: deviceForm.communicationMode === 'BRANCH_BRIDGE' ? deviceForm.branchGatewayId.trim() : undefined,
                    sourceType: editingDevice?.sourceType || 'BIOMETRIC_ZK',
                    isActive: deviceForm.isActive,
                }),
            });
            toast.success('تم حفظ إعدادات الماكينة');
            closeDeviceModal();
            loadDevices();
        } catch (err: any) {
            toast.error(err.message || 'فشل حفظ إعدادات الماكينة');
        }
    };

    const handleTestConnection = async () => {
        if (!deviceForm.ipAddress.trim()) return toast.error('اكتب IP الماكينة قبل الاختبار');
        setTesting(true);
        setTestResult(null);
        try {
            const result = await apiRequest<any>('/attendance-ops/devices/test-connection', {
                method: 'POST',
                body: JSON.stringify({ ip: deviceForm.ipAddress.trim(), port: Number(deviceForm.port || 4370) }),
            });
            setTestResult(result);
            if (result.connected) {
                toast.success('الاتصال ناجح');
            } else {
                toast.error(result.error || 'فشل الاتصال بالماكينة');
            }
        } catch (err: any) {
            toast.error(err.message || 'فشل اختبار الاتصال');
        } finally {
            setTesting(false);
        }
    };

    const handleDirectSync = async (device: Device, options?: { startDate?: string; endDate?: string }) => {
        setSyncing(device.id);
        setSyncProgress({
            deviceId: device.id,
            deviceName: device.name,
            mode: 'DIRECT',
            status: 'SENDING',
            title: 'جاري الاتصال بالماكينة مباشرة',
            detail: 'السيستم بيحاول يتصل بعنوان IP الخاص بالماكينة ويقرأ البصمات الجديدة.',
            progress: 18,
            startedAt: new Date().toISOString(),
        });
        try {
            const result = await apiRequest<SyncResult>('/attendance-ops/devices/' + device.id + '/sync', { method: 'POST', body: JSON.stringify(options || {}) });
            setSyncResults([result]);
            setSyncProgress(prev => prev && prev.deviceId === device.id ? {
                ...prev,
                status: result.success ? 'COMPLETED' : 'FAILED',
                title: result.success ? 'اكتمل سحب البصمات' : 'انتهى السحب مع أخطاء',
                detail: result.success ? 'تم حفظ السجلات الجديدة وتجاهل المكرر تلقائيا.' : (result.errors?.[0] || 'راجع تفاصيل النتيجة الأخيرة.'),
                progress: 100,
                logsRead: result.logsReceived,
                logsSaved: result.logsIngested,
                logsSkipped: result.logsSkipped,
            } : prev);
            if (result.success) {
                toast.success('تم سحب ' + result.logsIngested + ' بصمة من ' + device.name);
            } else {
                toast.error(result.errors?.[0] || 'انتهى السحب مع وجود أخطاء');
            }
            loadDevices();
            loadBridgeMonitor();
        } catch (err: any) {
            setSyncProgress(prev => prev && prev.deviceId === device.id ? {
                ...prev,
                status: 'FAILED',
                title: 'فشل الاتصال بالماكينة',
                detail: err.message || 'تعذر سحب البصمات مباشرة من الماكينة.',
                progress: 100,
            } : prev);
            toast.error(err.message || 'فشل سحب البصمات');
        } finally {
            setSyncing(null);
        }
    };

    const waitForBridgeSyncResult = async (commandId: string, device: Device, gatewayId?: string) => {
        const maxAttempts = 40;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 1200 : 3000));
            const run = await apiRequest<SyncRun>('/attendance-ops/sync-runs/' + commandId);
            const status = String(run.status || '').toUpperCase();
            const nextProgress = buildBridgeProgress(run, attempt + 1, gatewayId);
            setSyncProgress(prev => prev && prev.commandId === commandId ? {
                ...prev,
                ...nextProgress,
                gatewayId: gatewayId || prev.gatewayId,
            } : prev);
            if (['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'].includes(status)) {
                const summary = run.metadata?.summary;
                const bridgeErrors = Array.isArray(summary?.errors) ? summary.errors : [];
                const result: SyncResult = {
                    deviceId: device.id,
                    deviceName: device.name,
                    success: status !== 'FAILED' && bridgeErrors.length === 0 && !(status === 'COMPLETED_WITH_ERRORS' && Number(run.logsAccepted || 0) === 0 && Number(run.logsRejected || 0) > 0),
                    logsReceived: Number(run.logsReceived || summary?.totalFetched || 0),
                    logsIngested: Number(run.logsAccepted || summary?.push?.accepted || 0),
                    logsSkipped: Number(run.logsRejected || summary?.push?.duplicates || summary?.totalFilteredOut || 0),
                    unknownEmployees: undefined,
                    errors: run.errorMessage ? [friendlyBridgeError(run)] : (bridgeErrors[0]?.message ? [bridgeErrors[0].message] : (run.metadata?.errors?.[0]?.code ? [run.metadata.errors[0].code] : [])),
                    durationMs: 0,
                };
                setSyncResults([result]);
                if (result.success) {
                    const operation = String(run.metadata?.operation || run.metadata?.command || '').toUpperCase();
                    if (operation === 'RESTART_DEVICE') {
                        toast.success('تم إرسال أمر إعادة التشغيل للماكينة عبر البريدج');
                    } else if (operation === 'CLEAR_DEVICE_LOGS_WITH_BACKUP' || operation === 'CLEAR_LOGS_BACKUP') {
                        toast.success('تم تفريغ اللوجات بعد حفظ Backup بعدد ' + result.logsIngested + ' سجل');
                    } else {
                        toast.success('اكتمل السحب: تم قراءة ' + result.logsReceived + ' بصمة، وحفظ ' + result.logsIngested + ' جديد.');
                    }
                } else {
                    toast.error(run.errorMessage || 'فشل أمر السحب عبر البريدج');
                }
                loadDevices();
                loadBridgeMonitor();
                return result;
            }
        }
        setSyncProgress(prev => prev && prev.commandId === commandId ? {
            ...prev,
            status: 'TIMEOUT',
            title: 'البريدج لم يرد حتى الآن',
            detail: 'الأمر لسه موجود على السيرفر. لو فضلت الرسالة دي، اتأكد أن خدمة البريدج شغالة وأن Gateway ID مطابق: ' + (prev.gatewayId || gatewayId || 'غير محدد'),
            progress: 82,
        } : prev);
        toast('أمر السحب اتبعت للبريدج ولسه قيد التنفيذ. راجع آخر نتيجة بعد لحظات.');
        return null;
    };

    const handleBridgeSync = async (device: Device, options?: { startDate?: string; endDate?: string }) => {
        setSyncing(device.id);
        setSyncProgress({
            deviceId: device.id,
            deviceName: device.name,
            mode: 'BRIDGE',
            status: 'SENDING',
            title: 'جاري إرسال أمر السحب للبريدج',
            detail: 'السيستم بيجهز أمر السحب ويبعته للبريدج الخاص بالفرع.',
            progress: 12,
            startedAt: new Date().toISOString(),
        });
        try {
            const result = await apiRequest<{ commandId: string; gatewayId: string; reused?: boolean }>('/attendance-ops/devices/' + device.id + '/bridge-sync', { method: 'POST', body: JSON.stringify(options || {}) });
            setSyncProgress(prev => prev && prev.deviceId === device.id ? {
                ...prev,
                status: 'QUEUED',
                title: result.reused ? 'يوجد أمر سحب شغال بالفعل' : 'تم إرسال الأمر للبريدج',
                detail: 'في انتظار خدمة البريدج تلتقط الأمر من Gateway ID: ' + result.gatewayId,
                progress: 26,
                commandId: result.commandId,
                gatewayId: result.gatewayId,
            } : prev);
            toast.success((result.reused ? 'يوجد أمر سحب شغال بالفعل على البريدج: ' : 'تم إرسال أمر السحب للبريدج: ') + result.gatewayId);
            await waitForBridgeSyncResult(result.commandId, device, result.gatewayId);
        } catch (err: any) {
            setSyncProgress(prev => prev && prev.deviceId === device.id ? {
                ...prev,
                status: 'FAILED',
                title: 'فشل إرسال أمر السحب',
                detail: err.message || 'السيستم لم يقدر يرسل أمر السحب للبريدج.',
                progress: 100,
            } : prev);
            toast.error(err.message || 'فشل إرسال أمر السحب للبريدج');
        } finally {
            setSyncing(null);
        }
    };

    const handleTestBridgeConnection = async (device: Device) => {
        if (!deviceIsBridge(device)) return toast.error('اختبار البريدج متاح للماكينات المربوطة بالبريدج فقط');
        if (!device.branchGatewayId) return toast.error('اكتب Gateway ID للماكينة الأول');

        setTestingBridge(device.id);
        setBridgeTests(prev => ({
            ...prev,
            [device.id]: {
                status: 'CHECKING',
                message: 'جاري إرسال اختبار للبريدج وانتظار الرد...',
                checkedAt: new Date().toISOString(),
            },
        }));

        try {
            const result = await apiRequest<{ commandId: string; gatewayId: string }>('/attendance-ops/devices/' + device.id + '/bridge-test', { method: 'POST' });
            let finalRun: SyncRun | null = null;
            for (let attempt = 0; attempt < 15; attempt++) {
                await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 1200 : 2500));
                const run = await apiRequest<SyncRun>('/attendance-ops/sync-runs/' + result.commandId);
                const status = String(run.status || '').toUpperCase();
                if (['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'].includes(status)) {
                    finalRun = run;
                    break;
                }
                setBridgeTests(prev => ({
                    ...prev,
                    [device.id]: {
                        status: 'CHECKING',
                        message: status === 'IN_PROGRESS' ? 'البريدج استلم الاختبار وجاري الرد...' : 'الاختبار في انتظار البريدج...',
                        checkedAt: new Date().toISOString(),
                        commandId: result.commandId,
                    },
                }));
            }

            if (finalRun && String(finalRun.status).toUpperCase() !== 'FAILED') {
                setBridgeTests(prev => ({
                    ...prev,
                    [device.id]: {
                        status: 'OK',
                        message: 'البريدج متصل ورد على الاختبار بنجاح.',
                        checkedAt: new Date().toISOString(),
                        commandId: result.commandId,
                    },
                }));
                toast.success('البريدج متصل: ' + result.gatewayId);
                await loadBridgeMonitor();
                await loadDevices();
            } else if (finalRun?.errorMessage) {
                setBridgeTests(prev => ({
                    ...prev,
                    [device.id]: {
                        status: 'FAILED',
                        message: finalRun.errorMessage || 'البريدج رد بمشكلة.',
                        checkedAt: new Date().toISOString(),
                        commandId: result.commandId,
                    },
                }));
                toast.error(finalRun.errorMessage || 'اختبار البريدج فشل');
            } else {
                setBridgeTests(prev => ({
                    ...prev,
                    [device.id]: {
                        status: 'OFFLINE',
                        message: 'البريدج لم يرد. راجع الخدمة على جهاز الفرع و Gateway ID واتصال السيرفر.',
                        checkedAt: new Date().toISOString(),
                        commandId: result.commandId,
                    },
                }));
                toast.error('البريدج لم يرد حتى الآن');
            }
        } catch (err: any) {
            setBridgeTests(prev => ({
                ...prev,
                [device.id]: {
                    status: 'FAILED',
                    message: err.message || 'فشل إرسال اختبار البريدج',
                    checkedAt: new Date().toISOString(),
                },
            }));
            toast.error(err.message || 'فشل اختبار اتصال البريدج');
        } finally {
            setTestingBridge(null);
        }
    };

    const handleSyncDevice = (device: Device, options?: { startDate?: string; endDate?: string }) => {
        if (deviceIsBridge(device)) return handleBridgeSync(device, options);
        return handleDirectSync(device, options);
    };

    const openRangeSync = (device: Device) => {
        setRangeDevice(device);
        setRangeForm({ startDate: '', endDate: '' });
    };

    const submitRangeSync = async () => {
        if (!rangeDevice) return;
        if (!rangeForm.startDate && !rangeForm.endDate) {
            toast.error('حدد بداية أو نهاية الفترة');
            return;
        }
        await handleSyncDevice(rangeDevice, {
            startDate: rangeForm.startDate || undefined,
            endDate: rangeForm.endDate || undefined,
        });
        setRangeDevice(null);
    };

    const handleSyncAll = async () => {
        setSyncing('ALL');
        try {
            const data = await apiRequest<{ totalDevices: number; successCount: number; totalIngested: number; results: SyncResult[] }>('/attendance-ops/sync-all', { method: 'POST' });
            setSyncResults(data.results || []);
            toast.success('تمت مزامنة ' + data.successCount + ' من ' + data.totalDevices + ' ماكينة');
            loadDevices();
            loadBridgeMonitor();
        } catch (err: any) {
            toast.error(err.message || 'فشل سحب كل الماكينات');
        } finally {
            setSyncing(null);
        }
    };

    const handleUpdateSyncSettings = async (device: Device, patch: { autoEnabled?: boolean; intervalMinutes?: number; autoClearAfterSync?: boolean }) => {
        setSavingSyncSettings(device.id);
        try {
            const result = await apiRequest<{ settings: Device['syncConfig'] }>('/attendance-ops/devices/' + device.id + '/sync-settings', {
                method: 'PUT',
                body: JSON.stringify(patch),
            });
            setDevices(prev => prev.map(item => item.id === device.id ? { ...item, syncConfig: result.settings } : item));
            toast.success('تم تحديث إعدادات السحب التلقائي');
        } catch (err: any) {
            toast.error(err.message || 'فشل تحديث إعدادات السحب');
        } finally {
            setSavingSyncSettings(null);
        }
    };

    const handleDeleteDevice = async (device: Device) => {
        const ok = confirm('سيتم حذف ماكينة البصمة من شاشة الماكينات وإيقاف السحب والربط الخاص بها، مع الاحتفاظ بالبصمات القديمة للتقارير. هل تريد المتابعة؟');
        if (!ok) return;

        setDeletingDevice(device.id);
        try {
            await apiRequest('/attendance-ops/devices/' + device.id, { method: 'DELETE' });
            setDevices(prev => prev.filter(item => item.id !== device.id));
            setSyncResults(prev => prev?.filter(result => result.deviceId !== device.id) || null);
            setDeviceLogStats(prev => {
                const next = { ...prev };
                delete next[device.id];
                return next;
            });
            if (selectedDevice?.id === device.id) closeMappingPanel();
            toast.success('تم حذف ماكينة البصمة من القائمة');
        } catch (err: any) {
            toast.error(err.message || 'فشل حذف ماكينة البصمة');
        } finally {
            setDeletingDevice(null);
        }
    };

    const handleRefreshDeviceLogStats = async (device: Device) => {
        if (!deviceIsDirect(device)) return toast.error('قراءة عدد اللوجات متاحة للربط المباشر فقط');
        setLoadingLogStats(device.id);
        try {
            const stats = await apiRequest<DeviceLogStats>('/attendance-ops/devices/' + device.id + '/log-stats');
            setDeviceLogStats(prev => ({ ...prev, [device.id]: stats }));
            if (stats.success === false) {
                toast.error(stats.message || 'فشل قراءة اللوجات من الماكينة');
            } else {
                toast.success('على الماكينة ' + stats.records + ' لوج بصمة');
            }
        } catch (err: any) {
            toast.error(err.message || 'فشل قراءة اللوجات');
        } finally {
            setLoadingLogStats(null);
        }
    };

    const handleClearDeviceLogs = async (device: Device) => {
        if (!deviceIsDirect(device) && !deviceIsBridge(device)) return toast.error('تفريغ اللوجات غير متاح لنوع الربط الحالي');
        const confirmMessage = deviceIsBridge(device)
            ? 'سيتم سحب كل اللوجات من الماكينة أولا، حفظ Backup محلي داخل البريدج وBackup مركزي في قاعدة البيانات، ثم مسح اللوجات من ذاكرة الماكينة. هل تريد المتابعة؟'
            : 'سيتم حفظ نسخة Backup في قاعدة البيانات أولا، ثم مسح سجلات البصمة من ذاكرة الماكينة. هل تريد المتابعة؟';
        if (!confirm(confirmMessage)) return;
        setPerformingAction(device.id);
        try {
            if (deviceIsBridge(device)) {
                const result = await apiRequest<{ commandId: string; gatewayId: string }>('/attendance-ops/devices/' + device.id + '/bridge-clear-logs', { method: 'POST' });
                setSyncProgress({
                    deviceId: device.id,
                    deviceName: device.name,
                    mode: 'BRIDGE',
                    status: 'QUEUED',
                    title: 'تم إرسال أمر تفريغ اللوجات',
                    detail: 'البريدج سيحفظ نسخة احتياطية من كل اللوجات محليا ومركزيا قبل المسح. Gateway ID: ' + result.gatewayId,
                    progress: 20,
                    startedAt: new Date().toISOString(),
                    commandId: result.commandId,
                    gatewayId: result.gatewayId,
                });
                await waitForBridgeSyncResult(result.commandId, device, result.gatewayId);
            } else {
                const result = await apiRequest<{ success: boolean; recordsBackedUp?: number; backupId?: string }>('/attendance-ops/devices/' + device.id + '/clear-logs', { method: 'POST' });
                toast.success('تم تفريغ لوجات الماكينة بعد حفظ Backup بعدد ' + (result.recordsBackedUp ?? 0) + ' سجل');
            }
            setDeviceLogStats(prev => ({ ...prev, [device.id]: { success: true, deviceId: device.id, records: 0, users: prev[device.id]?.users || 0, capacity: prev[device.id]?.capacity ?? null, checkedAt: new Date().toISOString() } }));
        } catch (err: any) {
            toast.error(err.message || 'فشل تفريغ اللوجات');
        } finally {
            setPerformingAction(null);
        }
    };

    const handleRestartDevice = async (device: Device) => {
        if (!deviceIsDirect(device) && !deviceIsBridge(device)) return toast.error('إعادة التشغيل غير متاحة لنوع الربط الحالي');
        setPerformingAction(device.id);
        try {
            if (deviceIsBridge(device)) {
                const result = await apiRequest<{ commandId: string; gatewayId: string }>('/attendance-ops/devices/' + device.id + '/bridge-restart', { method: 'POST' });
                setSyncProgress({
                    deviceId: device.id,
                    deviceName: device.name,
                    mode: 'BRIDGE',
                    status: 'QUEUED',
                    title: 'تم إرسال أمر إعادة التشغيل',
                    detail: 'في انتظار البريدج يلتقط الأمر ويرسله للماكينة. Gateway ID: ' + result.gatewayId,
                    progress: 20,
                    startedAt: new Date().toISOString(),
                    commandId: result.commandId,
                    gatewayId: result.gatewayId,
                });
                await waitForBridgeSyncResult(result.commandId, device, result.gatewayId);
            } else {
                await apiRequest('/attendance-ops/devices/' + device.id + '/restart', { method: 'POST' });
                toast.success('تم إرسال أمر إعادة التشغيل للماكينة');
            }
        } catch (err: any) {
            toast.error(err.message || 'فشل إعادة تشغيل الماكينة');
        } finally {
            setPerformingAction(null);
        }
    };

    const loadMappings = useCallback(async (deviceId: string) => {
        setLoadingMappings(true);
        try {
            const data = await apiRequest<DeviceMapping[]>('/attendance-ops/devices/' + deviceId + '/mappings');
            setMappings(data || []);
        } catch {
            setMappings([]);
        } finally {
            setLoadingMappings(false);
        }
    }, []);

    const openMappingPanel = (device: Device) => {
        setSelectedDevice(device);
        setMappingSearch('');
        setNewMappingDeviceUserId('');
        setNewMappingEmployeeId('');
        loadMappings(device.id);
    };

    const closeMappingPanel = () => {
        setSelectedDevice(null);
        setMappings([]);
        setMappingSearch('');
        setNewMappingDeviceUserId('');
        setNewMappingEmployeeId('');
    };

    const handleAddMapping = async () => {
        if (!selectedDevice || !newMappingEmployeeId || !newMappingDeviceUserId.trim()) {
            return toast.error('اختار الموظف واكتب رقم البصمة');
        }
        setSavingMapping(true);
        try {
            await apiRequest('/attendance-ops/devices/mappings', {
                method: 'POST',
                body: JSON.stringify({
                    deviceId: selectedDevice.id,
                    employeeId: newMappingEmployeeId,
                    deviceUserId: newMappingDeviceUserId.trim(),
                }),
            });
            toast.success('تم ربط رقم البصمة بالموظف');
            setNewMappingDeviceUserId('');
            setNewMappingEmployeeId('');
            loadMappings(selectedDevice.id);
        } catch (err: any) {
            toast.error(err.message || 'فشل ربط الموظف');
        } finally {
            setSavingMapping(false);
        }
    };

    const handleDeleteMapping = async (mappingId: number) => {
        if (!selectedDevice) return;
        try {
            await apiRequest('/attendance-ops/devices/mappings/' + mappingId, { method: 'DELETE' });
            toast.success('تم إلغاء الربط');
            loadMappings(selectedDevice.id);
        } catch (err: any) {
            toast.error(err.message || 'فشل إلغاء الربط');
        }
    };

    const latestResult = syncResults?.[0];

    return (
        <div className="min-h-screen bg-app p-4 text-main sm:p-6 lg:p-8" dir="rtl">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
                <header className="flex flex-col gap-5 border-b border-border/50 pb-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-violet-500/25 bg-violet-500/10 text-violet-500">
                            <Fingerprint className="h-7 w-7" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight">أجهزة البصمة</h1>
                            <p className="mt-1 max-w-2xl text-sm font-bold text-muted">تابع حالة ماكينات البصمة، اسحب السجلات، واعرف كام بصمة اتقرت واتحفظت بدون تفاصيل فنية مربكة.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={handleSyncAll} disabled={syncing === 'ALL' || devices.length === 0} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-500 disabled:opacity-50">
                            <RefreshCw className={'h-4 w-4 ' + (syncing === 'ALL' ? 'animate-spin' : '')} />
                            سحب كل الماكينات
                        </button>
                        <button type="button" onClick={openCreateModal} className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-black text-white transition hover:bg-violet-500">
                            <Plus className="h-4 w-4" />
                            إضافة ماكينة
                        </button>
                    </div>
                </header>

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <StatBox label="كل الماكينات" value={stats.total} icon={<Server className="h-5 w-5" />} />
                    <StatBox label="مفعلة" value={stats.active} icon={<CheckCircle className="h-5 w-5" />} tone="emerald" />
                    <StatBox label="اتصال مباشر" value={stats.direct} icon={<Wifi className="h-5 w-5" />} tone="sky" />
                    <StatBox label="اتصال الفرع" value={stats.bridge} icon={<Globe className="h-5 w-5" />} tone="violet" />
                    <StatBox label="في انتظار أول سحب" value={stats.waiting} icon={<Clock className="h-5 w-5" />} tone="amber" />
                </section>

                <section className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/80 p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative flex-1">
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="ابحث باسم الماكينة أو الفرع"
                            className="h-11 w-full rounded-xl border border-border/60 bg-elevated/70 pr-10 pl-3 text-sm font-bold outline-none focus:border-violet-500"
                        />
                    </div>
                    <div className="grid grid-cols-4 gap-2 lg:w-auto">
                        <FilterButton active={modeFilter === 'ALL'} onClick={() => setModeFilter('ALL')}>الكل</FilterButton>
                        <FilterButton active={modeFilter === 'LAN'} onClick={() => setModeFilter('LAN')}>مباشر</FilterButton>
                        <FilterButton active={modeFilter === 'BRANCH_BRIDGE'} onClick={() => setModeFilter('BRANCH_BRIDGE')}>اتصال الفرع</FilterButton>
                        <FilterButton active={modeFilter === 'USB'} onClick={() => setModeFilter('USB')}>USB</FilterButton>
                    </div>
                </section>

                {syncProgress && (
                    <SyncProgressPanel
                        progress={syncProgress}
                        onClose={() => setSyncProgress(null)}
                    />
                )}

                {latestResult && (
                    <section className={'rounded-2xl border p-4 ' + (latestResult.success ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-rose-500/25 bg-rose-500/10')}>
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <p className="text-sm font-black">آخر نتيجة سحب: {latestResult.deviceName}</p>
                                <p className="mt-1 text-xs font-bold text-muted">تم استلام {latestResult.logsReceived} سجل، حفظ {latestResult.logsIngested}، وتجاهل {latestResult.logsSkipped}. {latestResult.unknownEmployees ? 'يوجد ' + latestResult.unknownEmployees + ' بصمة غير مربوطة.' : ''}</p>
                            </div>
                            <button type="button" onClick={() => setSyncResults(null)} className={iconButtonClass} title="إخفاء"><X className="h-4 w-4" /></button>
                        </div>
                    </section>
                )}

                <section className="grid gap-4 xl:grid-cols-2">
                    {loading ? (
                        <div className="col-span-full flex min-h-[260px] items-center justify-center rounded-2xl border border-border/60 bg-card/70">
                            <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
                        </div>
                    ) : filteredDevices.length === 0 ? (
                        <div className="col-span-full rounded-2xl border border-dashed border-border/70 bg-card/50 p-10 text-center">
                            <Fingerprint className="mx-auto h-12 w-12 text-muted/40" />
                            <p className="mt-4 text-sm font-black text-muted">لا توجد ماكينات مطابقة</p>
                            <button type="button" onClick={openCreateModal} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-black text-white">
                                <Plus className="h-4 w-4" />
                                إضافة ماكينة
                            </button>
                        </div>
                    ) : (
                        filteredDevices.map(device => (
                            <DeviceCard
                                key={device.id}
                                device={device}
                                branchName={branchTitle(branches, device.branchId)}
                                syncing={syncing === device.id}
                                onEdit={() => openEditModal(device)}
                                onMap={() => openMappingPanel(device)}
                                onSync={(event) => { event.preventDefault(); event.stopPropagation(); handleSyncDevice(device); }}
                                onRangeSync={() => openRangeSync(device)}
                                logStats={deviceLogStats[device.id]}
                                loadingLogStats={loadingLogStats === device.id}
                                performingAction={performingAction === device.id}
                                savingSyncSettings={savingSyncSettings === device.id}
                                deleting={deletingDevice === device.id}
                                bridgeHealth={bridgeMonitorByDevice[device.id]}
                                bridgeTest={bridgeTests[device.id]}
                                testingBridge={testingBridge === device.id}
                                onRefreshStats={() => handleRefreshDeviceLogStats(device)}
                                onClearLogs={() => handleClearDeviceLogs(device)}
                                onRestart={() => handleRestartDevice(device)}
                                onUpdateSyncSettings={(patch) => handleUpdateSyncSettings(device, patch)}
                                onDelete={() => handleDeleteDevice(device)}
                                onTestBridge={() => handleTestBridgeConnection(device)}
                            />
                        ))
                    )}
                </section>
            </div>

            <AnimatePresence>
                {showDeviceModal && (
                    <DeviceModal
                        form={deviceForm}
                        branches={branches}
                        editing={!!editingDevice}
                        testing={testing}
                        testResult={testResult}
                        onClose={closeDeviceModal}
                        onChange={setDeviceForm}
                        onSave={handleSaveDevice}
                        onTest={handleTestConnection}
                    />
                )}
                {selectedDevice && (
                    <MappingPanel
                        device={selectedDevice}
                        employees={employees}
                        mappings={mappings}
                        loading={loadingMappings}
                        search={mappingSearch}
                        mappedEmployeeIds={mappedEmployeeIds}
                        filteredEmployees={filteredEmployeesForMapping}
                        newDeviceUserId={newMappingDeviceUserId}
                        newEmployeeId={newMappingEmployeeId}
                        saving={savingMapping}
                        onClose={closeMappingPanel}
                        onSearch={setMappingSearch}
                        onDeviceUserId={setNewMappingDeviceUserId}
                        onEmployeeId={setNewMappingEmployeeId}
                        onAdd={handleAddMapping}
                        onDelete={handleDeleteMapping}
                    />
                )}
                {rangeDevice && (
                    <RangeSyncModal
                        device={rangeDevice}
                        form={rangeForm}
                        syncing={syncing === rangeDevice.id}
                        onChange={setRangeForm}
                        onClose={() => setRangeDevice(null)}
                        onSubmit={submitRangeSync}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

function StatBox({ label, value, icon, tone = 'slate' }: { label: string; value: number; icon: React.ReactNode; tone?: 'slate' | 'emerald' | 'sky' | 'violet' | 'amber' }) {
    const toneClass = {
        slate: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
        emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        sky: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
        violet: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
        amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    }[tone];

    return (
        <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-black text-muted">{label}</p>
                    <p className="mt-2 text-2xl font-black tabular-nums">{value}</p>
                </div>
                <div className={'flex h-11 w-11 items-center justify-center rounded-xl border ' + toneClass}>{icon}</div>
            </div>
        </div>
    );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button"
            onClick={onClick}
            className={'h-10 rounded-xl border px-3 text-xs font-black transition ' + (active ? 'border-violet-500 bg-violet-500 text-white' : 'border-border/60 bg-elevated/60 text-muted hover:text-main')}
        >
            {children}
        </button>
    );
}

function MetricTile({ label, value, tone = 'border-border/60 bg-elevated/45 text-main' }: { label: string; value: string; tone?: string }) {
    return (
        <div className={'min-w-0 rounded-2xl border p-3 ' + tone}>
            <p className="text-[10px] font-black text-muted">{label}</p>
            <p className="mt-1 truncate text-sm font-black">{value}</p>
        </div>
    );
}

function DeviceCard({ device, branchName, syncing, logStats, loadingLogStats, performingAction, savingSyncSettings, deleting, bridgeHealth, bridgeTest, testingBridge, onEdit, onMap, onSync, onRangeSync, onRefreshStats, onClearLogs, onRestart, onUpdateSyncSettings, onDelete, onTestBridge }: {
    device: Device;
    branchName: string;
    syncing: boolean;
    logStats?: DeviceLogStats;
    loadingLogStats: boolean;
    performingAction: boolean;
    savingSyncSettings: boolean;
    deleting: boolean;
    bridgeHealth?: BridgeMonitorRow;
    bridgeTest?: BridgeTestState;
    testingBridge: boolean;
    onEdit: () => void;
    onMap: () => void;
    onSync: (event: React.MouseEvent<HTMLButtonElement>) => void;
    onRangeSync: () => void;
    onRefreshStats: () => void;
    onClearLogs: () => void;
    onRestart: () => void;
    onUpdateSyncSettings: (patch: { autoEnabled?: boolean; intervalMinutes?: number; autoClearAfterSync?: boolean }) => void;
    onDelete: () => void;
    onTestBridge: () => void;
}) {
    const healthy = device.isActive && !!device.lastSyncAt;
    const statusText = !device.isActive ? 'معطلة' : healthy ? 'تعمل' : 'تحتاج أول سحب';
    const statusTone = !device.isActive ? 'bg-slate-500' : healthy ? 'bg-emerald-500' : 'bg-amber-500';
    const syncConfig = device.syncConfig || { autoEnabled: true, intervalMinutes: 15, failureCount: 0, autoClearAfterSync: false };
    const autoEnabled = syncConfig.autoEnabled !== false;
    const autoClearAfterSync = syncConfig.autoClearAfterSync === true;
    const direct = deviceIsDirect(device);
    const bridgeState = bridgeTest?.status === 'OK'
        ? { health: 'OK', label: 'متصل', detail: bridgeTest.message, tone: bridgeHealthTone('OK') }
        : bridgeTest?.status === 'OFFLINE'
            ? { health: 'STALE', label: 'أوفلاين', detail: bridgeTest.message, tone: bridgeHealthTone('STALE') }
            : bridgeTest?.status === 'FAILED'
                ? { health: 'FAILED', label: 'فيه مشكلة', detail: bridgeTest.message, tone: bridgeHealthTone('FAILED') }
                : bridgeTest?.status === 'CHECKING'
                    ? { health: 'CHECKING', label: 'جاري الاختبار', detail: bridgeTest.message, tone: 'border-violet-500/25 bg-violet-500/10 text-violet-700' }
                    : { health: bridgeHealth?.health, label: bridgeHealthLabel(bridgeHealth?.health), detail: bridgeHealth?.latestRun?.errorMessage || (bridgeHealth?.minutesSinceSuccess !== null && bridgeHealth?.minutesSinceSuccess !== undefined ? 'آخر نجاح منذ ' + bridgeHealth.minutesSinceSuccess + ' دقيقة' : 'لم يتم تسجيل رد من البريدج بعد'), tone: bridgeHealthTone(bridgeHealth?.health) };

    return (
        <motion.article layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition hover:border-violet-500/30">
            <div className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-500">
                            <Fingerprint className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-lg font-black">{device.name}</h3>
                                <span className="rounded-full border border-border/60 bg-elevated/70 px-2.5 py-1 text-[10px] font-black text-muted">{modeLabel(device)}</span>
                            </div>
                            <p className="mt-1 truncate text-xs font-bold text-muted">{branchName}</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 rounded-full border border-border/50 bg-elevated/70 px-3 py-1.5">
                        <span className={'h-2 w-2 rounded-full ' + statusTone} />
                        <span className="text-[11px] font-black text-muted">{statusText}</span>
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                    <MetricTile label={deviceIsBridge(device) ? 'حالة الماكينة' : 'الاتصال'} value={deviceIsBridge(device) ? bridgeState.label : (device.ipAddress ? 'متصل مباشر' : 'غير محدد')} tone={deviceIsBridge(device) ? bridgeState.tone : modeTone(device)} />
                    <MetricTile label="آخر سحب" value={timeAgo(device.lastSyncAt)} />
                    <MetricTile label="آخر محاولة" value={timeAgo(syncConfig.lastAttemptAt || device.lastSeenAt)} />
                    <MetricTile label="اللوجات" value={direct ? (loadingLogStats ? '...' : String(logStats?.records ?? 'اقرأ')) : (syncConfig.lastIngested ?? 0) + ' محفوظ'} />
                </div>

                {deviceIsBridge(device) && (
                    <div className={'rounded-2xl border p-3 ' + bridgeState.tone}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                                <p className="text-xs font-black">حالة الماكينة: {bridgeState.label}</p>
                                <p className="mt-1 text-[11px] font-bold opacity-90">{bridgeState.detail}</p>
                            </div>
                            <button type="button" onClick={onTestBridge} disabled={testingBridge || syncing} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-current/20 bg-card/50 px-3 text-xs font-black disabled:opacity-50">
                                <TestTube className={'h-3.5 w-3.5 ' + (testingBridge ? 'animate-pulse' : '')} />
                                {testingBridge ? 'جاري الاختبار...' : 'اختبار الاتصال'}
                            </button>
                        </div>
                    </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <button type="button" onClick={onSync} disabled={syncing || !device.isActive} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-black text-white transition hover:bg-violet-500 disabled:opacity-50">
                        <RefreshCw className={'h-4 w-4 ' + (syncing ? 'animate-spin' : '')} />
                        سحب الآن
                    </button>
                    <button type="button" onClick={onRangeSync} disabled={syncing || !device.isActive} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 text-sm font-black text-violet-600 disabled:opacity-50">
                        <Clock className="h-4 w-4" />
                        سحب فترة
                    </button>
                    <button type="button" onClick={onClearLogs} disabled={performingAction || syncing} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 text-sm font-black text-rose-600 disabled:opacity-40">
                        <Eraser className="h-4 w-4" />
                        مسح Log
                    </button>
                    <button type="button" onClick={onRestart} disabled={performingAction || syncing} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 text-sm font-black text-amber-600 disabled:opacity-40">
                        <Power className="h-4 w-4" />
                        Restart
                    </button>
                </div>

                <div className="rounded-2xl border border-border/50 bg-elevated/35 p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-xs font-black">التشغيل التلقائي</p>
                            <p className="mt-1 text-[11px] font-bold text-muted">السحب الدوري منفصل عن مسح اللوجات. المسح التلقائي مقفول افتراضيا.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => onUpdateSyncSettings({ autoEnabled: !autoEnabled })} disabled={savingSyncSettings} className={'h-9 rounded-xl border px-3 text-xs font-black transition ' + (autoEnabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-border/60 bg-card text-muted')}>
                                السحب {autoEnabled ? 'مفعل' : 'متوقف'}
                            </button>
                            <select value={syncConfig.intervalMinutes || 15} onChange={event => onUpdateSyncSettings({ intervalMinutes: Number(event.target.value) })} disabled={savingSyncSettings || !autoEnabled} className="h-9 rounded-xl border border-border/60 bg-card px-2 text-xs font-black outline-none focus:border-violet-500 disabled:opacity-50">
                                <option value={5}>كل 5 دقائق</option>
                                <option value={15}>كل 15 دقيقة</option>
                                <option value={30}>كل 30 دقيقة</option>
                                <option value={60}>كل ساعة</option>
                                <option value={120}>كل ساعتين</option>
                                <option value={240}>كل 4 ساعات</option>
                                <option value={1440}>كل 24 ساعة</option>
                            </select>
                            <button type="button" onClick={() => onUpdateSyncSettings({ autoClearAfterSync: !autoClearAfterSync })} disabled={savingSyncSettings} className={'h-9 rounded-xl border px-3 text-xs font-black transition ' + (autoClearAfterSync ? 'border-amber-500/40 bg-amber-500/15 text-amber-700' : 'border-border/60 bg-card text-muted')}>
                                مسح تلقائي {autoClearAfterSync ? 'مفعل' : 'مقفول'}
                            </button>
                        </div>
                    </div>
                </div>

                {device.syncConfig?.lastError && (
                    <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs font-bold text-rose-600">
                        {device.syncConfig.lastError}
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-elevated/25 px-5 py-3">
                <div className="flex flex-wrap gap-2">
                    {direct && (
                        <button type="button" onClick={onRefreshStats} disabled={loadingLogStats || performingAction} className="inline-flex h-9 items-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 text-xs font-black text-sky-600 disabled:opacity-40">
                            <RefreshCw className={'h-3.5 w-3.5 ' + (loadingLogStats ? 'animate-spin' : '')} />
                            قراءة Log
                        </button>
                    )}
                    <button type="button" onClick={onMap} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-3 text-xs font-black text-main transition hover:border-violet-500/40">
                        <Users className="h-4 w-4" />
                        ربط الموظفين
                    </button>
                    <button type="button" onClick={onEdit} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-3 text-xs font-black text-main transition hover:border-violet-500/40">
                        <Edit3 className="h-4 w-4" />
                        تعديل
                    </button>
                </div>
                <button type="button" onClick={onDelete} disabled={deleting || syncing || performingAction} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 text-xs font-black text-rose-600 transition hover:bg-rose-500 hover:text-white disabled:opacity-40">
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    حذف
                </button>
            </div>
        </motion.article>
    );
}

function RangeSyncModal({ device, form, syncing, onChange, onClose, onSubmit }: {
    device: Device;
    form: { startDate: string; endDate: string };
    syncing: boolean;
    onChange: (value: { startDate: string; endDate: string }) => void;
    onClose: () => void;
    onSubmit: () => void;
}) {
    return (
        <motion.div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl" initial={{ scale: 0.96, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} onClick={event => event.stopPropagation()}>
                <header className="flex items-center gap-3 border-b border-border/60 p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-500">
                        <Clock className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-black">سحب فترة محددة</h2>
                        <p className="mt-1 truncate text-xs font-bold text-muted">{device.name}</p>
                    </div>
                    <button type="button" onClick={onClose} className={iconButtonClass}><X className="h-4 w-4" /></button>
                </header>

                <div className="space-y-4 p-5">
                    <div>
                        <label className={labelClass}>من</label>
                        <input type="datetime-local" value={form.startDate} onChange={event => onChange({ ...form, startDate: event.target.value })} className={inputClass} />
                    </div>
                    <div>
                        <label className={labelClass}>إلى</label>
                        <input type="datetime-local" value={form.endDate} onChange={event => onChange({ ...form, endDate: event.target.value })} className={inputClass} />
                    </div>
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-bold text-muted">
                        السحب بالفترة لا يمسح أي لوج من الماكينة. المسح يتم فقط من زر مسح Log أو من خيار المسح التلقائي لو كان مفعل.
                    </div>
                </div>

                <footer className="flex flex-col-reverse gap-2 border-t border-border/60 p-5 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} className="h-11 rounded-xl border border-border/60 bg-card px-5 text-sm font-black text-muted">إلغاء</button>
                    <button type="button" onClick={onSubmit} disabled={syncing} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-black text-white disabled:opacity-50">
                        <RefreshCw className={'h-4 w-4 ' + (syncing ? 'animate-spin' : '')} />
                        بدء السحب
                    </button>
                </footer>
            </motion.div>
        </motion.div>
    );
}

function SyncProgressPanel({ progress, onClose }: { progress: SyncProgressState; onClose: () => void }) {
    const isDone = progress.status === 'COMPLETED';
    const isFailed = progress.status === 'FAILED' || progress.status === 'TIMEOUT';
    const barValue = Math.max(6, Math.min(100, progress.progress));
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(progress.startedAt).getTime()) / 1000));
    const tone = isDone
        ? 'border-emerald-500/25 bg-emerald-500/10'
        : isFailed
            ? 'border-amber-500/30 bg-amber-500/10'
            : 'border-violet-500/25 bg-violet-500/10';
    const iconClass = isDone ? 'text-emerald-600' : isFailed ? 'text-amber-600' : 'text-violet-600';

    return (
        <section className={'rounded-2xl border p-4 shadow-sm ' + tone}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-1 gap-3">
                    <div className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-card/55 ' + iconClass}>
                        {isDone ? <CheckCircle className="h-5 w-5" /> : isFailed ? <Clock className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black">{progress.title}</p>
                            <span className="rounded-full border border-border/50 bg-card/60 px-2 py-1 text-[10px] font-black text-muted">
                                {progress.deviceName}
                            </span>
                        </div>
                        <p className="mt-1 text-xs font-bold leading-6 text-muted">{progress.detail}</p>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-card/80">
                            <div className={'h-full rounded-full transition-all duration-500 ' + (isFailed ? 'bg-amber-500' : isDone ? 'bg-emerald-500' : 'bg-violet-600')} style={{ width: barValue + '%' }} />
                        </div>
                        <div className="mt-3 grid gap-2 text-[11px] font-bold text-muted sm:grid-cols-2 xl:grid-cols-5">
                            <span className="rounded-xl border border-border/45 bg-card/55 p-2">الحالة: {progress.status}</span>
                            <span className="rounded-xl border border-border/45 bg-card/55 p-2">المقروء: {progress.logsRead ?? 0}</span>
                            <span className="rounded-xl border border-border/45 bg-card/55 p-2">المحفوظ: {progress.logsSaved ?? 0}</span>
                            <span className="rounded-xl border border-border/45 bg-card/55 p-2">المتجاهل: {progress.logsSkipped ?? 0}</span>
                            <span className="rounded-xl border border-border/45 bg-card/55 p-2">الوقت: {elapsedSeconds} ثانية</span>
                        </div>
                        {progress.status === 'QUEUED' && (progress.attempt || 0) >= 8 && (
                            <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs font-bold text-amber-700">لو فضلت الحالة هنا، جهاز الفرع لم يستلم طلب السحب بعد. راجع اتصال جهاز الفرع بالإنترنت أو اطلب من المسؤول الفني مراجعة الإعدادات.</p>
                        )}
                    </div>
                </div>
                <button type="button" onClick={onClose} className={iconButtonClass} title="إخفاء">
                    <X className="h-4 w-4" />
                </button>
            </div>
        </section>
    );
}

function InfoLine({ label, value, tone, ltr }: { label: string; value: string; tone?: string; ltr?: boolean }) {
    return (
        <div className="rounded-xl border border-border/45 bg-elevated/45 p-3">
            <p className="text-[11px] font-black text-muted">{label}</p>
            <p className={'mt-1 truncate text-xs font-black ' + (tone || 'text-main')} dir={ltr ? 'ltr' : 'rtl'}>{value}</p>
        </div>
    );
}

function DeviceModal({ form, branches, editing, testing, testResult, onClose, onChange, onSave, onTest }: {
    form: DeviceFormState;
    branches: Branch[];
    editing: boolean;
    testing: boolean;
    testResult: any;
    onClose: () => void;
    onChange: React.Dispatch<React.SetStateAction<DeviceFormState>>;
    onSave: () => void;
    onTest: () => void;
}) {
    const setField = <K extends keyof DeviceFormState>(key: K, value: DeviceFormState[K]) => {
        onChange(prev => ({ ...prev, [key]: value }));
    };

    return (
        <motion.div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border/70 bg-card shadow-2xl" initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }} onClick={event => event.stopPropagation()}>
                <header className="flex items-center justify-between border-b border-border/60 p-5">
                    <div>
                        <h2 className="text-lg font-black">{editing ? 'تعديل ماكينة البصمة' : 'إضافة ماكينة بصمة'}</h2>
                        <p className="mt-1 text-xs font-bold text-muted">حدد طريقة الربط وبيانات الفرع حتى يقدر النظام يسحب البصمات بشكل واضح.</p>
                    </div>
                    <button type="button" onClick={onClose} className={iconButtonClass}><X className="h-4 w-4" /></button>
                </header>

                <div className="grid gap-4 p-5 md:grid-cols-2">
                    <div>
                        <label className={labelClass}>اسم الماكينة</label>
                        <input className={inputClass} value={form.name} onChange={event => setField('name', event.target.value)} placeholder="مثال: ماكينة بصمة فرع طنطا" />
                    </div>
                    <div>
                        <label className={labelClass}>الفرع</label>
                        <select className={inputClass} value={form.branchId} onChange={event => setField('branchId', event.target.value)}>
                            <option value="">اختار الفرع</option>
                            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.nameAr || branch.name || branch.code || branch.id}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>طريقة الربط</label>
                        <select className={inputClass} value={form.communicationMode} onChange={event => setField('communicationMode', event.target.value as DeviceConnectionMode)}>
                            <option value="LAN">Direct IP - السيستم يتصل بالماكينة مباشرة</option>
                            <option value="BRANCH_BRIDGE">Branch Bridge - بريدج داخل الفرع</option>
                            <option value="USB">USB / ملف</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>كود داخلي اختياري</label>
                        <input className={inputClass} value={form.code} onChange={event => setField('code', event.target.value)} placeholder="مثال: TANTA-ZK-01" dir="ltr" />
                    </div>

                    {form.communicationMode === 'BRANCH_BRIDGE' ? (
                        <div className="md:col-span-2">
                            <label className={labelClass}>Gateway ID الخاص بالبريدج</label>
                            <input className={inputClass} value={form.branchGatewayId} onChange={event => setField('branchGatewayId', event.target.value)} placeholder="مثال: tanta-bridge-01" dir="ltr" />
                            <p className="mt-2 text-xs font-bold text-muted">البريدج داخل الفرع هيلتقط أمر السحب ويرجع البصمات للسيرفر الرئيسي.</p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className={labelClass}>IP الماكينة</label>
                                <input className={inputClass} value={form.ipAddress} onChange={event => setField('ipAddress', event.target.value)} placeholder="192.168.1.201" dir="ltr" />
                            </div>
                            <div>
                                <label className={labelClass}>Port</label>
                                <input className={inputClass} type="number" value={form.port} onChange={event => setField('port', Number(event.target.value || 4370))} dir="ltr" />
                            </div>
                        </>
                    )}

                    <div>
                        <label className={labelClass}>Serial Number اختياري</label>
                        <input className={inputClass} value={form.serialNumber} onChange={event => setField('serialNumber', event.target.value)} dir="ltr" />
                    </div>
                    <label className="flex h-11 items-center gap-3 rounded-xl border border-border/60 bg-elevated/60 px-3 text-sm font-black">
                        <input type="checkbox" checked={form.isActive} onChange={event => setField('isActive', event.target.checked)} />
                        الماكينة مفعلة
                    </label>
                </div>

                {testResult && (
                    <div className={'mx-5 mb-4 rounded-xl border p-3 text-xs font-bold ' + (testResult.connected ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700' : 'border-rose-500/25 bg-rose-500/10 text-rose-600')}>
                        {testResult.connected ? 'الاتصال ناجح' : (testResult.error || 'فشل الاتصال')}
                    </div>
                )}

                <footer className="flex flex-col-reverse gap-2 border-t border-border/60 p-5 sm:flex-row sm:justify-between">
                    <button type="button" onClick={onTest} disabled={testing || form.communicationMode !== 'LAN'} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border/60 bg-elevated px-4 text-sm font-black text-main disabled:opacity-40">
                        <TestTube className="h-4 w-4" />
                        {testing ? 'جاري الاختبار...' : 'اختبار الاتصال'}
                    </button>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="h-11 rounded-xl border border-border/60 bg-card px-5 text-sm font-black text-muted">إلغاء</button>
                        <button type="button" onClick={onSave} className="h-11 rounded-xl bg-violet-600 px-5 text-sm font-black text-white">حفظ</button>
                    </div>
                </footer>
            </motion.div>
        </motion.div>
    );
}

function MappingPanel({ device, employees, mappings, loading, search, mappedEmployeeIds, filteredEmployees, newDeviceUserId, newEmployeeId, saving, onClose, onSearch, onDeviceUserId, onEmployeeId, onAdd, onDelete }: {
    device: Device;
    employees: Employee[];
    mappings: DeviceMapping[];
    loading: boolean;
    search: string;
    mappedEmployeeIds: Set<string>;
    filteredEmployees: Employee[];
    newDeviceUserId: string;
    newEmployeeId: string;
    saving: boolean;
    onClose: () => void;
    onSearch: (value: string) => void;
    onDeviceUserId: (value: string) => void;
    onEmployeeId: (value: string) => void;
    onAdd: () => void;
    onDelete: (mappingId: number) => void;
}) {
    const visibleMappings = mappings.filter(mapping => {
        if (!search.trim()) return true;
        const needle = search.trim().toLowerCase();
        return (mapping.employeeName || '').toLowerCase().includes(needle)
            || (mapping.employeeNameAr || '').includes(search)
            || mapping.deviceUserId.includes(search)
            || mapping.employeeId.toLowerCase().includes(needle);
    });
    const selectableEmployees = employees
        .filter(employee => !mappedEmployeeIds.has(employee.id) || employee.id === newEmployeeId)
        .filter(employee => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return (employee.name || '').toLowerCase().includes(needle)
                || (employee.nameAr || '').includes(search)
                || (employee.employeeCode || '').toLowerCase().includes(needle)
                || (employee.attendanceCode || '').toLowerCase().includes(needle)
                || employee.id.toLowerCase().includes(needle);
        })
        .slice(0, 150);

    return (
        <motion.div className="fixed inset-0 z-[230] bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.aside className="absolute inset-y-0 left-0 flex w-full max-w-2xl flex-col border-r border-border/60 bg-card shadow-2xl" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 280, damping: 32 }} onClick={event => event.stopPropagation()}>
                <header className="flex items-center gap-3 border-b border-border/60 p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-500">
                        <Link className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-black">ربط بصمات الموظفين</h2>
                        <p className="mt-1 truncate text-xs font-bold text-muted">{device.name}</p>
                    </div>
                    <button type="button" onClick={onClose} className={iconButtonClass}><X className="h-4 w-4" /></button>
                </header>

                <div className="border-b border-border/60 p-5">
                    <div className="grid gap-3 md:grid-cols-[1fr_130px_auto]">
                        <select className={inputClass} value={newEmployeeId} onChange={event => onEmployeeId(event.target.value)}>
                            <option value="">اختار الموظف</option>
                            {selectableEmployees.map(employee => (
                                <option key={employee.id} value={employee.id}>{employeeTitle(employee)}</option>
                            ))}
                        </select>
                        <input className={inputClass + ' text-center'} value={newDeviceUserId} onChange={event => onDeviceUserId(event.target.value)} placeholder="رقم البصمة" dir="ltr" />
                        <button type="button" onClick={onAdd} disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50">
                            <Link className="h-4 w-4" />
                            ربط
                        </button>
                    </div>
                    <p className="mt-3 text-xs font-bold text-muted">رقم البصمة هو User ID الموجود على ماكينة البصمة. عند وجود بصمات مجهولة اربط الرقم بالموظف مرة واحدة وسيتم التعرف عليها بعد ذلك.</p>
                </div>

                <div className="border-b border-border/60 p-4">
                    <div className="relative">
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        <input className="h-10 w-full rounded-xl border border-border/60 bg-elevated/70 pr-10 pl-3 text-sm font-bold outline-none focus:border-violet-500" value={search} onChange={event => onSearch(event.target.value)} placeholder="بحث بالاسم أو كود الموظف أو رقم البصمة" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>
                    ) : visibleMappings.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center">
                            <Unlink className="mx-auto h-10 w-10 text-muted/40" />
                            <p className="mt-4 text-sm font-black text-muted">لا توجد روابط مطابقة</p>
                            <p className="mt-2 text-xs font-bold text-muted">الموظفين المحملين: {employees.length} موظف، الروابط الحالية: {mappings.length}</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {visibleMappings.map(mapping => (
                                <div key={mapping.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-elevated/45 p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black">{mapping.employeeNameAr || mapping.employeeName || mapping.employeeId}</p>
                                        <p className="mt-1 text-xs font-bold text-muted">رقم البصمة: <span dir="ltr">{mapping.deviceUserId}</span>{mapping.employeeCodeSnapshot ? ' - كود الموظف: ' + mapping.employeeCodeSnapshot : ''}</p>
                                    </div>
                                    <button type="button" onClick={() => onDelete(mapping.id)} className="inline-flex h-9 items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 text-xs font-black text-rose-600">إلغاء</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.aside>
        </motion.div>
    );
}
