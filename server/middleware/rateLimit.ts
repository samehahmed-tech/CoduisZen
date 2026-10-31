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
const WEBHOOK_MAX_REQUESTS = Number(process.env.WEBHOOK_RATE_LIMIT_MAX || 240);
const OAUTH_MAX_REQUESTS = Number(process.env.OAUTH_RATE_LIMIT_MAX || 60);
const MAX_BUCKETS = 5_000;

// Paths with their own dedicated throttles / health probes stay exempt so
// limiters never stack into accidental lockouts.
const EXEMPT_PREFIXES = ['/api/auth/', '/api/health'];

const buckets = new Map<string, number[]>();
const webhookBuckets = new Map<string, number[]>();
const oauthBuckets = new Map<string, number[]>();

const pruneBuckets = (target: Map<string, number[]>) => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [ip, stamps] of target) {
        while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();
        if (stamps.length === 0) target.delete(ip);
    }
    if (target.size > MAX_BUCKETS) {
        const excess = target.size - MAX_BUCKETS;
        let n = 0;
        for (const ip of target.keys()) {
            target.delete(ip);
            if (++n >= excess) break;
        }
    }
};

// Periodic prune keeps memory bounded even under spoofed-IP floods.
const pruneTimer = setInterval(() => {
    pruneBuckets(buckets);
    pruneBuckets(webhookBuckets);
    pruneBuckets(oauthBuckets);
}, 30_000);
if (typeof (pruneTimer as any)?.unref === 'function') (pruneTimer as any).unref();

const enforceRateLimit = (req: Request, res: Response, next: NextFunction, target: Map<string, number[]>, maxRequests: number) => {
    try {
        const ip = req.ip || (req.socket?.remoteAddress as string) || 'unknown';
        const now = Date.now();
        const cutoff = now - WINDOW_MS;
        let stamps = target.get(ip);
        if (!stamps) {
            stamps = [];
            target.set(ip, stamps);
        }
        while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();
        if (stamps.length >= maxRequests) {
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

export const apiRateLimiter = (req: Request, res: Response, next: NextFunction) => {
    const path = req.path || req.url || '';
    if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return next();
    return enforceRateLimit(req, res, next, buckets, MAX_REQUESTS);
};

/** Dedicated limiter for unauthenticated provider callbacks and hardware bridges. */
export const webhookRateLimiter = (req: Request, res: Response, next: NextFunction) =>
    enforceRateLimit(req, res, next, webhookBuckets, Math.max(1, WEBHOOK_MAX_REQUESTS));

/** Dedicated throttle for OAuth token and authorization endpoints. */
export const oauthRateLimiter = (req: Request, res: Response, next: NextFunction) =>
    enforceRateLimit(req, res, next, oauthBuckets, Math.max(1, OAUTH_MAX_REQUESTS));
