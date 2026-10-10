import { Request, Response, NextFunction } from 'express';

/**
 * Sliding-window in-memory rate limiter (single-instance ERP — no Redis).
 * Hand-rolled instead of express-rate-limit: zero new dependencies, exact
 * scoping (API only, auth/health exempt), bounded memory.
 *
 * Ceiling: 600 req/min per IP (~10 rps sustained). POS order bursts and
 * dashboard fan-outs fit comfortably; floods get a fast 429 instead of
 * saturating the DB pool and starving real terminals.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 600;
const MAX_BUCKETS = 5_000;

// Paths with their own dedicated throttles / health probes stay exempt so
// limiters never stack into accidental lockouts.
const EXEMPT_PREFIXES = ['/api/auth/', '/api/health'];

const buckets = new Map<string, number[]>();

// Periodic prune keeps memory bounded even under spoofed-IP floods.
const pruneTimer = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [ip, stamps] of buckets) {
        while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();
        if (stamps.length === 0) buckets.delete(ip);
    }
    if (buckets.size > MAX_BUCKETS) {
        // Evict oldest buckets first (Map preserves insertion order).
        const excess = buckets.size - MAX_BUCKETS;
        let n = 0;
        for (const ip of buckets.keys()) {
            buckets.delete(ip);
            if (++n >= excess) break;
        }
    }
}, 30_000);
if (typeof (pruneTimer as any)?.unref === 'function') (pruneTimer as any).unref();

export const apiRateLimiter = (req: Request, res: Response, next: NextFunction) => {
    try {
        const path = req.path || req.url || '';
        if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return next();

        const ip = req.ip || (req.socket?.remoteAddress as string) || 'unknown';
        const now = Date.now();
        const cutoff = now - WINDOW_MS;
        let stamps = buckets.get(ip);
        if (!stamps) {
            stamps = [];
            buckets.set(ip, stamps);
        }
        while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();
        if (stamps.length >= MAX_REQUESTS) {
            const retryAfter = Math.ceil((stamps[0] + WINDOW_MS - now) / 1000);
            res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
            return res.status(429).json({ error: 'RATE_LIMITED', retryAfterSeconds: Math.max(1, retryAfter) });
        }
        stamps.push(now);
        return next();
    } catch {
        // Limiter must never break traffic — fail open.
        return next();
    }
};
