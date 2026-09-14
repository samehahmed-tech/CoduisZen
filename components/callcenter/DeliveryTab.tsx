import React from 'react';
import { Bike, AlertTriangle, Eye, Phone, MapPin, Clock3 } from 'lucide-react';

/**
 * Live delivery pipeline across ALL branches (any source).
 * The call center holds no stock and only distributes/monitors orders,
 * so this board shows every active delivery with driver + lateness.
 */
export const DeliveryTab = ({ state }: any) => {
    const {
        lang, activeDeliveries, branches, selectedBranch, setSelectedBranch,
        isLoading, load, createEscalation, escalatingOrderId, escalatedOrderIds,
        setOrderDetailId, getOrderStatus, getOrderTotal, fmtMoney, fmtMins,
        getCustomerName, getCustomerPhone, getDeliveryAddress, getOrderNumber,
    } = state;
    const tr = (ar: string, en: string) => lang === 'ar' ? ar : en;

    const late = activeDeliveries.filter((d: any) => d.isLate).length;
    const atRisk = activeDeliveries.filter((d: any) => d.isAtRisk).length;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl p-4 border border-slate-100 dark:border-slate-800 bg-indigo-50 dark:bg-indigo-950/30 text-center">
                    <div className="text-xl font-black text-indigo-600">{activeDeliveries.length}</div>
                    <div className="text-[10px] font-bold text-slate-400">{tr('دليفري نشط', 'Active deliveries')}</div>
                </div>
                <div className="rounded-2xl p-4 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-center">
                    <div className="text-xl font-black text-amber-600">{atRisk}</div>
                    <div className="text-[10px] font-bold text-slate-400">{tr('معرض للتأخير +30', 'At risk 30m+')}</div>
                </div>
                <div className="rounded-2xl p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-center">
                    <div className="text-xl font-black text-red-600">{late}</div>
                    <div className="text-[10px] font-bold text-slate-400">{tr('متأخر +45', 'Late 45m+')}</div>
                </div>
            </div>

            <div className="card-primary rounded-2xl p-4">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-2">
                        <Bike size={14} /> {tr('خط الدليفري الحي — كل الفروع', 'Live delivery pipeline — all branches')}
                    </h2>
                    <div className="flex items-center gap-2">
                        <select value={selectedBranch} onChange={(e: any) => setSelectedBranch(e.target.value)} className="bg-card border border-border/60 px-3 py-1.5 rounded-lg text-[11px] font-bold text-main outline-none cursor-pointer">
                            <option value="">{tr('كل الفروع', 'All branches')}</option>
                            {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <button onClick={() => load(true)} disabled={isLoading} className="px-4 py-1.5 rounded-lg bg-primary text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-60">
                            {tr('تحديث', 'Refresh')}
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    {activeDeliveries.map((d: any) => {
                        const o = d.order;
                        const escalated = escalatedOrderIds?.has(String(o.id || ''));
                        return (
                            <div key={String(o.id)} className={`p-3.5 rounded-xl border transition ${d.isLate ? 'border-red-300 bg-red-50/50 dark:bg-red-950/10 dark:border-red-800' : d.isAtRisk ? 'border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 dark:border-amber-800' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shrink-0 ${d.isLate ? 'bg-red-600 text-white animate-pulse' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'}`}>
                                            {getOrderStatus(o)}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="text-xs font-black">#{getOrderNumber(o)} • {d.branchName}</div>
                                            <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                                                <MapPin size={10} /> {getDeliveryAddress(o)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-[11px] font-bold">
                                        <span className="flex items-center gap-1 text-slate-500"><Phone size={11} /> {getCustomerPhone(o) || getCustomerName(o)}</span>
                                        {d.driverName && <span className="flex items-center gap-1 text-teal-600"><Bike size={11} /> {d.driverName}</span>}
                                        <span className={`flex items-center gap-1 ${d.isLate ? 'text-red-600 font-black' : d.isAtRisk ? 'text-amber-600' : 'text-slate-500'}`}>
                                            <Clock3 size={11} /> {fmtMins(d.mins)}
                                            {d.isLate && <span>⚠️</span>}
                                        </span>
                                        <span className="text-primary font-black">{fmtMoney(getOrderTotal(o))}</span>
                                        <button onClick={() => setOrderDetailId(String(o.id))} className="p-1.5 rounded-lg border border-border/50 hover:bg-elevated text-muted hover:text-main" title={tr('عرض', 'View')}>
                                            <Eye size={13} />
                                        </button>
                                        {!escalated && d.isLate && (
                                            <button onClick={() => createEscalation(o)} disabled={escalatingOrderId === String(o.id)} className="px-3 py-1.5 rounded-lg bg-danger text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-60 flex items-center gap-1">
                                                <AlertTriangle size={11} /> {tr('تصعيد', 'Escalate')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {activeDeliveries.length === 0 && (
                        <div className="py-10 text-center text-xs font-bold text-slate-400">
                            {tr('لا توجد توصيلات نشطة حالياً في النطاق المختار', 'No active deliveries in the selected scope')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
