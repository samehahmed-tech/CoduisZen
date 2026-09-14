import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, ExternalLink } from 'lucide-react';
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

const DayCloseHub: React.FC = () => {
    const navigate = useNavigate();
    const { settings, branches, fetchBranches, fetchSettings, setBranchBusinessDate } = useAuthStore();
    const setShift = useFinanceStore((state) => state.setShift);
    const setIsShiftDrawerOpen = useFinanceStore((state) => state.setIsShiftDrawerOpen);
    const { confirm } = useConfirm();
    const lang = settings.language || 'en';
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

    const activeBranch = useMemo(() => branches.find((branch) => branch.id === branchId), [branches, branchId]);
    const today = todayLocalDate();
    const businessDate = activeBranch?.businessDate || today;
    const isStaleBusinessDate = businessDate < today;
    const isViewingBusinessDate = date === businessDate;

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
            const isBlocked = !check.passed || blockedReasons.includes(check.code);
            return { ...check, copy, isBlocked };
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
                return { code, count: 1, copy, isBlocked: true, actionPath: copy.actionPath };
            });

        return [...checksFromReport, ...syntheticChecks];
    }, [blockedReasons, readinessChecks]);

    const canClose = report?.readiness?.canClose && readinessChecks.every((check: any) => !check.isBlocked);
  // Open shifts must NOT disable the close button: the server auto-closes them
  // (autoCloseOpenShifts). Only other blockers (stock count, fiscal…) gate it.
  const blockingChecks = readinessChecks.filter((check: any) => check.isBlocked);
  const nonShiftBlockers = blockingChecks.filter((check: any) => check.code !== 'OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE');
  const canCloseIgnoringShifts = report?.readiness?.canClose && nonShiftBlockers.length === 0;
  const hasOpenShiftBlocker = blockingChecks.some((check: any) => check.code === 'OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE');
    const isClosedDay = report?.status === 'CLOSED';
    const closedSnapshot = report?.closedSnapshot || null;
    const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

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

    const loadReport = async () => {
        if (!branchId || !date) return;
        setIsLoadingReport(true);
        setError(null);
        setBlockedReasons([]);
        try {
            const data = await dayCloseApi.getReport(branchId, date);
            setReport(data);
        } catch (e: any) {
            setError(e?.message || 'Failed to load report');
            setReport(null);
        } finally {
            setIsLoadingReport(false);
        }
    };

    const loadHistory = async () => {
        if (!branchId) return;
        try {
            const rows = await dayCloseApi.getHistory(branchId, 370);
            setHistory(rows || []);
        } catch (e: any) {
            setHistory([]);
            setError(e?.message || (lang === 'ar' ? 'تعذر تحميل سجل إغلاق اليوم' : 'Failed to load day close history'));
        }
    };

    useEffect(() => {
        loadReport();
        loadHistory();
    }, [branchId, date]);

    const handleCloseDay = async () => {
        if (!branchId || !date) return;
        if (!isViewingBusinessDate) {
            setError(lang === 'ar' ? `الإغلاق مسموح فقط ليوم التشغيل النشط ${businessDate}.` : `Only the active business day ${businessDate} can be closed.`);
            return;
        }
        if (isClosedDay) {
            setBlockedReasons(['DAY_ALREADY_CLOSED']);
            setError(lang === 'ar' ? 'هذا اليوم مقفول بالفعل ولا يمكن إقفاله مرة أخرى.' : 'This day is already closed and cannot be closed again.');
            return;
        }
        if (!canCloseIgnoringShifts) {
            setError(lang === 'ar' ? 'راجع متطلبات الجاهزية قبل إغلاق اليوم.' : 'Resolve readiness requirements before closing the day.');
            return;
        }
        // Cash variance must be explained: a non-zero shift variance requires
        // a written note before close is allowed.
        const cashVariance = Number(report?.shiftCashSummary?.variance || 0);
        if (Math.abs(cashVariance) > 0.005 && !notes.trim()) {
            setError(lang === 'ar' ? `يوجد فرق نقدية (${cashVariance.toLocaleString()}) — اكتب سبب الفرق في ملاحظات الإغلاق أولاً.` : `Cash variance of ${cashVariance.toLocaleString()} needs a written reason in close notes first.`);
            return;
        }
        const confirmed = await confirm({
            title: lang === 'ar' ? `تأكيد إغلاق يوم ${date}` : `Confirm day close for ${date}`,
            message: hasOpenShiftBlocker
                ? (lang === 'ar'
                    ? `${buildDayCloseConfirmationMessage(report, lang)}\n\nسيتم إغلاق الشيفتات المفتوحة تلقائياً كجزء من إغلاق اليوم.`
                    : `${buildDayCloseConfirmationMessage(report, lang)}\n\nOpen shifts will be closed automatically as part of the day close.`)
                : buildDayCloseConfirmationMessage(report, lang),
            confirmText: lang === 'ar' ? 'إغلاق اليوم' : 'Close day',
            cancelText: lang === 'ar' ? 'إلغاء' : 'Cancel',
            variant: 'danger',
        });
        if (!confirmed) return;
        setIsClosing(true);
        setError(null);
        setMessage(null);
        setBlockedReasons([]);
        try {
            const result = await dayCloseApi.close(branchId, date, {
                notes: notes.trim() || undefined,
                enforceShiftsClosed: true,
                autoCloseOpenShifts: true,
                emailConfig: settings.endOfDayEmailEnabled && settings.endOfDayEmailRecipients?.filter(isEmail).length ? {
                    to: settings.endOfDayEmailRecipients.filter(isEmail),
                    subject: `Day Close Report - ${date}`,
                    includeReports: ['sales', 'payments', 'audit']
                } : undefined
            });
            const queued = result.report?.whatsappDelivery?.queued || 0;
            setMessage(queued
                ? (lang === 'ar' ? `تم إغلاق اليوم وإضافة التقرير لطابور واتساب (${queued}).` : `Day closed and WhatsApp report queued for ${queued} recipient(s).`)
                : (result.message || (lang === 'ar' ? 'تم إغلاق اليوم بنجاح' : 'Day closed successfully')));
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
            setBlockedReasons([]);
            await loadHistory();
            await fetchBranches();
        } catch (e: any) {
            const reasons = e?.details?.blockedReasons || e?.blockedReasons || [];
            setBlockedReasons(Array.isArray(reasons) ? reasons : []);
            setError(
                e?.code === 'DAY_CLOSE_BLOCKED'
                    ? (lang === 'ar' ? 'لا يمكن إغلاق اليوم قبل تنفيذ الإجراءات المطلوبة.' : 'Day close is blocked until the required actions are completed.')
                    : e?.code === 'BUSINESS_DATE_MISMATCH'
                        ? (lang === 'ar' ? `تاريخ التشغيل النشط هو ${e?.businessDate || e?.details?.businessDate || businessDate}. حدّث الصفحة ثم حاول مرة أخرى.` : `Active business date is ${e?.businessDate || e?.details?.businessDate || businessDate}. Refresh and try again.`)
                    : (e?.message || 'Failed to close day')
            );
        } finally {
            setIsClosing(false);
        }
    };

    const handleUpdateBusinessDate = async () => {
        if (!branchId || !manualBusinessDate) return;
        if (manualBusinessDate > today) {
            setError(lang === 'ar' ? 'لا يمكن ضبط تاريخ التشغيل على تاريخ مستقبلي.' : 'Business date cannot be in the future.');
            return;
        }
        const confirmed = await confirm({
            title: lang === 'ar' ? 'تعديل تاريخ التشغيل' : 'Change business date',
            message: lang === 'ar'
                ? `تغيير تاريخ تشغيل الفرع من ${businessDate} إلى ${manualBusinessDate}؟`
                : `Change branch business date from ${businessDate} to ${manualBusinessDate}?`,
            confirmText: lang === 'ar' ? 'تعديل' : 'Update',
            cancelText: lang === 'ar' ? 'إلغاء' : 'Cancel',
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
            setMessage(lang === 'ar' ? `تم تحديث تاريخ التشغيل إلى ${manualBusinessDate}.` : `Business date updated to ${manualBusinessDate}.`);
        } catch (e: any) {
            const messages: Record<string, string> = lang === 'ar' ? {
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
            setError(lang === 'ar' ? 'راجع أرقام واتساب وافصل بينها بفاصلة، مع كود الدولة.' : 'Check WhatsApp numbers, separated by commas and including country code.');
            return;
        }
        setIsSavingWhatsapp(true);
        setError(null);
        try {
            await settingsApi.update('dayCloseWhatsappRecipients', recipients, 'operations');
            await fetchSettings();
            setMessage(lang === 'ar' ? 'تم حفظ أرقام واتساب. سيُرسل الملخص تلقائياً بعد الإغلاق.' : 'WhatsApp recipients saved. The summary will be sent automatically after close.');
        } catch (e: any) {
            setError(e?.message || (lang === 'ar' ? 'تعذر حفظ أرقام واتساب' : 'Failed to save WhatsApp recipients'));
        } finally {
            setIsSavingWhatsapp(false);
        }
    };

    const handleSendEmail = async () => {
        if (!branchId || !date || !emailTo.trim()) {
            setError(lang === 'ar' ? 'أدخل بريداً واحداً على الأقل' : 'Enter at least one recipient email');
            return;
        }
        setIsSending(true);
        setError(null);
        setMessage(null);
        try {
            const to = emailTo.split(',').map((x) => x.trim()).filter(Boolean);
            if (!to.length || to.some((email) => !isEmail(email))) {
                setError(lang === 'ar' ? 'راجع عناوين البريد. افصل بين كل بريد بفاصلة.' : 'Check recipient emails. Separate multiple emails with commas.');
                return;
            }
            const result = await dayCloseApi.sendEmail(branchId, date, {
                to,
                subject: `Day Close Report - ${date}`,
                includeReports: ['sales', 'payments', 'audit'],
            });
            setMessage(result.message || (lang === 'ar' ? 'تم إرسال الإيميل' : 'Email sent'));
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
            const blob = await dayCloseApi.getPdf(branchId, date, lang === 'ar' ? 'ar' : 'en', printPaper);
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
            setError(e?.message || (lang === 'ar' ? 'تعذر تجهيز تقرير الطباعة' : 'Failed to prepare print report'));
        }
    };

    const handleExportReport = async (format: 'pdf' | 'xlsx') => {
        if (!branchId || !date) return;
        setError(null);
        setMessage(null);
        try {
            const reportLang = lang === 'ar' ? 'ar' : 'en';
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
            setError(e?.message || (lang === 'ar' ? 'تعذر تصدير التقرير' : 'Failed to export report'));
        }
    };

    const closedDateSet = useMemo(() => new Set(history.map((row: any) => String(row.date))), [history]);
    const calendarDays = useMemo(() => buildMonthDays(date), [date]);
    const monthLabel = parseLocalDate(date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' });

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

        navigate(check.copy?.actionPath || check.actionPath || '/day-close');
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6 min-h-screen">
            <div className="card-primary rounded-3xl p-5 md:p-6">
                <h2 className="text-2xl font-black text-main">{lang === 'ar' ? 'إغلاق اليوم' : 'Day Close'}</h2>
                <p className="text-sm text-muted mt-1">{lang === 'ar' ? 'إغلاق يوم الفرع مع مراجعة الإيراد والحالة الضريبية' : 'Close branch day with sales and fiscal health checks'}</p>

                <div role={isStaleBusinessDate ? 'alert' : undefined} className={`mt-5 rounded-2xl border p-4 ${isStaleBusinessDate ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                            <CalendarClock className={isStaleBusinessDate ? 'text-amber-600' : 'text-emerald-600'} size={22} />
                            <div>
                                <p className="font-black">{lang === 'ar' ? `تاريخ التشغيل: ${businessDate}` : `Business date: ${businessDate}`}</p>
                                <p className="mt-1 text-xs font-bold opacity-80">
                                    {isStaleBusinessDate
                                        ? (lang === 'ar' ? `تنبيه: تاريخ اليوم الحالي ${today}. النظام ما زال يعمل على يوم قديم.` : `Warning: today is ${today}. The system is still running on an older date.`)
                                        : (lang === 'ar' ? 'تاريخ التشغيل مطابق لليوم الحالي.' : 'Business date matches today.')}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input type="date" max={today} value={manualBusinessDate} onChange={(e) => setManualBusinessDate(e.target.value)} className="rounded-xl border border-current/20 bg-white px-3 py-2 text-sm font-black" aria-label={lang === 'ar' ? 'تاريخ التشغيل الجديد' : 'New business date'} />
                            <button type="button" onClick={handleUpdateBusinessDate} disabled={isUpdatingBusinessDate || manualBusinessDate === businessDate} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40">
                                {isUpdatingBusinessDate ? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : (lang === 'ar' ? 'تعديل تاريخ التشغيل' : 'Update Business Date')}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-5">
                    <select
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                        disabled={!availableBranches.length}
                        className="px-3 py-2.5 rounded-xl bg-elevated border border-border/50 font-bold"
                    >
                        {!availableBranches.length && (
                            <option value="">{lang === 'ar' ? 'لا توجد فروع متاحة' : 'No branches available'}</option>
                        )}
                        {availableBranches.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="px-3 py-2.5 rounded-xl bg-elevated border border-border/50 font-bold"
                    />
                    <button
                        onClick={loadReport}
                        disabled={isLoadingReport}
                        className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest disabled:opacity-50"
                    >
                        {isLoadingReport ? (lang === 'ar' ? 'تحميل...' : 'Loading...') : (lang === 'ar' ? 'تحديث التقرير' : 'Refresh Report')}
                    </button>
                    <button
                        onClick={handleCloseDay}
                        disabled={isClosing || isClosedDay || !canCloseIgnoringShifts || !isViewingBusinessDate}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest disabled:opacity-50"
                        title={!canCloseIgnoringShifts && !isClosedDay ? (lang === 'ar' ? 'راجع قائمة الجاهزية قبل الإغلاق' : 'Review readiness checklist before closing') : undefined}
                    >
                        {isClosing ? (lang === 'ar' ? 'جارٍ الإغلاق...' : 'Closing...') : (lang === 'ar' ? 'إغلاق اليوم' : 'Close Day')}
                    </button>
                </div>
                <div className="mt-4 rounded-2xl border border-border/50 bg-elevated/50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs font-black uppercase tracking-widest text-muted">
                            {lang === 'ar' ? `أيام الإغلاق - ${monthLabel}` : `Closed days - ${monthLabel}`}
                        </p>
                        <span className="inline-flex items-center gap-2 text-[11px] font-black text-emerald-700">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                            {lang === 'ar' ? 'مقفل' : 'Closed'}
                        </span>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-black text-muted">
                        {(lang === 'ar' ? ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map((dayName, index) => (
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
                                    className={`h-9 rounded-lg text-xs font-black transition-colors ${
                                        isClosed
                                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                            : 'bg-card text-main hover:bg-primary/10'
                                    } ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : ''}`}
                                    title={isClosed ? (lang === 'ar' ? 'يوم مقفل' : 'Closed day') : undefined}
                                >
                                    {item.day}
                                </button>
                            );
                        })}
                    </div>
                </div>
                {isClosedDay && (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm font-bold text-emerald-800">
                        {lang === 'ar'
                            ? `تم إقفال يوم ${date}. هذه نسخة مراجعة محفوظة ولن يتم إقفالها مرة أخرى.`
                            : `Business day ${date} is closed. This is a saved review snapshot and cannot be closed again.`}
                    </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                    <select value={printPaper} onChange={(e) => setPrintPaper(e.target.value as 'a4' | '80mm')} className="rounded-xl border border-border/50 bg-elevated px-3 py-2.5 text-xs font-black" aria-label={lang === 'ar' ? 'مقاس ورق الطباعة' : 'Print paper size'}>
                        <option value="80mm">80 mm</option>
                        <option value="a4">A4</option>
                    </select>
                    <button
                        onClick={handlePrintReport}
                        className="px-4 py-2.5 rounded-xl bg-slate-700 text-white font-black text-xs uppercase tracking-widest"
                    >
                        {lang === 'ar' ? 'طباعة التقرير' : 'Print Report'}
                    </button>
                    <button
                        onClick={() => handleExportReport('pdf')}
                        className="px-4 py-2.5 rounded-xl bg-blue-700 text-white font-black text-xs uppercase tracking-widest"
                    >
                        PDF
                    </button>
                    <button
                        onClick={() => handleExportReport('xlsx')}
                        className="px-4 py-2.5 rounded-xl bg-emerald-700 text-white font-black text-xs uppercase tracking-widest"
                    >
                        Excel
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    <input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={lang === 'ar' ? 'ملاحظات الإغلاق (إجبارية عند وجود فرق نقدية)' : 'Close notes (required with cash variance)'}
                        className="px-3 py-2.5 rounded-xl bg-elevated border border-border/50 font-bold"
                    />
                </div>

                <div className="mt-5 rounded-2xl border border-border/50 bg-elevated/60 p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-widest text-main">
                                {lang === 'ar' ? 'قائمة جاهزية الإقفال' : 'Close Readiness Checklist'}
                            </h3>
                            <p className="text-xs font-bold text-muted mt-1">
                                {canClose
                                    ? (lang === 'ar' ? 'كل المتطلبات الأساسية مكتملة. يمكنك إقفال اليوم.' : 'All required checks are complete. You can close the day.')
                                    : (lang === 'ar' ? 'أكمل البنود المعلقة ثم حدّث التقرير قبل الإقفال.' : 'Complete pending items, then refresh the report before closing.')}
                            </p>
                        </div>
                        <span className={`text-xs font-black px-3 py-1.5 rounded-full ${canClose ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                            {canClose ? (lang === 'ar' ? 'جاهز' : 'READY') : (lang === 'ar' ? 'مطلوب إجراء' : 'ACTION NEEDED')}
                        </span>
                    </div>

                    <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
                        {readinessChecks.map((check: any) => (
                            <div
                                key={check.code}
                                className={`flex items-start gap-3 rounded-xl border p-3 ${check.isBlocked ? 'border-amber-300 bg-amber-50/70' : 'border-emerald-200 bg-emerald-50/60'}`}
                            >
                                <div className={`mt-0.5 ${check.isBlocked ? 'text-amber-700' : 'text-emerald-700'}`}>
                                    {check.isBlocked ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <p className="font-black text-sm text-main">
                                                {lang === 'ar' ? check.copy.titleAr : check.copy.titleEn}
                                            </p>
                                            <p className="text-xs font-bold text-muted mt-1">
                                                {check.isBlocked
                                                    ? (lang === 'ar' ? check.copy.actionAr : check.copy.actionEn)
                                                    : (lang === 'ar' ? check.copy.readyAr : check.copy.readyEn)}
                                            </p>
                                        </div>
                                        <span className={`shrink-0 text-[11px] font-black px-2 py-1 rounded-full ${check.isBlocked ? 'bg-white text-amber-800' : 'bg-white text-emerald-700'}`}>
                                            {check.isBlocked
                                                ? `${check.count || 0} ${lang === 'ar' ? 'معلق' : 'pending'}`
                                                : (lang === 'ar' ? 'تم' : 'Done')}
                                        </span>
                                    </div>
                                    {check.isBlocked && (
                                        <div className="mt-3 space-y-2">
                                            <button
                                                type="button"
                                                onClick={() => { void openReadinessAction(check); }}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-widest text-white"
                                            >
                                                {lang === 'ar' ? check.copy.actionLabelAr : check.copy.actionLabelEn}
                                                <ExternalLink size={14} />
                                            </button>
                                            {check.code === 'OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE' && (check.openShifts || report?.readiness?.openShifts || report?.openShifts || []).length > 0 && (
                                                <div className="mt-3 space-y-2 border-t border-amber-300/60 pt-2">
                                                    <p className="text-[11px] font-black text-amber-950 uppercase">
                                                        {lang === 'ar' ? 'الشيفتات المفتوحة حالياً:' : 'Currently Open Shifts:'}
                                                    </p>
                                                    {(check.openShifts || report?.readiness?.openShifts || report?.openShifts || []).map((s: any) => (
                                                        <div key={s.id} className="flex items-center justify-between bg-white/95 p-2.5 rounded-xl border border-amber-300/60 text-xs shadow-sm">
                                                            <div>
                                                                <p className="font-black text-main">{s.userName || s.userId}</p>
                                                                <p className="text-[10px] text-muted font-bold mt-0.5">
                                                                    {lang === 'ar' ? 'وقت الفتح' : 'Opened'}: {new Date(s.openingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} | {lang === 'ar' ? 'الافتتاحي' : 'Float'}: {Number(s.openingBalance || 0).toFixed(2)}
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
                                                                {lang === 'ar' ? 'تسوية وإغلاق' : 'Close'}
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
                    <input
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        placeholder={lang === 'ar' ? 'إيميلات مفصولة بفاصلة' : 'Comma-separated recipient emails'}
                        className="md:col-span-3 px-3 py-2.5 rounded-xl bg-elevated border border-border/50 font-bold"
                    />
                    <button
                        onClick={handleSendEmail}
                        disabled={isSending}
                        className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest disabled:opacity-50"
                    >
                        {isSending ? (lang === 'ar' ? 'إرسال بناء على الطلب...' : 'Sending manually...') : (lang === 'ar' ? 'إرسال يدوي' : 'Manual Send')}
                    </button>
                </div>

                <div className="mt-4 rounded-2xl border border-border/50 bg-elevated/60 p-4">
                    <p className="text-sm font-black text-main">{lang === 'ar' ? 'إرسال ملخص الإغلاق تلقائياً على واتساب' : 'Automatic WhatsApp close summary'}</p>
                    <p className="mt-1 text-xs font-bold text-muted">{lang === 'ar' ? 'أدخل الأرقام بكود الدولة وافصل بينها بفاصلة.' : 'Enter numbers with country code, separated by commas.'}</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                        <input value={whatsappRecipients} onChange={(e) => setWhatsappRecipients(e.target.value)} placeholder="+2010..., +2011..." className="rounded-xl border border-border/50 bg-card px-3 py-2.5 font-bold md:col-span-3" />
                        <button type="button" onClick={handleSaveWhatsapp} disabled={isSavingWhatsapp} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">
                            {isSavingWhatsapp ? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ الأرقام' : 'Save Numbers')}
                        </button>
                    </div>
                </div>

                {error && (
                    <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm">
                        <div className="flex items-start gap-3">
                            <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-600" />
                            <div className="min-w-0 flex-1">
                                <p className="font-black text-rose-800">{error}</p>
                                {closeFailureChecks.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        <p className="text-xs font-black uppercase tracking-widest text-rose-700">
                                            {lang === 'ar' ? 'الإجراءات المطلوبة' : 'Required actions'}
                                        </p>
                                        {closeFailureChecks.map((check: any) => (
                                            <div key={check.code} className="flex flex-col gap-2 rounded-xl bg-white/80 p-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <p className="font-black text-main">
                                                        {lang === 'ar' ? check.copy.titleAr : check.copy.titleEn}
                                                    </p>
                                                    <p className="mt-1 text-xs font-bold text-muted">
                                                        {lang === 'ar' ? check.copy.actionAr : check.copy.actionEn}
                                                        {check.count ? ` (${check.count})` : ''}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => { void openReadinessAction(check); }}
                                                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-widest text-white"
                                                >
                                                    {lang === 'ar' ? check.copy.actionLabelAr : check.copy.actionLabelEn}
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
                {message && <p aria-live="polite" className="mt-5 text-emerald-600 text-sm font-bold">{message}</p>}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="card-primary rounded-3xl p-5">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-3">{lang === 'ar' ? 'ملخص المبيعات' : 'Sales Summary'}</h3>
                    <div className="space-y-2 text-sm font-bold">
                        <p>{lang === 'ar' ? 'الطلبات:' : 'Orders:'} {report?.salesSummary?.totalOrders ?? 0}</p>
                        <p>{lang === 'ar' ? 'الإيراد:' : 'Revenue:'} {(report?.salesSummary?.totalRevenue ?? 0).toLocaleString()}</p>
                        <p>{lang === 'ar' ? 'الصافي:' : 'Net Sales:'} {(report?.salesSummary?.netSales ?? 0).toLocaleString()}</p>
                        <p>{lang === 'ar' ? 'الضريبة:' : 'Tax:'} {(report?.salesSummary?.totalTax ?? 0).toLocaleString()}</p>
                        <p>{lang === 'ar' ? 'الخصومات:' : 'Discounts:'} {(report?.salesSummary?.totalDiscount ?? 0).toLocaleString()}</p>
                        {(report?.cancelledPaidSummary?.orders ?? 0) > 0 && (
                            <p className="text-amber-600">{lang === 'ar' ? 'ملغي-مدفوع (بالخزنة خارج الإيراد):' : 'Cancelled-paid (in drawer, out of revenue):'} {report.cancelledPaidSummary.orders} / {(report.cancelledPaidSummary.total ?? 0).toLocaleString()}</p>
                        )}
                        {(report?.driverCashOutstanding || []).length > 0 && (
                            <div className="pt-1">
                                <p className="text-violet-600">{lang === 'ar' ? 'عهدة طيارين (خارج الدرج):' : 'Driver pocket cash (out of drawer):'}</p>
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
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-3">{lang === 'ar' ? 'الحالة الضريبية' : 'Fiscal Health'}</h3>
                    <div className="space-y-2 text-sm font-bold">
                        <p>{lang === 'ar' ? 'Submitted:' : 'Submitted:'} {report?.fiscalHealth?.submitted ?? 0}</p>
                        <p>{lang === 'ar' ? 'Pending:' : 'Pending:'} {report?.fiscalHealth?.pending ?? 0}</p>
                        <p>{lang === 'ar' ? 'Failed:' : 'Failed:'} {report?.fiscalHealth?.failed ?? 0}</p>
                        <p>{lang === 'ar' ? 'Dead Letters:' : 'Dead Letters:'} {report?.fiscalHealth?.deadLettersPending ?? 0}</p>
                    </div>
                </div>

                <div className="card-primary rounded-3xl p-5">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-3">{lang === 'ar' ? 'التدقيق' : 'Audit Summary'}</h3>
                    <div className="space-y-2 text-sm font-bold">
                        <p>{lang === 'ar' ? 'إجمالي الأحداث:' : 'Total Events:'} {report?.auditSummary?.totalEvents ?? 0}</p>
                        <p>{lang === 'ar' ? 'إلغاء:' : 'Voids:'} {report?.auditSummary?.voidCount ?? 0}</p>
                        <p>{lang === 'ar' ? 'خصومات:' : 'Discounts:'} {report?.auditSummary?.discountCount ?? 0}</p>
                        <p>{lang === 'ar' ? 'مرتجعات:' : 'Refunds:'} {report?.auditSummary?.refundCount ?? 0}</p>
                    </div>
                </div>

                <div className="card-primary rounded-3xl p-5 border-indigo-500/20">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-3">{lang === 'ar' ? 'الكول سنتر والقنوات (شامل في قفل الفرع)' : 'Call Center & Channels (included in branch close)'}</h3>
                    <div className="space-y-2 text-sm font-bold">
                        <p>{lang === 'ar' ? 'طلبات الكول سنتر:' : 'Call-center orders:'} {report?.callCenterSummary?.orders ?? 0} / {(report?.callCenterSummary?.revenue ?? 0).toLocaleString()}</p>
                        <p>{lang === 'ar' ? 'منها منصات:' : 'Of which platforms:'} {report?.callCenterSummary?.platformOrders ?? 0} / {(report?.callCenterSummary?.platformRevenue ?? 0).toLocaleString()}</p>
                        <div className="pt-2 space-y-1.5 max-h-40 overflow-y-auto">
                            {(report?.channelBreakdown || []).map((row: any) => (
                                <div key={row.source} className="flex items-center justify-between text-xs font-bold border-b border-border/30 pb-1.5">
                                    <span className="uppercase tracking-widest">{row.source}</span>
                                    <span>{row.count} / {(row.total || 0).toLocaleString()}</span>
                                </div>
                            ))}
                            {(!report?.channelBreakdown || report.channelBreakdown.length === 0) && (
                                <p className="text-xs text-muted font-bold">{lang === 'ar' ? 'لا توجد تفصيلة قنوات لهذا اليوم' : 'No channel split for this day'}</p>
                            )}
                        </div>
                        <p className="text-[11px] text-muted font-bold pt-1">{lang === 'ar' ? 'لا يوجد قفل منفصل للكول سنتر — قفل الفرع يشمله تلقائياً.' : 'No separate call-center close — the branch close includes it.'}</p>
                    </div>
                </div>
            </div>

            {closedSnapshot && (
                <div className="card-primary rounded-3xl p-5">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-4">
                        {lang === 'ar' ? 'نظرة شاملة محفوظة لليوم' : 'Saved Operational Day Snapshot'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="rounded-2xl bg-elevated border border-border/50 p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'الطلبات' : 'Orders'}</p>
                            <p className="text-2xl font-black text-main mt-2">{closedSnapshot.orders?.total ?? report?.salesSummary?.totalOrders ?? 0}</p>
                            <p className="text-xs font-bold text-muted mt-1">{lang === 'ar' ? 'توزيع الحالات محفوظ' : 'Status breakdown saved'}</p>
                        </div>
                        <div className="rounded-2xl bg-elevated border border-border/50 p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'المخزون' : 'Inventory'}</p>
                            <p className="text-2xl font-black text-main mt-2">{closedSnapshot.inventory?.currentStock?.itemCount ?? 0}</p>
                            <p className="text-xs font-bold text-muted mt-1">{lang === 'ar' ? 'منخفض: ' : 'Low stock: '}{closedSnapshot.inventory?.currentStock?.lowStockCount ?? 0}</p>
                        </div>
                        <div className="rounded-2xl bg-elevated border border-border/50 p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'حركات المخزون' : 'Stock Movements'}</p>
                            <p className="text-2xl font-black text-main mt-2">{closedSnapshot.inventory?.movements?.length ?? 0}</p>
                            <p className="text-xs font-bold text-muted mt-1">{lang === 'ar' ? 'أنواع حركات اليوم' : 'Movement types today'}</p>
                        </div>
                        <div className="rounded-2xl bg-elevated border border-border/50 p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'فرق الشيفتات' : 'Shift Variance'}</p>
                            <p className="text-2xl font-black text-main mt-2">{(closedSnapshot.shifts?.variance ?? 0).toLocaleString()}</p>
                            <p className="text-xs font-bold text-muted mt-1">{lang === 'ar' ? 'فرق النقدية المحفوظ' : 'Saved cash variance'}</p>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
                        <div className="rounded-2xl bg-elevated border border-border/50 p-4">
                            <p className="text-xs font-black uppercase tracking-widest text-muted mb-3">{lang === 'ar' ? 'الطلبات حسب الحالة' : 'Orders by Status'}</p>
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
                            <p className="text-xs font-black uppercase tracking-widest text-muted mb-3">{lang === 'ar' ? 'حركات المخزون' : 'Inventory Movements'}</p>
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
                            <p className="text-xs font-black uppercase tracking-widest text-muted mb-3">{lang === 'ar' ? 'الشيفتات' : 'Shifts'}</p>
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
                </div>
            )}

            <div className="card-primary rounded-3xl p-5">
                <h3 className="text-sm font-black uppercase tracking-widest text-muted mb-3">{lang === 'ar' ? 'سجل الإغلاق' : 'Close History'}</h3>
                {history.length === 0 && (
                    <p className="text-sm text-muted font-bold">{lang === 'ar' ? 'لا يوجد سجل حتى الآن' : 'No history yet'}</p>
                )}
                <div className="space-y-2">
                    {history.map((row) => (
                        <button
                            key={row.id}
                            type="button"
                            onClick={() => setDate(row.date)}
                            className="w-full p-3 rounded-xl bg-elevated border border-border/50 flex items-center justify-between text-sm text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
                        >
                            <div>
                                <p className="font-black">{row.date}</p>
                                <p className="text-muted font-bold">{lang === 'ar' ? 'بواسطة:' : 'By:'} {row.closedBy}</p>
                            </div>
                            <div className="text-right font-bold">
                                <p>{lang === 'ar' ? 'الطلبات:' : 'Orders:'} {row.summary?.totalOrders ?? 0}</p>
                                <p>{lang === 'ar' ? 'الصافي:' : 'Net:'} {(row.summary?.netSales ?? 0).toLocaleString()}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DayCloseHub;



