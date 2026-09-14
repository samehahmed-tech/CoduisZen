import React from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Plus, UserCheck, X } from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { complaintsApi } from '../services/api/complaints';
import { useToast } from './Toast';
import { getActionableErrorMessage } from '../services/api/core';

const STATUS_FLOW: Record<string, string[]> = {
    OPEN: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['RESOLVED', 'CLOSED'],
    RESOLVED: ['CLOSED', 'OPEN'],
    CLOSED: ['OPEN'],
};

const ComplaintsInbox: React.FC = () => {
    const { settings } = useAuthStore();
    const lang = (settings.language || 'ar') as 'ar' | 'en';
    const isAr = lang === 'ar';
    const { showToast } = useToast();

    const [items, setItems] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [statusFilter, setStatusFilter] = React.useState('OPEN');
    const [showForm, setShowForm] = React.useState(false);
    const [form, setForm] = React.useState({ customerId: '', orderId: '', subject: '', description: '', priority: 'MEDIUM' });
    const [resolvingId, setResolvingId] = React.useState<string | null>(null);
    const [resolution, setResolution] = React.useState('');

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const list = await complaintsApi.list();
            setItems(Array.isArray(list) ? list : []);
        } catch (e: any) {
            showToast(getActionableErrorMessage(e, lang), 'error');
        } finally {
            setLoading(false);
        }
    }, [lang, showToast]);

    React.useEffect(() => { void load(); }, [load]);

    const filtered = items.filter((c) => statusFilter === 'ALL' || String(c.status) === statusFilter);
    const openCount = items.filter((c) => ['OPEN', 'IN_PROGRESS'].includes(String(c.status))).length;

    const submit = async () => {
        if (!form.customerId.trim() || !form.subject.trim() || !form.description.trim()) {
            showToast(isAr ? 'العميل والموضوع والوصف مطلوبة' : 'Customer, subject and description are required', 'warning');
            return;
        }
        try {
            await complaintsApi.create({
                customerId: form.customerId.trim(),
                orderId: form.orderId.trim() || undefined,
                subject: form.subject.trim(),
                description: form.description.trim(),
                priority: form.priority,
            });
            setShowForm(false);
            setForm({ customerId: '', orderId: '', subject: '', description: '', priority: 'MEDIUM' });
            showToast(isAr ? 'تم فتح الشكوى' : 'Complaint opened', 'success');
            await load();
        } catch (e: any) {
            showToast(getActionableErrorMessage(e, lang), 'error');
        }
    };

    const changeStatus = async (id: string, status: string, resolutionNotes?: string) => {
        try {
            await complaintsApi.update(id, { status, resolutionNotes });
            setResolvingId(null);
            setResolution('');
            await load();
        } catch (e: any) {
            showToast(getActionableErrorMessage(e, lang), 'error');
        }
    };

    const tone = (s: string) =>
        s === 'OPEN' ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
        : s === 'IN_PROGRESS' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
        : s === 'RESOLVED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
        : 'bg-elevated text-muted border-border/50';

    const prio = (p: string) =>
        p === 'CRITICAL' ? 'text-rose-500' : p === 'HIGH' ? 'text-amber-600' : 'text-muted';

    return (
        <div className="flex flex-col h-full w-full overflow-hidden bg-app" dir={isAr ? 'rtl' : 'ltr'}>
            <div className="shrink-0 bg-card/80 border-b border-border/50 px-4 py-3">
                <div className="max-w-[1100px] mx-auto flex flex-wrap items-center gap-2">
                    <h1 className="text-base font-black text-main flex items-center gap-2">
                        <Inbox size={18} className="text-amber-500" />
                        {isAr ? `الشكاوى (${openCount} مفتوحة)` : `Complaints (${openCount} open)`}
                    </h1>
                    <div className="flex bg-elevated rounded-xl p-1 border border-border/50">
                        {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ALL'].map((s) => (
                            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === s ? 'bg-indigo-500 text-white shadow' : 'text-muted hover:text-main'}`}>
                                {s}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setShowForm(true)} className="ms-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 active:scale-95">
                        <Plus size={14} /> {isAr ? 'شكوى' : 'New'}
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="max-w-[1100px] mx-auto space-y-2.5">
                    {loading && <p className="text-center text-xs font-bold text-muted animate-pulse py-8">{isAr ? 'جاري التحميل…' : 'Loading…'}</p>}
                    {!loading && filtered.length === 0 && (
                        <p className="text-center text-xs font-bold text-muted py-10">{isAr ? 'لا شكاوى هنا' : 'Nothing here'}</p>
                    )}
                    {filtered.map((c: any) => (
                        <div key={c.id} className="bg-card border border-border/50 rounded-2xl p-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <AlertTriangle size={14} className={prio(String(c.priority))} />
                                <p className="text-sm font-black text-main flex-1 min-w-0 truncate">{c.subject}</p>
                                <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${tone(String(c.status))}`}>{c.status}</span>
                            </div>
                            <p className="mt-1.5 text-xs text-muted font-bold leading-5">{c.description}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-bold text-muted">
                                {c.orderId && <span>#{String(c.orderId).slice(-8)}</span>}
                                {c.assignedTo && <span className="inline-flex items-center gap-1"><UserCheck size={11} /> {c.assignedTo}</span>}
                                {c.resolutionNotes && <span className="text-emerald-600">✓ {c.resolutionNotes}</span>}
                            </div>
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                {(STATUS_FLOW[String(c.status)] || []).map((next) => (
                                    next === 'RESOLVED' ? (
                                        <button key={next} onClick={() => { setResolvingId(String(c.id)); setResolution(''); }} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white text-[9px] font-black uppercase tracking-widest transition-all">
                                            {isAr ? 'حل' : 'Resolve'}
                                        </button>
                                    ) : (
                                        <button key={next} onClick={() => { void changeStatus(String(c.id), next); }} className="px-3 py-1.5 rounded-lg bg-elevated border border-border/50 text-muted hover:text-main text-[9px] font-black uppercase tracking-widest transition-all">
                                            {next}
                                        </button>
                                    )
                                ))}
                                {resolvingId === String(c.id) && (
                                    <span className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                                        <input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder={isAr ? 'ملاحظة الحل…' : 'Resolution note…'} className="flex-1 bg-elevated border border-border/50 rounded-lg py-1.5 px-2 text-[11px] font-bold outline-none text-main" />
                                        <button onClick={() => { void changeStatus(String(c.id), 'RESOLVED', resolution); }} className="p-1.5 rounded-lg bg-emerald-500 text-white"><CheckCircle2 size={14} /></button>
                                        <button onClick={() => setResolvingId(null)} className="p-1.5 rounded-lg bg-elevated border border-border/50 text-muted"><X size={14} /></button>
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {showForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />
                    <div className="relative w-full max-w-md bg-card rounded-2xl border border-border/50 shadow-2xl p-5 space-y-3">
                        <h3 className="text-sm font-black text-main uppercase tracking-widest">{isAr ? 'شكوى جديدة' : 'New complaint'}</h3>
                        <input value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} placeholder={isAr ? 'رقم/هاتف العميل *' : 'Customer id/phone *'} className="w-full bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none text-main placeholder-muted" />
                        <input value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })} placeholder={isAr ? 'رقم الطلب (اختياري)' : 'Order id (optional)'} className="w-full bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none text-main placeholder-muted" />
                        <div className="grid grid-cols-2 gap-2">
                            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder={isAr ? 'الموضوع *' : 'Subject *'} className="bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none text-main placeholder-muted" />
                            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none text-main">
                                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder={isAr ? 'الوصف *' : 'Description *'} className="w-full bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none text-main placeholder-muted resize-none" />
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setShowForm(false)} className="py-3 rounded-xl border border-border/50 bg-elevated text-muted font-black text-[10px] uppercase tracking-widest">{isAr ? 'إلغاء' : 'Cancel'}</button>
                            <button onClick={() => { void submit(); }} className="py-3 rounded-xl bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest hover:opacity-90">{isAr ? 'فتح' : 'Open'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ComplaintsInbox;
