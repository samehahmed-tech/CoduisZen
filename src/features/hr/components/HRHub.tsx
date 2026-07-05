import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
    Users, Search, Plus, Clock, AlertTriangle, TrendingUp,
    ChevronRight, UserCheck, Shield, Briefcase, Building2, Activity, X, Loader2,
    CalendarCheck, FileText, BarChart3, Smartphone, Workflow, Award, ExternalLink, Archive, RefreshCw, Upload,
    Fingerprint, BookOpen, WalletCards, Settings2, ArrowUpRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { apiRequest } from '../../../../services/api/core';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { translations } from '../../../../services/translations';

type EmployeeViewPreset = 'ALL' | 'MISSING_STRUCTURE' | 'MISSING_CODE' | 'NO_ACCESS' | 'MISSING_FINANCE';
type EmployeeFormStep = 'basic' | 'org' | 'access' | 'finance';
type EmployeeProfileTab = 'overview' | 'finance' | 'documents' | 'performance' | 'lifecycle';

const DEFAULT_EMPLOYEE_FORM = {
    id: '',
    name: '',
    email: '',
    phone: '',
    branchId: '',
    employeeCode: '',
    role: 'CASHIER',
    hasSystemAccess: true,
    pin: '',
    password: '',
    salary: '',
    nationalId: '',
    hourlyRate: '',
    emergencyContact: '',
    bankAccount: '',
    managementId: '',
    departmentId: '',
    jobTitleId: '',
};

const DEFAULT_DOCUMENT_FORM = {
    documentType: 'HEALTH_CERTIFICATE',
    title: '',
    documentNumber: '',
    issueDate: '',
    expiryDate: '',
    fileUrl: '',
    sourceType: 'LINK',
    fileName: '',
    notes: '',
};

const DEFAULT_SELF_LEAVE_FORM = {
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    reason: '',
};

const DEFAULT_PERFORMANCE_FORM = {
    actionType: 'HR_NOTE',
    title: '',
    noteBody: '',
    status: 'OPEN',
    rating: '',
    dueDate: '',
    followUpAction: '',
};

const DEFAULT_OFFBOARDING_FORM = {
    title: '',
    taskType: 'GENERAL',
    status: 'OPEN',
    dueDate: '',
    ownerName: '',
    resultNotes: '',
};

const DEFAULT_ONBOARDING_FORM = {
    title: '',
    taskType: 'GENERAL',
    status: 'OPEN',
    dueDate: '',
    ownerName: '',
    resultNotes: '',
};

const DEFAULT_COMPENSATION_FORM = {
    id: '',
    name: '',
    nameAr: '',
    category: 'GENERAL',
    type: 'ALLOWANCE',
    amount: '',
    effectiveFrom: '',
    effectiveTo: '',
    notes: '',
    isRecurring: true,
};

const HR_EXCELLENCE_LANES = [
    {
        title: 'ملف الموظف',
        subtitle: 'بيانات موحدة لكل موظف تشمل الفرع والقسم والمسمى الوظيفي ووسائل التواصل وكود البصمة.',
        icon: Users,
        tone: 'blue',
        maturity: 'متاح',
        actions: ['بيانات الموظفين', 'المسميات الوظيفية', 'التوزيع على الفروع'],
    },
    {
        title: 'الحضور والانصراف',
        subtitle: 'معالجة ذكية للبصمات مع سياسات دوام وورديات ومراجعة واضحة للحالات الخاصة والاستثناءات.',
        icon: Clock,
        tone: 'emerald',
        maturity: 'متاح',
        actions: ['سجل الحضور', 'سياسات الدوام', 'مراجعة الاستثناءات'],
    },
    {
        title: 'الإجازات والغياب',
        subtitle: 'أرصدة وأنواع الإجازات وطلبات الاعتماد والغياب المتكرر في مكان واحد أسهل للمراجعة.',
        icon: CalendarCheck,
        tone: 'amber',
        maturity: 'متاح',
        actions: ['طلبات الإجازة', 'الأرصدة', 'الموافقات'],
    },
    {
        title: 'الرواتب والاستحقاقات',
        subtitle: 'أساسي وبدلات وخصومات وسلف وأوفر تايم مع دورة رواتب أوضح من أول المراجعة حتى الإغلاق.',
        icon: Briefcase,
        tone: 'violet',
        maturity: 'متاح',
        actions: ['دورات الرواتب', 'البدلات', 'الخصومات'],
    },
    {
        title: 'خدمة الموظف والمدير',
        subtitle: 'مساحة أسهل للطلبات اليومية والموافقات والاطلاع على الحضور والمهام وجدول العمل.',
        icon: Smartphone,
        tone: 'cyan',
        maturity: 'متاح',
        actions: ['بوابة الموظف', 'موافقات المدير', 'استخدام مرن'],
    },
    {
        title: 'المستندات',
        subtitle: 'عقود وشهادات صحية ووثائق الموظفين مع تنبيهات الانتهاء ومرونة رفع روابط أو ملفات.',
        icon: FileText,
        tone: 'slate',
        maturity: 'متاح',
        actions: ['ملفات الموظفين', 'تنبيهات الانتهاء', 'نماذج جاهزة'],
    },
    {
        title: 'الأداء والمتابعة',
        subtitle: 'ملاحظات وتقييمات ومؤشرات أداء تساعد الإدارة على اتخاذ قرارات أسرع وأوضح.',
        icon: Award,
        tone: 'rose',
        maturity: 'متاح',
        actions: ['ملاحظات الأداء', 'المراجعات', 'خطط التحسين'],
    },
    {
        title: 'التقارير والمتابعة',
        subtitle: 'تقارير تشغيلية وإدارية ملونة وواضحة مع تتبع الجاهزية والتنبيهات قبل الرواتب.',
        icon: BarChart3,
        tone: 'indigo',
        maturity: 'متاح',
        actions: ['لوحات المتابعة', 'التنبيهات', 'جاهزية الرواتب'],
    },
] as const;

const HR_WORKSPACE_SECTIONS = [
    {
        title: 'الموظفون',
        subtitle: 'الملفات والهيكل الوظيفي والبيانات الأساسية',
        route: '/hr',
        icon: Users,
        tone: 'blue',
    },
    {
        title: 'الحضور',
        subtitle: 'السجل الذكي والبصمات والاستثناءات',
        route: '/attendance',
        icon: Clock,
        tone: 'emerald',
    },
    {
        title: 'الورديات',
        subtitle: 'خطط الأسبوع والقوالب والتوزيع اليومي',
        route: '/scheduling',
        icon: CalendarCheck,
        tone: 'amber',
    },
    {
        title: 'الرواتب',
        subtitle: 'المراجعة والاحتساب والسلف والخصومات',
        route: '/payroll',
        icon: WalletCards,
        tone: 'violet',
    },
    {
        title: 'أجهزة البصمة',
        subtitle: 'الحالة والربط والمزامنة والاختبار',
        route: '/biometric-devices',
        icon: Fingerprint,
        tone: 'cyan',
    },
    {
        title: 'إعدادات HR',
        subtitle: 'الإدارات والأقسام والمسميات الوظيفية',
        route: '/hr-settings',
        icon: Settings2,
        tone: 'slate',
    },
    {
        title: 'المهام',
        subtitle: 'قوائم الورديات والمتابعة اليومية',
        route: '/shift-tasks',
        icon: Workflow,
        tone: 'rose',
    },
    {
        title: 'الدليل',
        subtitle: 'إرشادات التشغيل والأسئلة المتكررة',
        route: '/hr-guide',
        icon: BookOpen,
        tone: 'indigo',
    },
] as const;

const laneToneClass: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    violet: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    slate: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    rose: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
};

const documentStatusClass = (status?: string) => {
    if (status === 'EXPIRED') return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
    if (status === 'EXPIRING_SOON') return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    if (status === 'ARCHIVED') return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
};

const documentStatusLabel = (doc: any, lang: 'en' | 'ar' = 'en') => {
    const status = doc.computedStatus || doc.status;
    if (status === 'EXPIRED') return lang === 'ar' ? 'منتهي' : 'Expired';
    if (status === 'EXPIRING_SOON') return lang === 'ar' ? `${doc.daysToExpiry} يوم` : `${doc.daysToExpiry} days`;
    if (status === 'ARCHIVED') return lang === 'ar' ? 'مؤرشف' : 'Archived';
    return lang === 'ar' ? 'نشط' : 'Active';
};

const money = (value?: number | null, currency = 'EGP') => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
}).format(Number(value || 0));

const formatShortDate = (value?: string | Date | null, lang: 'en' | 'ar' = 'en') => {
    if (!value) return '--';
    return new Date(value).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB');
};

export default function HRHub() {
    const { settings, branches } = useAuthStore();
    const branchId = settings?.activeBranchId;
    const currentUser = settings?.currentUser;
    const lang = (settings?.language || 'en') as 'en' | 'ar';
    const t = (translations as any)[lang] || translations['en'];
    const navigate = useNavigate();
    const [employees, setEmployees] = useState<any[]>([]);
    const [stats, setStats] = useState<any>({ totalHeadcount: 0, activeShifts: 0, exceptions: 0 });
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
    const [accessFilter, setAccessFilter] = useState<'ALL' | 'HAS_ACCESS' | 'NO_ACCESS' | 'MISSING_CODE'>('ALL');
    const [page, setPage] = useState(0);
    const [totalEmployees, setTotalEmployees] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    const [viewPreset, setViewPreset] = useState<EmployeeViewPreset>('ALL');
    const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [formStep, setFormStep] = useState<EmployeeFormStep>('basic');
    const [profileTab, setProfileTab] = useState<EmployeeProfileTab>('overview');
    const [createForm, setCreateForm] = useState(DEFAULT_EMPLOYEE_FORM);
    const [isCreating, setIsCreating] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<any>(null);
    const [employeeDocuments, setEmployeeDocuments] = useState<any[]>([]);
    const [employeeCompensationItems, setEmployeeCompensationItems] = useState<any[]>([]);
    const [compensationForm, setCompensationForm] = useState(DEFAULT_COMPENSATION_FORM);
    const [savingCompensationItem, setSavingCompensationItem] = useState(false);
    const [removingCompensationItemId, setRemovingCompensationItemId] = useState<string | null>(null);
    const [employeePerformanceRecords, setEmployeePerformanceRecords] = useState<any[]>([]);
    const [employeeالتهيئةRecords, setEmployeeالتهيئةRecords] = useState<any[]>([]);
    const [employeeOffboardingRecords, setEmployeeOffboardingRecords] = useState<any[]>([]);
    const [expiringDocuments, setExpiringDocuments] = useState<any[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [jobTitles, setJobTitles] = useState<any[]>([]);
    const [documentForm, setDocumentForm] = useState(DEFAULT_DOCUMENT_FORM);
    const [savingDocument, setSavingDocument] = useState(false);
    const [employeeLifecycle, setEmployeeLifecycle] = useState<any>(null);
    const [loadingLifecycle, setLoadingLifecycle] = useState(false);
    const [executiveDashboard, setExecutiveDashboard] = useState<any>(null);
    const [loadingExecutiveDashboard, setLoadingExecutiveDashboard] = useState(false);
    const [executiveReports, setExecutiveReports] = useState<any>(null);
    const [loadingExecutiveReports, setLoadingExecutiveReports] = useState(false);
    const [performanceForm, setPerformanceForm] = useState(DEFAULT_PERFORMANCE_FORM);
    const [savingPerformanceRecord, setSavingPerformanceRecord] = useState(false);
    const [updatingPerformanceStatus, setUpdatingPerformanceStatus] = useState<number | null>(null);
    const [offboardingForm, setOffboardingForm] = useState(DEFAULT_OFFBOARDING_FORM);
    const [savingOffboardingRecord, setSavingOffboardingRecord] = useState(false);
    const [updatingOffboardingStatus, setUpdatingOffboardingStatus] = useState<number | null>(null);
    const [onboardingForm, setالتهيئةForm] = useState(DEFAULT_ONBOARDING_FORM);
    const [savingالتهيئةRecord, setSavingالتهيئةRecord] = useState(false);
    const [updatingالتهيئةStatus, setUpdatingالتهيئةStatus] = useState<number | null>(null);
    const [selfServiceOverview, setSelfServiceOverview] = useState<any>(null);
    const [selfServiceLoading, setSelfServiceLoading] = useState(false);
    const [selfServiceError, setSelfServiceError] = useState<string | null>(null);
    const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
    const [selfLeaveForm, setSelfLeaveForm] = useState(DEFAULT_SELF_LEAVE_FORM);
    const [submittingSelfLeave, setSubmittingSelfLeave] = useState(false);
    const [submittingCorrectionFor, setSubmittingCorrectionFor] = useState<string | null>(null);
    const [managerActionId, setManagerActionId] = useState<string | null>(null);
    const [reasonDialog, setReasonDialog] = useState<any>(null);
    const [reasonText, setReasonText] = useState('');
    const showOverviewPanels = false;

    const branchOptions = branches || [];
    const defaultBranchId = branchId || branchOptions[0]?.id || '';
    const getBranchName = (value?: string | null) => {
        const branch = branchOptions.find((item: any) => item.id === value);
        return branch?.nameAr || branch?.name || value || 'غير محدد';
    };
    const departmentMap = useMemo(() => new Map(departments.map((item: any) => [item.id, item])), [departments]);
    const managementOptions = useMemo(() => departments.filter((item: any) => !item.parentId && item.isActive !== false), [departments]);
    const sectionOptions = useMemo(() => departments.filter((item: any) => item.parentId && item.isActive !== false), [departments]);
    const visibleSectionOptions = useMemo(() => {
        return sectionOptions.filter((item: any) => !createForm.managementId || item.parentId === createForm.managementId);
    }, [createForm.managementId, sectionOptions]);
    const filteredJobTitles = useMemo(() => {
        return jobTitles.filter((item: any) => item.isActive !== false);
    }, [jobTitles]);
    const getDepartmentName = (value?: string | null) => {
        const department = value ? departmentMap.get(value) : null;
        return department?.nameAr || department?.name || value || 'غير محدد';
    };
    const getParentDepartmentName = (value?: string | null) => {
        const department = value ? departmentMap.get(value) : null;
        return getDepartmentName(department?.parentId);
    };
    const getJobTitleName = (value?: string | null) => {
        const jobTitle = jobTitles.find((item: any) => item.id === value);
        return jobTitle?.nameAr || jobTitle?.title || jobTitle?.name || value || 'غير محدد';
    };
    const hrTaskTypeLabel = (value?: string | null) => {
        const labels: Record<string, string> = {
            GENERAL: 'عام',
            ASSET_RETURN: 'إرجاع العهدة',
            ACCESS_CLOSURE: 'إغلاق الصلاحيات',
            PAYROLL_CLEARANCE: 'تصفية الرواتب',
            DOCUMENTS: 'المستندات',
            EXIT_INTERVIEW: 'مقابلة خروج',
            ACCOUNT_SETUP: 'إعداد الحساب',
            BIOMETRIC_LINK: 'ربط البصمة',
            SHIFT_ASSIGNMENT: 'تعيين الوردية',
            PAYROLL_SETUP: 'إعداد الرواتب',
            ASSET_ISSUE: 'تسليم العهدة',
        };
        return labels[String(value || '')] || value || 'غير محدد';
    };
    const hrRecordStatusLabel = (value?: string | null) => {
        const labels: Record<string, string> = {
            OPEN: 'مفتوحة',
            IN_PROGRESS: 'قيد التنفيذ',
            DONE: 'تم التنفيذ',
            WAIVED: 'تم التجاوز',
        };
        return labels[String(value || '')] || value || 'غير محدد';
    };
    const severityLabel = (value?: string | null) => {
        const labels: Record<string, string> = {
            LOW: 'منخفضة',
            MEDIUM: 'متوسطة',
            HIGH: 'مرتفعة',
            CRITICAL: 'حرجة',
        };
        return labels[String(value || '').toUpperCase()] || value || 'غير محدد';
    };
    const documentTypeLabel = (value?: string | null) => {
        const labels: Record<string, string> = {
            CONTRACT: 'عقد عمل',
            HEALTH_CERTIFICATE: 'شهادة صحية',
            NATIONAL_ID: 'الرقم القومي',
            LICENSE: 'ترخيص',
            WORK_PERMIT: 'تصريح عمل',
            MEDICAL_INSURANCE: 'تأمين طبي',
            OTHER: 'أخرى',
        };
        return labels[String(value || '')] || value || 'غير محدد';
    };

    const getEmployeeDisplayCode = (employee: any) => employee?.attendanceCode || employee?.employeeCode || employee?.email || employee?.id || '--';
    const getEmployeeMissingFlags = (employee: any) => ({
        missingDepartment: !employee?.departmentId,
        missingJobTitle: !employee?.jobTitleId,
        missingCode: !String(employee?.employeeCode || employee?.attendanceCode || '').trim(),
        missingAccess: !Boolean(employee?.userId || employee?.email),
        missingFinance: !(Number(employee?.basicSalary || employee?.salary?.baseSalary || 0) > 0 || Number(employee?.hourlyRate || 0) > 0),
    });
    const allowanceTotal = useMemo(
        () => employeeCompensationItems
            .filter((item: any) => String(item.type).toUpperCase() === 'ALLOWANCE' && item.isActive !== false)
            .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0),
        [employeeCompensationItems]
    );
    const deductionTotal = useMemo(
        () => employeeCompensationItems
            .filter((item: any) => String(item.type).toUpperCase() === 'DEDUCTION' && item.isActive !== false)
            .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0),
        [employeeCompensationItems]
    );
    const selectedEmployeeBaseSalary = Number(selectedEmployee?.basicSalary || selectedEmployee?.salary?.baseSalary || 0);
    const agreedGrossSalary = selectedEmployeeBaseSalary + allowanceTotal;
    const agreedNetBeforeMonthlyChanges = agreedGrossSalary - deductionTotal;
    const modalSteps: Array<{ key: EmployeeFormStep; label: string }> = [
        { key: 'basic', label: 'البيانات الأساسية' },
        { key: 'org', label: 'الهيكل الوظيفي' },
        { key: 'access', label: 'الدخول والبصمة' },
        { key: 'finance', label: 'البيانات المالية' },
    ];
    const profileTabs: Array<{ key: EmployeeProfileTab; label: string }> = [
        { key: 'overview', label: 'نظرة عامة' },
        { key: 'documents', label: 'المستندات' },
        { key: 'performance', label: 'الأداء' },
        { key: 'lifecycle', label: 'الدورة الوظيفية' },
    ];

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setPage(0);
            setDebouncedSearch(searchQuery.trim());
        }, 250);
        return () => window.clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => { loadData(); }, [branchId, debouncedSearch, page, pageSize]);
    useEffect(() => {
        Promise.all([
            apiRequest<any[]>('/hr-extended/departments'),
            apiRequest<any[]>('/hr-extended/job-titles'),
        ]).then(([departmentRows, jobTitleRows]) => {
            setDepartments(departmentRows || []);
            setJobTitles(jobTitleRows || []);
        }).catch(() => {});
    }, []);
    useEffect(() => {
        if (!showOverviewPanels) return;
        loadSelfService();
    }, [currentUser?.id]);
    useEffect(() => {
        if (!showOverviewPanels) return;
        loadExecutiveDashboard();
    }, [branchId]);
    useEffect(() => {
        if (!showOverviewPanels) return;
        loadExecutiveReports();
    }, [branchId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('paged', 'true');
            params.set('limit', String(pageSize));
            params.set('offset', String(page * pageSize));
            if (branchId) params.set('branchId', branchId);
            if (debouncedSearch) params.set('q', debouncedSearch);
            const [employeesRes, exceptionsRes] = await Promise.all([
                apiRequest<any>(`/hr/employees?${params.toString()}`),
                apiRequest<any>(`/attendance-ops/exceptions/queue${branchId ? `?branchId=${branchId}` : ''}`)
            ]);
            const items = employeesRes?.items || [];
            const total = Number(employeesRes?.total || items.length || 0);
            setEmployees(items);
            setTotalEmployees(total);
            setStats({
                totalHeadcount: total,
                activeShifts: Math.round(total * 0.4),
                exceptions: exceptionsRes?.length || 0
            });
            if (branchId) {
                const expiring = await apiRequest<any[]>(`/hr-extended/employee-documents?branchId=${branchId}&expiringWithinDays=30`);
                setExpiringDocuments(expiring || []);
            }
        } catch { toast.error('Failed to load HR data'); }
        finally { setLoading(false); }
    };

    const loadExecutiveDashboard = async () => {
        setLoadingExecutiveDashboard(true);
        try {
            const params = new URLSearchParams();
            if (branchId) params.set('branchId', branchId);
            const data = await apiRequest<any>(`/hr-extended/executive-dashboard?${params.toString()}`);
            setExecutiveDashboard(data);
        } catch {
            setExecutiveDashboard(null);
        } finally {
            setLoadingExecutiveDashboard(false);
        }
    };

    const loadExecutiveReports = async () => {
        setLoadingExecutiveReports(true);
        try {
            const params = new URLSearchParams();
            if (branchId) params.set('branchId', branchId);
            const data = await apiRequest<any>(`/hr-extended/executive-reports?${params.toString()}`);
            setExecutiveReports(data);
        } catch {
            setExecutiveReports(null);
        } finally {
            setLoadingExecutiveReports(false);
        }
    };

    const loadSelfService = async () => {
        if (!currentUser?.id) return;
        setSelfServiceLoading(true);
        setSelfServiceError(null);
        try {
            const [overview, types] = await Promise.all([
                apiRequest<any>('/hr-extended/self-service/overview'),
                apiRequest<any[]>('/hr-extended/leave-types'),
            ]);
            setSelfServiceOverview(overview);
            setLeaveTypes(types || []);
            setSelfLeaveForm(prev => ({
                ...prev,
                leaveTypeId: prev.leaveTypeId || types?.[0]?.id || '',
            }));
        } catch (error: any) {
            const code = String(error?.code || error?.message || '');
            setSelfServiceOverview(null);
            setLeaveTypes([]);
            setSelfServiceError(code === 'EMPLOYEE_LINK_REQUIRED' ? 'هذا الحساب غير مربوط بملف موظف بعد.' : (error?.message || 'تعذر تحميل لوحة الموظف.'));
        } finally {
            setSelfServiceLoading(false);
        }
    };

    const submitSelfLeaveRequest = async () => {
        if (!selfLeaveForm.leaveTypeId || !selfLeaveForm.startDate || !selfLeaveForm.endDate || !selfLeaveForm.reason.trim()) {
            toast.error('أكمل نوع الإجازة والتواريخ والسبب');
            return;
        }
        setSubmittingSelfLeave(true);
        try {
            await apiRequest('/hr-extended/self-service/leave-requests', {
                method: 'POST',
                body: JSON.stringify({
                    leaveTypeId: selfLeaveForm.leaveTypeId,
                    startDate: selfLeaveForm.startDate,
                    endDate: selfLeaveForm.endDate,
                    reason: selfLeaveForm.reason.trim(),
                }),
            });
            toast.success('تم إرسال طلب الإجازة');
            setSelfLeaveForm(prev => ({ ...DEFAULT_SELF_LEAVE_FORM, leaveTypeId: prev.leaveTypeId }));
            await loadSelfService();
        } catch (error: any) {
            toast.error(error?.message || 'تعذر إرسال الطلب');
        } finally {
            setSubmittingSelfLeave(false);
        }
    };

    const requestAttendanceCorrection = async (session: any) => {
        setReasonDialog({ kind: 'attendance', session });
        setReasonText('');
    };

    const submitAttendanceCorrection = async (session: any, reason: string) => {
        setSubmittingCorrectionFor(session.id);
        try {
            await apiRequest('/hr-extended/self-service/attendance-corrections', {
                method: 'POST',
                body: JSON.stringify({
                    sessionId: session.id,
                    reason: reason.trim(),
                    requestedClockInAt: session.clockInAt || undefined,
                    requestedClockOutAt: session.clockOutAt || undefined,
                }),
            });
            toast.success('تم إرسال طلب التعديل للمراجعة');
            await loadSelfService();
        } catch (error: any) {
            toast.error(error?.message || 'تعذر إرسال طلب التعديل');
        } finally {
            setSubmittingCorrectionFor(null);
        }
    };

    const runManagerLeaveAction = async (requestId: string, action: 'approve' | 'reject', reason = '') => {
        if (action === 'reject') {
            setReasonDialog({ kind: 'leaveReject', requestId });
            setReasonText('');
            return;
        }
        await submitManagerLeaveAction(requestId, action, reason);
    };

    const submitManagerLeaveAction = async (requestId: string, action: 'approve' | 'reject', reason = '') => {
        setManagerActionId(`${action}-${requestId}`);
        try {
            await apiRequest(`/hr-extended/leave-requests/${requestId}/${action}`, {
                method: 'PUT',
                body: JSON.stringify(action === 'reject' ? { reason } : {}),
            });
            toast.success(action === 'approve' ? 'تمت الموافقة على الطلب' : 'تم رفض الطلب');
            await loadSelfService();
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || 'تعذر تنفيذ الإجراء');
        } finally {
            setManagerActionId(null);
        }
    };

    const loadEmployeeDocuments = async (employeeId: string) => {
        const docs = await apiRequest<any[]>(`/hr-extended/employee-documents?employeeId=${employeeId}`);
        setEmployeeDocuments(docs || []);
    };

    const loadEmployeeCompensationItems = async (employeeId: string) => {
        const rows = await apiRequest<any[]>(`/hr-extended/employee-compensation-items?employeeId=${employeeId}&activeOnly=true`);
        setEmployeeCompensationItems(rows || []);
    };

    const openCreateModal = () => {
        setEditingEmployee(null);
        setCreateForm({ ...DEFAULT_EMPLOYEE_FORM, branchId: defaultBranchId });
        setEmployeeCompensationItems([]);
        setCompensationForm(DEFAULT_COMPENSATION_FORM);
        setFormStep('basic');
        setShowCreateModal(true);
    };

    const openEditModal = (employee: any) => {
        setEditingEmployee(employee);
        setCreateForm({
            id: employee.id || '',
            name: employee.name || '',
            email: employee.email || '',
            phone: employee.phone || '',
            branchId: employee.branchId || defaultBranchId,
            employeeCode: employee.employeeCode || employee.attendanceCode || '',
            role: employee.role || 'STAFF',
            hasSystemAccess: false,
            pin: '',
            password: '',
            salary: String(employee.basicSalary || employee.salary?.baseSalary || ''),
            nationalId: employee.nationalId || '',
            hourlyRate: String(employee.hourlyRate || ''),
            emergencyContact: employee.emergencyContact || '',
            bankAccount: employee.bankAccount || '',
            managementId: employee.departmentId ? (departmentMap.get(employee.departmentId)?.parentId || '') : '',
            departmentId: employee.departmentId || '',
            jobTitleId: employee.jobTitleId || '',
        });
        loadEmployeeCompensationItems(employee.id).catch(() => setEmployeeCompensationItems([]));
        setCompensationForm(DEFAULT_COMPENSATION_FORM);
        setSelectedEmployee(null);
        setFormStep('basic');
        setShowCreateModal(true);
    };

    const openEmployeeProfile = async (employee: any) => {
        setSelectedEmployee(employee);
        setProfileTab('overview');
        setDocumentForm(DEFAULT_DOCUMENT_FORM);
        setCompensationForm(DEFAULT_COMPENSATION_FORM);
        setPerformanceForm(DEFAULT_PERFORMANCE_FORM);
        setالتهيئةForm(DEFAULT_ONBOARDING_FORM);
        setOffboardingForm(DEFAULT_OFFBOARDING_FORM);
        setEmployeePerformanceRecords([]);
        setEmployeeالتهيئةRecords([]);
        setEmployeeOffboardingRecords([]);
        setEmployeeLifecycle(null);
        setLoadingLifecycle(true);
        try {
            await Promise.all([
                loadEmployeeDocuments(employee.id),
                loadEmployeeCompensationItems(employee.id),
                apiRequest<any>(`/hr-extended/employee-lifecycle/${employee.id}`).then(data => setEmployeeLifecycle(data)),
                apiRequest<any[]>(`/hr-extended/performance-records?employeeId=${employee.id}`).then(data => setEmployeePerformanceRecords(data || [])),
                apiRequest<any[]>(`/hr-extended/onboarding-records?employeeId=${employee.id}`).then(data => setEmployeeالتهيئةRecords(data || [])),
                apiRequest<any[]>(`/hr-extended/offboarding-records?employeeId=${employee.id}`).then(data => setEmployeeOffboardingRecords(data || [])),
            ]);
        } catch {
            setEmployeeDocuments([]);
            setEmployeeCompensationItems([]);
            setEmployeeLifecycle(null);
            setEmployeePerformanceRecords([]);
            setEmployeeالتهيئةRecords([]);
            setEmployeeOffboardingRecords([]);
        } finally {
            setLoadingLifecycle(false);
        }
    };

    const saveCompensationItem = async () => {
        if (!selectedEmployee?.id) return;
        if (!compensationForm.name.trim() || !String(compensationForm.amount).trim()) {
            toast.error('أضف اسم البند والمبلغ');
            return;
        }

        setSavingCompensationItem(true);
        try {
            await apiRequest('/hr-extended/employee-compensation-items', {
                method: 'POST',
                body: JSON.stringify({
                    id: compensationForm.id || undefined,
                    employeeId: selectedEmployee.id,
                    name: compensationForm.name.trim(),
                    nameAr: compensationForm.nameAr.trim() || undefined,
                    category: compensationForm.category,
                    type: compensationForm.type,
                    amount: Number(compensationForm.amount || 0),
                    effectiveFrom: compensationForm.effectiveFrom || undefined,
                    effectiveTo: compensationForm.effectiveTo || undefined,
                    notes: compensationForm.notes.trim() || undefined,
                    isRecurring: compensationForm.isRecurring,
                }),
            });
            toast.success(compensationForm.id ? 'تم تحديث البند المالي' : 'تمت إضافة البند المالي');
            setCompensationForm(DEFAULT_COMPENSATION_FORM);
            await loadEmployeeCompensationItems(selectedEmployee.id);
        } catch (error: any) {
            toast.error(error?.message || 'تعذر حفظ البند المالي');
        } finally {
            setSavingCompensationItem(false);
        }
    };

    const editCompensationItem = (item: any) => {
        setProfileTab('finance');
        setCompensationForm({
            id: item.id || '',
            name: item.name || '',
            nameAr: item.nameAr || '',
            category: item.category || 'GENERAL',
            type: item.type || 'ALLOWANCE',
            amount: String(item.amount || ''),
            effectiveFrom: item.effectiveFrom ? new Date(item.effectiveFrom).toISOString().slice(0, 10) : '',
            effectiveTo: item.effectiveTo ? new Date(item.effectiveTo).toISOString().slice(0, 10) : '',
            notes: item.notes || '',
            isRecurring: item.isRecurring !== false,
        });
    };

    const archiveCompensationItem = async (itemId: string) => {
        if (!selectedEmployee?.id) return;
        setRemovingCompensationItemId(itemId);
        try {
            await apiRequest(`/hr-extended/employee-compensation-items/${itemId}`, { method: 'DELETE' });
            toast.success('تم إيقاف البند المالي');
            if (compensationForm.id === itemId) setCompensationForm(DEFAULT_COMPENSATION_FORM);
            await loadEmployeeCompensationItems(selectedEmployee.id);
        } catch (error: any) {
            toast.error(error?.message || 'تعذر إيقاف البند المالي');
        } finally {
            setRemovingCompensationItemId(null);
        }
    };

    const savePerformanceRecord = async () => {
        if (!selectedEmployee?.id) return;
        if (!performanceForm.title.trim() || !performanceForm.noteBody.trim()) {
            toast.error('اكتب عنوان ومحتوى السجل');
            return;
        }
        setSavingPerformanceRecord(true);
        try {
            await apiRequest('/hr-extended/performance-records', {
                method: 'POST',
                body: JSON.stringify({
                    employeeId: selectedEmployee.id,
                    actionType: performanceForm.actionType,
                    title: performanceForm.title.trim(),
                    noteBody: performanceForm.noteBody.trim(),
                    status: performanceForm.status,
                    rating: performanceForm.rating ? Number(performanceForm.rating) : undefined,
                    dueDate: performanceForm.dueDate || undefined,
                    followUpAction: performanceForm.followUpAction.trim() || undefined,
                }),
            });
            toast.success('تم حفظ سجل الأداء');
            setPerformanceForm(DEFAULT_PERFORMANCE_FORM);
            const records = await apiRequest<any[]>(`/hr-extended/performance-records?employeeId=${selectedEmployee.id}`);
            setEmployeePerformanceRecords(records || []);
        } catch (error: any) {
            toast.error(error?.message || 'تعذر حفظ سجل الأداء');
        } finally {
            setSavingPerformanceRecord(false);
        }
    };

    const updatePerformanceRecordStatus = async (recordId: number, status: 'ACKNOWLEDGED' | 'CLOSED') => {
        setUpdatingPerformanceStatus(recordId);
        try {
            await apiRequest(`/hr-extended/performance-records/${recordId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status }),
            });
            toast.success(status === 'CLOSED' ? 'تم إغلاق السجل' : 'تم تحديث حالة السجل');
            if (selectedEmployee?.id) {
                const records = await apiRequest<any[]>(`/hr-extended/performance-records?employeeId=${selectedEmployee.id}`);
                setEmployeePerformanceRecords(records || []);
            }
        } catch (error: any) {
            toast.error(error?.message || 'تعذر تحديث الحالة');
        } finally {
            setUpdatingPerformanceStatus(null);
        }
    };

    const saveOffboardingRecord = async () => {
        if (!selectedEmployee?.id) return;
        if (!offboardingForm.title.trim()) {
            toast.error('اكتب اسم البند');
            return;
        }
        setSavingOffboardingRecord(true);
        try {
            await apiRequest('/hr-extended/offboarding-records', {
                method: 'POST',
                body: JSON.stringify({
                    employeeId: selectedEmployee.id,
                    title: offboardingForm.title.trim(),
                    taskType: offboardingForm.taskType,
                    status: offboardingForm.status,
                    dueDate: offboardingForm.dueDate || undefined,
                    ownerName: offboardingForm.ownerName.trim() || undefined,
                    resultNotes: offboardingForm.resultNotes.trim() || undefined,
                }),
            });
            toast.success('تمت إضافة بند الخروج');
            setOffboardingForm(DEFAULT_OFFBOARDING_FORM);
            const records = await apiRequest<any[]>(`/hr-extended/offboarding-records?employeeId=${selectedEmployee.id}`);
            setEmployeeOffboardingRecords(records || []);
        } catch (error: any) {
            toast.error(error?.message || 'تعذر إضافة البند');
        } finally {
            setSavingOffboardingRecord(false);
        }
    };

    const saveالتهيئةRecord = async () => {
        if (!selectedEmployee?.id) return;
        if (!onboardingForm.title.trim()) {
            toast.error('اكتب اسم البند');
            return;
        }
        setSavingالتهيئةRecord(true);
        try {
            await apiRequest('/hr-extended/onboarding-records', {
                method: 'POST',
                body: JSON.stringify({
                    employeeId: selectedEmployee.id,
                    title: onboardingForm.title.trim(),
                    taskType: onboardingForm.taskType,
                    status: onboardingForm.status,
                    dueDate: onboardingForm.dueDate || undefined,
                    ownerName: onboardingForm.ownerName.trim() || undefined,
                    resultNotes: onboardingForm.resultNotes.trim() || undefined,
                }),
            });
            toast.success('تمت إضافة بند التهيئة');
            setالتهيئةForm(DEFAULT_ONBOARDING_FORM);
            const records = await apiRequest<any[]>(`/hr-extended/onboarding-records?employeeId=${selectedEmployee.id}`);
            setEmployeeالتهيئةRecords(records || []);
        } catch (error: any) {
            toast.error(error?.message || 'تعذر إضافة البند');
        } finally {
            setSavingالتهيئةRecord(false);
        }
    };

    const updateالتهيئةRecordStatus = async (recordId: number, status: 'DONE') => {
        setUpdatingالتهيئةStatus(recordId);
        try {
            await apiRequest(`/hr-extended/onboarding-records/${recordId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status }),
            });
            toast.success('تم إنهاء البند');
            if (selectedEmployee?.id) {
                const records = await apiRequest<any[]>(`/hr-extended/onboarding-records?employeeId=${selectedEmployee.id}`);
                setEmployeeالتهيئةRecords(records || []);
            }
        } catch (error: any) {
            toast.error(error?.message || 'تعذر تحديث البند');
        } finally {
            setUpdatingالتهيئةStatus(null);
        }
    };

    const updateOffboardingRecordStatus = async (recordId: number, status: 'DONE' | 'WAIVED', waivedReason = '') => {
        if (status === 'WAIVED' && !waivedReason.trim()) {
            setReasonDialog({ kind: 'offboardWaive', recordId });
            setReasonText('');
            return;
        }
        setUpdatingOffboardingStatus(recordId);
        try {
            await apiRequest(`/hr-extended/offboarding-records/${recordId}/status`, {
                method: 'PUT',
                body: JSON.stringify({
                    status,
                    waivedReason: status === 'WAIVED' ? waivedReason.trim() : undefined,
                }),
            });
            toast.success(status === 'DONE' ? 'تم إنهاء البند' : 'تم تجاوز البند');
            if (selectedEmployee?.id) {
                const records = await apiRequest<any[]>(`/hr-extended/offboarding-records?employeeId=${selectedEmployee.id}`);
                setEmployeeOffboardingRecords(records || []);
            }
        } catch (error: any) {
            toast.error(error?.message || 'تعذر تحديث البند');
        } finally {
            setUpdatingOffboardingStatus(null);
        }
    };

    const submitReasonDialog = async () => {
        const reason = reasonText.trim();
        if (!reasonDialog || !reason) {
            toast.error('السبب مطلوب');
            return;
        }
        const dialog = reasonDialog;
        setReasonDialog(null);
        setReasonText('');
        if (dialog.kind === 'attendance') await submitAttendanceCorrection(dialog.session, reason);
        if (dialog.kind === 'leaveReject') await submitManagerLeaveAction(dialog.requestId, 'reject', reason);
        if (dialog.kind === 'offboardWaive') await updateOffboardingRecordStatus(dialog.recordId, 'WAIVED', reason);
    };

    const saveEmployeeDocument = async () => {
        if (!selectedEmployee?.id) return;
        if (!documentForm.title.trim()) {
            toast.error('Document title is required');
            return;
        }
        if (documentForm.sourceType === 'FILE' && !documentForm.fileUrl) {
            toast.error('اختر ملف المستند الأول');
            return;
        }
        setSavingDocument(true);
        try {
            await apiRequest('/hr-extended/employee-documents', {
                method: 'POST',
                body: JSON.stringify({
                    employeeId: selectedEmployee.id,
                    branchId: selectedEmployee.branchId || branchId,
                    documentType: documentForm.documentType,
                    title: documentForm.title,
                    documentNumber: documentForm.documentNumber || undefined,
                    issueDate: documentForm.issueDate || undefined,
                    expiryDate: documentForm.expiryDate || undefined,
                    fileUrl: documentForm.fileUrl || undefined,
                    notes: documentForm.notes || undefined,
                    metadata: {
                        sourceType: documentForm.sourceType,
                        fileName: documentForm.fileName || undefined,
                    },
                }),
            });
            toast.success('Document saved');
            setDocumentForm(DEFAULT_DOCUMENT_FORM);
            await loadEmployeeDocuments(selectedEmployee.id);
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save document');
        } finally {
            setSavingDocument(false);
        }
    };

    const handleEmployeeDocumentFile = (file?: File | null) => {
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) {
            toast.error('حجم الملف كبير. استخدم رابط Google Drive للملفات الأكبر من 4MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setDocumentForm(prev => ({
                ...prev,
                sourceType: 'FILE',
                fileName: file.name,
                fileUrl: String(reader.result || ''),
                title: prev.title || file.name.replace(/\.[^.]+$/, ''),
            }));
        };
        reader.onerror = () => toast.error('تعذر قراءة الملف');
        reader.readAsDataURL(file);
    };

    const archiveEmployeeDocument = async (id: string) => {
        if (!selectedEmployee?.id) return;
        try {
            await apiRequest(`/hr-extended/employee-documents/${id}`, { method: 'DELETE' });
            toast.success('Document archived');
            await loadEmployeeDocuments(selectedEmployee.id);
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to archive document');
        }
    };

    const handleCreateEmployee = async () => {
        const name = createForm.name.trim();
        if (!name) {
            toast.error('اسم الموظف مطلوب');
            return;
        }

        setIsCreating(true);
        try {
            const basePayload: any = {
                name,
                role: createForm.role,
                employmentDate: new Date().toISOString().slice(0, 10),
            };
            if (createForm.branchId) basePayload.branchId = createForm.branchId;
            if (createForm.employeeCode.trim()) {
                basePayload.employeeCode = createForm.employeeCode.trim();
                basePayload.attendanceCode = createForm.employeeCode.trim();
            }
            if (createForm.email.trim()) basePayload.email = createForm.email.trim();
            if (createForm.phone.trim()) basePayload.phone = createForm.phone.trim();
            if (createForm.nationalId.trim()) basePayload.nationalId = createForm.nationalId.trim();
            if (createForm.emergencyContact.trim()) basePayload.emergencyContact = createForm.emergencyContact.trim();
            if (createForm.bankAccount.trim()) basePayload.bankAccount = createForm.bankAccount.trim();
            if (createForm.departmentId) basePayload.departmentId = createForm.departmentId;
            if (createForm.jobTitleId) basePayload.jobTitleId = createForm.jobTitleId;
            const baseSalary = Number(createForm.salary);
            if (Number.isFinite(baseSalary) && baseSalary > 0) {
                basePayload.basicSalary = baseSalary;
                basePayload.salary = { baseSalary, allowances: 0, deductions: 0 };
            }
            const hourlyRate = Number(createForm.hourlyRate);
            if (Number.isFinite(hourlyRate) && hourlyRate > 0) {
                basePayload.hourlyRate = hourlyRate;
            }

            if (editingEmployee) {
                await apiRequest('/hr/employees', { method: 'POST', body: JSON.stringify({ ...basePayload, id: editingEmployee.id }) });
            } else if (createForm.hasSystemAccess) {
                const userPayload: any = {
                    ...basePayload,
                    isActive: true,
                    allowedBranches: createForm.branchId ? [createForm.branchId] : [],
                    assignedBranchId: createForm.branchId,
                };
                if (createForm.pin.trim()) userPayload.pin = createForm.pin.trim();
                if (createForm.password.trim()) userPayload.password = createForm.password.trim();
                await apiRequest('/users', { method: 'POST', body: JSON.stringify(userPayload) });
            } else {
                await apiRequest('/hr/employees', { method: 'POST', body: JSON.stringify(basePayload) });
            }

            toast.success(editingEmployee ? 'تم تحديث الموظف' : 'تم إنشاء الموظف');
            setShowCreateModal(false);
            setEditingEmployee(null);
            await loadData();
        } catch (error: any) {
            toast.error(error?.message || 'فشل إنشاء الموظف');
        } finally {
            setIsCreating(false);
        }
    };

    const filtered = useMemo(() => {
        return employees.filter((employee) => {
            const flags = getEmployeeMissingFlags(employee);
            if (statusFilter === 'ACTIVE' && !employee.isActive) return false;
            if (statusFilter === 'INACTIVE' && employee.isActive) return false;
            const hasAccess = Boolean(employee.userId || employee.email);
            const hasBiometricCode = Boolean(String(employee.employeeCode || employee.attendanceCode || '').trim());
            if (accessFilter === 'HAS_ACCESS' && !hasAccess) return false;
            if (accessFilter === 'NO_ACCESS' && hasAccess) return false;
            if (accessFilter === 'MISSING_CODE' && hasBiometricCode) return false;
            if (viewPreset === 'MISSING_STRUCTURE' && !(flags.missingDepartment || flags.missingJobTitle)) return false;
            if (viewPreset === 'MISSING_CODE' && !flags.missingCode) return false;
            if (viewPreset === 'NO_ACCESS' && !flags.missingAccess) return false;
            if (viewPreset === 'MISSING_FINANCE' && !flags.missingFinance) return false;
            return true;
        });
    }, [employees, statusFilter, accessFilter, viewPreset]);
    const totalPages = Math.max(1, Math.ceil(totalEmployees / pageSize));
    const rangeStart = totalEmployees === 0 ? 0 : page * pageSize + 1;
    const rangeEnd = Math.min(totalEmployees, page * pageSize + filtered.length);
    const employeeInsights = useMemo(() => {
        const active = employees.filter((employee) => employee.isActive).length;
        const withAccess = employees.filter((employee) => Boolean(employee.userId || employee.email)).length;
        const missingCode = employees.filter((employee) => !String(employee.employeeCode || employee.attendanceCode || '').trim()).length;
        const missingStructure = employees.filter((employee) => {
            const flags = getEmployeeMissingFlags(employee);
            return flags.missingDepartment || flags.missingJobTitle;
        }).length;
        const missingFinance = employees.filter((employee) => getEmployeeMissingFlags(employee).missingFinance).length;
        const supervisors = employees.filter((employee) => ['SUPERVISOR', 'BRANCH_MANAGER', 'MANAGER'].includes(String(employee.role || ''))).length;
        return { active, withAccess, missingCode, missingStructure, missingFinance, supervisors };
    }, [employees]);

    const listVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } } as const;
    const itemVariants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } } as const;

    return (
        <div className="min-h-screen bg-app text-main overflow-x-hidden pb-24" dir="rtl">
            <div className="mx-auto flex max-w-[1800px] flex-col gap-4 p-4 sm:p-5 lg:p-6">
                <motion.header
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="overflow-hidden rounded-[28px] border border-border/45 bg-card"
                >
                    <div className="border-b border-border/30 px-5 py-5 sm:px-6 lg:px-7">
                        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                            <div className="min-w-0">
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                    <span className="inline-flex h-8 items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 text-[11px] font-black text-blue-600">
                                        مركز تشغيل الموارد البشرية
                                    </span>
                                    <span className="inline-flex h-8 items-center rounded-full border border-border/45 bg-app/60 px-3 text-[11px] font-black text-muted">
                                        {branchId ? 'الفرع الحالي' : 'كل الفروع'}
                                    </span>
                                </div>
                                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">الموظفون</h1>
                                <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-muted">
                                    مساحة أوضح لإدارة الموظفين وربطهم بالإدارات والأقسام ومتابعة جاهزية الحسابات والمستندات والبصمة من نقطة واحدة.
                                </p>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <button
                                    type="button"
                                    onClick={() => { setStatusFilter('ALL'); setAccessFilter('ALL'); setSearchQuery(''); }}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border/50 bg-app/60 px-4 text-xs font-black text-muted transition hover:border-blue-500/30 hover:text-main"
                                >
                                    <RefreshCw size={14} /> تصفير الفلاتر
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate('/hr-settings')}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card px-4 text-xs font-black text-main transition hover:border-violet-500/30 hover:text-violet-600"
                                >
                                    <Settings2 size={14} /> هيكل HR
                                </button>
                                <motion.button
                                    whileHover={{ y: -1 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={openCreateModal}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-500"
                                >
                                    <Plus size={17} /> {t.hr_add_employee}
                                </motion.button>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:px-7">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black">مسارات العمل</p>
                                    <p className="mt-1 text-xs font-bold text-muted">كل قسم في الموارد البشرية له نقطة دخول واضحة وتحكمات مستقلة.</p>
                                </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {HR_WORKSPACE_SECTIONS.map((section) => (
                                    <button
                                        key={section.route}
                                        type="button"
                                        onClick={() => navigate(section.route)}
                                        className="group rounded-2xl border border-border/45 bg-app/45 p-4 text-right transition hover:-translate-y-0.5 hover:border-blue-500/30 hover:bg-card"
                                    >
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className={'flex h-11 w-11 items-center justify-center rounded-2xl border ' + laneToneClass[section.tone]}>
                                                <section.icon size={18} />
                                            </div>
                                            <ArrowUpRight size={15} className="text-muted transition group-hover:text-blue-600" />
                                        </div>
                                        <p className="text-sm font-black">{section.title}</p>
                                        <p className="mt-1 text-xs font-bold leading-6 text-muted">{section.subtitle}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <p className="text-sm font-black">خريطة التشغيل</p>
                                <p className="mt-1 text-xs font-bold text-muted">ملخص سريع للمحاور التي يحتاجها فريق HR أثناء اليوم.</p>
                            </div>
                            <div className="grid gap-3">
                                {HR_EXCELLENCE_LANES.slice(0, 4).map((lane) => (
                                    <div key={lane.title} className="rounded-2xl border border-border/45 bg-app/45 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="mb-2 flex items-center gap-2">
                                                    <div className={'flex h-9 w-9 items-center justify-center rounded-2xl border ' + laneToneClass[lane.tone]}>
                                                        <lane.icon size={16} />
                                                    </div>
                                                    <span className="rounded-full border border-border/40 bg-card px-2.5 py-1 text-[10px] font-black text-muted">{lane.maturity}</span>
                                                </div>
                                                <p className="text-sm font-black">{lane.title}</p>
                                                <p className="mt-1 text-xs font-bold leading-6 text-muted">{lane.subtitle}</p>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {lane.actions.map((action) => (
                                                <span key={action} className="rounded-full border border-border/40 bg-card px-2.5 py-1 text-[10px] font-black text-muted">
                                                    {action}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.header>

                <section className="rounded-[24px] border border-border/45 bg-card p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-sm font-black">فلاتر ذكية</p>
                            <p className="mt-1 text-xs font-bold text-muted">ابدأ من النواقص بدل البحث اليدوي بين كل الموظفين.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { key: 'ALL', label: 'الكل', value: totalEmployees },
                                { key: 'MISSING_STRUCTURE', label: 'ناقص قسم أو مسمى', value: employeeInsights.missingStructure },
                                { key: 'MISSING_CODE', label: 'بدون بصمة', value: employeeInsights.missingCode },
                                { key: 'NO_ACCESS', label: 'بدون حساب', value: Math.max(0, employees.length - employeeInsights.withAccess) },
                                { key: 'MISSING_FINANCE', label: 'بدون مرتب', value: employeeInsights.missingFinance },
                            ].map((preset) => (
                                <button
                                    key={preset.key}
                                    type="button"
                                    onClick={() => {
                                        setPage(0);
                                        setViewPreset(preset.key as EmployeeViewPreset);
                                    }}
                                    className={'inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-black transition ' + (
                                        viewPreset === preset.key
                                            ? 'border-blue-500/30 bg-blue-500/10 text-blue-600'
                                            : 'border-border/45 bg-app/55 text-muted hover:border-blue-500/20 hover:text-main'
                                    )}
                                >
                                    <span>{preset.label}</span>
                                    <span className="rounded-full bg-card px-2 py-1 text-[10px] tabular-nums">
                                        {preset.value}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                <motion.section
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
                >
                    {[
                        { label: 'إجمالي الموظفين', value: stats.totalHeadcount, helper: 'داخل نطاق التشغيل الحالي', icon: Users, tone: 'text-blue-600 bg-blue-500/10 border-blue-500/20' },
                        { label: 'نشطون', value: employeeInsights.active, helper: 'جاهزون للتشغيل اليومي', icon: Activity, tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' },
                        { label: 'لهم حساب نظام', value: employeeInsights.withAccess, helper: 'يمكنهم الدخول للنظام', icon: Shield, tone: 'text-violet-600 bg-violet-500/10 border-violet-500/20' },
                        { label: 'بدون كود بصمة', value: employeeInsights.missingCode, helper: 'يحتاجون ربط على الماكينة', icon: AlertTriangle, tone: 'text-amber-600 bg-amber-500/10 border-amber-500/20' },
                    ].map((stat) => (
                        <motion.div
                            key={stat.label}
                            whileHover={{ y: -2 }}
                            className="rounded-2xl border border-border/45 bg-card p-4"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black text-muted">{stat.label}</p>
                                    <p className="mt-2 text-3xl font-black tabular-nums tracking-tight">{loading ? '...' : stat.value}</p>
                                    <p className="mt-1 text-[11px] font-bold text-muted">{stat.helper}</p>
                                </div>
                                <div className={'flex h-10 w-10 items-center justify-center rounded-2xl border ' + stat.tone}>
                                    <stat.icon size={18} />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.section>

                <section className="rounded-[26px] border border-border/45 bg-card p-4">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(360px,1.5fr)_220px_220px_180px_150px] xl:items-center">
                        <div className="relative min-w-0">
                            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                            <input
                                type="text"
                                placeholder="ابحث بالاسم أو الكود أو البريد أو رقم البصمة"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-11 w-full rounded-2xl border border-border/50 bg-app/60 pr-10 pl-3 text-sm font-bold outline-none transition focus:border-blue-500/60"
                            />
                        </div>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="h-11 rounded-2xl border border-border/50 bg-app/60 px-3 text-sm font-black outline-none focus:border-blue-500/60">
                            <option value="ALL">كل الحالات</option>
                            <option value="ACTIVE">النشطون فقط</option>
                            <option value="INACTIVE">غير النشطين فقط</option>
                        </select>
                        <select value={accessFilter} onChange={(e) => setAccessFilter(e.target.value as any)} className="h-11 rounded-2xl border border-border/50 bg-app/60 px-3 text-sm font-black outline-none focus:border-blue-500/60">
                            <option value="ALL">كل الموظفين</option>
                            <option value="HAS_ACCESS">بحساب نظام</option>
                            <option value="NO_ACCESS">بدون حساب نظام</option>
                            <option value="MISSING_CODE">بدون كود بصمة</option>
                        </select>
                        <div className="flex h-11 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 px-3 text-xs font-black text-blue-600">
                            {filtered.length} ظاهر
                        </div>
                        <select
                            value={String(pageSize)}
                            onChange={(e) => {
                                setPage(0);
                                setPageSize(Number(e.target.value));
                            }}
                            className="h-11 rounded-2xl border border-border/50 bg-app/60 px-3 text-sm font-black outline-none focus:border-blue-500/60"
                        >
                            <option value="10">10 لكل صفحة</option>
                            <option value="25">25 لكل صفحة</option>
                            <option value="50">50 لكل صفحة</option>
                            <option value="100">100 لكل صفحة</option>
                        </select>
                    </div>
                </section>

                <div className="grid gap-3 md:hidden">
                    {filtered.slice(0, 24).map((emp) => {
                        const hasAccess = Boolean(emp.userId || emp.email);
                        const hasCode = Boolean(String(emp.employeeCode || emp.attendanceCode || '').trim());
                        const flags = getEmployeeMissingFlags(emp);
                        return (
                            <motion.button
                                key={emp.id}
                                layout
                                type="button"
                                onClick={() => openEmployeeProfile(emp)}
                            className="rounded-2xl border border-border/45 bg-card p-4 text-right transition hover:border-blue-500/30"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 font-black text-blue-600">
                                            {(emp.name || '?').slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black">{emp.name}</p>
                                            <p className="mt-1 truncate text-[11px] font-bold text-muted">{getEmployeeDisplayCode(emp)}</p>
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {flags.missingDepartment && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-600">بدون قسم</span>}
                                                {flags.missingJobTitle && <span className="rounded-full bg-slate-500/10 px-2 py-1 text-[10px] font-black text-muted">بدون مسمى</span>}
                                                {flags.missingFinance && <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[10px] font-black text-rose-600">بدون مرتب</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <span className={'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ' + (emp.isActive ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600' : 'border-rose-500/20 bg-rose-500/10 text-rose-600')}>
                                        {emp.isActive ? t.hr_active : t.hr_inactive}
                                    </span>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-bold">
                                    <span className="rounded-2xl bg-app/60 px-3 py-2 text-muted">{emp.role?.replace(/_/g, ' ') || 'بدون مسمى'}</span>
                                    <span className="rounded-2xl bg-app/60 px-3 py-2 text-muted">{emp.branch?.nameAr || emp.branch?.name || t.hr_all_branches}</span>
                                    <span className={'rounded-2xl px-3 py-2 ' + (hasAccess ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-muted')}>
                                        {hasAccess ? 'بحساب نظام' : 'بدون حساب'}
                                    </span>
                                    <span className={'rounded-2xl px-3 py-2 ' + (hasCode ? 'bg-blue-500/10 text-blue-600' : 'bg-amber-500/10 text-amber-600')}>
                                        {hasCode ? 'كود بصمة' : 'بدون كود'}
                                    </span>
                                </div>
                            </motion.button>
                        );
                    })}
                </div>

                <section className="hidden overflow-hidden rounded-[28px] border border-border/45 bg-card md:block">
                    <div className="flex items-center justify-between gap-3 border-b border-border/35 bg-elevated px-5 py-4">
                        <div>
                            <p className="text-sm font-black">قائمة الموظفين</p>
                            <p className="mt-1 text-[11px] font-bold text-muted">افتح ملف أي موظف لمراجعة المستندات وربط القسم أو تعديل البيانات بسرعة.</p>
                        </div>
                        <p className="text-[11px] font-black text-muted">عرض {rangeStart} - {rangeEnd} من {totalEmployees}</p>
                    </div>
                    <div className="overflow-auto">
                        <table className="w-full min-w-[980px] text-right">
                            <thead className="sticky top-0 z-10 border-b border-border/35 bg-card text-[11px] font-black text-muted">
                                <tr>
                                    <th className="px-4 py-3">الموظف</th>
                                    <th className="px-4 py-3">المسمى</th>
                                    <th className="px-4 py-3">الفرع</th>
                                    <th className="px-4 py-3">كود البصمة</th>
                                    <th className="px-4 py-3">حساب النظام</th>
                                    <th className="px-4 py-3">الحالة</th>
                                    <th className="px-4 py-3 text-left">إجراءات</th>
                                </tr>
                            </thead>
                            <motion.tbody variants={listVariants} initial="hidden" animate="show" className="divide-y divide-border/25">
                                <AnimatePresence>
                                    {filtered.map((emp) => {
                                        const hasAccess = Boolean(emp.userId || emp.email);
                                        const biometricCode = emp.attendanceCode || emp.employeeCode;
                                        const flags = getEmployeeMissingFlags(emp);
                                        return (
                                            <motion.tr
                                                variants={itemVariants}
                                                exit={{ opacity: 0 }}
                                                key={emp.id}
                                                className="group cursor-pointer transition hover:bg-elevated/35"
                                                onClick={() => openEmployeeProfile(emp)}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 font-black text-blue-600 transition group-hover:scale-105">
                                                            {(emp.name || '?').slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-black group-hover:text-blue-600">{emp.name}</p>
                                                            <p className="mt-1 truncate text-[11px] font-bold text-muted">{getEmployeeDisplayCode(emp)}</p>
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                {flags.missingDepartment && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-600">بدون قسم</span>}
                                                                {flags.missingJobTitle && <span className="rounded-full bg-slate-500/10 px-2 py-1 text-[10px] font-black text-muted">بدون مسمى</span>}
                                                                {flags.missingFinance && <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[10px] font-black text-rose-600">بدون مرتب</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex rounded-full border border-border/40 bg-app/60 px-2.5 py-1 text-[11px] font-black text-muted">
                                                        {emp.role?.replace(/_/g, ' ') || 'غير محدد'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs font-bold text-muted">{emp.branch?.nameAr || emp.branch?.name || t.hr_all_branches}</td>
                                                <td className="px-4 py-3">
                                                    <span className={'inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ' + (biometricCode ? 'bg-blue-500/10 text-blue-600' : 'bg-amber-500/10 text-amber-600')}>
                                                        {biometricCode || 'بدون كود'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={'inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ' + (hasAccess ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-muted')}>
                                                        {hasAccess ? 'مفعل' : 'غير مفعل'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ' + (emp.isActive ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600' : 'border-rose-500/20 bg-rose-500/10 text-rose-600')}>
                                                        <span className={'h-1.5 w-1.5 rounded-full ' + (emp.isActive ? 'bg-emerald-500' : 'bg-rose-500')} />
                                                        {emp.isActive ? t.hr_active : t.hr_inactive}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-left">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={(event) => { event.stopPropagation(); openEmployeeProfile(emp); }}
                                                            className="inline-flex h-9 items-center gap-2 rounded-2xl border border-border/45 bg-card px-3 text-[11px] font-black text-muted transition hover:text-blue-600"
                                                        >
                                                            <ExternalLink size={13} /> فتح
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(event) => { event.stopPropagation(); openEditModal(emp); }}
                                                            className="inline-flex h-9 items-center gap-2 rounded-2xl border border-border/45 bg-elevated px-3 text-[11px] font-black text-muted transition hover:text-main"
                                                        >
                                                            <Briefcase size={13} /> تعديل
                                                        </button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                                {!loading && filtered.length === 0 && (
                                    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                        <td colSpan={7} className="px-8 py-24 text-center">
                                            <p className="text-xs font-black text-muted">لا توجد نتائج مطابقة للفلاتر الحالية.</p>
                                        </td>
                                    </motion.tr>
                                )}
                            </motion.tbody>
                        </table>
                    </div>
                    <div className="flex flex-col gap-3 border-t border-border/35 bg-elevated px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[11px] font-black text-muted">
                            عرض {rangeStart} - {rangeEnd} من {totalEmployees} موظف • {pageSize} لكل صفحة
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPage(prev => Math.max(0, prev - 1))}
                                disabled={page === 0 || loading}
                                className="h-9 rounded-2xl border border-border/50 bg-card px-4 text-xs font-black text-muted transition hover:text-main disabled:opacity-40"
                            >
                                السابق
                            </button>
                            <span className="min-w-24 rounded-2xl border border-border/45 bg-card px-3 py-2 text-center text-xs font-black tabular-nums">
                                {page + 1} / {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage(prev => Math.min(totalPages - 1, prev + 1))}
                                disabled={page >= totalPages - 1 || loading}
                                className="h-9 rounded-2xl border border-border/50 bg-card px-4 text-xs font-black text-muted transition hover:text-main disabled:opacity-40"
                            >
                                التالي
                            </button>
                        </div>
                    </div>
                </section>
            </div>

            {/* Employee Profile Drawer */}
            {typeof document !== 'undefined' && createPortal(
            <AnimatePresence>
                {showCreateModal && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/55 z-[9998]" onClick={() => setShowCreateModal(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: 24, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 16, scale: 0.98 }}
                            className="fixed left-1/2 top-1/2 z-[9999] flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border/40 bg-card sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:rounded-3xl"
                            dir="rtl"
                        >
                            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/30 bg-elevated p-4 sm:p-6">
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tight text-main">{editingEmployee ? t.hr_edit_employee : t.hr_new_employee}</h3>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted">{editingEmployee ? t.hr_edit_subtitle : t.hr_create_subtitle}</p>
                                </div>
                                <button onClick={() => setShowCreateModal(false)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/40 bg-card text-muted transition-colors hover:text-rose-500">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                                <div className="mb-5 flex flex-wrap gap-2">
                                    {modalSteps.map((step) => (
                                        <button
                                            key={step.key}
                                            type="button"
                                            onClick={() => setFormStep(step.key)}
                                            className={'rounded-2xl border px-3 py-2 text-xs font-black transition ' + (
                                                formStep === step.key
                                                    ? 'border-border bg-main text-app'
                                                    : 'border-border/40 bg-card text-muted hover:bg-elevated hover:text-main'
                                            )}
                                        >
                                            {step.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <label className={(formStep === 'basic' ? '' : 'hidden ') + "md:col-span-2"}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_name}</span>
                                    <input value={createForm.name} onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border" placeholder="الاسم الكامل للموظف" autoFocus />
                                </label>
                                <label className={formStep === 'basic' ? '' : 'hidden'}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_role_label}</span>
                                    <select value={createForm.role} onChange={(e) => setCreateForm(prev => ({ ...prev, role: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border">
                                        {['CASHIER', 'WAITER', 'COOK', 'DRIVER', 'SUPERVISOR', 'BRANCH_MANAGER', 'MANAGER', 'STAFF'].map(role => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}
                                    </select>
                                </label>
                                <label className={formStep === 'basic' ? '' : 'hidden'}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">الفرع</span>
                                    <select value={createForm.branchId} onChange={(e) => setCreateForm(prev => ({ ...prev, branchId: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border">
                                        <option value="">اختر الفرع</option>
                                        {branchOptions.map((branch: any) => (
                                            <option key={branch.id} value={branch.id}>{branch.nameAr || branch.name || branch.id}</option>
                                        ))}
                                    </select>
                                    {editingEmployee && (
                                        <span className="mt-2 block text-[10px] font-bold text-muted">تغيير هذا الحقل ينقل الموظف للفرع الجديد مباشرة.</span>
                                    )}
                                </label>
                                <label className={formStep === 'org' ? '' : 'hidden'}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">الإدارة</span>
                                    <select
                                        value={createForm.managementId}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, managementId: e.target.value, departmentId: '', jobTitleId: '' }))}
                                        className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border"
                                    >
                                        <option value="">كل الإدارات</option>
                                        {managementOptions.map((department: any) => (
                                            <option key={department.id} value={department.id}>{department.nameAr || department.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className={formStep === 'org' ? '' : 'hidden'}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">القسم التابع له</span>
                                    <select
                                        value={createForm.departmentId}
                                        onChange={(e) => {
                                            const department = departmentMap.get(e.target.value);
                                            setCreateForm(prev => ({ ...prev, managementId: department?.parentId || prev.managementId, departmentId: e.target.value, jobTitleId: '' }));
                                        }}
                                        className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border"
                                    >
                                        <option value="">اختر القسم</option>
                                        {visibleSectionOptions.map((department: any) => (
                                            <option key={department.id} value={department.id}>
                                                {(department.nameAr || department.name)} - {getDepartmentName(department.parentId)}
                                            </option>
                                        ))}
                                    </select>
                                    {createForm.departmentId && (
                                        <span className="mt-2 block text-[10px] font-bold text-muted">الإدارة: {getParentDepartmentName(createForm.departmentId)}</span>
                                    )}
                                </label>
                                <label className={formStep === 'org' ? '' : 'hidden'}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">المسمى الوظيفي</span>
                                    <select
                                        value={createForm.jobTitleId}
                                        onChange={(e) => {
                                            const jobTitle = jobTitles.find((item: any) => item.id === e.target.value);
                                            setCreateForm(prev => ({
                                                ...prev,
                                                jobTitleId: e.target.value,
                                                role: jobTitle?.title || jobTitle?.name || prev.role,
                                            }));
                                        }}
                                        className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border"
                                    >
                                        <option value="">اختياري</option>
                                        {filteredJobTitles.map((jobTitle: any) => (
                                            <option key={jobTitle.id} value={jobTitle.id}>{jobTitle.nameAr || jobTitle.title || jobTitle.name}</option>
                                        ))}
                                    </select>
                                </label>
                                {!editingEmployee && <label className={(formStep === 'access' ? '' : 'hidden ') + "flex items-center justify-between gap-4 rounded-2xl border border-border/40 bg-card px-4 py-3"}>
                                    <span>
                                        <span className="block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_system_access}</span>
                                        <span className="mt-1 block text-[10px] font-bold text-muted/70">{t.hr_system_access_desc}</span>
                                    </span>
                                    <input type="checkbox" checked={createForm.hasSystemAccess} onChange={(e) => setCreateForm(prev => ({ ...prev, hasSystemAccess: e.target.checked }))} className="h-5 w-5 accent-blue-600" />
                                </label>}
                                <label className={formStep === 'access' ? '' : 'hidden'}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_fingerprint_code}</span>
                                    <input value={createForm.employeeCode} onChange={(e) => setCreateForm(prev => ({ ...prev, employeeCode: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border" placeholder={t.hr_fingerprint_placeholder} />
                                </label>
                                <label className={formStep === 'basic' ? '' : 'hidden'}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_phone}</span>
                                    <input value={createForm.phone} onChange={(e) => setCreateForm(prev => ({ ...prev, phone: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border" placeholder="01..." />
                                </label>
                                {createForm.hasSystemAccess && (
                                    <>
                                        <label className={formStep === 'access' ? '' : 'hidden'}>
                                            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_email}</span>
                                            <input value={createForm.email} onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border" placeholder="Optional login email" />
                                        </label>
                                        <label className={formStep === 'access' ? '' : 'hidden'}>
                                            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_pin}</span>
                                            <input value={createForm.pin} onChange={(e) => setCreateForm(prev => ({ ...prev, pin: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border" placeholder="Optional POS PIN" />
                                        </label>
                                        <label className={formStep === 'access' ? '' : 'hidden'}>
                                            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_password}</span>
                                            <input type="password" value={createForm.password} onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border" placeholder="Optional password" />
                                        </label>
                                    </>
                                )}
                                <label className={formStep === 'finance' ? '' : 'hidden'}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_salary}</span>
                                    <input value={createForm.salary} onChange={(e) => setCreateForm(prev => ({ ...prev, salary: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border" placeholder="0" />
                                </label>
                                <label className={formStep === 'finance' ? '' : 'hidden'}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_hourly_rate}</span>
                                    <input value={createForm.hourlyRate} onChange={(e) => setCreateForm(prev => ({ ...prev, hourlyRate: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border" placeholder="0" />
                                </label>
                                <label className={formStep === 'basic' ? '' : 'hidden'}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_national_id}</span>
                                    <input value={createForm.nationalId} onChange={(e) => setCreateForm(prev => ({ ...prev, nationalId: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border" />
                                </label>
                                <label className={formStep === 'basic' ? '' : 'hidden'}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_emergency_contact}</span>
                                    <input value={createForm.emergencyContact} onChange={(e) => setCreateForm(prev => ({ ...prev, emergencyContact: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border" />
                                </label>
                                <label className={(formStep === 'finance' ? '' : 'hidden ') + "md:col-span-2"}>
                                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">{t.hr_bank_account}</span>
                                    <input value={createForm.bankAccount} onChange={(e) => setCreateForm(prev => ({ ...prev, bankAccount: e.target.value }))} className="w-full rounded-2xl border border-border/40 bg-card px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-border" />
                                </label>
                                <div className={(formStep === 'finance' ? '' : 'hidden ') + "md:col-span-2 rounded-2xl border border-border/35 bg-elevated px-4 py-4"}>
                                    <p className="text-xs font-black text-main">البدلات والخصومات الثابتة</p>
                                    <p className="mt-2 text-[11px] font-bold leading-6 text-muted">
                                        بعد حفظ الموظف، افتح ملفه ثم ادخل إلى تبويب <span className="text-main">البيانات المالية</span> لإضافة بدل انتقال أو بدل وجبة أو أي بند ثابت يدخل تلقائيًا في تقفيل الشهر.
                                    </p>
                                </div>
                            </div>
                            </div>

                            <div className="flex shrink-0 flex-col gap-3 border-t border-border/30 bg-elevated p-4 sm:flex-row sm:p-6">
                                <button onClick={() => setShowCreateModal(false)} className="h-12 flex-1 rounded-2xl border border-border/40 bg-card text-xs font-black uppercase tracking-widest text-muted transition-colors hover:bg-elevated">
                                    {t.hr_cancel}
                                </button>
                                <button onClick={handleCreateEmployee} disabled={isCreating} className="flex h-12 flex-[1.5] items-center justify-center gap-2 rounded-2xl bg-main text-xs font-black uppercase tracking-widest text-app transition-all disabled:opacity-60">
                                    {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                    {editingEmployee ? t.hr_save : t.hr_create}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}

                {selectedEmployee && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/55 z-[9998]" onClick={() => setSelectedEmployee(null)} />
                        <motion.div
                            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed inset-y-0 right-0 z-[9999] flex w-full max-w-[min(1100px,100vw)] flex-col border-l border-border/40 bg-card"
                            dir="rtl"
                        >
                            <div className="flex items-center justify-between border-b border-border/30 bg-card px-6 py-5">
                                <h3 className="flex items-center gap-4 text-xl font-black tracking-tight">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-500">
                                        <UserCheck size={20} />
                                    </div>
                                    {t.hr_employee_profile}
                                </h3>
                                <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }} onClick={() => setSelectedEmployee(null)} className="p-3 bg-card border border-border/50 text-muted rounded-xl hover:text-rose-500">
                                    <X size={20} />
                                </motion.button>
                            </div>

                            <div className="border-b border-border/25 px-6 py-4">
                                <div className="flex flex-wrap gap-2">
                                    {profileTabs.map((tab) => (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            onClick={() => setProfileTab(tab.key)}
                                            className={'rounded-2xl border px-3 py-2 text-xs font-black transition ' + (
                                                profileTab === tab.key
                                                    ? 'border-border bg-main text-app'
                                                    : 'border-border/40 bg-card text-muted hover:bg-elevated hover:text-main'
                                            )}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setProfileTab('finance')}
                                        className={'rounded-2xl border px-3 py-2 text-xs font-black transition ' + (
                                            profileTab === 'finance'
                                                ? 'border-border bg-main text-app'
                                                : 'border-border/40 bg-card text-muted hover:bg-elevated hover:text-main'
                                        )}
                                    >
                                        البيانات المالية
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-6 p-6 custom-scrollbar">
                                <div className={profileTab === 'overview' ? 'rounded-[28px] border border-border/40 bg-card p-5' : 'hidden'}>
                                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="flex items-start gap-4">
                                            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[28px] border border-blue-500/25 bg-blue-500/10 text-3xl font-black text-blue-500"
                                            >
                                                {selectedEmployee.name?.slice(0, 2).toUpperCase()}
                                            </motion.div>
                                            <div className="min-w-0">
                                                <h2 className="text-2xl font-black tracking-tight">{selectedEmployee.name}</h2>
                                                <p className="mt-1 text-sm font-bold text-muted">{selectedEmployee.email || 'لا يوجد بريد دخول'}</p>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <span className={'rounded-full border px-3 py-1 text-[11px] font-black ' + (selectedEmployee.isActive ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600' : 'border-rose-500/20 bg-rose-500/10 text-rose-600')}>
                                                        {selectedEmployee.isActive ? 'نشط' : 'غير نشط'}
                                                    </span>
                                                    <span className="rounded-full border border-border/40 bg-card px-3 py-1 text-[11px] font-black text-muted">
                                                        {getBranchName(selectedEmployee.branchId)}
                                                    </span>
                                                    <span className="rounded-full border border-border/40 bg-card px-3 py-1 text-[11px] font-black text-muted">
                                                        {getDepartmentName(selectedEmployee.departmentId)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button onClick={() => openEditModal(selectedEmployee)} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-xs font-black text-white">
                                                <Briefcase size={14} /> تعديل
                                            </button>
                                            <button onClick={() => loadEmployeeDocuments(selectedEmployee.id)} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-border/40 bg-card px-4 text-xs font-black text-muted">
                                                <RefreshCw size={14} /> تحديث
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className={profileTab === 'overview' ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3' : 'hidden'}>
                                    {[
                                        { label: t.hr_role, value: selectedEmployee.role?.replace(/_/g, ' '), icon: Briefcase },
                                        { label: 'الإدارة', value: getParentDepartmentName(selectedEmployee.departmentId), icon: Building2 },
                                        { label: 'القسم', value: getDepartmentName(selectedEmployee.departmentId), icon: Workflow },
                                        { label: 'المسمى', value: getJobTitleName(selectedEmployee.jobTitleId), icon: Award },
                                        { label: t.hr_branch, value: getBranchName(selectedEmployee.branchId), icon: Building2 },
                                        { label: t.hr_status, value: selectedEmployee.isActive ? t.hr_active : t.hr_inactive, icon: Activity },
                                        { label: t.hr_permissions, value: selectedEmployee.role?.includes('ADMIN') ? 'كاملة' : 'محدودة', icon: Shield },
                                    ].map((field, i) => (
                                        <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
                                            className="rounded-2xl border border-border/40 bg-card p-4"
                                        >
                                            <div className="mb-2 flex items-center gap-2 text-muted">
                                                <field.icon size={14} />
                                                <p className="text-[10px] font-black">{field.label}</p>
                                            </div>
                                            <p className="font-black text-sm">{field.value || 'غير محدد'}</p>
                                        </motion.div>
                                    ))}
                                </div>

                                <div className={profileTab === 'overview' ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4' : 'hidden'}>
                                    <div className="rounded-2xl border border-border/30 bg-card px-4 py-4">
                                        <p className="text-[10px] font-black text-muted">كود البصمة</p>
                                        <p className="mt-2 text-sm font-black">{selectedEmployee.employeeCode || selectedEmployee.attendanceCode || 'غير مضاف'}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border/30 bg-card px-4 py-4">
                                        <p className="text-[10px] font-black text-muted">الهاتف</p>
                                        <p className="mt-2 text-sm font-black">{selectedEmployee.phone || 'غير مضاف'}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border/30 bg-card px-4 py-4">
                                        <p className="text-[10px] font-black text-muted">الرقم القومي</p>
                                        <p className="mt-2 text-sm font-black">{selectedEmployee.nationalId || 'غير مضاف'}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border/30 bg-card px-4 py-4">
                                        <p className="text-[10px] font-black text-muted">دخول النظام</p>
                                        <p className="mt-2 text-sm font-black">{selectedEmployee.userId || selectedEmployee.email ? 'مفعل' : 'غير مفعل'}</p>
                                    </div>
                                </div>

                                <div className={profileTab === 'overview' ? 'flex flex-wrap items-center gap-2 rounded-2xl border border-border/30 bg-card p-3' : 'hidden'}>
                                    <button onClick={() => openEditModal(selectedEmployee)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-main px-4 text-xs font-black text-app">
                                        <Briefcase size={14} /> تعديل البيانات
                                    </button>
                                                                        <button onClick={() => openEditModal(selectedEmployee)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border/40 bg-card px-4 text-xs font-black text-main">
                                        <Building2 size={14} /> نقل فرع
                                    </button>
<button onClick={() => loadEmployeeDocuments(selectedEmployee.id)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border/40 bg-card px-4 text-xs font-black text-muted">
                                        <RefreshCw size={14} /> تحديث الملف
                                    </button>
                                    <span className="rounded-xl border border-border/30 bg-card px-3 py-2 text-[11px] font-black text-muted">
                                        {selectedEmployee.isActive ? 'الموظف نشط' : 'الموظف غير نشط'}
                                    </span>
                                </div>

                                <motion.section initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.12 }}
                                    className={(profileTab === 'lifecycle' ? '' : 'hidden ') + "rounded-[2rem] border border-border/40 bg-card overflow-hidden"}
                                >
                                    <div className="p-5 border-b border-border/25 flex items-center justify-between gap-3">
                                        <div>
                                            <h4 className="font-black text-sm flex items-center gap-2"><Workflow size={16} className="text-emerald-500" /> دورة حياة الموظف</h4>
                                            <p className="text-[10px] text-muted font-bold mt-1">جاهزية التهيئة وموانع إنهاء الخدمة اعتمادًا على بيانات الموارد البشرية الحالية.</p>
                                        </div>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        {loadingLifecycle ? (
                                            <div className="flex items-center gap-2 text-xs font-black text-muted">
                                                <Loader2 size={14} className="animate-spin text-emerald-500" /> جاري تحميل حالة الموظف...
                                            </div>
                                        ) : employeeLifecycle ? (
                                            <>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="rounded-2xl border border-border/30 bg-card p-4">
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted">التهيئة</p>
                                                        <p className={`mt-2 text-lg font-black ${employeeLifecycle.onboarding?.ready ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                            {employeeLifecycle.onboarding?.progress || 0} / {employeeLifecycle.onboarding?.total || 0}
                                                        </p>
                                                        <p className="mt-1 text-[10px] font-bold text-muted">{employeeLifecycle.onboarding?.ready ? 'جاهز تشغيل' : 'ما زالت هناك نواقص'}</p>
                                                    </div>
                                                    <div className="rounded-2xl border border-border/30 bg-card p-4">
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted">إنهاء الخدمة</p>
                                                        <p className={`mt-2 text-lg font-black ${employeeLifecycle.offboarding?.ready ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                            {employeeLifecycle.offboarding?.ready ? 'جاهز' : `${employeeLifecycle.offboarding?.blockers?.length || 0} عوائق`}
                                                        </p>
                                                        <p className="mt-1 text-[10px] font-bold text-muted">{employeeLifecycle.offboarding?.ready ? 'لا توجد موانع خروج حالية' : 'يلزم إنهاء المعلقات أولاً'}</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    {(employeeLifecycle.onboarding?.checklist || []).map((item: any) => (
                                                        <div key={item.key} className="flex items-center justify-between rounded-xl border border-border/25 bg-card px-3 py-3">
                                                            <p className="text-[11px] font-black">{item.label}</p>
                                                            <span className={`rounded-lg px-2 py-1 text-[10px] font-black border ${item.ok ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'}`}>
                                                                {item.ok ? 'جاهز' : 'ناقص'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>

                                                {(employeeLifecycle.offboarding?.blockers || []).length > 0 && (
                                                    <div className="space-y-2">
                                                        {employeeLifecycle.offboarding.blockers.map((item: any) => (
                                                            <div key={item.key} className="flex items-center justify-between rounded-xl border border-rose-500/15 bg-rose-500/5 px-3 py-3">
                                                                <div>
                                                                    <p className="text-[11px] font-black">{item.label}</p>
                                                                    <p className="mt-1 text-[10px] font-bold text-muted">الخطورة: {severityLabel(item.severity)}</p>
                                                                </div>
                                                                <span className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[10px] font-black text-rose-500">
                                                                    {item.count}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {(employeeLifecycle.signals || []).length > 0 && (
                                                    <div className="space-y-2">
                                                        {(employeeLifecycle.signals || []).map((item: any) => (
                                                            <div key={item.key} className="flex items-center justify-between rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-3">
                                                                <div>
                                                                    <p className="text-[11px] font-black">{item.label}</p>
                                                                    <p className="mt-1 text-[10px] font-bold text-muted">الخطورة: {severityLabel(item.severity)}</p>
                                                                </div>
                                                                <span className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-600">
                                                                    {item.value}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="text-xs font-black text-muted">بيانات الدورة الوظيفية غير متاحة لهذا الموظف.</div>
                                        )}
                                    </div>
                                </motion.section>

                                <motion.section initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
                                    className={(profileTab === 'lifecycle' ? '' : 'hidden ') + "rounded-[2rem] border border-border/40 bg-card overflow-hidden"}
                                >
                                    <div className="p-5 border-b border-border/25 flex items-center justify-between gap-3">
                                        <div>
                                            <h4 className="font-black text-sm flex items-center gap-2"><UserCheck size={16} className="text-emerald-500" /> قائمة تهيئة الموظف</h4>
                                            <p className="text-[10px] text-muted font-bold mt-1">خطوات التنفيذ المطلوبة لتجهيز الموظف للعمل فعليًا داخل النظام والفرع.</p>
                                        </div>
                                        <span className="rounded-xl bg-card border border-border/30 px-3 py-1.5 text-[10px] font-black text-muted">
                                            {employeeالتهيئةRecords.length}
                                        </span>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <select value={onboardingForm.taskType} onChange={e => setالتهيئةForm(prev => ({ ...prev, taskType: e.target.value }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-emerald-500">
                                                <option value="GENERAL">عام</option>
                                                <option value="ACCOUNT_SETUP">إعداد الحساب</option>
                                                <option value="BIOMETRIC_LINK">ربط البصمة</option>
                                                <option value="SHIFT_ASSIGNMENT">تعيين الوردية</option>
                                                <option value="PAYROLL_SETUP">إعداد الرواتب</option>
                                                <option value="DOCUMENTS">المستندات</option>
                                                <option value="ASSET_ISSUE">تسليم العهدة</option>
                                            </select>
                                            <input value={onboardingForm.title} onChange={e => setالتهيئةForm(prev => ({ ...prev, title: e.target.value }))} placeholder="عنوان المهمة" className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-emerald-500" />
                                            <select value={onboardingForm.status} onChange={e => setالتهيئةForm(prev => ({ ...prev, status: e.target.value }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-emerald-500">
                                                <option value="OPEN">مفتوحة</option>
                                                <option value="IN_PROGRESS">قيد التنفيذ</option>
                                            </select>
                                            <input type="date" value={onboardingForm.dueDate} onChange={e => setالتهيئةForm(prev => ({ ...prev, dueDate: e.target.value }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-emerald-500" />
                                            <input value={onboardingForm.ownerName} onChange={e => setالتهيئةForm(prev => ({ ...prev, ownerName: e.target.value }))} placeholder="المسؤول" className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-emerald-500" />
                                            <button onClick={() => setالتهيئةForm(prev => ({ ...prev, title: 'إنشاء مستخدم للنظام وتحديد الصلاحية', taskType: 'ACCOUNT_SETUP' }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-black text-muted">نموذج: إنشاء حساب</button>
                                            <button onClick={() => setالتهيئةForm(prev => ({ ...prev, title: 'ربط كود البصمة والتأكد من أول بصمة', taskType: 'BIOMETRIC_LINK' }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-black text-muted">نموذج: ربط البصمة</button>
                                            <button onClick={() => setالتهيئةForm(prev => ({ ...prev, title: 'تحديد الوردية وربط ملف الرواتب', taskType: 'PAYROLL_SETUP' }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-black text-muted sm:col-span-2">نموذج: وردية ورواتب</button>
                                        </div>
                                        <textarea value={onboardingForm.resultNotes} onChange={e => setالتهيئةForm(prev => ({ ...prev, resultNotes: e.target.value }))} placeholder="ملاحظات أو النتيجة المطلوبة" className="min-h-20 w-full rounded-xl border border-border/40 bg-card px-3 py-3 text-xs font-bold outline-none focus:border-emerald-500" />
                                        <button onClick={saveالتهيئةRecord} disabled={savingالتهيئةRecord} className="h-11 w-full rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-50 flex items-center justify-center gap-2">
                                            {savingالتهيئةRecord ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} إضافة مهمة تهيئة
                                        </button>

                                        <div className="space-y-2">
                                            {employeeالتهيئةRecords.map(record => (
                                                <div key={record.id} className="rounded-xl border border-border/30 bg-card p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-black text-sm truncate">{record.title}</p>
                                                            <p className="text-[10px] text-muted font-bold mt-1">{hrTaskTypeLabel(record.taskType)} {record.ownerName ? `• ${record.ownerName}` : ''} {record.dueDate ? `• الاستحقاق ${new Date(record.dueDate).toLocaleDateString()}` : ''}</p>
                                                        </div>
                                                        <span className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black ${
                                                            record.status === 'DONE'
                                                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                                                : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                                        }`}>
                                                            {hrRecordStatusLabel(record.status)}
                                                        </span>
                                                    </div>
                                                    {record.resultNotes && <p className="mt-3 text-[11px] font-bold text-muted leading-6">{record.resultNotes}</p>}
                                                    <div className="mt-3 flex items-center gap-2">
                                                        {record.status !== 'DONE' && (
                                                            <button onClick={() => updateالتهيئةRecordStatus(record.id, 'DONE')} disabled={updatingالتهيئةStatus === record.id} className="h-8 px-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-[10px] font-black text-emerald-500 disabled:opacity-50">
                                                                {updatingالتهيئةStatus === record.id ? '...' : 'تم التنفيذ'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {employeeالتهيئةRecords.length === 0 && (
                                                <p className="rounded-xl border border-dashed border-border/40 bg-card/50 p-4 text-center text-xs font-bold text-muted">
                                                    لا توجد مهام تهيئة حتى الآن.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </motion.section>

                                <motion.section initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
                                    className={(profileTab === 'lifecycle' ? '' : 'hidden ') + "rounded-[2rem] border border-border/40 bg-card overflow-hidden"}
                                >
                                    <div className="p-5 border-b border-border/25 flex items-center justify-between gap-3">
                                        <div>
                                            <h4 className="font-black text-sm flex items-center gap-2"><Archive size={16} className="text-rose-500" /> قائمة إنهاء الخدمة</h4>
                                            <p className="text-[10px] text-muted font-bold mt-1">مهام خروج واضحة تشمل التسليم، تصفية الحسابات، إغلاق الصلاحيات، والمستندات.</p>
                                        </div>
                                        <span className="rounded-xl bg-card border border-border/30 px-3 py-1.5 text-[10px] font-black text-muted">
                                            {employeeOffboardingRecords.length}
                                        </span>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <select value={offboardingForm.taskType} onChange={e => setOffboardingForm(prev => ({ ...prev, taskType: e.target.value }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-rose-500">
                                                <option value="GENERAL">عام</option>
                                                <option value="ASSET_RETURN">إرجاع العهدة</option>
                                                <option value="ACCESS_CLOSURE">إغلاق الصلاحيات</option>
                                                <option value="PAYROLL_CLEARANCE">تصفية الرواتب</option>
                                                <option value="DOCUMENTS">مستندات</option>
                                                <option value="EXIT_INTERVIEW">مقابلة خروج</option>
                                            </select>
                                            <input value={offboardingForm.title} onChange={e => setOffboardingForm(prev => ({ ...prev, title: e.target.value }))} placeholder="عنوان المهمة" className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-rose-500" />
                                            <select value={offboardingForm.status} onChange={e => setOffboardingForm(prev => ({ ...prev, status: e.target.value }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-rose-500">
                                                <option value="OPEN">مفتوحة</option>
                                                <option value="IN_PROGRESS">قيد التنفيذ</option>
                                            </select>
                                            <input type="date" value={offboardingForm.dueDate} onChange={e => setOffboardingForm(prev => ({ ...prev, dueDate: e.target.value }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-rose-500" />
                                            <input value={offboardingForm.ownerName} onChange={e => setOffboardingForm(prev => ({ ...prev, ownerName: e.target.value }))} placeholder="المسؤول" className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-rose-500" />
                                            <button onClick={() => setOffboardingForm(prev => ({ ...prev, title: 'إغلاق صلاحيات النظام والبصمة', taskType: 'ACCESS_CLOSURE' }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-black text-muted">نموذج: إغلاق الصلاحيات</button>
                                        </div>
                                        <textarea value={offboardingForm.resultNotes} onChange={e => setOffboardingForm(prev => ({ ...prev, resultNotes: e.target.value }))} placeholder="ملاحظات أو النتيجة المطلوبة" className="min-h-20 w-full rounded-xl border border-border/40 bg-card px-3 py-3 text-xs font-bold outline-none focus:border-rose-500" />
                                        <button onClick={saveOffboardingRecord} disabled={savingOffboardingRecord} className="h-11 w-full rounded-xl bg-rose-600 text-white text-xs font-black disabled:opacity-50 flex items-center justify-center gap-2">
                                            {savingOffboardingRecord ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} إضافة مهمة خروج
                                        </button>

                                        <div className="space-y-2">
                                            {employeeOffboardingRecords.map(record => (
                                                <div key={record.id} className="rounded-xl border border-border/30 bg-card p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-black text-sm truncate">{record.title}</p>
                                                            <p className="text-[10px] text-muted font-bold mt-1">{hrTaskTypeLabel(record.taskType)} {record.ownerName ? `• ${record.ownerName}` : ''} {record.dueDate ? `• الاستحقاق ${new Date(record.dueDate).toLocaleDateString()}` : ''}</p>
                                                        </div>
                                                        <span className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black ${
                                                            record.status === 'DONE'
                                                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                                                : record.status === 'WAIVED'
                                                                    ? 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                                                    : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                                        }`}>
                                                            {hrRecordStatusLabel(record.status)}
                                                        </span>
                                                    </div>
                                                    {(record.resultNotes || record.waivedReason) && <p className="mt-3 text-[11px] font-bold text-muted leading-6">{record.resultNotes || record.waivedReason}</p>}
                                                    <div className="mt-3 flex items-center gap-2">
                                                        {record.status !== 'DONE' && (
                                                            <button onClick={() => updateOffboardingRecordStatus(record.id, 'DONE')} disabled={updatingOffboardingStatus === record.id} className="h-8 px-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-[10px] font-black text-emerald-500 disabled:opacity-50">
                                                                {updatingOffboardingStatus === record.id ? '...' : 'تم التنفيذ'}
                                                            </button>
                                                        )}
                                                        {record.status !== 'WAIVED' && record.status !== 'DONE' && (
                                                            <button onClick={() => updateOffboardingRecordStatus(record.id, 'WAIVED')} disabled={updatingOffboardingStatus === record.id} className="h-8 px-3 rounded-lg border border-slate-500/20 bg-slate-500/10 text-[10px] font-black text-slate-300 disabled:opacity-50">
                                                                {updatingOffboardingStatus === record.id ? '...' : 'تجاوز'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {employeeOffboardingRecords.length === 0 && (
                                                <p className="rounded-xl border border-dashed border-border/40 bg-card/50 p-4 text-center text-xs font-bold text-muted">
                                                    لا توجد مهام خروج حتى الآن.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </motion.section>

                                <motion.section initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
                                    className={(profileTab === 'performance' ? '' : 'hidden ') + "rounded-[2rem] border border-border/40 bg-card overflow-hidden"}
                                >
                                    <div className="p-5 border-b border-border/25 flex items-center justify-between gap-3">
                                        <div>
                                            <h4 className="font-black text-sm flex items-center gap-2"><Activity size={16} className="text-violet-500" /> ملاحظات ومتابعة الأداء</h4>
                                            <p className="text-[10px] text-muted font-bold mt-1">الإنذارات، المراجعات، وخطط المتابعة في سجل واحد واضح.</p>
                                        </div>
                                        <span className="rounded-xl bg-card border border-border/30 px-3 py-1.5 text-[10px] font-black text-muted">
                                            {employeePerformanceRecords.length}
                                        </span>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <select value={performanceForm.actionType} onChange={e => setPerformanceForm(prev => ({ ...prev, actionType: e.target.value }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-violet-500">
                                                <option value="HR_NOTE">ملاحظة إدارية</option>
                                                <option value="HR_WARNING">إنذار</option>
                                                <option value="HR_REVIEW">مراجعة</option>
                                                <option value="HR_PIP">خطة تحسين</option>
                                            </select>
                                            <input value={performanceForm.title} onChange={e => setPerformanceForm(prev => ({ ...prev, title: e.target.value }))} placeholder="العنوان" className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-violet-500" />
                                            <select value={performanceForm.status} onChange={e => setPerformanceForm(prev => ({ ...prev, status: e.target.value }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-violet-500">
                                                <option value="OPEN">مفتوحة</option>
                                                <option value="IN_PROGRESS">قيد المتابعة</option>
                                                <option value="ACKNOWLEDGED">تم الاطلاع</option>
                                            </select>
                                            <input value={performanceForm.rating} onChange={e => setPerformanceForm(prev => ({ ...prev, rating: e.target.value }))} placeholder="التقييم /5" className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-violet-500" />
                                            <input type="date" value={performanceForm.dueDate} onChange={e => setPerformanceForm(prev => ({ ...prev, dueDate: e.target.value }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-violet-500" />
                                            <input value={performanceForm.followUpAction} onChange={e => setPerformanceForm(prev => ({ ...prev, followUpAction: e.target.value }))} placeholder="الإجراء التالي" className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-violet-500" />
                                        </div>
                                        <textarea value={performanceForm.noteBody} onChange={e => setPerformanceForm(prev => ({ ...prev, noteBody: e.target.value }))} placeholder="التفاصيل أو الملاحظات أو خطة المتابعة" className="min-h-24 w-full rounded-xl border border-border/40 bg-card px-3 py-3 text-xs font-bold outline-none focus:border-violet-500" />
                                        <button onClick={savePerformanceRecord} disabled={savingPerformanceRecord} className="h-11 w-full rounded-xl bg-violet-600 text-white text-xs font-black disabled:opacity-50 flex items-center justify-center gap-2">
                                            {savingPerformanceRecord ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} حفظ السجل
                                        </button>

                                        <div className="space-y-2">
                                            {employeePerformanceRecords.map(record => (
                                                <div key={record.id} className="rounded-xl border border-border/30 bg-card p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-black text-sm truncate">{record.title}</p>
                                                            <p className="text-[10px] text-muted font-bold mt-1">{record.actionType} {record.rating ? `• ${record.rating}/5` : ''} {record.dueDate ? `• due ${new Date(record.dueDate).toLocaleDateString()}` : ''}</p>
                                                        </div>
                                                        <span className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black ${
                                                            record.status === 'CLOSED'
                                                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                                                : record.status === 'ACKNOWLEDGED'
                                                                    ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                                                    : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                                        }`}>
                                                            {record.status}
                                                        </span>
                                                    </div>
                                                    <p className="mt-3 text-[11px] font-bold text-muted leading-6">{record.noteBody}</p>
                                                    {record.followUpAction && <p className="mt-2 text-[10px] font-black text-violet-500">الإجراء التالي: {record.followUpAction}</p>}
                                                    <div className="mt-3 flex items-center gap-2">
                                                        {record.status !== 'ACKNOWLEDGED' && record.status !== 'CLOSED' && (
                                                            <button onClick={() => updatePerformanceRecordStatus(record.id, 'ACKNOWLEDGED')} disabled={updatingPerformanceStatus === record.id} className="h-8 px-3 rounded-lg border border-blue-500/20 bg-blue-500/10 text-[10px] font-black text-blue-500 disabled:opacity-50">
                                                                {updatingPerformanceStatus === record.id ? '...' : 'تم الاطلاع'}
                                                            </button>
                                                        )}
                                                        {record.status !== 'CLOSED' && (
                                                            <button onClick={() => updatePerformanceRecordStatus(record.id, 'CLOSED')} disabled={updatingPerformanceStatus === record.id} className="h-8 px-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-[10px] font-black text-emerald-500 disabled:opacity-50">
                                                                {updatingPerformanceStatus === record.id ? '...' : 'إغلاق'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {employeePerformanceRecords.length === 0 && (
                                                <p className="rounded-xl border border-dashed border-border/40 bg-card/50 p-4 text-center text-xs font-bold text-muted">
                                                    No performance notes yet.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </motion.section>

                                <motion.section initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
                                    className={(profileTab === 'finance' ? '' : 'hidden ') + "rounded-[2rem] border border-border/40 bg-card overflow-hidden"}
                                >
                                    <div className="border-b border-border/25 p-5">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div>
                                                <h4 className="font-black text-sm text-main">تفصيل المرتب المتفق عليه</h4>
                                                <p className="mt-1 text-[11px] font-bold text-muted">
                                                    هنا تحدد الأساسي والبنود الثابتة لكل موظف. التقفيل الشهري سيضيف هذه البنود تلقائيًا مع المكافآت والخصومات والسلف الخاصة بالشهر.
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => openEditModal(selectedEmployee)}
                                                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-border/40 bg-card px-4 text-xs font-black text-main"
                                            >
                                                <Briefcase size={14} /> تعديل الأساسي والساعة
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-5 p-5">
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                                            {[
                                                { label: 'المرتب الأساسي', value: money(selectedEmployeeBaseSalary) },
                                                { label: 'البدلات الثابتة', value: money(allowanceTotal) },
                                                { label: 'الخصومات الثابتة', value: money(deductionTotal) },
                                                { label: 'صافي متوقع قبل متغيرات الشهر', value: money(agreedNetBeforeMonthlyChanges) },
                                            ].map((item) => (
                                                <div key={item.label} className="rounded-2xl border border-border/35 bg-elevated px-4 py-4">
                                                    <p className="text-[10px] font-black text-muted">{item.label}</p>
                                                    <p className="mt-2 text-lg font-black text-main">{item.value}</p>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="rounded-2xl border border-border/35 bg-elevated px-4 py-4">
                                            <p className="text-[10px] font-black text-muted">الإجمالي المتفق عليه</p>
                                            <p className="mt-2 text-2xl font-black text-main">{money(agreedGrossSalary)}</p>
                                            <p className="mt-2 text-[11px] font-bold text-muted">
                                                مثال: إذا كان الإجمالي 8500 ويشمل 1500 انتقال و300 وجبة و200 بدل آخر، اجعل الأساسي 6500 ثم أضف البنود الثابتة هنا.
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border border-border/35 bg-card p-4">
                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                                                <label>
                                                    <span className="mb-2 block text-[10px] font-black text-muted">اسم البند</span>
                                                    <input value={compensationForm.name} onChange={(e) => setCompensationForm(prev => ({ ...prev, name: e.target.value }))} className="h-11 w-full rounded-xl border border-border/40 bg-card px-3 text-sm font-bold outline-none focus:border-border" placeholder="بدل انتقال" />
                                                </label>
                                                <label>
                                                    <span className="mb-2 block text-[10px] font-black text-muted">النوع</span>
                                                    <select value={compensationForm.type} onChange={(e) => setCompensationForm(prev => ({ ...prev, type: e.target.value }))} className="h-11 w-full rounded-xl border border-border/40 bg-card px-3 text-sm font-bold outline-none focus:border-border">
                                                        <option value="ALLOWANCE">بدل / استحقاق</option>
                                                        <option value="DEDUCTION">خصم ثابت</option>
                                                    </select>
                                                </label>
                                                <label>
                                                    <span className="mb-2 block text-[10px] font-black text-muted">التصنيف</span>
                                                    <select value={compensationForm.category} onChange={(e) => setCompensationForm(prev => ({ ...prev, category: e.target.value }))} className="h-11 w-full rounded-xl border border-border/40 bg-card px-3 text-sm font-bold outline-none focus:border-border">
                                                        <option value="GENERAL">عام</option>
                                                        <option value="TRANSPORT">انتقال</option>
                                                        <option value="MEAL">وجبة</option>
                                                        <option value="HOUSING">سكن</option>
                                                        <option value="LEAVE">بدل إجازات</option>
                                                        <option value="PHONE">موبايل</option>
                                                    </select>
                                                </label>
                                                <label>
                                                    <span className="mb-2 block text-[10px] font-black text-muted">المبلغ الشهري</span>
                                                    <input value={compensationForm.amount} onChange={(e) => setCompensationForm(prev => ({ ...prev, amount: e.target.value }))} className="h-11 w-full rounded-xl border border-border/40 bg-card px-3 text-sm font-bold outline-none focus:border-border" placeholder="0" />
                                                </label>
                                                <label>
                                                    <span className="mb-2 block text-[10px] font-black text-muted">من تاريخ</span>
                                                    <input type="date" value={compensationForm.effectiveFrom} onChange={(e) => setCompensationForm(prev => ({ ...prev, effectiveFrom: e.target.value }))} className="h-11 w-full rounded-xl border border-border/40 bg-card px-3 text-sm font-bold outline-none focus:border-border" />
                                                </label>
                                                <label>
                                                    <span className="mb-2 block text-[10px] font-black text-muted">إلى تاريخ</span>
                                                    <input type="date" value={compensationForm.effectiveTo} onChange={(e) => setCompensationForm(prev => ({ ...prev, effectiveTo: e.target.value }))} className="h-11 w-full rounded-xl border border-border/40 bg-card px-3 text-sm font-bold outline-none focus:border-border" />
                                                </label>
                                                <label className="flex items-center justify-between rounded-xl border border-border/40 bg-elevated px-4 py-3">
                                                    <span>
                                                        <span className="block text-[10px] font-black text-muted">بند متكرر شهريًا</span>
                                                        <span className="mt-1 block text-[10px] font-bold text-muted">إذا أوقفته سيتعامل معه النظام كبند مؤقت</span>
                                                    </span>
                                                    <input type="checkbox" checked={compensationForm.isRecurring} onChange={(e) => setCompensationForm(prev => ({ ...prev, isRecurring: e.target.checked }))} className="h-5 w-5 accent-current" />
                                                </label>
                                                <label className="md:col-span-2 xl:col-span-1">
                                                    <span className="mb-2 block text-[10px] font-black text-muted">ملاحظات</span>
                                                    <input value={compensationForm.notes} onChange={(e) => setCompensationForm(prev => ({ ...prev, notes: e.target.value }))} className="h-11 w-full rounded-xl border border-border/40 bg-card px-3 text-sm font-bold outline-none focus:border-border" placeholder="اختياري" />
                                                </label>
                                            </div>

                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <button onClick={saveCompensationItem} disabled={savingCompensationItem} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-main px-4 text-xs font-black text-app disabled:opacity-50">
                                                    {savingCompensationItem ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                                    {compensationForm.id ? 'حفظ التعديل' : 'إضافة بند ثابت'}
                                                </button>
                                                <button onClick={() => setCompensationForm(DEFAULT_COMPENSATION_FORM)} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border/40 bg-card px-4 text-xs font-black text-muted">
                                                    <RefreshCw size={14} /> إعادة ضبط
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            {employeeCompensationItems.map((item: any) => (
                                                <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-border/35 bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="text-sm font-black text-main">{item.nameAr || item.name}</p>
                                                            <span className="rounded-full border border-border/35 bg-elevated px-2.5 py-1 text-[10px] font-black text-muted">
                                                                {item.category || 'GENERAL'}
                                                            </span>
                                                            <span className={'rounded-full border px-2.5 py-1 text-[10px] font-black ' + (String(item.type).toUpperCase() === 'DEDUCTION'
                                                                ? 'border-rose-500/20 text-rose-600'
                                                                : 'border-emerald-500/20 text-emerald-600')}>
                                                                {String(item.type).toUpperCase() === 'DEDUCTION' ? 'خصم ثابت' : 'بدل ثابت'}
                                                            </span>
                                                        </div>
                                                        <p className="mt-2 text-[11px] font-bold text-muted">
                                                            {item.isRecurring === false ? 'مؤقت' : 'متكرر شهريًا'} {item.effectiveFrom ? `• من ${formatShortDate(item.effectiveFrom, lang)}` : ''} {item.effectiveTo ? `• إلى ${formatShortDate(item.effectiveTo, lang)}` : ''}
                                                        </p>
                                                        {item.notes && <p className="mt-2 text-[11px] font-bold text-muted">{item.notes}</p>}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                                        <span className="min-w-28 rounded-2xl border border-border/35 bg-elevated px-4 py-2 text-center text-sm font-black text-main">
                                                            {money(Number(item.amount || 0))}
                                                        </span>
                                                        <button onClick={() => editCompensationItem(item)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/40 bg-card px-3 text-[11px] font-black text-main">
                                                            <Briefcase size={13} /> تعديل
                                                        </button>
                                                        <button onClick={() => archiveCompensationItem(item.id)} disabled={removingCompensationItemId === item.id} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/40 bg-card px-3 text-[11px] font-black text-muted disabled:opacity-50">
                                                            {removingCompensationItemId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />} إيقاف
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            {employeeCompensationItems.length === 0 && (
                                                <div className="rounded-2xl border border-dashed border-border/40 bg-card px-4 py-8 text-center">
                                                    <p className="text-sm font-black text-main">لا توجد بنود ثابتة مضافة</p>
                                                    <p className="mt-2 text-[11px] font-bold text-muted">
                                                        أضف بدل انتقال أو وجبة أو أي خصم/استحقاق ثابت، وسيظهر تلقائيًا في حساب راتب هذا الموظف عند التقفيل.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.section>

                                <motion.section initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
                                    className={(profileTab === 'documents' ? '' : 'hidden ') + "rounded-[2rem] border border-border/40 bg-card overflow-hidden"}
                                >
                                    <div className="p-5 border-b border-border/25 flex items-center justify-between gap-3">
                                        <div>
                                            <h4 className="font-black text-sm flex items-center gap-2"><FileText size={16} className="text-blue-500" /> خزنة المستندات</h4>
                                            <p className="text-[10px] text-muted font-bold mt-1">العقود، الشهادات الصحية، التراخيص، بطاقات الهوية، وتنبيهات الانتهاء.</p>
                                        </div>
                                        <span className="rounded-xl bg-card border border-border/30 px-3 py-1.5 text-[10px] font-black text-muted">
                                            {employeeDocuments.length}
                                        </span>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <select value={documentForm.documentType} onChange={e => setDocumentForm(prev => ({ ...prev, documentType: e.target.value }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-blue-500">
                                                <option value="HEALTH_CERTIFICATE">شهادة صحية</option>
                                                <option value="NATIONAL_ID">الرقم القومي</option>
                                                <option value="CONTRACT">عقد عمل</option>
                                                <option value="LICENSE">ترخيص</option>
                                                <option value="MEDICAL_INSURANCE">تأمين طبي</option>
                                                <option value="OTHER">أخرى</option>
                                            </select>
                                            <input value={documentForm.title} onChange={e => setDocumentForm(prev => ({ ...prev, title: e.target.value }))} placeholder="عنوان المستند" className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                            <input value={documentForm.documentNumber} onChange={e => setDocumentForm(prev => ({ ...prev, documentNumber: e.target.value }))} placeholder="رقم المستند" className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                            <select value={documentForm.sourceType} onChange={e => setDocumentForm(prev => ({ ...prev, sourceType: e.target.value, fileUrl: '', fileName: '' }))} className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-blue-500">
                                                <option value="LINK">رابط Google Drive</option>
                                                <option value="FILE">رفع ملف</option>
                                            </select>
                                            {documentForm.sourceType === 'LINK' ? (
                                                <input value={documentForm.fileUrl} onChange={e => setDocumentForm(prev => ({ ...prev, fileUrl: e.target.value }))} placeholder="رابط Google Drive" className="h-11 rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                            ) : (
                                                <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-border/40 bg-card px-3 text-xs font-black text-muted transition hover:text-blue-500">
                                                    <Upload size={14} />
                                                    <span className="truncate">{documentForm.fileName || 'اختر ملف'}</span>
                                                    <input type="file" className="hidden" onChange={e => handleEmployeeDocumentFile(e.target.files?.[0])} />
                                                </label>
                                            )}
                                            <label>
                                                <span className="mb-1 block text-[9px] font-black text-muted">تاريخ الإصدار</span>
                                                <input type="date" value={documentForm.issueDate} onChange={e => setDocumentForm(prev => ({ ...prev, issueDate: e.target.value }))} className="h-11 w-full rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                            </label>
                                            <label>
                                                <span className="mb-1 block text-[9px] font-black text-muted">تاريخ الانتهاء</span>
                                                <input type="date" value={documentForm.expiryDate} onChange={e => setDocumentForm(prev => ({ ...prev, expiryDate: e.target.value }))} className="h-11 w-full rounded-xl border border-border/40 bg-card px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                            </label>
                                        </div>
                                        <textarea value={documentForm.notes} onChange={e => setDocumentForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="ملاحظات" className="min-h-20 w-full rounded-xl border border-border/40 bg-card px-3 py-3 text-xs font-bold outline-none focus:border-blue-500" />
                                        <button onClick={saveEmployeeDocument} disabled={savingDocument} className="h-11 w-full rounded-xl bg-blue-600 text-white text-xs font-black disabled:opacity-50 flex items-center justify-center gap-2">
                                            {savingDocument ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} حفظ المستند
                                        </button>

                                        <div className="space-y-2">
                                            {employeeDocuments.map(doc => (
                                                <div key={doc.id} className="rounded-xl border border-border/30 bg-card p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-black text-sm truncate">{doc.title}</p>
                                                            <p className="text-[10px] text-muted font-bold mt-1">{documentTypeLabel(doc.documentType)} {doc.documentNumber ? `- ${doc.documentNumber}` : ''}</p>
                                                            {doc.metadata?.fileName && <p className="text-[10px] text-muted font-bold mt-1">{doc.metadata.fileName}</p>}
                                                            {doc.expiryDate && <p className="text-[10px] text-muted font-bold mt-1">ينتهي في: {new Date(doc.expiryDate).toLocaleDateString()}</p>}
                                                        </div>
                                                        <span className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black ${documentStatusClass(doc.computedStatus || doc.status)}`}>
                                                            {documentStatusLabel(doc, lang)}
                                                        </span>
                                                    </div>
                                                    <div className="mt-3 flex items-center gap-2">
                                                        {doc.fileUrl && (
                                                            <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-lg border border-border/40 bg-elevated text-[10px] font-black flex items-center gap-1">
                                                                <ExternalLink size={12} /> فتح
                                                            </a>
                                                        )}
                                                        <button onClick={() => archiveEmployeeDocument(doc.id)} className="h-8 px-3 rounded-lg border border-border/40 bg-elevated text-[10px] font-black text-muted hover:text-rose-500 flex items-center gap-1">
                                                            <Archive size={12} /> أرشفة
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {employeeDocuments.length === 0 && (
                                                <p className="rounded-xl border border-dashed border-border/40 bg-card/50 p-4 text-center text-xs font-bold text-muted">
                                                    لا توجد مستندات محفوظة حتى الآن.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </motion.section>

                                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                                    className={(profileTab === 'performance' ? '' : 'hidden ') + "rounded-[2rem] border border-border/40 bg-card p-8"}
                                >
                                    <h4 className="mb-4 flex items-center gap-2 text-sm font-black text-main">
                                        <Activity size={14} /> {t.hr_performance}
                                    </h4>
                                    <p className="text-sm font-bold leading-relaxed text-muted">
                                        {selectedEmployee.isActive
                                            ? t.hr_performance_active
                                            : t.hr_performance_inactive}
                                    </p>
                                </motion.div>
                            </div>

                            <div className="border-t border-border/30 bg-card px-6 py-4">
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => openEditModal(selectedEmployee)}
                                        className="inline-flex h-11 items-center gap-2 rounded-2xl bg-main px-4 text-sm font-black text-app"
                                    >
                                        <Briefcase size={16} /> {t.hr_edit_profile}
                                    </button>
                                    <button
                                        onClick={() => setSelectedEmployee(null)}
                                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border/40 bg-card px-4 text-sm font-black text-muted"
                                    >
                                        <X size={16} /> إغلاق
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>,
            document.body
            )}
            {reasonDialog && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4" onClick={() => setReasonDialog(null)}>
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                            <div>
                                <h3 className="text-lg font-black text-main">
                                    {reasonDialog.kind === 'attendance' ? 'سبب طلب التعديل' : reasonDialog.kind === 'leaveReject' ? 'سبب الرفض' : 'سبب التجاوز'}
                                </h3>
                                <p className="mt-1 text-xs font-bold text-muted">اكتب سبب واضح يظهر في المراجعة.</p>
                            </div>
                            <button onClick={() => setReasonDialog(null)} className="p-2 text-muted hover:text-main"><X size={18} /></button>
                        </div>
                        <div className="p-5">
                            <textarea
                                value={reasonText}
                                onChange={(e) => setReasonText(e.target.value)}
                                rows={4}
                                maxLength={240}
                                autoFocus
                                className="w-full resize-none rounded-xl border border-border bg-app p-3 text-sm font-bold text-main outline-none focus:border-primary"
                            />
                        </div>
                        <div className="flex gap-3 border-t border-border p-4">
                            <button onClick={() => setReasonDialog(null)} className="flex-1 rounded-xl border border-border bg-app py-3 text-xs font-black text-muted">إلغاء</button>
                            <button onClick={submitReasonDialog} disabled={!reasonText.trim()} className="flex-1 rounded-xl bg-primary py-3 text-xs font-black text-white disabled:opacity-50">حفظ</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
