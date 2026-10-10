import { Request, Response } from 'express';

/**
 * Client-RUM ingest (public — the login page reports too).
 * Strict shape, numeric-only, bounded keys. Aggregates only; no PII,
 * no raw payloads stored. Covered by the global API rate limiter.
 */

interface ClientBucket {
    n: number;
    lcpSum: number;
    lcpMax: number;
    inpMax: number;
    clsSum: number;
}

const buckets = new Map<string, ClientBucket>();
const MAX_KEYS = 100;

export const ingestClientRum = (req: Request, res: Response) => {
    try {
        const body = (req.body || {}) as Record<string, unknown>;
        const lcp = Number(body.lcp);
        const inp = Number(body.inp);
        const cls = Number(body.cls);
        const route = String(body.route || '/').slice(0, 80);
        if (
            !Number.isFinite(lcp) || !Number.isFinite(inp) || !Number.isFinite(cls) ||
            lcp < 0 || lcp > 120_000 || inp < 0 || inp > 60_000 || cls < 0 || cls > 5
        ) {
            return res.status(400).json({ error: 'INVALID_RUM_PAYLOAD' });
        }
        let b = buckets.get(route);
        if (!b) {
            if (buckets.size >= MAX_KEYS) return res.status(200).json({ ok: true });
            b = { n: 0, lcpSum: 0, lcpMax: 0, inpMax: 0, clsSum: 0 };
            buckets.set(route, b);
        }
        b.n += 1;
        if (lcp > 0) {
            b.lcpSum += lcp;
            if (lcp > b.lcpMax) b.lcpMax = lcp;
        }
        if (inp > b.inpMax) b.inpMax = inp;
        b.clsSum += cls;
        return res.status(200).json({ ok: true });
    } catch {
        return res.status(200).json({ ok: true });
    }
};

/** Snapshot for tests / ops review. */
export const getClientRum = () =>
    Array.from(buckets.entries()).map(([route, b]) => ({
        route,
        n: b.n,
        lcpAvg: b.n > 0 ? Math.round(b.lcpSum / b.n) : 0,
        lcpMax: Math.round(b.lcpMax),
        inpMax: Math.round(b.inpMax),
        clsAvg: b.n > 0 ? Math.round((b.clsSum / b.n) * 1000) / 1000 : 0,
    }));
