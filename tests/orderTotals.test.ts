import { describe, expect, it } from 'vitest';
import { buildOrderDiscountPayload, calculateOrderTotalsFromOrder } from '../services/orderTotals';

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

describe('order discount wire payload (POST /api/orders)', () => {
    it('sends a manual discount as an AMOUNT, never PERCENT', () => {
        // Regression: the client used to tag the amount as PERCENT, so the
        // server applied subtotal × amount / 100 (15 off 150 became 22.50).
        expect(buildOrderDiscountPayload({ discount: 15 })).toEqual({ discount: 15, discount_type: 'AMOUNT' });
        expect(buildOrderDiscountPayload({ discount: 0 })).toEqual({ discount: 0, discount_type: 'AMOUNT' });
        expect(buildOrderDiscountPayload({})).toEqual({ discount: 0, discount_type: 'AMOUNT' });
    });

    it('zeroes the manual part when a coupon is present (server computes it once)', () => {
        // Otherwise the client's coupon estimate would stack on top of the
        // server-computed coupon value and be counted twice.
        expect(buildOrderDiscountPayload({ discount: 20, couponCode: 'SAVE10' })).toEqual({ discount: 0, discount_type: 'COUPON' });
    });
});
