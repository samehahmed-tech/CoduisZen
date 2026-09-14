import React from 'react';
import {
    Activity,
    AlertTriangle,
    BarChart3,
    Building2,
    CheckCircle2,
    CircleDollarSign,
    Clock3,
    PackageSearch,
    ShoppingBag,
    Store,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
// Recharts streams in AFTER the header/KPIs/table shell has painted — it
// must never block first content. Same charts, same containers, same data.
const BranchComparisonChart = React.lazy(() => import('./AdminDashboardCharts').then((m) => ({ default: m.BranchComparisonChart })));
const RiskDonutChart = React.lazy(() => import('./AdminDashboardCharts').then((m) => ({ default: m.RiskDonutChart })));

type BranchPerformanceRow = {
    branchId: string;
    branchName: string;
    location: string;
    revenue: number;
    ordersCount: number;
    avgTicket: number;
    cancelled: number;
    activeOrders: number;
    lowStock: number;
};

interface AdminDashboardProps {
    lang: 'en' | 'ar';
    rows: BranchPerformanceRow[];
    isLoading: boolean;
    error: string | null;
    periodLabel: string;
}

const moneyUnit = (lang: 'en' | 'ar') => (lang === 'ar' ? 'ج.م' : 'EGP');
const fmt = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
const money = (value: number, lang: 'en' | 'ar') => `${fmt(value)} ${moneyUnit(lang)}`;
const pct = (value: number) => `${Number(value || 0).toFixed(1)}%`;

const healthScore = (row: BranchPerformanceRow) => {
    const cancelRate = row.ordersCount > 0 ? (row.cancelled / row.ordersCount) * 100 : 0;
    const cancelPenalty = Math.min(35, cancelRate * 2);
    const stockPenalty = Math.min(30, row.lowStock * 5);
    const activePenalty = Math.min(20, Math.max(0, row.activeOrders - 12));
    return Math.max(0, Math.round(100 - cancelPenalty - stockPenalty - activePenalty));
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ lang, rows, isLoading, error, periodLabel }) => {
    const isAr = lang === 'ar';
    const sortedRows = React.useMemo(
        () => [...rows].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0)),
        [rows],
    );

    const totals = React.useMemo(() => {
        const revenue = rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
        const orders = rows.reduce((sum, row) => sum + Number(row.ordersCount || 0), 0);
        const active = rows.reduce((sum, row) => sum + Number(row.activeOrders || 0), 0);
        const cancelled = rows.reduce((sum, row) => sum + Number(row.cancelled || 0), 0);
        const lowStock = rows.reduce((sum, row) => sum + Number(row.lowStock || 0), 0);
        const avgTicket = orders > 0 ? revenue / orders : 0;
        const cancelRate = orders > 0 ? (cancelled / orders) * 100 : 0;
        const avgHealth = rows.length ? Math.round(rows.reduce((sum, row) => sum + healthScore(row), 0) / rows.length) : 0;
        return { revenue, orders, active, cancelled, lowStock, avgTicket, cancelRate, avgHealth };
    }, [rows]);

    const bestBranch = sortedRows[0];
    const riskRows = React.useMemo(
        () => [...rows].sort((a, b) => (b.lowStock + b.cancelled + b.activeOrders) - (a.lowStock + a.cancelled + a.activeOrders)).slice(0, 5),
        [rows],
    );
    const chartData = sortedRows.map((row) => ({
        name: row.branchName,
        revenue: Number(row.revenue || 0),
        orders: Number(row.ordersCount || 0),
        health: healthScore(row),
    }));

    const riskData = [
        { name: isAr ? 'إلغاءات' : 'Cancelled', value: totals.cancelled, color: '#f59e0b' },
        { name: isAr ? 'طلبات نشطة' : 'Active', value: totals.active, color: '#2563eb' },
        { name: isAr ? 'نقص مخزون' : 'Low stock', value: totals.lowStock, color: '#e11d48' },
    ].filter((item) => item.value > 0);

    const kpis = [
        { label: isAr ? 'إيراد كل الفروع' : 'Group revenue', value: money(totals.revenue, lang), sub: periodLabel, icon: CircleDollarSign, tone: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        { label: isAr ? 'إجمالي الطلبات' : 'Total orders', value: fmt(totals.orders), sub: isAr ? `${fmt(totals.active)} طلب نشط` : `${fmt(totals.active)} active`, icon: ShoppingBag, tone: 'text-blue-500', bg: 'bg-blue-500/10' },
        { label: isAr ? 'متوسط الفاتورة' : 'Avg ticket', value: money(totals.avgTicket, lang), sub: bestBranch ? `${isAr ? 'الأعلى' : 'Top'}: ${bestBranch.branchName}` : '-', icon: Activity, tone: 'text-violet-500', bg: 'bg-violet-500/10' },
        { label: isAr ? 'صحة التشغيل' : 'Ops health', value: pct(totals.avgHealth), sub: totals.lowStock ? (isAr ? `${fmt(totals.lowStock)} تنبيه مخزون` : `${fmt(totals.lowStock)} stock alerts`) : (isAr ? 'لا يوجد نقص واضح' : 'No stock risk'), icon: CheckCircle2, tone: totals.avgHealth >= 80 ? 'text-emerald-500' : 'text-amber-500', bg: totals.avgHealth >= 80 ? 'bg-emerald-500/10' : 'bg-amber-500/10' },
    ];

    return (
        <div className="min-h-screen bg-app p-4 pb-20 md:p-6 lg:p-8" dir={isAr ? 'rtl' : 'ltr'}>
            <div className="mx-auto max-w-[1600px] space-y-5">
                <header className="flex flex-col gap-4 border-b border-border/50 pb-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-primary">
                            <Store size={15} /> {isAr ? 'مركز الإدارة' : 'Management center'}
                        </div>
                        <h2 className="text-2xl font-black tracking-tight text-main md:text-4xl">
                            {isAr ? 'نظرة عامة على كل الفروع' : 'All Branches Overview'}
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-muted">
                            {isAr
                                ? 'مبيعات، طلبات، صحة تشغيل، ومخاطر مخزون لكل الفروع في شاشة واحدة قابلة للمقارنة.'
                                : 'Sales, orders, operational health, and stock risks across every branch in one comparison view.'}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs md:flex">
                        <Badge label={isAr ? 'الفترة' : 'Period'} value={periodLabel} />
                        <Badge label={isAr ? 'الفروع' : 'Branches'} value={fmt(rows.length)} />
                        <Badge label={isAr ? 'معدل الإلغاء' : 'Cancel rate'} value={pct(totals.cancelRate)} danger={totals.cancelRate > 8} />
                    </div>
                </header>

                {error && (
                    <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-500">
                        <AlertTriangle size={16} />
                        {error}
                    </div>
                )}

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {kpis.map((item) => {
                        const Icon = item.icon;
                        return (
                            <div key={item.label} className="rounded-lg border border-border/60 bg-card p-4 transition hover:border-primary/30">
                                <div className="flex items-start justify-between gap-3">
                                    <div className={`rounded-lg p-3 ${item.bg}`}>
                                        <Icon size={20} className={item.tone} />
                                    </div>
                                    {isLoading && <Clock3 size={15} className="animate-spin text-muted" />}
                                </div>
                                <div className="mt-4 text-[11px] font-black uppercase tracking-widest text-muted">{item.label}</div>
                                <div className="mt-1 text-2xl font-black text-main">{item.value}</div>
                                <div className="mt-1 truncate text-xs font-bold text-muted">{item.sub}</div>
                            </div>
                        );
                    })}
                </section>

                <section className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
                    <div className="rounded-lg border border-border/60 bg-card p-4 md:p-5">
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-black text-main">{isAr ? 'مقارنة الإيراد والطلبات' : 'Revenue and orders comparison'}</h3>
                                <p className="mt-1 text-xs font-bold text-muted">{isAr ? 'مرتبة من أعلى فرع في الإيراد للأقل.' : 'Sorted by branch revenue.'}</p>
                            </div>
                            <BarChart3 size={20} className="text-primary" />
                        </div>
                        <div className="h-[360px] w-full">
                            <React.Suspense fallback={<div className="h-full w-full animate-pulse rounded-lg bg-elevated/30" />}>
                                <BranchComparisonChart data={chartData} lang={lang} isAr={isAr} rowsCount={rows.length} />
                            </React.Suspense>
                        </div>
                    </div>

                    <div className="grid gap-5">
                        <div className="rounded-lg border border-border/60 bg-card p-4 md:p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-base font-black text-main">{isAr ? 'مخاطر التشغيل' : 'Operational risk'}</h3>
                                <AlertTriangle size={19} className={totals.lowStock || totals.cancelRate > 8 ? 'text-amber-500' : 'text-emerald-500'} />
                            </div>
                            <div className="h-[210px]">
                                {riskData.length ? (
                                    <React.Suspense fallback={<div className="h-full w-full animate-pulse rounded-lg bg-elevated/30" />}>
                                        <RiskDonutChart data={riskData} />
                                    </React.Suspense>
                                ) : (
                                    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm font-black text-muted">
                                        {isAr ? 'لا توجد مخاطر بارزة' : 'No visible risks'}
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center text-xs font-black">
                                {riskData.map((item) => (
                                    <div key={item.name} className="rounded-md bg-elevated/50 p-2">
                                        <div style={{ color: item.color }}>{fmt(item.value)}</div>
                                        <div className="mt-1 truncate text-[10px] text-muted">{item.name}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border border-border/60 bg-card p-4 md:p-5">
                            <h3 className="mb-3 text-base font-black text-main">{isAr ? 'فروع تحتاج متابعة' : 'Branches to watch'}</h3>
                            <div className="space-y-2">
                                {riskRows.length ? riskRows.map((row) => (
                                    <div key={row.branchId} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-app p-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-black text-main">{row.branchName}</div>
                                            <div className="mt-1 text-[11px] font-bold text-muted">
                                                {isAr ? 'صحة' : 'Health'} {healthScore(row)}% · {isAr ? 'نشط' : 'Active'} {fmt(row.activeOrders)}
                                            </div>
                                        </div>
                                        <div className="text-end text-[11px] font-black text-amber-500">
                                            {fmt(row.cancelled + row.lowStock)} {isAr ? 'تنبيه' : 'alerts'}
                                        </div>
                                    </div>
                                )) : <Empty isAr={isAr} />}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-lg border border-border/60 bg-card">
                    <div className="flex flex-col gap-2 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 className="text-base font-black text-main">{isAr ? 'جدول أداء الفروع' : 'Branch performance table'}</h3>
                            <p className="mt-1 text-xs font-bold text-muted">{isAr ? 'إيراد، طلبات، متوسط، صحة تشغيل، ومخزون.' : 'Revenue, orders, ticket, health, and stock.'}</p>
                        </div>
                        <div className="text-[11px] font-black text-muted">{isAr ? 'مرتبة بالإيراد' : 'Sorted by revenue'}</div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-sm">
                            <thead className="bg-elevated/50 text-[10px] font-black uppercase tracking-widest text-muted">
                                <tr>
                                    <th className="p-3 text-start">{isAr ? 'الفرع' : 'Branch'}</th>
                                    <th className="p-3 text-start">{isAr ? 'الإيراد' : 'Revenue'}</th>
                                    <th className="p-3 text-start">{isAr ? 'مساهمة' : 'Share'}</th>
                                    <th className="p-3 text-start">{isAr ? 'طلبات' : 'Orders'}</th>
                                    <th className="p-3 text-start">{isAr ? 'متوسط' : 'Avg ticket'}</th>
                                    <th className="p-3 text-start">{isAr ? 'نشط' : 'Active'}</th>
                                    <th className="p-3 text-start">{isAr ? 'إلغاء' : 'Cancel'}</th>
                                    <th className="p-3 text-start">{isAr ? 'مخزون' : 'Stock'}</th>
                                    <th className="p-3 text-start">{isAr ? 'صحة' : 'Health'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRows.map((row) => {
                                    const share = totals.revenue > 0 ? (row.revenue / totals.revenue) * 100 : 0;
                                    const cancelRate = row.ordersCount > 0 ? (row.cancelled / row.ordersCount) * 100 : 0;
                                    const score = healthScore(row);
                                    return (
                                        <tr key={row.branchId} className="border-t border-border/40 transition hover:bg-elevated/40">
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    <Building2 size={16} className="text-primary" />
                                                    <div>
                                                        <div className="font-black text-main">{row.branchName}</div>
                                                        <div className="text-[11px] font-bold text-muted">{row.location || '-'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-3 font-black text-emerald-500">{money(row.revenue, lang)}</td>
                                            <td className="p-3">
                                                <div className="w-28 rounded-full bg-elevated">
                                                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, share)}%` }} />
                                                </div>
                                                <div className="mt-1 text-[10px] font-black text-muted">{pct(share)}</div>
                                            </td>
                                            <td className="p-3 font-black text-main">{fmt(row.ordersCount)}</td>
                                            <td className="p-3 font-bold text-muted">{money(row.avgTicket, lang)}</td>
                                            <td className="p-3 font-black text-blue-500">{fmt(row.activeOrders)}</td>
                                            <td className={`p-3 font-black ${cancelRate > 8 ? 'text-rose-500' : 'text-muted'}`}>{fmt(row.cancelled)} · {pct(cancelRate)}</td>
                                            <td className={`p-3 font-black ${row.lowStock ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                {row.lowStock ? `${fmt(row.lowStock)} ${isAr ? 'ناقص' : 'low'}` : (isAr ? 'سليم' : 'ok')}
                                            </td>
                                            <td className="p-3">
                                                <span className={`rounded-md px-2 py-1 text-[11px] font-black ${score >= 80 ? 'bg-emerald-500/10 text-emerald-500' : score >= 60 ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                                    {score}%
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {!isLoading && rows.length === 0 && <Empty isAr={isAr} />}
                    </div>
                </section>

                <section className="grid gap-3 md:grid-cols-3">
                    <Insight
                        icon={TrendingUp}
                        title={isAr ? 'أفضل فرع' : 'Best branch'}
                        text={bestBranch ? `${bestBranch.branchName} · ${money(bestBranch.revenue, lang)}` : (isAr ? 'لا توجد بيانات' : 'No data')}
                    />
                    <Insight
                        icon={totals.cancelRate > 8 ? TrendingDown : CheckCircle2}
                        title={isAr ? 'الإلغاء' : 'Cancellation'}
                        text={totals.cancelRate > 8 ? (isAr ? 'معدل الإلغاء يحتاج مراجعة.' : 'Cancellation rate needs review.') : (isAr ? 'معدل الإلغاء تحت السيطرة.' : 'Cancellation rate is controlled.')}
                    />
                    <Insight
                        icon={PackageSearch}
                        title={isAr ? 'المخزون' : 'Inventory'}
                        text={totals.lowStock ? (isAr ? `${fmt(totals.lowStock)} عنصر يحتاج توريد.` : `${fmt(totals.lowStock)} items need restock.`) : (isAr ? 'لا يوجد نقص واضح.' : 'No visible shortage.')}
                    />
                </section>
            </div>
        </div>
    );
};

const Badge = ({ label, value, danger }: { label: string; value: string; danger?: boolean }) => (
    <div className={`rounded-lg border px-3 py-2 ${danger ? 'border-rose-500/30 bg-rose-500/10 text-rose-500' : 'border-border/60 bg-card text-main'}`}>
        <div className="text-[9px] font-black uppercase tracking-widest text-muted">{label}</div>
        <div className="mt-1 text-xs font-black">{value}</div>
    </div>
);

const Insight = ({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) => (
    <div className="rounded-lg border border-border/60 bg-card p-4">
        <Icon size={18} className="text-primary" />
        <div className="mt-3 text-sm font-black text-main">{title}</div>
        <div className="mt-1 text-xs font-bold text-muted">{text}</div>
    </div>
);

const Empty = ({ isAr }: { isAr: boolean }) => (
    <div className="p-10 text-center text-sm font-black text-muted">
        {isAr ? 'لا توجد بيانات فروع في الفترة الحالية.' : 'No branch data for this period.'}
    </div>
);

export default AdminDashboard;
