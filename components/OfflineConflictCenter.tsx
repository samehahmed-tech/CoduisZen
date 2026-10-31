import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleX, Clock3, CloudOff, GitMerge, RefreshCw, Trash2 } from 'lucide-react';
import { localDb, SyncQueueItem } from '../src/db/localDb';
import { isQueueItemForBranch } from '../src/services/syncQueueUtils';
import { syncService } from '../src/services/syncService';
import { useAuthStore } from '../stores/useAuthStore';

const OfflineConflictCenter: React.FC = () => {
    const { settings } = useAuthStore();
    const isAr = (settings.language || 'en') === 'ar';
    const [items, setItems] = useState<SyncQueueItem[]>([]);
    const [queueStats, setQueueStats] = useState({ total: 0, pending: 0, failed: 0, conflicts: 0, synced: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const activeBranchId = String(settings.activeBranchId || '').trim();

    const loadConflicts = useCallback(async () => {
        try {
            const [all, stats] = await Promise.all([
                localDb.syncQueue.toArray(),
                syncService.getQueueStats(),
            ]);
            setItems(all
                .filter((item) => item.status !== 'SYNCED' && isQueueItemForBranch(item.branchId, activeBranchId))
                .sort((a, b) => Number(b.conflict?.detectedAt || b.updatedAt || 0) - Number(a.conflict?.detectedAt || a.updatedAt || 0)));
            setQueueStats(stats);
        } finally {
            setIsLoading(false);
        }
    }, [activeBranchId]);

    useEffect(() => {
        void loadConflicts();
        const timer = window.setInterval(() => void loadConflicts(), 10_000);
        return () => window.clearInterval(timer);
    }, [loadConflicts]);

    const summary = useMemo(() => ({
        total: items.length,
        entities: new Set(items.map((item) => item.entity)).size,
    }), [items]);

    const resolve = async (id: string, resolution: 'RETRY' | 'DISCARD' | 'MERGE') => {
        setBusyId(id);
        try {
            await syncService.resolveConflict(id, resolution);
            await loadConflicts();
        } finally {
            setBusyId(null);
        }
    };

    const retryFailed = async (id: string) => {
        setBusyId(id);
        try {
            await syncService.retryFailed(id);
            await loadConflicts();
        } finally {
            setBusyId(null);
        }
    };

    return (
        <main className="min-h-screen bg-app px-4 py-6 text-main sm:px-6 lg:px-8" dir={isAr ? 'rtl' : 'ltr'}>
            <div className="mx-auto max-w-6xl space-y-6">
                <header className="flex flex-col gap-4 rounded-3xl border border-amber-500/20 bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-500" aria-hidden="true"><CloudOff size={26} /></div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight">{isAr ? 'مركز تعارضات المزامنة' : 'Offline Conflict Center'}</h1>
                            <p className="mt-1 text-sm text-muted">
                                {isAr ? 'راجع التعديلات التي اختلفت عن آخر نسخة على الخادم.' : 'Review offline changes that differ from the latest server state.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3 text-xs font-bold text-muted" aria-live="polite">
                        <span className="rounded-full border border-border px-3 py-2">{summary.total} {isAr ? 'تعارض' : 'conflicts'}</span>
                        <span className="rounded-full border border-border px-3 py-2">{summary.entities} {isAr ? 'وحدات' : 'entities'}</span>
                    </div>
                </header>

                <section aria-label={isAr ? 'حالة طابور المزامنة' : 'Sync queue health'} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <QueueHealthCard label={isAr ? 'بانتظار المزامنة' : 'Pending'} value={queueStats.pending} icon={<Clock3 size={17} aria-hidden="true" />} tone="amber" />
                    <QueueHealthCard label={isAr ? 'فشل قابل لإعادة المحاولة' : 'Retryable failures'} value={queueStats.failed} icon={<RefreshCw size={17} aria-hidden="true" />} tone="rose" />
                    <QueueHealthCard label={isAr ? 'تعارضات' : 'Conflicts'} value={queueStats.conflicts} icon={<CircleX size={17} aria-hidden="true" />} tone="orange" />
                    <QueueHealthCard label={isAr ? 'تمت مزامنته' : 'Synced'} value={queueStats.synced} icon={<CheckCircle2 size={17} aria-hidden="true" />} tone="emerald" />
                </section>

                {isLoading ? (
                    <div className="rounded-3xl border border-border bg-card p-10 text-center text-sm text-muted" role="status" aria-busy="true">
                        {isAr ? 'جاري تحميل التعارضات...' : 'Loading conflicts...'}
                    </div>
                ) : items.length === 0 ? (
                    <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-12 text-center" role="status">
                        <CheckCircle2 className="mx-auto text-emerald-500" size={42} aria-hidden="true" />
                        <h2 className="mt-4 text-lg font-black">{isAr ? 'لا توجد تعارضات' : 'No conflicts to review'}</h2>
                        <p className="mt-2 text-sm text-muted">{isAr ? 'طابور المزامنة يعمل بدون تعارضات.' : 'The sync queue is clear and consistent.'}</p>
                    </div>
                ) : (
                    <section className="space-y-4" aria-label={isAr ? 'قائمة التعارضات' : 'Conflict list'}>
                        {items.map((item) => {
                            const conflict = item.conflict;
                            const payloadId = item.payload?.id || item.payload?.order_id || item.payload?.key || item.id;
                            const isBusy = busyId === item.id;
                            return (
                                <article key={item.id} className="rounded-3xl border border-amber-500/20 bg-card p-5 shadow-sm">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="flex gap-3">
                                            <AlertTriangle className="mt-1 shrink-0 text-amber-500" size={21} aria-hidden="true" />
                                            <div>
                                                <h2 className="font-black">{item.entity} <span className="text-muted">/</span> {item.action} <span className="ml-2 rounded-full border border-border px-2 py-1 text-[10px] font-black text-muted">{item.status}</span></h2>
                                                <p className="mt-1 text-xs text-muted">ID: {String(payloadId)} · {conflict?.code || 'SYNC_CONFLICT'}</p>
                                                <p className="mt-3 text-sm leading-6 text-main/80">{conflict?.message || item.lastError || (item.status === 'PENDING' ? (isAr ? 'في انتظار المزامنة.' : 'Waiting for synchronization.') : '')}</p>
                                                {conflict?.serverState ? (
                                                    <details className="mt-3 rounded-2xl border border-border bg-app/60 p-3 text-xs">
                                                        <summary className="cursor-pointer font-bold text-muted">{isAr ? 'عرض نسخة الخادم' : 'View server state'}</summary>
                                                        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-muted">{JSON.stringify(conflict.serverState, null, 2)}</pre>
                                                    </details>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                                            {item.status === 'FAILED' ? (
                                                <button type="button" disabled={isBusy} onClick={() => void retryFailed(item.id)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                                                    <RefreshCw size={15} aria-hidden="true" /> {isAr ? 'أعد المحاولة' : 'Retry'}
                                                </button>
                                            ) : null}
                                            {item.status === 'CONFLICT' ? (<>
                                                <button type="button" disabled={isBusy} onClick={() => void resolve(item.id, 'RETRY')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                                                    <RefreshCw size={15} aria-hidden="true" /> {isAr ? 'أعد المحاولة' : 'Retry'}
                                                </button>
                                            {conflict?.serverState && typeof conflict.serverState === 'object' && !Array.isArray(conflict.serverState) ? (
                                                <button type="button" disabled={isBusy} onClick={() => void resolve(item.id, 'MERGE')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 px-4 py-2 text-xs font-black text-primary hover:bg-primary/5 disabled:opacity-50">
                                                    <GitMerge size={15} aria-hidden="true" /> {isAr ? 'دمج محافظ' : 'Safe merge'}
                                                </button>
                                            ) : null}
                                            <button type="button" disabled={isBusy} onClick={() => void resolve(item.id, 'DISCARD')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-black text-muted hover:bg-app disabled:opacity-50">
                                                <Trash2 size={15} aria-hidden="true" /> {isAr ? 'تجاهل' : 'Discard'}
                                            </button>
                                            </>) : null}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                )}
            </div>
        </main>
    );
};

const QueueHealthCard: React.FC<{ label: string; value: number; icon: React.ReactNode; tone: 'amber' | 'rose' | 'orange' | 'emerald' }> = ({ label, value, icon, tone }) => {
    const tones = {
        amber: 'border-amber-500/20 bg-amber-500/5 text-amber-600',
        rose: 'border-rose-500/20 bg-rose-500/5 text-rose-600',
        orange: 'border-orange-500/20 bg-orange-500/5 text-orange-600',
        emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600',
    } as const;
    return (
        <article className={`rounded-2xl border p-4 ${tones[tone]}`}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-muted">{label}</span>
                {icon}
            </div>
            <p className="mt-2 text-2xl font-black tabular-nums text-main" aria-label={`${label}: ${value}`}>{value}</p>
        </article>
    );
};

export default OfflineConflictCenter;
