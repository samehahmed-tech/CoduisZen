/**
 * opsStats.worker — live operations aggregation OFF the main thread.
 *
 * TilesView recomputes revenue-today / status counts / 12h histogram on every
 * order-store change (including each socket patch). Date parsing + full-array
 * scans on the UI thread compete with tile tilt/entrance animations and drop
 * frames on low-end devices. This worker does the same pure computation in
 * the background; the component keeps a synchronous fallback (`computeOpsSync`
 * in TilesView) for environments without Worker support.
 *
 * Message protocol:
 *   in:  Array<{ status, total?, subtotal?, createdAt? }> (structured clone)
 *   out: OpsStats { active, preparing, ready, out, revenue, hours[12] }
 */

export interface OpsStatsInput {
    status?: unknown;
    total?: unknown;
    subtotal?: unknown;
    createdAt?: unknown;
}

export interface OpsStats {
    active: number;
    preparing: number;
    ready: number;
    out: number;
    revenue: number;
    /** 12 hourly buckets (oldest → newest), normalized 6..100 for spark bars. */
    hours: number[];
}

const ACTIVE_FINAL = new Set(['DELIVERED', 'CANCELLED', 'CLOSED', 'REJECTED', 'VOIDED']);

const upperStatus = (value: unknown): string => String((value as { status?: unknown } | null)?.status || '').toUpperCase();

function computeOpsStats(list: OpsStatsInput[], now: Date): OpsStats {
    const active = list.filter((o) => !ACTIVE_FINAL.has(upperStatus(o)));
    const inStatus = (...statuses: string[]): number =>
        active.filter((o) => statuses.includes(upperStatus(o))).length;

    const todayKey = now.toISOString().slice(0, 10);
    const todayLabel = now.toDateString();
    const nowH = now.getHours();
    let revenue = 0;
    const hours = new Array<number>(12).fill(0);

    for (const o of list) {
        const t = (o as { createdAt?: unknown })?.createdAt ? new Date((o as { createdAt: string }).createdAt) : null;
        if (!t || Number.isNaN(t.getTime())) continue;
        const st = upperStatus(o);
        if (t.toISOString().slice(0, 10) === todayKey && st !== 'CANCELLED' && st !== 'VOIDED') {
            revenue += Number((o as { total?: unknown }).total ?? (o as { subtotal?: unknown }).subtotal ?? 0) || 0;
        }
        const dh = nowH - t.getHours();
        if (dh >= 0 && dh < 12 && t.toDateString() === todayLabel) hours[11 - dh] += 1;
    }

    const maxH = Math.max(1, ...hours);
    return {
        active: active.length,
        preparing: inStatus('PREPARING', 'IN_PREPARATION', 'CONFIRMED', 'ACCEPTED', 'PENDING'),
        ready: inStatus('READY'),
        out: inStatus('OUT_FOR_DELIVERY'),
        revenue,
        hours: hours.map((h) => Math.max(6, Math.round((h / maxH) * 100))),
    };
}

self.onmessage = (event: MessageEvent<OpsStatsInput[]>) => {
    const list = Array.isArray(event.data) ? event.data : [];
    const result = computeOpsStats(list, new Date());
    (self as unknown as { postMessage: (data: OpsStats) => void }).postMessage(result);
};

export {};
