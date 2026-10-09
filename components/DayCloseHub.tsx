import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle, CalendarClock, CheckCircle2, ExternalLink, RotateCcw, X,
    Wallet, Banknote, Receipt, ShieldCheck, ShieldAlert, Printer, FileDown,
    Mail, MessageCircle, RefreshCw, Lock, ClipboardCheck, Info, Flag,
    TrendingUp, TrendingDown, Sparkles, ChevronLeft, Scale,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dayCloseApi } from '../services/api/dayClose';
import { shiftsApi } from '../services/api/shifts';
import { settingsApi } from '../services/api/settings';
import { useAuthStore } from '../stores/useAuthStore';
import { useFinanceStore } from '../stores/useFinanceStore';
import { useConfirm } from './common/ConfirmProvider';

export const buildDayCloseConfirmationMessage = (report: any, lang: string) => {
    const isAr = lang === 'ar';
    const sales = report?.salesSummary || {};
    const cash = report?.shiftCashSummary || {};
    const blockedCount = (report?.readiness?.checks || []).filter((check: any) => !check.passed).length;
    return [
        `${isAr ? 'الطلبات' : 'Orders'}: ${Number(sales.totalOrders || 0).toLocaleString()}`,
        `${isAr ? 'الإيراد' : 'Revenue'}: ${Number(sales.totalRevenue || 0).toLocaleString()}`,
        `${isAr ? 'النقدية المتوقعة' : 'Expected cash'}: ${Number(cash.expectedCash || 0).toLocaleString()}`,
        `${isAr ? 'النقدية الفعلية' : 'Actual cash'}: ${Number(cash.actualCash || 0).toLocaleString()}`,
        `${isAr ? 'الفرق' : 'Variance'}: ${Number(cash.variance || 0).toLocaleString()}`,
        `${isAr ? 'عوائق الإغلاق' : 'Close blockers'}: ${blockedCount}`,
    ].join('\n');
};

const todayLocalDate = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const parseLocalDate = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return new Date();
    return new Date(year, month - 1, day);
};

const toLocalDateKey = (value: Date) => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const buildMonthDays = (dateKey: string) => {
    const anchor = parseLocalDate(dateKey);
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const days: Array<{ key: string; day: number | null }> = [];
    for (let i = 0; i < first.getDay(); i += 1) days.push({ key: `blank-start-${i}`, day: null });
    for (let day = 1; day <= last.getDate(); day += 1) {
        days.push({ key: toLocalDateKey(new Date(anchor.getFullYear(), anchor.getMonth(), day)), day });
    }
    while (days.length % 7 !== 0) days.push({ key: `blank-end-${days.length}`, day: null });
    return days;
};

const readinessCopy: Record<string, {
    titleEn: string;
    titleAr: string;
    readyEn: string;
    readyAr: string;
    actionEn: string;
    actionAr: string;
    actionLabelEn: string;
    actionLabelAr: string;
    actionPath: string;
}> = {
    FISCAL_NOT_CLEAN_FOR_DAY_CLOSE: {
        titleEn: 'Fiscal submissions',
        titleAr: 'الإقرارات الضريبية',
        readyEn: 'No pending, failed, or dead-letter fiscal records.',
        readyAr: 'لا يوجد سجلات ضريبية معلقة أو فاشلة أو متوقفة.',
        actionEn: 'Resolve pending or failed ETA submissions.',
        actionAr: 'راجع الفاتورة الإلكترونية وعالج المعلق أو الفاشل.',
        actionLabelEn: 'Open Fiscal',
        actionLabelAr: 'افتح الضرائب',
        actionPath: '/fiscal',
    },
    FISCAL_SUBMISSIONS_OPEN_FOR_DAY_CLOSE: {
        titleEn: 'Fiscal submissions',
        titleAr: 'الإقرارات الضريبية',
        readyEn: 'No pending, failed, or dead-letter fiscal records.',
        readyAr: 'لا يوجد سجلات ضريبية معلقة أو فاشلة أو متوقفة.',
        actionEn: 'Resolve pending or failed ETA submissions.',
        actionAr: 'راجع الفاتورة الإلكترونية وعالج المعلق أو الفاشل.',
        actionLabelEn: 'Open Fiscal',
        actionLabelAr: 'افتح الضرائب',
        actionPath: '/fiscal',
    },
    FINANCE_EXCEPTIONS_PENDING_FOR_DAY_CLOSE: {
        titleEn: 'Finance exceptions',
        titleAr: 'استثناءات المحاسبة',
        readyEn: 'No pending finance exceptions.',
        readyAr: 'لا يوجد استثناءات محاسبية معلقة.',
        actionEn: 'Resolve pending finance exceptions.',
        actionAr: 'افتح المحاسبة وقم بتسوية الاستثناءات المعلقة.',
        actionLabelEn: 'Open Finance',
        actionLabelAr: 'افتح المحاسبة',
        actionPath: '/finance',
    },
    OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE: {
        titleEn: 'Open shifts',
        titleAr: 'الشيفتات المفتوحة',
        readyEn: 'All shifts are closed.',
        readyAr: 'كل الشيفتات مغلقة.',
        actionEn: 'Close open cashier or attendance shifts.',
        actionAr: 'اقفل الشيفتات المفتوحة قبل إقفال اليوم.',
        actionLabelEn: 'Open Shift Close',
        actionLabelAr: 'افتح إغلاق الشيفت',
        actionPath: '/finance',
    },
    DAILY_STOCK_COUNT_REQUIRED_FOR_DAY_CLOSE: {
        titleEn: 'Daily stock count',
        titleAr: 'الجرد اليومي',
        readyEn: 'A posted stock count exists for this business day.',
        readyAr: 'تم ترحيل جرد يومي لهذا التاريخ.',
        actionEn: 'Post the daily stock count before closing the day.',
        actionAr: 'أدخل الجرد اليومي ورحّله قبل إقفال اليوم.',
        actionLabelEn: 'Open Inventory',
        actionLabelAr: 'افتح المخزون',
        actionPath: '/inventory',
    },
    UNPAID_ORDERS_EXIST_FOR_DAY_CLOSE: {
        titleEn: 'Unpaid orders',
        titleAr: 'طلبات غير مدفوعة',
        readyEn: 'Completed orders are paid.',
        readyAr: 'كل الطلبات المكتملة مدفوعة.',
        actionEn: 'Collect payment or fix unpaid completed orders.',
        actionAr: 'راجع الطلبات المكتملة غير المدفوعة وحصلها أو صحح حالتها.',
        actionLabelEn: 'Open Orders',
        actionLabelAr: 'افتح الطلبات',
        actionPath: '/orders',
    },
    KITCHEN_ACTIVE_FOR_DAY_CLOSE: {
        titleEn: 'Open kitchen tickets',
        titleAr: 'تيكتات مطبخ مفتوحة',
        readyEn: 'No pending, preparing, or ready kitchen tickets.',
        readyAr: 'لا توجد تيكتات مطبخ معلقة أو قيد التحضير أو جاهزة.',
        actionEn: 'Finish, hand over, or void the open kitchen tickets.',
        actionAr: 'أنهِ أو سلّم أو ألغِ تيكتات المطبخ المفتوحة.',
        actionLabelEn: 'Open Kitchen',
        actionLabelAr: 'افتح المطبخ',
        actionPath: '/kds',
    },
    VOUCHERS_PENDING_FOR_DAY_CLOSE: {
        titleEn: 'Pending vouchers',
        titleAr: 'سندات معلقة',
        readyEn: 'No vouchers awaiting approval.',
        readyAr: 'لا توجد سندات بانتظار الاعتماد.',
        actionEn: 'Approve or reject the pending treasury vouchers.',
        actionAr: 'اعتمد أو ارفض سندات الخزينة المعلقة.',
        actionLabelEn: 'Open Treasury',
        actionLabelAr: 'افتح الخزينة',
        actionPath: '/treasury',
    },
    CUSTODY_OPEN_FOR_DAY_CLOSE: {
        titleEn: 'Open custody',
        titleAr: 'عهد مفتوحة',
        readyEn: 'No unreturned custody.',
        readyAr: 'لا توجد عهد غير مسددة.',
        actionEn: 'Settle the outstanding custody holdings.',
        actionAr: 'سوِّ العهد القائمة.',
        actionLabelEn: 'Open Treasury',
        actionLabelAr: 'افتح الخزينة',
        actionPath: '/treasury',
    },
    DRIVER_CASH_OPEN_FOR_DAY_CLOSE: {
        titleEn: 'Pilot cash on hand',
        titleAr: 'نقدية مع الطيارين',
        readyEn: 'No pilot holds collected cash.',
        readyAr: 'لا يوجد طيار بحوزته نقدية محصلة.',
        actionEn: 'Collect the outstanding pilot cash before closing.',
        actionAr: 'حصّل النقدية من الطيارين قبل الإقفال.',
        actionLabelEn: 'Open Dispatch',
        actionLabelAr: 'افتح التوصيل',
        actionPath: '/dispatch',
    },
    CASH_VARIANCE_NOTE_REQUIRED_FOR_DAY_CLOSE: {
        titleEn: 'Cash variance note',
        titleAr: 'ملاحظة فرق النقدية',
        readyEn: 'Cash variance is explained in the close notes.',
        readyAr: 'فرق النقدية موثّق في ملاحظات الإغلاق.',
        actionEn: 'Write the over/short reason in the close notes below.',
        actionAr: 'اكتب سبب الزيادة أو العجز في ملاحظات الإغلاق بالأسفل.',
        actionLabelEn: 'Write Note',
        actionLabelAr: 'اكتب الملاحظة',
        actionPath: '/day-close',
    },
    DAY_ALREADY_CLOSED: {
        titleEn: 'Day status',
        titleAr: 'حالة اليوم',
        readyEn: 'This day is still open.',
        readyAr: 'هذا اليوم ما زال مفتوحا.',
        actionEn: 'This branch day is already closed and cannot be closed again.',
        actionAr: 'هذا اليوم مقفول بالفعل ولا يمكن إقفاله مرة أخرى.',
        actionLabelEn: 'View History',
        actionLabelAr: 'راجع السجل',
        actionPath: '/day-close',
    },
};

const OVERRIDE_ROLES = ['OWNER', 'GENERAL_MANAGER', 'BRANCH_MANAGER', 'FINANCE_DIRECTOR', 'COO', 'CASHIER_MANAGER'];

const DayCloseHub: React.FC = () => {
    const navigate = useNavigate();
    const { settings, branches, fetchBranches, fetchSettings, setBranchBusinessDate } = useAuthStore();
    const setShift = useFinanceStore((state) => state.setShift);
    const setIsShiftDrawerOpen = useFinanceStore((state) => state.setIsShiftDrawerOpen);
    const { confirm } = useConfirm();
    const lang = settings.language || 'en';
    const isAr = lang === 'ar';
    const currentUser = settings.currentUser;
    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

    const availableBranches = useMemo(() => {
        if (isSuperAdmin) return branches;
        if (!settings.activeBranchId) return [];
        return branches.filter((b) => b.id === settings.activeBranchId);
    }, [branches, isSuperAdmin, settings.activeBranchId]);

    const [branchId, setBranchId] = useState<string>(settings.activeBranchId || availableBranches[0]?.id || '');
    const [date, setDate] = useState<string>(todayLocalDate());
    const [report, setReport] = useState<any | null>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [notes, setNotes] = useState('');
    const [emailTo, setEmailTo] = useState('');
    const [isLoadingReport, setIsLoadingReport] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [blockedReasons, setBlockedReasons] = useState<string[]>([]);
    const [manualBusinessDate, setManualBusinessDate] = useState(todayLocalDate());
    const [isUpdatingBusinessDate, setIsUpdatingBusinessDate] = useState(false);
    const [whatsappRecipients, setWhatsappRecipients] = useState((settings.dayCloseWhatsappRecipients || []).join(', '));
    const [isSavingWhatsapp, setIsSavingWhatsapp] = useState(false);
    const [printPaper, setPrintPaper] = useState<'a4' | '80mm'>('80mm');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [showOverrideModal, setShowOverrideModal] = useState(false);
    const [overrideReason, setOverrideReason] = useState('');
    const [isOverriding, setIsOverriding] = useState(false);

    const activeBranch = useMemo(() => branches.find((branch) => branch.id === branchId), [branches, branchId]);
    const today = todayLocalDate();
    const businessDate = activeBranch?.businessDate || today;
    const isStaleBusinessDate = businessDate < today;
    const isViewingBusinessDate = date === businessDate;

    // Effective gates: server echoes `readiness.rules`; fall back to local settings.
    const rules = useMemo(() => ({
        requireStockCount: true,
        requireKitchenEmpty: true,
        requireVouchersClear: true,
        requireCustodySettled: true,
        requireDriverCash: true,
        requireVarianceNote: true,
        allowManagerOverride: true,
        ...(settings.dayCloseRules || {}),
        ...(report?.readiness?.rules || {}),
    }), [settings.dayCloseRules, report?.readiness?.rules]);

    const readinessChecks = useMemo(() => {
        return (report?.readiness?.checks || []).map((check: any) => {
            const copy = readinessCopy[check.code] || {
                titleEn: check.code,
                titleAr: check.code,
                readyEn: 'Ready',
                readyAr: 'جاهز',
                actionEn: 'Review this requirement.',
                actionAr: 'راجع هذا المتطلب.',
                actionLabelEn: 'Open',
                actionLabelAr: 'افتح',
                actionPath: check.actionPath || '/day-close',
            };
            const explicitlyBlocked = blockedReasons.includes(check.code);
            // A check blocks only when it is mandatory (blocking) and not passed.
            // Waived gates (required:false / blocking:false) never block.
            const mandatory = check.blocking === true || (check.blocking !== false && check.required !== false);
            const isBlocked = explicitlyBlocked || (mandatory && !check.passed);
            const isOptional = check.required === false || check.blocking === false;
            return { ...check, copy, isBlocked, isOptional, mandatory };
        });
    }, [report, blockedReasons]);

    const closeFailureChecks = useMemo(() => {
        if (!blockedReasons.length) return [];

        const checksFromReport = readinessChecks.filter((check: any) => blockedReasons.includes(check.code));
        const knownCodes = new Set(checksFromReport.map((check: any) => check.code));
        const syntheticChecks = blockedReasons
            .filter((code) => !knownCodes.has(code))
            .map((code) => {
                const copy = readinessCopy[code] || {
                    titleEn: code,
                    titleAr: code,
                    readyEn: 'Ready',
                    readyAr: 'جاهز',
                    actionEn: 'Review this requirement.',
                    actionAr: 'راجع هذا المتطلب.',
                    actionLabelEn: 'Open',
                    actionLabelAr: 'افتح',
                    actionPath: '/day-close',
                };
                return { code, count: 1, copy, isBlocked: true, isOptional: false, actionPath: copy.actionPath };
            });

        return [...checksFromReport, ...syntheticChecks];
    }, [blockedReasons, readinessChecks]);

    // Open shifts must NOT disable the close button: the server auto-closes them
    // (autoCloseOpenShifts). Only other blockers gate it.
    const blockingChecks = readinessChecks.filter((check: any) => check.isBlocked);
    const nonShiftBlockers = blockingChecks.filter((check: any) => check.code !== 'OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE');
    const canCloseIgnoringShifts = report?.readiness?.canClose !== false && nonShiftBlockers.length === 0;
    const hasOpenShiftBlocker = blockingChecks.some((check: any) => check.code === 'OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE');
    const isClosedDay = report?.status === 'CLOSED';
    const closedSnapshot = report?.closedSnapshot || null;
    const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

    const cashVariance = Number(report?.shiftCashSummary?.variance || 0);
    const expectedCash = Number(report?.shiftCashSummary?.expectedCash || 0);
    const actualCash = Number(report?.shiftCashSummary?.actualCash || 0);
    const varianceNeedsNote = rules.requireVarianceNote && Math.abs(cashVariance) > 0.005 && !notes.trim();

    const canOverride = useMemo(() => {
        if (rules.allowManagerOverride === false) return false;
        if (isSuperAdmin) return true;
        return OVERRIDE_ROLES.includes(String(currentUser?.role || ''));
    }, [rules.allowManagerOverride, isSuperAdmin, currentUser?.role]);

    const showOverrideButton = canOverride && !isClosedDay && isViewingBusinessDate && nonShiftBlockers.length > 0;

    // Readiness score over mandatory gates only (waived gates don't dilute it).
    const progress = useMemo(() => {
        if (!readinessChecks.length) return { done: 0, total: 0, pct: 0, empty: true };
        const mandatory = readinessChecks.filter((c: any) => c.required !== false && c.blocking !== false);
        const base = mandatory.length ? mandatory : readinessChecks;
        const done = base.filter((c: any) => !c.isBlocked).length;
        return { done, total: base.length, pct: Math.round((done / base.length) * 100), empty: false };
    }, [readinessChecks]);

    const optionalSkipped = useMemo(
        () => readinessChecks.filter((c: any) => c.isOptional && Number(c.count || 0) > 0),
        [readinessChecks],
    );

    useEffect(() => {
        if (settings.activeBranchId && branchId !== settings.activeBranchId && availableBranches.some((b) => b.id === settings.activeBranchId)) {
            setBranchId(settings.activeBranchId);
        } else if (!branchId && availableBranches[0]?.id) {
            setBranchId(availableBranches[0].id);
        }
    }, [availableBranches, branchId, settings.activeBranchId]);

    useEffect(() => {
        if (!branchId) return;
        setDate(businessDate);
        setManualBusinessDate(businessDate);
    }, [branchId, businessDate]);

    useEffect(() => {
        setWhatsappRecipients((settings.dayCloseWhatsappRecipients || []).join(', '));
    }, [settings.dayCloseWhatsappRecipients]);

    const loadReport = async (silent = false) => {
        if (!branchId || !date) return;
        if (!silent) {
            setIsLoadingReport(true);
            setError(null);
            setBlockedReasons([]);
        }
        try {
            const data = await dayCloseApi.getReport(branchId, date);
            setReport(data);
            setLastUpdated(new Date());
        } catch (e: any) {
            if (!silent) {
                setError(e?.message || 'Failed to load report');
                setReport(null);
            }
        } finally {
            if (!silent) setIsLoadingReport(false);
        }
    };

    const loadHistory = async () => {
        if (!branchId) return;
        try {
            const rows = await dayCloseApi.getHistory(branchId, 370);
            setHistory(rows || []);
        } catch (e: any) {
            setHistory([]);
            setError(e?.message || (isAr ? 'تعذر تحميل سجل إغلاق اليوم' : 'Failed to load day close history'));
        }
    };

    useEffect(() => {
        loadReport();
        loadHistory();
    }, [branchId, date]);

    // Keep numbers fresh while the manager watches the active day: silent
    // background refresh every minute (visible tab only, never mid-close).
    const loadReportRef = useRef(loadReport);
    loadReportRef.current = loadReport;
    useEffect(() => {
        if (!isViewingBusinessDate || isClosedDay) return;
        const timer = window.setInterval(() => {
            if (document.hidden) return;
            void loadReportRef.current(true);
        }, 60000);
        return () => window.clearInterval(timer);
    }, [isViewingBusinessDate, isClosedDay, branchId, date]);

    // Exact human reason the Close button is disabled (no more guessing).
    const closeBlockReason = useMemo(() => {
        if (isClosedDay) return isAr ? 'اليوم مقفل بالفعل.' : 'This day is already closed.';
        if (!isViewingBusinessDate) return isAr
            ? `أنت تعرض ${date} بينما يوم التشغيل الحالي ${businessDate}.`
            : `You are viewing ${date}, but the active business date is ${businessDate}.`;
        const pending = nonShiftBlockers.length;
        if (pending > 0) return isAr
            ? `متبقٍ ${pending} ${pending === 1 ? 'بند إلزامي' : 'بنود إلزامية'} في قائمة الجاهزية بالأسفل.`
            : `${pending} mandatory readiness item(s) in the checklist below.`;
        if (varianceNeedsNote) return isAr
            ? 'اكتب سبب فرق النقدية في ملاحظات الإغلاق أولاً.'
            : 'Explain the cash variance in the close notes first.';
        return null;
    }, [isClosedDay, isViewingBusinessDate, date, businessDate, nonShiftBlockers.length, varianceNeedsNote, isAr]);

    const doCloseRequest = async (payload: { notes?: string; overrideReason?: string }) => {
        const result = await dayCloseApi.close(branchId, date, {
            notes: payload.notes?.trim() || undefined,
            enforceShiftsClosed: true,
            autoCloseOpenShifts: true,
            overrideReason: payload.overrideReason?.trim() || undefined,
            emailConfig: settings.endOfDayEmailEnabled && settings.endOfDayEmailRecipients?.filter(isEmail).length ? {
                to: settings.endOfDayEmailRecipients.filter(isEmail),
                subject: `Day Close Report - ${date}`,
                includeReports: ['sales', 'payments', 'audit']
            } : undefined
        });
        return result;
    };

    const handleCloseDay = async () => {
        if (!branchId || !date) return;
        if (!isViewingBusinessDate) {
            setError(isAr ? `الإغلاق مسموح فقط ليوم التشغيل النشط ${businessDate}.` : `Only the active business day ${businessDate} can be closed.`);
            return;
        }
        if (isClosedDay) {
            setBlockedReasons(['DAY_ALREADY_CLOSED']);
            setError(isAr ? 'هذا اليوم مقفول بالفعل ولا يمكن إقفاله مرة أخرى.' : 'This day is already closed and cannot be closed again.');
            return;
        }
        if (!canCloseIgnoringShifts) {
            setError(isAr ? 'راجع متطلبات الجاهزية قبل إغلاق اليوم.' : 'Resolve readiness requirements before closing the day.');
            return;
        }
        // Cash variance must be explained (when the gate is enabled in settings).
        if (varianceNeedsNote) {
            setError(isAr ? `يوجد فرق نقدية (${cashVariance.toLocaleString()}) — اكتب سبب الفرق في ملاحظات الإغلاق أولاً.` : `Cash variance of ${cashVariance.toLocaleString()} needs a written reason in close notes first.`);
            return;
        }
        const confirmed = await confirm({
            title: isAr ? `تأكيد إغلاق يوم ${date}` : `Confirm day close for ${date}`,
            message: hasOpenShiftBlocker
                ? (isAr
                    ? `${buildDayCloseConfirmationMessage(report, lang)}\n\nسيتم إغلاق الشيفتات المفتوحة تلقائياً كجزء من إغلاق اليوم.`
                    : `${buildDayCloseConfirmationMessage(report, lang)}\n\nOpen shifts will be closed automatically as part of the day close.`)
                : buildDayCloseConfirmationMessage(report, lang),
            confirmText: isAr ? 'إغلاق اليوم' : 'Close day',
            cancelText: isAr ? 'إلغاء' : 'Cancel',
            variant: 'danger',
        });
        if (!confirmed) return;
        setIsClosing(true);
        setError(null);
        setMessage(null);
        setBlockedReasons([]);
        try {
            const result = await doCloseRequest({ notes });
            const queued = result.report?.whatsappDelivery?.queued || 0;
            setMessage(queued
                ? (isAr ? `تم إغلاق اليوم وإضافة التقرير لطابور واتساب (${queued}).` : `Day closed and WhatsApp report queued for ${queued} recipient(s).`)
                : (result.message || (isAr ? 'تم إغلاق اليوم بنجاح' : 'Day closed successfully')));
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
            setBlockedReasons([]);
            await loadHistory();
            await fetchBranches();
        } catch (e: any) {
            const reasons = e?.details?.blockedReasons || e?.blockedReasons || [];
            setBlockedReasons(Array.isArray(reasons) ? reasons : []);
            setError(
                e?.code === 'DAY_CLOSE_BLOCKED'
                    ? (isAr ? 'لا يمكن إغلاق اليوم قبل تنفيذ الإجراءات الإلزامية.' : 'Day close is blocked until the mandatory actions are completed.')
                    : e?.code === 'BUSINESS_DATE_MISMATCH'
                        ? (isAr ? `تاريخ التشغيل النشط هو ${e?.businessDate || e?.details?.businessDate || businessDate}. حدّث الصفحة ثم حاول مرة أخرى.` : `Active business date is ${e?.businessDate || e?.details?.businessDate || businessDate}. Refresh and try again.`)
                        : (e?.message || 'Failed to close day')
            );
        } finally {
            setIsClosing(false);
        }
    };

    const handleOverrideClose = async () => {
        if (!branchId || !date || !canOverride) return;
        if (overrideReason.trim().length < 8) {
            setError(isAr ? 'اكتب سبب التجاوز بوضوح (8 أحرف على الأقل) — يُسجل في التدقيق.' : 'Write a clear override reason (8+ characters) — it is audited.');
            return;
        }
        if (varianceNeedsNote) {
            setError(isAr ? 'اكتب سبب فرق النقدية في ملاحظات الإغلاق أولاً حتى مع التجاوز.' : 'Explain the cash variance in close notes first, even with an override.');
            return;
        }
        setIsOverriding(true);
        setError(null);
        setMessage(null);
        try {
            const result = await doCloseRequest({ notes, overrideReason: overrideReason.trim() });
            setMessage(isAr
                ? `تم الإغلاق الاستثنائي ليوم ${date} بتجاوز موثّق.`
                : `Day ${date} force-closed with a logged override.`);
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
            setShowOverrideModal(false);
            setOverrideReason('');
            setBlockedReasons([]);
            void result;
            await loadHistory();
            await fetchBranches();
            await loadReport(true);
        } catch (e: any) {
            const reasons = e?.details?.blockedReasons || e?.blockedReasons || [];
            setBlockedReasons(Array.isArray(reasons) ? reasons : []);
            setError(
                e?.code === 'DAY_CLOSE_OVERRIDE_DISABLED'
                    ? (isAr ? 'التجاوز الاستثنائي معطّل من إعدادات قفل اليوم.' : 'Manager override is disabled in day-close settings.')
                    : (e?.message || (isAr ? 'تعذر الإغلاق الاستثنائي' : 'Override close failed'))
            );
        } finally {
            setIsOverriding(false);
        }
    };

    // Reopen a wrongly-closed day (undo close): top-management only. Restores
    // auto-finalized orders to PENDING and rewinds the business date so the
    // day can be worked on again. Requires a written reason.
    const canReopenDay = isSuperAdmin || ['OWNER', 'FINANCE_DIRECTOR'].includes(String(currentUser?.role || ''));
    const [isReopening, setIsReopening] = useState(false);
    const [showReopenModal, setShowReopenModal] = useState(false);
    const [reopenReason, setReopenReason] = useState('');

    const handleReopenDay = async () => {
        if (!branchId || !date || !canReopenDay) return;
        if (reopenReason.trim().length < 3) {
            setError(isAr ? 'اكتب سبب إعادة الفتح (3 أحرف على الأقل)' : 'A reopen reason is required (3+ characters).');
            return;
        }
        setIsReopening(true);
        setError(null);
        setMessage(null);
        try {
            const result = await dayCloseApi.reopen(branchId, date, reopenReason.trim());
            setMessage(isAr
                ? `تم إعادة فتح يوم ${date}. ${result.reopenedOrders ? `أوردرات رجعت للعمل: ${result.reopenedOrders}.` : ''} ${result.dateReverted ? 'تاريخ اليوم رجع ليوم إعادة الفتح.' : ''}`
                : `Business day ${date} reopened. ${result.reopenedOrders ? `${result.reopenedOrders} order(s) back to work.` : ''} ${result.dateReverted ? 'Business date reverted to the reopened day.' : ''}`);
            setShowReopenModal(false);
            setReopenReason('');
            await loadReport();
            await loadHistory();
            await fetchBranches();
        } catch (e: any) {
            setError(
                e?.code === 'DAY_NOT_CLOSED'
                    ? (isAr ? 'هذا اليوم مش مقفول أصلًا.' : 'This day is not closed.')
                    : e?.code === 'REOPEN_REASON_REQUIRED'
                        ? (isAr ? 'سبب إعادة الفتح مطلوب.' : 'A reopen reason is required.')
                        : (e?.message || (isAr ? 'تعذرت إعادة فتح اليوم' : 'Failed to reopen day'))
            );
        } finally {
            setIsReopening(false);
        }
    };

    const handleUpdateBusinessDate = async () => {
        if (!branchId || !manualBusinessDate) return;
        if (manualBusinessDate > today) {
            setError(isAr ? 'لا يمكن ضبط تاريخ التشغيل على تاريخ مستقبلي.' : 'Business date cannot be in the future.');
            return;
        }
        const confirmed = await confirm({
            title: isAr ? 'تعديل تاريخ التشغيل' : 'Change business date',
            message: isAr
                ? `تغيير تاريخ تشغيل الفرع من ${businessDate} إلى ${manualBusinessDate}؟`
                : `Change branch business date from ${businessDate} to ${manualBusinessDate}?`,
            confirmText: isAr ? 'تعديل' : 'Update',
            cancelText: isAr ? 'إلغاء' : 'Cancel',
            variant: 'warning',
        });
        if (!confirmed) return;

        setIsUpdatingBusinessDate(true);
        setError(null);
        setMessage(null);
        try {
            await dayCloseApi.updateBusinessDate(branchId, manualBusinessDate);
            setBranchBusinessDate(branchId, manualBusinessDate);
            await fetchBranches();
            setDate(manualBusinessDate);
            setMessage(isAr ? `تم تحديث تاريخ التشغيل إلى ${manualBusinessDate}.` : `Business date updated to ${manualBusinessDate}.`);
        } catch (e: any) {
            const messages: Record<string, string> = isAr ? {
                OPEN_SHIFTS_EXIST_FOR_BUSINESS_DATE_CHANGE: 'اقفل كل الشيفتات المفتوحة قبل تعديل تاريخ التشغيل.',
                BUSINESS_DATE_ALREADY_CLOSED: 'التاريخ المطلوب مقفول بالفعل ولا يمكن تشغيله مرة أخرى.',
                FUTURE_BUSINESS_DATE_NOT_ALLOWED: 'لا يمكن اختيار تاريخ مستقبلي.',
            } : {
                OPEN_SHIFTS_EXIST_FOR_BUSINESS_DATE_CHANGE: 'Close all open shifts before changing the business date.',
                BUSINESS_DATE_ALREADY_CLOSED: 'The selected date is already closed and cannot be reopened.',
                FUTURE_BUSINESS_DATE_NOT_ALLOWED: 'A future date is not allowed.',
            };
            setError(messages[e?.code] || e?.message || 'Failed to update business date');
        } finally {
            setIsUpdatingBusinessDate(false);
        }
    };

    const handleSaveWhatsapp = async () => {
        const recipients = whatsappRecipients.split(',').map((value) => value.trim()).filter(Boolean);
        const isPhone = (value: string) => {
            const digits = value.replace(/\D/g, '');
            return /^\+?[0-9][0-9\s()-]{8,18}$/.test(value) && digits.length >= 10 && digits.length <= 15;
        };
        if (recipients.some((phone) => !isPhone(phone))) {
            setError(isAr ? 'راجع أرقام واتساب وافصل بينها بفاصلة، مع كود الدولة.' : 'Check WhatsApp numbers, separated by commas and including country code.');
            return;
        }
        setIsSavingWhatsapp(true);
        setError(null);
        try {
            await settingsApi.update('dayCloseWhatsappRecipients', recipients, 'operations');
            await fetchSettings();
            setMessage(isAr ? 'تم حفظ أرقام واتساب. سيُرسل الملخص تلقائياً بعد الإغلاق.' : 'WhatsApp recipients saved. The summary will be sent automatically after close.');
        } catch (e: any) {
            setError(e?.message || (isAr ? 'تعذر حفظ أرقام واتساب' : 'Failed to save WhatsApp recipients'));
        } finally {
            setIsSavingWhatsapp(false);
        }
    };

    const handleSendEmail = async () => {
        if (!branchId || !date || !emailTo.trim()) {
            setError(isAr ? 'أدخل بريداً واحداً على الأقل' : 'Enter at least one recipient email');
            return;
        }
        setIsSending(true);
        setError(null);
        setMessage(null);
        try {
            const to = emailTo.split(',').map((x) => x.trim()).filter(Boolean);
            if (!to.length || to.some((email) => !isEmail(email))) {
                setError(isAr ? 'راجع عناوين البريد. افصل بين كل بريد بفاصلة.' : 'Check recipient emails. Separate multiple emails with commas.');
                return;
            }
            const result = await dayCloseApi.sendEmail(branchId, date, {
                to,
                subject: `Day Close Report - ${date}`,
                includeReports: ['sales', 'payments', 'audit'],
            });
            setMessage(result.message || (isAr ? 'تم إرسال الإيميل' : 'Email sent'));
        } catch (e: any) {
            setError(e?.message || 'Failed to send email');
        } finally {
            setIsSending(false);
        }
    };

    const handlePrintReport = async () => {
        if (!branchId || !date) return;
        setError(null);
        setMessage(null);
        try {
            const blob = await dayCloseApi.getPdf(branchId, date, isAr ? 'ar' : 'en', printPaper);
            const url = URL.createObjectURL(blob);
            const win = window.open(url, '_blank');
            if (!win) {
                const link = document.createElement('a');
                link.href = url;
                link.download = `day-close-${branchId}-${date}-${printPaper}.pdf`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 30000);
                return;
            }
            setTimeout(() => {
                try {
                    win.focus();
                    win.print();
                } catch {
                    // Browser PDF viewers can block scripted print; the opened report is still printable.
                }
            }, 800);
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e: any) {
            setError(e?.message || (isAr ? 'تعذر تجهيز تقرير الطباعة' : 'Failed to prepare print report'));
        }
    };

    const handleExportReport = async (format: 'pdf' | 'xlsx') => {
        if (!branchId || !date) return;
        setError(null);
        setMessage(null);
        try {
            const reportLang = isAr ? 'ar' : 'en';
            const blob = format === 'pdf'
                ? await dayCloseApi.getPdf(branchId, date, reportLang, 'a4')
                : await dayCloseApi.getXlsx(branchId, date, reportLang);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `day-close-${branchId}-${date}.${format}`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (e: any) {
            setError(e?.message || (isAr ? 'تعذر تصدير التقرير' : 'Failed to export report'));
        }
    };

    const closedDateSet = useMemo(() => new Set(history.map((row: any) => String(row.date))), [history]);
    const calendarDays = useMemo(() => buildMonthDays(date), [date]);
    const monthLabel = parseLocalDate(date).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' });

    const openReadinessAction = async (check: any) => {
        if (check.code === 'OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE') {
            try {
                const activeShift = await shiftsApi.getActive(branchId);
                if (activeShift?.id) setShift(activeShift);
            } catch {
                // The drawer can still explain that no active shift is loaded for this user.
            }
            setIsShiftDrawerOpen(true);
            return;
        }
        if (check.code === 'CASH_VARIANCE_NOTE_REQUIRED_FOR_DAY_CLOSE') {
            document.getElementById('dayclose-notes-input')?.focus();
            document.getElementById('dayclose-notes-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        navigate(check.copy?.actionPath || check.actionPath || '/day-close');
    };

    const sales = report?.salesSummary || {};
    const statusKind = isClosedDay ? 'closed' : canCloseIgnoringShifts ? 'ready' : 'blocked';
    const ringRadius = 26;
    const ringCirc = 2 * Math.PI * ringRadius;

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-5 min-h-screen" dir={isAr ? 'rtl' : 'ltr'}>
            {/* ===== HERO: command center header (theme-aware) ===== */}
            <section className="card-primary relative overflow-hidden rounded-3xl border border-emerald-500/20 shadow-2xl">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/[0.08] via-transparent to-teal-500/[0.06]" />
                <div className="pointer-events-none absolute -top-24 -end-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-28 -start-16 h-72 w-72 rounded-full bg-teal-400/[0.07] blur-3xl" />
                <div className="relative p-5 md:p-7">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600">
                                <Sparkles size={14} />
                                {isAr ? 'مركز قيادة إغلاق اليوم' : 'Day-close command center'}
                            </div>
                            <h2 className="mt-2 text-2xl md:text-3xl font-black leading-tight text-main">
                                {isAr ? 'إغلاق اليوم' : 'Day Close'}
                                <span className="text-emerald-600"> • {activeBranch?.name || '—'}</span>
                            </h2>
                            <p className="mt-1 text-xs md:text-sm font-bold text-muted">
                                {isAr ? 'راجع الجاهزية، وثّق الفروقات، واقفل اليوم بثقة — كل خطوة موثقة.' : 'Review readiness, document variances, and close with confidence — every step audited.'}
                            </p>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black border ${statusKind === 'blocked' ? 'bg-amber-500/10 text-amber-700 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'}`}>
                                    {statusKind === 'closed' ? <Lock size={13} /> : statusKind === 'ready' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                                    {statusKind === 'closed'
                                        ? (isAr ? 'اليوم مقفل' : 'Closed')
                                        : statusKind === 'ready'
                                            ? (isAr ? 'جاهز للإغلاق' : 'Ready to close')
                                            : (isAr ? `باقي ${nonShiftBlockers.length} إجراء` : `${nonShiftBlockers.length} to go`)}
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-elevated border border-border/60 px-3 py-1.5 text-[11px] font-black text-main">
                                    <CalendarClock size={13} />
                                    {isAr ? `التشغيل: ${businessDate}` : `Business: ${businessDate}`}
                                </span>
                                {isStaleBusinessDate && (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-[11px] font-black text-amber-700">
                                        <AlertCircle size={13} />
                                        {isAr ? `اليوم الحالي ${today} — النظام على يوم قديم` : `Today is ${today} — system on an old day`}
                                    </span>
                                )}
                                {lastUpdated && (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted tabular-nums">
                                        <RefreshCw size={12} />
                                        {isAr ? 'آخر تحديث:' : 'Updated:'} {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Progress ring */}
                        <div className="flex items-center gap-4 shrink-0 rounded-2xl bg-elevated/70 border border-border/60 p-4">
                            <div className="relative h-[72px] w-[72px]">
                                <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
                                    <circle cx="32" cy="32" r={ringRadius} fill="none" stroke="rgba(140,150,160,0.25)" strokeWidth="7" />
                                    <circle
                                        cx="32" cy="32" r={ringRadius} fill="none"
                                        stroke={statusKind === 'blocked' ? '#f59e0b' : '#10b981'}
                                        strokeWidth="7" strokeLinecap="round"
                                        strokeDasharray={ringCirc}
                                        strokeDashoffset={ringCirc - (ringCirc * progress.pct) / 100}
                                        className="transition-all duration-700"
                                    />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums text-main">{progress.empty ? '…' : `${progress.pct}%`}</span>
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-muted">{isAr ? 'جاهزية الإغلاق' : 'Close readiness'}</p>
                                <p className="mt-1 text-lg font-black tabular-nums text-main">
                                    {progress.empty
                                        ? (isLoadingReport ? (isAr ? 'جارٍ التحميل…' : 'Loading…') : '—')
                                        : (<>{progress.done}<span className="text-muted">/{progress.total}</span></>)}
                                </p>
                                <p className="text-[11px] font-bold text-muted">
                                    {optionalSkipped.length > 0
                                        ? (isAr ? `${optionalSkipped.length} إجراء معفي من الإعدادات` : `${optionalSkipped.length} waived by settings`)
                                        : (isAr ? 'كل البوابات الإلزامية محسوبة' : 'All mandatory gates counted')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Controls row */}
                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_auto] gap-2.5">
                        <select
                            value={branchId}
                            onChange={(e) => setBranchId(e.target.value)}
                            disabled={!availableBranches.length}
                            className="px-3.5 py-3 rounded-2xl bg-elevated border border-border/60 font-bold text-sm text-main outline-none focus:border-emerald-500/60"
                            aria-label={isAr ? 'الفرع' : 'Branch'}
                        >
                            {!availableBranches.length && (
                                <option value="">{isAr ? 'لا توجد فروع متاحة' : 'No branches available'}</option>
                            )}
                            {availableBranches.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            style={{ colorScheme: settings.isDarkMode ? 'dark' : 'light' }}
                            className="px-3.5 py-3 rounded-2xl bg-elevated border border-border/60 font-bold text-sm text-main outline-none focus:border-emerald-500/60"
                            aria-label={isAr ? 'التاريخ' : 'Date'}
                        />
                        <button
                            onClick={() => void loadReport()}
                            disabled={isLoadingReport}
                            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-elevated border border-border/60 text-main font-black text-xs uppercase tracking-widest hover:bg-primary/10 transition disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={isLoadingReport ? 'animate-spin' : ''} />
                            {isLoadingReport ? (isAr ? 'تحميل...' : 'Loading...') : (isAr ? 'تحديث' : 'Refresh')}
                        </button>
                        <button
                            onClick={handleCloseDay}
                            disabled={isClosing || isClosedDay || !canCloseIgnoringShifts || !isViewingBusinessDate || varianceNeedsNote}
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-600/25 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-45 disabled:saturate-50"
                            title={closeBlockReason || undefined}
                        >
                            <Lock size={14} />
                            {isClosing ? (isAr ? 'جارٍ الإغلاق...' : 'Closing...') : (isAr ? 'إغلاق اليوم' : 'Close Day')}
                        </button>
                    </div>
                    {(closeBlockReason || !isViewingBusinessDate) && !isClosedDay && (
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold text-amber-700">
                            {closeBlockReason && !isClosing && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Info size={14} />
                                    {closeBlockReason}
                                </span>
                            )}
                            {!isViewingBusinessDate && (
                                <button
                                    type="button"
                                    onClick={() => { setDate(businessDate); setManualBusinessDate(businessDate); }}
                                    className="font-black text-emerald-700 underline underline-offset-4 hover:text-emerald-600"
                                >
                                    {isAr ? `الرجوع ليوم التشغيل (${businessDate})` : `Back to business date (${businessDate})`}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </section>

            {isClosedDay && (
                <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm font-bold text-emerald-700 flex flex-wrap items-center gap-3">
                    <CheckCircle2 size={20} className="shrink-0" />
                    <span className="flex-1 min-w-[200px]">
                        {isAr
                            ? `تم إقفال يوم ${date}. هذه نسخة محفوظة للمراجعة والطباعة فقط.`
                            : `Business day ${date} is closed. This is a saved review snapshot and cannot be closed again.`}
                    </span>
                    {canReopenDay && (
                        <button
                            type="button"
                            onClick={() => { setShowReopenModal(true); setReopenReason(''); setError(null); }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-white px-3.5 py-2 text-[11px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100 transition active:scale-95"
                        >
                            <RotateCcw size={12} />
                            {isAr ? 'إعادة فتح اليوم' : 'Reopen day'}
                        </button>
                    )}
                </div>
            )}

            {/* ===== KPI STRIP ===== */}
            <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="card-primary rounded-3xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 start-0 h-1 w-full bg-gradient-to-l from-emerald-400 to-teal-400" />
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black uppercase tracking-widest text-muted">{isAr ? 'إيراد اليوم' : 'Revenue'}</p>
                        <span className="rounded-xl bg-emerald-500/10 text-emerald-600 p-2"><TrendingUp size={16} /></span>
                    </div>
                    <p className="mt-2 text-2xl font-black text-main tabular-nums">{Number(sales.totalRevenue || 0).toLocaleString()}</p>
                    <p className="mt-1 text-[11px] font-bold text-muted">{isAr ? `الصافي: ${Number(sales.netSales || 0).toLocaleString()}` : `Net: ${Number(sales.netSales || 0).toLocaleString()}`}</p>
                </div>
                <div className="card-primary rounded-3xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 start-0 h-1 w-full bg-gradient-to-l from-indigo-400 to-violet-400" />
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black uppercase tracking-widest text-muted">{isAr ? 'الطلبات' : 'Orders'}</p>
                        <span className="rounded-xl bg-indigo-500/10 text-indigo-600 p-2"><Receipt size={16} /></span>
                    </div>
                    <p className="mt-2 text-2xl font-black text-main tabular-nums">{Number(sales.totalOrders || 0).toLocaleString()}</p>
                    <p className="mt-1 text-[11px] font-bold text-muted">{isAr ? `ضريبة: ${Number(sales.totalTax || 0).toLocaleString()} • خصم: ${Number(sales.totalDiscount || 0).toLocaleString()}` : `Tax: ${Number(sales.totalTax || 0).toLocaleString()} • Disc: ${Number(sales.totalDiscount || 0).toLocaleString()}`}</p>
                </div>
                <div className="card-primary rounded-3xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 start-0 h-1 w-full bg-gradient-to-l from-sky-400 to-cyan-400" />
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black uppercase tracking-widest text-muted">{isAr ? 'النقدية' : 'Cash drawer'}</p>
                        <span className="rounded-xl bg-sky-500/10 text-sky-600 p-2"><Wallet size={16} /></span>
                    </div>
                    <p className="mt-2 text-2xl font-black text-main tabular-nums">{actualCash.toLocaleString()}<span className="text-xs text-muted font-bold"> / {expectedCash.toLocaleString()}</span></p>
                    <p className="mt-1 text-[11px] font-bold text-muted">{isAr ? 'فعلي / متوقع' : 'Actual / expected'}</p>
                </div>
                <div className={`rounded-3xl p-5 relative overflow-hidden border ${Math.abs(cashVariance) > 0.005 ? (cashVariance > 0 ? 'border-sky-500/30 bg-sky-500/5' : 'border-rose-500/30 bg-rose-500/5') : 'card-primary'}`}>
                    <div className={`absolute top-0 start-0 h-1 w-full bg-gradient-to-l ${Math.abs(cashVariance) > 0.005 ? (cashVariance > 0 ? 'from-sky-400 to-cyan-400' : 'from-rose-400 to-orange-400') : 'from-emerald-400 to-teal-400'}`} />
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black uppercase tracking-widest text-muted">{isAr ? 'فرق النقدية' : 'Cash variance'}</p>
                        <span className={`rounded-xl p-2 ${Math.abs(cashVariance) > 0.005 ? (cashVariance > 0 ? 'bg-sky-500/10 text-sky-600' : 'bg-rose-500/10 text-rose-600') : 'bg-emerald-500/10 text-emerald-600'}`}>
                            {cashVariance > 0.005 ? <TrendingUp size={16} /> : cashVariance < -0.005 ? <TrendingDown size={16} /> : <Scale size={16} />}
                        </span>
                    </div>
                    <p className={`mt-2 text-2xl font-black tabular-nums ${Math.abs(cashVariance) > 0.005 ? (cashVariance > 0 ? 'text-sky-600' : 'text-rose-600') : 'text-main'}`}>
                        {cashVariance > 0 ? '+' : ''}{cashVariance.toLocaleString()}
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-muted">
                        {Math.abs(cashVariance) <= 0.005
                            ? (isAr ? 'مطابق — لا يلزم توثيق' : 'Matched — no note needed')
                            : rules.requireVarianceNote
                                ? (isAr ? 'يلزم توثيق السبب في الملاحظات' : 'Must be explained in notes')
                                : (isAr ? 'معفي من التوثيق (الإعدادات)' : 'Note waived by settings')}
                    </p>
                </div>
            </section>

            {/* ===== MAIN GRID ===== */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5 items-start">
                <div className="space-y-5 min-w-0">
                    {/* ===== Readiness checklist ===== */}
                    <section className="card-primary rounded-3xl p-5 md:p-6">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-main flex items-center gap-2">
                                    <ClipboardCheck size={16} className="text-emerald-600" />
                                    {isAr ? 'قائمة جاهزية الإقفال' : 'Close Readiness Checklist'}
                                </h3>
                                <p className="text-xs font-bold text-muted mt-1.5">
                                    {canCloseIgnoringShifts
                                        ? (hasOpenShiftBlocker
                                            ? (isAr ? 'جاهز — سيتم إغلاق الشيفتات المفتوحة تلقائياً مع الإقفال.' : 'Ready — open shifts will auto-close with the day.')
                                            : (isAr ? 'كل المتطلبات الإلزامية مكتملة. يمكنك إقفال اليوم.' : 'All mandatory checks are complete. You can close the day.'))
                                        : (isAr ? 'أكمل البنود الإلزامية ثم حدّث التقرير قبل الإقفال.' : 'Complete mandatory items, then refresh the report before closing.')}
                                </p>
                            </div>
                            <span className={`self-start sm:self-center text-xs font-black px-3 py-1.5 rounded-full ${canCloseIgnoringShifts ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                                {canCloseIgnoringShifts ? (isAr ? 'جاهز' : 'READY') : (isAr ? 'مطلوب إجراء' : 'ACTION NEEDED')}
                            </span>
                        </div>

                        {optionalSkipped.length > 0 && (
                            <div className="mt-3 rounded-2xl border border-sky-500/25 bg-sky-500/5 px-4 py-2.5 text-[11px] font-bold text-sky-700 flex items-center gap-2">
                                <Info size={14} className="shrink-0" />
                                {isAr
                                    ? `معفي من الإعدادات (لن يمنع القفل): ${optionalSkipped.map((c: any) => isAr ? c.copy.titleAr : c.copy.titleEn).join('، ')}`
                                    : `Waived by settings (won't block): ${optionalSkipped.map((c: any) => c.copy.titleEn).join(', ')}`}
                            </div>
                        )}

                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {readinessChecks.map((check: any) => (
                                <div
                                    key={check.code}
                                    className={`flex items-start gap-3 rounded-2xl border p-3.5 transition ${check.isBlocked ? 'border-amber-300 bg-amber-50/70' : check.isOptional && Number(check.count || 0) > 0 ? 'border-sky-200 bg-sky-50/60' : 'border-emerald-200 bg-emerald-50/60'}`}
                                >
                                    <div className={`mt-0.5 ${check.isBlocked ? 'text-amber-600' : check.isOptional && Number(check.count || 0) > 0 ? 'text-sky-600' : 'text-emerald-600'}`}>
                                        {check.isBlocked ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                            <div>
                                                <p className="font-black text-sm text-main">
                                                    {isAr ? check.copy.titleAr : check.copy.titleEn}
                                                </p>
                                                <p className="text-xs font-bold text-muted mt-1">
                                                    {check.isBlocked
                                                        ? (isAr ? check.copy.actionAr : check.copy.actionEn)
                                                        : (isAr ? check.copy.readyAr : check.copy.readyEn)}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 text-[11px] font-black px-2 py-1 rounded-full ${check.isBlocked ? 'bg-white text-amber-800' : check.isOptional && Number(check.count || 0) > 0 ? 'bg-white text-sky-700' : 'bg-white text-emerald-700'}`}>
                                                {check.isBlocked
                                                    ? `${check.count || 0} ${isAr ? 'معلق' : 'pending'}`
                                                    : check.isOptional && Number(check.count || 0) > 0
                                                        ? (isAr ? `اختياري (${check.count})` : `Optional (${check.count})`)
                                                        : (isAr ? 'تم' : 'Done')}
                                            </span>
                                        </div>
                                        {(check.isBlocked || (check.isOptional && Number(check.count || 0) > 0)) && (
                                            <div className="mt-3 space-y-2">
                                                <button
                                                    type="button"
                                                    onClick={() => { void openReadinessAction(check); }}
                                                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-700 transition"
                                                >
                                                    {isAr ? check.copy.actionLabelAr : check.copy.actionLabelEn}
                                                    <ExternalLink size={14} />
                                                </button>
                                                {check.code === 'OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE' && (check.openShifts || report?.readiness?.openShifts || report?.openShifts || []).length > 0 && (
                                                    <div className="mt-3 space-y-2 border-t border-amber-300/60 pt-2">
                                                        <p className="text-[11px] font-black text-amber-950 uppercase">
                                                            {isAr ? 'الشيفتات المفتوحة حالياً:' : 'Currently Open Shifts:'}
                                                        </p>
                                                        {(check.openShifts || report?.readiness?.openShifts || report?.openShifts || []).map((s: any) => (
                                                            <div key={s.id} className="flex items-center justify-between bg-white/95 p-2.5 rounded-xl border border-amber-300/60 text-xs shadow-sm">
                                                                <div>
                                                                    <p className="font-black text-main">{s.userName || s.userId}</p>
                                                                    <p className="text-[10px] text-muted font-bold mt-0.5">
                                                                        {isAr ? 'وقت الفتح' : 'Opened'}: {new Date(s.openingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} | {isAr ? 'الافتتاحي' : 'Float'}: {Number(s.openingBalance || 0).toFixed(2)}
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setShift({
                                                                            id: s.id,
                                                                            branchId,
                                                                            userId: s.userId,
                                                                            status: 'OPEN',
                                                                            openingBalance: Number(s.openingBalance || 0),
                                                                            openingTime: s.openingTime,
                                                                        });
                                                                        setIsShiftDrawerOpen(true);
                                                                    }}
                                                                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase shadow-sm"
                                                                >
                                                                    {isAr ? 'تسوية وإغلاق' : 'Close'}
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {showOverrideButton && (
                            <div className="mt-4 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                                <span className="rounded-xl bg-violet-600/15 text-violet-600 p-2.5 self-start"><ShieldAlert size={18} /></span>
                                <div className="flex-1">
                                    <p className="text-sm font-black text-main">{isAr ? 'إغلاق استثنائي بتجاوز موثّق' : 'Force-close with logged override'}</p>
                                    <p className="text-[11px] font-bold text-muted mt-1">
                                        {isAr
                                            ? `كمدير يمكنك تجاوز ${nonShiftBlockers.length} بنود متبقية بشرط كتابة سبب واضح — يُسجل في التدقيق.`
                                            : `As a manager you may overrule ${nonShiftBlockers.length} remaining item(s) with a written reason — fully audited.`}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setShowOverrideModal(true); setOverrideReason(''); setError(null); }}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-violet-700 active:scale-95 transition shrink-0"
                                >
                                    <Flag size={13} />
                                    {isAr ? 'تجاوز وإغلاق' : 'Override & close'}
                                </button>
                            </div>
                        )}
                    </section>

                    {/* ===== Summaries ===== */}
                    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="card-primary rounded-3xl p-5">
                            <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-3">{isAr ? 'ملخص المبيعات' : 'Sales Summary'}</h3>
                            <div className="space-y-2 text-sm font-bold">
                                <p>{isAr ? 'الطلبات:' : 'Orders:'} {report?.salesSummary?.totalOrders ?? 0}</p>
                                <p>{isAr ? 'الإيراد:' : 'Revenue:'} {(report?.salesSummary?.totalRevenue ?? 0).toLocaleString()}</p>
                                <p>{isAr ? 'الصافي:' : 'Net Sales:'} {(report?.salesSummary?.netSales ?? 0).toLocaleString()}</p>
                                <p>{isAr ? 'الضريبة:' : 'Tax:'} {(report?.salesSummary?.totalTax ?? 0).toLocaleString()}</p>
                                <p>{isAr ? 'الخصومات:' : 'Discounts:'} {(report?.salesSummary?.totalDiscount ?? 0).toLocaleString()}</p>
                                {(report?.cancelledPaidSummary?.orders ?? 0) > 0 && (
                                    <p className="text-amber-600">{isAr ? 'ملغي-مدفوع (بالخزنة خارج الإيراد):' : 'Cancelled-paid (in drawer, out of revenue):'} {report.cancelledPaidSummary.orders} / {(report.cancelledPaidSummary.total ?? 0).toLocaleString()}</p>
                                )}
                                {(report?.driverCashOutstanding || []).length > 0 && (
                                    <div className="pt-1">
                                        <p className="text-violet-600">{isAr ? 'عهدة طيارين (خارج الدرج):' : 'Driver pocket cash (out of drawer):'}</p>
                                        {(report.driverCashOutstanding || []).map((d: any) => (
                                            <p key={d.driverId} className="text-xs font-bold text-main flex justify-between">
                                                <span>{d.driverName}</span>
                                                <span className="tabular-nums">{Number(d.outstanding || 0).toLocaleString()}</span>
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card-primary rounded-3xl p-5">
                            <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-3">{isAr ? 'الحالة الضريبية' : 'Fiscal Health'}</h3>
                            <div className="space-y-2 text-sm font-bold">
                                <p>{isAr ? 'Submitted:' : 'Submitted:'} {report?.fiscalHealth?.submitted ?? 0}</p>
                                <p>{isAr ? 'Pending:' : 'Pending:'} {report?.fiscalHealth?.pending ?? 0}</p>
                                <p>{isAr ? 'Failed:' : 'Failed:'} {report?.fiscalHealth?.failed ?? 0}</p>
                                <p>{isAr ? 'Dead Letters:' : 'Dead Letters:'} {report?.fiscalHealth?.deadLettersPending ?? 0}</p>
                            </div>
                            <div className="mt-4 pt-3 border-t border-border/40">
                                <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-2">{isAr ? 'التدقيق' : 'Audit Summary'}</h3>
                                <div className="space-y-1.5 text-sm font-bold">
                                    <p>{isAr ? 'إجمالي الأحداث:' : 'Total Events:'} {report?.auditSummary?.totalEvents ?? 0}</p>
                                    <p>{isAr ? 'إلغاء:' : 'Voids:'} {report?.auditSummary?.voidCount ?? 0}</p>
                                    <p>{isAr ? 'خصومات:' : 'Discounts:'} {report?.auditSummary?.discountCount ?? 0}</p>
                                    <p>{isAr ? 'مرتجعات:' : 'Refunds:'} {report?.auditSummary?.refundCount ?? 0}</p>
                                </div>
                            </div>
                        </div>

                        <div className="card-primary rounded-3xl p-5 md:col-span-2 border-indigo-500/20">
                            <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-3">{isAr ? 'الكول سنتر والقنوات (شامل في قفل الفرع)' : 'Call Center & Channels (included in branch close)'}</h3>
                            <div className="space-y-2 text-sm font-bold">
                                <p>{isAr ? 'طلبات الكول سنتر:' : 'Call-center orders:'} {report?.callCenterSummary?.orders ?? 0} / {(report?.callCenterSummary?.revenue ?? 0).toLocaleString()}</p>
                                <p>{isAr ? 'منها منصات:' : 'Of which platforms:'} {report?.callCenterSummary?.platformOrders ?? 0} / {(report?.callCenterSummary?.platformRevenue ?? 0).toLocaleString()}</p>
                                <div className="pt-2 space-y-1.5 max-h-40 overflow-y-auto">
                                    {(report?.channelBreakdown || []).map((row: any) => (
                                        <div key={row.source} className="flex items-center justify-between text-xs font-bold border-b border-border/30 pb-1.5">
                                            <span className="uppercase tracking-widest">{row.source}</span>
                                            <span>{row.count} / {(row.total || 0).toLocaleString()}</span>
                                        </div>
                                    ))}
                                    {(!report?.channelBreakdown || report.channelBreakdown.length === 0) && (
                                        <p className="text-xs text-muted font-bold">{isAr ? 'لا توجد تفصيلة قنوات لهذا اليوم' : 'No channel split for this day'}</p>
                                    )}
                                </div>
                                <p className="text-[11px] text-muted font-bold pt-1">{isAr ? 'لا يوجد قفل منفصل للكول سنتر — قفل الفرع يشمله تلقائياً.' : 'No separate call-center close — the branch close includes it.'}</p>
                            </div>
                        </div>
                    </section>

                    {closedSnapshot && (
                        <section className="card-primary rounded-3xl p-5">
                            <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-4">
                                {isAr ? 'نظرة شاملة محفوظة لليوم' : 'Saved Operational Day Snapshot'}
                            </h3>
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                                <div className="rounded-2xl bg-elevated border border-border/50 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">{isAr ? 'الطلبات' : 'Orders'}</p>
                                    <p className="text-2xl font-black text-main mt-2 tabular-nums">{closedSnapshot.orders?.total ?? report?.salesSummary?.totalOrders ?? 0}</p>
                                    <p className="text-xs font-bold text-muted mt-1">{isAr ? 'توزيع الحالات محفوظ' : 'Status breakdown saved'}</p>
                                </div>
                                <div className="rounded-2xl bg-elevated border border-border/50 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">{isAr ? 'المخزون' : 'Inventory'}</p>
                                    <p className="text-2xl font-black text-main mt-2 tabular-nums">{closedSnapshot.inventory?.currentStock?.itemCount ?? 0}</p>
                                    <p className="text-xs font-bold text-muted mt-1">{isAr ? 'منخفض: ' : 'Low stock: '}{closedSnapshot.inventory?.currentStock?.lowStockCount ?? 0}</p>
                                </div>
                                <div className="rounded-2xl bg-elevated border border-border/50 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">{isAr ? 'حركات المخزون' : 'Stock Movements'}</p>
                                    <p className="text-2xl font-black text-main mt-2 tabular-nums">{closedSnapshot.inventory?.movements?.length ?? 0}</p>
                                    <p className="text-xs font-bold text-muted mt-1">{isAr ? 'أنواع حركات اليوم' : 'Movement types today'}</p>
                                </div>
                                <div className="rounded-2xl bg-elevated border border-border/50 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">{isAr ? 'فرق الشيفتات' : 'Shift Variance'}</p>
                                    <p className="text-2xl font-black text-main mt-2 tabular-nums">{(closedSnapshot.shifts?.variance ?? 0).toLocaleString()}</p>
                                    <p className="text-xs font-bold text-muted mt-1">{isAr ? 'فرق النقدية المحفوظ' : 'Saved cash variance'}</p>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <div className="rounded-2xl bg-elevated border border-border/50 p-4">
                                    <p className="text-xs font-black uppercase tracking-widest text-muted mb-3">{isAr ? 'الطلبات حسب الحالة' : 'Orders by Status'}</p>
                                    <div className="space-y-2">
                                        {(closedSnapshot.orders?.byStatus || []).map((row: any) => (
                                            <div key={row.status} className="flex items-center justify-between text-sm font-bold">
                                                <span>{row.status}</span>
                                                <span>{row.count} / {(row.total || 0).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="rounded-2xl bg-elevated border border-border/50 p-4">
                                    <p className="text-xs font-black uppercase tracking-widest text-muted mb-3">{isAr ? 'حركات المخزون' : 'Inventory Movements'}</p>
                                    <div className="space-y-2">
                                        {(closedSnapshot.inventory?.movements || []).map((row: any) => (
                                            <div key={row.type} className="flex items-center justify-between text-sm font-bold">
                                                <span>{row.type}</span>
                                                <span>{row.count} / {(row.quantity || 0).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="rounded-2xl bg-elevated border border-border/50 p-4">
                                    <p className="text-xs font-black uppercase tracking-widest text-muted mb-3">{isAr ? 'الشيفتات' : 'Shifts'}</p>
                                    <div className="space-y-2">
                                        {(closedSnapshot.shifts?.byStatus || []).map((row: any) => (
                                            <div key={row.status} className="flex items-center justify-between text-sm font-bold">
                                                <span>{row.status}</span>
                                                <span>{row.count} / {(row.variance || 0).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                </div>

                {/* ===== SIDE COLUMN ===== */}
                <aside className="space-y-5 xl:sticky xl:top-4">
                    {/* Close panel */}
                    <section className="card-primary rounded-3xl p-5 border-emerald-500/20">
                        <h3 className="text-sm font-black uppercase tracking-widest text-main flex items-center gap-2">
                            <Banknote size={16} className="text-emerald-600" />
                            {isAr ? 'توثيق وإغلاق' : 'Document & close'}
                        </h3>
                        <label htmlFor="dayclose-notes-input" className="mt-3 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-muted">
                            <span>{isAr ? 'ملاحظات الإغلاق' : 'Close notes'}</span>
                            {rules.requireVarianceNote && Math.abs(cashVariance) > 0.005 && (
                                <span className="text-rose-600">{isAr ? 'إجبارية — فرق نقدية' : 'Required — variance'}</span>
                            )}
                        </label>
                        <textarea
                            id="dayclose-notes-input"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder={isAr ? 'سبب الزيادة / العجز أو أي ملاحظة عن اليوم…' : 'Over/short reason or any note about the day…'}
                            className={`mt-2 w-full rounded-2xl border bg-elevated px-3.5 py-3 text-sm font-bold outline-none resize-none focus:border-emerald-500/60 ${varianceNeedsNote ? 'border-rose-400/70' : 'border-border/50'}`}
                        />
                        <div className="mt-1.5 flex items-center justify-between text-[10px] font-bold text-muted">
                            <span>{varianceNeedsNote ? (isAr ? 'اكتب سبب الفرق لتفعيل زر الإغلاق' : 'Explain the variance to enable closing') : (isAr ? 'اختياري عند تطابق النقدية' : 'Optional when cash matches')}</span>
                            <span className="tabular-nums">{notes.length}/500</span>
                        </div>
                        <button
                            onClick={handleCloseDay}
                            disabled={isClosing || isClosedDay || !canCloseIgnoringShifts || !isViewingBusinessDate || varianceNeedsNote}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 px-4 py-3.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-500/25 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-40"
                        >
                            <Lock size={14} />
                            {isClosing ? (isAr ? 'جارٍ الإغلاق...' : 'Closing...') : (isAr ? 'تأكيد إغلاق اليوم' : 'Confirm close day')}
                        </button>
                        {showOverrideButton ? (
                            <button
                                type="button"
                                onClick={() => { setShowOverrideModal(true); setOverrideReason(''); setError(null); }}
                                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-500/40 bg-violet-500/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-violet-700 hover:bg-violet-500/20 active:scale-[0.99] transition"
                            >
                                <ShieldAlert size={14} />
                                {isAr ? 'إغلاق استثنائي (تجاوز)' : 'Override close'}
                            </button>
                        ) : (
                            !canOverride && nonShiftBlockers.length > 0 && !isClosedDay && (
                                <p className="mt-2 flex items-start gap-1.5 text-[11px] font-bold text-muted">
                                    <ShieldCheck size={13} className="mt-0.5 shrink-0" />
                                    {isAr ? 'التجاوز الاستثنائي متاح للمديرين فقط.' : 'Override close is available to managers only.'}
                                </p>
                            )
                        )}
                        <div className="mt-3 flex items-center gap-2">
                            <select value={printPaper} onChange={(e) => setPrintPaper(e.target.value as 'a4' | '80mm')} className="rounded-xl border border-border/50 bg-elevated px-2.5 py-2.5 text-xs font-black" aria-label={isAr ? 'مقاس ورق الطباعة' : 'Print paper size'}>
                                <option value="80mm">80 mm</option>
                                <option value="a4">A4</option>
                            </select>
                            <button onClick={handlePrintReport} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-700 px-3 py-2.5 text-white font-black text-[11px] uppercase tracking-widest hover:bg-slate-600 transition">
                                <Printer size={13} />
                                {isAr ? 'طباعة' : 'Print'}
                            </button>
                            <button onClick={() => handleExportReport('pdf')} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-3 py-2.5 text-white font-black text-[11px] uppercase tracking-widest hover:bg-blue-600 transition">
                                <FileDown size={13} />
                                PDF
                            </button>
                            <button onClick={() => handleExportReport('xlsx')} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2.5 text-white font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 transition">
                                <FileDown size={13} />
                                Excel
                            </button>
                        </div>
                    </section>

                    {/* Business date */}
                    <section className={`rounded-3xl border p-5 ${isStaleBusinessDate ? 'border-amber-300 bg-amber-50/60' : 'card-primary'}`}>
                        <h3 className="text-sm font-black uppercase tracking-widest text-main flex items-center gap-2">
                            <CalendarClock size={15} className={isStaleBusinessDate ? 'text-amber-600' : 'text-emerald-600'} />
                            {isAr ? 'تاريخ التشغيل' : 'Business date'}
                        </h3>
                        <p className="mt-1 text-xs font-bold text-muted">
                            {isStaleBusinessDate
                                ? (isAr ? `تنبيه: اليوم الحالي ${today} والنظام على يوم قديم.` : `Warning: today is ${today}; system on an old day.`)
                                : (isAr ? 'مطابق لليوم الحالي.' : 'Matches today.')}
                        </p>
                        <div className="mt-3 flex gap-2">
                            <input type="date" max={today} value={manualBusinessDate} onChange={(e) => setManualBusinessDate(e.target.value)} className="flex-1 min-w-0 rounded-xl border border-border/50 bg-elevated px-3 py-2.5 text-sm font-black" aria-label={isAr ? 'تاريخ التشغيل الجديد' : 'New business date'} />
                            <button type="button" onClick={handleUpdateBusinessDate} disabled={isUpdatingBusinessDate || manualBusinessDate === businessDate} className="rounded-xl bg-slate-900 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40 hover:bg-slate-700 transition shrink-0">
                                {isUpdatingBusinessDate ? (isAr ? 'حفظ…' : 'Saving…') : (isAr ? 'تعديل' : 'Set')}
                            </button>
                        </div>
                    </section>

                    {/* Comms */}
                    <section className="card-primary rounded-3xl p-5 space-y-4">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-widest text-muted flex items-center gap-2">
                                <Mail size={14} />
                                {isAr ? 'إرسال التقرير بالإيميل' : 'Email report'}
                            </h3>
                            <div className="mt-2.5 flex gap-2">
                                <input
                                    value={emailTo}
                                    onChange={(e) => setEmailTo(e.target.value)}
                                    placeholder={isAr ? 'إيميلات مفصولة بفاصلة' : 'Comma-separated emails'}
                                    className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-elevated border border-border/50 font-bold text-sm"
                                />
                                <button
                                    onClick={handleSendEmail}
                                    disabled={isSending}
                                    className="rounded-xl bg-indigo-600 px-4 py-2.5 text-white font-black text-[11px] uppercase tracking-widest disabled:opacity-50 hover:bg-indigo-500 transition shrink-0"
                                >
                                    {isSending ? '…' : (isAr ? 'إرسال' : 'Send')}
                                </button>
                            </div>
                        </div>
                        <div className="border-t border-border/40 pt-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-muted flex items-center gap-2">
                                <MessageCircle size={14} />
                                {isAr ? 'ملخص واتساب تلقائي' : 'Auto WhatsApp summary'}
                            </h3>
                            <div className="mt-2.5 flex gap-2">
                                <input value={whatsappRecipients} onChange={(e) => setWhatsappRecipients(e.target.value)} placeholder="+2010…, +2011…" className="flex-1 min-w-0 rounded-xl border border-border/50 bg-elevated px-3 py-2.5 font-bold text-sm" />
                                <button type="button" onClick={handleSaveWhatsapp} disabled={isSavingWhatsapp} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-50 hover:bg-emerald-600 transition shrink-0">
                                    {isSavingWhatsapp ? '…' : (isAr ? 'حفظ' : 'Save')}
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Calendar */}
                    <section className="card-primary rounded-3xl p-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-xs font-black uppercase tracking-widest text-muted">
                                {isAr ? `أيام الإغلاق - ${monthLabel}` : `Closed days - ${monthLabel}`}
                            </p>
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-emerald-700">
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                {isAr ? 'مقفل' : 'Closed'}
                            </span>
                        </div>
                        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-black text-muted">
                            {(isAr ? ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map((dayName, index) => (
                                <span key={`${dayName}-${index}`} className="py-1">{dayName}</span>
                            ))}
                        </div>
                        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
                            {calendarDays.map((item) => {
                                if (!item.day) return <span key={item.key} className="h-9" />;
                                const isClosed = closedDateSet.has(item.key);
                                const isSelected = item.key === date;
                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => setDate(item.key)}
                                        className={`h-9 rounded-lg text-xs font-black transition-colors ${isClosed
                                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                            : 'bg-elevated text-main hover:bg-primary/10'
                                            } ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : ''}`}
                                        title={isClosed ? (isAr ? 'يوم مقفل' : 'Closed day') : undefined}
                                    >
                                        {item.day}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* History */}
                    <section className="card-primary rounded-3xl p-5">
                        <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-3 flex items-center gap-2">
                            {isAr ? 'سجل الإغلاق' : 'Close History'}
                            <span className="ms-auto rounded-full bg-elevated px-2 py-0.5 text-[10px] font-black text-muted tabular-nums">{history.length}</span>
                        </h3>
                        {history.length === 0 && (
                            <p className="text-sm text-muted font-bold">{isAr ? 'لا يوجد سجل حتى الآن' : 'No history yet'}</p>
                        )}
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {history.map((row) => (
                                <button
                                    key={row.id}
                                    type="button"
                                    onClick={() => setDate(row.date)}
                                    className="w-full p-3 rounded-xl bg-elevated border border-border/50 flex items-center justify-between text-sm text-start hover:border-primary/40 hover:bg-primary/5 transition-colors"
                                >
                                    <div>
                                        <p className="font-black tabular-nums">{row.date}</p>
                                        <p className="text-muted font-bold text-xs">{isAr ? 'بواسطة:' : 'By:'} {row.closedBy}</p>
                                    </div>
                                    <div className="text-end font-bold text-xs">
                                        <p>{isAr ? 'الطلبات:' : 'Orders:'} {row.summary?.totalOrders ?? 0}</p>
                                        <p>{isAr ? 'الصافي:' : 'Net:'} {(row.summary?.netSales ?? 0).toLocaleString()}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>
                </aside>
            </div>

            {error && (
                <div role="alert" className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm">
                    <div className="flex items-start gap-3">
                        <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-600" />
                        <div className="min-w-0 flex-1">
                            <p className="font-black text-rose-800">{error}</p>
                            {closeFailureChecks.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    <p className="text-xs font-black uppercase tracking-widest text-rose-700">
                                        {isAr ? 'الإجراءات المطلوبة' : 'Required actions'}
                                    </p>
                                    {closeFailureChecks.map((check: any) => (
                                        <div key={check.code} className="flex flex-col gap-2 rounded-xl bg-white/80 p-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <p className="font-black text-main">
                                                    {isAr ? check.copy.titleAr : check.copy.titleEn}
                                                </p>
                                                <p className="mt-1 text-xs font-bold text-muted">
                                                    {isAr ? check.copy.actionAr : check.copy.actionEn}
                                                    {check.count ? ` (${check.count})` : ''}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { void openReadinessAction(check); }}
                                                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-widest text-white"
                                            >
                                                {isAr ? check.copy.actionLabelAr : check.copy.actionLabelEn}
                                                <ExternalLink size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {message && <p aria-live="polite" className="text-emerald-600 text-sm font-bold flex items-center gap-2"><CheckCircle2 size={16} />{message}</p>}

            {/* ===== Override modal ===== */}
            {showOverrideModal && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !isOverriding && setShowOverrideModal(false)}>
                    <div className="relative w-full max-w-md rounded-3xl border border-violet-500/30 bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()} dir={isAr ? 'rtl' : 'ltr'}>
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-wider text-main flex items-center gap-2">
                                <ShieldAlert size={16} className="text-violet-600" />
                                {isAr ? `إغلاق استثنائي ليوم ${date}` : `Override close for ${date}`}
                            </h3>
                            <button type="button" onClick={() => !isOverriding && setShowOverrideModal(false)} className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-main" aria-label={isAr ? 'إغلاق' : 'Close'}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-3 text-xs font-bold text-amber-900 leading-6">
                            {isAr
                                ? `سيتم تجاوز ${nonShiftBlockers.length} بنود: ${nonShiftBlockers.map((c: any) => c.copy?.titleAr || c.code).join('، ')}.`
                                : `This overrules ${nonShiftBlockers.length} item(s): ${nonShiftBlockers.map((c: any) => c.copy?.titleEn || c.code).join(', ')}.`}
                        </div>
                        <p className="mt-3 text-[11px] font-bold leading-6 text-muted">
                            {isAr
                                ? 'التجاوز يُسجل في سجل التدقيق باسمك مع السبب. استخدمه فقط بعد مراجعة البنود أو بتفويض الإدارة.'
                                : 'The override is signed in the audit log under your name with the reason. Use it only after reviewing the items or with management approval.'}
                        </p>
                        <label className="mt-4 block text-[11px] font-black uppercase tracking-widest text-muted">
                            {isAr ? 'سبب التجاوز (مطلوب — 8 أحرف على الأقل)' : 'Override reason (required — 8+ characters)'}
                        </label>
                        <textarea
                            autoFocus
                            value={overrideReason}
                            onChange={e => setOverrideReason(e.target.value)}
                            rows={3}
                            placeholder={isAr ? 'مثال: جرد الغد معتمد من مدير الفرع، والمطبخ أُفرغ يدوياً…' : 'E.g. stock count deferred by branch manager, kitchen cleared manually…'}
                            className="mt-2 w-full rounded-xl border border-border bg-elevated px-3 py-2.5 text-sm font-bold text-main outline-none focus:border-violet-500 resize-none"
                            maxLength={240}
                        />
                        {varianceNeedsNote && (
                            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-black text-rose-600">
                                <AlertCircle size={13} />
                                {isAr ? 'لازم توثق فرق النقدية في ملاحظات الإغلاق أولاً.' : 'Document the cash variance in close notes first.'}
                            </p>
                        )}
                        <div className="mt-4 flex gap-2">
                            <button
                                type="button"
                                disabled={isOverriding}
                                onClick={() => setShowOverrideModal(false)}
                                className="h-11 flex-1 rounded-xl border border-border bg-elevated text-xs font-black uppercase text-muted hover:text-main disabled:opacity-50"
                            >
                                {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                type="button"
                                disabled={isOverriding || overrideReason.trim().length < 8}
                                onClick={() => void handleOverrideClose()}
                                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 text-xs font-black uppercase text-white hover:bg-violet-700 disabled:opacity-50"
                            >
                                <Flag size={14} />
                                {isOverriding ? (isAr ? 'جارٍ الإغلاق…' : 'Closing…') : (isAr ? 'تجاوز وإغلاق' : 'Override & close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showReopenModal && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4" onClick={() => !isReopening && setShowReopenModal(false)}>
                    <div className="absolute inset-0" />
                    <div className="relative w-full max-w-md rounded-3xl border border-border/50 bg-card p-5 shadow-2xl" onClick={e => e.stopPropagation()} dir={isAr ? 'rtl' : 'ltr'}>
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-wider text-main">
                                {isAr ? `إعادة فتح يوم ${date}` : `Reopen day ${date}`}
                            </h3>
                            <button type="button" onClick={() => !isReopening && setShowReopenModal(false)} className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-main" aria-label={isAr ? 'إغلاق' : 'Close'}>
                                <X size={16} />
                            </button>
                        </div>
                        <p className="mb-3 text-xs font-bold leading-6 text-muted">
                            {isAr
                                ? 'سيتم التراجع عن إقفال اليوم: الأوردرات اللي اتقفلت تلقائيًا مع الإغلاق ترجع للعمل، وتاريخ اليوم يرجع ليوم إعادة الفتح (لو كان على اليوم اللي بعده). الأوردرات المكتملة يدويًا قبل الإغلاق تفضل زي ما هي. السبب يُسجل في سجل التدقيق.'
                                : 'This undoes the close: orders auto-finalized by it return to work, and the business date rewinds to the reopened day (when it sits on the day after). Manually completed orders stay terminal. The reason is written to the audit log.'}
                        </p>
                        <input
                            autoFocus
                            value={reopenReason}
                            onChange={e => setReopenReason(e.target.value)}
                            placeholder={isAr ? 'سبب إعادة الفتح (مطلوب) — مثال: قفل بالغلط' : 'Reopen reason (required) — e.g. closed by mistake'}
                            className="w-full rounded-xl border border-border bg-elevated px-3 py-2.5 text-sm font-bold text-main outline-none focus:border-primary"
                            maxLength={240}
                        />
                        <div className="mt-4 flex gap-2">
                            <button
                                type="button"
                                disabled={isReopening}
                                onClick={() => setShowReopenModal(false)}
                                className="h-11 flex-1 rounded-xl border border-border bg-elevated text-xs font-black uppercase text-muted hover:text-main disabled:opacity-50"
                            >
                                {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                type="button"
                                disabled={isReopening || reopenReason.trim().length < 3}
                                onClick={() => void handleReopenDay()}
                                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 text-xs font-black uppercase text-white hover:bg-amber-700 disabled:opacity-50"
                            >
                                <RotateCcw size={14} />
                                {isAr ? 'إعادة الفتح' : 'Reopen'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Back-nav affordance */}
            <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-1.5 text-xs font-black text-muted hover:text-main transition"
            >
                <ChevronLeft size={14} className={isAr ? 'rotate-180' : ''} />
                {isAr ? 'رجوع' : 'Back'}
            </button>
        </div>
    );
};

export default DayCloseHub;
