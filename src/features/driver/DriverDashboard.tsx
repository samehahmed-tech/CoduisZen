import React, { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../../stores/useAuthStore';
import { api } from '../../../services/api';
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
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import DeliveryTrackingMap from '../../../components/common/DeliveryTrackingMap';
import { defaultMapCenter } from '../../../components/common/googleMaps';
import { estimateEta } from '../../../components/common/mapRouting';
import { getCashToCollect } from './cashCollection';

type DriverStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'RETURNING';

const statusLabel: Record<DriverStatus, string> = {
    AVAILABLE: 'متاح في الفرع',
    BUSY: 'في الطريق',
    OFFLINE: 'خارج الخدمة',
    RETURNING: 'راجع الفرع',
};

const statusClass: Record<DriverStatus, string> = {
    AVAILABLE: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    BUSY: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
    OFFLINE: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
    RETURNING: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
};

const getOrderCreatedAt = (order: any) => {
    const raw = order.createdAt || order.created_at;
    const date = raw ? new Date(raw) : new Date();
    return Number.isNaN(date.getTime()) ? new Date() : date;
};

const getElapsedMinutes = (order: any) => Math.max(0, Math.round((Date.now() - getOrderCreatedAt(order).getTime()) / 60000));

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
    const [currentLocation, setCurrentLocation] = useState<{ lat?: number; lng?: number; speedKmh?: number }>({});
    const [locationWarning, setLocationWarning] = useState('');

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

    const fetchAssignments = async () => {
        try {
            setLoading(true);
            const orders = await api.orders.getAll({} as any);
            const active = orders.filter((order: any) =>
                (order.driverId === driverId || order.driver_id === driverId) &&
                ['READY', 'OUT_FOR_DELIVERY', 'ASSIGNED', 'DELIVERED', 'COMPLETED'].includes(order.status)
            );
            setAssignments(active);
            setLastSyncAt(new Date());
        } catch {
            toast.error('فشل تحميل طلبات الطيار');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAssignments();
    }, [driverId]);

    useEffect(() => {
        if (!driverId || driverStatus === 'OFFLINE') return;
        if (!navigator.geolocation) {
            setLocationWarning('المتصفح لا يدعم تحديد الموقع.');
            return;
        }

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, speed, accuracy } = position.coords;
                setLocationWarning('');
                setCurrentLocation({
                    lat: latitude,
                    lng: longitude,
                    speedKmh: speed ? speed * 3.6 : undefined,
                });
                api.delivery.updateDriverLocation(driverId, {
                    lat: latitude,
                    lng: longitude,
                    speedKmh: speed ? speed * 3.6 : undefined,
                    accuracy,
                }).catch(() => setLocationWarning('تعذر تحديث الموقع على السيرفر.'));
            },
            () => setLocationWarning('فعّل إذن الموقع من المتصفح لتحديث مكانك على الخريطة.'),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 6000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [driverId, driverStatus]);

    const updateDriverStatus = async (nextStatus: DriverStatus) => {
        if (!driverId) return;
        try {
            await api.delivery.updateDriverStatus(driverId, nextStatus);
            setDriverStatus(nextStatus);
            toast.success(statusLabel[nextStatus]);
        } catch (error) {
            toast.error('فشل تحديث حالة الطيار');
        }
    };

    const updateOrderStatus = async (orderId: string, nextStatus: string) => {
        try {
            await api.orders.updateStatus(orderId, { status: nextStatus });
            if (nextStatus === OrderStatus.OUT_FOR_DELIVERY) await updateDriverStatus('BUSY');
            if (nextStatus === OrderStatus.DELIVERED) await updateDriverStatus('RETURNING');
            toast.success('تم تحديث حالة الطلب');
            fetchAssignments();
        } catch (error) {
            toast.error('فشل تحديث حالة الطلب');
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
                            onClick={fetchAssignments}
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200"
                            aria-label="تحديث مهام التوصيل"
                            title="تحديث"
                        >
                            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </header>

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

                <section className="mb-5 grid gap-3 sm:grid-cols-3">
                    <button onClick={() => updateDriverStatus('AVAILABLE')} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-black text-white">
                        <LogIn size={18} /> دخول الفرع
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
                            lastSeenLabel: 'الآن',
                        }]}
                        orders={driverMapOrders}
                        center={driverMapCenter}
                        heightClass="min-h-[320px]"
                        showSearch={false}
                    />
                </section>

                <main className="flex-1 space-y-4 pb-8">
                    <div className="flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-lg font-black">
                            <Truck size={20} className="text-amber-300" /> أوردراتي
                        </h2>
                        <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-black text-slate-300">
                            {loading ? 'تحميل...' : `${activeOrders.length} نشط`}
                        </span>
                    </div>

                    {loading ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm font-bold text-slate-400">جاري تحميل الطلبات...</div>
                    ) : activeOrders.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-10 text-center">
                            <Package className="mx-auto mb-4 h-14 w-14 text-slate-600" />
                            <p className="text-sm font-black text-slate-300">لا يوجد طلبات مكلف بها حاليًا</p>
                        </div>
                    ) : activeOrders.map((order: any) => {
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
                                        <button onClick={() => updateOrderStatus(order.id, OrderStatus.OUT_FOR_DELIVERY)} className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-2xl bg-amber-500 py-3 text-sm font-black text-white">
                                            <Package size={18} /> استلمت وخرجت بالأوردر
                                        </button>
                                    ) : (
                                        <button onClick={() => updateOrderStatus(order.id, OrderStatus.DELIVERED)} className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white">
                                            <CheckCircle2 size={18} /> {cashToCollect > 0 ? 'تم التوصيل والتحصيل' : 'تم التوصيل'}
                                        </button>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </main>
            </div>
        </div>
    );
};

export default DriverDashboard;
