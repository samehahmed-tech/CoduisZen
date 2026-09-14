import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { approvalsApi } from '../services/api/approval';
import { financeApi } from '../services/api/finance';
import { fiscalApi } from '../services/api/fiscal';
import { inventoryIntelligenceApi } from '../services/api/inventoryIntelligence';
import { ordersApi } from '../services/api/orders';
import { printGatewayApi } from '../services/api/printGateway';
import { deliveryApi } from '../services/api/delivery';
import { shiftsApi } from '../services/api/shifts';
import { socketService } from '../services/socketService';
import { syncService } from '../services/syncService';

export type SystemNotificationSeverity = 'critical' | 'warning' | 'info' | 'success';

export interface SystemNotification {
    id: string;
    severity: SystemNotificationSeverity;
    category: string;
    title: string;
    titleAr: string;
    body: string;
    bodyAr: string;
    link?: string;
    createdAt?: string;
    count?: number;
}

interface UseSystemNotificationsOptions {
    branchId?: string;
    userId?: string;
    hasActiveShift?: boolean;
    enabled?: boolean;
    pollMs?: number;
}

const READ_KEY_PREFIX = 'rf-notif-read:v1:';
const MAX_READ_IDS = 300;
const ACTIVE_ORDER = new Set(['PENDING', 'PREPARING', 'READY', 'IN_PREPARATION', 'CONFIRMED', 'ACCEPTED']);

const loadReadIds = (key: string): Set<string> => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
    } catch {
        return new Set();
    }
};

const persistReadIds = (key: string, ids: Set<string>) => {
    try {
        const arr = Array.from(ids).slice(-MAX_READ_IDS);
        localStorage.setItem(key, JSON.stringify(arr));
    } catch {
        /* storage full / private mode — unread badges just reset */
    }
};

const toTime = (v: unknown): string | undefined => {
    if (!v) return undefined;
    try {
        const d = new Date(String(v));
        return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
    } catch {
        return undefined;
    }
};

/**
 * Aggregates REAL system signals into a unified notification feed:
 * pending manager approvals, finance exceptions, fiscal/ETA readiness,
 * low-stock reorder alerts, urgent + stale orders, offline sync backlog,
 * and missing active shift. No mock data — every item links to its hub.
 */
export const useSystemNotifications = (options: UseSystemNotificationsOptions = {}) => {
    const { branchId, userId, hasActiveShift, enabled = true, pollMs = 90000 } = options;
    const [notifications, setNotifications] = useState<SystemNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [readIds, setReadIds] = useState<Set<string>>(new Set());
    const readKey = useMemo(
        () => `${READ_KEY_PREFIX}${branchId || 'none'}:${userId || 'anon'}`,
        [branchId, userId]
    );
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setReadIds(loadReadIds(readKey));
    }, [readKey]);

    const markRead = useCallback((id: string) => {
        setReadIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            persistReadIds(readKey, next);
            return next;
        });
    }, [readKey]);

    const markAllRead = useCallback(() => {
        setReadIds((prev) => {
            const next = new Set(prev);
            notifications.forEach((n) => next.add(n.id));
            persistReadIds(readKey, next);
            return next;
        });
    }, [notifications, readKey]);

    const refresh = useCallback(async () => {
        if (!enabled || !branchId) return;
        setLoading(true);
        try {
            const [approvalsRes, financeRes, fiscalRes, reorderRes, ordersRes, syncRes, printRes, slaRes] =
                await Promise.allSettled([
                    approvalsApi.getAll(branchId),
                    financeApi.getExceptions(),
                    fiscalApi.getReadiness(branchId),
                    inventoryIntelligenceApi.getReorderAlerts(),
                    ordersApi.getAll({ branch_id: branchId, limit: 60 } as any),
                    syncService.getQueueStats().catch(() => ({ total: 0, pending: 0, failed: 0, synced: 0 })),
                    printGatewayApi.getJobs({ branchId, status: 'FAILED', limit: 1 }).catch(() => null),
                    deliveryApi.getSlaAlerts({ branchId }).catch(() => null),
                ]);

            const out: SystemNotification[] = [];

            // 1) Pending manager approvals (real)
            if (approvalsRes.status === 'fulfilled' && Array.isArray(approvalsRes.value)) {
                const pending = approvalsRes.value.filter((a: any) => {
                    const s = String(a?.status || a?.state || 'PENDING').toUpperCase();
                    return s === 'PENDING' || s === 'OPEN' || s === 'AWAITING' || (!a?.status && !a?.resolvedAt);
                });
                pending.slice(0, 5).forEach((a: any, i: number) => {
                    const label = String(a?.actionType || a?.type || a?.action || 'approval');
                    out.push({
                        id: `approval:${String(a?.id ?? i)}`,
                        severity: 'warning',
                        category: 'approvals',
                        title: `Pending approval: ${label}`,
                        titleAr: `اعتماد معلق: ${label}`,
                        body: `${pending.length} approval(s) waiting for a manager`,
                        bodyAr: `${pending.length} اعتماد بانتظار المدير`,
                        link: '/approvals',
                        createdAt: toTime(a?.createdAt),
                        count: pending.length,
                    });
                });
            }

            // 2) Finance ledger exceptions (real)
            if (financeRes.status === 'fulfilled' && Array.isArray(financeRes.value)) {
                const pendingEx = financeRes.value.filter((e: any) =>
                    String(e?.status || 'PENDING').toUpperCase() === 'PENDING'
                );
                if (pendingEx.length > 0) {
                    out.push({
                        id: 'finance:exceptions:pending',
                        severity: 'critical',
                        category: 'finance',
                        title: `${pendingEx.length} finance exception(s) need review`,
                        titleAr: `${pendingEx.length} استثناء مالي يحتاج مراجعة`,
                        body: `Reason: ${String(pendingEx[0]?.reason || 'posting failed')} — open Finance to retry or dismiss`,
                        bodyAr: `السبب: ${String(pendingEx[0]?.reason || 'فشل الترحيل')} — افتح المالية للمعالجة`,
                        link: '/finance',
                        createdAt: toTime(pendingEx[0]?.createdAt),
                        count: pendingEx.length,
                    });
                }
            }

            // 3) Fiscal / ETA readiness (real)
            if (fiscalRes.status === 'fulfilled' && fiscalRes.value) {
                const r: any = fiscalRes.value;
                if (r?.alerts?.configMissing || r?.config?.ok === false) {
                    out.push({
                        id: 'fiscal:config',
                        severity: 'warning',
                        category: 'fiscal',
                        title: 'E-invoice configuration incomplete',
                        titleAr: 'إعدادات الفاتورة الإلكترونية ناقصة',
                        body: `Missing: ${(r?.config?.missing || []).join(', ') || 'check fiscal settings'}`,
                        bodyAr: 'أكمل بيانات الإعداد الضريبي قبل الإرسال لمصلحة الضرائب',
                        link: '/fiscal',
                    });
                }
                const dlq = Number(r?.deadLetter?.pendingCount || 0);
                if (dlq > 0 || r?.alerts?.hasPendingDlq) {
                    out.push({
                        id: 'fiscal:deadletter',
                        severity: 'critical',
                        category: 'fiscal',
                        title: `${dlq} failed e-invoice submission(s)`,
                        titleAr: `${dlq} فاتورة فشل إرسالها للضرائب`,
                        body: 'Oldest pending ' + `${Math.round(Number(r?.deadLetter?.oldestPendingAgeMinutes || 0))} min — retry from Fiscal hub`,
                        bodyAr: 'أعد المحاولة من مركز الفواتير الضريبية',
                        link: '/fiscal',
                        count: dlq,
                    });
                } else if (r?.alerts?.lowSuccessRate) {
                    const rate = Math.round(Number(r?.metrics24h?.successRate || 0) * 100);
                    out.push({
                        id: 'fiscal:success-rate',
                        severity: 'warning',
                        category: 'fiscal',
                        title: `Low e-invoice success rate (${rate}%)`,
                        titleAr: `معدل نجاح الإرسال الضريبي منخفض (${rate}%)`,
                        body: `${Number(r?.metrics24h?.failed || 0)} failed in the last 24h`,
                        bodyAr: `${Number(r?.metrics24h?.failed || 0)} فاتورة فاشلة آخر 24 ساعة`,
                        link: '/fiscal',
                    });
                }
            }

            // 4) Low-stock reorder alerts (real)
            if (reorderRes.status === 'fulfilled' && Array.isArray(reorderRes.value)) {
                const alerts = reorderRes.value;
                alerts.slice(0, 5).forEach((a: any, i: number) => {
                    const name = String(a?.itemName || a?.name || a?.itemId || `item ${i + 1}`);
                    out.push({
                        id: `stock:${String(a?.itemId || a?.id || i)}`,
                        severity: Number(a?.currentQty ?? a?.quantity ?? 1) <= 0 ? 'critical' : 'warning',
                        category: 'inventory',
                        title: `Low stock: ${name}`,
                        titleAr: `مخزون منخفض: ${name}`,
                        body: `On hand ${String(a?.currentQty ?? a?.quantity ?? '?')} ${String(a?.unit || '')} — reorder suggested`,
                        bodyAr: `المتاح ${String(a?.currentQty ?? a?.quantity ?? '?')} ${String(a?.unit || '')} — يُنصح بإعادة الطلب`,
                        link: '/inventory',
                        count: alerts.length,
                    });
                });
            }

            // 5) Urgent + stale active orders (real)
            if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
                const list = ordersRes.value as any[];
                const urgent = list.filter((o) => o?.isUrgent && ACTIVE_ORDER.has(String(o?.status || '').toUpperCase()));
                urgent.slice(0, 3).forEach((o: any) => {
                    out.push({
                        id: `order:urgent:${String(o?.id)}`,
                        severity: 'critical',
                        category: 'orders',
                        title: `Urgent order #${String(o?.daily_order_number ?? o?.orderNumber ?? o?.id).slice(-6)}`,
                        titleAr: `طلب عاجل #${String(o?.daily_order_number ?? o?.orderNumber ?? o?.id).slice(-6)}`,
                        body: `${String(o?.type || '')} — ${String(o?.status || '')} — ${String(o?.customerName || o?.customer_name || '')}`.trim(),
                        bodyAr: `${String(o?.type || '')} — ${String(o?.status || '')}`,
                        link: '/orders',
                        createdAt: toTime(o?.createdAt),
                    });
                });
                const staleCutoff = Date.now() - 30 * 60 * 1000;
                const stale = list.filter((o) => {
                    if (!ACTIVE_ORDER.has(String(o?.status || '').toUpperCase()) || o?.isUrgent) return false;
                    const t = toTime(o?.createdAt);
                    return t ? new Date(t).getTime() < staleCutoff : false;
                });
                if (stale.length > 0) {
                    out.push({
                        id: 'orders:stale',
                        severity: 'warning',
                        category: 'orders',
                        title: `${stale.length} order(s) waiting over 30 min`,
                        titleAr: `${stale.length} طلب متأخر أكثر من 30 دقيقة`,
                        body: 'Check Orders / KDS for stuck tickets',
                        bodyAr: 'راجع الطلبات وشاشة المطبخ للطلبات العالقة',
                        link: '/orders',
                        count: stale.length,
                    });
                }
            }

            // 6) Offline sync backlog (real, local)
            if (syncRes.status === 'fulfilled' && syncRes.value) {
                const s: any = syncRes.value;
                if (Number(s?.failed || 0) > 0) {
                    out.push({
                        id: 'sync:failed',
                        severity: 'critical',
                        category: 'sync',
                        title: `${s.failed} offline change(s) failed to sync`,
                        titleAr: `${s.failed} عملية فشلت مزامنتها`,
                        body: 'Open day-close / inventory to resolve the queue',
                        bodyAr: 'راجع قائمة المزامنة المعلقة وحل الأخطاء',
                        link: '/day-close',
                        count: Number(s.failed),
                    });
                } else if (Number(s?.pending || 0) > 5) {
                    out.push({
                        id: 'sync:pending',
                        severity: 'info',
                        category: 'sync',
                        title: `${s.pending} change(s) waiting to sync`,
                        titleAr: `${s.pending} عملية بانتظار المزامنة`,
                        body: 'They will upload automatically when online',
                        bodyAr: 'سيتم رفعها تلقائياً عند الاتصال',
                        count: Number(s.pending),
                    });
                }
            }

            // 7) No active shift (real operational guard)
            if (hasActiveShift === false) {
                out.push({
                    id: 'shift:none',
                    severity: 'warning',
                    category: 'shift',
                    title: 'No active shift',
                    titleAr: 'لا توجد وردية نشطة',
                    body: 'Open a shift before recording cash sales',
                    bodyAr: 'افتح وردية قبل تسجيل مبيعات نقدية',
                    link: '/finance',
                });
            }

            // 8) Failed print jobs (real) — paper never came out, retry from Printers.
            if (printRes.status === 'fulfilled' && printRes.value) {
                const failed = Number((printRes.value as any)?.stats?.failed || 0);
                if (failed > 0) {
                    out.push({
                        id: 'print:failed',
                        severity: 'critical',
                        category: 'printing',
                        title: `${failed} print job(s) failed`,
                        titleAr: `${failed} مهمة طباعة فاشلة`,
                        body: 'Kitchen/receipt paper may be missing — retry from Printers',
                        bodyAr: 'قد تكون أوراق المطبخ ناقصة — أعد المحاولة من الطابعات',
                        link: '/printers',
                        count: failed,
                    });
                }
            }

            // 9) Late drivers (real SLA alerts)
            if (slaRes.status === 'fulfilled' && slaRes.value) {
                const alerts = (slaRes.value as any)?.alerts || [];
                const bad = alerts.filter((a: any) =>
                    ['HIGH', 'CRITICAL'].includes(String(a?.severity || '').toUpperCase()));
                if (bad.length > 0) {
                    out.push({
                        id: 'dispatch:late',
                        severity: 'critical',
                        category: 'dispatch',
                        title: `${bad.length} late deliverie(s)`,
                        titleAr: `${bad.length} توصيل متأخر`,
                        body: 'Open dispatch to reassign or rescue late orders',
                        bodyAr: 'افتح التوصيل لإعادة التعيين أو إنقاذ الطلبات',
                        link: '/dispatch',
                        count: bad.length,
                    });
                }
            }

            // 10) Stuck scheduled orders (fire time passed, still SCHEDULED)
            if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
                const stuck = (ordersRes.value as any[]).filter((o: any) => {
                    if (String(o?.status || '').toUpperCase() !== 'SCHEDULED') return false;
                    const fire = toTime((o as any)?.scheduled_for || (o as any)?.scheduledFor);
                    return fire ? new Date(fire).getTime() < Date.now() - 15 * 60 * 1000 : false;
                });
                if (stuck.length > 0) {
                    out.push({
                        id: 'orders:scheduled-stuck',
                        severity: 'warning',
                        category: 'orders',
                        title: `${stuck.length} scheduled order(s) never fired`,
                        titleAr: `${stuck.length} طلب مجدول لم ينطلق`,
                        body: 'Check the dispatcher / call-center tracking',
                        bodyAr: 'راجع المجدول وتتبع الكول سنتر',
                        link: '/call-center',
                        count: stuck.length,
                    });
                }
            }

            // 11) Negative cash variance on open shifts (real X-report)
            try {
                const openShifts: any[] = await shiftsApi.getOpenShifts(branchId).catch(() => []);
                for (const shift of (Array.isArray(openShifts) ? openShifts : []).slice(0, 3)) {
                    try {
                        const xrep: any = await shiftsApi.getXReport(String(shift?.id || ''), branchId).catch(() => null);
                        const variance = Number(xrep?.variance ?? xrep?.cashVariance ?? NaN);
                        if (Number.isFinite(variance) && variance < -1) {
                            out.push({
                                id: `shift:variance:${String(shift?.id)}`,
                                severity: 'critical',
                                category: 'shift',
                                title: `Cash short ${Math.abs(variance).toFixed(0)} on shift`,
                                titleAr: `عجز نقدي ${Math.abs(variance).toFixed(0)} في الوردية`,
                                body: 'Count the drawer and record a variance note before close',
                                bodyAr: 'اجرد الدرج وسجل ملاحظة فرق قبل الإغلاق',
                                link: '/finance',
                            });
                            break;
                        }
                    } catch { /* per-shift best effort */ }
                }
            } catch { /* shifts API optional */ }

            // Critical first, then warning, info
            const rank: Record<string, number> = { critical: 0, warning: 1, info: 2, success: 3 };
            out.sort((a, b) => (rank[a.severity] - rank[b.severity]) || ((b.count || 0) - (a.count || 0)));
            setNotifications(out.slice(0, 30));
            setLastUpdated(new Date().toISOString());
        } finally {
            setLoading(false);
        }
    }, [branchId, enabled, hasActiveShift]);

    // Initial + polling
    useEffect(() => {
        if (!enabled || !branchId) return;
        refresh();
        const id = window.setInterval(refresh, pollMs);
        return () => window.clearInterval(id);
    }, [branchId, enabled, pollMs, refresh]);

    // Live refresh on socket events (debounced)
    useEffect(() => {
        if (!enabled || !branchId) return;
        const schedule = () => {
            if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
            refreshTimer.current = window.setTimeout(() => { refresh(); }, 2000);
        };
        const events = ['order:created', 'order:status', 'dispatch:assigned', 'stock:updated', 'table:status'];
        events.forEach((e) => socketService.on(e, schedule));
        socketService.onReconnect(schedule);
        return () => {
            events.forEach((e) => socketService.off(e, schedule));
            socketService.offReconnect(schedule);
            if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
        };
    }, [branchId, enabled, refresh]);

    const unreadCount = useMemo(
        () => notifications.filter((n) => !readIds.has(n.id)).length,
        [notifications, readIds]
    );

    return { notifications, unreadCount, loading, lastUpdated, refresh, markRead, markAllRead };
};

export default useSystemNotifications;
