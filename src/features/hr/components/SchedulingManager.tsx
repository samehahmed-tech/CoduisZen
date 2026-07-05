import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Calendar,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Copy,
    Loader2,
    Moon,
    Plus,
    RefreshCw,
    Search,
    ShieldCheck,
    Timer,
    Users,
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/useAuthStore';
import { apiRequest, getActionableErrorMessage } from '../../../../services/api/core';

type ShiftPlan = {
    id: string;
    branchId: string;
    name: string;
    weekStart: string;
    weekEnd: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | string;
    postedAt?: string | null;
    frozenAt?: string | null;
};

type ShiftTemplate = {
    id: string;
    branchId: string;
    name: string;
    code?: string | null;
    startTime: string;
    endTime: string;
    breakMinutes?: number | null;
    workDays?: string[];
    isOvernight?: boolean;
    isActive?: boolean;
};

type ShiftEntry = {
    id: number;
    planId: string;
    branchId: string;
    employeeId: string;
    shiftTemplateId?: string | null;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    status: 'PLANNED' | 'CONFIRMED' | 'OFF' | 'ABSENT' | 'CANCELLED' | string;
    notes?: string | null;
};

type EmployeeRow = {
    id: string;
    name: string;
    employeeCode?: string | null;
    attendanceCode?: string | null;
    role?: string | null;
    departmentId?: string | null;
    jobTitleId?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
    DRAFT: 'مسودة',
    PUBLISHED: 'معتمدة',
    ARCHIVED: 'مؤرشفة',
    PLANNED: 'مخطط',
    CONFIRMED: 'مؤكد',
    OFF: 'راحة',
    ABSENT: 'غياب',
    CANCELLED: 'ملغي',
};

const STATUS_CLASS: Record<string, string> = {
    DRAFT: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
    PUBLISHED: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    ARCHIVED: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20',
    PLANNED: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    CONFIRMED: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    OFF: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    ABSENT: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    CANCELLED: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
};

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const getSunday = (date = new Date()) => {
    const copy = new Date(date);
    copy.setHours(12, 0, 0, 0);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
};

const addDays = (value: string | Date, days: number) => {
    const date = typeof value === 'string' ? new Date(`${value}T12:00:00`) : new Date(value);
    date.setDate(date.getDate() + days);
    return toIsoDate(date);
};

const minutesBetween = (start?: string | null, end?: string | null) => {
    if (!start || !end) return 0;
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return 0;
    let startTotal = startHour * 60 + startMinute;
    let endTotal = endHour * 60 + endMinute;
    if (endTotal <= startTotal) endTotal += 24 * 60;
    return Math.max(0, endTotal - startTotal);
};

const formatDate = (value?: string | null) => {
    if (!value) return '--';
    return new Date(`${value}T12:00:00`).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
};

const compactTime = (value?: string | null) => value ? value.slice(0, 5) : '--:--';

export default function SchedulingManager() {
    const { settings } = useAuthStore();
    const currentUser = settings?.currentUser as typeof settings.currentUser & { branchId?: string };
    const branchId = settings?.activeBranchId || currentUser?.assignedBranchId || currentUser?.branchId || '';

    const [plans, setPlans] = useState<ShiftPlan[]>([]);
    const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
    const [employees, setEmployees] = useState<EmployeeRow[]>([]);
    const [entries, setEntries] = useState<ShiftEntry[]>([]);
    const [selectedPlan, setSelectedPlan] = useState<ShiftPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selectedCell, setSelectedCell] = useState<{ employeeId: string; date: string } | null>(null);
    const [entryForm, setEntryForm] = useState({
        employeeId: '',
        date: '',
        shiftTemplateId: '',
        startTime: '',
        endTime: '',
        status: 'PLANNED',
        notes: '',
    });
    const [templateForm, setTemplateForm] = useState({
        name: '',
        code: '',
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: '0',
        isOvernight: false,
    });

    const weekDays = useMemo(() => {
        if (!selectedPlan?.weekStart) return [];
        return Array.from({ length: 7 }, (_, index) => {
            const date = addDays(selectedPlan.weekStart, index);
            return { date, label: DAY_NAMES[index], short: formatDate(date) };
        });
    }, [selectedPlan?.weekStart]);

    const entriesByCell = useMemo(() => {
        const map = new Map<string, ShiftEntry[]>();
        for (const entry of entries) {
            const key = `${entry.employeeId}|${entry.date}`;
            const list = map.get(key) || [];
            list.push(entry);
            map.set(key, list);
        }
        return map;
    }, [entries]);

    const templateById = useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates]);

    const filteredEmployees = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return employees;
        return employees.filter((employee) => [
            employee.name,
            employee.employeeCode,
            employee.attendanceCode,
            employee.role,
        ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
    }, [employees, search]);

    const stats = useMemo(() => {
        const workEntries = entries.filter((entry) => !['OFF', 'CANCELLED'].includes(String(entry.status).toUpperCase()));
        const uniqueEmployees = new Set(workEntries.map((entry) => entry.employeeId));
        const plannedMinutes = workEntries.reduce((sum, entry) => sum + minutesBetween(entry.startTime, entry.endTime), 0);
        const uncoveredDays = Math.max(0, (filteredEmployees.length * 7) - entries.length);
        return {
            entries: workEntries.length,
            coveredEmployees: uniqueEmployees.size,
            plannedHours: Math.round((plannedMinutes / 60) * 10) / 10,
            uncoveredDays,
        };
    }, [entries, filteredEmployees.length]);

    const loadEntries = async (plan: ShiftPlan) => {
        setSelectedPlan(plan);
        const data = await apiRequest<ShiftEntry[]>(`/hr-extended/schedules/entries?planId=${plan.id}`);
        setEntries(data || []);
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const branchQuery = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
            const [plansData, templatesData, employeeData] = await Promise.all([
                apiRequest<ShiftPlan[]>(`/hr-extended/schedules/plans${branchQuery}`),
                apiRequest<ShiftTemplate[]>(`/hr-extended/shift-templates${branchQuery}`),
                apiRequest<EmployeeRow[]>(`/hr/employees${branchQuery}`),
            ]);
            setPlans(plansData || []);
            setTemplates((templatesData || []).filter((template) => template.isActive !== false));
            setEmployees(employeeData || []);

            const activePlan = selectedPlan
                ? (plansData || []).find((plan) => plan.id === selectedPlan.id)
                : (plansData || [])[0];
            if (activePlan) {
                await loadEntries(activePlan);
            } else {
                setSelectedPlan(null);
                setEntries([]);
            }
        } catch (error: any) {
            toast.error(getActionableErrorMessage(error, 'ar'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [branchId]);

    const createPlan = async (offsetWeeks = 1) => {
        if (!branchId) return toast.error('اختار فرع قبل إنشاء الخطة');
        setSaving('plan');
        try {
            const start = getSunday();
            start.setDate(start.getDate() + (offsetWeeks * 7));
            const weekStart = toIsoDate(start);
            const plan = await apiRequest<ShiftPlan>('/hr-extended/schedules/plans', {
                method: 'POST',
                body: JSON.stringify({
                    branchId,
                    weekStart,
                    name: `خطة أسبوع ${formatDate(weekStart)}`,
                }),
            });
            toast.success('تم إنشاء خطة أسبوعية جديدة');
            await loadData();
            await loadEntries(plan);
        } catch (error: any) {
            toast.error(getActionableErrorMessage(error, 'ar'));
        } finally {
            setSaving(null);
        }
    };

    const updatePlanStatus = async (status: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT') => {
        if (!selectedPlan) return;
        setSaving(`plan-${status}`);
        try {
            const updated = await apiRequest<ShiftPlan>(`/hr-extended/schedules/plans/${selectedPlan.id}`, {
                method: 'PUT',
                body: JSON.stringify({ status }),
            });
            toast.success(status === 'PUBLISHED' ? 'تم اعتماد ونشر الخطة' : 'تم تحديث حالة الخطة');
            setSelectedPlan(updated);
            await loadData();
        } catch (error: any) {
            toast.error(getActionableErrorMessage(error, 'ar'));
        } finally {
            setSaving(null);
        }
    };

    const createTemplate = async () => {
        if (!branchId) return toast.error('اختار فرع أولا');
        if (!templateForm.name.trim()) return toast.error('اسم الوردية مطلوب');
        setSaving('template');
        try {
            await apiRequest('/hr-extended/shift-templates', {
                method: 'POST',
                body: JSON.stringify({
                    branchId,
                    name: templateForm.name.trim(),
                    code: templateForm.code.trim() || undefined,
                    startTime: templateForm.startTime,
                    endTime: templateForm.endTime,
                    breakMinutes: Number(templateForm.breakMinutes || 0),
                    isOvernight: templateForm.isOvernight,
                    workDays: ['sun', 'mon', 'tue', 'wed', 'thu'],
                    isActive: true,
                }),
            });
            toast.success('تم حفظ قالب الوردية');
            setTemplateForm({ name: '', code: '', startTime: '09:00', endTime: '17:00', breakMinutes: '0', isOvernight: false });
            await loadData();
        } catch (error: any) {
            toast.error(getActionableErrorMessage(error, 'ar'));
        } finally {
            setSaving(null);
        }
    };

    const selectCell = (employeeId: string, date: string) => {
        const firstEntry = entriesByCell.get(`${employeeId}|${date}`)?.[0];
        setSelectedCell({ employeeId, date });
        setEntryForm({
            employeeId,
            date,
            shiftTemplateId: firstEntry?.shiftTemplateId || '',
            startTime: firstEntry?.startTime || '',
            endTime: firstEntry?.endTime || '',
            status: firstEntry?.status || 'PLANNED',
            notes: firstEntry?.notes || '',
        });
    };

    const applyTemplateToForm = (templateId: string) => {
        const template = templateById.get(templateId);
        setEntryForm((prev) => ({
            ...prev,
            shiftTemplateId: templateId,
            startTime: template?.startTime || prev.startTime,
            endTime: template?.endTime || prev.endTime,
            status: prev.status === 'OFF' ? 'PLANNED' : prev.status,
        }));
    };

    const createEntry = async (statusOverride?: string) => {
        if (!selectedPlan) return toast.error('اختار خطة أسبوعية أولا');
        if (!entryForm.employeeId || !entryForm.date) return toast.error('اختار موظف ويوم');
        const status = statusOverride || entryForm.status;
        if (status !== 'OFF' && !entryForm.shiftTemplateId && (!entryForm.startTime || !entryForm.endTime)) {
            return toast.error('اختار قالب وردية أو حدد وقت البداية والنهاية');
        }
        setSaving('entry');
        try {
            await apiRequest('/hr-extended/schedules/entries', {
                method: 'POST',
                body: JSON.stringify({
                    planId: selectedPlan.id,
                    branchId: selectedPlan.branchId || branchId,
                    employeeId: entryForm.employeeId,
                    date: entryForm.date,
                    shiftTemplateId: status === 'OFF' ? undefined : entryForm.shiftTemplateId || undefined,
                    startTime: status === 'OFF' ? undefined : entryForm.startTime || undefined,
                    endTime: status === 'OFF' ? undefined : entryForm.endTime || undefined,
                    status,
                    notes: entryForm.notes || undefined,
                }),
            });
            toast.success(status === 'OFF' ? 'تم تسجيل يوم راحة' : 'تم تعيين الوردية');
            await loadEntries(selectedPlan);
        } catch (error: any) {
            const message = String(error?.message || '');
            toast.error(message.includes('SHIFT_CONFLICT') ? 'يوجد تعارض ورديات لنفس الموظف في هذا اليوم' : getActionableErrorMessage(error, 'ar'));
        } finally {
            setSaving(null);
        }
    };

    const updateEntryStatus = async (entry: ShiftEntry, status: string) => {
        if (!selectedPlan) return;
        setSaving(`entry-${entry.id}`);
        try {
            await apiRequest(`/hr-extended/schedules/entries/${entry.id}`, {
                method: 'PUT',
                body: JSON.stringify({ status }),
            });
            await loadEntries(selectedPlan);
        } catch (error: any) {
            toast.error(getActionableErrorMessage(error, 'ar'));
        } finally {
            setSaving(null);
        }
    };

    const copyFirstEmployeeWeek = async () => {
        if (!selectedPlan || filteredEmployees.length < 2) return;
        const sourceEmployee = filteredEmployees[0];
        const sourceEntries = entries.filter((entry) => entry.employeeId === sourceEmployee.id);
        if (sourceEntries.length === 0) return toast.error('أول موظف في القائمة ليس لديه ورديات لنسخها');
        setSaving('copy-week');
        try {
            for (const employee of filteredEmployees.slice(1)) {
                for (const entry of sourceEntries) {
                    await apiRequest('/hr-extended/schedules/entries', {
                        method: 'POST',
                        body: JSON.stringify({
                            planId: selectedPlan.id,
                            branchId: selectedPlan.branchId || branchId,
                            employeeId: employee.id,
                            date: entry.date,
                            shiftTemplateId: entry.shiftTemplateId || undefined,
                            startTime: entry.startTime || undefined,
                            endTime: entry.endTime || undefined,
                            status: entry.status,
                            notes: entry.notes || undefined,
                        }),
                    }).catch(() => null);
                }
            }
            toast.success('تم نسخ نمط أول موظف لباقي القائمة بدون إيقاف التعارضات');
            await loadEntries(selectedPlan);
        } finally {
            setSaving(null);
        }
    };

    const firstSelectedEmployee = employees.find((employee) => employee.id === entryForm.employeeId);

    return (
        <div className="min-h-screen bg-app text-main" dir="rtl">
            <div className="mx-auto flex max-w-[1900px] flex-col gap-5 px-4 py-5 lg:px-7">
                <header className="flex flex-col gap-4 border-b border-border/30 pb-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-600">
                            <Calendar size={24} />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-2xl font-black tracking-tight md:text-3xl">الجدولة والورديات</h1>
                                <span className="rounded-full border border-border bg-elevated px-3 py-1 text-[10px] font-black text-muted">
                                    {branchId || 'كل الفروع'}
                                </span>
                            </div>
                            <p className="mt-1 text-xs font-bold text-muted">
                                خطط أسبوعية واضحة، تعيين سريع للورديات، ومراجعة التعارضات قبل الاعتماد.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={loadData} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-black text-main hover:bg-elevated">
                            <RefreshCw size={15} /> تحديث
                        </button>
                        <button onClick={() => createPlan(0)} disabled={saving === 'plan'} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-black text-main hover:bg-elevated disabled:opacity-50">
                            <Calendar size={15} /> خطة الأسبوع الحالي
                        </button>
                        <button onClick={() => createPlan(1)} disabled={saving === 'plan'} className="inline-flex h-11 items-center gap-2 rounded-xl bg-main px-5 text-xs font-black text-app disabled:opacity-50">
                            {saving === 'plan' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} خطة الأسبوع القادم
                        </button>
                    </div>
                </header>

                <section className="grid gap-3 md:grid-cols-4">
                    {[
                        { label: 'ورديات مخططة', value: stats.entries, icon: Clock, tone: 'text-blue-600' },
                        { label: 'موظفون مغطون', value: stats.coveredEmployees, icon: Users, tone: 'text-emerald-600' },
                        { label: 'إجمالي ساعات الأسبوع', value: `${stats.plannedHours}h`, icon: Timer, tone: 'text-violet-600' },
                        { label: 'أيام بلا تعيين', value: stats.uncoveredDays, icon: AlertTriangle, tone: 'text-amber-600' },
                    ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-border bg-card px-4 py-3">
                            <div className="mb-2 flex items-center justify-between text-xs font-black text-muted">
                                <span>{item.label}</span>
                                <item.icon size={16} className={item.tone} />
                            </div>
                            <div className="text-2xl font-black tabular-nums">{item.value}</div>
                        </div>
                    ))}
                </section>

                <div className="grid min-h-[720px] grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
                    <aside className="flex flex-col gap-4">
                        <div className="rounded-2xl border border-border bg-card">
                            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                                <h2 className="text-sm font-black">خطط الأسبوع</h2>
                                <span className="text-xs font-black text-muted">{plans.length}</span>
                            </div>
                            <div className="max-h-[430px] space-y-2 overflow-y-auto p-3">
                                {loading ? (
                                    <div className="flex h-40 items-center justify-center text-muted"><Loader2 className="animate-spin" /></div>
                                ) : plans.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs font-bold text-muted">
                                        لا توجد خطط. أنشئ خطة للأسبوع الحالي أو القادم.
                                    </div>
                                ) : plans.map((plan) => (
                                    <button
                                        key={plan.id}
                                        onClick={() => loadEntries(plan)}
                                        className={`w-full rounded-xl border p-3 text-right transition hover:bg-elevated ${selectedPlan?.id === plan.id ? 'border-blue-500/40 bg-blue-500/10' : 'border-border bg-app/50'}`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-black">{plan.name}</div>
                                                <div className="mt-1 text-[11px] font-bold text-muted">{formatDate(plan.weekStart)} - {formatDate(plan.weekEnd)}</div>
                                            </div>
                                            <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${STATUS_CLASS[plan.status] || STATUS_CLASS.DRAFT}`}>
                                                {STATUS_LABEL[plan.status] || plan.status}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-border bg-card p-4">
                            <h2 className="mb-3 text-sm font-black">قالب وردية سريع</h2>
                            <div className="grid grid-cols-2 gap-2">
                                <input value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} placeholder="اسم الوردية" className="col-span-2 h-10 rounded-xl border border-border bg-app px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                <input value={templateForm.code} onChange={(event) => setTemplateForm({ ...templateForm, code: event.target.value })} placeholder="كود اختياري" className="h-10 rounded-xl border border-border bg-app px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                <input value={templateForm.breakMinutes} onChange={(event) => setTemplateForm({ ...templateForm, breakMinutes: event.target.value })} placeholder="راحة بالدقائق" className="h-10 rounded-xl border border-border bg-app px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                <input type="time" value={templateForm.startTime} onChange={(event) => setTemplateForm({ ...templateForm, startTime: event.target.value })} className="h-10 rounded-xl border border-border bg-app px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                <input type="time" value={templateForm.endTime} onChange={(event) => setTemplateForm({ ...templateForm, endTime: event.target.value })} className="h-10 rounded-xl border border-border bg-app px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                <label className="col-span-2 flex h-10 items-center justify-between rounded-xl border border-border bg-app px-3 text-xs font-bold text-muted">
                                    وردية ممتدة لليوم التالي
                                    <input type="checkbox" checked={templateForm.isOvernight} onChange={(event) => setTemplateForm({ ...templateForm, isOvernight: event.target.checked })} />
                                </label>
                                <button onClick={createTemplate} disabled={saving === 'template'} className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-50">
                                    {saving === 'template' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} حفظ القالب
                                </button>
                            </div>
                        </div>
                    </aside>

                    <main className="min-w-0 rounded-2xl border border-border bg-card">
                        {selectedPlan ? (
                            <>
                                <div className="flex flex-col gap-3 border-b border-border/50 p-4 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-lg font-black">{selectedPlan.name}</h2>
                                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${STATUS_CLASS[selectedPlan.status] || STATUS_CLASS.DRAFT}`}>
                                                {STATUS_LABEL[selectedPlan.status] || selectedPlan.status}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs font-bold text-muted">الأسبوع من {formatDate(selectedPlan.weekStart)} إلى {formatDate(selectedPlan.weekEnd)}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="relative">
                                            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                                            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث باسم أو كود موظف" className="h-10 w-64 rounded-xl border border-border bg-app pr-9 pl-3 text-xs font-bold outline-none focus:border-blue-500" />
                                        </div>
                                        <button onClick={copyFirstEmployeeWeek} disabled={saving === 'copy-week'} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-app px-3 text-xs font-black hover:bg-elevated disabled:opacity-50">
                                            <Copy size={14} /> نسخ النمط
                                        </button>
                                        {selectedPlan.status === 'DRAFT' ? (
                                            <button onClick={() => updatePlanStatus('PUBLISHED')} disabled={saving === 'plan-PUBLISHED'} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-50">
                                                <ShieldCheck size={14} /> اعتماد
                                            </button>
                                        ) : (
                                            <button onClick={() => updatePlanStatus('DRAFT')} disabled={saving === 'plan-DRAFT'} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-app px-4 text-xs font-black hover:bg-elevated disabled:opacity-50">
                                                <ChevronRight size={14} /> إرجاع لمسودة
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="overflow-auto">
                                    <div className="min-w-[980px]">
                                        <div className="grid grid-cols-[250px_repeat(7,minmax(118px,1fr))] border-b border-border/50 bg-elevated/40">
                                            <div className="sticky right-0 z-20 border-l border-border/50 bg-elevated/95 px-4 py-3 text-xs font-black text-muted">الموظف</div>
                                            {weekDays.map((day) => (
                                                <div key={day.date} className="border-l border-border/50 px-3 py-3 text-center">
                                                    <div className="text-xs font-black">{day.label}</div>
                                                    <div className="mt-1 text-[10px] font-bold text-muted">{day.short}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="max-h-[620px]">
                                            {filteredEmployees.map((employee, rowIndex) => (
                                                <motion.div
                                                    key={employee.id}
                                                    initial={{ opacity: 0, y: 6 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: Math.min(rowIndex * 0.01, 0.25) }}
                                                    className="grid grid-cols-[250px_repeat(7,minmax(118px,1fr))] border-b border-border/40"
                                                >
                                                    <div className="sticky right-0 z-10 flex items-center gap-3 border-l border-border/50 bg-card/95 px-4 py-3">
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-xs font-black text-blue-600">
                                                            {(employee.name || '?').slice(0, 2)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-black">{employee.name}</div>
                                                            <div className="truncate text-[10px] font-bold text-muted">{employee.employeeCode || employee.attendanceCode || employee.role || 'بدون كود'}</div>
                                                        </div>
                                                    </div>
                                                    {weekDays.map((day) => {
                                                        const cellEntries = entriesByCell.get(`${employee.id}|${day.date}`) || [];
                                                        const active = selectedCell?.employeeId === employee.id && selectedCell?.date === day.date;
                                                        return (
                                                            <button
                                                                key={`${employee.id}-${day.date}`}
                                                                onClick={() => selectCell(employee.id, day.date)}
                                                                className={`min-h-[92px] border-l border-border/40 p-2 text-right transition hover:bg-blue-500/5 ${active ? 'bg-blue-500/10 ring-2 ring-inset ring-blue-500/30' : 'bg-card'}`}
                                                            >
                                                                {cellEntries.length === 0 ? (
                                                                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border text-[10px] font-black text-muted/70">
                                                                        تعيين
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-1.5">
                                                                        {cellEntries.map((entry) => {
                                                                            const template = entry.shiftTemplateId ? templateById.get(entry.shiftTemplateId) : null;
                                                                            return (
                                                                                <div key={entry.id} className={`rounded-xl border px-2 py-2 ${STATUS_CLASS[entry.status] || STATUS_CLASS.PLANNED}`}>
                                                                                    <div className="flex items-center justify-between gap-2">
                                                                                        <span className="truncate text-[11px] font-black">{entry.status === 'OFF' ? 'راحة' : template?.name || 'وردية مخصصة'}</span>
                                                                                        {saving === `entry-${entry.id}` && <Loader2 size={12} className="animate-spin" />}
                                                                                    </div>
                                                                                    {entry.status !== 'OFF' && (
                                                                                        <div className="mt-1 flex items-center gap-1 text-[10px] font-bold tabular-nums">
                                                                                            <Clock size={11} /> {compactTime(entry.startTime)} - {compactTime(entry.endTime)}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </motion.div>
                                            ))}

                                            {!loading && filteredEmployees.length === 0 && (
                                                <div className="flex h-52 items-center justify-center text-sm font-bold text-muted">
                                                    لا يوجد موظفون مطابقون للبحث في هذا الفرع.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex h-full min-h-[620px] flex-col items-center justify-center p-8 text-center">
                                <Calendar className="mb-4 text-muted" size={54} />
                                <h2 className="text-xl font-black">اختار أو أنشئ خطة أسبوعية</h2>
                                <p className="mt-2 max-w-sm text-xs font-bold leading-6 text-muted">
                                    بعد اختيار الخطة ستظهر شبكة الموظفين وأيام الأسبوع لتوزيع الورديات مباشرة.
                                </p>
                            </div>
                        )}
                    </main>

                    <aside className="flex flex-col gap-4">
                        <div className="rounded-2xl border border-border bg-card p-4">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-sm font-black">تعيين سريع</h2>
                                <span className="text-[10px] font-black text-muted">{selectedCell ? formatDate(selectedCell.date) : 'اختر خلية'}</span>
                            </div>

                            <div className="space-y-3">
                                <select value={entryForm.employeeId} onChange={(event) => setEntryForm({ ...entryForm, employeeId: event.target.value })} className="h-11 w-full rounded-xl border border-border bg-app px-3 text-xs font-bold outline-none focus:border-blue-500">
                                    <option value="">اختار الموظف</option>
                                    {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                                </select>
                                <input type="date" value={entryForm.date} onChange={(event) => setEntryForm({ ...entryForm, date: event.target.value })} className="h-11 w-full rounded-xl border border-border bg-app px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                <select value={entryForm.shiftTemplateId} onChange={(event) => applyTemplateToForm(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-app px-3 text-xs font-bold outline-none focus:border-blue-500">
                                    <option value="">وردية مخصصة / بدون قالب</option>
                                    {templates.map((template) => (
                                        <option key={template.id} value={template.id}>{template.name} ({compactTime(template.startTime)} - {compactTime(template.endTime)})</option>
                                    ))}
                                </select>
                                <div className="grid grid-cols-2 gap-2">
                                    <input type="time" value={entryForm.startTime} onChange={(event) => setEntryForm({ ...entryForm, startTime: event.target.value })} className="h-11 rounded-xl border border-border bg-app px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                    <input type="time" value={entryForm.endTime} onChange={(event) => setEntryForm({ ...entryForm, endTime: event.target.value })} className="h-11 rounded-xl border border-border bg-app px-3 text-xs font-bold outline-none focus:border-blue-500" />
                                </div>
                                <select value={entryForm.status} onChange={(event) => setEntryForm({ ...entryForm, status: event.target.value })} className="h-11 w-full rounded-xl border border-border bg-app px-3 text-xs font-bold outline-none focus:border-blue-500">
                                    <option value="PLANNED">مخطط</option>
                                    <option value="CONFIRMED">مؤكد</option>
                                    <option value="OFF">راحة</option>
                                    <option value="ABSENT">غياب</option>
                                    <option value="CANCELLED">ملغي</option>
                                </select>
                                <textarea value={entryForm.notes} onChange={(event) => setEntryForm({ ...entryForm, notes: event.target.value })} placeholder="ملاحظات اختيارية" className="min-h-20 w-full resize-none rounded-xl border border-border bg-app p-3 text-xs font-bold outline-none focus:border-blue-500" />

                                {firstSelectedEmployee && (
                                    <div className="rounded-xl border border-border bg-elevated/50 p-3 text-xs font-bold text-muted">
                                        سيتم التعيين إلى <span className="text-main">{firstSelectedEmployee.name}</span> يوم <span className="text-main">{formatDate(entryForm.date)}</span>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => createEntry()} disabled={saving === 'entry'} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-50">
                                        {saving === 'entry' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} حفظ
                                    </button>
                                    <button onClick={() => createEntry('OFF')} disabled={saving === 'entry'} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-app text-xs font-black hover:bg-elevated disabled:opacity-50">
                                        <Moon size={14} /> راحة
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-border bg-card p-4">
                            <h2 className="mb-3 text-sm font-black">الخلية المحددة</h2>
                            {!selectedCell ? (
                                <p className="text-xs font-bold leading-6 text-muted">اضغط على أي يوم أمام موظف لعرض الورديات الموجودة وتعديل حالتها.</p>
                            ) : (
                                <div className="space-y-2">
                                    {(entriesByCell.get(`${selectedCell.employeeId}|${selectedCell.date}`) || []).length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs font-bold text-muted">لا توجد ورديات في هذه الخلية.</div>
                                    ) : (entriesByCell.get(`${selectedCell.employeeId}|${selectedCell.date}`) || []).map((entry) => (
                                        <div key={entry.id} className="rounded-xl border border-border bg-app p-3">
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <span className="text-xs font-black">{entry.status === 'OFF' ? 'راحة' : templateById.get(entry.shiftTemplateId || '')?.name || 'وردية مخصصة'}</span>
                                                <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${STATUS_CLASS[entry.status] || STATUS_CLASS.PLANNED}`}>{STATUS_LABEL[entry.status] || entry.status}</span>
                                            </div>
                                            <div className="mb-3 text-[11px] font-bold text-muted">{compactTime(entry.startTime)} - {compactTime(entry.endTime)}</div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button onClick={() => updateEntryStatus(entry, 'CONFIRMED')} className="h-9 rounded-lg bg-emerald-500/10 text-[10px] font-black text-emerald-600">تأكيد</button>
                                                <button onClick={() => updateEntryStatus(entry, 'ABSENT')} className="h-9 rounded-lg bg-rose-500/10 text-[10px] font-black text-rose-600">غياب</button>
                                                <button onClick={() => updateEntryStatus(entry, 'OFF')} className="h-9 rounded-lg bg-slate-500/10 text-[10px] font-black text-slate-600">راحة</button>
                                                <button onClick={() => updateEntryStatus(entry, 'CANCELLED')} className="h-9 rounded-lg bg-zinc-500/10 text-[10px] font-black text-zinc-600">إلغاء</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-700">
                            <div className="mb-2 flex items-center gap-2 text-sm font-black">
                                <AlertTriangle size={16} /> ملاحظات التشغيل
                            </div>
                            <p className="text-xs font-bold leading-6">
                                النظام يمنع تعارض وقتين لنفس الموظف في نفس اليوم. بعد اعتماد الخطة تظل قابلة للرجوع لمسودة لو احتجت تعديل سريع.
                            </p>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
