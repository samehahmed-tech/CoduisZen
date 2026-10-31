import { describe, expect, it } from 'vitest';
import { FISCAL_RETRY_LEASE_MS, isFiscalRetryLeaseExpired } from '../server/utils/fiscalRetryPolicy';

describe('fiscal retry lease policy', () => {
    it('recovers missing/invalid/stale leases and preserves fresh ones', () => {
        const now = Date.parse('2026-01-01T00:00:00.000Z');
        expect(isFiscalRetryLeaseExpired(undefined, now)).toBe(true);
        expect(isFiscalRetryLeaseExpired('invalid', now)).toBe(true);
        expect(isFiscalRetryLeaseExpired(new Date(now - FISCAL_RETRY_LEASE_MS - 1), now)).toBe(true);
        expect(isFiscalRetryLeaseExpired(new Date(now - FISCAL_RETRY_LEASE_MS + 1), now)).toBe(false);
    });
});
