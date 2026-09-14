import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, Bike, CheckCircle2, ChevronDown, Clock, MapPin,
    Phone, RefreshCw, Search, Truck, User, Users,
} from 'lucide-react';
import { useOrderStore } from '../stores/useOrderStore';
import { useAuthStore } from '../stores/useAuthStore';
import { Driver, Order, OrderStatus, OrderType } from '../types';
import { deliveryApi } from '../services/api/delivery';
import { socketService } from '../services/socketService';
import { formatDisplayId } from '../src/utils/idGenerator';
import DeliveryTrackingMap from './common/DeliveryTrackingMap';
import { defaultMapCenter } from './common/googleMaps';
import { useConfirm } from './common/ConfirmProvider';
import { rankDriversForOrder } from '../services/driverAssignment';
import { printDriverTicket } from '../services/posPrintOrchestrator';
import { getCashToCollect } from '../src/features/driver/cashCollection';
import { Link } from 'react-router-dom';

const SLA_MINUTES = 45;

type Tab = 'ready' | 'road' | 'alerts';

const ageMins = (order: Order) => Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000));

const DispatchHub: React.FC = () => {
    const { settings, printers, branches } = useAuthStore();
    const { orders, fetchOrders } = useOrderStore();
    const { confirm } = useConfirm();
    const lang = settings.language || 'en';
    const isAr = lang === 'ar';
    const branchId = settings.activeBranchId;
    const currency = settings.currencySymbol || 'EGP';

    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [telemetry, setTelemetry] = useState<Record<string, { lat: number; lng: number; updatedAt: string; speedKmh?: number; accuracy?: number }>>({});
    const [slaAlerts, setSlaAlerts] = useState<any[]>([]);
    const [tab, setTab] = useState<Tab>('ready');
    const [query, setQuery] = useState('');
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
    const [podOrder, setPodOrder] = useState<Order | null>(null);
    const [podCash, setPodCash] = useState('');
    const [podBusy, setPodBusy] = useState(false);
    // Branch close-out acts as a manager fallback (no OTP in hand): requires
    // manager PIN + written reason, verified server-side.
    const [podPin, setPodPin] = useState('');
    const [podReason, setPodReason] = useState('');
    const [showMap, setShowMap] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const refreshOrders = async (silent = true) => {
        if (!silent) setLoading(true);
        try {
            await fetchOrders(branchId ? { branch_id: branchId, limit: 150 } : { limit: 150 });
        } catch (e: any) {
            if (!silent) setError(e?.message || (isAr ? 'تعذر التحميل' : 'Load failed'));
        } finally {
            setLoading(false);
        }
    };

    const loadDrivers = async () => {
        try {
            const list = await deliveryApi.getDrivers(branchId ? { branchId } : undefined);
            setDrivers((list || []).map((d: any) => ({
                id: String(d.id), name: String(d.name || ''), phone: String(d.phone || ''),
                status: String(d.status || 'OFFLINE').toUpperCase() === 'BUSY' ? 'ON_DELIVERY' : String(d.status || 'OFFLINE').toUpperCase(),
                vehicleType: d.vehicleType || d.vehicle_type || 'BIKE',
                branchId: d.branchId || d.branch_id, isActive: d.isActive !== false && d.is_active !== false,
            })));
        } catch { /* drivers picker degrades gracefully */ }
    };

    const loadTelemetry = async () => {
        try {
            const rows = await deliveryApi.getTelemetry(branchId || undefined).catch(() => []);
            const map: Record<string, { lat: number; lng: number; updatedAt: string }> = {};
            for (const t of rows || []) map[t.driverId] = t;
            setTelemetry(map);
        } catch { /* ignore */ }
    };

    const loadSla = async () => {
        try {
            const r = await deliveryApi.getSlaAlerts(branchId ? { branchId } : undefined);
            setSlaAlerts(Array.isArray(r.alerts) ? r.alerts : []);
        } catch { setSlaAlerts([]); }
    };

    const refreshAll = async (silent = true) => {
        if (!silent) setRefreshing(true);
        setError(null);
        await Promise.all([refreshOrders(true), loadDrivers(), loadTelemetry(), loadSla()]);
        if (!silent) setRefreshing(false);
    };

    useEffect(() => { setLoading(true); refreshAll(true).finally(() => setLoading(false)); }, [branchId]);
    useEffect(() => {
        const ordersOnly = () => refreshOrders(true);
        const onDriverStatus = (p: { id: string; status: string }) =>
            setDrivers((prev) => prev.map((d) => (d.id === p.id ? { ...d, status: p.status } : d)));
        // Live GPS: move the pilot marker the moment a fix lands (30s poll stays as fallback).
        const onDriverLocation = (p: { driverId: string; lat: number; lng: number; updatedAt: string; speedKmh?: number; accuracy?: number }) => {
            if (!p || !p.driverId || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) return;
            setTelemetry((prev) => ({ ...prev, [p.driverId]: { lat: Number(p.lat), lng: Number(p.lng), updatedAt: p.updatedAt || new Date().toISOString(), speedKmh: p.speedKmh, accuracy: p.accuracy } }));
        };
        socketService.on('order:created', ordersOnly);
        socketService.on('order:updated', ordersOnly);
        socketService.on('order:status', ordersOnly);
        socketService.on('dispatch:assigned', ordersOnly);
        socketService.on('driver:status', onDriverStatus as any);
        socketService.on('driver:location', onDriverLocation as any);
        const timer = window.setInterval(() => { loadTelemetry(); loadSla(); }, 30000);
        return () => {
            socketService.off('order:created', ordersOnly);
            socketService.off('order:updated', ordersOnly);
            socketService.off('order:status', ordersOnly);
            socketService.off('dispatch:assigned', ordersOnly);
            socketService.off('driver:status', onDriverStatus as any);
            socketService.off('driver:location', onDriverLocation as any);
            window.clearInterval(timer);
        };
    }, [branchId]);

    const deliveryOrders = useMemo(() => orders
        .filter((o) => o.type === OrderType.DELIVERY)
        .filter((o) => !branchId || o.branchId === branchId), [orders, branchId]);

    const q = query.trim().toLowerCase();
    const matchQuery = (o: Order) => !q
        || String(o.orderNumber || o.id).toLowerCase().includes(q)
        || String(o.customerName || '').toLowerCase().includes(q)
        || String(o.customerPhone || '').includes(q)
        || String(o.deliveryAddress || '').toLowerCase().includes(q);

    const readyOrders = useMemo(() => deliveryOrders
        .filter((o) => String(o.status) !== 'SCHEDULED' && ['READY', 'PREPARING', 'PENDING', 'ASSIGNED'].includes(String(o.status)) && matchQuery(o))
        .sort((a, b) => ageMins(b) - ageMins(a)), [deliveryOrders, q]);

    const roadOrders = useMemo(() => deliveryOrders
        .filter((o) => String(o.status) === OrderStatus.OUT_FOR_DELIVERY && matchQuery(o))
        .sort((a, b) => ageMins(b) - ageMins(a)), [deliveryOrders, q]);

    const criticalAlerts = useMemo(
        () => slaAlerts.filter((a) => ['HIGH', 'CRITICAL'].includes(String(a?.severity || '').toUpperCase())),
        [slaAlerts]);

    const loadByDriver = useMemo(() => {
        const map: Record<string, number> = {};
        for (const o of deliveryOrders) {
            if (!o.driverId || !['READY', 'OUT_FOR_DELIVERY', 'ASSIGNED'].includes(String(o.status))) continue;
            map[o.driverId] = (map[o.driverId] || 0) + 1;
        }
        return map;
    }, [deliveryOrders]);

    const lastSeenMins = (driverId?: string | null) => {
        const t = driverId ? telemetry[driverId] : undefined;
        if (!t?.updatedAt) return null;
        return Math.max(0, Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 60000));
    };

    const rankedFor = (order: Order) => rankDriversForOrder(
        drivers.filter((d) => d.isActive !== false).map((d) => ({
            id: d.id, name: d.name, status: d.status,
            lat: telemetry[d.id]?.lat, lng: telemetry[d.id]?.lng,
            activeOrders: loadByDriver[d.id] || 0,
            lastSeenMinutes: lastSeenMins(d.id) ?? undefined,
        })),
        order.deliveryLat && order.deliveryLng ? { lat: order.deliveryLat, lng: order.deliveryLng } : null,
        defaultMapCenter,
    );

    const assignDriver = async (orderId: string, driverId: string) => {
        if (assigningOrderId) return;
        setAssigningOrderId(orderId);
        setError(null);
        try {
            await deliveryApi.assign({ orderId, driverId });
            setExpandedOrderId(null);
            setMessage(isAr ? 'تم التعيين — بانتظار استلام الطيار' : 'Assigned — awaiting pilot pickup');
            await refreshOrders(true);
            await loadDrivers();
            // Driver ticket (شيك الطيار) — non-blocking: the assignment has
            // already succeeded, so a print failure only warns.
            try {
                const assignedOrder = deliveryOrders.find((o) => o.id === orderId);
                const driver = drivers.find((d) => d.id === driverId);
                if (assignedOrder) {
                    await printDriverTicket({
                        order: assignedOrder,
                        driverName: driver?.name || driverName(driverId),
                        driverPhone: (driver as any)?.phone || undefined,
                        printers,
                        branchId: assignedOrder.branchId || branchId || '',
                        settings,
                        currencySymbol: currency,
                        lang,
                        branch: branches.find((b: any) => b.id === (assignedOrder.branchId || branchId)),
                    });
                }
            } catch {
                setError(isAr ? 'تم التعيين لكن تعذرت طباعة شيك الطيار' : 'Assigned, but the driver ticket failed to print');
            }
        } catch (e: any) {
            const code = String(e?.message || '');
            setError(code.includes('ORDER_NOT_READY_FOR_DISPATCH')
                ? (isAr ? 'الأوردر لسه في المطبخ — التعيين متاح بعد ما يبقى جاهز' : 'Order still in kitchen — assign once it is ready')
                : code.includes('DRIVER_NOT_AVAILABLE')
                    ? (isAr ? 'الطيار غير متاح حالياً' : 'Driver not available right now')
                    : (e?.message || (isAr ? 'تعذر التعيين' : 'Assign failed')));
        } finally {
            setAssigningOrderId(null);
        }
    };

    const openPod = (order: Order) => {
        setPodOrder(order);
        const due = getCashToCollect(order);
        setPodCash(due > 0 ? String(Math.round(due)) : '');
        setPodPin('');
        setPodReason('');
    };

    const submitPod = async () => {
        if (!podOrder || podBusy) return;
        const due = getCashToCollect(podOrder);
        const collected = Number(podCash || 0);
        if (due > 0 && !(Number.isFinite(collected) && collected + 0.01 >= due)) {
            setError(isAr ? `المبلغ يجب أن يغطي المستحق (${due.toFixed(0)})` : `Amount must cover due (${due.toFixed(0)})`);
            return;
        }
        if (!podPin.trim() || podReason.trim().length < 3) {
            setError(isAr ? 'أدخل PIN المدير وسبب الإغلاق من الفرع' : 'Enter manager PIN and branch close-out reason');
            return;
        }
        setPodBusy(true);
        try {
            // Branch fallback path: records cash in the pilot's ledger + burns OTP.
            await deliveryApi.deliverOrder(podOrder.id, {
                cashCollected: due > 0 ? collected : 0,
                managerPin: podPin.trim(),
                notes: podReason.trim(),
            });
            setPodOrder(null);
            setMessage(isAr ? 'تم التسليم' : 'Delivered');
            await refreshAll(true);
        } catch (e: any) {
            setError(e?.message || (isAr ? 'تعذر التأكيد' : 'Confirm failed'));
        } finally {
            setPodBusy(false);
        }
    };

    const driverName = (id?: string | null) => drivers.find((d) => d.id === id)?.name || (id ? `#${String(id).slice(-6)}` : '-');
    const expandedOrder = expandedOrderId ? deliveryOrders.find((o) => o.id === expandedOrderId) : undefined;
    const routeTarget = expandedOrder && String(expandedOrder.status) === OrderStatus.OUT_FOR_DELIVERY && expandedOrder.driverId && telemetry[expandedOrder.driverId]
        ? { from: { lat: telemetry[expandedOrder.driverId].lat, lng: telemetry[expandedOrder.driverId].lng },
            to: (expandedOrder.deliveryLat && expandedOrder.deliveryLng) ? { lat: expandedOrder.deliveryLat, lng: expandedOrder.deliveryLng } : defaultMapCenter }
        : null;

    const renderOrderCard = (order: Order, mode: 'ready' | 'road') => {
        const age = ageMins(order);
        const late = age >= SLA_MINUTES;
        const cash = getCashToCollect(order);
        const assignedName = order.driverId ? driverName(order.driverId) : null;
        const expanded = expandedOrderId === order.id;
        const ranked = mode === 'ready' && expanded ? rankedFor(order).slice(0, 6) : [];
        return (
            <article key={order.id} className={`rounded-2xl border bg-card p-4 shadow-sm ${late ? 'border-rose-300 ring-1 ring-rose-200' : 'border-border'}`}>
                <button className="flex w-full items-start justify-between gap-3 text-start" onClick={() => setExpandedOrderId(expanded ? null : order.id)}>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-main">{formatDisplayId(order)}</span>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-black ${late ? 'bg-rose-100 text-rose-700' : 'bg-elevated text-muted'}`}>{age}m</span>
                            {order.isUrgent && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">{isAr ? 'عاجل' : 'URGENT'}</span>}
                            {cash > 0
                                ? <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black text-emerald-600">{isAr ? 'نقدي' : 'CASH'} {cash.toFixed(0)}</span>
                                : <span className="rounded-full bg-sky-500/15 px-2 py-1 text-[10px] font-black text-sky-600">{isAr ? 'مدفوع' : 'PAID'}</span>}
                        </div>
                        <h3 className="mt-1.5 truncate text-base font-black text-main">{order.customerName || (isAr ? 'عميل دليفري' : 'Delivery customer')}</h3>
                        <p className="mt-1 truncate text-xs font-bold text-muted">{order.deliveryAddress || (isAr ? 'لا عنوان' : 'No address')}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-black tabular-nums text-primary">{Number(order.total || 0).toFixed(0)}</span>
                        <ChevronDown size={16} className={`text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                </button>

                {expanded && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                        <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-muted">
                            {order.customerPhone && <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1 text-primary"><Phone size={13} />{order.customerPhone}</a>}
                            <span className="inline-flex items-center gap-1"><Clock size={13} />{order.status}</span>
                            {order.deliveryNotes && <span className="w-full text-[11px]">{order.deliveryNotes}</span>}
                        </div>

                        {mode === 'ready' ? (
                            <div>
                                {assignedName && (
                                    <p className="mb-2 text-[11px] font-black text-muted">
                                        {isAr ? 'المعيّن حالياً:' : 'Assigned:'} <span className="text-main">{assignedName}</span>
                                        <span className="text-muted"> — {isAr ? 'اختر بديلاً لإعادة التعيين' : 'pick another to reassign'}</span>
                                    </p>
                                )}
                                {!['READY', 'ASSIGNED'].includes(String(order.status)) ? (
                                    <p className="rounded-xl bg-amber-500/10 p-3 text-xs font-black text-amber-700">
                                        {isAr ? 'الأوردر لسه في المطبخ — التعيين للطيار متاح بعد التجهيز' : 'Order still in the kitchen — assign once it is ready'}
                                    </p>
                                ) : ranked.length === 0 ? (
                                    <p className="rounded-xl bg-amber-500/10 p-3 text-xs font-black text-amber-700">
                                        {isAr ? 'لا يوجد طيار متاح — فعّل أحدهم من صفحة الطيارين' : 'No available pilots — activate one from Pilots'}
                                    </p>
                                ) : (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {ranked.map((d, i) => (
                                            <button key={d.id} disabled={assigningOrderId === order.id}
                                                onClick={() => assignDriver(order.id, d.id)}
                                                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-app px-3 py-2.5 text-start transition hover:border-primary disabled:opacity-50">
                                                <span className="min-w-0">
                                                    <span className="block truncate text-xs font-black text-main">
                                                        {i === 0 && <span className="mr-1 rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] text-white">★</span>}{d.name}
                                                    </span>
                                                    <span className="block text-[10px] font-bold text-muted">
                                                        {(loadByDriver[d.id] || 0)} {isAr ? 'طلبات' : 'orders'}
                                                        {d.distanceKm != null && ` · ${d.distanceKm} ${isAr ? 'كم' : 'km'}`}
                                                    </span>
                                                </span>
                                                <User size={16} className="shrink-0 text-muted" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <div className="min-w-0 flex-1 rounded-xl bg-elevated/60 px-3 py-2.5 text-xs font-black text-main">
                                    <Bike size={14} className="mb-1 text-muted" />
                                    {assignedName}
                                    {(order as any).delivery_otp && (
                                        <span className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                                            <span className="text-muted">{isAr ? 'رمز التسليم:' : 'OTP:'}</span>
                                            <span className="rounded-lg bg-elevated border border-border px-2.5 py-1 font-black tabular-nums tracking-[0.2em] text-muted" dir="ltr" title={isAr ? 'أُرسل للعميل واتساب — لا تشاركه' : 'Sent to customer WhatsApp — do not share'}>
                                                ••••
                                            </span>
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => openPod(order)}
                                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white">
                                    <CheckCircle2 size={15} />{isAr ? 'تأكيد التسليم' : 'Confirm delivered'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </article>
        );
    };

    const tabs: { id: Tab; label: string; count: number }[] = [
        { id: 'ready', label: isAr ? 'جاهز للتعيين' : 'Ready', count: readyOrders.length },
        { id: 'road', label: isAr ? 'في الطريق' : 'On road', count: roadOrders.length },
        { id: 'alerts', label: isAr ? 'تنبيهات' : 'Alerts', count: criticalAlerts.length },
    ];

    return (
        <div className="min-h-screen bg-app p-4 md:p-6 lg:p-8" dir={isAr ? 'rtl' : 'ltr'}>
            <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white"><Truck size={25} /></div>
                    <div>
                        <h1 className="text-2xl font-black text-main">{isAr ? 'تسليم الطيارين' : 'Pilot Handover'}</h1>
                        <p className="mt-1 text-sm font-bold text-muted">{isAr ? 'طابور واحد ذكي: تعيين ثم استلام ثم تسليم' : 'One smart queue: assign, pickup, deliver'}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search size={15} className={`absolute top-1/2 -translate-y-1/2 text-muted ${isAr ? 'right-3' : 'left-3'}`} />
                        <input value={query} onChange={(e) => setQuery(e.target.value)}
                            placeholder={isAr ? 'بحث برقم/اسم/هاتف/عنوان' : 'Search #/name/phone/address'}
                            className={`h-11 w-60 rounded-xl border border-border bg-card text-sm font-bold outline-none focus:border-primary ${isAr ? 'pr-9 pl-3' : 'pl-9 pr-3'}`} />
                    </div>
                    <button onClick={() => setShowMap((v) => !v)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-black text-main">
                        <MapPin size={15} />{isAr ? 'الخريطة' : 'Map'}
                    </button>
                    <Link to="/drivers" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-black text-main">
                        <Users size={15} />{isAr ? 'الطيارون' : 'Pilots'}
                    </Link>
                    <button onClick={() => refreshAll(false)} disabled={refreshing} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-white disabled:opacity-60">
                        <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />{isAr ? 'تحديث' : 'Refresh'}
                    </button>
                </div>
            </header>

            {(error || message) && (
                <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-bold ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    {error || message}
                </div>
            )}

            <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                    { label: isAr ? 'جاهز' : 'Ready', value: readyOrders.length, tone: 'text-primary' },
                    { label: isAr ? 'في الطريق' : 'On road', value: roadOrders.length, tone: 'text-indigo-600' },
                    { label: isAr ? 'متأخر' : 'Late', value: [...readyOrders, ...roadOrders].filter((o) => ageMins(o) >= SLA_MINUTES).length, tone: 'text-rose-600' },
                    { label: isAr ? 'تنبيهات' : 'Alerts', value: criticalAlerts.length, tone: criticalAlerts.length ? 'text-rose-600' : 'text-muted' },
                ].map((s) => (
                    <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
                        <div className="text-[11px] font-black uppercase tracking-wider text-muted">{s.label}</div>
                        <div className={`mt-1 text-2xl font-black ${s.tone}`}>{s.value}</div>
                    </div>
                ))}
            </section>

            {showMap && (
                <section className="mb-5">
                    <DeliveryTrackingMap
                        lang={lang as any}
                        drivers={drivers.filter((d) => d.isActive !== false).map((d) => ({
                            id: d.id, name: d.name, status: d.status,
                            lat: telemetry[d.id]?.lat, lng: telemetry[d.id]?.lng,
                            speedKmh: telemetry[d.id]?.speedKmh, accuracyM: telemetry[d.id]?.accuracy,
                            lastSeenLabel: lastSeenMins(d.id) === null ? '' : lastSeenMins(d.id) === 0 ? (isAr ? 'الآن' : 'now') : (isAr ? `منذ ${lastSeenMins(d.id)} د` : `${lastSeenMins(d.id)}m ago`),
                        }))}
                        orders={[...readyOrders, ...roadOrders].map((o) => ({
                            id: o.id, label: formatDisplayId(o), address: o.deliveryAddress,
                            lat: o.deliveryLat, lng: o.deliveryLng, driverId: o.driverId, status: o.status,
                        }))}
                        route={routeTarget}
                        heightClass="min-h-[320px]"
                        showSearch={false}
                    />
                </section>
            )}

            <div className="mb-4 flex gap-2">
                {tabs.map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-xs font-black transition ${tab === t.id ? 'bg-primary text-white shadow' : 'border border-border bg-card text-muted'}`}>
                        {t.label}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${tab === t.id ? 'bg-white/20' : 'bg-elevated'}`}>{t.count}</span>
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm font-bold text-muted">{isAr ? 'جاري التحميل...' : 'Loading...'}</div>
            ) : tab === 'alerts' ? (
                <div className="space-y-2">
                    {criticalAlerts.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm font-black text-muted">
                            {isAr ? 'لا توجد تنبيهات حرجة' : 'No critical alerts'}
                        </div>
                    )}
                    {criticalAlerts.slice(0, 20).map((a: any) => (
                        <div key={a.id || `${a.orderId}-${a.type}`} className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
                            <AlertTriangle size={17} className="shrink-0" />
                            <span className="min-w-0 flex-1">#{String(a.orderId || '').slice(-6)} — {a.details || a.type}</span>
                            <span className="shrink-0 text-[10px] font-black">{a.ageMinutes}m</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {(tab === 'ready' ? readyOrders : roadOrders).length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm font-black text-muted lg:col-span-2">
                            {tab === 'ready'
                                ? (isAr ? 'لا طلبات بانتظار التعيين' : 'Nothing awaiting assignment')
                                : (isAr ? 'لا طلبات في الطريق' : 'Nobody on the road')}
                        </div>
                    ) : (
                        (tab === 'ready' ? readyOrders : roadOrders).map((o) => renderOrderCard(o, tab === 'ready' ? 'ready' : 'road'))
                    )}
                </div>
            )}

            {podOrder && (() => {
                const due = getCashToCollect(podOrder);
                return (
                    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => !podBusy && setPodOrder(null)}>
                        <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl" dir={isAr ? 'rtl' : 'ltr'} onClick={(e) => e.stopPropagation()}>
                            <h3 className="text-lg font-black text-main">{isAr ? 'تأكيد التسليم' : 'Confirm delivery'} #{podOrder.orderNumber || podOrder.id}</h3>
                            <p className="mt-1 text-xs font-bold text-muted">{podOrder.customerName} · {podOrder.deliveryAddress}</p>
                            {due > 0 ? (
                                <div className="mt-4">
                                    <div className="mb-2 flex items-center justify-between rounded-2xl bg-amber-500/10 p-3">
                                        <span className="text-xs font-black text-amber-600">{isAr ? 'المستحق نقداً' : 'Cash due'}</span>
                                        <span className="text-xl font-black text-amber-600">{due.toFixed(0)}</span>
                                    </div>
                                    <label className="text-xs font-black text-muted">{isAr ? 'المبلغ المحصّل' : 'Collected'}</label>
                                    <input type="number" inputMode="decimal" value={podCash} onChange={(e) => setPodCash(e.target.value)}
                                        className="mt-2 h-14 w-full rounded-2xl border border-border bg-app px-4 text-center text-2xl font-black tabular-nums outline-none focus:border-emerald-500" placeholder="0" />
                                </div>
                            ) : (
                                <p className="mt-4 rounded-2xl bg-emerald-500/10 p-3 text-xs font-black text-emerald-600">
                                    {isAr ? 'مدفوع مقدماً — أكّد التسليم فقط' : 'Prepaid — just confirm handover'}
                                </p>
                            )}
                            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-500/10 p-3">
                                <p className="text-[11px] font-black text-amber-700">
                                    {isAr ? 'إغلاق من الفرع (بدون OTP): يتطلب PIN مدير وسبباً — يُسجل في التدقيق' : 'Branch close-out (no OTP): requires manager PIN + reason — audited'}
                                </p>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <input type="password" inputMode="numeric" value={podPin} onChange={(e) => setPodPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                        placeholder={isAr ? 'PIN المدير *' : 'Manager PIN *'}
                                        className="h-11 rounded-xl border border-border bg-app px-3 text-center font-black tabular-nums outline-none focus:border-amber-500" />
                                    <input value={podReason} onChange={(e) => setPodReason(e.target.value)}
                                        placeholder={isAr ? 'السبب *' : 'Reason *'}
                                        className="h-11 rounded-xl border border-border bg-app px-3 text-xs font-bold outline-none focus:border-amber-500" />
                                </div>
                            </div>
                            <div className="mt-5 grid grid-cols-2 gap-2">
                                <button onClick={() => !podBusy && setPodOrder(null)} disabled={podBusy} className="h-12 rounded-2xl bg-elevated/60 text-sm font-black text-main disabled:opacity-50">{isAr ? 'رجوع' : 'Back'}</button>
                                <button onClick={submitPod} disabled={podBusy} className="h-12 rounded-2xl bg-emerald-600 text-sm font-black text-white disabled:opacity-50">
                                    {podBusy ? (isAr ? 'جاري...' : 'Saving...') : (isAr ? 'تأكيد' : 'Confirm')}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default DispatchHub;
