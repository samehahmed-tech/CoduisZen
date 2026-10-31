import { describe, expect, it } from 'vitest';
import { canReplayAggregatorDeadLetter, sanitizeAggregatorDeadLetter } from '../src/services/aggregatorDeadLetterPolicy';

describe('aggregator dead-letter policy', () => {
    it('returns metadata without exposing the raw payload', () => {
        const result = sanitizeAggregatorDeadLetter({
            id: 7,
            status: 'FAILED',
            attempt: 2,
            lastError: 'TIMEOUT',
            payload: {
                provider: 'elmenus', orderId: 'ext-7', branchId: 'branch-1', status: 'NEW',
                payload: { customer: { phone: '01000000000' }, payment: { card: 'secret' } },
            },
        });
        expect(result).toMatchObject({ id: 7, providerId: 'elmenus', externalId: 'ext-7', branchId: 'branch-1', error: 'TIMEOUT' });
        expect(JSON.stringify(result)).not.toContain('01000000000');
        expect(JSON.stringify(result)).not.toContain('secret');
    });

    it('fails closed for branch-scoped replay without matching metadata', () => {
        expect(canReplayAggregatorDeadLetter({ branchId: 'branch-1' }, 'branch-1')).toBe(true);
        expect(canReplayAggregatorDeadLetter({ branchId: 'branch-2' }, 'branch-1')).toBe(false);
        expect(canReplayAggregatorDeadLetter({ branchId: null }, 'branch-1')).toBe(false);
        expect(canReplayAggregatorDeadLetter({ branchId: null }, undefined)).toBe(true);
    });
});
