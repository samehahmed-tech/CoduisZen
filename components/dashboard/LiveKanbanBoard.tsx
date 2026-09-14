import React from 'react';
import { ChefHat, ShoppingBag, Truck, CheckCircle, Clock } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useOrderStore } from '../../stores/useOrderStore';
import { OrderStatus } from '../../types';

const COLUMNS = [
    { id: OrderStatus.PENDING, label: 'New Orders', labelAr: 'طلبات جديدة', icon: ShoppingBag, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { id: OrderStatus.PREPARING, label: 'Preparing', labelAr: 'قيد التحضير', icon: ChefHat, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { id: OrderStatus.READY, label: 'Ready', labelAr: 'جاهز', icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { id: OrderStatus.OUT_FOR_DELIVERY, label: 'Dispatched', labelAr: 'تم الإرسال', icon: Truck, color: 'text-slate-500', bg: 'bg-slate-500/10' }
];

const orderAgeMinutes = (createdAt: Date | string) => {
    const created = new Date(createdAt).getTime();
    if (!Number.isFinite(created)) return 0;
    return Math.max(0, Math.floor((Date.now() - created) / 60000));
};

const LiveKanbanBoard = () => {
    const { settings } = useAuthStore();
    const lang = (settings.language || 'en') as 'en' | 'ar';
    const isAr = lang === 'ar';
    const currency = settings.currencySymbol;
    const orders = useOrderStore((state) => state.orders);

    return (
        <div className="flex flex-col h-full w-full bg-transparent">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center p-3 lg:p-4 border-b border-border/20 bg-card/40">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-inner">
                        <ShoppingBag size={14} />
                    </div>
                    <div>
                        <h3 className="text-[11px] lg:text-[12px] font-black uppercase tracking-widest text-main leading-none">
                            {isAr ? 'مسار الطلبات الحي' : 'Live Pipeline'}
                        </h3>
                        <p className="text-[9px] text-muted font-bold tracking-widest mt-1 uppercase">{isAr ? 'مزامنة المطبخ والتوصيل' : 'Kitchen & Dispatch Sync'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <span className="flex h-1.5 w-1.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-[9px] uppercase tracking-widest font-black text-emerald-500 leading-none mt-0.5">{isAr ? 'تحديث حي' : 'Live Async'}</span>
                </div>
            </div>

            {/* Pipeline Body */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar p-3 lg:p-4 bg-app/30">
                <div className="flex gap-3 lg:gap-4 h-full min-w-max">
                    {COLUMNS.map(col => {
                        const colOrders = orders.filter(o => o.status === col.id);
                        return (
                            <div key={col.id} className="w-[240px] lg:w-[260px] flex flex-col h-full bg-elevated/40 rounded-[1.25rem] border border-border/20 overflow-hidden">
                                {/* Column Header */}
                                <div className="shrink-0 flex items-center justify-between p-3 border-b border-border/20 bg-card/50">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-6 h-6 rounded-lg ${col.bg} flex items-center justify-center`}>
                                            <col.icon size={12} className={col.color} />
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-main">{isAr ? col.labelAr : col.label}</span>
                                    </div>
                                    <span className="bg-card shadow-sm text-main font-bold text-[10px] px-2 py-0.5 rounded-full border border-border/40 min-w-[24px] text-center">
                                        {colOrders.length}
                                    </span>
                                </div>

                                {/* Column Body */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                                    {colOrders.length === 0 ? (
                                        <div className="h-full min-h-[100px] flex items-center justify-center border-2 border-dashed border-border/20 rounded-xl m-2 opacity-50">
                                            <span className="text-[9px] text-muted uppercase tracking-widest font-black">{isAr ? 'فارغ' : 'Empty'}</span>
                                        </div>
                                    ) : (
                                        colOrders.map(order => (
                                            <div key={order.id} className="bg-card border border-border/30 p-3 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group">
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <span className="text-[11px] font-black text-main">#{order.orderNumber || order.id.slice(-6)}</span>
                                                    <span className="flex items-center gap-1 text-[9px] font-bold text-muted bg-elevated/80 px-1.5 py-0.5 rounded border border-border/40">
                                                        <Clock size={10} className={order.status === OrderStatus.PREPARING && orderAgeMinutes(order.createdAt) > 10 ? 'text-amber-500' : ''} />
                                                        {orderAgeMinutes(order.createdAt)}{isAr ? 'د' : 'm'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-end mt-3">
                                                    <span className="text-[9px] uppercase font-bold text-muted bg-elevated/50 px-1.5 py-0.5 rounded-md">
                                                        {order.items.reduce((sum, item) => sum + (item.quantity || 1), 0)} {isAr ? 'أصناف' : 'Items'}
                                                    </span>
                                                    <span className="text-[11px] font-black text-emerald-500">{Number(order.total || 0).toFixed(2)} {currency}</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default LiveKanbanBoard;
