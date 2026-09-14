import React, { useEffect, useMemo, useState } from 'react';
import {
    Bike, MapPin, Phone, Banknote, CheckCircle2, XCircle,
    Plus, RefreshCw, Search, X,
} from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { useOrderStore } from '../stores/useOrderStore';
import { Driver, OrderStatus, OrderType } from '../types';
import { deliveryApi } from '../services/api/delivery';
import { socketService } from '../services/socketService';
import { useConfirm } from './common/ConfirmProvider';
import DeliveryTrackingMap from './common/DeliveryTrackingMap';
import { getCashToCollect } from '../src/features/driver/cashCollection';

type Telemetry = { driverId: string; lat: number; lng: number; updatedAt: string };

const STATUS_ORDER: Driver['status'][] = ['AVAILABLE', 'BREAK', 'OFFLINE'];

const statusTone: Record<string, string> = {
    AVAILABLE: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    ON_DELIVERY: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/30',
    BREAK: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    OFFLINE: 'bg-slate-500/10 text-muted border-border/40',
    RETURNING: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
};

const toUiStatus = (s?: string): Driver['status'] => {
    const v = String(s || 'OFFLINE').toUpperCase();
    if (v === 'BUSY') return 'ON_DELIVERY';
    if (['AVAILABLE', 'ON_DELIVERY', 'BREAK', 'OFFLINE', 'RETURNING'].includes(v)) return v as Driver['status'];
    return 'OFFLINE';
};

const DriversHub: React.FC = () => {
    const { settings } = useAuthStore();
    const { orders, fetchOrders } = useOrderStore();
    const { confirm } = useConfirm();
    const lang = settings.language || 'en';
    const isAr = lang === 'ar';
    const branchId = settings.activeBranchId;

    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [telemetry, setTelemetry] = useState<Record<string, Telemetry>>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | Driver['status']>('ALL');
    const [showMap, setShowMap] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<Driver | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', pin: '', vehicleType: 'BIKE', createLogin: true });
    const [checkins, setCheckins] = useState<any[]>([]);
    const [settleTarget, setSettleTarget] = useState<Driver | null>(null);
    const [settleAmount, setSettleAmount] = useState('');
    const [settleBusy, setSettleBusy] = useState(false);
    const [settleReceipt, setSettleReceipt] = useState<any | null>(null);

    const load = async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError(null);
        try {
            const [list, fixes] = await Promise.all([
                deliveryApi.getDrivers(branchId ? { branchId } : undefined),
                deliveryApi.getTelemetry(branchId || undefined).catch(() => []),
            ]);
            setDrivers((list || []).map((d: any) => ({
                id: String(d.id), name: String(d.name || ''), phone: String(d.phone || ''),
                status: toUiStatus(d.status), vehicleType: d.vehicleType || d.vehicle_type || 'BIKE',
                branchId: d.branchId || d.branch_id, isActive: d.isActive !== false && d.is_active !== false,
                currentCashBalance: Number(d.currentCashBalance ?? d.current_cash_balance ?? 0),
            })));
            const map: Record<string, Telemetry> = {};
            for (const t of fixes || []) map[t.driverId] = t;
            setTelemetry(map);
            await fetchOrders(branchId ? { branch_id: branchId, limit: 150 } : { limit: 150 });
        } catch (e: any) {
            if (!silent) setError(e?.message || (isAr ? 'تعذر التحميل' : 'Load failed'));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const loadCheckins = async () => {
        try {
            const rows = await deliveryApi.getCheckins('REQUESTED');
            setCheckins(Array.isArray(rows) ? rows : []);
        } catch { /* inbox degrades gracefully */ }
    };

    useEffect(() => { load(); loadCheckins(); }, [branchId]);
    useEffect(() => {
        const refresh = () => { load(true); loadCheckins(); };
        const onStatus = (p: { id: string; status: string }) =>
            setDrivers((prev) => prev.map((d) => (d.id === p.id ? { ...d, status: toUiStatus(p.status) } : d)));
        const onCash = (p: { id: string; balance: number }) => {
            if (p?.id !== undefined) setDrivers((prev) => prev.map((d) => (d.id === String(p.id) ? { ...d, currentCashBalance: Number(p.balance ?? 0) } : d)));
        };
        const onCheckin = () => loadCheckins();
        // Live GPS: move the pilot marker the moment a fix lands (30s poll stays as fallback).
        const onLocation = (p: { driverId: string; lat: number; lng: number; updatedAt: string; speedKmh?: number; accuracy?: number }) => {
            if (!p || !p.driverId || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) return;
            setTelemetry((prev) => ({
                ...prev,
                [p.driverId]: {
                    ...prev[p.driverId],
                    driverId: p.driverId,
                    lat: Number(p.lat),
                    lng: Number(p.lng),
                    updatedAt: p.updatedAt || new Date().toISOString(),
                    ...(p.speedKmh !== undefined ? { speedKmh: p.speedKmh } : {}),
                    ...(p.accuracy !== undefined ? { accuracy: p.accuracy } : {}),
                } as any,
            }));
        };
        socketService.on('driver:status', onStatus as any);
        socketService.on('driver:cash', onCash as any);
        socketService.on('driver:checkin', onCheckin as any);
        socketService.on('driver:location', onLocation as any);
        socketService.on('order:status', refresh);
        socketService.on('dispatch:assigned', refresh);
        const timer = window.setInterval(refresh, 30000);
        return () => {
            socketService.off('driver:status', onStatus as any);
            socketService.off('driver:cash', onCash as any);
            socketService.off('driver:checkin', onCheckin as any);
            socketService.off('driver:location', onLocation as any);
            socketService.off('order:status', refresh);
            socketService.off('dispatch:assigned', refresh);
            window.clearInterval(timer);
        };
    }, [branchId]);

    const loadByDriver = useMemo(() => {
        const map: Record<string, { count: number; cash: number }> = {};
        for (const o of orders) {
            if (o.type !== OrderType.DELIVERY || !o.driverId) continue;
            if (!['READY', 'OUT_FOR_DELIVERY', 'ASSIGNED'].includes(String(o.status))) continue;
            const e = map[o.driverId] || { count: 0, cash: 0 };
            e.count += 1;
            e.cash += getCashToCollect(o);
            map[o.driverId] = e;
        }
        return map;
    }, [orders]);

    const lastSeen = (id: string) => {
        const t = telemetry[id];
        if (!t?.updatedAt) return isAr ? 'لا موقع' : 'No fix';
        const m = Math.max(0, Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 60000));
        return m === 0 ? (isAr ? 'الآن' : 'now') : isAr ? `منذ ${m} د` : `${m}m ago`;
    };

    const counts = useMemo(() => ({
        available: drivers.filter((d) => d.status === 'AVAILABLE').length,
        road: drivers.filter((d) => d.status === 'ON_DELIVERY').length,
        off: drivers.filter((d) => !['AVAILABLE', 'ON_DELIVERY'].includes(d.status || '')).length,
    }), [drivers]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return drivers
            .filter((d) => d.isActive !== false)
            .filter((d) => statusFilter === 'ALL' || d.status === statusFilter)
            .filter((d) => !q || d.name.toLowerCase().includes(q) || d.phone.includes(q))
            .sort((a, b) => {
                const rank = (s?: string) => (s === 'AVAILABLE' ? 0 : s === 'ON_DELIVERY' ? 1 : 2);
                return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name);
            });
    }, [drivers, query, statusFilter]);

    const cycleStatus = async (driver: Driver) => {
        const next = STATUS_ORDER[(STATUS_ORDER.indexOf(driver.status as any) + 1 + STATUS_ORDER.length) % STATUS_ORDER.length] || 'AVAILABLE';
        try {
            await deliveryApi.updateDriverStatus(driver.id, next === 'ON_DELIVERY' ? 'BUSY' : next);
            setDrivers((prev) => prev.map((d) => (d.id === driver.id ? { ...d, status: next } : d)));
        } catch (e: any) {
            setError(e?.message || (isAr ? 'تعذر التحديث' : 'Update failed'));
        }
    };

    const openAdd = () => {
        setEditing(null);
        setForm({ name: '', phone: '', email: '', password: '', pin: '', vehicleType: 'BIKE', createLogin: true });
        setShowForm(true);
    };

    const openEdit = (driver: Driver) => {
        setEditing(driver);
        setForm({ name: driver.name, phone: driver.phone, email: '', password: '', pin: '', vehicleType: driver.vehicleType || 'BIKE', createLogin: false });
        setShowForm(true);
    };

    const saveForm = async () => {
        if (!form.name.trim() || !form.phone.trim() || !branchId) {
            setError(isAr ? 'الاسم والهاتف والفرع مطلوبة' : 'Name, phone and branch are required');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            if (editing) {
                await deliveryApi.updateDriver(editing.id, { name: form.name.trim(), phone: form.phone.trim() });
                setMessage(isAr ? 'تم حفظ الطيار' : 'Driver saved');
            } else {
                await deliveryApi.createDriver({
                    name: form.name.trim(), phone: form.phone.trim(), branchId,
                    email: form.email.trim() || undefined, password: form.password.trim() || undefined,
                    pin: form.pin.trim() || undefined, createLogin: form.createLogin, status: 'AVAILABLE',
                });
                setMessage(isAr ? 'تمت إضافة الطيار' : 'Driver added');
            }
            setShowForm(false);
            await load(true);
        } catch (e: any) {
            setError(e?.message || (isAr ? 'تعذر الحفظ' : 'Save failed'));
        } finally {
            setSaving(false);
        }
    };

    const openSettle = (driver: Driver) => {
        setSettleTarget(driver);
        setSettleAmount(String(Math.max(0, Number(driver.currentCashBalance || 0)).toFixed(0)));
        setError(null);
    };

    const submitSettle = async () => {
        if (!settleTarget || settleBusy) return;
        const amount = Number(settleAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            setError(isAr ? 'أدخل مبلغاً صحيحاً' : 'Enter a valid amount');
            return;
        }
        const ok = await confirm({
            title: isAr ? 'استلام الكاش من الطيار؟' : 'Collect cash from pilot?',
            message: isAr
                ? `استلام ${amount.toFixed(0)} من ${settleTarget.name}؟ سيتم تصفير حسابه بالمبلغ المستلم.`
                : `Collect ${amount.toFixed(0)} from ${settleTarget.name}? Their balance drops by the received amount.`,
            confirmText: isAr ? 'تم الاستلام' : 'Collected',
            cancelText: isAr ? 'إلغاء' : 'Cancel',
            variant: 'info',
        });
        if (!ok) return;
        setSettleBusy(true);
        try {
            const res = await deliveryApi.settleDriverCash(settleTarget.id, { amount });
            setSettleReceipt({
                receiptId: (res as any).receiptId,
                driverName: settleTarget.name,
                settled: (res as any).settled ?? amount,
                remaining: (res as any).remaining ?? 0,
                at: new Date(),
            });
            setMessage(isAr ? `تم استلام ${Number((res as any).settled ?? amount).toFixed(0)} — المتبقي ${Number((res as any).remaining ?? 0).toFixed(0)}` : `Collected — remaining ${res.remaining}`);
            setSettleTarget(null);
            await load(true);
        } catch (e: any) {
            setError(e?.message || (isAr ? 'فشلت التسوية' : 'Settlement failed'));
        } finally {
            setSettleBusy(false);
        }
    };

    const decideCheckin = async (id: string, approve: boolean) => {
        const ok = await confirm({
            title: approve ? (isAr ? 'اعتماد عودة الطيار؟' : 'Approve pilot return?') : (isAr ? 'رفض العودة؟' : 'Reject return?'),
            message: approve
                ? (isAr ? 'سيصبح الطيار متاحاً رسمياً من لحظة الاعتماد.' : 'The pilot becomes officially available.')
                : (isAr ? 'سيبقى الطيار بحالة عائد حتى طلب جديد.' : 'The pilot stays returning until a new request.'),
            confirmText: approve ? (isAr ? 'اعتماد' : 'Approve') : (isAr ? 'رفض' : 'Reject'),
            cancelText: isAr ? 'إلغاء' : 'Cancel',
            variant: approve ? 'info' : 'danger',
        });
        if (!ok) return;
        try {
            if (approve) await deliveryApi.approveCheckin(id);
            else await deliveryApi.rejectCheckin(id);
            setMessage(approve ? (isAr ? 'تم اعتماد العودة رسمياً' : 'Return officially approved') : (isAr ? 'تم رفض العودة' : 'Return rejected'));
            await Promise.all([load(true), loadCheckins()]);
        } catch (e: any) {
            setError(e?.message || (isAr ? 'فشل القرار' : 'Decision failed'));
        }
    };

    const disableDriver = async (driver: Driver) => {        const ok = await confirm({
            title: isAr ? 'تعطيل الطيار؟' : 'Disable driver?',
            message: isAr ? `سيختفي ${driver.name} من المتاحين.` : `${driver.name} will leave the available pool.`,
            confirmText: isAr ? 'تعطيل' : 'Disable',
            cancelText: isAr ? 'إلغاء' : 'Cancel',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await deliveryApi.updateDriver(driver.id, { status: 'OFFLINE', isActive: false });
            setMessage(isAr ? 'تم التعطيل' : 'Disabled');
            await load(true);
        } catch (e: any) {
            setError(e?.message || (isAr ? 'تعذر التعطيل' : 'Disable failed'));
        }
    };

    return (
        <div className="min-h-screen bg-app p-4 md:p-6 lg:p-8" dir={isAr ? 'rtl' : 'ltr'}>
            <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white"><Bike size={25} /></div>
                    <div>
                        <h1 className="text-2xl font-black text-main">{isAr ? 'الطيارون' : 'Pilots'}</h1>
                        <p className="mt-1 text-sm font-bold text-muted">{isAr ? 'الفريق والحالة والحمولة — بضغطة واحدة' : 'Team, status and load — one tap'}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search size={15} className={`absolute top-1/2 -translate-y-1/2 text-muted ${isAr ? 'right-3' : 'left-3'}`} />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isAr ? 'بحث بالاسم أو الهاتف' : 'Search name or phone'}
                            className={`h-11 w-56 rounded-xl border border-border bg-card text-sm font-bold outline-none focus:border-primary ${isAr ? 'pr-9 pl-3' : 'pl-9 pr-3'}`} />
                    </div>
                    <button onClick={() => setShowMap((v) => !v)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-black text-main">
                        <MapPin size={15} />{isAr ? 'الخريطة' : 'Map'}
                    </button>
                    <button onClick={() => load()} disabled={loading || refreshing} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-black text-main disabled:opacity-60">
                        <RefreshCw size={15} className={loading || refreshing ? 'animate-spin' : ''} />{isAr ? 'تحديث' : 'Refresh'}
                    </button>
                    <button onClick={openAdd} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-white">
                        <Plus size={15} />{isAr ? 'طيار جديد' : 'New pilot'}
                    </button>
                </div>
            </header>

            {(error || message) && (
                <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-bold ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    {error || message}
                </div>
            )}

            <section className="mb-6 grid grid-cols-3 gap-3">
                {[
                    { label: isAr ? 'متاح' : 'Available', value: counts.available, tone: 'text-emerald-600' },
                    { label: isAr ? 'في الطريق' : 'On road', value: counts.road, tone: 'text-indigo-600' },
                    { label: isAr ? 'خارج الخدمة' : 'Off duty', value: counts.off, tone: 'text-muted' },
                ].map((s) => (
                    <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
                        <div className="text-[11px] font-black uppercase tracking-wider text-muted">{s.label}</div>
                        <div className={`mt-1 text-2xl font-black ${s.tone}`}>{s.value}</div>
                    </div>
                ))}
            </section>

            {checkins.length > 0 && (
                <section className="mb-6 rounded-2xl border border-amber-300/50 bg-amber-50/60 p-4">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-amber-800">
                        <CheckCircle2 size={17} />{isAr ? `طلبات عودة بانتظار الاعتماد (${checkins.length})` : `Return requests awaiting approval (${checkins.length})`}
                    </h2>
                    <div className="space-y-2">
                        {checkins.map((c: any) => (
                            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-white/70 px-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-black text-slate-800">{c.driver_name || c.driver_id}</div>
                                    <div className="text-[11px] font-bold text-slate-500" dir="ltr">{c.driver_phone || ''} • {c.requested_at ? new Date(c.requested_at).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                                </div>
                                <button onClick={() => decideCheckin(String(c.id), true)} className="flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-[11px] font-black text-white">
                                    <CheckCircle2 size={14} />{isAr ? 'اعتماد العودة' : 'Approve'}
                                </button>
                                <button onClick={() => decideCheckin(String(c.id), false)} className="flex h-10 items-center gap-1.5 rounded-xl border border-rose-300 px-4 text-[11px] font-black text-rose-600">
                                    <XCircle size={14} />{isAr ? 'رفض' : 'Reject'}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {showMap && (
                <section className="mb-6">
                    <DeliveryTrackingMap
                        lang={lang as any}
                        drivers={drivers.filter((d) => d.isActive !== false).map((d) => ({
                            id: d.id, name: d.name, status: d.status,
                            lat: telemetry[d.id]?.lat, lng: telemetry[d.id]?.lng,
                            speedKmh: (telemetry[d.id] as any)?.speedKmh,
                            accuracyM: (telemetry[d.id] as any)?.accuracy,
                            lastSeenLabel: lastSeen(d.id),
                        }))}
                        orders={[]}
                        heightClass="min-h-[320px]"
                        showSearch={false}
                    />
                </section>
            )}

            <div className="mb-4 flex flex-wrap gap-2">
                {(['ALL', 'AVAILABLE', 'ON_DELIVERY', 'BREAK', 'OFFLINE'] as const).map((s) => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                        className={`h-9 rounded-xl px-4 text-[11px] font-black ${statusFilter === s ? 'bg-primary text-white' : 'border border-border bg-card text-muted'}`}>
                        {s === 'ALL' ? (isAr ? 'الكل' : 'All') : s}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm font-bold text-muted">{isAr ? 'جاري التحميل...' : 'Loading...'}</div>
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm font-black text-muted">
                    {isAr ? 'لا يوجد طيارون مطابقون — أضف طياراً جديداً' : 'No matching pilots — add a new one'}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((driver) => {
                        const load = loadByDriver[driver.id] || { count: 0, cash: 0 };
                        return (
                            <article key={driver.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-black text-primary">
                                            {driver.name.charAt(0) || '?'}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="truncate text-sm font-black text-main">{driver.name}</h3>
                                            <p className="text-[11px] font-bold text-muted" dir="ltr">{driver.phone}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => cycleStatus(driver)} title={isAr ? 'اضغط لتغيير الحالة' : 'Tap to cycle status'}
                                        className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black ${statusTone[driver.status || ''] || statusTone.OFFLINE}`}>
                                        {driver.status}
                                    </button>
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                    <div className="rounded-xl bg-elevated/60 p-2">
                                        <div className="text-sm font-black text-main">{load.count}</div>
                                        <div className="text-[9px] font-bold text-muted">{isAr ? 'طلبات' : 'Orders'}</div>
                                    </div>
                                    <div className="rounded-xl bg-elevated/60 p-2">
                                        <div className="text-sm font-black text-main">{load.cash.toFixed(0)}</div>
                                        <div className="text-[9px] font-bold text-muted">{isAr ? 'تحصيل' : 'Cash'}</div>
                                    </div>
                                    <div className="rounded-xl bg-elevated/60 p-2">
                                        <div className="text-[10px] font-black text-main">{lastSeen(driver.id)}</div>
                                        <div className="text-[9px] font-bold text-muted">{isAr ? 'الموقع' : 'Seen'}</div>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
                                    <Banknote size={16} className="shrink-0 text-emerald-600" />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-black tabular-nums text-main">{Number(driver.currentCashBalance || 0).toFixed(0)}</div>
                                        <div className="text-[9px] font-bold text-muted">{isAr ? 'كاش مع الطيار' : 'Cash held'}</div>
                                    </div>
                                    <button
                                        onClick={() => openSettle(driver)}
                                        disabled={Number(driver.currentCashBalance || 0) <= 0}
                                        className="h-9 shrink-0 rounded-xl bg-emerald-600 px-3 text-[11px] font-black text-white disabled:opacity-40"
                                    >
                                        {isAr ? 'استلام الكاش' : 'Collect'}
                                    </button>
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <a href={`tel:${driver.phone}`} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-elevated/60 text-[11px] font-black text-main">
                                        <Phone size={14} />{isAr ? 'اتصال' : 'Call'}
                                    </a>
                                    <button onClick={() => openEdit(driver)} className="h-10 rounded-xl border border-border px-4 text-[11px] font-black text-muted">
                                        {isAr ? 'تعديل' : 'Edit'}
                                    </button>
                                    <button onClick={() => disableDriver(driver)} className="h-10 rounded-xl bg-rose-500/10 px-4 text-[11px] font-black text-rose-600">
                                        <X size={14} />
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            {showForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && setShowForm(false)}>
                    <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl" dir={isAr ? 'rtl' : 'ltr'} onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-main">{editing ? (isAr ? 'تعديل طيار' : 'Edit pilot') : (isAr ? 'طيار جديد' : 'New pilot')}</h3>
                        <div className="mt-4 space-y-3">
                            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={isAr ? 'الاسم' : 'Name'} className="h-11 w-full rounded-xl border border-border bg-app px-3 text-sm font-bold outline-none focus:border-primary" />
                            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder={isAr ? 'الهاتف' : 'Phone'} dir="ltr" className="h-11 w-full rounded-xl border border-border bg-app px-3 text-sm font-bold outline-none focus:border-primary" />
                            <div className="grid grid-cols-2 gap-3">
                                <select value={form.vehicleType} onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))} className="h-11 rounded-xl border border-border bg-app px-3 text-sm font-bold outline-none">
                                    <option value="BIKE">{isAr ? 'موتوسيكل' : 'Bike'}</option>
                                    <option value="SCOOTER">Scooter</option>
                                    <option value="CAR">{isAr ? 'سيارة' : 'Car'}</option>
                                </select>
                                <input value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))} placeholder="PIN (6 digits)" dir="ltr" className="h-11 rounded-xl border border-border bg-app px-3 text-sm font-bold outline-none focus:border-primary" />
                            </div>
                            {!editing && (
                                <>
                                    <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder={isAr ? 'إيميل الدخول' : 'Login email'} dir="ltr" className="h-11 w-full rounded-xl border border-border bg-app px-3 text-sm font-bold outline-none focus:border-primary" />
                                    <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder={isAr ? 'كلمة المرور' : 'Password'} type="password" className="h-11 w-full rounded-xl border border-border bg-app px-3 text-sm font-bold outline-none focus:border-primary" />
                                    <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-app px-3 text-xs font-black text-muted">
                                        <input type="checkbox" checked={form.createLogin} onChange={(e) => setForm((f) => ({ ...f, createLogin: e.target.checked }))} />
                                        {isAr ? 'إنشاء حساب دخول' : 'Create login'}
                                    </label>
                                </>
                            )}
                        </div>
                        <div className="mt-5 grid grid-cols-2 gap-2">
                            <button onClick={() => !saving && setShowForm(false)} disabled={saving} className="h-12 rounded-2xl bg-elevated/60 text-sm font-black text-main disabled:opacity-50">{isAr ? 'إلغاء' : 'Cancel'}</button>
                            <button onClick={saveForm} disabled={saving} className="h-12 rounded-2xl bg-primary text-sm font-black text-white disabled:opacity-50">
                                {saving ? (isAr ? 'جاري...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {settleTarget && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => !settleBusy && setSettleTarget(null)}>
                    <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl" dir={isAr ? 'rtl' : 'ltr'} onClick={(e) => e.stopPropagation()}>
                        <h3 className="flex items-center gap-2 text-lg font-black text-main">
                            <Banknote size={20} className="text-emerald-600" />
                            {isAr ? `استلام الكاش — ${settleTarget.name}` : `Collect cash — ${settleTarget.name}`}
                        </h3>
                        <p className="mt-1 text-xs font-bold text-muted">
                            {isAr ? `الرصيد الحالي: ${Number(settleTarget.currentCashBalance || 0).toFixed(0)}` : `Current balance: ${Number(settleTarget.currentCashBalance || 0).toFixed(0)}`}
                        </p>
                        <label className="mt-4 block text-xs font-black text-muted">{isAr ? 'المبلغ المستلم فعلياً' : 'Amount actually received'}</label>
                        <input
                            type="number" inputMode="decimal" min={0} step="any"
                            value={settleAmount}
                            onChange={(e) => setSettleAmount(e.target.value)}
                            className="mt-2 h-14 w-full rounded-2xl border border-border bg-app px-4 text-center text-2xl font-black tabular-nums outline-none focus:border-emerald-500"
                        />
                        <div className="mt-5 grid grid-cols-2 gap-2">
                            <button onClick={() => !settleBusy && setSettleTarget(null)} disabled={settleBusy} className="h-12 rounded-2xl bg-elevated/60 text-sm font-black text-main disabled:opacity-50">{isAr ? 'إلغاء' : 'Cancel'}</button>
                            <button onClick={submitSettle} disabled={settleBusy} className="h-12 rounded-2xl bg-emerald-600 text-sm font-black text-white disabled:opacity-50">
                                {settleBusy ? (isAr ? 'جاري...' : 'Saving...') : (isAr ? 'تأكيد الاستلام' : 'Confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {settleReceipt && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setSettleReceipt(null)}>
                    <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-2xl" dir={isAr ? 'rtl' : 'ltr'} onClick={(e) => e.stopPropagation()}>
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                            <CheckCircle2 size={28} />
                        </div>
                        <h3 className="mt-3 text-lg font-black text-main">{isAr ? 'سند استلام كاش' : 'Cash receipt'}</h3>
                        <p className="mt-1 text-xs font-bold text-muted" dir="ltr">#{settleReceipt.receiptId} • {settleReceipt.at ? new Date(settleReceipt.at).toLocaleString(isAr ? 'ar-EG' : 'en-US') : ''}</p>
                        <div className="mt-4 space-y-2 rounded-2xl bg-elevated/60 p-4 text-sm font-black">
                            <div className="flex justify-between"><span className="text-muted">{isAr ? 'الطيار' : 'Pilot'}</span><span className="text-main">{settleReceipt.driverName}</span></div>
                            <div className="flex justify-between"><span className="text-muted">{isAr ? 'المستلم' : 'Received'}</span><span className="tabular-nums text-emerald-600">{Number(settleReceipt.settled).toFixed(0)}</span></div>
                            <div className="flex justify-between"><span className="text-muted">{isAr ? 'المتبقي عليه' : 'Remaining'}</span><span className="tabular-nums text-main">{Number(settleReceipt.remaining).toFixed(0)}</span></div>
                        </div>
                        <button onClick={() => setSettleReceipt(null)} className="mt-5 h-12 w-full rounded-2xl bg-emerald-600 text-sm font-black text-white">
                            {isAr ? 'تم' : 'Done'}
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default DriversHub;
