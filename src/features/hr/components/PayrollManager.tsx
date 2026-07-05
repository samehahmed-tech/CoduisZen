import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Banknote,
    Calendar,
    CheckCircle,
    Clock,
    FileText,
    Lock,
    PlayCircle,
    Plus,
    RefreshCw,
    ShieldCheck,
    Download,
    UserCheck,
    Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiRequest, apiRequestBlob } from '../../../../services/api/core';
import { useAuthStore } from '@/stores/useAuthStore';

type Employee = {
    id: string;
    name: string;
    role?: string;
    branchId: string;
    basicSalary?: number;
    hourlyRate?: number;
};

type PayrollCycle = {
    id: string;
    branchId: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    totalAmount?: number;
};

type PayrollPayout = {
    id: string;
    cycleId: string;
    employeeId: string;
    basicSalary: number;
    deductions?: number;
    overtime?: number;
    netPay: number;
    status?: string;
};

type Loan = {
    id: string;
    employeeId: string;
    branchId: string;
    type: string;
    principalAmount: number;
    outstandingAmount: number;
    installmentAmount: number;
    status: string;
};

type BonusPenalty = {
    id: string;
    employeeId: string;
    type: 'BONUS' | 'PENALTY';
    amount: number;
    status: string;
    reason: string;
    effectiveDate: string;
};

type PayrollRun = {
    id: string;
    cycleId: string;
    branchId: string;
    status: string;
    totalEmployees: number;
    grossTotal: number;
    deductionsTotal: number;
    netTotal: number;
    closedAt?: string;
};

type PayslipRecord = {
    id: string;
    runId: string;
    cycleId: string;
    employeeId: string;
    employeeName?: string;
    employeeCode?: string;
    issuedAt?: string;
    generatedAt?: string;
    version?: number;
    pdfHash?: string;
    payload?: {
        employeeName?: string;
        baseSalary?: number;
        fixedAllowances?: number;
        fixedDeductions?: number;
        attendanceDeductions?: number;
        overtime?: number;
        bonuses?: number;
        penalties?: number;
        loanDeductions?: number;
        otherDeductions?: number;
        grossPay?: number;
        netPay?: number;
        components?: Record<string, any>;
    };
};

type ShiftTemplate = {
    id: string;
    branchId: string;
    name: string;
    code?: string;
    startTime: string;
    endTime: string;
    breakMinutes?: number;
    graceLateMinutes?: number;
    earlyLeaveToleranceMinutes?: number;
    overtimeThresholdMinutes?: number;
    workDays?: string[];
    isOvernight?: boolean;
    isActive?: boolean;
};

type AttendancePolicy = {
    id: string;
    branchId: string;
    name: string;
    code?: string;
    attendanceProcessingMode?: 'AUTO' | 'OPERATIONAL_DAY' | 'SHIFT_BASED' | 'ROLLING_24H';
    operationalDayStartHour?: number;
    operationalDayEndHour?: number;
    maxSmartSessionHours?: number;
    graceLateMinutes?: number;
    earlyLeaveToleranceMinutes?: number;
    overtimeThresholdMinutes?: number;
    minHoursForPresent?: number;
    autoCloseOpenSessions?: boolean;
    autoResolveMissingOut?: boolean;
    isDefault?: boolean;
    isActive?: boolean;
};

type ShiftAssignment = {
    id: number;
    employeeId: string;
    branchId: string;
    shiftTemplateId: string;
    effectiveFrom: string;
    effectiveTo?: string;
    isPrimary?: boolean;
};

type PayrollReviewLine = {
    employeeId: string;
    employeeName?: string;
    role?: string;
    baseSalary: number;
    overtime: number;
    fixedAllowances?: number;
    fixedDeductions?: number;
    attendanceDeductions?: number;
    bonuses: number;
    penalties: number;
    loanDeductions: number;
    otherDeductions: number;
    grossPay: number;
    netPay: number;
    compensationItems?: Array<{
        id: string;
        name: string;
        nameAr?: string | null;
        category?: string | null;
        type: string;
        amount: number;
    }>;
    hasPayrollLine?: boolean;
    attendance?: {
        sessions: number;
        totalHours: number;
        lateMinutes: number;
        earlyLeaveMinutes: number;
        overtimeMinutes: number;
        openSessions: number;
        exceptionSessions: number;
        crossBranchExits: number;
        expectedWorkDays?: number;
        absenceDays?: number;
    };
    leaves?: {
        approvedDays: number;
        pendingDays: number;
    };
    warnings?: string[];
    blockers?: string[];
};

type PayrollReview = {
    cycleId: string;
    totals: {
        employees: number;
        gross: number;
        deductions: number;
        net: number;
        blockers: number;
        warnings: number;
    };
    lines: PayrollReviewLine[];
};

type PayrollComplianceSummary = {
    cycle: {
        id: string;
        branchId: string;
        branchName: string;
        periodStart: string;
        periodEnd: string;
        status: string;
        baseCurrency: string;
        reportingCurrency: string;
        exchangeRate: number;
    };
    config: {
        annualPersonalExemption: number;
        employeeInsuranceRate: number;
        employerInsuranceRate: number;
        insuranceMinMonthly: number;
        insuranceMaxMonthly: number;
        martyrsContributionRate: number;
    };
    totals: {
        employees: number;
        grossPay: number;
        employeeInsurance: number;
        employerInsurance: number;
        salaryTax: number;
        martyrsContribution: number;
        netAfterStatutory: number;
        employerCost: number;
        missingNationalIds: number;
        missingEmployeeCodes: number;
        blockers: number;
        warnings: number;
    };
    templates: Array<{ key: string; label: string }>;
};

const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const monthEnd = () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

const money = (value?: number) => Number(value || 0).toLocaleString('en-EG', { maximumFractionDigits: 2 });
const complianceTemplateLabel = (key: string, fallback: string) => ({
    payroll_sheet: 'شيت الرواتب الشامل',
    eta_monthly_private: 'ملف ضريبة المرتبات',
    insurance_form_1: 'تأمينات نموذج 1',
    insurance_form_2: 'تأمينات نموذج 2',
    insurance_form_6: 'تأمينات نموذج 6',
    bank_transfer: 'ملف تحويل البنك',
}[key] || fallback);

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

export default function PayrollManager() {
    const { settings, branches } = useAuthStore();
    const lang = (settings?.language || 'en') as 'en' | 'ar';
    const branchId = settings?.activeBranchId || branches?.[0]?.id || '';
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [cycles, setCycles] = useState<PayrollCycle[]>([]);
    const [payouts, setPayouts] = useState<PayrollPayout[]>([]);
    const [loans, setLoans] = useState<Loan[]>([]);
    const [adjustments, setAdjustments] = useState<BonusPenalty[]>([]);
    const [runs, setRuns] = useState<PayrollRun[]>([]);
    const [attendancePolicies, setAttendancePolicies] = useState<AttendancePolicy[]>([]);
    const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
    const [shiftAssignments, setShiftAssignments] = useState<ShiftAssignment[]>([]);
    const [review, setReview] = useState<PayrollReview | null>(null);
    const [compliance, setCompliance] = useState<PayrollComplianceSummary | null>(null);
    const [payslips, setPayslips] = useState<PayslipRecord[]>([]);
    const [loadingReview, setLoadingReview] = useState(false);
    const [loadingCompliance, setLoadingCompliance] = useState(false);
    const [loadingPayslips, setLoadingPayslips] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [selectedCycleId, setSelectedCycleId] = useState('');
    const [activeWorkspace, setActiveWorkspace] = useState<'overview' | 'review' | 'payslips' | 'compliance' | 'operations'>('overview');
    const [selectedPayslipEmployeeId, setSelectedPayslipEmployeeId] = useState('');
    const [reportingCurrency, setReportingCurrency] = useState<'EGP' | 'USD'>('EGP');
    const [exchangeRate, setExchangeRate] = useState('50');
    const [martyrsContributionRate, setMartyrsContributionRate] = useState('0');
    const [cycleForm, setCycleForm] = useState({ periodStart: monthStart(), periodEnd: monthEnd() });
    const [shiftForm, setShiftForm] = useState({
        name: 'الوردية النهارية الافتراضية',
        code: 'DEFAULT',
        startTime: '09:00',
        endTime: '17:00',
        workDays: ['sun', 'mon', 'tue', 'wed', 'thu'] as string[],
        graceLateMinutes: '15',
        earlyLeaveToleranceMinutes: '10',
        overtimeThresholdMinutes: '30',
    });
    const [policyForm, setPolicyForm] = useState({
        id: '',
        name: 'Smart Attendance Policy',
        code: 'SMART_DEFAULT',
        attendanceProcessingMode: 'AUTO' as 'AUTO' | 'OPERATIONAL_DAY' | 'SHIFT_BASED' | 'ROLLING_24H',
        operationalDayStartHour: '8',
        operationalDayEndHour: '5',
        maxSmartSessionHours: '22',
        graceLateMinutes: '15',
        earlyLeaveToleranceMinutes: '10',
        overtimeThresholdMinutes: '30',
        minHoursForPresent: '4',
        autoCloseOpenSessions: false,
        autoResolveMissingOut: false,
    });
    const [assignmentForm, setAssignmentForm] = useState({ employeeId: '', shiftTemplateId: '', effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: '' });
    const [adjustmentForm, setAdjustmentForm] = useState({ employeeId: '', type: 'PENALTY', amount: '', reason: '', effectiveDate: new Date().toISOString().slice(0, 10) });
    const [loanForm, setLoanForm] = useState({ employeeId: '', principalAmount: '', installmentsCount: '1', effectiveFrom: new Date().toISOString().slice(0, 10), notes: '' });

    const selectedCycle = cycles.find(c => c.id === selectedCycleId) || cycles[0];
    const selectedRun = useMemo(() => runs.find(run => run.cycleId === selectedCycle?.id), [runs, selectedCycle?.id]);
    const selectedPayouts = payouts.filter(p => p.cycleId === selectedCycle?.id);
    const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
    const payslipPreviewEmployees = useMemo(() => {
        const fromReview = (review?.lines || []).map(line => ({
            employeeId: line.employeeId,
            employeeName: line.employeeName || employeeMap.get(line.employeeId)?.name || line.employeeId,
            employeeCode: employeeMap.get(line.employeeId)?.id,
            source: 'preview' as const,
            netPay: Number(line.netPay || 0),
            blockers: line.blockers || [],
            warnings: line.warnings || [],
        }));

        const seen = new Set(fromReview.map(item => item.employeeId));
        const fromPayslips = payslips
            .filter(item => !seen.has(item.employeeId))
            .map(item => ({
                employeeId: item.employeeId,
                employeeName: item.employeeName || item.payload?.employeeName || employeeMap.get(item.employeeId)?.name || item.employeeId,
                employeeCode: item.employeeCode,
                source: 'payslip' as const,
                netPay: Number(item.payload?.netPay || 0),
                blockers: [] as string[],
                warnings: [] as string[],
            }));

        return [...fromReview, ...fromPayslips];
    }, [review?.lines, payslips, employeeMap]);

    const selectedPreviewLine = useMemo(
        () => review?.lines.find(line => line.employeeId === selectedPayslipEmployeeId) || review?.lines?.[0] || null,
        [review?.lines, selectedPayslipEmployeeId],
    );

    const selectedPayslip = useMemo(
        () => payslips.find(item => item.employeeId === selectedPayslipEmployeeId) || payslips[0] || null,
        [payslips, selectedPayslipEmployeeId],
    );

    const totals = useMemo(() => {
        const gross = selectedPayouts.reduce((sum, p) => sum + Number(p.basicSalary || 0) + Number(p.overtime || 0), 0);
        const deductions = selectedPayouts.reduce((sum, p) => sum + Number(p.deductions || 0), 0);
        const net = selectedPayouts.reduce((sum, p) => sum + Number(p.netPay || 0), 0);
        return { gross, deductions, net };
    }, [selectedPayouts]);

    const loadData = async () => {
        if (!branchId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [emp, cyc, pay, loanRows, adjRows, runRows, policyRows, shiftRows, assignmentRows] = await Promise.all([
                apiRequest<Employee[]>(`/hr/employees?branchId=${branchId}`),
                apiRequest<PayrollCycle[]>(`/hr-extended/payroll-cycles?branchId=${branchId}`),
                apiRequest<PayrollPayout[]>('/hr/payroll/payouts'),
                apiRequest<Loan[]>(`/hr-extended/loans?branchId=${branchId}`),
                apiRequest<BonusPenalty[]>(`/hr-extended/bonus-penalties?branchId=${branchId}`),
                apiRequest<PayrollRun[]>(`/hr-extended/payroll-runs?branchId=${branchId}`),
                apiRequest<AttendancePolicy[]>(`/hr-extended/attendance-policies?branchId=${branchId}`),
                apiRequest<ShiftTemplate[]>(`/hr-extended/shift-templates?branchId=${branchId}`),
                apiRequest<ShiftAssignment[]>(`/hr-extended/shift-assignments?branchId=${branchId}`),
            ]);
            setEmployees(emp || []);
            setCycles(cyc || []);
            setPayouts(pay || []);
            setLoans(loanRows || []);
            setAdjustments(adjRows || []);
            setRuns(runRows || []);
            setAttendancePolicies(policyRows || []);
            setShiftTemplates(shiftRows || []);
            setShiftAssignments(assignmentRows || []);
            const defaultPolicy = (policyRows || []).find(policy => policy.isDefault) || policyRows?.[0];
            if (defaultPolicy) {
                setPolicyForm({
                    id: defaultPolicy.id,
                    name: defaultPolicy.name || 'Smart Attendance Policy',
                    code: defaultPolicy.code || 'SMART_DEFAULT',
                    attendanceProcessingMode: defaultPolicy.attendanceProcessingMode || 'AUTO',
                    operationalDayStartHour: String(defaultPolicy.operationalDayStartHour ?? 8),
                    operationalDayEndHour: String(defaultPolicy.operationalDayEndHour ?? 5),
                    maxSmartSessionHours: String(defaultPolicy.maxSmartSessionHours ?? 22),
                    graceLateMinutes: String(defaultPolicy.graceLateMinutes ?? 15),
                    earlyLeaveToleranceMinutes: String(defaultPolicy.earlyLeaveToleranceMinutes ?? 10),
                    overtimeThresholdMinutes: String(defaultPolicy.overtimeThresholdMinutes ?? 30),
                    minHoursForPresent: String(defaultPolicy.minHoursForPresent ?? 4),
                    autoCloseOpenSessions: Boolean(defaultPolicy.autoCloseOpenSessions),
                    autoResolveMissingOut: Boolean(defaultPolicy.autoResolveMissingOut),
                });
            }
            if (!selectedCycleId && cyc?.[0]) setSelectedCycleId(cyc[0].id);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to load payroll data');
        } finally {
            setLoading(false);
        }
    };

    const loadPayrollReview = async (cycleId = selectedCycle?.id) => {
        if (!cycleId) {
            setReview(null);
            return;
        }
        setLoadingReview(true);
        try {
            const data = await apiRequest<PayrollReview>(`/hr-extended/payroll-close/${cycleId}/preview`);
            setReview(data);
        } catch {
            setReview(null);
        } finally {
            setLoadingReview(false);
        }
    };

    const loadPayslips = async (runId = selectedRun?.id) => {
        if (!runId) {
            setPayslips([]);
            return;
        }
        setLoadingPayslips(true);
        try {
            const rows = await apiRequest<PayslipRecord[]>(`/hr-extended/payslips?runId=${runId}`);
            setPayslips(rows || []);
        } catch {
            setPayslips([]);
        } finally {
            setLoadingPayslips(false);
        }
    };

    const loadCompliance = async (cycleId = selectedCycle?.id) => {
        if (!cycleId) {
            setCompliance(null);
            return;
        }
        setLoadingCompliance(true);
        try {
            const params = new URLSearchParams();
            params.set('reportingCurrency', reportingCurrency);
            params.set('exchangeRate', exchangeRate || '1');
            params.set('martyrsContributionRate', martyrsContributionRate || '0');
            const data = await apiRequest<PayrollComplianceSummary>(`/hr-extended/payroll-compliance/${cycleId}/summary?${params.toString()}`);
            setCompliance(data);
        } catch {
            setCompliance(null);
        } finally {
            setLoadingCompliance(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [branchId]);

    useEffect(() => {
        if (selectedCycle?.id) loadPayrollReview(selectedCycle.id);
        else setReview(null);
    }, [selectedCycle?.id]);

    useEffect(() => {
        if (selectedCycle?.id) loadCompliance(selectedCycle.id);
        else setCompliance(null);
    }, [selectedCycle?.id, reportingCurrency, exchangeRate, martyrsContributionRate]);

    useEffect(() => {
        if (selectedRun?.id) loadPayslips(selectedRun.id);
        else setPayslips([]);
    }, [selectedRun?.id]);

    useEffect(() => {
        const nextEmployeeId = selectedPreviewLine?.employeeId || selectedPayslip?.employeeId || payslipPreviewEmployees[0]?.employeeId || '';
        if (nextEmployeeId && nextEmployeeId !== selectedPayslipEmployeeId) {
            setSelectedPayslipEmployeeId(nextEmployeeId);
        }
    }, [selectedPreviewLine?.employeeId, selectedPayslip?.employeeId, payslipPreviewEmployees, selectedPayslipEmployeeId]);

    const exportCompliance = async (template: string, format: 'csv' | 'xlsx' | 'pdf' | 'json') => {
        if (!selectedCycle?.id) return toast.error('Select a payroll cycle first');
        const key = `compliance-${template}-${format}`;
        setBusy(key);
        try {
            const params = new URLSearchParams();
            params.set('template', template);
            params.set('format', format);
            params.set('reportingCurrency', reportingCurrency);
            params.set('exchangeRate', exchangeRate || '1');
            params.set('martyrsContributionRate', martyrsContributionRate || '0');
            params.set('lang', lang);
            const blob = await apiRequestBlob(`/hr-extended/payroll-compliance/${selectedCycle.id}/export?${params.toString()}`);
            downloadBlob(blob, `${template}-${selectedCycle.id}.${format === 'json' ? 'json' : format}`);
            toast.success('Compliance export generated');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to export compliance report');
        } finally {
            setBusy(null);
        }
    };

    const createCycle = async () => {
        if (!branchId) return toast.error('Select a branch first');
        setBusy('cycle');
        try {
            const created = await apiRequest<PayrollCycle>('/hr-extended/payroll-cycles', {
                method: 'POST',
                body: JSON.stringify({ branchId, ...cycleForm }),
            });
            setSelectedCycleId(created.id);
            toast.success('Payroll cycle created');
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to create payroll cycle');
        } finally {
            setBusy(null);
        }
    };

    const toggleWorkDay = (day: string) => {
        setShiftForm(prev => ({
            ...prev,
            workDays: prev.workDays.includes(day)
                ? prev.workDays.filter(item => item !== day)
                : [...prev.workDays, day],
        }));
    };

    const saveAttendancePolicy = async () => {
        if (!branchId || !policyForm.name) return toast.error('Attendance policy name is required');
        setBusy('attendance-policy');
        try {
            await apiRequest('/hr-extended/attendance-policies', {
                method: 'POST',
                body: JSON.stringify({
                    id: policyForm.id || undefined,
                    branchId,
                    name: policyForm.name,
                    code: policyForm.code || undefined,
                    attendanceProcessingMode: policyForm.attendanceProcessingMode,
                    operationalDayStartHour: Number(policyForm.operationalDayStartHour || 8),
                    operationalDayEndHour: Number(policyForm.operationalDayEndHour || 5),
                    maxSmartSessionHours: Number(policyForm.maxSmartSessionHours || 22),
                    graceLateMinutes: Number(policyForm.graceLateMinutes || 15),
                    earlyLeaveToleranceMinutes: Number(policyForm.earlyLeaveToleranceMinutes || 10),
                    overtimeThresholdMinutes: Number(policyForm.overtimeThresholdMinutes || 30),
                    minHoursForPresent: Number(policyForm.minHoursForPresent || 4),
                    autoCloseOpenSessions: policyForm.autoCloseOpenSessions,
                    autoResolveMissingOut: policyForm.autoResolveMissingOut,
                    isDefault: true,
                    isActive: true,
                }),
            });
            toast.success('Attendance intelligence policy saved');
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save attendance policy');
        } finally {
            setBusy(null);
        }
    };

    const saveShiftTemplate = async () => {
        if (!branchId || !shiftForm.name || !shiftForm.startTime || !shiftForm.endTime) return toast.error('Shift name and time are required');
        if (shiftForm.workDays.length === 0) return toast.error('Select at least one work day');
        setBusy('shift-template');
        try {
            await apiRequest('/hr-extended/shift-templates', {
                method: 'POST',
                body: JSON.stringify({
                    branchId,
                    name: shiftForm.name,
                    code: shiftForm.code || undefined,
                    startTime: shiftForm.startTime,
                    endTime: shiftForm.endTime,
                    workDays: shiftForm.workDays,
                    graceLateMinutes: Number(shiftForm.graceLateMinutes || 0),
                    earlyLeaveToleranceMinutes: Number(shiftForm.earlyLeaveToleranceMinutes || 0),
                    overtimeThresholdMinutes: Number(shiftForm.overtimeThresholdMinutes || 0),
                    isActive: true,
                }),
            });
            toast.success('Work rule saved');
            await loadData();
            if (selectedCycle?.id) await loadPayrollReview(selectedCycle.id);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save work rule');
        } finally {
            setBusy(null);
        }
    };

    const assignShiftTemplate = async () => {
        if (!assignmentForm.employeeId || !assignmentForm.shiftTemplateId || !assignmentForm.effectiveFrom) return toast.error('Employee, shift and effective date are required');
        setBusy('shift-assignment');
        try {
            await apiRequest('/hr-extended/shift-assignments', {
                method: 'POST',
                body: JSON.stringify({
                    branchId,
                    employeeId: assignmentForm.employeeId,
                    shiftTemplateId: assignmentForm.shiftTemplateId,
                    effectiveFrom: assignmentForm.effectiveFrom,
                    effectiveTo: assignmentForm.effectiveTo || undefined,
                    isPrimary: true,
                }),
            });
            setAssignmentForm({ employeeId: '', shiftTemplateId: assignmentForm.shiftTemplateId, effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: '' });
            toast.success('Employee work rule assigned');
            await loadData();
            if (selectedCycle?.id) await loadPayrollReview(selectedCycle.id);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to assign work rule');
        } finally {
            setBusy(null);
        }
    };

    const bootstrapDefaults = async () => {
        if (!branchId) return toast.error('Select a branch first');
        setBusy('bootstrap');
        try {
            await apiRequest('/hr-extended/bootstrap-defaults', {
                method: 'POST',
                body: JSON.stringify({ branchId }),
            });
            toast.success('HR defaults are ready for this branch');
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to initialize HR defaults');
        } finally {
            setBusy(null);
        }
    };

    const backfillAttendanceSessions = async () => {
        setBusy('backfill');
        try {
            const result = await apiRequest<any>('/attendance-ops/backfill-sessions', {
                method: 'POST',
                body: JSON.stringify({ limit: 1000 }),
            });
            toast.success(`Attendance sessions synced: ${result?.created || result?.inserted || result?.processed || 'done'}`);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to sync attendance sessions');
        } finally {
            setBusy(null);
        }
    };

    const approveAdjustment = async (id: string, status: 'APPROVED' | 'REJECTED' = 'APPROVED') => {
        setBusy(`adjustment:${id}`);
        try {
            await apiRequest(`/hr-extended/bonus-penalties/${id}/approve`, {
                method: 'PUT',
                body: JSON.stringify({ status }),
            });
            toast.success(status === 'APPROVED' ? 'Adjustment approved' : 'Adjustment rejected');
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to update adjustment');
        } finally {
            setBusy(null);
        }
    };

    const approveLoan = async (id: string, status: 'APPROVED' | 'DISBURSED' = 'APPROVED') => {
        setBusy(`loan:${id}`);
        try {
            await apiRequest(`/hr-extended/loans/${id}/approve`, {
                method: 'PUT',
                body: JSON.stringify({ status }),
            });
            toast.success(status === 'DISBURSED' ? 'Advance disbursed' : 'Advance approved');
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to update advance');
        } finally {
            setBusy(null);
        }
    };

    const calculateCycle = async () => {
        if (!selectedCycle) return toast.error('Create a cycle first');
        setBusy('calculate');
        try {
            await apiRequest(`/hr-extended/payroll-calculate/${selectedCycle.id}`, { method: 'POST' });
            toast.success('Payroll calculated from attendance, rules, overtime and deductions');
            await loadData();
            await loadPayrollReview(selectedCycle.id);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to calculate payroll');
        } finally {
            setBusy(null);
        }
    };

    const closeCycle = async () => {
        if (!selectedCycle) return toast.error('Select a cycle first');
        setBusy('close');
        try {
            await apiRequest(`/hr-extended/payroll-close/${selectedCycle.id}/close`, {
                method: 'POST',
                body: JSON.stringify({ notes: 'Closed from Payroll Manager' }),
            });
            toast.success('Payroll cycle closed and locked');
            await loadData();
            await loadPayrollReview(selectedCycle.id);
        } catch (error: any) {
            const message = String(error?.message || '');
            toast.error(message.includes('PAYROLL_REVIEW_HAS_BLOCKERS') ? 'Payroll has blockers. Resolve review issues before closing.' : (error?.message || 'Failed to close payroll'));
        } finally {
            setBusy(null);
        }
    };

    const generatePayslips = async () => {
        if (!selectedRun?.id) return toast.error('أغلق الدورة أولا لتوليد كشوف المرتب الرسمية');
        setBusy('payslips');
        try {
            const result = await apiRequest<{ generated: number }>(`/hr-extended/payslips/${selectedRun.id}/generate`, { method: 'POST' });
            toast.success(`تم توليد ${result.generated || 0} كشف مرتب`);
            await loadPayslips(selectedRun.id);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to generate payslips');
        } finally {
            setBusy(null);
        }
    };

    const downloadPayslip = async (payslipId: string) => {
        setBusy(`payslip:${payslipId}`);
        try {
            const blob = await apiRequestBlob(`/hr-extended/payslips/${payslipId}/pdf`);
            const employeeName = selectedPayslip?.employeeName || selectedPayslip?.payload?.employeeName || selectedPayslipEmployeeId || 'employee';
            downloadBlob(blob, `payslip-${employeeName}.pdf`);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to download payslip');
        } finally {
            setBusy(null);
        }
    };

    const previewEmployee = selectedPreviewLine || null;
    const previewBaseSalary = Number(selectedPayslip?.payload?.baseSalary ?? previewEmployee?.baseSalary ?? 0);
    const previewFixedAllowances = Number(selectedPayslip?.payload?.fixedAllowances ?? previewEmployee?.fixedAllowances ?? 0);
    const previewFixedDeductions = Number(selectedPayslip?.payload?.fixedDeductions ?? previewEmployee?.fixedDeductions ?? 0);
    const previewAttendanceDeductions = Number(selectedPayslip?.payload?.attendanceDeductions ?? previewEmployee?.attendanceDeductions ?? 0);
    const previewBonuses = Number(selectedPayslip?.payload?.bonuses ?? previewEmployee?.bonuses ?? 0);
    const previewOvertime = Number(selectedPayslip?.payload?.overtime ?? previewEmployee?.overtime ?? 0);
    const previewPenalties = Number(selectedPayslip?.payload?.penalties ?? previewEmployee?.penalties ?? 0);
    const previewLoanDeductions = Number(selectedPayslip?.payload?.loanDeductions ?? previewEmployee?.loanDeductions ?? 0);
    const previewOtherDeductions = Number(selectedPayslip?.payload?.otherDeductions ?? previewEmployee?.otherDeductions ?? 0);
    const previewGrossPay = Number(selectedPayslip?.payload?.grossPay ?? previewEmployee?.grossPay ?? 0);
    const previewNetPay = Number(selectedPayslip?.payload?.netPay ?? previewEmployee?.netPay ?? 0);
    const previewEmployeeName =
        selectedPayslip?.employeeName ||
        selectedPayslip?.payload?.employeeName ||
        previewEmployee?.employeeName ||
        employeeMap.get(selectedPayslipEmployeeId)?.name ||
        'اختر موظفا';
    const previewEmployeeRole = previewEmployee?.role || employeeMap.get(selectedPayslipEmployeeId)?.role || 'موظف';
    const workspaceTabs = [
        { key: 'overview' as const, label: 'الدورة', hint: 'الفترة والحالة والإجماليات', icon: Calendar },
        { key: 'review' as const, label: 'المراجعة', hint: 'الجاهزية قبل الإغلاق', icon: ShieldCheck },
        { key: 'payslips' as const, label: 'الكشوف', hint: 'كشف مرتب كل موظف', icon: FileText },
        { key: 'compliance' as const, label: 'الالتزامات', hint: 'ضرائب وتأمينات وتصدير', icon: Banknote },
        { key: 'operations' as const, label: 'التشغيل', hint: 'الشيفتات والسلف والخصومات', icon: UserCheck },
    ];

    const createAdjustment = async () => {
        if (!adjustmentForm.employeeId || !adjustmentForm.amount || !adjustmentForm.reason) return toast.error('Employee, amount and reason are required');
        setBusy('adjustment');
        try {
            await apiRequest('/hr-extended/bonus-penalties', {
                method: 'POST',
                body: JSON.stringify({
                    branchId,
                    employeeId: adjustmentForm.employeeId,
                    type: adjustmentForm.type,
                    amount: Number(adjustmentForm.amount),
                    reason: adjustmentForm.reason,
                    effectiveDate: adjustmentForm.effectiveDate,
                }),
            });
            setAdjustmentForm({ employeeId: '', type: 'PENALTY', amount: '', reason: '', effectiveDate: new Date().toISOString().slice(0, 10) });
            toast.success('Payroll adjustment recorded');
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save adjustment');
        } finally {
            setBusy(null);
        }
    };

    const createLoan = async () => {
        if (!loanForm.employeeId || !loanForm.principalAmount) return toast.error('Employee and amount are required');
        setBusy('loan');
        try {
            await apiRequest('/hr-extended/loans', {
                method: 'POST',
                body: JSON.stringify({
                    branchId,
                    employeeId: loanForm.employeeId,
                    principalAmount: Number(loanForm.principalAmount),
                    installmentsCount: Number(loanForm.installmentsCount || 1),
                    effectiveFrom: loanForm.effectiveFrom,
                    notes: loanForm.notes,
                }),
            });
            setLoanForm({ employeeId: '', principalAmount: '', installmentsCount: '1', effectiveFrom: new Date().toISOString().slice(0, 10), notes: '' });
            toast.success('Employee advance recorded');
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save advance');
        } finally {
            setBusy(null);
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-app text-main p-8 flex items-center gap-3"><RefreshCw className="animate-spin" /> {lang === 'ar' ? 'جاري تحميل بيانات الرواتب...' : 'Loading payroll data...'}</div>;
    }

    return (
        <div className="min-h-screen bg-app text-main pb-28">
            <div className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 lg:p-8">
                <header className="rounded-3xl border border-border/45 bg-card/80 p-5 shadow-sm sm:p-6">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-500">
                            <Wallet size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight lg:text-3xl">مركز الرواتب والالتزامات</h1>
                            <p className="mt-1 max-w-3xl text-xs font-bold leading-6 text-muted">مساحة واحدة أوضح لإدارة دورة المرتبات، الشيفتات، السلف، الخصومات، والمراجعة قبل إغلاق الفترة.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 xl:max-w-[760px] xl:justify-end">
                        <button onClick={loadData} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border/50 bg-elevated px-4 text-xs font-black"><RefreshCw size={15} /> تحديث</button>
                        <button onClick={bootstrapDefaults} disabled={busy === 'bootstrap'} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border/50 bg-elevated px-4 text-xs font-black disabled:opacity-50"><ShieldCheck size={15} /> تهيئة HR</button>
                        <button onClick={backfillAttendanceSessions} disabled={busy === 'backfill'} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border/50 bg-elevated px-4 text-xs font-black disabled:opacity-50"><Clock size={15} /> مزامنة الحضور</button>
                        <button onClick={calculateCycle} disabled={busy === 'calculate' || !selectedCycle} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-50"><PlayCircle size={15} /> احتساب</button>
                        <button onClick={() => exportCompliance('payroll_sheet', 'xlsx')} disabled={!selectedCycle || busy === 'compliance-payroll_sheet-xlsx'} className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-black text-white disabled:opacity-50"><Download size={15} /> شيت الرواتب</button>
                        <button onClick={closeCycle} disabled={busy === 'close' || !selectedCycle || selectedCycle.status === 'CLOSED' || Boolean(review?.totals?.blockers)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-50"><Lock size={15} /> إغلاق واعتماد</button>
                    </div>
                    </div>
                </header>

                <section className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                    {[
                        { step: '1', title: 'جهز الموظفين', text: 'راجع الراتب، الكود، والفرع لكل موظف' },
                        { step: '2', title: 'اضبط قواعد العمل', text: 'حدد سياسة الحضور والشيفتات المناسبة' },
                        { step: '3', title: 'زامن الحضور', text: 'اسحب البصمات وعالج الاستثناءات' },
                        { step: '4', title: 'راجع واعتمد', text: 'افتح مراجعة الدورة قبل القفل' },
                        { step: '5', title: 'صدر وأغلق', text: 'نزل التقارير ثم اقفل الدورة' },
                    ].map(item => (
                        <div key={item.step} className="rounded-2xl border border-border/40 bg-card/65 p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-black text-white">{item.step}</span>
                                <h3 className="text-sm font-black">{item.title}</h3>
                            </div>
                            <p className="text-[11px] font-bold leading-5 text-muted">{item.text}</p>
                        </div>
                    ))}
                </section>

                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: 'الموظفون', value: employees.length, icon: ShieldCheck },
                        { label: 'إجمالي المستحق', value: `${money(totals.gross)} EGP`, icon: Banknote },
                        { label: 'الخصومات', value: `${money(totals.deductions)} EGP`, icon: AlertTriangle },
                        { label: 'صافي الرواتب', value: `${money(totals.net || selectedCycle?.totalAmount)} EGP`, icon: CheckCircle },
                    ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-border/40 bg-card/65 p-5">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black tracking-widest text-muted">{item.label}</p>
                                <item.icon size={18} className="text-emerald-500" />
                            </div>
                            <p className="text-2xl font-black mt-3 tabular-nums">{item.value}</p>
                        </div>
                    ))}
                </section>

                <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.45fr_0.55fr]">
                    <div className="rounded-2xl border border-border/40 bg-card/70 p-3">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
                            {workspaceTabs.map(tab => {
                                const Icon = tab.icon;
                                const active = activeWorkspace === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setActiveWorkspace(tab.key)}
                                        className={`rounded-2xl border px-4 py-3 text-right transition-colors ${active ? 'border-main/25 bg-main/10' : 'border-border/35 bg-app hover:bg-elevated'}`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-black">{tab.label}</p>
                                                <p className="mt-1 text-[11px] font-bold text-muted">{tab.hint}</p>
                                            </div>
                                            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? 'bg-main text-app' : 'bg-card text-muted'}`}>
                                                <Icon size={16} />
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border/40 bg-card/70 p-4">
                        <p className="text-[10px] font-black tracking-widest text-muted">الدورة النشطة</p>
                        {selectedCycle ? (
                            <div className="mt-3 space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-black">{selectedCycle.id}</span>
                                    <span className="rounded-full border border-border/40 bg-app px-2.5 py-1 text-[10px] font-black text-muted">
                                        {selectedCycle.status}
                                    </span>
                                </div>
                                <p className="text-[11px] font-bold text-muted">
                                    {new Date(selectedCycle.periodStart).toLocaleDateString()} - {new Date(selectedCycle.periodEnd).toLocaleDateString()}
                                </p>
                                <p className="text-sm font-black">صافي الدورة: {money(review?.totals?.net || totals.net || selectedCycle.totalAmount)} EGP</p>
                            </div>
                        ) : (
                            <p className="mt-3 text-sm font-bold text-muted">أنشئ دورة جديدة أو اختر دورة موجودة للمتابعة.</p>
                        )}
                    </div>
                </section>

                {activeWorkspace === 'overview' && (
                <>
                <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl border border-border/40 bg-card/70 p-5 space-y-4">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            <div>
                                <h2 className="font-black flex items-center gap-2"><Calendar size={18} /> دورات الرواتب</h2>
                                <p className="mt-1 text-xs font-bold text-muted">حدد الفترة، أنشئ الدورة، ثم راجع حالتها وإجماليها من نفس المكان.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <input type="date" value={cycleForm.periodStart} onChange={e => setCycleForm({ ...cycleForm, periodStart: e.target.value })} className="h-10 px-3 rounded-xl bg-app border border-border text-xs" />
                                <input type="date" value={cycleForm.periodEnd} onChange={e => setCycleForm({ ...cycleForm, periodEnd: e.target.value })} className="h-10 px-3 rounded-xl bg-app border border-border text-xs" />
                                <button onClick={createCycle} disabled={busy === 'cycle'} className="h-10 px-4 rounded-xl bg-main text-app text-xs font-black flex items-center gap-2 disabled:opacity-50"><Plus size={14} /> دورة جديدة</button>
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-border/30 bg-elevated/25">
                            <table className="w-full text-sm">
                                <thead className="text-right text-[10px] tracking-widest text-muted">
                                    <tr><th className="py-3 pr-4">الدورة</th><th>الفترة</th><th>الحالة</th><th className="pl-4">الإجمالي</th></tr>
                                </thead>
                                <tbody>
                                    {cycles.map(cycle => (
                                        <tr key={cycle.id} onClick={() => setSelectedCycleId(cycle.id)} className={`border-t border-border/40 cursor-pointer transition-colors ${selectedCycle?.id === cycle.id ? 'bg-emerald-500/10' : 'hover:bg-elevated/50'}`}>
                                            <td className="py-3 pr-4 font-bold">{cycle.id}</td>
                                            <td>{new Date(cycle.periodStart).toLocaleDateString()} - {new Date(cycle.periodEnd).toLocaleDateString()}</td>
                                            <td><span className="px-2 py-1 rounded-lg bg-elevated text-[10px] font-black">{cycle.status}</span></td>
                                            <td className="pl-4 font-black">{money(cycle.totalAmount)} EGP</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {cycles.length === 0 && <p className="text-center text-muted py-10 text-sm">لا توجد دورات رواتب حتى الآن.</p>}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border/40 bg-card/70 p-5 space-y-4">
                        <div>
                            <h2 className="font-black flex items-center gap-2"><FileText size={18} /> الدورات المغلقة</h2>
                            <p className="mt-1 text-xs font-bold text-muted">سجل مختصر للدورات التي تم قفلها واعتمادها بالفعل.</p>
                        </div>
                        <div className="space-y-3 max-h-[340px] overflow-auto">
                            {runs.map(run => (
                                <div key={run.id} className="rounded-xl border border-border/35 bg-elevated/35 p-4">
                                    <div className="flex items-center justify-between">
                                        <p className="font-black text-sm">{run.id}</p>
                                        <span className="text-[10px] font-black text-emerald-500">{run.status}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-muted">{run.totalEmployees} موظف • صافي {money(run.netTotal)} EGP</p>
                                    <p className="mt-1 text-[11px] text-muted">{run.closedAt ? new Date(run.closedAt).toLocaleString() : 'دورة مغلقة'}</p>
                                </div>
                            ))}
                            {runs.length === 0 && <p className="text-muted text-sm">لا توجد دورات مغلقة حتى الآن.</p>}
                        </div>
                    </div>
                </section>
                </>
                )}

                {activeWorkspace === 'operations' && (
                <section className="rounded-2xl border border-border/40 bg-card/70 p-5 space-y-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div>
                            <h2 className="font-black flex items-center gap-2"><UserCheck size={18} /> قواعد العمل</h2>
                            <p className="text-xs text-muted font-bold mt-1">اضبط سياسة الحضور والشيفتات مرة واحدة، ثم عيّن الاستثناءات للموظفين عند الحاجة.</p>
                        </div>
                        <span className="text-[10px] font-black tracking-widest text-muted">{shiftTemplates.length} قاعدة • {shiftAssignments.length} تعيين</span>
                    </div>

                    <div className="rounded-2xl border border-border/35 bg-elevated/30 p-4 space-y-3">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            <div>
                                <h3 className="font-black text-sm">معالجة الحضور</h3>
                                <p className="text-xs text-muted font-bold mt-1">حدد كيف يعالج هذا الفرع البصمات الخام ويربطها تلقائيا إلى جلسات حضور.</p>
                            </div>
                            <span className="text-[10px] font-black text-muted">{attendancePolicies.length} سياسة</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                            <input placeholder="اسم السياسة" value={policyForm.name} onChange={e => setPolicyForm({ ...policyForm, name: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs md:col-span-2" />
                            <input placeholder="الكود" value={policyForm.code} onChange={e => setPolicyForm({ ...policyForm, code: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                            <select value={policyForm.attendanceProcessingMode} onChange={e => setPolicyForm({ ...policyForm, attendanceProcessingMode: e.target.value as any })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs md:col-span-2">
                                <option value="AUTO">تلقائي: يفضل الشيفتات ثم اليوم التشغيلي</option>
                                <option value="OPERATIONAL_DAY">اليوم التشغيلي: للفروع التي تغلق بعد منتصف الليل</option>
                                <option value="SHIFT_BASED">حسب الوردية: للفرق المجدولة</option>
                                <option value="ROLLING_24H">متواصل 24 ساعة: للفروع المفتوحة دائما</option>
                            </select>
                            <button onClick={saveAttendancePolicy} disabled={busy === 'attendance-policy'} className="h-11 px-4 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-50">حفظ السياسة</button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            <input type="number" min="0" max="23" placeholder="بداية اليوم التشغيلي" value={policyForm.operationalDayStartHour} onChange={e => setPolicyForm({ ...policyForm, operationalDayStartHour: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                            <input type="number" min="0" max="23" placeholder="نهاية اليوم التشغيلي" value={policyForm.operationalDayEndHour} onChange={e => setPolicyForm({ ...policyForm, operationalDayEndHour: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                            <input type="number" min="4" max="30" placeholder="أقصى ساعات للجلسة" value={policyForm.maxSmartSessionHours} onChange={e => setPolicyForm({ ...policyForm, maxSmartSessionHours: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                            <label className="h-11 px-3 rounded-xl bg-card border border-border text-xs font-black flex items-center gap-2">
                                <input type="checkbox" checked={policyForm.autoCloseOpenSessions} onChange={e => setPolicyForm({ ...policyForm, autoCloseOpenSessions: e.target.checked })} />
                                إغلاق تلقائي
                            </label>
                            <label className="h-11 px-3 rounded-xl bg-card border border-border text-xs font-black flex items-center gap-2">
                                <input type="checkbox" checked={policyForm.autoResolveMissingOut} onChange={e => setPolicyForm({ ...policyForm, autoResolveMissingOut: e.target.checked })} />
                                معالجة نسيان الخروج
                            </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <input placeholder="سماح التأخير بالدقائق" value={policyForm.graceLateMinutes} onChange={e => setPolicyForm({ ...policyForm, graceLateMinutes: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                            <input placeholder="سماح الانصراف المبكر" value={policyForm.earlyLeaveToleranceMinutes} onChange={e => setPolicyForm({ ...policyForm, earlyLeaveToleranceMinutes: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                            <input placeholder="بداية احتساب الأوفر" value={policyForm.overtimeThresholdMinutes} onChange={e => setPolicyForm({ ...policyForm, overtimeThresholdMinutes: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                            <input placeholder="أقل ساعات للحضور" value={policyForm.minHoursForPresent} onChange={e => setPolicyForm({ ...policyForm, minHoursForPresent: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.9fr] gap-5">
                        <div className="rounded-xl bg-app border border-border p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                                <input placeholder="اسم القاعدة" value={shiftForm.name} onChange={e => setShiftForm({ ...shiftForm, name: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs md:col-span-2" />
                                <input placeholder="الكود" value={shiftForm.code} onChange={e => setShiftForm({ ...shiftForm, code: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                                <input type="time" value={shiftForm.startTime} onChange={e => setShiftForm({ ...shiftForm, startTime: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                                <input type="time" value={shiftForm.endTime} onChange={e => setShiftForm({ ...shiftForm, endTime: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                                <button onClick={saveShiftTemplate} disabled={busy === 'shift-template'} className="h-11 px-4 rounded-xl bg-main text-app text-xs font-black disabled:opacity-50">حفظ القاعدة</button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <input placeholder="سماح التأخير بالدقائق" value={shiftForm.graceLateMinutes} onChange={e => setShiftForm({ ...shiftForm, graceLateMinutes: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                                <input placeholder="سماح الانصراف المبكر" value={shiftForm.earlyLeaveToleranceMinutes} onChange={e => setShiftForm({ ...shiftForm, earlyLeaveToleranceMinutes: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                                <input placeholder="بداية احتساب الأوفر" value={shiftForm.overtimeThresholdMinutes} onChange={e => setShiftForm({ ...shiftForm, overtimeThresholdMinutes: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    ['sun', 'أحد'],
                                    ['mon', 'اثنين'],
                                    ['tue', 'ثلاثاء'],
                                    ['wed', 'أربعاء'],
                                    ['thu', 'خميس'],
                                    ['fri', 'جمعة'],
                                    ['sat', 'سبت'],
                                ].map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => toggleWorkDay(value)}
                                        className={`h-9 px-3 rounded-xl border text-[10px] font-black ${shiftForm.workDays.includes(value) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-card border-border text-muted'}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setShiftForm(prev => ({ ...prev, name: 'ساعات عمل مرنة', code: 'FLEXIBLE', startTime: '00:00', endTime: '23:59', workDays: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], graceLateMinutes: '0', earlyLeaveToleranceMinutes: '0', overtimeThresholdMinutes: '0' }))}
                                    className="h-9 px-3 rounded-xl border bg-blue-500/10 border-blue-500/20 text-blue-500 text-[10px] font-black"
                                >
                                    مرن / ساعات مفتوحة
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {shiftTemplates.slice(0, 8).map(template => (
                                    <div key={template.id} className="rounded-xl bg-card border border-border p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-black text-sm">{template.name}</p>
                                            <span className="text-[9px] font-black text-emerald-500">{template.code || 'RULE'}</span>
                                        </div>
                                        <p className="text-xs text-muted mt-1">{template.startTime} - {template.endTime} • {(template.workDays || []).join(', ')}</p>
                                        <p className="text-[11px] text-muted mt-1">سماح تأخير {template.graceLateMinutes ?? 0} د • سماح خروج {template.earlyLeaveToleranceMinutes ?? 0} د • أوفر بعد {template.overtimeThresholdMinutes ?? 0} د</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-xl bg-app border border-border p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <select value={assignmentForm.employeeId} onChange={e => setAssignmentForm({ ...assignmentForm, employeeId: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs">
                                    <option value="">الموظف</option>
                                    {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                                </select>
                                <select value={assignmentForm.shiftTemplateId} onChange={e => setAssignmentForm({ ...assignmentForm, shiftTemplateId: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs">
                                    <option value="">قاعدة العمل</option>
                                    {shiftTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                                </select>
                                <input type="date" value={assignmentForm.effectiveFrom} onChange={e => setAssignmentForm({ ...assignmentForm, effectiveFrom: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                                <input type="date" value={assignmentForm.effectiveTo} onChange={e => setAssignmentForm({ ...assignmentForm, effectiveTo: e.target.value })} className="h-11 px-3 rounded-xl bg-card border border-border text-xs" />
                                <button onClick={assignShiftTemplate} disabled={busy === 'shift-assignment'} className="h-11 px-4 rounded-xl bg-blue-600 text-white text-xs font-black disabled:opacity-50 md:col-span-2">تعيين للموظف</button>
                            </div>
                            <div className="space-y-2 max-h-72 overflow-auto">
                                {shiftAssignments.slice(0, 10).map(assignment => {
                                    const employee = employeeMap.get(assignment.employeeId);
                                    const template = shiftTemplates.find(item => item.id === assignment.shiftTemplateId);
                                    return (
                                        <div key={assignment.id} className="rounded-xl bg-card border border-border p-3 text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="font-black">{employee?.name || assignment.employeeId}</p>
                                                <span className="text-[10px] font-black text-blue-500">{template?.name || assignment.shiftTemplateId}</span>
                                            </div>
                                            <p className="text-[11px] text-muted mt-1">من {new Date(assignment.effectiveFrom).toLocaleDateString()} {assignment.effectiveTo ? `إلى ${new Date(assignment.effectiveTo).toLocaleDateString()}` : 'مستمر'}</p>
                                        </div>
                                    );
                                })}
                                {shiftAssignments.length === 0 && <p className="text-sm text-muted">لا توجد تعيينات خاصة بالموظفين حتى الآن. سيتم استخدام قاعدة الفرع الافتراضية.</p>}
                            </div>
                        </div>
                    </div>
                </section>
                )}

                {activeWorkspace === 'review' && (
                <section className="rounded-2xl border border-border/40 bg-card/70 p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                        <div>
                            <h2 className="font-black flex items-center gap-2"><ShieldCheck size={18} /> مركز مراجعة الرواتب</h2>
                            <p className="text-xs text-muted font-bold mt-1">راجع الحضور والغياب والأوفر والإجازات والسلف قبل إغلاق دورة الرواتب.</p>
                        </div>
                        <button onClick={() => loadPayrollReview()} disabled={loadingReview || !selectedCycle} className="h-10 px-4 rounded-xl border border-border bg-app text-xs font-black disabled:opacity-50">
                            {loadingReview ? 'جاري التحميل...' : 'تحديث المراجعة'}
                        </button>
                    </div>

                    {review ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                                {[
                                    { label: 'الموظفون', value: review.totals.employees },
                                    { label: 'الإجمالي', value: `${money(review.totals.gross)} EGP` },
                                    { label: 'الخصومات', value: `${money(review.totals.deductions)} EGP` },
                                    { label: 'الصافي', value: `${money(review.totals.net)} EGP` },
                                    { label: 'موانع', value: review.totals.blockers || 0 },
                                    { label: 'تنبيهات', value: review.totals.warnings || 0 },
                                ].map(item => (
                                    <div key={item.label} className="rounded-xl bg-app border border-border p-4">
                                        <p className="text-[9px] uppercase tracking-widest text-muted font-black">{item.label}</p>
                                        <p className="text-xl font-black mt-1 tabular-nums">{item.value}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[1460px] text-sm">
                                    <thead className="text-left text-[10px] uppercase tracking-widest text-muted">
                                        <tr>
                                            <th className="py-3">الموظف</th>
                                            <th>الحضور</th>
                                            <th>الأساسي والثوابت</th>
                                            <th>متغيرات الشهر</th>
                                            <th>الاستقطاعات</th>
                                            <th>الإجمالي</th>
                                            <th>الصافي</th>
                                            <th>الجاهزية</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {review.lines.map(line => {
                                            const deductionTotal = Number(line.penalties || 0) + Number(line.loanDeductions || 0) + Number(line.otherDeductions || 0);
                                            const fixedAllowances = Number(line.fixedAllowances || 0);
                                            const fixedDeductions = Number(line.fixedDeductions || 0);
                                            const attendanceDeductions = Number(line.attendanceDeductions || 0);
                                            return (
                                                <tr key={line.employeeId} className="border-t border-border/50 align-top">
                                                    <td className="py-3">
                                                        <p className="font-bold">{line.employeeName || employeeMap.get(line.employeeId)?.name || line.employeeId}</p>
                                                        <p className="text-[11px] text-muted">{line.role || employeeMap.get(line.employeeId)?.role || 'موظف'}</p>
                                                    </td>
                                                    <td>
                                                        <p className="font-black">{line.attendance?.sessions || 0} يوم</p>
                                                        <p className="text-[11px] text-muted">{Number(line.attendance?.totalHours || 0).toFixed(1)}h • متوقع {line.attendance?.expectedWorkDays ?? '-'} • غياب {line.attendance?.absenceDays || 0}</p>
                                                    </td>
                                                    <td>
                                                        <p className="font-black">{money(line.baseSalary)} EGP</p>
                                                        <p className="text-[11px] text-emerald-500">بدلات ثابتة +{money(fixedAllowances)}</p>
                                                        <p className="text-[11px] text-muted">خصومات ثابتة -{money(fixedDeductions)}</p>
                                                        {!!line.compensationItems?.length && (
                                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                                {line.compensationItems.slice(0, 3).map((item) => (
                                                                    <span key={item.id} className="rounded-full border border-border/40 bg-app px-2 py-1 text-[10px] font-black text-muted">
                                                                        {item.nameAr || item.name} {String(item.type).toUpperCase() === 'DEDUCTION' ? '-' : '+'}{money(item.amount)}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <p className="text-emerald-500 font-black">مكافآت +{money(line.bonuses)}</p>
                                                        <p className="text-emerald-500 text-[11px] font-black">أوفر +{money(line.overtime)}</p>
                                                        <p className="text-[11px] text-muted">تأخير {line.attendance?.lateMinutes || 0} د • انصراف مبكر {line.attendance?.earlyLeaveMinutes || 0} د</p>
                                                        <p className="text-[11px] text-muted">إجازات: {line.leaves?.approvedDays || 0} معتمد • {line.leaves?.pendingDays || 0} معلق</p>
                                                    </td>
                                                    <td>
                                                        <p className="text-rose-500 font-black">إجمالي -{money(deductionTotal)}</p>
                                                        <p className="text-[11px] text-muted">خصومات شهرية -{money(line.penalties)}</p>
                                                        <p className="text-[11px] text-muted">سلف -{money(line.loanDeductions)}</p>
                                                        <p className="text-[11px] text-muted">خصم حضور -{money(attendanceDeductions)}</p>
                                                    </td>
                                                    <td className="font-black text-main">{money(line.grossPay)}</td>
                                                    <td className="font-black text-emerald-500">{money(line.netPay)}</td>
                                                    <td>
                                                        {!(line.blockers || []).length && !(line.warnings || []).length ? (
                                                            <span className="text-[10px] font-black text-emerald-500">جاهز</span>
                                                        ) : (
                                                            <div className="space-y-1">
                                                                {line.blockers?.map(blocker => (
                                                                    <span key={blocker} className="block rounded-lg bg-rose-500/10 text-rose-600 border border-rose-500/20 px-2 py-1 text-[10px] font-black">{blocker}</span>
                                                                ))}
                                                                {line.warnings?.map(warning => (
                                                                    <span key={warning} className="block rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2 py-1 text-[10px] font-black">{warning}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-muted py-10 text-sm">
                            {selectedCycle ? 'شغّل المراجعة أو احتساب الدورة لتظهر بيانات الجاهزية هنا.' : 'أنشئ دورة رواتب أولا ثم ابدأ المراجعة.'}
                        </div>
                    )}
                </section>
                )}

                {activeWorkspace === 'payslips' && (
                <section className="rounded-2xl border border-border/40 bg-card/70 p-5 space-y-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="flex items-center gap-2 font-black"><FileText size={18} /> كشوف المرتبات</h2>
                            <p className="mt-1 text-xs font-bold text-muted">
                                راجع كشف مرتب كل موظف بشكل واضح من داخل الدورة. قبل الإغلاق سترى معاينة، وبعد الإغلاق تقدر تولد النسخة الرسمية وتحمّل PDF.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <select
                                value={selectedPayslipEmployeeId}
                                onChange={e => setSelectedPayslipEmployeeId(e.target.value)}
                                className="h-10 min-w-[220px] rounded-xl border border-border bg-app px-3 text-xs font-black"
                            >
                                <option value="">اختر الموظف</option>
                                {payslipPreviewEmployees.map(item => (
                                    <option key={item.employeeId} value={item.employeeId}>
                                        {item.employeeName}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={() => loadPayslips()}
                                disabled={loadingPayslips || !selectedRun}
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-app px-4 text-xs font-black disabled:opacity-50"
                            >
                                <RefreshCw size={14} className={loadingPayslips ? 'animate-spin' : ''} />
                                تحديث الكشوف
                            </button>
                            <button
                                onClick={generatePayslips}
                                disabled={busy === 'payslips' || !selectedRun || selectedRun.status !== 'CLOSED'}
                                className="inline-flex h-10 items-center gap-2 rounded-xl bg-main px-4 text-xs font-black text-app disabled:opacity-50"
                            >
                                <FileText size={14} />
                                توليد الكشوف الرسمية
                            </button>
                            <button
                                onClick={() => selectedPayslip && downloadPayslip(selectedPayslip.id)}
                                disabled={!selectedPayslip || busy === `payslip:${selectedPayslip?.id}`}
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-elevated px-4 text-xs font-black disabled:opacity-50"
                            >
                                <Download size={14} />
                                PDF
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_0.9fr]">
                        <div className="rounded-2xl border border-border/35 bg-app p-5">
                            {previewEmployee || selectedPayslip ? (
                                <div className="space-y-5">
                                    <div className="flex flex-col gap-4 border-b border-border/50 pb-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-xl font-black">{previewEmployeeName}</h3>
                                                <span className="rounded-full border border-border/50 bg-card px-2.5 py-1 text-[10px] font-black text-muted">
                                                    {selectedPayslip ? `رسمي v${selectedPayslip.version || 1}` : 'معاينة الدورة'}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-sm font-bold text-muted">{previewEmployeeRole}</p>
                                            <p className="mt-2 text-[11px] font-bold text-muted">
                                                {selectedCycle ? `${new Date(selectedCycle.periodStart).toLocaleDateString()} - ${new Date(selectedCycle.periodEnd).toLocaleDateString()}` : 'حدد دورة رواتب'}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            {[
                                                { label: 'الأساسي', value: `${money(previewBaseSalary)} EGP` },
                                                { label: 'ثوابت موجبة', value: `${money(previewFixedAllowances)} EGP` },
                                                { label: 'متغيرات الشهر', value: `${money(previewBonuses + previewOvertime)} EGP` },
                                                { label: 'الصافي', value: `${money(previewNetPay)} EGP` },
                                            ].map(item => (
                                                <div key={item.label} className="min-w-[120px] rounded-xl border border-border/40 bg-card px-4 py-3">
                                                    <p className="text-[10px] font-black tracking-widest text-muted">{item.label}</p>
                                                    <p className="mt-1 text-sm font-black">{item.value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                        <div className="rounded-2xl border border-border/40 bg-card p-4">
                                            <h4 className="text-sm font-black">الاستحقاقات</h4>
                                            <div className="mt-4 space-y-2 text-sm">
                                                {[
                                                    ['المرتب الأساسي', previewBaseSalary],
                                                    ['بدلات ثابتة', previewFixedAllowances],
                                                    ['مكافآت الشهر', previewBonuses],
                                                    ['أوفر تايم', previewOvertime],
                                                ].map(([label, value]) => (
                                                    <div key={String(label)} className="flex items-center justify-between gap-3 rounded-xl border border-border/35 bg-app px-3 py-2.5">
                                                        <span className="font-bold text-muted">{label}</span>
                                                        <span className="font-black text-main">{money(Number(value))} EGP</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-border/40 bg-card p-4">
                                            <h4 className="text-sm font-black">الاستقطاعات</h4>
                                            <div className="mt-4 space-y-2 text-sm">
                                                {[
                                                    ['خصومات ثابتة', previewFixedDeductions],
                                                    ['خصم حضور', previewAttendanceDeductions],
                                                    ['خصومات شهرية', previewPenalties],
                                                    ['سلف وأقساط', previewLoanDeductions],
                                                    ['خصومات أخرى', previewOtherDeductions],
                                                ].map(([label, value]) => (
                                                    <div key={String(label)} className="flex items-center justify-between gap-3 rounded-xl border border-border/35 bg-app px-3 py-2.5">
                                                        <span className="font-bold text-muted">{label}</span>
                                                        <span className="font-black text-main">{money(Number(value))} EGP</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                                        <div className="rounded-2xl border border-border/40 bg-card p-4">
                                            <div className="mb-3 flex items-center justify-between">
                                                <h4 className="text-sm font-black">تفصيل الجاهزية</h4>
                                                <span className="text-[10px] font-black text-muted">
                                                    {selectedPayslip ? 'تم توليد كشف رسمي' : 'معاينة قبل الإغلاق'}
                                                </span>
                                            </div>
                                            {previewEmployee?.blockers?.length || previewEmployee?.warnings?.length ? (
                                                <div className="space-y-2">
                                                    {(previewEmployee?.blockers || []).map(blocker => (
                                                        <div key={blocker} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-black text-red-600">
                                                            {blocker}
                                                        </div>
                                                    ))}
                                                    {(previewEmployee?.warnings || []).map(warning => (
                                                        <div key={warning} className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-600">
                                                            {warning}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="rounded-xl border border-border/35 bg-app px-3 py-4 text-sm font-bold text-muted">
                                                    لا توجد موانع على هذا الموظف داخل المراجعة الحالية.
                                                </div>
                                            )}
                                        </div>

                                        <div className="rounded-2xl border border-border/40 bg-card p-4">
                                            <h4 className="text-sm font-black">الملخص النهائي</h4>
                                            <div className="mt-4 space-y-2">
                                                <div className="flex items-center justify-between rounded-xl border border-border/35 bg-app px-3 py-3 text-sm">
                                                    <span className="font-bold text-muted">الإجمالي قبل الخصومات</span>
                                                    <span className="font-black">{money(previewGrossPay)} EGP</span>
                                                </div>
                                                <div className="flex items-center justify-between rounded-xl border border-border/35 bg-app px-3 py-3 text-sm">
                                                    <span className="font-bold text-muted">إجمالي الاستقطاعات</span>
                                                    <span className="font-black">{money(previewGrossPay - previewNetPay)} EGP</span>
                                                </div>
                                                <div className="flex items-center justify-between rounded-xl border border-main/20 bg-main/10 px-3 py-3 text-sm">
                                                    <span className="font-black text-main">صافي المستحق</span>
                                                    <span className="font-black text-main">{money(previewNetPay)} EGP</span>
                                                </div>
                                                {selectedPayslip?.issuedAt && (
                                                    <p className="pt-1 text-[11px] font-bold text-muted">
                                                        آخر توليد: {new Date(selectedPayslip.issuedAt).toLocaleString()}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-border/50 bg-card px-5 py-14 text-center text-sm font-bold text-muted">
                                    شغّل مراجعة الدورة أو اختر كشفًا رسميًا لتظهر معاينة المرتب هنا.
                                </div>
                            )}
                        </div>

                        <aside className="rounded-2xl border border-border/35 bg-app p-4">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-black">الموظفون داخل الدورة</h3>
                                    <p className="mt-1 text-[11px] font-bold text-muted">
                                        اختر الموظف من القائمة ثم راجع كشفه مباشرة.
                                    </p>
                                </div>
                                <span className="rounded-full border border-border/40 bg-card px-2.5 py-1 text-[10px] font-black text-muted">
                                    {payslipPreviewEmployees.length}
                                </span>
                            </div>
                            <div className="space-y-2">
                                {payslipPreviewEmployees.map(item => {
                                    const isActive = item.employeeId === selectedPayslipEmployeeId;
                                    return (
                                        <button
                                            key={item.employeeId}
                                            type="button"
                                            onClick={() => setSelectedPayslipEmployeeId(item.employeeId)}
                                            className={`w-full rounded-2xl border px-4 py-3 text-right transition-colors ${isActive ? 'border-main/25 bg-main/10' : 'border-border/35 bg-card hover:bg-elevated'}`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-black">{item.employeeName}</p>
                                                    <p className="mt-1 text-[11px] font-bold text-muted">
                                                        {item.source === 'payslip' ? 'كشف رسمي' : 'معاينة'}
                                                        {item.blockers.length ? ` • ${item.blockers.length} مانع` : item.warnings.length ? ` • ${item.warnings.length} تنبيه` : ' • جاهز'}
                                                    </p>
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-sm font-black">{money(item.netPay)} EGP</p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                                {payslipPreviewEmployees.length === 0 && (
                                    <div className="rounded-2xl border border-dashed border-border/50 bg-card px-4 py-8 text-center text-sm font-bold text-muted">
                                        لا توجد بيانات كافية للكشوف بعد. ابدأ بالاحتساب أو أغلق الدورة أولًا.
                                    </div>
                                )}
                            </div>
                        </aside>
                    </div>

                    {!selectedRun && (
                        <div className="rounded-2xl border border-border/35 bg-app px-4 py-3 text-xs font-bold text-muted">
                            أنت الآن ترى معاينة مباشرة من مراجعة الدورة. بعد إغلاق الدورة سيظهر هنا زر توليد الكشوف الرسمية لكل الموظفين.
                        </div>
                    )}
                </section>
                )}

                {activeWorkspace === 'compliance' && (
                <>
                <section className="rounded-2xl border border-border/40 bg-card/70 p-5 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div>
                            <h2 className="font-black flex items-center gap-2"><FileText size={18} /> طبقة الامتثال المصري</h2>
                            <p className="text-xs text-muted font-bold mt-1">التأمينات والضرائب وتكلفة صاحب العمل ونماذج التصدير الجاهزة من نفس دورة الرواتب.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <select value={reportingCurrency} onChange={e => setReportingCurrency(e.target.value as 'EGP' | 'USD')} className="h-10 px-3 rounded-xl bg-app border border-border text-xs">
                                <option value="EGP">EGP</option>
                                <option value="USD">USD</option>
                            </select>
                            <input type="number" min="0.0001" step="0.0001" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} className="h-10 w-28 px-3 rounded-xl bg-app border border-border text-xs" placeholder="سعر الصرف" />
                            <input type="number" min="0" step="0.0001" value={martyrsContributionRate} onChange={e => setMartyrsContributionRate(e.target.value)} className="h-10 w-32 px-3 rounded-xl bg-app border border-border text-xs" placeholder="نسبة الشهداء %" />
                            <button onClick={() => loadCompliance()} disabled={loadingCompliance || !selectedCycle} className="h-10 px-4 rounded-xl border border-border bg-app text-xs font-black disabled:opacity-50">
                                {loadingCompliance ? 'جاري التحميل...' : 'تحديث الامتثال'}
                            </button>
                        </div>
                    </div>

                    {compliance ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
                                {[
                                    { label: 'إجمالي الرواتب', value: `${money(compliance.totals.grossPay)} ${compliance.cycle.baseCurrency}` },
                                    { label: 'تأمين الموظف', value: `${money(compliance.totals.employeeInsurance)} ${compliance.cycle.baseCurrency}` },
                                    { label: 'تأمين صاحب العمل', value: `${money(compliance.totals.employerInsurance)} ${compliance.cycle.baseCurrency}` },
                                    { label: 'ضريبة المرتب', value: `${money(compliance.totals.salaryTax)} ${compliance.cycle.baseCurrency}` },
                                    { label: 'الصافي بعد الاستقطاعات', value: `${money(compliance.totals.netAfterStatutory)} ${compliance.cycle.baseCurrency}` },
                                    { label: 'تكلفة صاحب العمل', value: `${money(compliance.totals.employerCost)} ${compliance.cycle.baseCurrency}` },
                                    { label: 'هويات ناقصة', value: compliance.totals.missingNationalIds },
                                    { label: 'أكواد ناقصة', value: compliance.totals.missingEmployeeCodes },
                                ].map(item => (
                                    <div key={item.label} className="rounded-xl bg-app border border-border p-4">
                                        <p className="text-[9px] uppercase tracking-widest text-muted font-black">{item.label}</p>
                                        <p className="text-lg font-black mt-1 tabular-nums">{item.value}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="rounded-xl bg-app border border-border p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-muted font-black">الإعدادات</p>
                                    <p className="text-sm font-bold mt-2">الإعفاء السنوي: {money(compliance.config.annualPersonalExemption)} EGP</p>
                                    <p className="text-sm font-bold mt-1">شريحة التأمينات: {money(compliance.config.insuranceMinMonthly)} - {money(compliance.config.insuranceMaxMonthly)} EGP</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-muted font-black">النسب</p>
                                    <p className="text-sm font-bold mt-2">تأمين الموظف: {(Number(compliance.config.employeeInsuranceRate || 0) * 100).toFixed(2)}%</p>
                                    <p className="text-sm font-bold mt-1">تأمين صاحب العمل: {(Number(compliance.config.employerInsuranceRate || 0) * 100).toFixed(2)}%</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-muted font-black">التقرير</p>
                                    <p className="text-sm font-bold mt-2">العملة: {compliance.cycle.reportingCurrency}</p>
                                    <p className="text-sm font-bold mt-1">سعر الصرف: {Number(compliance.cycle.exchangeRate || 1).toFixed(4)}</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {compliance.templates.map(template => (
                                    <React.Fragment key={template.key}>
                                        <button onClick={() => exportCompliance(template.key, 'xlsx')} disabled={busy === `compliance-${template.key}-csv`} className="h-10 px-4 rounded-xl border border-border bg-app text-xs font-black flex items-center gap-2 disabled:opacity-50">
                                            <Download size={14} /> {complianceTemplateLabel(template.key, template.label)} Excel
                                        </button>
                                        <button onClick={() => exportCompliance(template.key, 'pdf')} disabled={busy === `compliance-${template.key}-pdf`} className="h-10 px-4 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center gap-2 disabled:opacity-50">
                                            <FileText size={14} /> PDF
                                        </button>
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-muted py-8 text-sm">
                            {selectedCycle ? 'اختر قالبا ثم صدّر ملف الامتثال الرسمي المطلوب.' : 'أنشئ دورة رواتب أولا.'}
                        </div>
                    )}
                </section>

                <section className="rounded-2xl border border-border/40 bg-card/70 p-5">
                    <h2 className="font-black mb-4 flex items-center gap-2"><Wallet size={18} /> بنود الرواتب الحالية</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-left text-[10px] uppercase tracking-widest text-muted">
                                <tr><th className="py-3">الموظف</th><th>الأساسي</th><th>الأوفر تايم</th><th>الخصومات</th><th>الصافي</th><th>الحالة</th></tr>
                            </thead>
                            <tbody>
                                {selectedPayouts.map(line => {
                                    const employee = employeeMap.get(line.employeeId);
                                    return (
                                        <tr key={line.id} className="border-t border-border/50">
                                            <td className="py-3">
                                                <p className="font-bold">{employee?.name || line.employeeId}</p>
                                                <p className="text-[11px] text-muted">{employee?.role || 'موظف'}</p>
                                            </td>
                                            <td>{money(line.basicSalary)}</td>
                                            <td>{money(line.overtime)}</td>
                                            <td>{money(line.deductions)}</td>
                                            <td className="font-black text-emerald-500">{money(line.netPay)}</td>
                                            <td><span className="px-2 py-1 rounded-lg bg-elevated text-[10px] font-black">{line.status || 'PENDING'}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {selectedCycle && selectedPayouts.length === 0 && <p className="text-center text-muted py-10 text-sm">شغّل الاحتساب لتوليد بنود الرواتب من الحضور.</p>}
                    </div>
                </section>
                </>
                )}

                {activeWorkspace === 'operations' && (
                <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <div className="rounded-2xl border border-border/40 bg-card/70 p-5 space-y-4">
                        <h2 className="font-black flex items-center gap-2"><AlertTriangle size={18} /> المكافآت والخصومات</h2>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                            <select value={adjustmentForm.employeeId} onChange={e => setAdjustmentForm({ ...adjustmentForm, employeeId: e.target.value })} className="h-11 px-3 rounded-xl bg-app border border-border text-xs md:col-span-2">
                                <option value="">الموظف</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <select value={adjustmentForm.type} onChange={e => setAdjustmentForm({ ...adjustmentForm, type: e.target.value })} className="h-11 px-3 rounded-xl bg-app border border-border text-xs">
                                <option value="PENALTY">خصم</option>
                                <option value="BONUS">مكافأة</option>
                            </select>
                            <input placeholder="المبلغ" value={adjustmentForm.amount} onChange={e => setAdjustmentForm({ ...adjustmentForm, amount: e.target.value })} className="h-11 px-3 rounded-xl bg-app border border-border text-xs" />
                            <button onClick={createAdjustment} disabled={busy === 'adjustment'} className="h-11 px-4 rounded-xl bg-main text-app text-xs font-black disabled:opacity-50">حفظ</button>
                            <input placeholder="السبب" value={adjustmentForm.reason} onChange={e => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })} className="h-11 px-3 rounded-xl bg-app border border-border text-xs md:col-span-4" />
                            <input type="date" value={adjustmentForm.effectiveDate} onChange={e => setAdjustmentForm({ ...adjustmentForm, effectiveDate: e.target.value })} className="h-11 px-3 rounded-xl bg-app border border-border text-xs" />
                        </div>
                        <div className="space-y-2 max-h-72 overflow-auto">
                            {adjustments.slice(0, 12).map(item => (
                                <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-app border border-border text-sm">
                                    <span>{employeeMap.get(item.employeeId)?.name || item.employeeId} • {item.reason} • <b>{item.status}</b></span>
                                    <div className="flex items-center gap-2">
                                        <span className={item.type === 'BONUS' ? 'text-emerald-500 font-black' : 'text-rose-500 font-black'}>{item.type === 'BONUS' ? '+' : '-'}{money(item.amount)}</span>
                                        {item.status === 'PENDING' && (
                                            <>
                                                <button onClick={() => approveAdjustment(item.id, 'APPROVED')} disabled={busy === `adjustment:${item.id}`} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black disabled:opacity-50">اعتماد</button>
                                                <button onClick={() => approveAdjustment(item.id, 'REJECTED')} disabled={busy === `adjustment:${item.id}`} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-[10px] font-black disabled:opacity-50">رفض</button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border/40 bg-card/70 p-5 space-y-4">
                        <h2 className="font-black flex items-center gap-2"><Clock size={18} /> السلف والقروض</h2>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                            <select value={loanForm.employeeId} onChange={e => setLoanForm({ ...loanForm, employeeId: e.target.value })} className="h-11 px-3 rounded-xl bg-app border border-border text-xs md:col-span-2">
                                <option value="">الموظف</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <input placeholder="المبلغ" value={loanForm.principalAmount} onChange={e => setLoanForm({ ...loanForm, principalAmount: e.target.value })} className="h-11 px-3 rounded-xl bg-app border border-border text-xs" />
                            <input placeholder="عدد الأقساط" value={loanForm.installmentsCount} onChange={e => setLoanForm({ ...loanForm, installmentsCount: e.target.value })} className="h-11 px-3 rounded-xl bg-app border border-border text-xs" />
                            <button onClick={createLoan} disabled={busy === 'loan'} className="h-11 px-4 rounded-xl bg-main text-app text-xs font-black disabled:opacity-50">حفظ</button>
                            <input type="date" value={loanForm.effectiveFrom} onChange={e => setLoanForm({ ...loanForm, effectiveFrom: e.target.value })} className="h-11 px-3 rounded-xl bg-app border border-border text-xs" />
                            <input placeholder="ملاحظات" value={loanForm.notes} onChange={e => setLoanForm({ ...loanForm, notes: e.target.value })} className="h-11 px-3 rounded-xl bg-app border border-border text-xs md:col-span-4" />
                        </div>
                        <div className="space-y-2 max-h-72 overflow-auto">
                            {loans.slice(0, 12).map(loan => (
                                <div key={loan.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-app border border-border text-sm">
                                    <span>{employeeMap.get(loan.employeeId)?.name || loan.employeeId} • {loan.status}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-black">{money(loan.outstandingAmount || loan.principalAmount)} EGP</span>
                                        {loan.status === 'PENDING' && <button onClick={() => approveLoan(loan.id, 'APPROVED')} disabled={busy === `loan:${loan.id}`} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black disabled:opacity-50">اعتماد</button>}
                                        {loan.status === 'APPROVED' && <button onClick={() => approveLoan(loan.id, 'DISBURSED')} disabled={busy === `loan:${loan.id}`} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black disabled:opacity-50">{lang === 'ar' ? 'صرف' : 'Disburse'}</button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
                )}
            </div>
        </div>
    );
}


