import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * In-memory per-route latency histograms (no Redis, no agent).
 * Bounded: route keys are normalized (ids become :id) and capped;
 * buckets give p50/p95 without storing samples. Summaries go to the
 * structured log every 10 minutes for ops review.
 */

const BUCKETS = [25, 50, 100, 250, 500, 1000, 2500];
const MAX_KEYS = 300;

interface RouteStats {
    n: number;
    byBucket: number[];
    max: number;
    errors: number;
}

const stats = new Map<string, RouteStats>();

const normalizePath = (p: string): string => {
    const path = p.split('?')[0];
    return path
        .replace(/\/[0-9a-fA-F-]{8,}/g, '/:id')
        .replace(/\/\d+(?=\/|$)/g, '/:id')
        .slice(0, 120);
};

export const requestTiming = (req: Request, res: Response, next: NextFunction) => {
    const start = (req as any).requestStartTime || Date.now();
    res.on('finish', () => {
        try {
            if (!req.path.startsWith('/api/')) return;
            const key = `${req.method} ${normalizePath(req.path)}`;
            let s = stats.get(key);
            if (!s) {
                if (stats.size >= MAX_KEYS) return;
                s = { n: 0, byBucket: BUCKETS.map(() => 0), max: 0, errors: 0 };
                stats.set(key, s);
            }
            const ms = Date.now() - start;
            s.n += 1;
            if (ms > s.max) s.max = ms;
            if (res.statusCode >= 500) s.errors += 1;
            for (let i = 0; i < BUCKETS.length; i++) {
                if (ms < BUCKETS[i]) {
                    s.byBucket[i] += 1;
                    break;
                }
                if (i === BUCKETS.length - 1) s.byBucket[i] += 1;
            }
        } catch {
            // Observability must never break traffic.
        }
    });
    next();
};

const percentile = (s: RouteStats, p: number): number => {
    const target = Math.ceil((s.n * p) / 100);
    let acc = 0;
    for (let i = 0; i < BUCKETS.length; i++) {
        acc += s.byBucket[i];
        if (acc >= target) return BUCKETS[i];
    }
    return BUCKETS[BUCKETS.length - 1];
};

/** Snapshot for tests / future health extension. */
export const getRequestTiming = () =>
    Array.from(stats.entries())
        .map(([route, s]) => ({
            route,
            n: s.n,
            p50: percentile(s, 50),
            p95: percentile(s, 95),
            max: s.max,
            errors: s.errors,
        }))
        .sort((a, b) => b.p95 - a.p95);

const reportTimer = setInterval(() => {
    try {
        const top = getRequestTiming()
            .filter((r) => r.n >= 5)
            .slice(0, 15);
        if (top.length > 0) {
            logger.info(
                { slowest: top.map((r) => `${r.route} n=${r.n} p50=${r.p50} p95=${r.p95} max=${r.max} err=${r.errors}`) },
                'API latency snapshot (in-memory RUM)'
            );
        }
    } catch {
        // ignore
    }
}, 10 * 60_000);
if (typeof (reportTimer as any)?.unref === 'function') (reportTimer as any).unref();
