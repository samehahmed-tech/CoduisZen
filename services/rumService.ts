/**
 * Client RUM (hand-rolled, no web-vitals dependency).
 * Collects LCP + CLS + INP-proxy (worst event-timing interaction) and
 * beacons compact aggregates. Idle-started, sampled, tiny payloads.
 */

interface RumSummary {
    lcp: number;
    cls: number;
    inp: number;
    route: string;
}

const RUM_ENDPOINT = '/api/rum/client';
const SAMPLE_RATE = 1;

let started = false;
let lcp = 0;
let cls = 0;
let inp = 0;
let interactions = 0;

const send = (route: string) => {
    try {
        if (lcp <= 0 && cls <= 0 && inp <= 0) return;
        const body: RumSummary = {
            lcp: Math.round(lcp),
            cls: Math.round(cls * 1000) / 1000,
            inp: Math.round(inp),
            route: route.slice(0, 80),
        };
        const payload = JSON.stringify(body);
        if (navigator.sendBeacon) {
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(RUM_ENDPOINT, blob);
        } else {
            void fetch(RUM_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true,
            }).catch(() => undefined);
        }
    } catch {
        // never break the app
    }
};

export const initClientRum = () => {
    if (started) return;
    started = true;
    try {
        if (Math.random() > SAMPLE_RATE) return;
        if (typeof PerformanceObserver === 'undefined') return;

        const lcpObs = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const last = entries[entries.length - 1] as any;
            if (last && last.startTime) lcp = last.startTime;
        });
        lcpObs.observe({ entryTypes: ['largest-contentful-paint'] });

        const clsObs = new PerformanceObserver((list) => {
            for (const e of list.getEntries() as any[]) {
                if (!e.hadRecentInput) cls += e.value || 0;
            }
        });
        clsObs.observe({ entryTypes: ['layout-shift'] });

        // INP proxy: worst interaction (event timing) duration observed.
        const evtObs = new PerformanceObserver((list) => {
            for (const e of list.getEntries() as any[]) {
                if (typeof e.interactionId === 'number' && e.interactionId > 0 && e.duration > 0) {
                    interactions += 1;
                    if (e.duration > inp) inp = e.duration;
                }
            }
        });
        try {
            evtObs.observe({ entryTypes: ['event'] });
        } catch {
            // Event Timing unsupported — INP stays 0 (reported as unknown).
        }

        const flush = () => send(window.location.pathname || '/');
        window.addEventListener('pagehide', flush);
        // Mid-session snapshot for long-lived POS terminals.
        window.setInterval(() => {
            flush();
            lcp = 0;
            cls = 0;
            inp = 0;
        }, 5 * 60_000);
    } catch {
        // ignore
    }
};

export const __rumInternals = { reset: () => { lcp = 0; cls = 0; inp = 0; interactions = 0; } };
