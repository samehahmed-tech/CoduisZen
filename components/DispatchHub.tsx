import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Bike,
    CheckCircle2,
    Clock,
    MapPin,
    Navigation,
    PackageCheck,
    Phone,
    Plus,
    RefreshCw,
    Save,
    Truck,
    User,
    X,
} from 'lucide-react';
import { useOrderStore } from '../stores/useOrderStore';
import { useAuthStore } from '../stores/useAuthStore';
import { Driver, Order, OrderStatus, OrderType } from '../types';
import { deliveryApi } from '../services/api/delivery';
import { socketService } from '../services/socketService';
import { formatDisplayId } from '../src/utils/idGenerator';
import DeliveryTrackingMap from './common/DeliveryTrackingMap';
import { defaultMapCenter } from './common/googleMaps';
import { estimateEta } from './common/mapRouting';
import { useConfirm } from './common/ConfirmProvider';

const SLA_MINUTES = 45;

type DriverTelemetry = {
    driverId: string;
    branchId?: string | null;
    lat: number;
    lng: number;
    speedKmh?: number;
    accuracy?: number;
    updatedAt: string;
};

const toUiDriverStatus = (status?: string): Driver['status'] => {
    const value = String(status || 'OFFLINE').toUpperCase();
    if (value === 'BUSY') return 'ON_DELIVERY';
    if (['AVAILABLE', 'ON_DELIVERY', 'BREAK', 'OFFLINE', 'RETURNING'].includes(value)) return value as Driver['status'];
    return 'OFFLINE';
};

const toApiDriverStatus = (status?: string) => {
    const value = String(status || '').toUpperCase();
    return value === 'ON_DELIVERY' ? 'BUSY' : value;
};

const getOrderAgeMins = (order: Order) => Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000));

const DispatchHub: React.FC = () => {
    const { settings } = useAuthStore();
    const { orders, fetchOrders, updateOrderStatus } = useOrderStore();
    const { confirm } = useConfirm();
    const lang = settings.language || 'en';
    const isAr = lang === 'ar';
    const activeBranchId = settings.activeBranchId;

    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [telemetryByDriver, setTelemetryByDriver] = useState<Record<string, DriverTelemetry>>({});
    const [slaAlerts, setSlaAlerts] = useState<any[]>([]);
    const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isAssigningOrderId, setIsAssigningOrderId] = useState<string | null>(null);
    const [isCompletingOrderId, setIsCompletingOrderId] = useState<string | null>(null);
    const [operationError, setOperationError] = useState<string | null>(null);
    const [operationMessage, setOperationMessage] = useState<string | null>(null);
    const [showDriverForm, setShowDriverForm] = useState(false);
    const [isSavingDriver, setIsSavingDriver] = useState(false);
    const [driverForm, setDriverForm] = useState({
        name: '',
        phone: '',
        email: '',
        password: '',
        pin: '',
        createLogin: true,
    });

    const copy = {
        title: isAr ? 'الديسباتش' : 'Dispatch',
        subtitle: isAr ? 'متابعة أوردرات الدليفري والطيارين فقط' : 'Delivery orders and driver operations only',
        ready: isAr ? 'جاهز للتعيين' : 'Ready to assign',
        onRoad: isAr ? 'في الطريق' : 'On the road',
        drivers: isAr ? 'الطيارين' : 'Drivers',
        addDriver: isAr ? 'إضافة طيار' : 'Add driver',
        close: isAr ? 'إغلاق' : 'Close',
        noReady: isAr ? 'لا توجد أوردرات دليفري جاهزة للتعيين' : 'No delivery orders ready for assignment',
        noRoad: isAr ? 'لا توجد أوردرات دليفري في الطريق' : 'No delivery orders on the road',
        noDrivers: isAr ? 'لا يوجد طيارين بعد' : 'No drivers yet',
        addressMissing: isAr ? 'لا يوجد عنوان مسجل' : 'No address recorded',
        assign: isAr ? 'تعيين وخروج' : 'Assign and dispatch',
        delivered: isAr ? 'تم التسليم' : 'Delivered',
        arrived: isAr ? 'رجع الفرع' : 'Arrived branch',
        saveDriver: isAr ? 'حفظ الطيار' : 'Save driver',
        saving: isAr ? 'جاري الحفظ...' : 'Saving...',
        refresh: isAr ? 'تحديث' : 'Refresh',
        unavailable: isAr ? 'لا يوجد طيار متاح' : 'No available driver',
        liveMap: isAr ? 'خريطة التتبع الحي' : 'Live tracking map',
        expected: isAr ? 'المفروض' : 'Target',
        remaining: isAr ? 'متبقي' : 'Remaining',
        late: isAr ? 'متأخر' : 'Late',
        onTime: isAr ? 'في الوقت' : 'On time',
        watch: isAr ? 'مراقبة' : 'Watch',
        driverLeft: isAr ? 'راح بالأوردر' : 'Left with order',
        driverBack: isAr ? 'رجع الفرع' : 'Back to branch',
        loginBranch: isAr ? 'دخول الفرع' : 'Branch login',
        logoutBranch: isAr ? 'خروج' : 'Logout',
    };

    const getErrorMessage = (error: unknown, fallbackEn: string, fallbackAr: string) =>
        error instanceof Error && error.message ? error.message : isAr ? fallbackAr : fallbackEn;

    if (isAr) {
        Object.assign(copy, {
            title: 'الديسباتش',
            subtitle: 'متابعة أوردرات الدليفري والطيارين فقط',
            ready: 'جاهز للتعيين',
            onRoad: 'في الطريق',
            drivers: 'الطيارين',
            addDriver: 'إضافة طيار',
            close: 'إغلاق',
            noReady: 'لا توجد أوردرات دليفري جاهزة للتعيين',
            noRoad: 'لا توجد أوردرات دليفري في الطريق',
            noDrivers: 'لا يوجد طيارين بعد',
            addressMissing: 'لا يوجد عنوان مسجل',
            assign: 'تعيين وخروج',
            delivered: 'تم التسليم',
            arrived: 'رجع الفرع',
            saveDriver: 'حفظ الطيار',
            saving: 'جاري الحفظ...',
            refresh: 'تحديث',
            unavailable: 'لا يوجد طيار متاح',
            liveMap: 'خريطة التتبع الحي',
            expected: 'المفروض',
            remaining: 'متبقي',
            late: 'متأخر',
            onTime: 'في الوقت',
            watch: 'مراقبة',
            driverLeft: 'خرج بالأوردر',
            driverBack: 'رجع الفرع',
            loginBranch: 'دخول الفرع',
            logoutBranch: 'خروج',
        });
    }

    const loadDrivers = async () => {
        setIsLoadingDrivers(true);
        try {
            const data = await deliveryApi.getDrivers(activeBranchId ? { branchId: activeBranchId } : undefined);
            setDrivers(data.map((d: any) => ({
                id: String(d.id),
                name: String(d.name || ''),
                phone: String(d.phone || ''),
                status: toUiDriverStatus(d.status),
                vehicleType: (d.vehicleType || d.vehicle_type || 'BIKE') as Driver['vehicleType'],
                branchId: d.branchId || d.branch_id,
                isActive: d.isActive !== false && d.is_active !== false,
            })));
        } catch (error) {
            setOperationError(getErrorMessage(error, 'Failed to load drivers', 'تعذر تحميل الطيارين'));
        } finally {
            setIsLoadingDrivers(false);
        }
    };

    const loadTelemetry = async () => {
        try {
            const telemetry = await deliveryApi.getTelemetry(activeBranchId || undefined);
            const map: Record<string, DriverTelemetry> = {};
            for (const item of telemetry || []) {
                map[item.driverId] = item;
            }
            setTelemetryByDriver(map);
        } catch (error) {
            setOperationError(getErrorMessage(error, 'Failed to load driver locations', 'تعذر تحميل مواقع الطيارين'));
        }
    };

    const loadSlaAlerts = async () => {
        try {
            const result = await deliveryApi.getSlaAlerts(activeBranchId ? { branchId: activeBranchId } : undefined);
            setSlaAlerts(Array.isArray(result.alerts) ? result.alerts : []);
        } catch (error) {
            setOperationError(getErrorMessage(error, 'Failed to load SLA alerts', 'تعذر تحميل تنبيهات التأخير'));
            setSlaAlerts([]);
        }
    };

    const refreshAll = async () => {
        setIsRefreshing(true);
        setOperationError(null);
        try {
            await Promise.all([
                fetchOrders(activeBranchId ? { branch_id: activeBranchId, limit: 150 } : { limit: 150 }),
                loadDrivers(),
                loadTelemetry(),
                loadSlaAlerts(),
            ]);
        } catch (error) {
            setOperationError(getErrorMessage(error, 'Failed to refresh dispatch data', 'تعذر تحديث بيانات الديسباتش'));
        } finally {
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        refreshAll();
    }, [activeBranchId]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            loadTelemetry();
            loadSlaAlerts();
        }, 30000);
        return () => window.clearInterval(timer);
    }, [activeBranchId]);

    useEffect(() => {
        const reload = () => refreshAll();
        const onDriverStatus = (payload: { id: string; status: string }) => {
            setDrivers(prev => prev.map(driver => driver.id === payload.id ? { ...driver, status: toUiDriverStatus(payload.status) } : driver));
        };
        const onDriverLocation = (payload: DriverTelemetry) => {
            if (!payload?.driverId) return;
            setTelemetryByDriver(prev => ({ ...prev, [payload.driverId]: payload }));
        };
        socketService.on('order:created', reload);
        socketService.on('order:updated', reload);
        socketService.on('order:status', reload);
        socketService.on('dispatch:assigned', reload);
        socketService.on('delivery:sla-escalation', reload);
        socketService.on('driver:status', onDriverStatus as any);
        socketService.on('driver:location', onDriverLocation as any);
        return () => {
            socketService.off('order:created', reload);
            socketService.off('order:updated', reload);
            socketService.off('order:status', reload);
            socketService.off('dispatch:assigned', reload);
            socketService.off('delivery:sla-escalation', reload);
            socketService.off('driver:status', onDriverStatus as any);
            socketService.off('driver:location', onDriverLocation as any);
        };
    }, [activeBranchId]);

    const deliveryOrders = useMemo(() => {
        return orders
            .filter(order => order.type === OrderType.DELIVERY)
            .filter(order => !activeBranchId || order.branchId === activeBranchId)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }, [orders, activeBranchId]);

    const readyOrders = useMemo(() => {
        return deliveryOrders.filter(order =>
            [OrderStatus.READY, OrderStatus.PREPARING, OrderStatus.PENDING].includes(order.status) &&
            order.status !== OrderStatus.CANCELLED &&
            order.status !== OrderStatus.DELIVERED
        );
    }, [deliveryOrders]);

    const roadOrders = useMemo(() => {
        return deliveryOrders.filter(order => order.status === OrderStatus.OUT_FOR_DELIVERY);
    }, [deliveryOrders]);

    const activeDrivers = useMemo(() => drivers.filter(driver => driver.isActive !== false), [drivers]);
    const availableDrivers = useMemo(
        () => activeDrivers.filter(driver => driver.status === 'AVAILABLE'),
        [activeDrivers],
    );

    const driverById = useMemo(() => new Map(activeDrivers.map(driver => [driver.id, driver])), [activeDrivers]);
    const criticalAlerts = useMemo(
        () => slaAlerts.filter(alert => ['HIGH', 'CRITICAL'].includes(String(alert?.severity || '').toUpperCase())),
        [slaAlerts],
    );

    const getLastSeenLabel = (driverId: string) => {
        const telemetry = telemetryByDriver[driverId];
        if (!telemetry?.updatedAt) return isAr ? 'لا يوجد موقع' : 'No location';
        const mins = Math.max(0, Math.floor((Date.now() - new Date(telemetry.updatedAt).getTime()) / 60000));
        if (mins === 0) return isAr ? 'الآن' : 'now';
        return isAr ? `منذ ${mins} د` : `${mins}m ago`;
    };

    const getTiming = (order: Order) => {
        const elapsed = getOrderAgeMins(order);
        const driver = order.driverId ? driverById.get(order.driverId) : undefined;
        const telemetry = order.driverId ? telemetryByDriver[order.driverId] : undefined;
        const staleMins = telemetry?.updatedAt
            ? Math.max(0, Math.floor((Date.now() - new Date(telemetry.updatedAt).getTime()) / 60000))
            : 0;
        const speed = Number(telemetry?.speedKmh || 0);
        const baseEta = order.status === OrderStatus.OUT_FOR_DELIVERY ? 18 : 28;
        const speedAdjustment = speed >= 35 ? -5 : speed > 0 && speed < 12 ? 8 : 0;
        const staleAdjustment = staleMins >= 10 ? 6 : staleMins >= 5 ? 3 : 0;
        const fallbackEta = Math.max(5, Math.round(baseEta + speedAdjustment + staleAdjustment));
        const routeEta = order.deliveryLat && order.deliveryLng
            ? estimateEta(defaultMapCenter, { lat: order.deliveryLat, lng: order.deliveryLng }, speed > 8 ? speed : 24)
            : null;
        const eta = routeEta?.etaMinutes ?? fallbackEta;
        const projected = elapsed + eta;
        const lateBy = Math.max(0, projected - SLA_MINUTES);
        const remaining = Math.max(0, SLA_MINUTES - elapsed);
        const score = projected <= SLA_MINUTES ? 100 : projected <= SLA_MINUTES + 10 ? 70 : projected <= SLA_MINUTES + 20 ? 45 : 20;
        return {
            elapsed,
            eta,
            projected,
            remaining,
            lateBy,
            score,
            driver,
            telemetry,
            distanceKm: routeEta?.distanceKm,
            etaSource: routeEta?.source,
            isLate: elapsed > SLA_MINUTES || projected > SLA_MINUTES,
            label: projected <= SLA_MINUTES ? copy.onTime : `${copy.late} ${lateBy}m`,
        };
    };

    const mapDrivers = useMemo(() => activeDrivers.map(driver => {
        const telemetry = telemetryByDriver[driver.id];
        return {
            id: driver.id,
            name: driver.name,
            status: driver.status,
            lat: telemetry?.lat,
            lng: telemetry?.lng,
            speedKmh: telemetry?.speedKmh,
            lastSeenLabel: getLastSeenLabel(driver.id),
        };
    }), [activeDrivers, telemetryByDriver]);

    const mapOrders = useMemo(() => deliveryOrders
        .filter(order => ['READY', 'OUT_FOR_DELIVERY', 'PREPARING'].includes(String(order.status)))
        .map(order => ({
            id: order.id,
            label: formatDisplayId(order),
            address: order.deliveryAddress,
            lat: order.deliveryLat,
            lng: order.deliveryLng,
            driverId: order.driverId,
            status: order.status,
        })), [deliveryOrders]);

    const saveDriver = async () => {
        const name = driverForm.name.trim();
        const phone = driverForm.phone.trim();
        const branchId = activeBranchId || settings.currentUser?.assignedBranchId || '';
        if (!name || !phone || !branchId) {
            setOperationError(isAr ? 'اسم الطيار والهاتف والفرع مطلوبين.' : 'Driver name, phone, and branch are required.');
            return;
        }

        setIsSavingDriver(true);
        setOperationError(null);
        setOperationMessage(null);
        try {
            await deliveryApi.createDriver({
                name,
                phone,
                branchId,
                email: driverForm.email.trim() || undefined,
                password: driverForm.password.trim() || undefined,
                pin: driverForm.pin.trim() || undefined,
                createLogin: driverForm.createLogin,
                status: 'AVAILABLE',
            });
            setDriverForm({ name: '', phone: '', email: '', password: '', pin: '', createLogin: true });
            setShowDriverForm(false);
            await loadDrivers();
            setOperationMessage(isAr ? 'تم حفظ الطيار' : 'Driver saved');
        } catch (error) {
            setOperationError(getErrorMessage(error, 'Failed to save driver', 'تعذر حفظ الطيار'));
        } finally {
            setIsSavingDriver(false);
        }
    };

    const assignDriver = async (orderId: string, driverId: string) => {
        if (isAssigningOrderId) return;
        setIsAssigningOrderId(orderId);
        setOperationError(null);
        setOperationMessage(null);
        try {
            await deliveryApi.assign({ orderId, driverId });
            await refreshAll();
            setOperationMessage(isAr ? 'تم تعيين الطيار وخروج الأوردر' : 'Driver assigned and order dispatched');
        } catch (error) {
            setOperationError(getErrorMessage(error, 'Failed to assign driver', 'تعذر تعيين الطيار'));
        } finally {
            setIsAssigningOrderId(null);
        }
    };

    const changeDriverStatus = async (driverId: string, status: Driver['status']) => {
        setOperationError(null);
        try {
            await deliveryApi.updateDriverStatus(driverId, toApiDriverStatus(status));
            await loadDrivers();
        } catch (error) {
            setOperationError(getErrorMessage(error, 'Failed to update driver status', 'تعذر تحديث حالة الطيار'));
        }
    };

    const deactivateDriver = async (driverId: string) => {
        const driver = drivers.find(d => d.id === driverId);
        const confirmed = await confirm({
            title: isAr ? 'تعطيل الطيار؟' : 'Disable driver?',
            message: isAr
                ? `سيتم إخفاء ${driver?.name || 'الطيار'} من قائمة الطيارين المتاحين.`
                : `${driver?.name || 'This driver'} will be removed from the available drivers list.`,
            confirmText: isAr ? 'تعطيل' : 'Disable',
            cancelText: isAr ? 'إلغاء' : 'Cancel',
            variant: 'danger',
        });
        if (!confirmed) return;
        setOperationError(null);
        try {
            await deliveryApi.updateDriver(driverId, { status: 'OFFLINE', isActive: false });
            await loadDrivers();
            setOperationMessage(isAr ? 'تم تعطيل الطيار' : 'Driver disabled');
        } catch (error) {
            setOperationError(getErrorMessage(error, 'Failed to disable driver', 'تعذر تعطيل الطيار'));
        }
    };

    const confirmDeliveredAndReturning = async (order: Order) => {
        if (isCompletingOrderId) return;
        setIsCompletingOrderId(order.id);
        setOperationError(null);
        setOperationMessage(null);
        try {
            await updateOrderStatus(order.id, OrderStatus.DELIVERED);
            if (order.driverId) {
                await deliveryApi.updateDriverStatus(order.driverId, 'RETURNING');
            }
            await refreshAll();
            setOperationMessage(isAr ? 'تم تسجيل التسليم والطيار راجع للفرع' : 'Delivery confirmed and driver marked returning');
        } catch (error) {
            setOperationError(getErrorMessage(error, 'Failed to confirm delivery', 'تعذر تأكيد التسليم'));
        } finally {
            setIsCompletingOrderId(null);
        }
    };

    const renderOrderCard = (order: Order, mode: 'ready' | 'road') => {
        const age = getOrderAgeMins(order);
        const delayed = age >= SLA_MINUTES && order.status !== OrderStatus.DELIVERED;
        const driver = order.driverId ? driverById.get(order.driverId) : undefined;
        const timing = getTiming(order);
        return (
            <article key={order.id} className={`rounded-2xl border bg-card p-4 shadow-sm ${delayed ? 'border-rose-300 ring-1 ring-rose-200' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-main">{formatDisplayId(order)}</span>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-black ${delayed ? 'bg-rose-100 text-rose-700' : 'bg-elevated text-muted'}`}>
                                {age}m
                            </span>
                            {order.isUrgent && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">{isAr ? 'عاجل' : 'URGENT'}</span>}
                        </div>
                        <h3 className="mt-2 truncate text-base font-black text-main">{order.customerName || (isAr ? 'عميل دليفري' : 'Delivery customer')}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-bold text-muted">
                            {order.customerPhone && <span className="inline-flex items-center gap-1"><Phone size={13} />{order.customerPhone}</span>}
                            <span className="inline-flex items-center gap-1"><Clock size={13} />{order.status}</span>
                            <span className="text-primary">{Number(order.total || 0).toFixed(2)} {settings.currencySymbol || 'EGP'}</span>
                        </div>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        {mode === 'road' ? <Bike size={20} /> : <PackageCheck size={20} />}
                    </div>
                </div>

                <div className="mt-4 rounded-xl border border-border bg-elevated/40 p-3">
                    <div className="flex items-start gap-2 text-xs font-bold leading-5 text-main">
                        <MapPin className="mt-0.5 shrink-0 text-rose-500" size={15} />
                        <span>{order.deliveryAddress || copy.addressMissing}</span>
                    </div>
                    {order.deliveryNotes && <p className="mt-2 text-xs font-semibold text-muted">{order.deliveryNotes}</p>}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-border bg-app px-3 py-2">
                        <div className="text-[10px] font-black text-muted">{copy.expected}</div>
                        <div className="mt-1 text-sm font-black text-main">{SLA_MINUTES}m</div>
                    </div>
                    <div className="rounded-xl border border-border bg-app px-3 py-2">
                        <div className="text-[10px] font-black text-muted">ETA</div>
                        <div className="mt-1 text-sm font-black text-main">{timing.eta}m</div>
                        {timing.distanceKm && <div className="mt-0.5 text-[9px] font-black text-muted">{timing.distanceKm} km</div>}
                    </div>
                    <div className={`rounded-xl border px-3 py-2 ${timing.isLate ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                        <div className="text-[10px] font-black opacity-70">{copy.watch}</div>
                        <div className="mt-1 text-sm font-black">{timing.label}</div>
                    </div>
                </div>

                {mode === 'ready' ? (
                    <div className="mt-4">
                        <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-muted">
                            {isAr ? 'اختار الطيار' : 'Choose driver'}
                        </div>
                        {availableDrivers.length === 0 ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">
                                {copy.unavailable}
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {availableDrivers.map(driver => (
                                    <button
                                        key={driver.id}
                                        onClick={() => assignDriver(order.id, driver.id)}
                                        disabled={isAssigningOrderId === order.id}
                                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-app px-3 py-2 text-xs font-black text-main transition hover:border-primary hover:text-primary disabled:opacity-50"
                                    >
                                        <User size={14} />
                                        {driver.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-app p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-wider text-muted">{isAr ? 'الطيار الحالي' : 'Assigned driver'}</div>
                            <div className="mt-1 truncate text-sm font-black text-main">{driver?.name || order.driverId || '-'}</div>
                            <div className="mt-1 text-[11px] font-bold text-muted">{copy.driverLeft} - {getLastSeenLabel(order.driverId || '')}</div>
                        </div>
                        <button
                            onClick={() => confirmDeliveredAndReturning(order)}
                            disabled={isCompletingOrderId === order.id}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                            <CheckCircle2 size={15} />
                            {copy.delivered}
                        </button>
                    </div>
                )}
            </article>
        );
    };

    return (
        <div className="min-h-screen bg-app p-4 md:p-6 lg:p-8" dir={isAr ? 'rtl' : 'ltr'}>
            <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
                        <Truck size={25} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-main">{copy.title}</h1>
                        <p className="mt-1 text-sm font-bold text-muted">{copy.subtitle}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={refreshAll}
                        disabled={isRefreshing}
                        className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-black text-main transition hover:bg-elevated disabled:opacity-60"
                    >
                        <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
                        {copy.refresh}
                    </button>
                    <button
                        onClick={() => setShowDriverForm(value => !value)}
                        className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-white transition hover:opacity-90"
                    >
                        {showDriverForm ? <X size={15} /> : <Plus size={15} />}
                        {showDriverForm ? copy.close : copy.addDriver}
                    </button>
                </div>
            </header>

            {(operationError || operationMessage) && (
                <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-bold ${
                    operationError
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                    {operationError || operationMessage}
                </div>
            )}

            <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
                {[
                    { label: isAr ? 'دليفري اليوم' : 'Delivery orders', value: deliveryOrders.length },
                    { label: copy.ready, value: readyOrders.length },
                    { label: copy.onRoad, value: roadOrders.length },
                    { label: isAr ? 'طيارين متاحين' : 'Available drivers', value: availableDrivers.length },
                    { label: isAr ? 'تنبيهات SLA' : 'SLA alerts', value: criticalAlerts.length, danger: criticalAlerts.length > 0 },
                ].map(item => (
                    <div key={item.label} className={`rounded-2xl border bg-card p-4 ${item.danger ? 'border-rose-300' : 'border-border'}`}>
                        <div className="text-[11px] font-black uppercase tracking-wider text-muted">{item.label}</div>
                        <div className={`mt-2 text-2xl font-black ${item.danger ? 'text-rose-600' : 'text-main'}`}>{item.value}</div>
                    </div>
                ))}
            </section>

            <section id="route" className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <DeliveryTrackingMap
                    lang={lang}
                    title={copy.liveMap}
                    subtitle={isAr ? 'خريطة Google فعلية للطيارين وأماكن أوردرات الدليفري.' : 'Real Google map for drivers and delivery orders.'}
                    drivers={mapDrivers}
                    orders={mapOrders}
                    center={defaultMapCenter}
                    heightClass="min-h-[360px]"
                    showSearch
                />

                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <h3 className="mb-3 text-sm font-black text-main">{isAr ? 'متابعة الطريق' : 'Route watch'}</h3>
                    <div className="space-y-3">
                        {roadOrders.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs font-black text-muted">{copy.noRoad}</div>
                        ) : roadOrders.map(order => {
                            const timing = getTiming(order);
                            return (
                                <div key={order.id} className="rounded-xl border border-border bg-app p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-black text-main">{formatDisplayId(order)}</div>
                                            <div className="mt-1 truncate text-xs font-bold text-muted">{timing.driver?.name || order.driverId || '-'}</div>
                                        </div>
                                        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${timing.isLate ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {timing.score}%
                                        </span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                        <div className="rounded-lg bg-card p-2">
                                            <div className="text-[9px] font-black text-muted">{isAr ? 'مضى' : 'Elapsed'}</div>
                                            <div className="text-xs font-black text-main">{timing.elapsed}m</div>
                                        </div>
                                        <div className="rounded-lg bg-card p-2">
                                            <div className="text-[9px] font-black text-muted">ETA</div>
                                            <div className="text-xs font-black text-main">{timing.eta}m</div>
                                            {timing.distanceKm && <div className="text-[9px] font-black text-muted">{timing.distanceKm} km</div>}
                                        </div>
                                        <div className="rounded-lg bg-card p-2">
                                            <div className="text-[9px] font-black text-muted">{copy.expected}</div>
                                            <div className="text-xs font-black text-main">{SLA_MINUTES}m</div>
                                        </div>
                                    </div>
                                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-card">
                                        <div className={`h-full rounded-full ${timing.isLate ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.max(8, (timing.elapsed / SLA_MINUTES) * 100))}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {showDriverForm && (
                <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="mb-4 flex items-center gap-2 text-sm font-black text-main">
                        <User size={18} />
                        {copy.addDriver}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <input value={driverForm.name} onChange={e => setDriverForm(f => ({ ...f, name: e.target.value }))} placeholder={isAr ? 'اسم الطيار' : 'Driver name'} className="h-11 rounded-xl border border-border bg-app px-3 text-sm font-bold outline-none focus:border-primary" />
                        <input value={driverForm.phone} onChange={e => setDriverForm(f => ({ ...f, phone: e.target.value }))} placeholder={isAr ? 'رقم الهاتف' : 'Phone'} className="h-11 rounded-xl border border-border bg-app px-3 text-sm font-bold outline-none focus:border-primary" />
                        <input value={driverForm.email} onChange={e => setDriverForm(f => ({ ...f, email: e.target.value }))} placeholder={isAr ? 'إيميل الدخول' : 'Login email'} className="h-11 rounded-xl border border-border bg-app px-3 text-sm font-bold outline-none focus:border-primary" />
                        <input value={driverForm.password} onChange={e => setDriverForm(f => ({ ...f, password: e.target.value }))} placeholder={isAr ? 'كلمة المرور' : 'Password'} type="password" className="h-11 rounded-xl border border-border bg-app px-3 text-sm font-bold outline-none focus:border-primary" />
                        <input value={driverForm.pin} onChange={e => setDriverForm(f => ({ ...f, pin: e.target.value }))} placeholder="PIN" className="h-11 rounded-xl border border-border bg-app px-3 text-sm font-bold outline-none focus:border-primary" />
                        <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-app px-3 text-xs font-black text-muted">
                            <input type="checkbox" checked={driverForm.createLogin} onChange={e => setDriverForm(f => ({ ...f, createLogin: e.target.checked }))} />
                            {isAr ? 'إنشاء حساب دخول للطيار' : 'Create driver login'}
                        </label>
                    </div>
                    {driverForm.createLogin && !driverForm.email.trim() && (
                        <p className="mt-3 text-xs font-bold text-amber-600">{isAr ? 'الإيميل مطلوب عند إنشاء حساب دخول.' : 'Email is required when creating a login.'}</p>
                    )}
                    <button
                        onClick={saveDriver}
                        disabled={isSavingDriver || !driverForm.name.trim() || !driverForm.phone.trim() || (driverForm.createLogin && !driverForm.email.trim())}
                        className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-black text-white disabled:opacity-50"
                    >
                        <Save size={15} />
                        {isSavingDriver ? copy.saving : copy.saveDriver}
                    </button>
                </section>
            )}

            <main className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
                <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="min-w-0">
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-sm font-black text-main">
                                <PackageCheck size={18} className="text-primary" />
                                {copy.ready}
                            </h2>
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">{readyOrders.length}</span>
                        </div>
                        <div className="space-y-3">
                            {readyOrders.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm font-black text-muted">{copy.noReady}</div>
                            ) : readyOrders.map(order => renderOrderCard(order, 'ready'))}
                        </div>
                    </div>

                    <div className="min-w-0">
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-sm font-black text-main">
                                <Navigation size={18} className="text-primary" />
                                {copy.onRoad}
                            </h2>
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">{roadOrders.length}</span>
                        </div>
                        <div className="space-y-3">
                            {roadOrders.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm font-black text-muted">{copy.noRoad}</div>
                            ) : roadOrders.map(order => renderOrderCard(order, 'road'))}
                        </div>
                    </div>
                </section>

                <aside className="space-y-4">
                    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-sm font-black text-main">
                                <User size={18} className="text-primary" />
                                {copy.drivers}
                            </h2>
                            {isLoadingDrivers && <RefreshCw size={14} className="animate-spin text-muted" />}
                        </div>

                        <div className="space-y-3">
                            {activeDrivers.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs font-black text-muted">{copy.noDrivers}</div>
                            ) : activeDrivers.map(driver => {
                                const telemetry = telemetryByDriver[driver.id];
                                const statusClass = driver.status === 'AVAILABLE'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : driver.status === 'ON_DELIVERY'
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : driver.status === 'RETURNING'
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-elevated text-muted';
                                return (
                                    <div key={driver.id} className="rounded-2xl border border-border bg-app p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-black text-main">{driver.name}</div>
                                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted">
                                                    <span>{driver.phone}</span>
                                                    <span>{driver.vehicleType}</span>
                                                    <span>{getLastSeenLabel(driver.id)}</span>
                                                </div>
                                                {telemetry && (
                                                    <div className="mt-2 text-[10px] font-bold text-muted">
                                                        {telemetry.lat.toFixed(4)}, {telemetry.lng.toFixed(4)}
                                                    </div>
                                                )}
                                            </div>
                                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${statusClass}`}>
                                                {driver.status}
                                            </span>
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <button
                                                onClick={() => changeDriverStatus(driver.id, 'AVAILABLE')}
                                                className="h-9 rounded-xl bg-emerald-600 px-3 text-[10px] font-black text-white"
                                            >
                                                {copy.loginBranch}
                                            </button>
                                            <button
                                                onClick={() => changeDriverStatus(driver.id, 'ON_DELIVERY')}
                                                className="h-9 rounded-xl bg-indigo-600 px-3 text-[10px] font-black text-white"
                                            >
                                                {copy.driverLeft}
                                            </button>
                                            <select
                                                value={driver.status}
                                                onChange={e => changeDriverStatus(driver.id, e.target.value as Driver['status'])}
                                                className="h-9 flex-1 rounded-xl border border-border bg-card px-2 text-[11px] font-black text-main outline-none"
                                            >
                                                <option value="AVAILABLE">{isAr ? 'متاح' : 'Available'}</option>
                                                <option value="BREAK">{isAr ? 'استراحة' : 'Break'}</option>
                                                <option value="OFFLINE">{isAr ? 'غير متصل' : 'Offline'}</option>
                                                <option value="RETURNING">{isAr ? 'راجع للمطعم' : 'Returning'}</option>
                                                <option value="ON_DELIVERY">{isAr ? 'في التوصيل' : 'On delivery'}</option>
                                            </select>
                                            {driver.status === 'RETURNING' && (
                                                <button onClick={() => changeDriverStatus(driver.id, 'AVAILABLE')} className="h-9 rounded-xl bg-emerald-600 px-3 text-[10px] font-black text-white">
                                                    {copy.arrived}
                                                </button>
                                            )}
                                            <button onClick={() => changeDriverStatus(driver.id, 'OFFLINE')} className="h-9 rounded-xl bg-slate-500/10 px-3 text-[10px] font-black text-slate-600">
                                                {copy.logoutBranch}
                                            </button>
                                            <button onClick={() => deactivateDriver(driver.id)} className="h-9 rounded-xl bg-rose-500/10 px-3 text-[10px] font-black text-rose-600">
                                                {isAr ? 'تعطيل' : 'Disable'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {criticalAlerts.length > 0 && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
                            <div className="mb-3 flex items-center gap-2 text-sm font-black">
                                <AlertTriangle size={17} />
                                {isAr ? 'تنبيهات تأخير' : 'Delay alerts'}
                            </div>
                            <div className="space-y-2">
                                {criticalAlerts.slice(0, 6).map((alert: any) => (
                                    <div key={alert.id || `${alert.orderId}-${alert.type}`} className="rounded-xl bg-white/80 p-3 text-xs font-bold">
                                        #{String(alert.orderId || '').slice(-6)} - {alert.details || alert.type || 'SLA'}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </aside>
            </main>
        </div>
    );
};

export default DispatchHub;
