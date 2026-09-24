import React, { useState } from 'react';
import { Check, Loader2, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { useTheme } from '../theme/useTheme';

const InteractionShowcase: React.FC = () => {
  const { config } = useTheme();
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<'pending' | 'preparing' | 'ready'>('pending');

  return (
    <main className="theme-container mx-auto max-w-7xl space-y-6" data-interaction="standard">
      <header className="theme-card p-6" data-interaction="lift">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-muted">Xen UI system</p>
            <h1 className="mt-2 text-2xl font-black text-main">Interaction showcase</h1>
            <p className="mt-1 text-sm text-muted">{config.name}: {config.description}</p>
          </div>
          <span className="rounded-full border border-border/30 bg-elevated/50 px-3 py-1 text-xs font-bold text-muted">{config.motion.style}</span>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="theme-card space-y-3 p-5">
          <h2 className="font-black text-main">Buttons</h2>
          <div className="flex flex-wrap gap-2">
            <button className="theme-btn theme-btn-primary" data-interaction="press lift" onClick={() => setSaved(true)}>
              {saved ? <Check size={16} /> : <Plus size={16} />} {saved ? 'Saved' : 'Save'}
            </button>
            <button className="theme-btn theme-btn-secondary" data-interaction="press"><RefreshCw size={16} /> Refresh</button>
            <button className="theme-btn theme-btn-ghost" data-interaction="press">Cancel</button>
          </div>
        </div>

        <div className="theme-card space-y-3 p-5" data-interaction="lift reveal">
          <h2 className="font-black text-main">Card reveal</h2>
          <p className="text-sm text-muted">Actions appear on hover or keyboard focus.</p>
          <div data-reveal-target className="flex gap-2">
            <button className="theme-btn theme-btn-secondary text-xs">Open</button>
            <button className="theme-btn theme-btn-ghost text-xs">Archive</button>
          </div>
        </div>

        <div className="theme-card space-y-3 p-5">
          <h2 className="font-black text-main">Input states</h2>
          <input className="theme-input w-full" placeholder="Search orders" aria-label="Search orders" />
          <input className="theme-input w-full border-danger/50" value="Invalid value" readOnly aria-invalid="true" />
        </div>
      </section>

      <section className="theme-card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-black text-main">Business status</h2>
          <div className="flex gap-2">
            {(['pending', 'preparing', 'ready'] as const).map((value) => (
              <button key={value} className={`theme-btn text-xs ${status === value ? 'theme-btn-primary' : 'theme-btn-secondary'}`} onClick={() => setStatus(value)}>{value}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/20 bg-elevated/30 p-4" data-status={status}>
          <span data-status-indicator className="h-3 w-3 rounded-full bg-warning" />
          <span className="font-bold capitalize text-main">{status}</span>
          {status === 'preparing' && <Loader2 className="animate-spin text-primary" size={16} />}
          {status === 'ready' && <Sparkles className="text-success" size={16} />}
        </div>
      </section>

      <section className="theme-card overflow-hidden">
        <div className="border-b border-border/20 p-5"><h2 className="font-black text-main">Table feedback</h2></div>
        <table className="theme-table"><thead><tr><th>Order</th><th>Status</th><th>Total</th></tr></thead><tbody>
          {['#1048', '#1049', '#1050'].map((order, index) => <tr className="theme-table-row" key={order}><td>{order}</td><td><span className="rounded-full bg-success/10 px-2 py-1 text-xs font-bold text-success">{index === 1 ? 'Preparing' : 'Ready'}</span></td><td>{(24 + index * 11).toFixed(2)}</td></tr>)}
        </tbody></table>
      </section>
    </main>
  );
};

export default InteractionShowcase;
