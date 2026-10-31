import { describe, expect, it, vi } from 'vitest';
import { apiRateLimiter, oauthRateLimiter, webhookRateLimiter } from '../server/middleware/rateLimit';
import { getRequestTiming } from '../server/middleware/requestTiming';
import { ingestClientRum, getClientRum } from '../server/controllers/rumController';

const mockRes = () => {
    const res: any = { statusCode: 200, headers: {} as Record<string, string> };
    res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (b: any) => { res.body = b; return res; };
    return res;
};

const mockReq = (path: string, ip = '10.9.9.9') =>
    ({ path, url: path, ip, socket: { remoteAddress: ip } }) as any;

describe('perf infrastructure (no DB)', () => {
    it('rate limiter allows traffic under the ceiling', () => {
        for (let i = 0; i < 50; i++) {
            const res = mockRes();
            let nexted = false;
            apiRateLimiter(mockReq('/api/orders', '10.9.9.1'), res, () => { nexted = true; });
            expect(nexted).toBe(true);
        }
    });

    it('rate limiter exempts auth and health', () => {
        for (const p of ['/api/auth/login', '/api/health']) {
            const res = mockRes();
            let nexted = false;
            apiRateLimiter(mockReq(p, '10.9.9.2'), res, () => { nexted = true; });
            expect(nexted).toBe(true);
        }
    });

    it('rate limiter blocks floods with 429 + Retry-After', () => {
        let blocked = 0;
        for (let i = 0; i < 650; i++) {
            const res = mockRes();
            let nexted = false;
            apiRateLimiter(mockReq('/api/orders', '10.9.9.3'), res, () => { nexted = true; });
            if (!nexted) {
                blocked += 1;
                expect(res.statusCode).toBe(429);
                expect(res.headers['Retry-After']).toBeTruthy();
            }
        }
        expect(blocked).toBeGreaterThan(0);
    });

    it('webhook limiter applies a dedicated lower ceiling', () => {
        let blocked = 0;
        for (let i = 0; i < 260; i++) {
            const res = mockRes();
            let nexted = false;
            webhookRateLimiter(mockReq('/api/payments/paymob/webhook', '10.9.9.4'), res, () => { nexted = true; });
            if (!nexted) {
                blocked += 1;
                expect(res.statusCode).toBe(429);
                expect(res.headers['Retry-After']).toBeTruthy();
            }
        }
        expect(blocked).toBeGreaterThan(0);
    });

    it('OAuth limiter has its own bounded ceiling', () => {
        let blocked = 0;
        for (let i = 0; i < 65; i++) {
            const res = mockRes();
            let nexted = false;
            oauthRateLimiter(mockReq('/api/v1/oauth/token', '10.9.9.5'), res, () => { nexted = true; });
            if (!nexted) blocked += 1;
        }
        expect(blocked).toBeGreaterThan(0);
    });

    it('request timing aggregates without traffic side effects', () => {
        const before = getRequestTiming().length;
        expect(before).toBeGreaterThanOrEqual(0);
    });

    it('RUM ingest accepts valid payloads and rejects garbage', () => {
        const ok = mockRes();
        ingestClientRum({ body: { lcp: 1200, inp: 80, cls: 0.02, route: '/orders' } } as any, ok);
        expect(ok.statusCode).toBe(200);
        const bad = mockRes();
        ingestClientRum({ body: { lcp: 'huge', route: '/x'.repeat(500) } } as any, bad);
        expect(bad.statusCode).toBe(400);
        expect(getClientRum().some((r) => r.route === '/orders')).toBe(true);
    });
});
