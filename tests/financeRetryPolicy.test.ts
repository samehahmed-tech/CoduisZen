import { describe, expect, it } from 'vitest';
import { FINANCE_RETRY_LEASE_MS, isFinanceRetryLeaseExpired } from '../server/utils/financeRetryPolicy';

describe('finance retry lease policy', () => {
    it('expires missing, invalid, and old claims but keeps fresh claims', () => {
        const now = Date.parse('2026-01-01T00:00:00.000Z');
        expect(isFinanceRetryLeaseExpired(null, now)).toBe(true);
        expect(isFinanceRetryLeaseExpired('not-a-date', now)).toBe(true);
        expect(isFinanceRetryLeaseExpired(new Date(now - FINANCE_RETRY_LEASE_MS - 1), now)).toBe(true);
        expect(isFinanceRetryLeaseExpired(new Date(now - FINANCE_RETRY_LEASE_MS + 1), now)).toBe(false);
    });
});
