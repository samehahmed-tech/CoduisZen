import React, { useEffect, useMemo, useState, Suspense, lazy, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DateRangePicker } from 'react-date-range';
import { useToast } from './Toast';

import LiveClock from './common/LiveClock';
import SystemHealth from './common/SystemHealth';
import SensitiveData from './SensitiveData';
import PageSkeleton from './common/PageSkeleton';
import { AppPermission } from '../types';
import AnimatedNumber from './common/AnimatedNumber';
import {
  DollarSign, ShoppingBag, Users, TrendingUp, Sparkles, Package, Database,
  AlertCircle, AlertTriangle, Clock, Wallet, Building2,
  ArrowUpRight, ArrowDownRight, Zap, Target, UserCheck, Calendar, Filter, ChevronDown, CheckCircle2,
  Activity, Star, Flame, Trophy, Eye, Briefcase, RefreshCcw, BrainCircuit, HeartHandshake, Scissors
} from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { aiApi } from '../services/api/ai';
import { reportsApi } from '../services/api/reports';
import { hrApi } from '../services/api/hr';
import { socketService } from '../services/socketService';
import { useAutonomousEngine } from '../stores/useAutonomousEngine';
import { translations } from '../services/translations';
import { clearAllData } from '../utils/clearData';

const KitchenPerformanceWidget = lazy(() => import('./dashboard/KitchenDispatchWidgets').then(m => ({ default: m.KitchenPerformanceWidget })));
const DeliveryStatusWidget = lazy(() => import('./dashboard/KitchenDispatchWidgets').then(m => ({ default: m.DeliveryStatusWidget })));
const RevenueForecastWidget = lazy(() => import('./dashboard/RevenueForecastWidget'));
import { ChefHat, Truck, LayoutDashboard } from 'lucide-react';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9'];

type Scope = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type DashboardPayload = {
  totals: {
    revenue: number; netRevenue: number; expenses: number; pendingExpenses: number; netProfit: number;
    paidRevenue: number; discounts: number; orderCount: number;
    avgTicket: number; uniqueCustomers: number; itemsSold: number;
    cancelled: number; pending: number; delivered: number; cancelRate: number;
  };
  trendData: Array<{ name: string; revenue: number; prevRevenue?: number }>;
  paymentBreakdown: Array<{ name: string; value: number }>;
  orderTypeBreakdown: Array<{ name: string; value: number }>;
  categoryData: Array<{ name: string; value: number }>;
  topItems: Array<{ name: string; qty: number; revenue: number }>;
  branchPerformance: Array<{ branchId: string; branchName: string; orders: number; revenue: number; avgTicket: number }>;
  topCustomers: Array<{ id: string; name: string; visits: number; totalSpent: number }>;
};

type DashboardQueryResult = {
  current: DashboardPayload;
  previous: DashboardPayload;
  staff: any[];
  shifts: any[];
  reorderAlerts: any[];
};

const EMPTY_PAYLOAD: DashboardPayload = {
  totals: { revenue: 0, netRevenue: 0, expenses: 0, pendingExpenses: 0, netProfit: 0, paidRevenue: 0, discounts: 0, orderCount: 0, avgTicket: 0, uniqueCustomers: 0, itemsSold: 0, cancelled: 0, pending: 0, delivered: 0, cancelRate: 0 },
  trendData: [], paymentBreakdown: [], orderTypeBreakdown: [], categoryData: [], topItems: [], branchPerformance: [], topCustomers: []
};

// --- Subcomponents for Premium UI ---

interface MetricCardProps {
  label: string;
  value: any;
  subValue?: string;
  icon: any;
  color: string;
  trend?: { val: number; up: boolean };
  target?: number;
  permission?: AppPermission;
  lang: 'en' | 'ar';
  hasPermission: (p: AppPermission) => boolean;
  onClick?: () => void;
  trendData?: number[];
  delay?: number;
}

const MetricCard = React.memo<MetricCardProps>(({ label, value, subValue, icon: Icon, color, trend, target, permission, lang, hasPermission, onClick, trendData, delay = 0 }) => {
  const progress = target ? Math.min(100, (value / target) * 100) : 0;
  
  return (
    <div 
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      aria-label={label}
      className={`animate-in fade-in slide-in-from-bottom-6 duration-700 relative group overflow-hidden bg-card/60 border border-border/30 rounded-[1.5rem] p-5 lg:p-6 transition-all hover:scale-[1.02] hover:bg-card/70 hover:shadow-2xl hover:shadow-black/5 active:scale-[0.98] ${onClick ? 'cursor-pointer' : ''}`}
      style={{ animationFillMode: 'both', animationDelay: `${delay}ms` }}
    >
      {/* Decorative gradient corner */}
      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br transition-opacity duration-150 opacity-20 group-hover:opacity-30 blur-3xl`} style={{ background: color }} />
      
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-[10px] lg:text-[11px] font-black uppercase tracking-[0.15em] text-muted mb-2">{label}</p>
          <h2 className="text-xl lg:text-3xl font-black text-main tracking-tighter tabular-nums flex items-end gap-1.5">
            <SensitiveData permission={permission} hasPermission={hasPermission} lang={lang}>
              {value}
            </SensitiveData>
            {subValue && <span className="text-xs font-bold text-muted mb-1 opacity-60">{subValue}</span>}
          </h2>
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-[10px] font-black uppercase tracking-wider ${trend.up ? 'text-emerald-500' : 'text-rose-500'}`}>
              {trend.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {trend.val}% <span className="text-muted ml-1 opacity-70">{translations[lang].vs_prev}</span>
            </div>
          )}
        </div>
        <div className={`p-4 rounded-2xl border flex items-center justify-center shadow-lg transition-transform duration-150 group-hover:rotate-12`} style={{ borderColor: `${color}30`, backgroundColor: `${color}15`, color }}>
          <Icon size={24} />
        </div>
      </div>
      
      {trendData && trendData.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-16 opacity-30 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData.map((v, i) => ({ val: v, idx: i }))}>
              <defs>
                <linearGradient id={`spark-${label.replace(/\s+/g,'-')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="val" stroke={color} strokeWidth={2} fill={`url(#spark-${label.replace(/\s+/g,'-')})`} isAnimationActive={true} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {target && (
        <div className="mt-5 pt-4 border-t border-border/10 relative z-10">
          <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-muted mb-2">
            <span>{translations[lang].target_achieved}</span>
            <span className={progress >= 100 ? 'text-emerald-500' : 'text-primary'}>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 w-full bg-elevated/40 rounded-full overflow-hidden border border-border/10">
            <div 
              className={`h-full transition-all duration-1000 ease-out rounded-full shadow-[0_0_12px_rgba(0,0,0,0.1)] ${progress >= 100 ? 'bg-gradient-to-r from-emerald-500 to-green-400' : 'bg-gradient-to-r from-primary to-accent'}`}
              style={{ width: `${progress}%` }} 
            />
          </div>
        </div>
      )}
    </div>
  );
});

const Dashboard: React.FC = () => {
  // Handler to clear all stored data (menus, categories, items, orders)
  // Imported from utils/clearData

  const { settings, hasPermission } = useAuthStore();
  const navigate = useNavigate();
  const autonomousEngine = useAutonomousEngine();
  const { showToast } = useToast();
  const lang = (settings.language || 'en') as 'en' | 'ar';
  const isAr = lang === 'ar';
  const t = translations[lang];
  const { isDarkMode, currencySymbol } = settings;

  const [viewScope, setViewScope] = useState<Scope>('DAILY');
  const [customDates, setCustomDates] = useState({ start: formatLocalDate(new Date()), end: formatLocalDate(new Date()) });
  const [targets] = useState({ revenue: 5000, orders: 150 });
  

  const range = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    let compareStart = new Date(end);
    let compareEnd = new Date(end);

    if (viewScope === 'DAILY') { 
      start.setHours(0, 0, 0, 0); 
      compareStart.setFullYear(start.getFullYear() - 1);
      compareStart.setHours(0, 0, 0, 0);
      compareEnd.setFullYear(end.getFullYear() - 1);
    }
    else if (viewScope === 'WEEKLY') { 
      start.setDate(start.getDate() - 6); 
      start.setHours(0, 0, 0, 0); 
      compareStart.setDate(start.getDate() - 7);
      compareEnd.setDate(end.getDate() - 7);
    }
    else if (viewScope === 'MONTHLY') { 
      start.setDate(start.getDate() - 29); 
      start.setHours(0, 0, 0, 0); 
      compareStart.setMonth(start.getMonth() - 1);
      compareEnd.setMonth(end.getMonth() - 1);
    }
    else if (viewScope === 'YEARLY') {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      compareStart.setFullYear(start.getFullYear() - 1);
      compareEnd.setFullYear(end.getFullYear() - 1);
    }
    else if (viewScope === 'CUSTOM') {
      return { 
        startDate: customDates.start, 
        endDate: customDates.end,
        compareStartDate: formatLocalDate(new Date(new Date(customDates.start).getFullYear() - 1, new Date(customDates.start).getMonth(), new Date(customDates.start).getDate())),
        compareEndDate: formatLocalDate(new Date(new Date(customDates.end).getFullYear() - 1, new Date(customDates.end).getMonth(), new Date(customDates.end).getDate()))
      };
    }

    return { 
      startDate: formatLocalDate(start), 
      endDate: formatLocalDate(end),
      compareStartDate: formatLocalDate(compareStart),
      compareEndDate: formatLocalDate(compareEnd)
    };
  }, [viewScope, customDates]);

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['dashboard', viewScope, range, settings.activeBranchId],
    queryFn: async (): Promise<DashboardQueryResult> => {
      const apiScope = (viewScope === 'YEARLY' || viewScope === 'CUSTOM') ? 'ALL' : viewScope as any;
      const [current, previous, staff, shifts, reorderAlerts] = await Promise.all([
        reportsApi.getDashboardKpis({ branchId: settings.activeBranchId, startDate: range.startDate, endDate: range.endDate, scope: apiScope }),
        reportsApi.getDashboardKpis({ branchId: settings.activeBranchId, startDate: range.compareStartDate, endDate: range.compareEndDate, scope: apiScope }).catch(() => EMPTY_PAYLOAD),
        hrApi.getEmployees().catch(() => []),
        reportsApi.getShiftSummary({ branchId: settings.activeBranchId, startDate: range.startDate, endDate: range.endDate }).catch(() => []),
        reportsApi.getReorderAlerts().catch(() => [])
      ]);
      return { current, previous, staff, shifts, reorderAlerts };
    },
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (error) {
      showToast((error as any)?.message || 'Failed to load dashboard', 'error');
    }
  }, [error]);

  const payload = data?.current || EMPTY_PAYLOAD;
  const prevPayload = data?.previous || EMPTY_PAYLOAD;
  const employees = data?.staff || [];
  const shifts = data?.shifts || [];
  const reorderAlerts = data?.reorderAlerts || [];

  const activeShifts = shifts.filter(s => s.status === 'OPEN' || s.status?.toLowerCase() === 'active');
  const activeCashTotal = activeShifts.reduce((sum, s) => sum + (s.expectedBalance || s.openingBalance || 0), 0);
  const criticalAlerts = reorderAlerts.filter(a => a.currentStock <= a.threshold).sort((a, b) => b.deficit - a.deficit);

  // Real-time metrics - derived from actual data
  const liveMetrics = useMemo(() => ({
    orders: payload.totals.orderCount,
    prep: payload.totals.pending,
    drivers: payload.totals.delivered,
    activeStaff: employees.filter((e: any) => e.isActive !== false).length
  }), [payload, employees]);

  const goToFinance = useCallback(() => navigate('/reports'), [navigate]);
  const goToHR = useCallback(() => navigate('/hr'), [navigate]);

  // Derived Trend Analysis
  const trends = useMemo(() => {
  const calcTrend = (cur: number, prev: number) => {
    if (prev === 0) return { val: 0, up: cur > 0 };
    const val = Math.round(((cur - prev) / prev) * 100);
    return { val: Math.abs(val), up: val >= 0 };
  };
  return {
    revenue: calcTrend(payload.totals.revenue, prevPayload.totals.revenue),
    netProfit: calcTrend(payload.totals.netProfit, prevPayload.totals.netProfit),
    orders: calcTrend(payload.totals.orderCount, prevPayload.totals.orderCount),
    avgTicket: calcTrend(payload.totals.avgTicket, prevPayload.totals.avgTicket),
    customers: calcTrend(payload.totals.uniqueCustomers, prevPayload.totals.uniqueCustomers)
  };
}, [payload, prevPayload]);

  // Combined Chart Data
  const chartData = useMemo(() => {
    return payload.trendData.map((d, index) => ({
      ...d,
      prevRevenue: prevPayload.trendData[index]?.revenue || 0
    }));
  }, [payload.trendData, prevPayload.trendData]);

  const scopeLabels: Record<Scope, string> = {
    DAILY: t.today,
    WEEKLY: t.week,
    MONTHLY: t.month,
    YEARLY: (t as any).year || 'Year',
    CUSTOM: t.custom,
  };

  if (isLoading && !data) return <PageSkeleton />;

  return (
    <div className="relative min-h-screen bg-app overflow-hidden">
      {/* ?? Visual Effects Overlay ?? */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-primary/5 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-accent/5 blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 p-4 lg:p-8 space-y-6 lg:space-y-8 max-w-[1920px] mx-auto overflow-y-auto max-h-screen no-scrollbar">
        
        {/* ?? Header ?? */}
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-border/20" aria-label={t.operational_hub}>
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-[1.25rem] bg-gradient-to-br from-primary to-accent p-0.5 shadow-xl shadow-primary/20">
              <div className="w-full h-full rounded-[1.1rem] bg-card flex items-center justify-center">
                <LayoutDashboard size={32} className="text-primary animate-pulse-soft" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl lg:text-4xl font-black text-main tracking-tight flex items-center gap-3">
                {t.operational_hub}
                <span className="hidden md:flex px-3 py-1 bg-success/10 text-success border border-success/20 rounded-full text-[10px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-left duration-700">
                  {t.live}
                </span>
              </h1>
              <div className="flex items-center gap-4 mt-2 text-muted">
                <LiveClock />
                <div className="h-1 w-1 rounded-full bg-border" />
                <p className="text-xs font-bold opacity-60">{t.performance_reports}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Range Select */}
            <div className="flex bg-card/60  rounded-2xl border border-border/30 p-1">
              {(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as Scope[]).map(s => (
                <button
                  key={s}
                  onClick={() => setViewScope(s)}
                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewScope === s ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-muted hover:text-main hover:bg-elevated'}`}
                  aria-pressed={viewScope === s}
                >
                  {scopeLabels[s]}
                </button>
              ))}
            </div>
            
            {viewScope === 'CUSTOM' && (
              <div className="flex items-center gap-2 animate-in zoom-in-95 duration-150" dir="ltr">
                 <input 
                  type="date" 
                  value={customDates.start} 
                  onChange={e => setCustomDates(p => ({...p, start: e.target.value}))}
                  className="bg-card/60  border border-border/30 rounded-xl px-4 py-2 text-xs font-bold text-main outline-none focus:border-primary/50"
                 />
                 <span className="text-muted text-[10px] font-black uppercase tracking-widest">-</span>
                 <input 
                  type="date" 
                  value={customDates.end} 
                  onChange={e => setCustomDates(p => ({...p, end: e.target.value}))}
                  className="bg-card/60  border border-border/30 rounded-xl px-4 py-2 text-xs font-bold text-main outline-none focus:border-primary/50"
                 />
              </div>
            )}

            <button 
              className="h-11 w-11 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-lg active:scale-95"
              onClick={() => refetch()}
              aria-label={t.refresh_data}
            >
              <RefreshCcw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {/* ?? Autonomous Insights ?? */}
        {(autonomousEngine.kpis.peakLoad || autonomousEngine.kpis.revenueDrop || payload.totals.cancelRate > 5) && (
          <div className="flex animate-in slide-in-from-top-4 fade-in duration-1000 bg-gradient-to-r from-indigo-500/15 via-purple-500/15 to-indigo-500/15 border-y border-indigo-500/30 p-5 lg:p-6 items-center gap-5 shadow-[0_0_40px_-10px_rgba(99,102,241,0.2)] rounded-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]" />
            <div className="p-4 bg-indigo-500/20 rounded-2xl shadow-inner border border-indigo-500/20">
              <BrainCircuit className="text-indigo-500 animate-pulse" size={28} />
            </div>
            <div className="flex-1 relative z-10">
              <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em]">{t.autonomous_insight_title}</h3>
              <p className="text-sm lg:text-base font-bold text-main mt-2 flex items-center flex-wrap gap-2">
                {autonomousEngine.kpis.peakLoad && <span className="px-2.5 py-1 text-[10px] uppercase font-black tracking-widest bg-rose-500 text-white rounded-lg shadow-md shadow-rose-500/20 animate-pulse-soft">{t.peak_load_warning}</span>}
                {autonomousEngine.kpis.revenueDrop && <span className="px-2.5 py-1 text-[10px] uppercase font-black tracking-widest bg-amber-500 text-white rounded-lg shadow-md shadow-amber-500/20">{t.revenue_drop_warning}</span>}
                <span className="opacity-90">{t.autonomous_insight_desc}</span>
              </p>
            </div>
            <button className="relative z-10 h-12 px-8 rounded-xl bg-indigo-500 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-400 hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] transition-all active:scale-95 flex items-center gap-2">
              <Sparkles size={16} />
              {t.apply_instant_fix}
            </button>
          </div>
        )}

        {/* ?? Row 1: High Level KPI's with Performance Tracking ?? */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4 lg:gap-6" aria-label={t.performance_reports}>
          <MetricCard 
            label={t.total_revenue}
            value={payload.totals.revenue.toLocaleString()}
            subValue={currencySymbol}
            icon={DollarSign}
            color="var(--color-primary)"
            trend={trends.revenue}
            target={targets.revenue}
            lang={lang}
            hasPermission={hasPermission}
            permission={AppPermission.DATA_VIEW_REVENUE}
            onClick={goToFinance}
            trendData={payload.trendData.map(d => d.revenue)}
            delay={100}
          />
          <MetricCard
            label={isAr ? 'المصروفات' : 'Expenses'}
            value={payload.totals.expenses.toLocaleString()}
            subValue={currencySymbol}
            icon={Wallet}
            color="#f43f5e"
            lang={lang}
            hasPermission={hasPermission}
            permission={AppPermission.DATA_VIEW_REVENUE}
            onClick={goToFinance}
            delay={200}
          />
          <MetricCard
            label={isAr ? 'صافي الربح' : 'Net Profit'}
            value={payload.totals.netProfit.toLocaleString()}
            subValue={currencySymbol}
            icon={Briefcase}
            color={payload.totals.netProfit >= 0 ? '#10b981' : '#ef4444'}
            trend={trends.netProfit}
            lang={lang}
            hasPermission={hasPermission}
            permission={AppPermission.DATA_VIEW_REVENUE}
            onClick={goToFinance}
            delay={300}
          />
          <MetricCard 
            label={t.order_volume}
            value={payload.totals.orderCount}
            icon={ShoppingBag}
            color="var(--color-indigo)"
            trend={trends.orders}
            target={targets.orders}
            lang={lang}
            hasPermission={hasPermission}
            onClick={goToFinance}
            trendData={payload.trendData.map(d => d.revenue * 0.8)} // simulated shape
            delay={400}
          />
          <MetricCard 
            label={t.avg_ticket}
            value={payload.totals.avgTicket.toFixed(2)}
            subValue={currencySymbol}
            icon={TrendingUp}
            color="var(--color-amber)"
            trend={trends.avgTicket}
            lang={lang}
            hasPermission={hasPermission}
            onClick={goToFinance}
            trendData={payload.trendData.map(d => d.revenue * 0.2 + 20)}
            delay={500}
          />
          <MetricCard 
            label={t.active_staff}
            value={liveMetrics.activeStaff}
            subValue={`/ ${employees.length}`}
            icon={UserCheck}
            color="var(--color-pink)"
            lang={lang}
            hasPermission={hasPermission}
            onClick={goToHR}
            delay={600}
          />
        </section>

        {/* ?? Row 2: Live Resources Pulse (ERP Expansion) ?? */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 min-h-[160px] animate-in slide-in-from-bottom-8 fade-in duration-700" style={{ animationDelay: '700ms', animationFillMode: 'both'}} aria-label={isAr ? 'نبض الموارد الحية' : 'Live Resources Pulse'}>
          {/* Active Shifts & Cash */}
          <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 rounded-[2rem] p-6 shadow-xl flex items-center justify-between relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all duration-500" />
            <div className="relative z-10 flex-1">
              <h3 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2 mb-1">
                <Wallet size={16} />
                {t.live_shifts_cash}
              </h3>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <p className={`text-3xl font-black tabular-nums flex items-end gap-1 ${activeShifts.length > 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                  {activeCashTotal.toLocaleString()} <span className="text-sm pb-1">{currencySymbol}</span>
                </p>
                <div className={`px-2 py-1 text-[10px] font-black uppercase rounded-lg border mb-1 shrink-0 ${activeShifts.length > 0 ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                  {`${activeShifts.length} ${t.active_shifts_count}`}
                </div>
              </div>
              <p className="text-xs text-muted font-bold mt-2 max-w-sm">{t.cash_flow_desc}</p>
            </div>
            <div className="hidden sm:flex relative z-10 p-5 rounded-2xl bg-emerald-500/20 shadow-inner border border-emerald-500/10">
              <CheckCircle2 size={32} className="text-emerald-500" />
            </div>
          </div>

          {/* Predictive Inventory Alerts */}
          <div className="bg-gradient-to-br from-rose-500/10 to-orange-500/5 border border-rose-500/20 rounded-[2rem] p-6 shadow-xl flex flex-col sm:flex-row gap-6 relative overflow-hidden group">
            <div className="absolute -left-4 -bottom-4 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl group-hover:bg-rose-500/20 transition-all duration-500" />
            <div className="relative z-10 w-full sm:w-1/3 flex flex-row sm:flex-col justify-between sm:justify-center border-b sm:border-b-0 sm:border-r border-rose-500/10 pb-4 sm:pb-0 sm:pr-6">
               <div>
                 <h3 className="text-[11px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                   <Package size={16} />
                   {t.stock_alerts}
                 </h3>
                 <p className={`text-3xl font-black ${criticalAlerts.length > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{criticalAlerts.length} <span className="text-sm text-muted">{t.items_count}</span></p>
               </div>
               <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 sm:mt-2 text-right sm:text-left ${criticalAlerts.length > 0 ? 'text-rose-500/70' : 'text-emerald-500/70'}`}>{criticalAlerts.length > 0 ? t.critical_depletion : t.healthy_stock}</p>
            </div>
            <div className="relative z-10 flex-1 flex flex-col justify-center space-y-4">
              {criticalAlerts.length > 0 ? (
                criticalAlerts.slice(0, 2).map((alert, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm bg-card/40 p-3 rounded-xl border border-rose-500/10">
                     <span className="font-black text-main flex items-center gap-2 truncate"><AlertCircle size={14} className="text-rose-500 shrink-0"/> {alert.itemName}</span>
                     <span className="font-bold text-rose-500 text-[11px] uppercase tracking-wider shrink-0 bg-rose-500/10 px-2 py-0.5 rounded-md">
                       {`${t.left} ${alert.currentStock} ${alert.unit}`}
                     </span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center p-2 text-muted">
                  <CheckCircle2 size={24} className="text-emerald-500/50 mb-2" />
                  <p className="text-xs font-bold">{t.all_items_safe}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ?? Row 3: Deep Analytics & Forecasting ?? */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8 animate-in slide-in-from-bottom-8 fade-in duration-700" style={{ animationDelay: '800ms', animationFillMode: 'both'}}>
          
          {/* Main Chart: Revenue Comparison */}
          <div className="xl:col-span-2 bg-card/60  border border-border/30 rounded-[2rem] p-6 lg:p-8 flex flex-col shadow-xl">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-black text-main tracking-tight">{t.sales_trends_comparison}</h3>
                <p className="text-xs text-muted font-bold mt-1">{t.comparison_desc}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="text-[10px] font-black uppercase text-muted">{t.current}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-muted/40" />
                  <span className="text-[10px] font-black uppercase text-muted">{t.last_year}</span>
                </div>
              </div>
            </div>

            <div className="w-full h-[400px] mt-4 relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgb(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="rgb(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPrev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--color-border), 0.1)" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: 'var(--color-muted)', fontWeight: 800 }} 
                    dy={15}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: 'var(--color-muted)', fontWeight: 800 }} 
                    tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(var(--color-card), 0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(var(--color-border), 0.1)', borderRadius: '16px', padding: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                    itemStyle={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}
                  />
                  <Area type="monotone" dataKey="prevRevenue" name={t.last_year} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="url(#colorPrev)" />
                  <Area type="monotone" dataKey="revenue" name={t.current} stroke="rgb(var(--primary))" strokeWidth={4} fill="url(#colorCurrent)" animationDuration={2000} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Revenue Forecast */}
          <Suspense fallback={<div className="glass-1 h-[400px] animate-pulse rounded-[2rem]" />}>
            <RevenueForecastWidget />
          </Suspense>
        </div>

        {/* ?? Row 4: Team, Top Items & Sources ?? */}
        <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8 animate-in slide-in-from-bottom-8 fade-in duration-700" style={{ animationDelay: '900ms', animationFillMode: 'both'}}>
            {/* Top Employees */}
            <div className="bg-card/60  border border-border/30 rounded-[2rem] p-6 lg:p-8 shadow-xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-main tracking-tight flex items-center gap-3">
                  <Trophy className="text-yellow-500" />
                  {t.top_staff}
                </h3>
                <button className="text-[10px] font-black uppercase text-primary hover:underline">{t.view_all}</button>
              </div>
              <div className="space-y-4">
                {employees.sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0)).slice(0, 4).map((emp, i) => (
                  <div key={emp.id} className="group flex items-center gap-4 p-4 rounded-[1.25rem] bg-elevated/30 border border-border/20 hover:bg-elevated/60 transition-all">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center font-black text-primary border border-primary/20">
                        {emp.name.charAt(0)}
                      </div>
                      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-card border-2 border-primary text-[10px] font-black flex items-center justify-center text-main shadow-lg">
                        #{i+1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-black text-main truncate px-2">{emp.name}</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-emerald-500 tabular-nums">{((emp as any).totalSales || 0).toLocaleString()} <span className="text-[10px]">{currencySymbol}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trending Items Today */}
            <div className="bg-card/60 border border-border/30 rounded-[2rem] p-6 lg:p-8 shadow-xl">
              <h3 className="text-xl font-black text-main tracking-tight mb-8 flex items-center gap-3">
                <Flame className="text-orange-500" />
                {t.trending_items}
              </h3>
              <div className="space-y-5">
                {payload.topItems && payload.topItems.length > 0 ? (
                  payload.topItems.slice(0, 5).map((item, idx) => {
                    const maxQty = Math.max(1, payload.topItems[0]?.qty || 1);
                    const progress = Math.min(100, (item.qty / maxQty) * 100);
                    return (
                      <div key={item.name} className="relative group">
                        <div className="flex justify-between items-end mb-1.5 relative z-10">
                          <span className="text-[11px] font-black uppercase text-main truncate pr-2">{idx + 1}. {item.name}</span>
                          <div className="text-right shrink-0">
                             <span className="text-xs font-black text-primary tabular-nums">{item.qty} {t.qty_ordered}</span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-elevated rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-orange-400 to-amber-500 rounded-full group-hover:from-orange-500 group-hover:to-rose-500 transition-colors" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-muted border border-dashed border-border/40 rounded-xl bg-card/20">
                    <Flame size={24} className="text-orange-500/20 mb-2" />
                    <p className="text-xs font-bold text-center">{t.no_sales_data}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Platform / Order Source Breakdown */}
            <div className="bg-card/60  border border-border/30 rounded-[2rem] p-6 lg:p-8 shadow-xl">
              <h3 className="text-xl font-black text-main tracking-tight mb-8">{t.order_source_distribution}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <PieChart>
                      <Pie
                        data={payload.orderTypeBreakdown}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {payload.orderTypeBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4">
                  {payload.orderTypeBreakdown.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-xs font-black text-main uppercase tracking-widest">{item.name}</span>
                      </div>
                      <span className="text-sm font-black text-muted tabular-nums">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
        </section>

        {/* ?? Row 5: Real-time Operational Live Monitoring ?? */}
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8 min-h-[500px] animate-in slide-in-from-bottom-8 fade-in duration-700" style={{ animationDelay: '1000ms', animationFillMode: 'both'}}>
          <div className="theme-card overflow-hidden flex flex-col p-8 bg-card/60 backdrop-blur-md rounded-[2rem] shadow-xl">
             <div className="flex items-center justify-between mb-8">
               <h3 className="text-xl font-black text-main tracking-tight flex items-center gap-3">
                 <Flame className="text-rose-500" />
                 {t.live_kitchen_monitor}
               </h3>
               <div className="flex items-center gap-2">
                 <button className="h-10 px-6 rounded-xl bg-elevated border border-border/40 text-[10px] font-black uppercase tracking-widest hover:bg-border transition-colors"
                    onClick={() => navigate('/kds')}
                 >
                    {t.open_kds}
                 </button>
                 <button className="h-10 px-6 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all shadow-sm"
                    onClick={() => navigate('/pickup')}
                 >
                    {t.pickup_screen}
                 </button>
               </div>
             </div>
             <Suspense fallback={<div className="text-center py-8">{t.loading}</div>}>
                <KitchenPerformanceWidget />
             </Suspense>
          </div>
          <div className="theme-card overflow-hidden flex flex-col p-8 bg-card/60 backdrop-blur-md rounded-[2rem] shadow-xl">
             <h3 className="text-xl font-black text-main tracking-tight mb-8 flex items-center gap-3">
               <Truck className="text-cyan-500" />
               {t.delivery_logistics}
             </h3>
             <Suspense fallback={<div className="text-center py-8">{t.loading}</div>}>
                <DeliveryStatusWidget />
             </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
