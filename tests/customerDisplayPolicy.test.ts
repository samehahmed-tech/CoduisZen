import { describe, expect, it } from 'vitest';
import { normalizeCustomerDisplayLimit, sanitizeCustomerDisplayOrder } from '../src/services/customerDisplayPolicy';

describe('customer display policy', () => {
    it('clamps the public display size', () => {
        expect(normalizeCustomerDisplayLimit(undefined)).toBe(12);
        expect(normalizeCustomerDisplayLimit('100')).toBe(30);
        expect(normalizeCustomerDisplayLimit('-5')).toBe(1);
    });

    it('exposes only a safe order number/status/time projection', () => {
        expect(sanitizeCustomerDisplayOrder({ orderNumber: 42, status: 'ready', updatedAt: '2026-10-26T10:00:00Z' })).toEqual({
            orderNumber: 42,
            status: 'READY',
            updatedAt: '2026-10-26T10:00:00Z',
        });
        expect(sanitizeCustomerDisplayOrder({ orderNumber: 'not-a-number', status: null })).toEqual({
            orderNumber: null,
            status: '',
            updatedAt: null,
        });
    });
});
