import React from 'react';
import { Bell, CalendarDays, Check, Clock, ListOrdered, Phone, Plus, Users, X } from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { reservationsApi, waitlistApi } from '../services/api/reservations';
import { useToast } from './Toast';
import { getActionableErrorMessage } from '../services/api/core';

const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ReservationsHub: React.FC = () => {
    const { settings, branches } = useAuthStore();
    const lang = (settings.language || 'ar') as 'ar' | 'en';
    const isAr = lang === 'ar';
    const { showToast } = useToast();
    const branchId = settings.activeBranchId || branches[0]?.id || '';

    const [tab, setTab] = React.useState<'reservations' | 'waitlist'>('reservations');
    const [date, setDate] = React.useState(todayKey());
    const [reservations, setReservations] = React.useState<any[]>([]);
    const [waitlist, setWaitlist] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [showForm, setShowForm] = React.useState(false);
    const [showWaitForm, setShowWaitForm] = React.useState(false);
    const [form, setForm] = React.useState({ customerName: '', customerPhone: '', partySize: 2, time: '', tableId: '', specialRequests: '' });
    const [waitForm, setWaitForm] = React.useState({ customerName: '', customerPhone: '', partySize: 2, quotedTimeMinutes: 15, notes: '' });

    const load = React.useCallback(async () => {
        if (!branchId) return;
        setLoading(true);
        try {
            const [rsv, wl] = await Promise.all([
                reservationsApi.list({ branchId, date }).catch(() => []),
                waitlistApi.list(branchId).catch(() => []),
            ]);
            setReservations(Array.isArray(rsv) ? rsv : []);
            setWaitlist(Array.isArray(wl) ? wl : []);
        } finally {
            setLoading(false);
        }
    }, [branchId, date]);

    React.useEffect(() => { void load(); }, [load]);

    const submitReservation = async () => {
        if (!form.customerName.trim() || !form.customerPhone.trim() || !form.time) {
            showToast(isAr ? 'الاسم والهاتف والوقت مطلوبة' : 'Name, phone and time are required', 'warning');
            return;
        }
        try {
            await reservationsApi.create({
                branchId,
                customerName: form.customerName.trim(),
                customerPhone: form.customerPhone.trim(),
                partySize: Number(form.partySize) || 2,
                date,
                time: form.time,
                tableId: form.tableId.trim() || undefined,
                specialRequests: form.specialRequests.trim() || undefined,
                source: 'PHONE',
            });
            setShowForm(false);
            setForm({ customerName: '', customerPhone: '', partySize: 2, time: '', tableId: '', specialRequests: '' });
            showToast(isAr ? 'تم حفظ الحجز' : 'Reservation saved', 'success');
            await load();
        } catch (e: any) {
            showToast(getActionableErrorMessage(e, lang), 'error');
        }
    };

    const setReservationStatus = async (id: string | number, status: 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW') => {
        try {
            await reservationsApi.setStatus(id, status);
            await load();
        } catch (e: any) {
            showToast(getActionableErrorMessage(e, lang), 'error');
        }
    };

    const submitWaitlist = async () => {
        if (!waitForm.customerName.trim() || !(Number(waitForm.partySize) > 0)) {
            showToast(isAr ? 'الاسم وعدد الأفراد مطلوبان' : 'Name and party size are required', 'warning');
            return;
        }
        try {
            await waitlistApi.add({
                branchId,
                customerName: waitForm.customerName.trim(),
                customerPhone: waitForm.customerPhone.trim() || undefined,
                partySize: Number(waitForm.partySize),
                quotedTimeMinutes: Number(waitForm.quotedTimeMinutes) || 15,
                notes: waitForm.notes.trim() || undefined,
            });
            setShowWaitForm(false);
            setWaitForm({ customerName: '', customerPhone: '', partySize: 2, quotedTimeMinutes: 15, notes: '' });
            showToast(isAr ? 'أُضيف لقائمة الانتظار' : 'Added to waitlist', 'success');
            await load();
        } catch (e: any) {
            showToast(getActionableErrorMessage(e, lang), 'error');
        }
    };

    const setWaitStatus = async (id: string | number, status: string) => {
        try {
            await waitlistApi.setStatus(id, status);
            await load();
        } catch (e: any) {
            showToast(getActionableErrorMessage(e, lang), 'error');
        }
    };

    const statusTone: Record<string, string> = {
        CONFIRMED: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30',
        SEATED: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
        COMPLETED: 'bg-elevated text-muted border-border/50',
        CANCELLED: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
        NO_SHOW: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
        WAITING: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    };

    return (
        <div className="flex flex-col h-full w-full overflow-hidden bg-app" dir={isAr ? 'rtl' : 'ltr'}>
            <div className="shrink-0 bg-card/80 border-b border-border/50 px-4 py-3">
                <div className="max-w-[1200px] mx-auto flex flex-wrap items-center gap-2">
                    <h1 className="text-base font-black text-main flex items-center gap-2">
                        <CalendarDays size={18} className="text-indigo-500" />
                        {isAr ? 'الحجوزات والانتظار' : 'Reservations & Waitlist'}
                    </h1>
                    <div className="flex bg-elevated rounded-xl p-1 border border-border/50">
                        <button onClick={() => setTab('reservations')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'reservations' ? 'bg-indigo-500 text-white shadow' : 'text-muted hover:text-main'}`}>
                            {isAr ? `حجوزات (${reservations.length})` : `Bookings (${reservations.length})`}
                        </button>
                        <button onClick={() => setTab('waitlist')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'waitlist' ? 'bg-amber-500 text-white shadow' : 'text-muted hover:text-main'}`}>
                            {isAr ? `انتظار (${waitlist.length})` : `Waitlist (${waitlist.length})`}
                        </button>
                    </div>
                    <div className="ms-auto flex items-center gap-2">
                        {tab === 'reservations' && (
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-elevated border border-border/50 rounded-xl py-1.5 px-3 text-xs font-bold outline-none text-main" />
                        )}
                        <button
                            onClick={() => (tab === 'reservations' ? setShowForm(true) : setShowWaitForm(true))}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 active:scale-95"
                        >
                            <Plus size={14} /> {isAr ? 'جديد' : 'New'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="max-w-[1200px] mx-auto space-y-2.5">
                    {loading && <p className="text-center text-xs font-bold text-muted animate-pulse py-8">{isAr ? 'جاري التحميل…' : 'Loading…'}</p>}
                    {!loading && tab === 'reservations' && reservations.length === 0 && (
                        <p className="text-center text-xs font-bold text-muted py-10">{isAr ? 'لا حجوزات في هذا اليوم' : 'No bookings for this day'}</p>
                    )}
                    {!loading && tab === 'reservations' && reservations.map((r: any) => (
                        <div key={r.id} className="bg-card border border-border/50 rounded-2xl p-4 flex flex-wrap items-center gap-3">
                            <span className="text-lg font-black tabular-nums text-indigo-500" dir="ltr">{String(r.time || '').slice(0, 5)}</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-black text-main truncate">{r.customerName}</p>
                                <p className="text-[11px] font-bold text-muted flex items-center gap-2 flex-wrap">
                                    <span className="inline-flex items-center gap-1"><Users size={11} /> {r.partySize}</span>
                                    <a href={`tel:${r.customerPhone}`} className="inline-flex items-center gap-1 hover:text-main" dir="ltr"><Phone size={11} /> {r.customerPhone}</a>
                                    {r.specialRequests && <span className="truncate">• {r.specialRequests}</span>}
                                </p>
                            </div>
                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${statusTone[String(r.status)] || statusTone.CONFIRMED}`}>{r.status}</span>
                            <div className="flex items-center gap-1.5">
                                {String(r.status) === 'CONFIRMED' && (
                                    <>
                                        <button onClick={() => void setReservationStatus(r.id, 'SEATED')} title={isAr ? 'تم التسكين' : 'Seated'} className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white transition-all"><Check size={14} /></button>
                                        <button onClick={() => void setReservationStatus(r.id, 'NO_SHOW')} title={isAr ? 'لم يحضر' : 'No-show'} className="p-2 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500 hover:text-white transition-all"><Clock size={14} /></button>
                                    </>
                                )}
                                {['CONFIRMED', 'SEATED'].includes(String(r.status)) && (
                                    <>
                                        {String(r.status) === 'SEATED' && (
                                            <button onClick={() => void setReservationStatus(r.id, 'COMPLETED')} title={isAr ? 'انتهى' : 'Done'} className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/30 hover:bg-indigo-500 hover:text-white transition-all"><Check size={14} /></button>
                                        )}
                                        <button onClick={() => void setReservationStatus(r.id, 'CANCELLED')} title={isAr ? 'إلغاء' : 'Cancel'} className="p-2 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-500 hover:text-white transition-all"><X size={14} /></button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                    {!loading && tab === 'waitlist' && waitlist.length === 0 && (
                        <p className="text-center text-xs font-bold text-muted py-10">{isAr ? 'القائمة فارغة' : 'Waitlist is empty'}</p>
                    )}
                    {!loading && tab === 'waitlist' && waitlist.map((w: any, i: number) => (
                        <div key={w.id} className="bg-card border border-border/50 rounded-2xl p-4 flex flex-wrap items-center gap-3">
                            <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center font-black">{i + 1}</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-black text-main truncate">{w.customerName}</p>
                                <p className="text-[11px] font-bold text-muted flex items-center gap-2 flex-wrap">
                                    <span className="inline-flex items-center gap-1"><Users size={11} /> {w.partySize}</span>
                                    <span className="inline-flex items-center gap-1"><Clock size={11} /> ~{w.quotedTimeMinutes || 15} {isAr ? 'د' : 'min'}</span>
                                    {w.customerPhone && <a href={`tel:${w.customerPhone}`} className="inline-flex items-center gap-1 hover:text-main" dir="ltr"><Phone size={11} /> {w.customerPhone}</a>}
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => void setWaitStatus(w.id, 'SEATED')} title={isAr ? 'تسكين (إشعار)' : 'Seat (notify)'} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
                                    <Bell size={13} /> {isAr ? 'تسكين' : 'Seat'}
                                </button>
                                <button onClick={() => void setWaitStatus(w.id, 'CANCELLED')} title={isAr ? 'إلغاء' : 'Cancel'} className="p-2 rounded-xl bg-elevated border border-border/50 text-muted hover:text-rose-500 transition-all"><X size={14} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {showForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />
                    <div className="relative w-full max-w-md bg-card rounded-2xl border border-border/50 shadow-2xl p-5 space-y-3">
                        <h3 className="text-sm font-black text-main uppercase tracking-widest">{isAr ? 'حجز جديد' : 'New booking'}</h3>
                        <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder={isAr ? 'اسم العميل *' : 'Customer name *'} className="w-full bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:border-indigo-500/50 text-main placeholder-muted" />
                        <div className="grid grid-cols-2 gap-2">
                            <input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} placeholder={isAr ? 'الهاتف *' : 'Phone *'} className="bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:border-indigo-500/50 text-main placeholder-muted" dir="ltr" />
                            <input type="number" min={1} value={form.partySize} onChange={(e) => setForm({ ...form, partySize: Number(e.target.value) })} placeholder={isAr ? 'الأفراد' : 'Party'} className="bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:border-indigo-500/50 text-main" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:border-indigo-500/50 text-main" dir="ltr" />
                            <input value={form.tableId} onChange={(e) => setForm({ ...form, tableId: e.target.value })} placeholder={isAr ? 'طاولة (اختياري)' : 'Table (optional)'} className="bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:border-indigo-500/50 text-main placeholder-muted" />
                        </div>
                        <input value={form.specialRequests} onChange={(e) => setForm({ ...form, specialRequests: e.target.value })} placeholder={isAr ? 'طلبات خاصة' : 'Special requests'} className="w-full bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:border-indigo-500/50 text-main placeholder-muted" />
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setShowForm(false)} className="py-3 rounded-xl border border-border/50 bg-elevated text-muted font-black text-[10px] uppercase tracking-widest">{isAr ? 'إلغاء' : 'Cancel'}</button>
                            <button onClick={() => { void submitReservation(); }} className="py-3 rounded-xl bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest hover:opacity-90">{isAr ? 'حفظ' : 'Save'}</button>
                        </div>
                    </div>
                </div>
            )}

            {showWaitForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setShowWaitForm(false)} />
                    <div className="relative w-full max-w-md bg-card rounded-2xl border border-border/50 shadow-2xl p-5 space-y-3">
                        <h3 className="text-sm font-black text-main uppercase tracking-widest flex items-center gap-2"><ListOrdered size={16} className="text-amber-500" /> {isAr ? 'إضافة للانتظار' : 'Add to waitlist'}</h3>
                        <input value={waitForm.customerName} onChange={(e) => setWaitForm({ ...waitForm, customerName: e.target.value })} placeholder={isAr ? 'اسم العميل *' : 'Customer name *'} className="w-full bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:border-amber-500/50 text-main placeholder-muted" />
                        <div className="grid grid-cols-3 gap-2">
                            <input value={waitForm.customerPhone} onChange={(e) => setWaitForm({ ...waitForm, customerPhone: e.target.value })} placeholder={isAr ? 'الهاتف' : 'Phone'} className="bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:border-amber-500/50 text-main placeholder-muted" dir="ltr" />
                            <input type="number" min={1} value={waitForm.partySize} onChange={(e) => setWaitForm({ ...waitForm, partySize: Number(e.target.value) })} placeholder={isAr ? 'الأفراد' : 'Party'} className="bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:border-amber-500/50 text-main" />
                            <input type="number" min={5} step={5} value={waitForm.quotedTimeMinutes} onChange={(e) => setWaitForm({ ...waitForm, quotedTimeMinutes: Number(e.target.value) })} placeholder={isAr ? 'دقائق' : 'Mins'} className="bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:border-amber-500/50 text-main" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setShowWaitForm(false)} className="py-3 rounded-xl border border-border/50 bg-elevated text-muted font-black text-[10px] uppercase tracking-widest">{isAr ? 'إلغاء' : 'Cancel'}</button>
                            <button onClick={() => { void submitWaitlist(); }} className="py-3 rounded-xl bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest hover:opacity-90">{isAr ? 'إضافة' : 'Add'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReservationsHub;
