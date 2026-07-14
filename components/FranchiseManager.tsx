import React, { useEffect, useMemo, useState } from 'react';
import {
    Building2, Activity, AlertTriangle, Eye, TrendingUp, Plus, X, Save,
    MapPin, Phone, Mail, Globe, ShieldCheck, RefreshCw, BarChart3,
    Settings, Layers, Clock, DollarSign, Package, Users, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { translations } from '../services/translations';
import { analyticsApi } from '../services/api/analytics';
import { branchesApi } from '../services/api/branches';
import { useConfirm } from './common/ConfirmProvider';
import { useToast } from './common/ToastProvider';

type BranchPerf = {
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

type Branch = {
    id: string;
    name: string;
    nameAr?: string;
    location?: string;
    address?: string;
    phone?: string;
    email?: string;
    isActive?: boolean;
    timezone?: string;
    currency?: string;
    taxRate?: number;
    serviceCharge?: number;
};

type FranchiseTab = 'overview' | 'branches' | 'analytics';

const TABS: { id: FranchiseTab; label: string; labelAr: string; icon: any }[] = [
    { id: 'overview', label: 'Performance', labelAr: 'الأداء', icon: BarChart3 },
    { id: 'branches', label: 'Branch Management', labelAr: 'إدارة الفروع', icon: Building2 },
    { id: 'analytics', label: 'Comparison', labelAr: 'المقارنة', icon: TrendingUp },
];

const FranchiseManager: React.FC = () => {
    const { settings, hasPermission, setActiveBranch } = useAuthStore();
    const lang = settings.language || 'en';
    const isAr = lang === 'ar';
    const tr = (en: string, ar: string) => isAr ? ar : en;
    const t = translations[lang];
    const { confirm } = useConfirm();
    const { success, error: showError } = useToast();

    const [activeTab, setActiveTab] = useState<FranchiseTab>('overview');
    const [perfData, setPerfData] = useState<BranchPerf[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showBranchModal, setShowBranchModal] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [branchForm, setBranchForm] = useState({ name: '', nameAr: '', location: '', address: '', phone: '', email: '', timezone: 'Africa/Cairo', currency: 'EGP', taxRate: '14', serviceCharge: '0' });

    const loadPerf = async () => {
        setIsLoading(true);
        try {
            setPerfData(await analyticsApi.getBranchPerformance());
        } catch (error: any) {
            showError(error.message || tr('Failed to load branch performance', 'تعذر تحميل أداء الفروع'));
        }
        finally { setIsLoading(false); }
    };

    const loadBranches = async () => {
        try {
            setBranches(await branchesApi.getAll());
        } catch (error: any) {
            showError(error.message || tr('Failed to load branches', 'تعذر تحميل الفروع'));
        }
    };

    useEffect(() => { loadPerf(); loadBranches(); }, []);

    const benchmark = useMemo(() => {
        const avgRevenue = perfData.length > 0 ? perfData.reduce((s, b) => s + b.revenue, 0) / perfData.length : 0;
        return perfData.map(b => ({
            ...b,
            revenueDeltaPct: avgRevenue > 0 ? ((b.revenue - avgRevenue) / avgRevenue) * 100 : 0,
            anomaly: b.cancelled > Math.max(3, b.ordersCount * 0.12) || b.lowStock > 10,
            healthScore: Math.min(100, Math.max(0, 100 - (b.cancelled * 5) - (b.lowStock * 2) + (b.ordersCount > 0 ? 20 : 0))),
        }));
    }, [perfData]);

    const totals = useMemo(() => ({
        revenue: perfData.reduce((s, b) => s + b.revenue, 0),
        orders: perfData.reduce((s, b) => s + b.ordersCount, 0),
        avgTicket: perfData.length > 0 ? perfData.reduce((s, b) => s + b.avgTicket, 0) / perfData.length : 0,
        anomalies: benchmark.filter(b => b.anomaly).length,
    }), [perfData, benchmark]);

    const openAddBranch = () => {
        setEditingBranch(null);
        setBranchForm({ name: '', nameAr: '', location: '', address: '', phone: '', email: '', timezone: 'Africa/Cairo', currency: 'EGP', taxRate: '14', serviceCharge: '0' });
        setShowBranchModal(true);
    };

    const openEditBranch = (b: Branch) => {
        setEditingBranch(b);
        setBranchForm({ name: b.name || '', nameAr: b.nameAr || '', location: b.location || '', address: b.address || '', phone: b.phone || '', email: b.email || '', timezone: b.timezone || 'Africa/Cairo', currency: b.currency || 'EGP', taxRate: String(b.taxRate || 14), serviceCharge: String(b.serviceCharge || 0) });
        setShowBranchModal(true);
    };

    const handleSaveBranch = async () => {
        try {
            const payload = { ...branchForm, taxRate: Number(branchForm.taxRate), serviceCharge: Number(branchForm.serviceCharge) };
            if (editingBranch) { await branchesApi.update(editingBranch.id, payload); }
            else { await branchesApi.create(payload); }
            await loadBranches();
            setShowBranchModal(false);
            success(editingBranch ? tr('Branch updated successfully', 'تم تحديث الفرع') : tr('Branch created successfully', 'تم إنشاء الفرع'));
        } catch (e: any) { showError(e.message); }
    };

    const handleDeleteBranch = async (id: string) => {
        const ok = await confirm({
            title: tr('Archive Branch', 'أرشفة الفرع'),
            message: tr('Archive this branch? Historical orders, shifts, printers, and stock stay linked.', 'هل تريد أرشفة هذا الفرع؟ الطلبات والشيفتات والطابعات والمخزون ستظل محفوظة ومرتبطة.'),
            confirmText: tr('Archive', 'أرشفة'),
            variant: 'warning'
        });
        if (!ok) return;
        try { await branchesApi.delete(id); await loadBranches(); success(tr('Branch archived successfully', 'تمت أرشفة الفرع')); } catch (e: any) { showError(e.message); }
    };

    const getHealthColor = (score: number) => {
        if (score >= 80) return { text: 'text-emerald-500', bg: 'bg-emerald-500/10', label: tr('Excellent', 'ممتاز') };
        if (score >= 60) return { text: 'text-blue-500', bg: 'bg-blue-500/10', label: tr('Good', 'جيد') };
        if (score >= 40) return { text: 'text-amber-500', bg: 'bg-amber-500/10', label: tr('Fair', 'متوسط') };
        return { text: 'text-rose-500', bg: 'bg-rose-500/10', label: tr('Critical', 'حرج') };
    };

    return (
        <div className="p-4 md:p-8 lg:p-10 bg-app min-h-screen pb-24">
            {/* Header */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-14 h-14 rounded-[1.5rem] bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-2xl shadow-indigo-600/30">
                            <Building2 size={28} />
                        </div>
                        <h2 className="text-3xl font-black text-main uppercase tracking-tighter">{tr('Multi-Branch Control', 'إدارة الفروع')}</h2>
                    </div>
                    <p className="text-muted font-bold text-xs uppercase tracking-widest opacity-60">{tr('Performance · Management · Comparative Analytics', 'الأداء · الإدارة · التحليلات المقارنة')}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={openAddBranch} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-2.5 rounded-xl shadow-lg font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:scale-105 transition-transform"><Plus size={14} /> {tr('Add Branch', 'إضافة فرع')}</button>
                    <button onClick={() => { loadPerf(); loadBranches(); }} className="bg-slate-800 dark:bg-slate-700 text-white px-4 py-2.5 rounded-xl shadow-lg font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:scale-105 transition-transform"><RefreshCw size={14} /> {tr('Refresh', 'تحديث')}</button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: tr('Total Revenue', 'إجمالي الإيراد'), value: `${totals.revenue.toLocaleString()} LE`, icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { label: tr('Total Orders', 'إجمالي الطلبات'), value: totals.orders, icon: Package, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { label: tr('Avg Ticket', 'متوسط الفاتورة'), value: `${totals.avgTicket.toFixed(0)} LE`, icon: TrendingUp, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                    { label: tr('Anomalies', 'تنبيهات'), value: totals.anomalies, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
                ].map((stat, i) => (
                    <div key={i} className="card-primary border border-border p-6 rounded-[2rem] shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center`}><stat.icon size={18} /></div>
                        </div>
                        <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">{stat.label}</p>
                        <h4 className="text-2xl font-black text-main">{stat.value}</h4>
                    </div>
                ))}
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 mb-8 bg-elevated/40 p-1.5 rounded-2xl border border-border w-fit">
                {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/20' : 'text-muted hover:text-main hover:bg-elevated/60'}`}>
                        <tab.icon size={14} /> {isAr ? tab.labelAr : tab.label}
                    </button>
                ))}
            </div>

            {/* ??????????? OVERVIEW TAB ??????????? */}
            {activeTab === 'overview' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                    {isLoading && <div className="card-primary border border-border rounded-[2rem] p-6 text-sm text-muted">{tr('Loading analytics...', 'جاري تحميل التحليلات...')}</div>}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {benchmark.map((branch) => {
                            const health = getHealthColor(branch.healthScore);
                            return (
                                <div key={branch.branchId} className="card-primary border border-border rounded-[2.5rem] p-6 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-start justify-between gap-4 mb-6">
                                        <div>
                                            <h3 className="text-lg font-black text-main">{branch.branchName}</h3>
                                            <p className="text-[10px] font-bold text-muted flex items-center gap-1 mt-0.5"><MapPin size={10} /> {branch.location || branch.branchId}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${health.bg} ${health.text}`}>{health.label}</span>
                                             {branch.anomaly && <span className="px-2 py-1 rounded-lg text-[9px] font-black uppercase bg-rose-500/10 text-rose-500">{tr('ANOMALY', 'تنبيه')}</span>}
                                        </div>
                                    </div>

                                    {/* Health Score Bar */}
                                    <div className="mb-5">
                                        <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-muted mb-1">
                                             <span>{tr('Health Score', 'مؤشر الصحة')}</span>
                                            <span className={health.text}>{branch.healthScore}%</span>
                                        </div>
                                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${branch.healthScore >= 80 ? 'bg-emerald-500' : branch.healthScore >= 60 ? 'bg-blue-500' : branch.healthScore >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${branch.healthScore}%` }} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                             <p className="text-[8px] font-black uppercase tracking-widest text-muted mb-1">{tr('Revenue', 'الإيراد')}</p>
                                            <p className="text-lg font-black text-main">{branch.revenue.toLocaleString()} <span className="text-[9px] text-muted">LE</span></p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                             <p className="text-[8px] font-black uppercase tracking-widest text-muted mb-1">{tr('Orders', 'الطلبات')}</p>
                                            <p className="text-lg font-black text-main flex items-center gap-1"><Activity size={14} /> {branch.ordersCount}</p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                             <p className="text-[8px] font-black uppercase tracking-widest text-muted mb-1">{tr('Low Stock', 'نقص مخزون')}</p>
                                            <p className="text-lg font-black text-amber-500 flex items-center gap-1"><AlertTriangle size={14} /> {branch.lowStock}</p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                             <p className="text-[8px] font-black uppercase tracking-widest text-muted mb-1">{tr('Benchmark', 'المقارنة')}</p>
                                            <p className={`text-sm font-black flex items-center gap-1 ${branch.revenueDeltaPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                <TrendingUp size={14} /> {branch.revenueDeltaPct >= 0 ? '+' : ''}{branch.revenueDeltaPct.toFixed(1)}%
                                            </p>
                                        </div>
                                    </div>

                                    <button onClick={() => setActiveBranch(branch.branchId)} disabled={!hasPermission('NAV_REPORTS' as any)}
                                        className="w-full mt-5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 hover:shadow-lg transition-shadow">
                                         <Eye size={14} /> {tr('Drill Down', 'عرض التفاصيل')}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                     {!isLoading && perfData.length === 0 && <p className="text-center text-muted py-16">{tr('No branch performance data available.', 'لا توجد بيانات أداء للفروع.')}</p>}
                </div>
            )}

            {/* ??????????? BRANCHES TAB ??????????? */}
            {activeTab === 'branches' && (
                <div className="card-primary border border-border rounded-[2.5rem] shadow-sm overflow-hidden animate-in slide-in-from-bottom-5 duration-150">
                    <div className="p-6 border-b border-border bg-elevated/30 flex items-center justify-between">
                        <h3 className="text-lg font-black text-main uppercase tracking-tight">{tr('All Branches', 'كل الفروع')} ({branches.length})</h3>
                        <button onClick={openAddBranch} className="px-4 py-2 rounded-xl bg-indigo-500/10 text-indigo-600 text-[10px] font-black uppercase hover:bg-indigo-500/20 transition-colors flex items-center gap-2"><Plus size={14} /> {tr('Add Branch', 'إضافة فرع')}</button>
                    </div>
                    <div className="responsive-table">
                        <table className="w-full text-left">
                            <thead className="bg-app/50 text-[9px] font-black uppercase text-muted tracking-[0.2em]">
                                <tr>
                                    <th className="px-6 py-4">{tr('Branch', 'الفرع')}</th>
                                    <th className="px-4 py-4">{tr('Location', 'الموقع')}</th>
                                    <th className="px-4 py-4">{tr('Contact', 'التواصل')}</th>
                                    <th className="px-4 py-4">{tr('Tax Rate', 'الضريبة')}</th>
                                    <th className="px-4 py-4">{tr('Status', 'الحالة')}</th>
                                    <th className="px-6 py-4 text-center">{tr('Actions', 'إجراءات')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {branches.map(b => (
                                    <tr key={b.id} className="hover:bg-elevated/20 transition-all">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 text-indigo-600 flex items-center justify-center font-black text-sm"><Building2 size={16} /></div>
                                                <div>
                                                    <p className="text-xs font-black text-main">{b.name}</p>
                                                    {b.nameAr && <p className="text-[9px] text-muted">{b.nameAr}</p>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-[10px] text-muted">{b.location || b.address || '—'}</td>
                                        <td className="px-4 py-4 text-[10px] text-muted">
                                            {b.phone && <span className="flex items-center gap-1"><Phone size={10} />{b.phone}</span>}
                                            {b.email && <span className="flex items-center gap-1 mt-0.5"><Mail size={10} />{b.email}</span>}
                                        </td>
                                        <td className="px-4 py-4 font-mono text-xs text-main">{b.taxRate || 14}%</td>
                                        <td className="px-4 py-4">
                                             <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black ${b.isActive !== false ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{b.isActive !== false ? tr('ACTIVE', 'نشط') : tr('INACTIVE', 'متوقف')}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => openEditBranch(b)} className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"><Settings size={14} /></button>
                                                <button onClick={() => handleDeleteBranch(b.id)} className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"><X size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                     {branches.length === 0 && <p className="text-center text-muted py-16 text-sm">{tr('No branches configured.', 'لا توجد فروع مسجلة.')}</p>}
                </div>
            )}

            {/* ??????????? COMPARISON TAB ??????????? */}
            {activeTab === 'analytics' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                    <div className="card-primary border border-border rounded-[2.5rem] shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-border bg-elevated/30">
                            <h3 className="text-lg font-black text-main uppercase tracking-tight">{tr('Branch Comparison Table', 'جدول مقارنة الفروع')}</h3>
                        </div>
                        <div className="responsive-table">
                            <table className="w-full text-left">
                                <thead className="bg-app/50 text-[9px] font-black uppercase text-muted tracking-[0.2em]">
                                    <tr>
                                        <th className="px-6 py-4">{tr('Branch', 'الفرع')}</th>
                                        <th className="px-4 py-4 text-right">{tr('Revenue', 'الإيراد')}</th>
                                        <th className="px-4 py-4 text-right">{tr('Orders', 'الطلبات')}</th>
                                        <th className="px-4 py-4 text-right">{tr('Avg Ticket', 'متوسط الفاتورة')}</th>
                                        <th className="px-4 py-4 text-right">{tr('Cancelled', 'ملغي')}</th>
                                        <th className="px-4 py-4 text-right">{tr('Low Stock', 'نقص مخزون')}</th>
                                        <th className="px-4 py-4 text-right">{tr('Health', 'الصحة')}</th>
                                        <th className="px-6 py-4 text-right">{tr('Benchmark', 'المقارنة')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {benchmark.sort((a, b) => b.revenue - a.revenue).map(b => {
                                        const health = getHealthColor(b.healthScore);
                                        return (
                                            <tr key={b.branchId} className="hover:bg-elevated/20 transition-all">
                                                <td className="px-6 py-4 text-xs font-black text-main">{b.branchName}</td>
                                                <td className="px-4 py-4 text-right font-mono text-xs font-bold text-main">{b.revenue.toLocaleString()}</td>
                                                <td className="px-4 py-4 text-right font-mono text-xs text-main">{b.ordersCount}</td>
                                                <td className="px-4 py-4 text-right font-mono text-xs text-main">{b.avgTicket.toFixed(0)}</td>
                                                <td className="px-4 py-4 text-right font-mono text-xs text-rose-500">{b.cancelled}</td>
                                                <td className="px-4 py-4 text-right font-mono text-xs text-amber-500">{b.lowStock}</td>
                                                <td className="px-4 py-4 text-right">
                                                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black ${health.bg} ${health.text}`}>{b.healthScore}%</span>
                                                </td>
                                                <td className={`px-6 py-4 text-right font-mono text-xs font-black ${b.revenueDeltaPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {b.revenueDeltaPct >= 0 ? '+' : ''}{b.revenueDeltaPct.toFixed(1)}%
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Revenue Bars (visual comparison) */}
                    <div className="card-primary border border-border rounded-[2.5rem] p-6 shadow-sm">
                        <h3 className="text-lg font-black text-main uppercase tracking-tight mb-6">{tr('Revenue Distribution', 'توزيع الإيرادات')}</h3>
                        <div className="space-y-4">
                            {benchmark.sort((a, b) => b.revenue - a.revenue).map(b => {
                                const maxRevenue = Math.max(...benchmark.map(x => x.revenue), 1);
                                return (
                                    <div key={b.branchId} className="flex items-center gap-4">
                                        <p className="text-[10px] font-black text-muted w-32 truncate">{b.branchName}</p>
                                        <div className="flex-1 h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full transition-all" style={{ width: `${(b.revenue / maxRevenue) * 100}%` }} />
                                        </div>
                                        <p className="text-xs font-black text-main font-mono w-24 text-right">{b.revenue.toLocaleString()}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ??????????? BRANCH MODAL ??????????? */}
            {showBranchModal && (
                <div className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4" onClick={() => setShowBranchModal(false)}>
                    <div className="bg-card border border-border rounded-[2rem] w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-border flex items-center justify-between">
                            <h3 className="text-lg font-black text-main">{editingBranch ? tr('Edit Branch', 'تعديل فرع') : tr('Add Branch', 'إضافة فرع')}</h3>
                            <button onClick={() => setShowBranchModal(false)} className="p-2 text-muted hover:text-main"><X size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                            {[
                                { key: 'name', label: tr('Branch Name', 'اسم الفرع'), icon: Building2 },
                                { key: 'nameAr', label: tr('Name (Arabic)', 'الاسم العربي'), icon: Globe },
                                { key: 'location', label: tr('Location / Area', 'المنطقة'), icon: MapPin },
                                { key: 'address', label: tr('Full Address', 'العنوان الكامل'), icon: MapPin },
                                { key: 'phone', label: tr('Phone', 'الهاتف'), icon: Phone },
                                { key: 'email', label: tr('Email', 'البريد الإلكتروني'), icon: Mail },
                                { key: 'taxRate', label: tr('Tax Rate (%)', 'نسبة الضريبة (%)'), icon: DollarSign },
                                { key: 'serviceCharge', label: tr('Service Charge (%)', 'نسبة الخدمة (%)'), icon: DollarSign },
                            ].map(f => (
                                <div key={f.key}>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{f.label}</label>
                                    <div className="relative">
                                        <f.icon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                                        <input type="text" value={(branchForm as any)[f.key]} onChange={e => setBranchForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                            className="w-full pl-10 pr-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-indigo-500 transition-colors text-main" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-6 border-t border-border flex gap-3">
                             <button onClick={() => setShowBranchModal(false)} className="flex-1 px-4 py-3 bg-app border border-border rounded-xl text-xs font-black text-muted uppercase tracking-widest">{tr('Cancel', 'إلغاء')}</button>
                             <button onClick={handleSaveBranch} className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"><Save size={14} /> {tr('Save', 'حفظ')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FranchiseManager;
