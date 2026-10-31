import { describe, expect, it } from 'vitest';
import { getPublicApiSandboxOrders } from '../server/utils/publicApiSandbox';

describe('public API sandbox contract', () => {
    it('returns deterministic synthetic data without customer or payment fields', () => {
        const first = getPublicApiSandboxOrders();
        const second = getPublicApiSandboxOrders();
        expect(first).toEqual(second);
        expect(first.sandbox).toBe(true);
        expect(first.data).toHaveLength(2);
        expect(JSON.stringify(first)).not.toMatch(/phone|address|payment|card|customer/i);
        expect(first.data.every((order) => order.branchId === 'sandbox')).toBe(true);
    });
});
