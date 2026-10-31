import React from 'react';
import { CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { apiRequest } from '../services/api/core';
import { CustomerDisplayOrder } from '../src/services/customerDisplayPolicy';

const CustomerDisplay: React.FC = () => {
    const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
    const branchId = params.get('branchId') || '';
    const key = params.get('key') || '';
    const [orders, setOrders] = React.useState<CustomerDisplayOrder[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);

    const load = React.useCallback(async () => {
        if (!branchId) {
            setError('BRANCH_ID_REQUIRED');
            setLoading(false);
            return;
        }
        try {
            const query = new URLSearchParams({ branchId });
            if (key) query.set('key', key);
            const response = await apiRequest(`/public-screens/customer-display?${query.toString()}`) as { ok?: boolean; orders?: CustomerDisplayOrder[] };
            setOrders(Array.isArray(response?.orders) ? response.orders : []);
            setLastRefresh(new Date());
            setError('');
        } catch (loadError: any) {
            setError(String(loadError?.code || loadError?.message || 'LOAD_FAILED'));
        } finally {
            setLoading(false);
        }
    }, [branchId, key]);

    React.useEffect(() => {
        void load();
        const timer = window.setInterval(() => { void load(); }, 5000);
        return () => window.clearInterval(timer);
    }, [load]);

    return (
        <main className="min-h-screen bg-slate-950 text-white p-6 md:p-10" dir="rtl">
            <header className="max-w-6xl mx-auto flex items-center justify-between gap-4 mb-10">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-emerald-400 font-black">RestoFlow</p>
                    <h1 className="text-3xl md:text-5xl font-black mt-2">الطلبات الجاهزة</h1>
                </div>
                <div className="text-left text-slate-400 text-xs font-bold">
                    <RefreshCw size={18} className="inline-block ms-2" />
                    {lastRefresh ? lastRefresh.toLocaleTimeString('ar-EG') : '—'}
                </div>
            </header>

            {error ? (
                <section className="max-w-xl mx-auto rounded-3xl border border-rose-400/30 bg-rose-400/10 p-8 text-center">
                    <p className="font-black">تعذر تحميل شاشة الاستلام</p>
                    <p className="text-sm text-slate-400 mt-2">تأكد من branchId ومفتاح الشاشة ثم أعد المحاولة.</p>
                </section>
            ) : loading ? (
                <p className="text-center text-slate-400 font-bold">جاري تحميل الطلبات…</p>
            ) : orders.length === 0 ? (
                <section className="max-w-xl mx-auto rounded-3xl border border-slate-800 bg-slate-900 p-10 text-center">
                    <Clock size={44} className="mx-auto text-slate-500" />
                    <p className="font-black mt-4 text-xl">لا توجد طلبات جاهزة الآن</p>
                </section>
            ) : (
                <section className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5" aria-live="polite">
                    {orders.map((order, index) => (
                        <article key={`${order.orderNumber || 'unknown'}-${order.updatedAt || index}`} className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-center shadow-2xl">
                            <CheckCircle2 size={30} className="mx-auto text-emerald-400" />
                            <p className="text-xs text-slate-400 font-black mt-4">رقم الطلب</p>
                            <p className="text-5xl md:text-6xl font-black tabular-nums mt-1" dir="ltr">{order.orderNumber ?? '—'}</p>
                            <p className="text-sm text-emerald-300 font-black mt-4">{order.status === 'DELIVERED' ? 'تم التسليم' : 'جاهز للاستلام'}</p>
                        </article>
                    ))}
                </section>
            )}
        </main>
    );
};

export default CustomerDisplay;
