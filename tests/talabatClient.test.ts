import { describe, it, expect, vi } from 'vitest';
import {
    TalabatRateLimiter,
    buildPutOrderBody,
    getTalabatToken,
    __clearTalabatTokenCache,
} from '../server/modules/talabat/talabatClient';

describe('talabat client', () => {
    it('caches OAuth token and refreshes after expiry', async () => {
        __clearTalabatTokenCache();
        const fetchFn = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok-1', expires_in: 7200 }) });
        const t1 = await getTalabatToken({ clientId: 'c', clientSecret: 's' }, fetchFn as any);
        const t2 = await getTalabatToken({ clientId: 'c', clientSecret: 's' }, fetchFn as any);
        expect(t1).toBe('tok-1');
        expect(t2).toBe('tok-1');
        expect(fetchFn).toHaveBeenCalledTimes(1);
        // Spec requires x-www-form-urlencoded (not JSON)
        const [, init] = fetchFn.mock.calls[0];
        expect(String(init.headers['Content-Type'])).toContain('x-www-form-urlencoded');
        const body = String(init.body);
        expect(body).toContain('grant_type=client_credentials');
        expect(body).toContain('client_id=c');
    });

    it('builds PUT fulfil body with item statuses', () => {
        const body = buildPutOrderBody({
            orderId: 'oid',
            status: 'READY_FOR_PICKUP',
            items: [{ sku: 'A', pricingType: 'UNIT', quantity: 2, unitPrice: 10, status: 'IN_CART' }],
        });
        expect(body.status).toBe('READY_FOR_PICKUP');
        expect(body.items[0].sku).toBe('A');
        expect(body.items[0].status).toBe('IN_CART');
    });

    it('rate limiter caps at 60 per minute', () => {
        const limiter = new TalabatRateLimiter(60);
        const now = Date.now();
        for (let i = 0; i < 60; i++) expect(limiter.tryAcquire(now)).toBe(true);
        expect(limiter.tryAcquire(now)).toBe(false);
        expect(limiter.tryAcquire(now + 61_000)).toBe(true);
    });

    it('cancel body carries valid reason', () => {
        const body = buildPutOrderBody({ orderId: 'oid', status: 'CANCELLED', cancellationReason: 'TOO_BUSY' });
        expect((body as any).cancellation.reason).toBe('TOO_BUSY');
    });
});
