import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../../../stores/useAuthStore';
import { api } from '../../../services/api';
import { socketService } from '../../../services/socketService';
import { useConfirm } from '../../../components/common/ConfirmProvider';
import { Order, OrderStatus } from '../../../types';
import {
    AlertCircle,
    ArrowLeft,
    Banknote,
    Bell,
    CheckCircle2,
    Clock3,
    LogIn,
    LogOut,
    MapPin,
    Navigation,
    Package,
    Phone,
    RefreshCcw,
    Route,
    ShieldCheck,
    Truck,
    XCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import DeliveryTrackingMap from '../../../components/common/DeliveryTrackingMap';
import { defaultMapCenter } from '../../../components/common/googleMaps';
import { estimateEta } from '../../../components/common/mapRouting';
import { getCashToCollect } from './cashCollection';

type DriverStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'RETURNING' | 'BREAK';

const statusLabel: Record<DriverStatus, string> = {
    AVAILABLE: 'متاح في الفرع',
    BUSY: 'في الطريق',
    OFFLINE: 'خارج الخدمة',
    RETURNING: 'راجع الفرع',
    BREAK: 'استراحة',
};

const statusClass: Record<DriverStatus, string> = {
    AVAILABLE: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    BUSY: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
    OFFLINE: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
    RETURNING: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
    BREAK: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
};

const getOrderCreatedAt = (order: any) => {
    const raw = order.createdAt || order.created_at;
    const date = raw ? new Date(raw) : new Date();
    return Number.isNaN(date.getTime()) ? new Date() : date;
};

const getElapsedMinutes = (order: any) => Math.max(0, Math.round((Date.now() - getOrderCreatedAt(order).getTime()) / 60000));

type PendingOp =
    | { kind: 'deliver'; orderId: string; payload: { cashCollected?: number; notes?: string; deliveryOtp?: string }; at: number }
    | { kind: 'fail'; orderId: string; payload: { reason: string }; at: number }
    | { kind: 'checkin'; at: number };

const PENDING_OPS_KEY = 'driver:pending-ops';

const loadPendingOps = (): PendingOp[] => {
    try {
        const raw = localStorage.getItem(PENDING_OPS_KEY);
        const arr = JSON.parse(raw || '[]');
        return Array.isArray(arr) ? arr.filter((o) => o && o.kind && o.at) : [];
    } catch { return []; }
};

const savePendingOps = (ops: PendingOp[]) => {
    try { localStorage.setItem(PENDING_OPS_KEY, JSON.stringify(ops.slice(-20))); } catch { /* private mode */ }
};

const getDeliveryPoint = (order: any) => ({
    lat: order.deliveryLat ?? order.delivery_lat ?? order.deliveryLatitude,
    lng: order.deliveryLng ?? order.delivery_lng ?? order.deliveryLongitude,
});

const buildMapHref = (order: any) => {
    const lat = order.deliveryLat ?? order.delivery_lat ?? order.deliveryLatitude;
    const lng = order.deliveryLng ?? order.delivery_lng ?? order.deliveryLongitude;
    if (lat && lng) return `https://maps.google.com/?q=${lat},${lng}`;
    return `https://maps.google.com/?q=${encodeURIComponent(order.customerAddress || order.deliveryAddress || '')}`;
};

export const DriverDashboard: React.FC = () => {
    const user = useAuthStore((state) => state.settings.currentUser);
    const [assignments, setAssignments] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [driverStatus, setDriverStatus] = useState<DriverStatus>('AVAILABLE');
    const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
    const [currentLocation, setCurrentLocation] = useState<{ lat?: number; lng?: number; speedKmh?: number; accuracyM?: number; at?: number }>(() => {
        try {
            const raw = localStorage.getItem('driver:last-fix');
            if (!raw) return {};
            const fix = JSON.parse(raw);
            if (Number.isFinite(fix?.lat) && Number.isFinite(fix?.lng)) return fix;
        } catch { /* no cached fix */ }
        return {};
    });
    const [locationWarning, setLocationWarning] = useState('');
    const [geoAttempt, setGeoAttempt] = useState(0);
    const [geoState, setGeoState] = useState<'idle' | 'requesting' | 'active' | 'denied' | 'unsupported' | 'insecure'>('idle');
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [podOrder, setPodOrder] = useState<any | null>(null);
    const [podCash, setPodCash] = useState('');
    const [podOtp, setPodOtp] = useState('');
    const [podBusy, setPodBusy] = useState(false);
    const [failOrder, setFailOrder] = useState<any | null>(null);
    const [failReason, setFailReason] = useState('');
    const [failBusy, setFailBusy] = useState(false);
    const [batchBusy, setBatchBusy] = useState(false);
    const [myCash, setMyCash] = useState<any | null>(null);
    const [cashExpanded, setCashExpanded] = useState(false);
    const [checkinBusy, setCheckinBusy] = useState(false);
    const [profileMissing, setProfileMissing] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const knownOrderIdsRef = useRef<Set<string> | null>(null);
    const flushingRef = useRef(false);
    const lastTelemetryRef = useRef<{ at: number; lat: number; lng: number } | null>(null);
    const { confirm } = useConfirm();

    const driverName = user?.name || 'Delivery Pilot';
    const driverId = user?.id || '';
    const activeOrders = assignments.filter((order: any) => [OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY, 'ASSIGNED'].includes(order.status));
    const roadOrders = activeOrders.filter((order: any) => order.status === OrderStatus.OUT_FOR_DELIVERY);
    const readyOrders = activeOrders.filter((order: any) => order.status === OrderStatus.READY || order.status === 'ASSIGNED');
    const collectedTotal = activeOrders.reduce((sum, order) => sum + getCashToCollect(order), 0);

    const branchMessages = useMemo(() => {
        if (readyOrders.length > 1) return ['استلم الطلبات الجاهزة مع بعض لو نفس المسار.', 'راجع الكاشير قبل الخروج لتأكيد التحصيل.'];
        if (roadOrders.length) return ['حدّث الحالة فور التسليم.', 'لو في تأخير افتح الاتصال بالعميل أو ارجع للفرع.'];
        return ['سجل دخولك وخليك جاهز لأول طلب.', 'تأكد من شحن الموبايل وتفعيل الموقع.'];
    }, [readyOrders.length, roadOrders.length]);

    // SLA-first ordering: latest + longest-waiting on top.
    const sortedActiveOrders = useMemo(
        () => [...activeOrders].sort((a: any, b: any) => getElapsedMinutes(b) - getElapsedMinutes(a)),
        [activeOrders]
    );

    const fetchAssignments = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            // Scoped server task list — no mass order download, no PII leak.
            const mine = await api.delivery.getMyAssignments();
            const list = Array.isArray(mine) ? mine : [];
            const prev = knownOrderIdsRef.current;
            const next = new Set(list.map((o: any) => String(o.id)));
            if (prev) {
                const fresh = list.filter((o: any) => !prev.has(String(o.id)));
                if (fresh.length > 0) {
                    const first: any = fresh[0];
                    toast.success(fresh.length === 1 ? `أوردر جديد #${first.orderNumber || String(first.id).slice(-6)}` : `${fresh.length} أوردرات جديدة اتعينت عليك`);
                    try { (navigator as any).vibrate?.(200); } catch { /* unsupported */ }
                }
            }
            knownOrderIdsRef.current = next;
            setAssignments(list);
            setLastSyncAt(new Date());
        } catch {
            if (!silent) toast.error('فشل تحميل طلبات الطيار');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const flushPendingOps = async () => {
        if (flushingRef.current || typeof navigator !== 'undefined' && !navigator.onLine) return;
        const ops = loadPendingOps();
        if (ops.length === 0) {
            if (pendingCount !== 0) setPendingCount(0);
            return;
        }
        flushingRef.current = true;
        try {
            const remaining: PendingOp[] = [];
            for (const op of ops) {
                try {
                    if (op.kind === 'deliver' && op.orderId) {
                        await api.delivery.deliverOrder(op.orderId, op.payload || {});
                    } else if (op.kind === 'fail' && op.orderId) {
                        await api.delivery.failDelivery(op.orderId, op.payload?.reason || 'Offline fail');
                    } else if (op.kind === 'checkin') {
                        await api.delivery.requestCheckin();
                    }
                    // success → dropped from the queue
                } catch (e: any) {
                    const msg = String(e?.message || '');
                    // Terminal rejections: replaying is pointless — drop the op.
                    const terminal = /DELIVERED|ORDER_NOT_|CASH_COLLECTION_MISMATCH|DELIVERY_OTP_MISMATCH|DRIVER_PROFILE_NOT_FOUND|FAILURE_REASON/.test(msg);
                    if (!terminal) {
                        remaining.push(op);
                        break; // network/unknown — retry everything later
                    }
                }
            }
            savePendingOps(remaining);
            setPendingCount(remaining.length);
            if (remaining.length < ops.length) {
                fetchAssignments(true);
                fetchMyCash();
            }
        } finally {
            flushingRef.current = false;
        }
    };

    const queueOp = (op: PendingOp) => {
        const ops = [...loadPendingOps(), op];
        savePendingOps(ops);
        setPendingCount(ops.length);
    };

    useEffect(() => {
        if (!driverId) return;
        fetchAssignments();
        flushPendingOps();
        setPendingCount(loadPendingOps().length);
        // Live updates when dispatcher assigns or order status changes.
        const refetch = () => fetchAssignments(true);
        socketService.on('dispatch:assigned', refetch);
        socketService.on('order:status', refetch);
        socketService.on('order:created', refetch);
        const timer = window.setInterval(() => { fetchAssignments(true); flushPendingOps(); }, 25000);
        const onFocus = () => { fetchAssignments(true); flushPendingOps(); };
        const onOnline = () => { setIsOnline(true); fetchAssignments(true); flushPendingOps(); };
        const onOffline = () => setIsOnline(false);
        window.addEventListener('focus', onFocus);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => {
            socketService.off('dispatch:assigned', refetch);
            socketService.off('order:status', refetch);
            socketService.off('order:created', refetch);
            window.clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, [driverId]);

    const fetchMyCash = async () => {
        try {
            const data = await api.delivery.getMyCash();
            setMyCash(data || null);
            setProfileMissing(false);
        } catch (e: any) {
            if (String(e?.message || '').includes('DRIVER_PROFILE_NOT_FOUND')) setProfileMissing(true);
        }
    };

    useEffect(() => {
        if (!driverId) return;
        fetchMyCash();
        const onCash = (p: any) => {
            if (p && (String(p.id) === String(driverId) || !p.id)) fetchMyCash();
        };
        const onCheckin = (p: any) => {
            fetchMyCash();
            if (p?.action === 'approved') {
                setDriverStatus('AVAILABLE');
                toast.success('الفرع اعتمد عودتك رسمياً — أهلاً بعودتك');
            } else if (p?.action === 'rejected') {
                toast.error('الفرع رفض طلب العودة — تواصل مع المشرف');
            }
        };
        socketService.on('driver:cash', onCash);
        socketService.on('driver:checkin', onCheckin);
        return () => {
            socketService.off('driver:cash', onCash);
            socketService.off('driver:checkin', onCheckin);
        };
    }, [driverId]);

    useEffect(() => {
        if (!driverId || driverStatus === 'OFFLINE') return;
        if (!navigator.geolocation) {
            setGeoState('unsupported');
            setLocationWarning('المتصفح لا يدعم تحديد الموقع.');
            return;
        }
        if (typeof window !== 'undefined' && window.isSecureContext === false) {
            setGeoState('insecure');
            setLocationWarning('الموقع الجغرافي محجوب: افتح السيستم عبر HTTPS (وليس http برقم IP) لتفعيل التتبع.');
            return;
        }

        let cancelled = false;
        // If the OS/browser already denied permission, re-requesting will never
        // show a prompt — detect it upfront and show fix steps instead.
        try {
            (navigator as any).permissions?.query?.({ name: 'geolocation' }).then((st: any) => {
                if (cancelled) return;
                if (st?.state === 'denied') {
                    setGeoState('denied');
                    setLocationWarning('إذن الموقع مرفوض من إعدادات المتصفح — فعّله يدوياً من علامة القفل بجانب العنوان ثم اضغط حاول مجدداً.');
                }
                try {
                    st?.addEventListener?.('change', () => {
                        if (st.state === 'granted') {
                            setGeoState('requesting');
                            setGeoAttempt((n) => n + 1);
                        }
                    });
                } catch { /* older browsers */ }
            }).catch(() => { /* Permissions API unavailable — just try */ });
        } catch { /* Permissions API unavailable — just try */ }

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                if (cancelled) return;
                const { latitude, longitude, speed, accuracy } = position.coords;
                setLocationWarning('');
                setGeoState('active');
                const fix = {
                    lat: latitude,
                    lng: longitude,
                    speedKmh: speed ? speed * 3.6 : undefined,
                    accuracyM: Number.isFinite(accuracy) ? accuracy : undefined,
                    at: Date.now(),
                };
                setCurrentLocation(fix);
                try { localStorage.setItem('driver:last-fix', JSON.stringify(fix)); } catch { /* private mode */ }
                // Throttled telemetry: skip bad fixes, post on 30s or 30m move.
                if (accuracy && accuracy > 100) return;
                const prev = lastTelemetryRef.current;
                const now = Date.now();
                const movedM = prev
                    ? Math.hypot(latitude - prev.lat, longitude - prev.lng) * 111320
                    : Infinity;
                if (prev && now - prev.at < 30000 && movedM < 30) return;
                lastTelemetryRef.current = { at: now, lat: latitude, lng: longitude };
                api.delivery.updateDriverLocation(driverId, {
                    lat: latitude,
                    lng: longitude,
                    speedKmh: speed ? speed * 3.6 : undefined,
                    accuracy,
                }).catch(() => setLocationWarning('تعذر تحديث الموقع على السيرفر.'));
            },
            (err: any) => {
                if (cancelled) return;
                const code = err?.code;
                if (code === 1) {
                    // PERMISSION_DENIED — the browser will not prompt again.
                    setGeoState('denied');
                    setLocationWarning('إذن الموقع مرفوض — فعّله من علامة القفل بجانب عنوان الموقع ثم اضغط حاول مجدداً.');
                } else if (code === 2) {
                    setGeoState('requesting');
                    setLocationWarning('تعذر تحديد الموقع (GPS ضعيف) — جاري إعادة المحاولة...');
                } else {
                    // TIMEOUT — watchPosition keeps trying; stay in requesting.
                    setGeoState((s) => (s === 'active' ? s : 'requesting'));
                    setLocationWarning('إشارة الموقع ضعيفة — جاري المحاولة...');
                }
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
        );

        return () => {
            cancelled = true;
            navigator.geolocation.clearWatch(watchId);
        };
    }, [driverId, driverStatus, geoAttempt]);

    const requestLocation = async () => {
        if (!driverId) return;
        if (!navigator.geolocation) {
            setGeoState('unsupported');
            setLocationWarning('المتصفح لا يدعم تحديد الموقع.');
            return;
        }
        if (typeof window !== 'undefined' && window.isSecureContext === false) {
            setGeoState('insecure');
            setLocationWarning('الموقع الجغرافي محجوب: افتح السيستم عبر HTTPS (وليس http برقم IP) لتفعيل التتبع.');
            return;
        }
        // Tracking only runs while on duty — bring an OFFLINE pilot back first.
        if (driverStatus === 'OFFLINE') {
            try {
                await api.delivery.updateDriverStatus(driverId, 'AVAILABLE');
                setDriverStatus('AVAILABLE');
            } catch (error: any) {
                toast.error(String(error?.message || '').includes('DRIVER_HAS_ACTIVE_ORDERS')
                    ? 'عندك أوردرات نشطة — سلمها أولاً'
                    : 'فشل تحديث الحالة');
                return;
            }
        }
        setLocationWarning('');
        setGeoState('requesting');
        setGeoAttempt((n) => n + 1);
    };

    const updateDriverStatus = async (nextStatus: DriverStatus) => {
        if (!driverId) return;        if (nextStatus === 'OFFLINE' && activeOrders.length > 0) {
            const ok = await confirm({
                title: 'خروج ومعاك أوردرات؟',
                message: `معاك ${activeOrders.length} أوردرات نشطة — الخروج مسموح بس بعد تسليمها أو إرجاعها للفرع. تخرج كده كده؟`,
                confirmText: 'خروج',
                cancelText: 'رجوع',
            });
            if (!ok) return;
        }
        try {
            await api.delivery.updateDriverStatus(driverId, nextStatus);
            setDriverStatus(nextStatus);
            toast.success(statusLabel[nextStatus]);
        } catch (error: any) {
            const msg = String(error?.message || '');
            toast.error(msg.includes('DRIVER_HAS_ACTIVE_ORDERS')
                ? 'عندك أوردرات نشطة — سلمها أو سجل تعذر التسليم قبل الخروج'
                : 'فشل تحديث حالة الطيار');
        }
    };

    const confirmPickup = async (order: any) => {
        const ok = await confirm({
            title: 'استلام الأوردر؟',
            message: `تأكيد استلام طلب #${order.orderNumber || order.id} والخروج به للتوصيل.`,
            confirmText: 'استلمت وخرجت',
            cancelText: 'رجوع',
        });
        if (!ok) return;
        try {
            await api.delivery.pickupOrder(order.id);
            await updateDriverStatus('BUSY');
            toast.success('تم تسجيل الاستلام — بالتوفيق');
            fetchAssignments(true);
        } catch (error: any) {
            toast.error(error?.message || 'فشل تسجيل الاستلام');
        }
    };

    const pickupAll = async () => {
        if (batchBusy || readyOrders.length === 0) return;
        const ok = await confirm({
            title: `استلام ${readyOrders.length} طلبات؟`,
            message: 'سيتم تسجيل استلام كل الطلبات الجاهزة دفعة واحدة.',
            confirmText: 'استلام الكل',
            cancelText: 'رجوع',
        });
        if (!ok) return;
        setBatchBusy(true);
        try {
            for (const order of readyOrders) {
                try {
                    await api.delivery.pickupOrder(order.id);
                } catch {
                    // continue with the rest; failures refresh below
                }
            }
            await updateDriverStatus('BUSY');
            toast.success('تم تسجيل الاستلام');
            fetchAssignments(true);
        } finally {
            setBatchBusy(false);
        }
    };

    const requestCheckin = async () => {
        if (checkinBusy) return;
        const ok = await confirm({
            title: 'تأكيد العودة للفرع؟',
            message: 'سيتم إرسال طلب للفرع لاعتماد عودتك بشكل رسمي.',
            confirmText: 'أنا في الفرع',
            cancelText: 'رجوع',
        });
        if (!ok) return;
        setCheckinBusy(true);
        try {
            await api.delivery.requestCheckin();
            toast.success('تم إرسال طلب العودة — بانتظار اعتماد الفرع');
            fetchMyCash();
        } catch (error: any) {
            const offline = typeof navigator !== 'undefined' && !navigator.onLine;
            if (offline) {
                queueOp({ kind: 'checkin', at: Date.now() });
                toast.success('مفيش نت — طلب العودة محفوظ وهيتبعت أول ما ترجع');
            } else {
                toast.error(error?.message || 'فشل إرسال طلب العودة');
            }
        } finally {
            setCheckinBusy(false);
        }
    };

    const submitFail = async () => {
        if (!failOrder || failBusy) return;
        const reason = failReason.trim();
        if (reason.length < 3) {
            toast.error('اكتب سبب التعذر أو اختار سبب سريع');
            return;
        }
        // Offline-capable: queue the fail like deliveries so a dead phone
        // never strands the order (flush drops it on terminal rejection).
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            queueOp({ kind: 'fail', orderId: failOrder.id, payload: { reason }, at: Date.now() });
            toast.success('حُفظ التعذر — سيُرسل عند عودة الاتصال');
            setFailOrder(null);
            setFailReason('');
            return;
        }
        setFailBusy(true);
        try {
            await api.delivery.failDelivery(failOrder.id, reason);
            toast.success('رجع الأوردر لطابور الفرع');
            setFailOrder(null);
            setFailReason('');
            fetchAssignments(true);
            fetchMyCash();
        } catch (error: any) {
            const msg = String(error?.message || '');
            if (/fetch|network|Failed to fetch|Load failed/i.test(msg)) {
                queueOp({ kind: 'fail', orderId: failOrder.id, payload: { reason }, at: Date.now() });
                toast.success('حُفظ التعذر — سيُرسل عند عودة الاتصال');
                setFailOrder(null);
                setFailReason('');
            } else {
                toast.error(error?.message || 'فشل تسجيل التعذر');
            }
        } finally {
            setFailBusy(false);
        }
    };

    const openPod = (order: any) => {
        setPodOrder(order);
        setPodOtp('');
        setPodCash(order ? String(getCashToCollect(order) > 0 ? getCashToCollect(order).toFixed(0) : '') : '');
    };

    const submitPod = async () => {
        if (!podOrder || podBusy) return;
        const due = getCashToCollect(podOrder);
        const collected = Number(podCash || 0);
        if (due > 0 && !(Number.isFinite(collected) && collected + 0.01 >= due)) {
            toast.error(`المبلغ المحصّل يجب أن يغطي المستحق (${due.toFixed(0)})`);
            return;
        }
        setPodBusy(true);
        try {
            await api.delivery.deliverOrder(podOrder.id, {
                ...(due > 0 ? { cashCollected: collected } : {}),
                ...(podOtp.trim() ? { deliveryOtp: podOtp.trim() } : {}),
            });
            toast.success('تم التسليم بنجاح');
            setPodOrder(null);
            fetchAssignments(true);
            fetchMyCash();
        } catch (error: any) {
            const msg = String(error?.message || '');
            const offline = typeof navigator !== 'undefined' && !navigator.onLine;
            if (offline || /fetch|network|Failed to fetch|Load failed/i.test(msg)) {
                queueOp({
                    kind: 'deliver', orderId: podOrder.id,
                    payload: {
                        ...(due > 0 ? { cashCollected: collected } : {}),
                        ...(podOtp.trim() ? { deliveryOtp: podOtp.trim() } : {}),
                    },
                    at: Date.now(),
                });
                toast.success('مفيش نت — التسليم محفوظ وهيتبعت أول ما ترجع');
                setPodOrder(null);
                fetchAssignments(true);
            } else {
                toast.error(msg.includes('DELIVERY_OTP_MISMATCH')
                    ? 'رمز التسليم غلط — اطلبه من العميل'
                    : (error?.message || 'فشل تأكيد التسليم'));
            }
        } finally {
            setPodBusy(false);
        }
    };

    const driverMapOrders = activeOrders.map((order: any) => ({
        id: order.id,
        label: `#${order.orderNumber || order.id}`,
        address: order.customerAddress || order.deliveryAddress,
        lat: order.deliveryLat ?? order.delivery_lat ?? order.deliveryLatitude,
        lng: order.deliveryLng ?? order.delivery_lng ?? order.deliveryLongitude,
        driverId,
        status: order.status,
    }));

    const driverMapCenter = currentLocation.lat && currentLocation.lng
        ? { lat: currentLocation.lat, lng: currentLocation.lng }
        : defaultMapCenter;

    return (
        <div className="min-h-screen bg-[#0f172a] text-slate-100" dir="rtl">
            <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col p-4 md:p-6">
                <header className="sticky top-0 z-20 -mx-4 mb-5 border-b border-white/10 bg-[#0f172a]/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-lg font-black text-white shadow-lg shadow-indigo-500/20">
                                {driverName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                                <h1 className="truncate text-lg font-black">{driverName}</h1>
                                <div className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass[driverStatus]}`}>
                                    {statusLabel[driverStatus]}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => fetchAssignments()}
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200"
                            aria-label="تحديث مهام التوصيل"
                            title="تحديث"
                        >
                            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </header>

                {!isOnline && (
                    <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs font-black text-amber-100">
                        غير متصل بالإنترنت — التحديثات ستتوقف مؤقتاً. أكمل من القائمة الحالية.
                    </div>
                )}

                <section className="mb-5 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <Package size={17} className="mb-2 text-indigo-300" />
                        <div className="text-xl font-black">{activeOrders.length}</div>
                        <div className="text-[10px] font-bold text-slate-400">طلبات نشطة</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <Route size={17} className="mb-2 text-amber-300" />
                        <div className="text-xl font-black">{roadOrders.length}</div>
                        <div className="text-[10px] font-bold text-slate-400">في الطريق</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <Banknote size={17} className="mb-2 text-emerald-300" />
                        <div className="text-xl font-black">{collectedTotal.toFixed(0)}</div>
                        <div className="text-[10px] font-bold text-slate-400">تحصيل متوقع</div>
                    </div>
                </section>

                <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <button onClick={() => updateDriverStatus('AVAILABLE')} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-black text-white">
                        <LogIn size={18} /> دخول الفرع
                    </button>
                    <button onClick={() => updateDriverStatus('BREAK')} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-amber-500 text-sm font-black text-white">
                        <Clock3 size={18} /> استراحة
                    </button>
                    <button onClick={() => updateDriverStatus('RETURNING')} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-sky-500 text-sm font-black text-white">
                        <ArrowLeft size={18} /> راجع الفرع
                    </button>
                    <button onClick={() => updateDriverStatus('OFFLINE')} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-700 text-sm font-black text-white">
                        <LogOut size={18} /> خروج
                    </button>
                </section>

                <section className="mb-5 rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-sm font-black text-indigo-100">
                            <Bell size={17} /> رسائل الفرع
                        </h2>
                        <span className="text-[10px] font-bold text-slate-400">{lastSyncAt ? lastSyncAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                    </div>
                    <div className="space-y-2">
                        {branchMessages.map((message) => (
                            <div key={message} className="flex items-start gap-2 rounded-xl bg-white/5 p-3 text-xs font-bold leading-6 text-slate-200">
                                <ShieldCheck size={15} className="mt-1 shrink-0 text-indigo-300" />
                                {message}
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mb-5">
                    {locationWarning && (
                        <div className="mb-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs font-bold leading-6 text-amber-100">
                            {locationWarning}
                        </div>
                    )}
                    {pendingCount > 0 && (
                        <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-xs font-black text-sky-100">
                            <span>{pendingCount} عمليات محفوظة أوفلاين — هتتبعت تلقائياً</span>
                            <button onClick={flushPendingOps} className="shrink-0 rounded-full bg-sky-500 px-3 py-1 text-[10px] text-white">إرسال الآن</button>
                        </div>
                    )}
                    {!currentLocation.lat && geoState !== 'active' && (
                        geoState === 'denied' || geoState === 'insecure' || geoState === 'unsupported' ? (
                            <div className="mb-3 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3">
                                <p className="text-xs font-black leading-6 text-rose-100">
                                    {geoState === 'insecure'
                                        ? 'الموقع محجوب لأن الصفحة مفتوحة بدون HTTPS — افتح السيستم برابط آمن ثم أعد المحاولة.'
                                        : geoState === 'unsupported'
                                            ? 'متصفحك لا يدعم تحديد الموقع — جرّب Chrome على الموبايل.'
                                            : 'إذن الموقع مرفوض: اضغط علامة القفل 🔒 بجانب العنوان ← الموقع ← سماح، ثم اضغط حاول مجدداً.'}
                                </p>
                                <button
                                    type="button"
                                    onClick={requestLocation}
                                    className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-3 text-sm font-black text-white transition-transform active:scale-[0.99]"
                                >
                                    <Navigation size={16} />
                                    حاول مجدداً
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={requestLocation}
                                disabled={geoState === 'requesting'}
                                className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-500/25 transition-transform active:scale-[0.99] disabled:opacity-70"
                            >
                                {geoState === 'requesting' ? (
                                    <>
                                        <RefreshCcw size={17} className="animate-spin" />
                                        بانتظار إذن الموقع...
                                    </>
                                ) : (
                                    <>
                                        <Navigation size={17} />
                                        فعّل تتبع موقعي على الخريطة
                                    </>
                                )}
                            </button>
                        )
                    )}
                    <DeliveryTrackingMap
                        lang="ar"
                        title="خريطة خط السير"
                        subtitle="موقعك الحالي وأماكن الأوردرات المكلف بها على خريطة فعلية."
                        drivers={[{
                            id: driverId || 'me',
                            name: driverName,
                            status: driverStatus,
                            lat: currentLocation.lat,
                            lng: currentLocation.lng,
                            speedKmh: currentLocation.speedKmh,
                            accuracyM: currentLocation.accuracyM,
                            lastSeenLabel: currentLocation.at && Date.now() - currentLocation.at > 60000 ? 'آخر موقع محفوظ' : 'الآن',
                        }]}
                        orders={driverMapOrders}
                        center={driverMapCenter}
                        heightClass="min-h-[320px]"
                        showSearch={false}
                    />
                </section>

                <section className="mb-5 rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-sm font-black text-indigo-100">
                            <Banknote size={17} /> حسابي
                        </h2>
                        <button onClick={() => setCashExpanded((v) => !v)} className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-black text-slate-300">
                            {cashExpanded ? 'إخفاء التفاصيل' : 'التفاصيل'}
                        </button>
                    </div>
                    <div className="rounded-2xl bg-gradient-to-l from-emerald-500/25 to-emerald-500/5 p-4 text-center">
                        <div className="text-[11px] font-black text-emerald-200/80">الفلوس اللي معايا الآن</div>
                        <div className="mt-1 text-4xl font-black tabular-nums text-emerald-100">
                            {myCash ? Number(myCash.balance || 0).toFixed(0) : '—'}
                        </div>
                        <div className="mt-2 flex items-center justify-center gap-4 text-[11px] font-black text-slate-300">
                            <span>حصلت اليوم: <b className="text-emerald-200">{myCash ? Number(myCash.todayCollected || 0).toFixed(0) : '—'}</b></span>
                            <span>سلمت للفرع: <b className="text-sky-200">{myCash ? Number(myCash.todaySettled || 0).toFixed(0) : '—'}</b></span>
                        </div>
                        {myCash?.stats && (
                            <div className="mt-2 flex items-center justify-center gap-4 text-[11px] font-black text-slate-400">
                                <span>سلّمت اليوم: <b className="text-slate-200">{myCash.stats.deliveredToday}</b></span>
                                {myCash.stats.avgDeliveryMins !== null && (
                                    <span>متوسط التوصيلة: <b className="text-slate-200">{myCash.stats.avgDeliveryMins} د</b></span>
                                )}
                            </div>
                        )}
                    </div>

                    {activeOrders.length === 0 && (
                        <div className="mt-3">
                            {!myCash?.checkin || myCash.checkin.status === 'REJECTED' ? (
                                <button onClick={requestCheckin} disabled={checkinBusy}
                                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-sky-500/25 transition-transform active:scale-[0.99] disabled:opacity-50">
                                    <LogIn size={18} /> {checkinBusy ? 'جاري الإرسال...' : 'وصلت الفرع — اعتماد العودة'}
                                </button>
                            ) : myCash.checkin.status === 'REQUESTED' ? (
                                <div className="flex items-center justify-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3.5 text-sm font-black text-amber-100">
                                    <Clock3 size={18} className="animate-pulse" /> طلب العودة عند الفرع — بانتظار الاعتماد
                                </div>
                            ) : (
                                <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3.5 text-sm font-black text-emerald-100">
                                    <CheckCircle2 size={18} /> عودة معتمدة رسمياً من الفرع
                                </div>
                            )}
                        </div>
                    )}

                    {cashExpanded && (
                        <div className="mt-3 space-y-3">
                            <div>
                                <p className="mb-2 text-[11px] font-black text-slate-400">أوردرات خلصتها ({(myCash?.completedOrders || []).length})</p>
                                {(myCash?.completedOrders || []).length === 0 ? (
                                    <p className="rounded-xl bg-black/20 p-3 text-center text-[11px] font-bold text-slate-500">لا يوجد بعد</p>
                                ) : (
                                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                                        {(myCash.completedOrders || []).map((o: any) => (
                                            <div key={o.id} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-[11px] font-bold">
                                                <span className="font-black text-slate-100">#{o.orderNumber || String(o.id).slice(-6)}</span>
                                                <span className="min-w-0 flex-1 truncate text-slate-400">{o.deliveryAddress || o.customerName || ''}</span>
                                                <span className="tabular-nums text-slate-200">{Number(o.total || 0).toFixed(0)}</span>
                                                {o.cashCollected !== null && o.cashCollected !== undefined && (
                                                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 tabular-nums text-emerald-200">نقدي {Number(o.cashCollected).toFixed(0)}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="mb-2 text-[11px] font-black text-slate-400">حركة الحساب</p>
                                {(myCash?.history || []).length === 0 ? (
                                    <p className="rounded-xl bg-black/20 p-3 text-center text-[11px] font-bold text-slate-500">لا حركات بعد</p>
                                ) : (
                                    <div className="max-h-48 space-y-1.5 overflow-y-auto">
                                        {(myCash.history || []).map((h: any) => (
                                            <div key={h.id} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-[11px] font-bold">
                                                <span className={`rounded-full px-2 py-0.5 ${h.type === 'COLLECT' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-sky-500/15 text-sky-200'}`}>
                                                    {h.type === 'COLLECT' ? 'تحصيل' : 'تسوية فرع'}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-slate-400">{h.orderNumber ? `#${h.orderNumber}` : (h.notes || '')}</span>
                                                <span className="tabular-nums text-slate-100">{h.type === 'COLLECT' ? '+' : '−'}{Number(h.amount || 0).toFixed(0)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>

                <main className="flex-1 space-y-4 pb-8">
                    {profileMissing && (
                        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-center text-xs font-black leading-6 text-rose-100">
                            حساب الدخول ده غير مربوط بملف طيار — كلم مشرف الفرع يربط حسابك عشان توصلك الأوردرات
                        </div>
                    )}
                    <div className="flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-lg font-black">
                            <Truck size={20} className="text-amber-300" /> أوردراتي
                        </h2>
                        <div className="flex items-center gap-2">
                            {readyOrders.length > 1 && (
                                <button
                                    onClick={pickupAll}
                                    disabled={batchBusy}
                                    className="rounded-full bg-amber-500 px-4 py-2 text-[11px] font-black text-white disabled:opacity-50"
                                >
                                    {batchBusy ? 'جاري...' : `استلام الكل (${readyOrders.length})`}
                                </button>
                            )}
                            <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-black text-slate-300">
                                {loading ? 'تحميل...' : `${activeOrders.length} نشط`}
                            </span>
                        </div>
                    </div>

                    {loading ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm font-bold text-slate-400">جاري تحميل الطلبات...</div>
                    ) : activeOrders.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-10 text-center">
                            <Package className="mx-auto mb-4 h-14 w-14 text-slate-600" />
                            <p className="text-sm font-black text-slate-300">لا يوجد طلبات مكلف بها حاليًا</p>
                        </div>
                    ) : sortedActiveOrders.map((order: any) => {
                        const elapsed = getElapsedMinutes(order);
                        const isRoad = order.status === OrderStatus.OUT_FOR_DELIVERY;
                        const isLate = elapsed > 45;
                        const cashToCollect = getCashToCollect(order);
                        const eta = estimateEta(
                            defaultMapCenter,
                            getDeliveryPoint(order),
                            currentLocation.speedKmh && currentLocation.speedKmh > 8 ? currentLocation.speedKmh : 24,
                        );

                        return (
                            <article key={order.id} className={`rounded-3xl border p-4 shadow-xl ${isLate ? 'border-rose-400/50 bg-rose-500/10' : 'border-white/10 bg-white/5'}`}>
                                <div className="mb-4 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-xl font-black">#{order.orderNumber || order.id}</h3>
                                            {isLate && <span className="rounded-full bg-rose-500 px-2 py-1 text-[9px] font-black text-white">متأخر</span>}
                                        </div>
                                        <p className="mt-1 flex items-start gap-1.5 text-xs font-bold leading-5 text-slate-300">
                                            <MapPin size={14} className="mt-0.5 shrink-0 text-rose-300" />
                                            {order.customerAddress || order.deliveryAddress || 'لا يوجد عنوان مسجل'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl bg-white/10 px-3 py-2 text-center">
                                        <div className="text-lg font-black">{cashToCollect.toFixed(0)}</div>
                                        <div className="text-[9px] font-bold text-slate-400">{cashToCollect > 0 ? 'تحصيل نقدي' : 'مدفوع'}</div>
                                    </div>
                                </div>

                                <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                                    <div className="rounded-xl bg-black/15 p-2">
                                        <Clock3 size={14} className="mx-auto mb-1 text-slate-400" />
                                        <div className="text-xs font-black">{elapsed} د</div>
                                        <div className="text-[9px] text-slate-500">من الطلب</div>
                                    </div>
                                    <div className="rounded-xl bg-black/15 p-2">
                                        <Navigation size={14} className="mx-auto mb-1 text-slate-400" />
                                        <div className="text-xs font-black">{isRoad ? 'خارج' : 'جاهز'}</div>
                                        <div className="text-[9px] text-slate-500">الحالة</div>
                                    </div>
                                    <div className="rounded-xl bg-black/15 p-2">
                                        <AlertCircle size={14} className="mx-auto mb-1 text-slate-400" />
                                        <div className="text-xs font-black">{Math.max(0, 45 - elapsed)} د</div>
                                        <div className="text-[9px] text-slate-500">SLA</div>
                                    </div>
                                </div>

                                <div className="mb-4 grid grid-cols-2 gap-2 text-center">
                                    <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-100">
                                        <div className="text-xs font-black">{eta.etaMinutes} د</div>
                                        <div className="text-[9px] text-emerald-200/70">ETA</div>
                                    </div>
                                    <div className="rounded-xl bg-sky-500/10 p-2 text-sky-100">
                                        <div className="text-xs font-black">{eta.distanceKm} كم</div>
                                        <div className="text-[9px] text-sky-200/70">المسافة</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <a
                                        href={buildMapHref(order)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-700 text-sm font-black text-white"
                                    >
                                        <Navigation size={18} /> الخريطة
                                    </a>
                                    {order.customerPhone && (
                                        <a href={`tel:${order.customerPhone}`} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-700 text-sm font-black text-white">
                                            <Phone size={18} /> اتصال
                                        </a>
                                    )}
                                    {!isRoad ? (
                                        <button onClick={() => confirmPickup(order)} className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-2xl bg-amber-500 py-3 text-sm font-black text-white">
                                            <Package size={18} /> استلمت وخرجت بالأوردر
                                        </button>
                                    ) : (
                                        <>
                                            <button onClick={() => openPod(order)} className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white">
                                                <CheckCircle2 size={18} /> {cashToCollect > 0 ? 'تم التوصيل والتحصيل' : 'تم التوصيل'}
                                            </button>
                                            <button onClick={() => { setFailOrder(order); setFailReason(''); }} className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-400/40 bg-rose-500/10 text-xs font-black text-rose-200">
                                                <XCircle size={16} /> تعذر التسليم — إرجاع للفرع
                                            </button>
                                        </>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </main>

                {podOrder && (() => {
                    const due = getCashToCollect(podOrder);
                    return (
                        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => !podBusy && setPodOrder(null)}>
                            <div className="w-full max-w-md rounded-3xl bg-[#16213a] p-6 shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
                                <h3 className="text-lg font-black">تأكيد التسليم #{podOrder.orderNumber || podOrder.id}</h3>
                                <p className="mt-1 text-xs font-bold text-slate-400">{podOrder.customerAddress || podOrder.deliveryAddress || ''}</p>
                                <div className="mt-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-3">
                                    <label className="text-xs font-black text-indigo-200">رمز التسليم من العميل (4 أرقام)</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        value={podOtp}
                                        onChange={(e) => setPodOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="mt-2 h-14 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-center text-2xl font-black tabular-nums tracking-[0.3em] outline-none focus:border-indigo-400"
                                        placeholder="••••"
                                        dir="ltr"
                                    />
                                </div>
                                {due > 0 ? (
                                    <div className="mt-4">
                                        <div className="mb-2 flex items-center justify-between rounded-2xl bg-amber-500/10 p-3">
                                            <span className="text-xs font-black text-amber-200">المستحق تحصيله نقداً</span>
                                            <span className="text-xl font-black text-amber-200">{due.toFixed(0)}</span>
                                        </div>
                                        <label className="text-xs font-black text-slate-300">المبلغ المحصّل فعلياً</label>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            value={podCash}
                                            onChange={(e) => setPodCash(e.target.value)}
                                            className="mt-2 h-14 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-center text-2xl font-black tabular-nums outline-none focus:border-emerald-400"
                                            placeholder="0"
                                        />
                                    </div>
                                ) : (
                                    <p className="mt-4 rounded-2xl bg-emerald-500/10 p-3 text-xs font-black text-emerald-200">
                                        الطلب مدفوع مقدماً — أكّد تسليمه للعميل فقط.
                                    </p>
                                )}
                                <div className="mt-5 grid grid-cols-2 gap-2">
                                    <button onClick={() => !podBusy && setPodOrder(null)} disabled={podBusy} className="flex h-14 items-center justify-center rounded-2xl bg-slate-700 text-sm font-black text-white disabled:opacity-50">
                                        رجوع
                                    </button>
                                    <button onClick={submitPod} disabled={podBusy} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-black text-white disabled:opacity-50">
                                        <CheckCircle2 size={18} /> {podBusy ? 'جاري...' : 'تأكيد التسليم'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}
                {failOrder && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => !failBusy && setFailOrder(null)}>
                        <div className="w-full max-w-md rounded-3xl bg-[#16213a] p-6 shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
                            <h3 className="text-lg font-black">تعذر تسليم #{failOrder.orderNumber || failOrder.id}</h3>
                            <p className="mt-1 text-xs font-bold text-slate-400">الأوردر هيرجع لطابور الفرع لإعادة التعيين.</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {['العميل مش موجود', 'عنوان غلط', 'رفض الاستلام', 'مشكلة في الأوردر'].map((r) => (
                                    <button key={r} onClick={() => setFailReason(r)}
                                        className={`rounded-full px-3 py-1.5 text-[11px] font-black ${failReason === r ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-200'}`}>
                                        {r}
                                    </button>
                                ))}
                            </div>
                            <textarea
                                value={failReason}
                                onChange={(e) => setFailReason(e.target.value)}
                                rows={2}
                                className="mt-3 w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-sm font-bold outline-none focus:border-rose-400"
                                placeholder="سبب التعذر..."
                            />
                            <div className="mt-5 grid grid-cols-2 gap-2">
                                <button onClick={() => !failBusy && setFailOrder(null)} disabled={failBusy} className="flex h-14 items-center justify-center rounded-2xl bg-slate-700 text-sm font-black text-white disabled:opacity-50">
                                    رجوع
                                </button>
                                <button onClick={submitFail} disabled={failBusy} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-rose-500 text-sm font-black text-white disabled:opacity-50">
                                    <XCircle size={18} /> {failBusy ? 'جاري...' : 'تأكيد الإرجاع'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DriverDashboard;
