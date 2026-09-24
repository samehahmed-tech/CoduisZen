import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, Package } from 'lucide-react';

export const dateOnly = (date = new Date()) => date.toISOString().split('T')[0];

export const MOVEMENT_TYPE_META: Record<string, { ar: string; en: string; badge: string; dot: string }> = {
  PURCHASE: { ar: 'شراء', en: 'Purchase', badge: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25', dot: 'bg-emerald-500' },
  SALE_CONSUMPTION: { ar: 'صرف مبيعات', en: 'Sales Use', badge: 'text-rose-500 bg-rose-500/10 border-rose-500/25', dot: 'bg-rose-500' },
  SALE: { ar: 'بيع مباشر', en: 'Sale', badge: 'text-orange-500 bg-orange-500/10 border-orange-500/25', dot: 'bg-orange-500' },
  TRANSFER: { ar: 'تحويل مخزن', en: 'Transfer', badge: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/25', dot: 'bg-indigo-500' },
  WASTE: { ar: 'هدر / تالف', en: 'Waste', badge: 'text-red-500 bg-red-500/10 border-red-500/25', dot: 'bg-red-500' },
  ADJUSTMENT: { ar: 'تسوية جرد', en: 'Adjustment', badge: 'text-amber-500 bg-amber-500/10 border-amber-500/25', dot: 'bg-amber-500' },
  PRODUCTION_CONSUMPTION: { ar: 'صرف إنتاج', en: 'Production Use', badge: 'text-violet-500 bg-violet-500/10 border-violet-500/25', dot: 'bg-violet-500' },
  PRODUCTION: { ar: 'إنتاج تلقائي', en: 'Auto Production', badge: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/25', dot: 'bg-cyan-500' },
};

/* ── Page shell: ambient background + content column, shared by every
   inventory page so the module feels like one designed system. ── */
export const InvPageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative min-h-screen bg-app overflow-hidden selection:bg-emerald-500/30">
    <div className="fixed inset-0 pointer-events-none z-0">
      <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-emerald-500/5 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-teal-500/5 blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
    </div>
    <div className="relative z-10 p-4 lg:p-10 space-y-8 max-w-[1920px] mx-auto overflow-y-auto max-h-screen custom-scrollbar pb-32">
      {children}
    </div>
  </div>
);

const HEADER_ACCENTS: Record<string, { tile: string; hover: string }> = {
  emerald: { tile: 'from-emerald-600 to-teal-600 shadow-emerald-600/20', hover: 'hover:text-emerald-500' },
  indigo: { tile: 'from-indigo-600 to-purple-600 shadow-indigo-600/20', hover: 'hover:text-indigo-400' },
  violet: { tile: 'from-violet-600 to-purple-600 shadow-violet-600/20', hover: 'hover:text-violet-400' },
  sky: { tile: 'from-sky-600 to-cyan-600 shadow-sky-600/20', hover: 'hover:text-sky-400' },
  rose: { tile: 'from-rose-600 to-red-600 shadow-rose-600/20', hover: 'hover:text-rose-400' },
  amber: { tile: 'from-amber-600 to-orange-600 shadow-amber-600/20', hover: 'hover:text-amber-400' },
  cyan: { tile: 'from-cyan-600 to-blue-600 shadow-cyan-600/20', hover: 'hover:text-cyan-400' },
};

/* ── Page header: back link + icon tile + title/subtitle + action buttons. ── */
export const InvPageHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent?: keyof typeof HEADER_ACCENTS;
  actions?: React.ReactNode;
  backTo?: string;
  backLabel?: string;
}> = ({ icon, title, subtitle, accent = 'emerald', actions, backTo = '/inventory', backLabel }) => {
  const scheme = HEADER_ACCENTS[accent] || HEADER_ACCENTS.emerald;
  return (
  <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 pb-6 border-b border-border/20">
    <div className="space-y-4">
      <Link
        to={backTo}
        className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-muted transition-colors ${scheme.hover}`}
      >
        <ChevronLeft size={13} className="rtl:rotate-180" />
        {backLabel || backTo}
      </Link>
      <div className="flex items-center gap-5">
        <div className={`w-16 h-16 rounded-[1.4rem] bg-gradient-to-br ${scheme.tile} p-0.5 shadow-2xl`}>
          <div className="w-full h-full rounded-[1.25rem] bg-card flex items-center justify-center">
            {icon}
          </div>
        </div>
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-main tracking-tighter uppercase">{title}</h1>
          <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] mt-2 opacity-60">{subtitle}</p>
        </div>
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
  </header>
  );
};

/* ── KPI stat card (moved verbatim from the legacy hub). ── */
export const InvStat: React.FC<{
  label: string;
  value: any;
  subValue?: string;
  icon: any;
  color: string;
  lang: string;
}> = ({ label, value, subValue, icon: Icon, color, lang }) => (
  <div className="relative group overflow-hidden bg-card/60 border border-border/30 rounded-[1.5rem] p-5 lg:p-6 transition-all hover:scale-[1.02] hover:bg-card/70 hover:shadow-2xl hover:shadow-black/5 active:scale-[0.98]">
    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br transition-opacity duration-150 opacity-20 group-hover:opacity-30 blur-3xl" style={{ background: color }} />
    <div className="flex items-start justify-between relative z-10">
      <div>
        <p className="text-[10px] lg:text-[11px] font-black uppercase tracking-[0.15em] text-muted mb-2">{label}</p>
        <h2 className="text-xl lg:text-3xl font-black text-main tracking-tighter tabular-nums flex items-end gap-1.5">
          {value}
          {subValue && <span className="text-xs font-bold text-muted mb-1 opacity-60">{subValue}</span>}
        </h2>
      </div>
      <div className="p-4 rounded-2xl border flex items-center justify-center shadow-lg transition-transform duration-150 group-hover:rotate-12" style={{ borderColor: `${color}30`, backgroundColor: `${color}15`, color }}>
        <Icon size={24} />
      </div>
    </div>
  </div>
);

/* ── Empty state + inline error banner. ── */
export const InvEmpty: React.FC<{ title: string; hint?: string; action?: React.ReactNode }> = ({ title, hint, action }) => (
  <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 px-5 text-center">
    <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
      <Package size={34} />
    </div>
    <div>
      <h3 className="text-xl font-black text-main">{title}</h3>
      {hint && <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-relaxed text-muted">{hint}</p>}
    </div>
    {action && <div className="flex flex-wrap justify-center gap-3">{action}</div>}
  </div>
);

export const InvError: React.FC<{ message: string; onDismiss: () => void; dismissLabel: string }> = ({ message, onDismiss, dismissLabel }) => (
  <div className="flex items-start justify-between gap-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-rose-500 shadow-lg">
    <div className="flex items-start gap-3">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <p className="text-xs font-black uppercase tracking-widest leading-relaxed">{message}</p>
    </div>
    <button
      type="button"
      onClick={onDismiss}
      className="rounded-xl bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20"
    >
      {dismissLabel}
    </button>
  </div>
);
