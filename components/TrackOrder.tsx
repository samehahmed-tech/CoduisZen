import React from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ChefHat, Clock, MapPin, Package, Phone, Truck, XCircle } from 'lucide-react';
import { apiRequest } from '../services/api/core';

type TrackedOrder = {
    id: string;
    orderNumber?: number | null;
    status: string;
    type: string;
    total: number;
    createdAt?: string;
    deliveredAt?: string | null;
    branchName?: string | null;
    branchPhone?: string | null;
    items: Array<{ name: string; quantity: number }>;
};

const STEPS = ['PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const stepIndex = (status: string) => {
    const s = String(status || '').toUpperCase();
    if (s === 'COMPLETED') return 4;
    const i = STEPS.indexOf(s);
    return i === -1 ? 0 : i;
};

const TrackOrder: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [order, setOrder] = React.useState<TrackedOrder | null>(null);
    const [error, setError] = React.useState('');
    const [loading, setLoading] = React.useState(true);

    const load = React.useCallback(async () => {
        if (!id) return;
        try {
            const res: any = await apiRequest(`/public-screens/track/${encodeURIComponent(id)}`);
            if (res?.ok && res?.order) {
                setOrder(res.order);
                setError('');
            } else {
                setError('NOT_FOUND');
            }
        } catch {
            setError('LOAD_FAILED');
        } finally {
            setLoading(false);
        }
    }, [id]);

    React.useEffect(() => {
        void load();
        const timer = window.setInterval(() => { void load(); }, 30000);
        return () => window.clearInterval(timer);
    }, [load]);

    const status = String(order?.status || '').toUpperCase();
    const cancelled = status === 'CANCELLED';
    const idx = stepIndex(status);
    const icons = [Clock, ChefHat, Package, Truck, CheckCircle2];

    return (
        <main className="min-h-screen bg-app text-main flex items-center justify-center p-4" dir="rtl">
            <div className="w-full max-w-md card-primary rounded-[2rem] p-6 sm:p-8 shadow-2xl">
                {loading ? (
                    <p className="text-center font-black text-muted animate-pulse py-10">جاري تحميل طلبك…</p>
                ) : error || !order ? (
                    <div className="text-center py-10">
                        <XCircle size={48} className="mx-auto text-rose-500 mb-3" />
                        <p className="font-black">تعذر العثور على الطلب</p>
                        <p className="text-xs text-muted font-bold mt-1">تأكد من الرابط المُرسل إليك</p>
                    </div>
                ) : (
                    <>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted text-center">
                            {order.branchName || 'طلبك'}
                        </p>
                        <h1 className="text-3xl font-black text-center tabular-nums mt-1" dir="ltr">
                            #{order.orderNumber ?? String(order.id).slice(-6)}
                        </h1>

                        {cancelled ? (
                            <div className="mt-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 p-4 text-center font-black text-rose-500">
                                تم إلغاء الطلب — تواصل مع الفرع للتفاصيل
                            </div>
                        ) : (
                            <div className="mt-6 space-y-0">
                                {STEPS.map((s, i) => {
                                    const done = i < idx;
                                    const current = i === idx;
                                    const Icon = icons[i];
                                    const labels = ['تم الاستلام', 'قيد التحضير', 'جاهز', 'في الطريق', 'تم التوصيل'];
                                    return (
                                        <div key={s} className="flex gap-3">
                                            <div className="flex flex-col items-center">
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${done || current ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border text-muted'}`}>
                                                    <Icon size={16} />
                                                </div>
                                                {i < STEPS.length - 1 && (
                                                    <div className={`w-0.5 h-6 ${i < idx ? 'bg-emerald-500' : 'bg-border'}`} />
                                                )}
                                            </div>
                                            <p className={`pt-2 text-sm font-black ${done || current ? 'text-main' : 'text-muted'}`}>
                                                {labels[i]}
                                                {current && <span className="ms-2 text-[10px] text-emerald-500 animate-pulse">• الآن</span>}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="mt-6 rounded-2xl bg-elevated/60 border border-border/50 p-4 space-y-1.5">
                            {order.items.map((item, i) => (
                                <div key={i} className="flex justify-between text-xs font-bold">
                                    <span className="text-main">{item.name}</span>
                                    <span className="text-muted tabular-nums">×{item.quantity}</span>
                                </div>
                            ))}
                            <div className="flex justify-between pt-2 border-t border-border/50 text-sm font-black">
                                <span>الإجمالي</span>
                                <span className="tabular-nums">{Number(order.total || 0).toFixed(2)}</span>
                            </div>
                        </div>

                        {(order.branchPhone || order.branchName) && (
                            <div className="mt-4 flex items-center justify-center gap-4 text-xs font-bold text-muted">
                                {order.branchPhone && (
                                    <a href={`tel:${order.branchPhone}`} className="flex items-center gap-1.5 hover:text-main">
                                        <Phone size={13} /> <span dir="ltr">{order.branchPhone}</span>
                                    </a>
                                )}
                                {order.branchName && (
                                    <span className="flex items-center gap-1.5"><MapPin size={13} /> {order.branchName}</span>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>
    );
};

export default TrackOrder;
