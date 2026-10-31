import React from 'react';
import { BarChart3, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
import { apiRequest } from '../../../services/api/core';

type ConsolidatedRow = { branchId: string; branchName?: string | null; branchNameAr?: string | null; orders: number; revenue: number; cancelled: number };
type ConsolidatedResponse = {
    period: { from: string; to: string };
    scope: { global: boolean; branchIds: string[] };
    source: { entity: string; dateField: string; revenueField: string; cancelledExcluded: boolean };
    totals: { orders: number; revenue: number; cancelled: number };
    branches: ConsolidatedRow[];
};

export const ConsolidatedReport: React.FC<{ start: string; end: string; isArabic: boolean }> = ({ start, end, isArabic }) => {
    const [data, setData] = React.useState<ConsolidatedResponse | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(false);
    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams({ businessDateFrom: start, businessDateTo: end });
            const response = await apiRequest<ConsolidatedResponse>(`/analytics/consolidated?${query.toString()}`, { cache: 'no-store' });
            setData(response); setError(false);
        } catch { setError(true); }
        finally { setLoading(false); }
    }, [start, end]);

    React.useEffect(() => { void load(); }, [load]);
    if (error) return null;
    const maxRevenue = Math.max(...(data?.branches || []).map((row) => row.revenue), 1);
    const currency = (value: number) => value.toLocaleString(isArabic ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2 });

    return (
        <section className="rounded-xl border border-indigo-400/25 bg-gradient-to-br from-indigo-500/10 via-card to-card p-4 shadow-sm lg:p-5" aria-labelledby="consolidated-report-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-500"><BarChart3 size={15} /> {isArabic ? 'تقرير المركز الرئيسي' : 'Head-office report'}</div><h2 id="consolidated-report-title" className="mt-2 text-xl font-black text-main">{isArabic ? 'أداء الفروع الموحد' : 'Consolidated branch performance'}</h2><p className="mt-1 text-xs font-semibold text-muted">{start} — {end}</p></div>
                <button type="button" onClick={() => { void load(); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-black text-main transition hover:bg-elevated disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {isArabic ? 'تحديث' : 'Refresh'}</button>
            </div>
            {loading && !data ? <div className="mt-6 h-20 animate-pulse rounded-lg bg-elevated" /> : data && <>
                <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-border bg-card p-3"><p className="text-[11px] font-bold text-muted">{isArabic ? 'الإيرادات' : 'Revenue'}</p><p className="mt-1 text-xl font-black text-main">{currency(data.totals.revenue)}</p></div><div className="rounded-lg border border-border bg-card p-3"><p className="text-[11px] font-bold text-muted">{isArabic ? 'الطلبات' : 'Orders'}</p><p className="mt-1 text-xl font-black text-main">{currency(data.totals.orders)}</p></div><div className="rounded-lg border border-border bg-card p-3"><p className="text-[11px] font-bold text-muted">{isArabic ? 'الفروع' : 'Branches'}</p><p className="mt-1 text-xl font-black text-main">{data.scope.branchIds.length}</p></div></div>
                <div className="mt-5 space-y-3">{data.branches.map((row) => <div key={row.branchId} className="rounded-lg border border-border bg-card p-3"><div className="flex items-center justify-between gap-3 text-xs font-black"><span className="text-main">{isArabic ? (row.branchNameAr || row.branchName || row.branchId) : (row.branchName || row.branchNameAr || row.branchId)}</span><span className="text-indigo-500">{currency(row.revenue)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-elevated"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(2, (row.revenue / maxRevenue) * 100)}%` }} /></div><div className="mt-2 flex items-center justify-between text-[10px] font-bold text-muted"><span className="inline-flex items-center gap-1"><TrendingUp size={12} /> {row.orders} {isArabic ? 'طلب' : 'orders'}</span><span>{row.cancelled} {isArabic ? 'ملغي' : 'cancelled'}</span></div></div>)}</div>
                <p className="mt-4 inline-flex items-center gap-1 text-[10px] font-bold text-muted"><ShieldCheck size={12} /> {isArabic ? 'المصدر: الطلبات حسب تاريخ التشغيل، مع استبعاد الملغي.' : 'Source: orders by business date; cancelled orders excluded.'}</p>
            </>}
        </section>
    );
};
