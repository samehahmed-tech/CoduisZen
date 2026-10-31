import { describe, expect, it, vi } from 'vitest';
import { talabatRequest } from '../server/modules/talabat/talabatClient';

const response = (status: number): Response => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
} as Response);

describe('Talabat outbound reliability', () => {
    it('retries transient HTTP failures with bounded backoff', async () => {
        const fetchFn = vi.fn()
            .mockResolvedValueOnce(response(503))
            .mockResolvedValueOnce(response(429))
            .mockResolvedValueOnce(response(200));
        const sleepFn = vi.fn().mockResolvedValue(undefined);
        const result = await talabatRequest('https://sandbox.invalid/resource', { maxAttempts: 3, sleepFn }, fetchFn as any);
        expect(result.status).toBe(200);
        expect(fetchFn).toHaveBeenCalledTimes(3);
        expect(sleepFn).toHaveBeenCalledTimes(2);
    });

    it('does not retry permanent client errors', async () => {
        const fetchFn = vi.fn().mockResolvedValue(response(400));
        const sleepFn = vi.fn().mockResolvedValue(undefined);
        const result = await talabatRequest('https://sandbox.invalid/resource', { maxAttempts: 3, sleepFn }, fetchFn as any);
        expect(result.status).toBe(400);
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(sleepFn).not.toHaveBeenCalled();
    });
});
