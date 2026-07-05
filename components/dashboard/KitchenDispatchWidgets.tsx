import React, { useEffect, useMemo, useState } from 'react';
import { ChefHat, Truck, Clock, AlertTriangle, Users } from 'lucide-react';
import { deliveryApi } from '../../services/api/delivery';
import { useAuthStore } from '../../stores/useAuthStore';
import { useOrderStore } from '../../stores/useOrderStore';
import { Driver, OrderStatus, OrderType } from '../../types';

export const KitchenPerformanceWidget = () => {
    const { settings } = useAuthStore();
    const isAr = (settings.language || 'en') === 'ar';
    const stations = [
        { station: isAr ? 'الشواية' : 'Grill', load: 90, status: 'warning', delayed: 2 },
        { station: isAr ? 'القلاية' : 'Fryer', load: 45, status: 'stable', delayed: 0 },
        { station: isAr ? 'السلطات' : 'Salad', load: 60, status: 'stable', delayed: 0 },
    ];

    return (
        <div className="flex flex-col h-full w-full bg-transparent">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center p-3 lg:p-4 border-b border-border/20 bg-card/40">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shadow-inner">
                        <ChefHat size={14} />
                    </div>
                    <div>
                        <h3 className="text-[11px] lg:text-[12px] font-black uppercase tracking-widest text-main leading-none">
                            {isAr ? 'حالة المطبخ' : 'Kitchen Status'}
                        </h3>
                        <p className="text-[9px] text-muted font-bold tracking-widest mt-1 uppercase">{isAr ? 'ضغط المحطات الآن' : 'Live Station Load'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <span className="flex h-1.5 w-1.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                    </span>
                    <span className="text-[9px] uppercase tracking-widest font-black text-amber-500 leading-none mt-0.5">{isAr ? 'نشط' : 'Active'}</span>
                </div>
            </div>

            <div className="flex-1 flex flex-col p-3 lg:p-4 bg-app/30 overflow-hidden">
                <div className="shrink-0 grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-elevated/80 p-3 rounded-2xl border border-border/40 flex flex-col items-center justify-center shadow-sm">
                        <span className="text-xl font-black text-main tabular-nums tracking-tight">85%</span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted mt-1">{isAr ? 'الحمل العام' : 'Global Load'}</span>
                    </div>
                    <div className="bg-elevated/80 p-3 rounded-2xl border border-border/40 flex flex-col items-center justify-center shadow-sm">
                        <span className="text-xl font-black text-amber-500 tabular-nums tracking-tight">14m</span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted mt-1">{isAr ? 'متوسط التذكرة' : 'Avg Ticket'}</span>
                    </div>
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                    {stations.map((station, i) => (
                        <div key={i} className="flex flex-col gap-2 p-3 rounded-xl bg-card border border-border/30 hover:shadow-sm transition-shadow">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-main">{station.station}</span>
                                {station.delayed > 0 ? (
                                    <span className="flex items-center gap-1 text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                                        <AlertTriangle size={10} /> {station.delayed} {isAr ? 'متأخر' : 'delayed'}
                                    </span>
                                ) : (
                                    <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">{isAr ? 'طبيعي' : 'Normal'}</span>
                                )}
                            </div>
                            <div className="w-full bg-elevated rounded-full h-1.5 overflow-hidden">
                                <div
                                    className={`h-full ${station.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'} rounded-full transition-all duration-150`}
                                    style={{ width: `${station.load}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const DeliveryStatusWidget = () => {
    const { settings } = useAuthStore();
    const { orders, fetchOrders } = useOrderStore();
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const lang = settings.language || 'en';
    const isAr = lang === 'ar';
    const branchId = settings.activeBranchId;

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            try {
                setLoadError('');
                const [driverRows] = await Promise.all([
                    deliveryApi.getDrivers(branchId ? { branchId } : undefined),
                    fetchOrders(branchId ? { branch_id: branchId, limit: 150 } : { limit: 150 }),
                ]);
                if (cancelled) return;
                setDrivers((driverRows || []).map((driver: any) => ({
                    id: String(driver.id),
                    name: String(driver.name || ''),
                    phone: String(driver.phone || ''),
                    status: String(driver.status || 'OFFLINE').toUpperCase() === 'BUSY'
                        ? 'ON_DELIVERY'
                        : String(driver.status || 'OFFLINE').toUpperCase() as Driver['status'],
                    vehicleType: 'BIKE',
                    branchId: driver.branchId || driver.branch_id,
                    isActive: driver.isActive !== false && driver.is_active !== false,
                })));
            } catch {
                if (!cancelled) {
                    setDrivers([]);
                    setLoadError(isAr ? 'تعذر تحميل حالة الدليفري' : 'Delivery status unavailable');
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        const timer = window.setInterval(load, 60000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [branchId, fetchOrders]);

    const deliveryOrders = useMemo(() => orders
        .filter(order => order.type === OrderType.DELIVERY)
        .filter(order => !branchId || order.branchId === branchId)
        .filter(order => ![OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.COMPLETED].includes(order.status)),
        [orders, branchId],
    );

    const rows = useMemo(() => {
        const byDriver = new Map<string, typeof deliveryOrders>();
        for (const order of deliveryOrders) {
            if (!order.driverId) continue;
            const list = byDriver.get(order.driverId) || [];
            list.push(order);
            byDriver.set(order.driverId, list);
        }

        return drivers.filter(driver => driver.isActive !== false).map((driver) => {
            const assigned = byDriver.get(driver.id) || [];
            const currentOrder = assigned[0];
            const orderAge = currentOrder
                ? Math.max(0, Math.floor((Date.now() - new Date(currentOrder.createdAt).getTime()) / 60000))
                : 0;
            return {
                id: driver.id,
                driver: driver.name || driver.id,
                zone: currentOrder?.deliveryAddressLabel || currentOrder?.deliveryAddress || (isAr ? 'بدون أوردر نشط' : 'No active order'),
                time: currentOrder ? `${orderAge}m` : '-',
                est: currentOrder
                    ? (orderAge > 45 ? (isAr ? 'متأخر' : 'Late') : (isAr ? 'في الطريق' : 'On route'))
                    : (driver.status === 'AVAILABLE' ? (isAr ? 'متاح' : 'Available') : String(driver.status || 'OFFLINE')),
                status: currentOrder ? (orderAge > 45 ? 'late' : 'enroute') : 'idle',
            };
        });
    }, [drivers, deliveryOrders, isAr]);

    const activeCount = rows.filter(row => row.status !== 'idle').length;

    return (
        <div className="flex flex-col h-full w-full bg-transparent overflow-hidden border border-border/20 rounded-2xl bg-card/60 shadow-sm">
            <div className="shrink-0 flex justify-between items-center p-3 lg:p-4 border-b border-border/20 bg-card/40">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 border border-indigo-500/20 shadow-inner">
                        <Truck size={14} />
                    </div>
                    <div>
                        <h3 className="text-[11px] lg:text-[12px] font-black uppercase tracking-widest text-main leading-none">
                            {isAr ? 'أداء التوصيل' : 'Fleet Dispatch'}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-muted font-bold tracking-widest uppercase">{isAr ? 'متابعة فعلية' : 'Live Tracking'}</span>
                            <span className="flex items-center gap-1 text-[9px] font-black tracking-widest uppercase text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                                <Users size={10} /> {drivers.length} {isAr ? 'طيارين' : 'Drivers'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col p-3 lg:p-4 bg-app/30 overflow-hidden">
                <div className="space-y-2 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                    {rows.length === 0 && (
                        <div className="flex h-full min-h-[150px] items-center justify-center rounded-xl border border-border/30 bg-card/70 p-4 text-center">
                            <div>
                                <Truck size={28} className="mx-auto mb-3 text-muted/40" />
                                <p className="text-[11px] font-black text-muted">
                                    {loadError || (isLoading ? (isAr ? 'جاري تحميل التوصيل...' : 'Loading delivery data...') : (isAr ? 'لا يوجد طيارين أو أوردرات دليفري نشطة' : 'No active drivers or delivery orders'))}
                                </p>
                            </div>
                        </div>
                    )}
                    {rows.slice(0, 6).map((fleet) => (
                        <div key={fleet.id} className="flex justify-between items-center p-3 rounded-xl bg-card border border-border/30 hover:border-indigo-500/30 hover:shadow-sm transition-all group">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-8 h-8 rounded-full ${fleet.status === 'idle' ? 'bg-elevated text-muted' : fleet.status === 'late' ? 'bg-rose-500/20 text-rose-500' : 'bg-indigo-500/20 text-indigo-500'} flex items-center justify-center font-bold text-[10px] shrink-0`}>
                                    {fleet.driver.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                    <span className="block text-[11px] font-bold text-main truncate">{fleet.driver}</span>
                                    <span className="block max-w-[150px] truncate text-[9px] font-bold text-muted uppercase tracking-wider">{fleet.zone}</span>
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <span className={`block text-[11px] font-black ${fleet.status === 'idle' ? 'text-muted' : fleet.status === 'late' ? 'text-rose-500' : 'text-emerald-500'}`}>{fleet.est}</span>
                                <span className="flex items-center justify-end gap-1 text-[9px] font-bold text-muted uppercase mt-0.5">
                                    <Clock size={10} /> {fleet.time}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl border border-border/20 bg-card/70 p-2">
                        <p className="text-[9px] font-black uppercase text-muted">{isAr ? 'أوردرات نشطة' : 'Active'}</p>
                        <p className="text-sm font-black text-main">{deliveryOrders.length}</p>
                    </div>
                    <div className="rounded-xl border border-border/20 bg-card/70 p-2">
                        <p className="text-[9px] font-black uppercase text-muted">{isAr ? 'على الطريق' : 'On Road'}</p>
                        <p className="text-sm font-black text-main">{activeCount}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
