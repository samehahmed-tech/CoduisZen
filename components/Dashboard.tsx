import React, { useEffect, useMemo, useState, useRef, Suspense, lazy, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from './Toast';
import { timeAgo } from '../utils/formatters';

import LiveClock from './common/LiveClock';
import SystemHealth from './common/SystemHealth';
import SensitiveData from './SensitiveData';
import PageSkeleton from './common/PageSkeleton';
import { AppPermission } from '../types';
import AnimatedNumber from './common/AnimatedNumber';
import {
  DollarSign, ShoppingBag, TrendingUp, Sparkles, Package,
  AlertCircle, AlertTriangle, Wallet,
  ArrowUpRight, ArrowDownRight, UserCheck, CheckCircle2,
  Flame, Trophy, Briefcase, Ban, ReceiptText, RefreshCcw, BrainCircuit,
  BadgePercent, Banknote, CreditCard, Smartphone, Landmark
} from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { aiApi } from '../services/api/ai';
import { reportsApi } from '../services/api/reports';
import { shiftsApi } from '../services/api/shifts';
import { hrApi } from '../services/api/hr';
import { socketService } from '../services/socketService';
import { translations } from '../services/translations';

const KitchenPerformanceWidget = lazy(() => import('./dashboard/KitchenDispatchWidgets').then(m => ({ default: m.KitchenPerformanceWidget })));
const DeliveryStatusWidget = lazy(() => import('./dashboard/KitchenDispatchWidgets').then(m => ({ default: m.DeliveryStatusWidget })));
const RevenueForecastWidget = lazy(() => import('./dashboard/RevenueForecastWidget'));
// Chart sections are lazy so the recharts runtime (~116KB) streams in AFTER
// the KPI/header shell has painted — it must never block LCP.
const MetricSparkline = lazy(() => import('./dashboard/MetricSparkline'));
const RevenueTrendChart = lazy(() => import('./dashboard/DashboardCharts').then(m => ({ default: m.RevenueTrendChart })));
const DaypartChart = lazy(() => import('./dashboard/DashboardCharts').then(m => ({ default: m.DaypartChart })));
const HourlyChart = lazy(() => import('./dashboard/DashboardCharts').then(m => ({ default: m.HourlyChart })));
const OrderSourceChart = lazy(() => import('./dashboard/DashboardCharts').then(m => ({ default: m.OrderSourceChart })));
import { ChefHat, Truck, LayoutDashboard } from 'lucide-react';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9'];

// Uniform money formatting (2 decimals, branch currency handled by caller via symbol).
const fmtMoney = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Read a theme CSS variable with fallback (theme-aware charts).
const cssVar = (name: string, fallback: string) => {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

type Scope = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day, 12) : new Date();
};

type DashboardPayload = {
  totals: {
    revenue: number; netRevenue: number; taxTotal: number; expenses: number; pendingExpenses: number; cogs: number; grossProfit: number; netProfit: number;
    paidRevenue: number; discounts: number; orderCount: number;
    avgTicket: number; uniqueCustomers: number; itemsSold: number;
    cancelled: number; cancelledValue: number; pending: number; delivered: number; cancelRate: number;
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
  totals: { revenue: 0, netRevenue: 0, taxTotal: 0, expenses: 0, pendingExpenses: 0, cogs: 0, grossProfit: 0, netProfit: 0, paidRevenue: 0, discounts: 0, orderCount: 0, avgTicket: 0, uniqueCustomers: 0, itemsSold: 0, cancelled: 0, cancelledValue: 0, pending: 0, delivered: 0, cancelRate: 0 },
  trendData: [], paymentBreakdown: [], orderTypeBreakdown: [], categoryData: [], topItems: [], branchPerformance: [], topCustomers: []
};

// --- Subcomponents for Premium UI ---

const DashboardHelp: React.FC<{ text: string; label?: string }> = ({ text, label = 'Explain this metric' }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, Math.max(220, window.innerWidth - 24));
    setPosition({
      top: Math.min(window.innerHeight - 12, rect.bottom + 8),
      left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
    });
  }, []);

  const openHelp = () => {
    clearCloseTimer();
    updatePosition();
    setOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };

  useEffect(() => () => clearCloseTimer(), []);
  useEffect(() => {
    if (!open) return;
    updatePosition();
    const reposition = () => updatePosition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updatePosition]);

  const tooltip = open && typeof document !== 'undefined' ? createPortal(
    <span
      role="tooltip"
      onMouseEnter={clearCloseTimer}
      onMouseLeave={scheduleClose}
      className="pointer-events-auto rounded-xl border border-primary/20 bg-card p-3 text-start text-[11px] font-bold leading-5 text-main shadow-2xl"
      style={{ position: 'fixed', top: position.top, left: position.left, width: 'min(320px, calc(100vw - 24px))', zIndex: 2147483647 }}
    >
      {text}
    </span>,
    document.body,
  ) : null;

  return (
    <span className="relative z-[70] inline-flex shrink-0 align-middle" onMouseEnter={clearCloseTimer} onMouseLeave={scheduleClose}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={text}
        onClick={(event) => { event.stopPropagation(); openHelp(); }}
        onMouseEnter={openHelp}
        onFocus={openHelp}
        onBlur={scheduleClose}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-sm font-black leading-none text-primary transition hover:bg-primary hover:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        ?
      </button>
      {tooltip}
    </span>
  );
};

const PaymentMethodIcon: React.FC<{ method: string }> = ({ method }) => {
  const key = String(method || '').toUpperCase();
  const Icon = key === 'CASH' || key === 'CASH_ON_DELIVERY' ? Banknote
    : key === 'VISA' || key === 'CARD' ? CreditCard
      : key === 'VODAFONE_CASH' || key === 'INSTAPAY' ? Smartphone : Landmark;
  return <Icon size={15} aria-hidden="true" />;
};

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
  help?: string;
  detail?: { label: string; value: string; help: string };
}

const MetricCard = React.memo<MetricCardProps>(({ label, value, subValue, icon: Icon, color, trend, target, permission, lang, hasPermission, onClick, trendData, delay = 0, help, detail }) => {
  const progress = target ? Math.min(100, (value / target) * 100) : 0;
  
  return (
    <div 
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      aria-label={label}
      className={`animate-in fade-in slide-in-from-bottom-6 duration-700 relative group overflow-visible bg-card/60 border border-border/30 rounded-[1.5rem] p-5 lg:p-6 transition-all hover:scale-[1.02] hover:bg-card/70 hover:shadow-2xl hover:shadow-black/5 active:scale-[0.98] ${onClick ? 'cursor-pointer' : ''}`}
      style={{ animationFillMode: 'both', animationDelay: `${delay}ms` }}
    >
      {/* Decorative gradient corner */}
      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br transition-opacity duration-150 opacity-20 group-hover:opacity-30 blur-3xl`} style={{ background: color }} />
      
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-muted lg:text-[11px]">{label}{help && <DashboardHelp text={help} label={`${label} explanation`} />}</p>
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
          {detail && (
            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-black text-muted">
              <BadgePercent size={14} className="shrink-0 text-amber-500" />
              <span>{detail.label}: {detail.value}</span>
              <DashboardHelp text={detail.help} label={`${detail.label} explanation`} />
            </div>
          )}
        </div>
        <div className={`p-4 rounded-2xl border flex items-center justify-center shadow-lg transition-transform duration-150 group-hover:rotate-12`} style={{ borderColor: `${color}30`, backgroundColor: `${color}15`, color }}>
          <Icon size={24} />
        </div>
      </div>
      
      {trendData && trendData.length > 0 && (
        <Suspense fallback={null}>
          <MetricSparkline values={trendData} color={color} gradientId={`spark-${label.replace(/\s+/g, '-')}`} />
        </Suspense>
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

  const { settings, hasPermission, branches } = useAuthStore(useShallow((state) => ({ settings: state.settings, hasPermission: state.hasPermission, branches: state.branches })));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const lang = (settings.language || 'en') as 'en' | 'ar';
  const isAr = lang === 'ar';
  const t = translations[lang];
  const { isDarkMode, currencySymbol } = settings;
  const activeBranch = useMemo(() => branches.find((branch) => branch.id === settings.activeBranchId), [branches, settings.activeBranchId]);
  // Honest business date: never silently fall back — a missing branch date is
  // surfaced as a blocking warning (Zone 0) instead of stamping today quietly.
  const hasBusinessDate = Boolean(activeBranch?.businessDate);
  const activeBusinessDate = activeBranch?.businessDate || formatLocalDate(new Date());
  const isStaleBusinessDate = hasBusinessDate && activeBusinessDate !== formatLocalDate(new Date());

  const [viewScope, setViewScope] = useState<Scope>('DAILY');
  const [customDates, setCustomDates] = useState({ start: activeBusinessDate, end: activeBusinessDate });
  // Ticking clock so the "updated X ago" badge stays fresh without refetching.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (viewScope !== 'CUSTOM') setCustomDates({ start: activeBusinessDate, end: activeBusinessDate });
  }, [activeBusinessDate, viewScope]);
  

  const range = useMemo(() => {
    const end = parseDateKey(activeBusinessDate);
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
      // Clamp comparison window to valid month-end days: setMonth on day 29-31
      // can land on invalid dates (e.g. 31 Mar -> 3 Mar), shifting the window.
      const maxDayPrevStart = new Date(start.getFullYear(), start.getMonth(), 0).getDate();
      const maxDayPrevEnd = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
      compareStart.setDate(Math.min(compareStart.getDate(), maxDayPrevStart));
      compareEnd.setDate(Math.min(compareEnd.getDate(), maxDayPrevEnd));
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
      // Normalize user input: swap inverted ranges and cap at the business
      // date so the API never receives an invalid or future window.
      let startKey = customDates.start;
      let endKey = customDates.end;
      if (startKey > endKey) [startKey, endKey] = [endKey, startKey];
      if (endKey > activeBusinessDate) endKey = activeBusinessDate;
      if (startKey > endKey) startKey = endKey;
      const parseKey = (key: string) => {
        const [y, m, d] = key.split('-').map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
      };
      const customStart = parseKey(startKey);
      const customEnd = parseKey(endKey);
      return {
        startDate: startKey,
        endDate: endKey,
        compareStartDate: formatLocalDate(new Date(customStart.getFullYear() - 1, customStart.getMonth(), customStart.getDate())),
        compareEndDate: formatLocalDate(new Date(customEnd.getFullYear() - 1, customEnd.getMonth(), customEnd.getDate()))
      };
    }

    return { 
      startDate: formatLocalDate(start), 
      endDate: formatLocalDate(end),
      compareStartDate: formatLocalDate(compareStart),
      compareEndDate: formatLocalDate(compareEnd)
    };
  }, [viewScope, customDates, activeBusinessDate]);

  // Primary KPIs first: a single fast endpoint paints the header + KPI
  // cards in <1s. Everything else streams in afterwards (same visuals,
  // same numbers — just progressive instead of all-or-nothing blank).
  const { data, error, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard', viewScope, range, settings.activeBranchId],
    queryFn: async (): Promise<DashboardQueryResult> => {
      const apiScope = (viewScope === 'YEARLY' || viewScope === 'CUSTOM') ? 'ALL' : viewScope as any;
      const current = await reportsApi.getDashboardKpis({ branchId: settings.activeBranchId, startDate: range.startDate, endDate: range.endDate, scope: apiScope });
      return { current, previous: EMPTY_PAYLOAD, staff: [], shifts: [], reorderAlerts: [] };
    },
    staleTime: 5 * 60_000,
    refetchOnMount: true,
    placeholderData: keepPreviousData,
  });

  // Secondary (comparisons, staff, shifts, alerts): starts right AFTER the
  // KPIs paint so it never competes with first paint on the critical path.
  const { data: secondary, refetch: refetchSecondary } = useQuery({
    queryKey: ['dashboard-secondary', viewScope, range, settings.activeBranchId],
    queryFn: async () => {
      const apiScope = (viewScope === 'YEARLY' || viewScope === 'CUSTOM') ? 'ALL' : viewScope as any;
      const [previous, staff, shifts, openShifts, reorderAlerts] = await Promise.all([
        reportsApi.getDashboardKpis({ branchId: settings.activeBranchId, startDate: range.compareStartDate, endDate: range.compareEndDate, scope: apiScope }).catch(() => EMPTY_PAYLOAD),
        hrApi.getEmployees().catch(() => []),
        reportsApi.getShiftSummary({ branchId: settings.activeBranchId, startDate: range.startDate, endDate: range.endDate }).catch(() => []),
        shiftsApi.getOpenShifts(settings.activeBranchId).catch(() => []),
        reportsApi.getReorderAlerts().catch(() => [])
      ]);
      // An open shift is authoritative for the live dashboard even when its
      // opening date falls outside the selected report range. Enrich it with
      // the running X-report cash and merge it into the report rows.
      const reportRows = Array.isArray(shifts) ? shifts : [];
      const liveRows = Array.isArray(openShifts) ? await Promise.all(openShifts.map(async (shift: any) => {
        const xReport = await shiftsApi.getXReport(String(shift.id), settings.activeBranchId).catch(() => null);
        return {
          ...shift,
          status: 'OPEN',
          expectedBalance: Number(xReport?.expectedCashBalance ?? xReport?.expectedCashInDrawer ?? shift.openingBalance ?? 0),
          actualBalance: Number(xReport?.expectedCashBalance ?? xReport?.expectedCashInDrawer ?? shift.openingBalance ?? 0),
          cashSales: Number(xReport?.cashCollected ?? 0),
        };
      })) : [];
      const mergedShifts = [...reportRows];
      for (const live of liveRows) {
        const index = mergedShifts.findIndex((row: any) => String(row.shiftId || row.id) === String(live.id));
        if (index >= 0) mergedShifts[index] = { ...mergedShifts[index], ...live };
        else mergedShifts.push(live);
      }
      return { previous, staff, shifts: mergedShifts, reorderAlerts };
    },
    enabled: !!data?.current,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  // Extended analytics (Zone 2-4): non-blocking, each endpoint degrades to
  // empty independently so one failure never blanks the dashboard.
  const { data: ext } = useQuery({
    queryKey: ['dashboard-extended', range.startDate, range.endDate, settings.activeBranchId],
    enabled: !!data?.current,
    queryFn: async () => {
      const p = { branchId: settings.activeBranchId, startDate: range.startDate, endDate: range.endDate };
      const [hourly, daypart, heat, branchPerf, byItem, empProd, staffCost, discounts, cancelled, demand, newVsRet] = await Promise.all([
        reportsApi.getHourlySales(p).catch(() => []),
        reportsApi.getDaypartAnalysis(p).catch(() => []),
        reportsApi.getPeakHoursHeatmap(p).catch(() => []),
        reportsApi.getBranchPerformance({ startDate: range.startDate, endDate: range.endDate }).catch(() => []),
        reportsApi.getSalesByItem(p).catch(() => []),
        reportsApi.getEmployeeProductivity(p).catch(() => []),
        reportsApi.getStaffCostVsRevenue(p).catch(() => null),
        reportsApi.getDiscountAnalysis(p).catch(() => null),
        reportsApi.getCancelledOrders(p).catch(() => null),
        reportsApi.getDemandForecast({ branchId: settings.activeBranchId }).catch(() => null),
        reportsApi.getNewVsReturning(p).catch(() => null),
      ]);
      return { hourly, daypart, heat, branchPerf, byItem, empProd, staffCost, discounts, cancelled, demand, newVsRet };
    },
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    let mounted = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const shiftPollTimer = window.setInterval(() => {
      if (mounted) void refetchSecondary();
    }, 60_000);
    const refreshDashboard = () => {
      if (!mounted) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      // Coalesce bursts (KDS/order events can fire many per second during
      // rush) — refetching all report endpoints per event is what melts
      // the backend. 1.5s still feels realtime.
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        if (!mounted) return;
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard-secondary'] });
        void refetch();
        void refetchSecondary();
      }, 1500);
    };

    const handleLocalOrdersChanged = () => refreshDashboard();
    try {
      const persistedChange = localStorage.getItem('restoflow:orders-changed');
      if (persistedChange) {
        const parsed = JSON.parse(persistedChange);
        if (parsed?.changedAt && Date.now() - Number(parsed.changedAt) < 10 * 60_000) {
          refreshDashboard();
        }
        localStorage.removeItem('restoflow:orders-changed');
      }
    } catch {
      localStorage.removeItem('restoflow:orders-changed');
    }
    socketService.on('order:created', refreshDashboard);
    socketService.on('order:status', refreshDashboard);
    socketService.on('order:updated', refreshDashboard);
    socketService.on('analytics:refresh', refreshDashboard);
    window.addEventListener('restoflow:orders-changed', handleLocalOrdersChanged);
    return () => {
      mounted = false;
      socketService.off('order:created', refreshDashboard);
      socketService.off('order:status', refreshDashboard);
      socketService.off('order:updated', refreshDashboard);
      socketService.off('analytics:refresh', refreshDashboard);
      window.removeEventListener('restoflow:orders-changed', handleLocalOrdersChanged);
      if (refreshTimer) clearTimeout(refreshTimer);
      window.clearInterval(shiftPollTimer);
    };
  }, [queryClient, refetch, refetchSecondary]);

  useEffect(() => {
    if (error) {
      showToast((error as any)?.message || 'Failed to load dashboard', 'error');
    }
  }, [error]);

  const payload = data?.current || EMPTY_PAYLOAD;
  // Secondary streams in right after KPIs paint: comparisons and lists
  // upgrade in place (same cards, same layout — no blank screen).
  const prevPayload = secondary?.previous || EMPTY_PAYLOAD;
  const employees = secondary?.staff || [];
  const shifts = secondary?.shifts || [];
  const reorderAlerts = secondary?.reorderAlerts || [];

  // Defensive numeric access: a single null field from the API must never
  // crash the whole dashboard (e.g. avgTicket?.toFixed).
  const num = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const totals = useMemo(() => {
    const src = (payload.totals || {}) as Record<string, unknown>;
    const entries = Object.fromEntries(Object.entries(src).map(([key, value]) => [key, num(value)]));
    return entries as unknown as DashboardPayload['totals'];
  }, [payload]);

  const activeShifts = useMemo(() => shifts.filter((s: any) => {
    const status = String(s.status || '').toUpperCase();
    return status === 'OPEN' || status === 'ACTIVE';
  }), [shifts]);
  const activeCashTotal = useMemo(() => activeShifts.reduce((sum: number, s: any) => sum + num(
    s.expectedBalance ?? s.expectedCashBalance ?? s.expectedCashInDrawer ?? s.cashBalance ?? s.balance ?? s.openingBalance ?? 0
  ), 0), [activeShifts]);
  const criticalAlerts = useMemo(() => reorderAlerts
    .filter((a: any) => num(a.currentStock) <= num(a.threshold))
    .sort((a: any, b: any) => num(b.deficit) - num(a.deficit)), [reorderAlerts]);
  // Real-time metrics - derived from actual data
  const liveMetrics = useMemo(() => ({
    orders: totals.orderCount,
    prep: totals.pending,
    drivers: totals.delivered,
    activeStaff: employees.filter((e: any) => e.isActive !== false).length
  }), [totals, employees]);

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
    revenue: calcTrend(totals.revenue, num(prevPayload.totals?.revenue)),
    netProfit: calcTrend(totals.netProfit, num(prevPayload.totals?.netProfit)),
    orders: calcTrend(totals.orderCount, num(prevPayload.totals?.orderCount)),
    avgTicket: calcTrend(totals.avgTicket, num(prevPayload.totals?.avgTicket)),
    customers: calcTrend(totals.uniqueCustomers, num(prevPayload.totals?.uniqueCustomers))
  };
}, [totals, prevPayload]);

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

  // Legend labels for the comparison series — the comparison period changes per
  // scope (same day last year / previous week / previous month / last year).
  const comparisonLabel = useMemo(() => {
    if (viewScope === 'DAILY') return isAr ? 'مقارنة بنفس اليوم من العام الماضي' : 'Same day last year';
    if (viewScope === 'WEEKLY') return isAr ? 'مقارنة بالأسبوع الماضي' : 'Previous week';
    if (viewScope === 'MONTHLY') return isAr ? 'مقارنة بالشهر الماضي' : 'Previous month';
    if (viewScope === 'YEARLY') return isAr ? 'مقارنة بالعام الماضي' : 'Previous year';
    return isAr ? 'مقارنة بالفترة السابقة' : 'Previous period';
  }, [viewScope, isAr]);

  // orderTypeBreakdown returns raw counts from the backend; show percentages.
  const orderTypePercentData = useMemo(() => {
    const total = payload.orderTypeBreakdown.reduce((sum, e) => sum + (Number(e.value) || 0), 0);
    if (total <= 0) return [];
    return payload.orderTypeBreakdown.map(e => ({ ...e, value: Number(((Number(e.value) || 0) / total * 100).toFixed(1)) }));
  }, [payload.orderTypeBreakdown]);

  // Honest growth targets: +10% over the comparison period (never hardcoded).
  const targets = useMemo(() => {
    const prevRev = num(prevPayload.totals?.revenue);
    const prevOrders = num(prevPayload.totals?.orderCount);
    return {
      revenue: prevRev > 0 ? prevRev * 1.1 : totals.revenue,
      orders: prevOrders > 0 ? Math.ceil(prevOrders * 1.1) : totals.orderCount,
    };
  }, [prevPayload, totals]);

  // Single most-critical alert (Zero-UI: one action, not a wall of badges).
  const criticalAlert = useMemo(() => {
    if (!hasBusinessDate) return { kind: 'date' as const, text: isAr ? 'تاريخ التشغيل غير مضبوط — راجع إغلاق اليوم' : 'Business date is not set — review Day Close', to: '/day-close' };
    if (criticalAlerts.length > 0) return { kind: 'stock' as const, text: isAr ? `${criticalAlerts[0].itemName} أوشك على النفاد (${criticalAlerts[0].currentStock} ${criticalAlerts[0].unit || ''})` : `${criticalAlerts[0].itemName} is almost out (${criticalAlerts[0].currentStock} ${criticalAlerts[0].unit || ''})`, to: '/inventory' };
    if (totals.cancelRate > 5) return { kind: 'cancel' as const, text: isAr ? `معدل الإلغاء ${totals.cancelRate.toFixed(1)}% — أعلى من الحد (5%)` : `Cancel rate ${totals.cancelRate.toFixed(1)}% — above the 5% limit`, to: '/reports' };
    if (activeShifts.length === 0) return { kind: 'shift' as const, text: isAr ? 'لا توجد شيفتات مفتوحة — تحقق من الكاشير' : 'No open shifts — check the cashier', to: '/day-close' };
    return null;
  }, [hasBusinessDate, criticalAlerts, totals.cancelRate, activeShifts, isAr]);

  // Data-driven daily briefing (replaces the fake "instant fix" banner).
  const briefing = useMemo(() => {
    const parts: string[] = [];
    parts.push(isAr
      ? `إيراد ${fmtMoney(totals.revenue)} ${currencySymbol} من ${totals.orderCount} طلب (${trends.revenue.up ? '+' : '−'}${trends.revenue.val}%)`
      : `${fmtMoney(totals.revenue)} ${currencySymbol} from ${totals.orderCount} orders (${trends.revenue.up ? '+' : '−'}${trends.revenue.val}%)`);
    if (totals.cancelRate > 0) parts.push(isAr ? `إلغاءات ${totals.cancelRate.toFixed(1)}%` : `cancels ${totals.cancelRate.toFixed(1)}%`);
    if (criticalAlerts.length > 0) parts.push(isAr ? `${criticalAlerts.length} تنبيه مخزون` : `${criticalAlerts.length} stock alerts`);
    const cta = criticalAlert ?? { kind: 'ok' as const, text: '', to: '/reports' };
    return { text: parts.join(' • '), cta };
  }, [totals, trends, criticalAlerts, criticalAlert, isAr, currencySymbol]);

  // Why did revenue change? prev → volume effect − discount delta − cancel delta → current.
  const waterfall = useMemo(() => {
    const prevRev = num(prevPayload.totals?.revenue);
    const prevAvg = num(prevPayload.totals?.avgTicket);
    const prevDisc = num(prevPayload.totals?.discount);
    const prevCanc = num(prevPayload.totals?.cancelledValue);
    const volumeEffect = (totals.orderCount - num(prevPayload.totals?.orderCount)) * prevAvg;
    const discountEffect = -(totals.discounts - prevDisc);
    const cancelEffect = -(totals.cancelledValue - prevCanc);
    const residual = totals.revenue - prevRev - volumeEffect - discountEffect - cancelEffect;
    return [
      { label: isAr ? 'الفترة السابقة' : 'Previous', value: prevRev, total: true },
      { label: isAr ? 'أثر حجم الطلبات' : 'Volume effect', value: volumeEffect },
      { label: isAr ? 'أثر الخصومات' : 'Discount effect', value: discountEffect },
      { label: isAr ? 'أثر الإلغاءات' : 'Cancel effect', value: cancelEffect },
      { label: isAr ? 'أخرى' : 'Other', value: residual },
      { label: isAr ? 'الحالية' : 'Current', value: totals.revenue, total: true },
    ];
  }, [prevPayload, totals, isAr]);

  const maxWaterfall = useMemo(() => Math.max(1, ...waterfall.filter(s => !s.total).map(s => Math.abs(s.value))), [waterfall]);

  // Peak-hours heatmap matrix (dayOfWeek × hour) for WEEKLY+ scopes.
  const heatMatrix = useMemo(() => {
    const rows: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 1;
    for (const cell of (ext?.heat || []) as Array<{ dayOfWeek: number; hour: number; orderCount: number }>) {
      const d = Number(cell.dayOfWeek);
      const h = Number(cell.hour);
      if (d >= 0 && d < 7 && h >= 0 && h < 24) {
        rows[d][h] = Number(cell.orderCount) || 0;
        if (rows[d][h] > max) max = rows[d][h];
      }
    }
    return { rows, max };
  }, [ext]);

  const hourlyData = useMemo(() => ((ext?.hourly || []) as Array<{ hour: string; revenue: number; orderCount: number }>).slice(0, 24), [ext]);
  const daypartData = useMemo(() => ((ext?.daypart || []) as Array<{ name: string; orderCount: number; revenue: number; avgTicket: number; percentage: number }>), [ext]);

  // Items needing a decision: slowest movers with margin visibility.
  const slowItems = useMemo(() => {
    const rows = ((ext?.byItem || []) as Array<{ menuItemId: string; itemName: string; qtySold: number; revenue: number; cost: number; profit: number; marginPercent: number }>);
    return rows.slice().sort((a, b) => (Number(a.qtySold) || 0) - (Number(b.qtySold) || 0)).slice(0, 5);
  }, [ext]);

  const paymentMix = useMemo(() => {
    const total = payload.paymentBreakdown.reduce((s, e) => s + (Number(e.value) || 0), 0);
    if (total <= 0) return [];
    return payload.paymentBreakdown.map(e => ({
      ...e,
      amount: Number(e.value) || 0,
      value: Number(((Number(e.value) || 0) / total * 100).toFixed(1)),
    }));
  }, [payload.paymentBreakdown]);

  const paymentLabel = useCallback((method: string) => {
    const labels: Record<string, string> = isAr
      ? { CASH: 'نقدي', VISA: 'فيزا / بطاقة', VODAFONE_CASH: 'فودافون كاش', INSTAPAY: 'إنستا باي', SPLIT: 'دفع متعدد', CASH_ON_DELIVERY: 'نقدي عند الاستلام' }
      : { CASH: 'Cash', VISA: 'Card / Visa', VODAFONE_CASH: 'Vodafone Cash', INSTAPAY: 'InstaPay', SPLIT: 'Split payment', CASH_ON_DELIVERY: 'Cash on delivery' };
    return labels[String(method || '').toUpperCase()] || method || (isAr ? 'غير محدد' : 'Unknown');
  }, [isAr]);

  const branchPerfRows = useMemo(() => {
    const fromPayload = (payload.branchPerformance || []) as Array<{ branchId: string; branchName: string; orders: number; revenue: number; avgTicket: number }>;
    if (fromPayload.length > 0) return fromPayload;
    return ((ext?.branchPerf || []) as Array<{ branchId: string; branchName: string; orderCount: number; revenue: number; avgTicket: number }>).map(b => ({ branchId: b.branchId, branchName: b.branchName, orders: b.orderCount, revenue: b.revenue, avgTicket: b.avgTicket }));
  }, [payload.branchPerformance, ext]);

  const shiftVariance = useMemo(() => shifts.map((s: any) => ({
    id: s.shiftId || s.id,
    user: s.userName || s.userId || (isAr ? 'كاشير' : 'Cashier'),
    expected: num(s.expectedBalance),
    actual: num(s.actualBalance ?? s.expectedBalance),
    variance: num(s.variance ?? (num(s.actualBalance ?? s.expectedBalance) - num(s.expectedBalance))),
    status: s.status,
  })).slice(0, 5), [shifts, isAr]);

  // Real per-employee productivity (replaces the always-zero totalSales list).
  const productiveStaff = useMemo(() => {
    const rows = ((ext?.empProd || []) as Array<{ userId: string; orderCount: number; revenue: number; avgTicket: number }>);
    return rows.slice().sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0)).slice(0, 4);
  }, [ext]);

  const newVsReturning = useMemo(() => (ext?.newVsRet as any) || null, [ext]);

  if (isLoading && !data) return <PageSkeleton />;

  return (
    <div className="relative min-h-screen bg-app overflow-hidden">
      {/* Visual Effects Overlay — static: same colors/position, isolated in
          its own paint layer (contain: strict) so it never repaints with
          scrolling content. The pulse on 120-150px blurs was the most
          expensive paint on this page; static renders identically. */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{ contain: 'strict' }}>
        <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-accent/5 blur-[150px]" />
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
              <div className="flex flex-wrap items-center gap-4 mt-2 text-muted">
                <LiveClock />
                <div className="h-1 w-1 rounded-full bg-border" />
                <p className="text-xs font-bold opacity-60">{t.performance_reports}</p>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${isStaleBusinessDate ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'}`}>
                  {isAr ? `تاريخ التشغيل: ${activeBusinessDate}` : `Business date: ${activeBusinessDate}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Range Select */}
            <div className="flex bg-card/60  rounded-2xl border border-border/30 p-1">
              {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM'] as Scope[]).map(s => (
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
                  max={activeBusinessDate}
                  onChange={e => setCustomDates(p => ({...p, start: e.target.value}))}
                  aria-label={isAr ? 'من تاريخ' : 'From date'}
                  className="bg-card/60  border border-border/30 rounded-xl px-4 py-2 text-xs font-bold text-main outline-none focus:border-primary/50"
                 />
                 <span className="text-muted text-[10px] font-black uppercase tracking-widest">-</span>
                 <input
                  type="date"
                  value={customDates.end}
                  max={activeBusinessDate}
                  onChange={e => setCustomDates(p => ({...p, end: e.target.value}))}
                  aria-label={isAr ? 'إلى تاريخ' : 'To date'}
                  className="bg-card/60  border border-border/30 rounded-xl px-4 py-2 text-xs font-bold text-main outline-none focus:border-primary/50"
                 />
              </div>
            )}

            <button
              className="h-11 w-11 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-wait"
              onClick={() => refetch()}
              disabled={isLoading}
              aria-label={t.refresh_data}
            >
              <RefreshCcw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {/* Inline error state: toast alone disappears; the user needs a persistent
            explanation plus a retry affordance when the dashboard cannot load. */}
        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-rose-500 shrink-0" />
              <div>
                <p className="text-xs font-black text-rose-600 uppercase tracking-widest">{isAr ? 'تعذر تحميل بيانات لوحة التحكم' : 'Failed to load dashboard data'}</p>
                <p className="text-[11px] font-bold text-muted mt-0.5">{(error as any)?.message || (isAr ? 'تحقق من الاتصال بالخادم ثم أعد المحاولة.' : 'Check the server connection and try again.')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isLoading}
              className="rounded-xl bg-rose-500 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-rose-600 disabled:opacity-50"
            >
              {isLoading ? (isAr ? 'جاري التحديث…' : 'Retrying…') : (isAr ? 'إعادة المحاولة' : 'Retry')}
            </button>
          </div>
        )}

        {/* ZONE 0 — Trust strip: branch, business date, data age, shifts. */}
        {!hasBusinessDate && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-rose-500 shrink-0" />
              <div>
                <p className="text-xs font-black text-rose-600 uppercase tracking-widest">{isAr ? 'تاريخ التشغيل غير مضبوط لهذا الفرع' : 'Business date is not set for this branch'}</p>
                <p className="text-[11px] font-bold text-muted mt-0.5">{isAr ? 'لن يتم احتساب أي عملية على اليوم الصحيح. افتح إغلاق اليوم لضبطه.' : 'New activity cannot be stamped to the correct day. Open Day Close to set it.'}</p>
              </div>
            </div>
            <button type="button" onClick={() => navigate('/day-close')} className="rounded-xl bg-rose-500 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-rose-600">
              {isAr ? 'فتح إغلاق اليوم' : 'Open Day Close'}
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest" aria-label={isAr ? 'شريط الثقة' : 'Trust strip'}>
          <span className="rounded-full border border-border/30 bg-card/60 px-3 py-1.5 text-main">{activeBranch?.name || (isAr ? 'كل الفروع' : 'All branches')}</span>
          <span className={`rounded-full px-3 py-1.5 ${!hasBusinessDate || isStaleBusinessDate ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'}`}>
            {isAr ? `التشغيل: ${activeBusinessDate}` : `Business date: ${activeBusinessDate}`}
          </span>
          <span className="rounded-full border border-border/30 bg-card/60 px-3 py-1.5 text-muted">
            {dataUpdatedAt ? (isAr ? `محدّث ${timeAgo(dataUpdatedAt, 'ar')}` : `Updated ${timeAgo(dataUpdatedAt, 'en')}`) : (isAr ? 'جاري التحميل…' : 'Loading…')}
          </span>
          <span className={`rounded-full px-3 py-1.5 ${activeShifts.length > 0 ? 'bg-emerald-500/15 text-emerald-600' : 'bg-slate-500/10 text-muted'}`}>
            {isAr ? `${activeShifts.length} شيفت مفتوح` : `${activeShifts.length} open shifts`}
          </span>
        </div>

        {/* Daily briefing — data-driven summary with a real destination CTA. */}
        <div className="flex animate-in slide-in-from-top-4 fade-in duration-1000 bg-gradient-to-r from-indigo-500/15 via-purple-500/15 to-indigo-500/15 border-y border-indigo-500/30 p-5 lg:p-6 items-center gap-5 shadow-[0_0_40px_-10px_rgba(99,102,241,0.2)] rounded-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]" />
          <div className="p-4 bg-indigo-500/20 rounded-2xl shadow-inner border border-indigo-500/20">
            <BrainCircuit className="text-indigo-500 animate-pulse" size={28} />
          </div>
          <div className="flex-1 relative z-10">
            <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em]">{t.autonomous_insight_title}</h3>
            <p className="text-sm lg:text-base font-bold text-main mt-2">{briefing.text}</p>
            {criticalAlert && (
              <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-rose-500/15 border border-rose-500/25 px-3 py-1.5 text-xs font-black text-rose-500">
                <AlertTriangle size={14} />{criticalAlert.text}
              </p>
            )}
          </div>
          <button className="relative z-10 h-12 px-8 rounded-xl bg-indigo-500 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-400 hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] transition-all active:scale-95 flex items-center gap-2" onClick={() => navigate(briefing.cta.to)}>
            <Sparkles size={16} />
            {criticalAlert ? (isAr ? 'معالجة الآن' : 'Act now') : (isAr ? 'عرض التقارير' : 'View reports')}
          </button>
        </div>

        {/* ZONE 1 — Decision row: 4 cards, 30 seconds. */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5" aria-label={isAr ? 'قرارات سريعة' : 'Decision row'}>
          <div className="relative overflow-hidden bg-card/60 border border-border/30 rounded-[1.5rem] p-5 transition-all hover:scale-[1.02]">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-muted">{isAr ? 'إيراد اليوم' : "Today's revenue"}<DashboardHelp text={isAr ? 'إجمالي قيمة الطلبات المكتملة أو المسلّمة في الفترة الحالية مقارنة بالفترة السابقة.' : 'Total value of completed or delivered orders in the current period compared with the previous period.'} label={isAr ? 'شرح إيراد اليوم' : "Explain today's revenue"} /></p>
            <p className="text-2xl lg:text-3xl font-black text-main tracking-tighter tabular-nums">
              <SensitiveData permission={AppPermission.DATA_VIEW_REVENUE} hasPermission={hasPermission} lang={lang}>{fmtMoney(totals.revenue)}</SensitiveData>
              <span className="text-xs font-bold text-muted opacity-60"> {currencySymbol}</span>
            </p>
            <p className={`mt-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider ${trends.revenue.up ? 'text-emerald-500' : 'text-rose-500'}`}>
              {trends.revenue.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{trends.revenue.val}% <span className="text-muted opacity-70">{translations[lang].vs_prev}</span>
            </p>
          </div>
          <button type="button" onClick={() => navigate('/kds')} className="relative overflow-hidden bg-card/60 border border-border/30 rounded-[1.5rem] p-5 text-start transition-all hover:scale-[1.02]">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-muted">{isAr ? 'طلبات نشطة' : 'Active orders'}<DashboardHelp text={isAr ? 'عدد الطلبات التي لم تكتمل بعد، ويظهر بجانبها إجمالي الطلبات في الفترة.' : 'Orders that are not completed yet, shown beside the total order count for the period.'} label={isAr ? 'شرح الطلبات النشطة' : 'Explain active orders'} /></p>
            <p className="text-2xl lg:text-3xl font-black text-main tracking-tighter tabular-nums">{totals.pending}<span className="text-sm font-bold text-muted"> / {totals.orderCount}</span></p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-500/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400" style={{ width: `${totals.orderCount ? Math.min(100, (totals.pending / totals.orderCount) * 100) : 0}%` }} /></div>
          </button>
          <button type="button" onClick={() => criticalAlert && navigate(criticalAlert.to)} className={`relative overflow-hidden border rounded-[1.5rem] p-5 text-start transition-all hover:scale-[1.02] ${criticalAlert ? 'border-rose-500/30 bg-rose-500/[0.06]' : 'border-emerald-500/30 bg-emerald-500/[0.06]'}`}>
            <p className={`mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] ${criticalAlert ? 'text-rose-500' : 'text-emerald-600'}`}>{isAr ? 'الأولوية القصوى' : 'Top priority'}<DashboardHelp text={isAr ? 'أهم تنبيه تشغيلي حاليًا. إذا لم توجد مشكلة ستظهر رسالة أن المؤشرات مستقرة.' : 'The most important current operational alert. When there is no issue, the dashboard reports that indicators are stable.'} label={isAr ? 'شرح الأولوية القصوى' : 'Explain top priority'} /></p>
            <p className="text-sm font-black text-main leading-6 min-h-[3rem]">{criticalAlert ? criticalAlert.text : (isAr ? 'كل المؤشرات مستقرة ✓' : 'All indicators stable ✓')}</p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-primary">{criticalAlert ? (isAr ? 'اضغط للمعالجة' : 'Tap to act') : (isAr ? 'استمر' : 'Keep going')}</p>
          </button>
        </section>

        {/* Row 1: High Level KPI's with Performance Tracking */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5" aria-label={t.performance_reports}>
          <MetricCard
            label={t.total_revenue}
            value={fmtMoney(totals.revenue)}
            subValue={currencySymbol}
            icon={DollarSign}
            color="var(--color-primary)"
            trend={trends.revenue}
            target={targets.revenue}
            lang={lang}
            hasPermission={hasPermission}
            permission={AppPermission.DATA_VIEW_REVENUE}
            onClick={goToFinance}
            trendData={payload.trendData.map(d => num(d.revenue))}
            help={isAr ? 'إجمالي قيمة الطلبات المكتملة أو المسلّمة خلال الفترة المحددة، قبل خصم الخصومات والضريبة.' : 'Total value of completed or delivered orders in the selected period, before discounts and tax.'}
            detail={{ label: isAr ? 'الخصومات' : 'Discounts', value: `${fmtMoney(totals.discounts)} ${currencySymbol}`, help: isAr ? 'إجمالي الخصومات المطبقة على الطلبات خلال الفترة المحددة. هذا المبلغ يُخصم من إجمالي المبيعات للوصول إلى صافي المبيعات.' : 'Total discounts applied to orders in the selected period. This amount is deducted from gross sales to calculate net sales.' }}
            delay={100}
          />
          <MetricCard
            label={isAr ? 'الضريبة المحصلة' : 'Tax Collected'}
            value={fmtMoney(num(totals.taxTotal))}
            subValue={currencySymbol}
            icon={ReceiptText}
            color="#0ea5e9"
            lang={lang}
            hasPermission={hasPermission}
            permission={AppPermission.DATA_VIEW_REVENUE}
            onClick={goToFinance}
            help={isAr ? 'إجمالي الضريبة المسجلة على الطلبات المعترف بها في الفترة المحددة.' : 'Total tax recorded on recognized orders in the selected period.'}
            delay={200}
          />
          <MetricCard
            label={isAr ? 'المصروفات' : 'Expenses'}
            value={fmtMoney(totals.expenses)}
            subValue={currencySymbol}
            icon={Wallet}
            color="#f43f5e"
            lang={lang}
            hasPermission={hasPermission}
            permission={AppPermission.DATA_VIEW_REVENUE}
            onClick={goToFinance}
            help={isAr ? 'المصروفات المعتمدة والمرحّلة ماليًا خلال الفترة، ولا تشمل المصروفات المعلقة.' : 'Approved and posted expenses in the period; pending expenses are excluded.'}
            delay={300}
          />
          <MetricCard
            label={isAr ? 'صافي الربح' : 'Net Profit'}
            value={fmtMoney(totals.netProfit)}
            subValue={currencySymbol}
            icon={Briefcase}
            color={totals.netProfit >= 0 ? '#10b981' : '#ef4444'}
            trend={trends.netProfit}
            lang={lang}
            hasPermission={hasPermission}
            permission={AppPermission.DATA_VIEW_REVENUE}
            onClick={goToFinance}
            help={isAr ? 'صافي المبيعات بعد الخصومات ناقص تكلفة المبيعات والمصروفات المعتمدة.' : 'Net sales after discounts minus cost of goods sold and approved expenses.'}
            delay={400}
          />
          <MetricCard
            label={t.order_volume}
            value={totals.orderCount}
            icon={ShoppingBag}
            color="var(--color-indigo)"
            trend={trends.orders}
            target={targets.orders}
            lang={lang}
            hasPermission={hasPermission}
            onClick={goToFinance}
            help={isAr ? 'عدد كل الطلبات المعترف بها في الفترة المحددة.' : 'Count of all recognized orders in the selected period.'}
            delay={500}
          />
          <MetricCard
            label={t.avg_ticket}
            value={fmtMoney(totals.avgTicket)}
            subValue={currencySymbol}
            icon={TrendingUp}
            color="var(--color-amber)"
            trend={trends.avgTicket}
            lang={lang}
            hasPermission={hasPermission}
            onClick={goToFinance}
            help={isAr ? 'متوسط قيمة الطلب = إجمالي المبيعات ÷ عدد الطلبات.' : 'Average ticket = gross sales divided by order count.'}
            delay={600}
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
            help={isAr ? 'عدد الموظفين النشطين حاليًا مقارنة بإجمالي الموظفين المحملين.' : 'Currently active employees compared with all loaded employees.'}
            delay={700}
          />
          <MetricCard
            label={isAr ? 'الطلبات الملغاة / قيمتها' : 'Cancelled / Value'}
            value={`${totals.cancelled} / ${fmtMoney(totals.cancelledValue)}`}
            subValue={currencySymbol}
            icon={Ban}
            color="#ef4444"
            lang={lang}
            hasPermission={hasPermission}
            permission={AppPermission.DATA_VIEW_REVENUE}
            onClick={goToFinance}
            help={isAr ? 'عدد الطلبات الملغاة وقيمتها خلال الفترة المحددة.' : 'Cancelled order count and their value in the selected period.'}
            delay={800}
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
                <DashboardHelp text={isAr ? 'رصيد النقد المتوقع في الورديات المفتوحة: رصيد بداية الوردية مضافًا إليه المدفوعات النقدية المكتملة المرتبطة بها.' : 'Expected cash in open shifts: opening balance plus completed cash payments linked to those shifts.'} label={isAr ? 'شرح خزينة الورديات' : 'Explain live shift cash'} />
              </h3>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <p className={`text-3xl font-black tabular-nums flex items-end gap-1 ${activeShifts.length > 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                  {fmtMoney(activeCashTotal)} <span className="text-sm pb-1">{currencySymbol}</span>
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
            <h3 className="flex items-center gap-2 text-xl font-black text-main tracking-tight">{t.sales_trends_comparison}<DashboardHelp text={isAr ? 'يقارن اتجاه الإيراد بين الأيام أو الفترات المحددة والفترة السابقة.' : 'Compares revenue direction across the selected period and the comparison period.'} label={isAr ? 'شرح اتجاه المبيعات' : 'Explain sales trend'} /></h3>
                <p className="text-xs text-muted font-bold mt-1">{t.comparison_desc}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="text-[10px] font-black uppercase text-muted">{t.current}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-muted/40" />
                  <span className="text-[10px] font-black uppercase text-muted">{comparisonLabel}</span>
                </div>
              </div>
            </div>

            <Suspense fallback={<div className="w-full h-[400px] mt-4 rounded-2xl bg-elevated/30 animate-pulse" aria-label={t.loading} />}>
              <RevenueTrendChart data={chartData} comparisonLabel={comparisonLabel} currentLabel={t.current} />
            </Suspense>
          </div>

          {/* AI Revenue Forecast */}
          <Suspense fallback={<div className="glass-1 h-[400px] animate-pulse rounded-[2rem]" />}>
            <RevenueForecastWidget />
          </Suspense>
        </div>

        {/* ZONE 2 — Where is it heading? Dayparts, peak hours, why revenue moved. */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8 animate-in slide-in-from-bottom-8 fade-in duration-700" aria-label={isAr ? 'اتجاهات التشغيل' : 'Operational trends'}>
          <div className="bg-card/60 border border-border/30 rounded-[2rem] p-6 lg:p-8 shadow-xl">
            <h3 className="flex items-center gap-2 text-xl font-black text-main tracking-tight">{isAr ? 'الفترات (Dayparts)' : 'Dayparts'}<DashboardHelp text={isAr ? 'توزيع المبيعات والطلبات حسب فترة اليوم مثل الصباح والظهر والمساء.' : 'Sales and order distribution by parts of the day such as morning, afternoon and evening.'} label={isAr ? 'شرح فترات اليوم' : 'Explain dayparts'} /></h3>
            <p className="text-xs text-muted font-bold mt-1">{isAr ? 'أي فترة شايلة اليوم؟' : 'Which part of the day carries revenue?'}</p>
            <div className="w-full h-[260px] mt-4">
              {daypartData.length > 0 ? (
                <Suspense fallback={<div className="h-full w-full rounded-2xl bg-elevated/30 animate-pulse" aria-label={t.loading} />}>
                  <DaypartChart data={daypartData} revenueLabel={isAr ? 'الإيراد' : 'Revenue'} />
                </Suspense>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-muted border border-dashed border-border/40 rounded-2xl bg-card/20">
                  <p className="text-xs font-bold">{isAr ? 'لا توجد بيانات فترات بعد' : 'No daypart data yet'}</p>
                </div>
              )}
            </div>
            {daypartData.length > 0 && (
              <div className="mt-4 space-y-2">
                {daypartData.slice(0, 4).map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs font-bold">
                    <span className="text-main flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />{d.name}</span>
                    <span className="text-muted tabular-nums">{d.orderCount} • {fmtMoney(Number(d.revenue) || 0)} {currencySymbol}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card/60 border border-border/30 rounded-[2rem] p-6 lg:p-8 shadow-xl">
            <h3 className="flex items-center gap-2 text-xl font-black text-main tracking-tight">{isAr ? 'خريطة الذروة' : 'Peak map'}<DashboardHelp text={isAr ? 'توضح الأيام والساعات التي تحتوي على أكبر عدد من الطلبات.' : 'Shows the days and hours with the highest order volume.'} label={isAr ? 'شرح خريطة الذروة' : 'Explain peak map'} /></h3>
            <p className="text-xs text-muted font-bold mt-1">{viewScope === 'DAILY' ? (isAr ? 'المبيعات ساعة بساعة اليوم' : 'Hour-by-hour today') : (isAr ? 'الكثافة: يوم × ساعة' : 'Density: day × hour')}</p>
            {viewScope === 'DAILY' ? (
              <div className="w-full h-[260px] mt-4">
                {hourlyData.length > 0 ? (
                  <Suspense fallback={<div className="h-full w-full rounded-2xl bg-elevated/30 animate-pulse" aria-label={t.loading} />}>
                    <HourlyChart data={hourlyData} revenueLabel={isAr ? 'الإيراد' : 'Revenue'} />
                  </Suspense>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-muted border border-dashed border-border/40 rounded-2xl bg-card/20">
                    <p className="text-xs font-bold">{isAr ? 'لا توجد مبيعات ساعية بعد' : 'No hourly sales yet'}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto" dir="ltr">
                <div className="min-w-[420px] space-y-1">
                  {(isAr ? ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'] : ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']).map((dayName, d) => (
                    <div key={d} className="flex items-center gap-1">
                      <span className="w-10 shrink-0 text-[9px] font-black text-muted uppercase">{dayName}</span>
                      <div className="grid flex-1 grid-cols-24 gap-[2px]" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                        {heatMatrix.rows[d].map((v, h) => (
                          <div key={h} title={`${dayName} ${h}:00 — ${v}`} className="h-5 rounded-[4px] border border-border/10 bg-emerald-500" style={{ opacity: v <= 0 ? 0.06 : 0.15 + (0.85 * v) / heatMatrix.max }} />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-1 pt-1">
                    <span className="w-10 shrink-0" />
                    <div className="flex flex-1 justify-between text-[8px] font-bold text-muted"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-card/60 border border-border/30 rounded-[2rem] p-6 lg:p-8 shadow-xl">
            <h3 className="flex items-center gap-2 text-xl font-black text-main tracking-tight">{isAr ? 'ليه اتغيرنا؟' : 'Why did we move?'}<DashboardHelp text={isAr ? 'يوضح الفرق بين إيراد الفترة الحالية والسابقة، ويقسم التغير إلى حجم الطلبات والخصومات والإلغاءات وباقي العوامل.' : 'Explains the difference between current and previous revenue by separating order volume, discounts, cancellations and other factors.'} label={isAr ? 'شرح تغير الإيراد' : 'Explain revenue movement'} /></h3>
            <p className="text-xs text-muted font-bold mt-1">{isAr ? 'تفكيك فرق الإيراد عن الفترة السابقة' : 'Revenue bridge vs previous period'}</p>
            <div className="mt-5 space-y-3">
              {waterfall.map((s, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-[11px] font-black mb-1">
                    <span className={s.total ? 'text-main uppercase tracking-widest' : 'text-muted'}>{s.label}</span>
                    <span className={`tabular-nums ${s.total ? 'text-main' : s.value >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{s.total ? fmtMoney(s.value) : `${s.value >= 0 ? '+' : '−'}${fmtMoney(Math.abs(s.value))}`}</span>
                  </div>
                  {!s.total && (
                    <div className="h-2 w-full overflow-hidden rounded-full bg-elevated/60">
                      <div className={`h-full rounded-full ${s.value >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, (Math.abs(s.value) / maxWaterfall) * 100)}%` }} />
                    </div>
                  )}
                  {s.total && i === waterfall.length - 1 && <div className="mt-1 h-[2px] w-full rounded bg-primary/40" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ?? Row 4: Team, Top Items & Sources ?? */}
        <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8 animate-in slide-in-from-bottom-8 fade-in duration-700" style={{ animationDelay: '900ms', animationFillMode: 'both'}}>
            {/* Top Employees */}
            <div className="bg-card/60  border border-border/30 rounded-[2rem] p-6 lg:p-8 shadow-xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-main tracking-tight flex items-center gap-3">
                  <Trophy className="text-yellow-500" />
                  {t.top_staff}
                  <DashboardHelp text={isAr ? 'الموظفون الأكثر ارتباطًا بالطلبات والإيراد خلال الفترة المحددة.' : 'Staff members associated with the most orders and revenue in the selected period.'} label={isAr ? 'شرح أفضل الموظفين' : 'Explain top staff'} />
                </h3>
                <button className="text-[10px] font-black uppercase text-primary hover:underline" onClick={goToHR}>{t.view_all}</button>
              </div>
              <div className="space-y-4">
                {productiveStaff.length > 0 ? productiveStaff.map((row: any, i: number) => {
                  const empName = (employees.find((e: any) => e.id === row.userId)?.name) || row.userId || (isAr ? 'موظف' : 'Staff');
                  return (
                    <div key={row.userId || i} className="group flex items-center gap-4 p-4 rounded-[1.25rem] bg-elevated/30 border border-border/20 hover:bg-elevated/60 transition-all">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center font-black text-primary border border-primary/20">
                          {String(empName).trim().charAt(0) || '?'}
                        </div>
                        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-card border-2 border-primary text-[10px] font-black flex items-center justify-center text-main shadow-lg">
                          #{i + 1}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-black text-main truncate px-2">{empName}</h4>
                        <p className="text-[10px] font-bold text-muted px-2">{Number(row.orderCount) || 0} {isAr ? 'طلب' : 'orders'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-emerald-500 tabular-nums">{fmtMoney(Number(row.revenue) || 0)} <span className="text-[10px]">{currencySymbol}</span></p>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="flex flex-col items-center justify-center p-6 text-muted border border-dashed border-border/40 rounded-xl bg-card/20">
                    <UserCheck size={24} className="text-emerald-500/20 mb-2" />
                    <p className="text-xs font-bold text-center">{isAr ? 'لا توجد مبيعات مسجلة لموظفين في هذه الفترة' : 'No employee sales recorded in this period'}</p>
                    <p className="mt-1 text-[10px] font-bold text-muted text-center">{isAr ? 'تأكد من ربط الطلبات بالكاشير في الـ POS' : 'Make sure POS orders are linked to the cashier'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Trending Items Today */}
            <div className="bg-card/60 border border-border/30 rounded-[2rem] p-6 lg:p-8 shadow-xl">
              <h3 className="text-xl font-black text-main tracking-tight mb-8 flex items-center gap-3">
                <Flame className="text-orange-500" />
                {t.trending_items}
                <DashboardHelp text={isAr ? 'الأصناف الأكثر طلبًا حسب عدد الوحدات المباعة خلال الفترة المحددة.' : 'The most ordered items by units sold in the selected period.'} label={isAr ? 'شرح الأصناف الأكثر مبيعًا' : 'Explain trending items'} />
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
              <h3 className="mb-8 flex items-center gap-2 text-xl font-black text-main tracking-tight">{t.order_source_distribution}<DashboardHelp text={isAr ? 'نسبة الطلبات حسب القناة: صالة، تيك أواي، دليفري أو مصدر خارجي.' : 'Order share by channel: dine-in, takeaway, delivery or an external source.'} label={isAr ? 'شرح مصادر الطلبات' : 'Explain order sources'} /></h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="h-[250px]">
                  {orderTypePercentData.length > 0 ? (
                    <Suspense fallback={<div className="h-full w-full rounded-2xl bg-elevated/30 animate-pulse" aria-label={t.loading} />}>
                      <OrderSourceChart data={orderTypePercentData} />
                    </Suspense>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-muted border border-dashed border-border/40 rounded-2xl bg-card/20">
                      <ShoppingBag size={24} className="text-muted/30 mb-2" />
                      <p className="text-xs font-bold text-center px-4">{isAr ? 'لا توجد طلبات في هذه الفترة' : 'No orders in this period'}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  {orderTypePercentData.length > 0 ? orderTypePercentData.map((item, i) => (
                    <div key={`${item.name || i}-${i}`} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-xs font-black text-main uppercase tracking-widest">{item.name}</span>
                      </div>
                      <span className="text-sm font-black text-muted tabular-nums">{item.value}%</span>
                    </div>
                  )) : (
                    <p className="text-[11px] font-bold text-muted text-center">{isAr ? 'ستظهر توزيعات أنواع الطلبات هنا.' : 'Order type distribution will appear here.'}</p>
                  )}
                </div>
              </div>
            </div>
        </section>

        {/* ZONE 3 — What needs action? Payments, slow items, branches, cash variance. */}
        <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-8 animate-in slide-in-from-bottom-8 fade-in duration-700" aria-label={isAr ? 'تفاصيل تحتاج تدخل' : 'Details needing action'}>
          <div className="bg-card/60 border border-border/30 rounded-[2rem] p-6 shadow-xl">
              <h3 className="flex items-center gap-2 text-lg font-black text-main tracking-tight">{isAr ? 'مبيعات كل طريقة دفع' : 'Sales by payment method'} <DashboardHelp text={isAr ? 'القيمة هنا مأخوذة من سجلات المدفوعات المكتملة خلال الفترة. النسبة هي حصة كل طريقة من إجمالي المدفوعات.' : 'Values come from completed payment records in the selected period. The percentage is each method’s share of total payments.'} label={isAr ? 'شرح مزيج المدفوعات' : 'Explain payment mix'} /></h3>
            {paymentMix.length > 0 ? (
              <div className="mt-4 space-y-3">
                {paymentMix.slice(0, 5).map((p, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-[11px] font-black mb-1">
                      <span className="min-w-0 truncate text-main flex items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-elevated/50" style={{ color: COLORS[i % COLORS.length] }}><PaymentMethodIcon method={p.name} /></span><span className="truncate">{paymentLabel(p.name)}</span><DashboardHelp text={isAr ? `إجمالي المدفوعات المكتملة بطريقة ${paymentLabel(p.name)} خلال الفترة المحددة، مع نسبتها من إجمالي المدفوعات.` : `Completed payments using ${paymentLabel(p.name)} in the selected period, with its share of total payments.`} label={isAr ? `شرح ${paymentLabel(p.name)}` : `Explain ${paymentLabel(p.name)}`} /></span>
                      <span className="shrink-0 text-muted tabular-nums">{fmtMoney(p.amount)} {currencySymbol} · {p.value}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated/60">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, p.value)}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[11px] font-bold text-muted">{isAr ? 'لا توجد مدفوعات في هذه الفترة' : 'No payments in this period'}</p>
            )}
          </div>

          <div className="bg-card/60 border border-border/30 rounded-[2rem] p-6 shadow-xl">
            <h3 className="flex items-center gap-2 text-lg font-black text-main tracking-tight">{isAr ? 'أصناف تحتاج قرار' : 'Items needing a call'}<DashboardHelp text={isAr ? 'الأصناف الأقل حركة خلال الفترة مع بيانات الهامش لمساعدتك في قرار التسعير أو الإيقاف.' : 'Slowest-moving items in the period with margin data to guide pricing or menu decisions.'} label={isAr ? 'شرح الأصناف البطيئة' : 'Explain slow items'} /></h3>
            <p className="text-[11px] text-muted font-bold mt-1">{isAr ? 'الأبطأ حركة + الهامش' : 'Slowest movers + margin'}</p>
            {slowItems.length > 0 ? (
              <div className="mt-4 space-y-3">
                {slowItems.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-black text-main truncate">{s.itemName}</span>
                    <span className="shrink-0 font-bold text-muted tabular-nums">{Number(s.qtySold) || 0} • <span className={Number(s.marginPercent) >= 0 ? 'text-emerald-500' : 'text-rose-500'}>{Number(s.marginPercent || 0).toFixed(0)}%</span></span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[11px] font-bold text-muted">{isAr ? 'لا توجد بيانات أصناف بعد' : 'No item data yet'}</p>
            )}
            <button type="button" onClick={() => navigate('/reports')} className="mt-4 text-[10px] font-black uppercase tracking-widest text-primary hover:underline">{isAr ? 'هندسة المنيو الكاملة' : 'Full menu engineering'}</button>
          </div>

          <div className="bg-card/60 border border-border/30 rounded-[2rem] p-6 shadow-xl">
            <h3 className="flex items-center gap-2 text-lg font-black text-main tracking-tight">{isAr ? 'أداء الفروع' : 'Branch performance'}<DashboardHelp text={isAr ? 'مقارنة عدد الطلبات والإيراد بين الفروع خلال نفس الفترة.' : 'Compares order count and revenue across branches for the same period.'} label={isAr ? 'شرح أداء الفروع' : 'Explain branch performance'} /></h3>
            {branchPerfRows.length > 0 ? (
              <div className="mt-4 space-y-3">
                {branchPerfRows.slice(0, 5).map((b, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-black text-main truncate">{b.branchName || b.branchId}</span>
                    <span className="shrink-0 font-bold text-muted tabular-nums">{b.orders} • {fmtMoney(Number(b.revenue) || 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[11px] font-bold text-muted">{isAr ? 'فرع واحد — لا مقارنة متاحة' : 'Single branch — nothing to compare'}</p>
            )}
            {newVsReturning && (
              <div className="mt-4 rounded-xl border border-border/20 bg-elevated/30 p-3 text-[11px] font-bold text-muted">
                {isAr ? `جدد: ${newVsReturning.new?.orders || 0} طلب • راجعون: ${newVsReturning.returning?.orders || 0} طلب` : `New: ${newVsReturning.new?.orders || 0} orders • Returning: ${newVsReturning.returning?.orders || 0}`}
              </div>
            )}
          </div>

          <div className="bg-card/60 border border-border/30 rounded-[2rem] p-6 shadow-xl">
            <h3 className="flex items-center gap-2 text-lg font-black text-main tracking-tight">{isAr ? 'فروقات الكاش (شيفتات)' : 'Cash variance (shifts)'}<DashboardHelp text={isAr ? 'الفرق بين النقد المتوقع والنقد الفعلي المسجل عند إغلاق الوردية.' : 'Difference between expected cash and the amount counted when a shift is closed.'} label={isAr ? 'شرح فروقات الكاش' : 'Explain cash variance'} /></h3>
            {shiftVariance.length > 0 ? (
              <div className="mt-4 space-y-3">
                {shiftVariance.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-black text-main truncate">{s.user}</span>
                    <span className={`shrink-0 font-black tabular-nums ${s.variance === 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{s.variance === 0 ? '✓ 0' : `${s.variance > 0 ? '+' : '−'}${fmtMoney(Math.abs(s.variance))}`}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[11px] font-bold text-muted">{isAr ? 'لا توجد شيفتات في هذه الفترة' : 'No shifts in this period'}</p>
            )}
            <button type="button" onClick={() => navigate('/day-close')} className="mt-4 text-[10px] font-black uppercase tracking-widest text-primary hover:underline">{isAr ? 'مراجعة الشيفتات' : 'Review shifts'}</button>
          </div>
        </section>

        {/* ?? Row 5: Real-time Operational Live Monitoring ?? */}
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8 min-h-[500px] animate-in slide-in-from-bottom-8 fade-in duration-700" style={{ animationDelay: '1000ms', animationFillMode: 'both'}}>
          <div className="theme-card overflow-hidden flex flex-col p-8 bg-card/60 backdrop-blur-md rounded-[2rem] shadow-xl">
             <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-main tracking-tight flex items-center gap-3">
                 <Flame className="text-rose-500" />
                 {t.live_kitchen_monitor}
                 <DashboardHelp text={isAr ? 'حالة أداء المطبخ والطلبات التي تحتاج متابعة الآن.' : 'Current kitchen performance and orders that need attention.'} label={isAr ? 'شرح أداء المطبخ' : 'Explain kitchen performance'} />
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
               <DashboardHelp text={isAr ? 'متابعة حالة التوصيل والطلبات الموجودة في مراحل التسليم المختلفة.' : 'Delivery status and orders currently moving through delivery stages.'} label={isAr ? 'شرح التوصيل' : 'Explain delivery logistics'} />
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
