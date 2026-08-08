import { describe, expect, it } from 'vitest';
import { calculateOrderTotalsFromOrder } from '../services/orderTotals';

describe('persisted order totals', () => {
    it('treats order.discount as money and derives its display percentage', () => {
        const totals = calculateOrderTotalsFromOrder({
            items: [{ id: 'line-1', name: 'Item', price: 365, quantity: 1 } as any],
            subtotal: 365,
            discount: 73,
        }, { taxRate: 0 });

        expect(totals.orderDiscountAmount).toBe(73);
        expect(totals.orderDiscountPercent).toBe(20);
        expect(totals.total).toBe(292);
    });
});
