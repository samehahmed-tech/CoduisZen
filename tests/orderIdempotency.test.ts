import { describe, it, expect } from 'vitest';
import {
    buildRequestHash,
    getIdempotencyKeyFromRequest,
    sanitizeIdempotencyPayload,
} from '../server/services/idempotencyService';

describe('order idempotency helpers', () => {
    it('builds stable hash regardless of object key order', () => {
        const a = { amount: 100, customer: { id: 'c1', name: 'A' }, items: [{ id: 'i1', qty: 2 }] };
        const b = { items: [{ qty: 2, id: 'i1' }], customer: { name: 'A', id: 'c1' }, amount: 100 };
        expect(buildRequestHash(a)).toBe(buildRequestHash(b));
    });

    it('extracts idempotency key from header then body fallback', () => {
        const fromHeader = getIdempotencyKeyFromRequest({
            get: (name: string) => (name.toLowerCase() === 'idempotency-key' ? '  abc-123  ' : undefined),
            body: {},
        });
        expect(fromHeader).toBe('abc-123');

        const fromBody = getIdempotencyKeyFromRequest({
            headers: {},
            body: { idempotencyKey: 'body-key' },
        });
        expect(fromBody).toBe('body-key');
    });

    it('sanitizes payload by removing idempotency fields before hashing', () => {
        const payload = {
            idempotencyKey: 'K1',
            idempotency_key: 'K2',
            order: { id: 'o1', total: 55 },
        };
        const sanitized = sanitizeIdempotencyPayload(payload);
        expect(sanitized).toEqual({ order: { id: 'o1', total: 55 } });
    });
});
