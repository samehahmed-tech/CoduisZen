import { describe, expect, it } from 'vitest';
import { reconcilePaymentRows } from '../server/services/paymentReconciliation';

describe('payment reconciliation', () => {
    it('prefers confirmed sessions for the same order and method without losing split methods', () => {
        const result = reconcilePaymentRows([
            { orderId: 'o1', method: 'CASH', total: 100, count: 1 },
            { orderId: 'o2', method: 'VISA', total: 50, count: 1 },
            { orderId: 'o3', method: 'CASH', total: 20, count: 1 },
        ], [
            { orderId: 'o1', method: 'manual_cash', total: 100, count: 1 },
            { orderId: 'o2', method: 'eft_pos', total: 50, count: 1 },
            { orderId: 'o2', method: 'manual_cash', total: 10, count: 1 },
        ]);

        expect(result).toEqual([
            { method: 'CASH', total: 130, count: 3 },
            { method: 'VISA', total: 50, count: 1 },
        ]);
    });
});
