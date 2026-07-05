import { describe, it, expect } from 'vitest';
import { buildDedupeKey, computeNextAttempt } from '../src/services/syncQueueUtils';

describe('syncQueueUtils', () => {
    it('builds stable dedupe keys with ids', () => {
        const key = buildDedupeKey('order', 'CREATE', { id: 'o-1' });
        expect(key).toBe('order:CREATE:o-1');
    });

    it('builds stable dedupe keys without ids', () => {
        const key1 = buildDedupeKey('order', 'CREATE', { a: 1, b: 2 });
        const key2 = buildDedupeKey('order', 'CREATE', { a: 1, b: 2 });
        expect(key1).toBe(key2);
    });

    it('computes backoff with cap', () => {
        const now = Date.now();
        const next = computeNextAttempt(5, 2000);
        expect(next).toBeGreaterThan(now);
    });
});
