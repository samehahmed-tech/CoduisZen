import { describe, expect, it } from 'vitest';
import { allocateCouponDiscount, allocateRefundPricing } from '../server/utils/refundPricingPolicy';

describe('refund pricing policy', () => {
    it('allocates coupon discount proportionally and deterministically', () => {
        const result = allocateCouponDiscount([
            { orderItemId: 1, unitPrice: 100, quantity: 1 },
            { orderItemId: 2, unitPrice: 50, quantity: 2 },
        ], 200, 20);
        expect(result).toEqual([
            { orderItemId: 1, unitPrice: 100, quantity: 1, grossAmount: 100, discountAllocated: 10, couponDiscountAllocated: 10, netAmount: 90, taxAllocated: 0, refundAmount: 90 },
            { orderItemId: 2, unitPrice: 50, quantity: 2, grossAmount: 100, discountAllocated: 10, couponDiscountAllocated: 10, netAmount: 90, taxAllocated: 0, refundAmount: 90 },
        ]);
    });

    it('never allocates more discount than the requested line gross', () => {
        const [line] = allocateCouponDiscount([{ orderItemId: 1, unitPrice: 5, quantity: 1 }], 5, 20);
        expect(line.discountAllocated).toBe(5);
        expect(line.netAmount).toBe(0);
    });

    it('does not invent discount when the order has no coupon discount', () => {
        const [line] = allocateCouponDiscount([{ orderItemId: 1, unitPrice: 42.5, quantity: 2 }], 100, 0);
        expect(line).toMatchObject({ grossAmount: 85, discountAllocated: 0, netAmount: 85 });
    });

    it('allocates final order tax from post-discount net value', () => {
        const [line] = allocateRefundPricing([{ orderItemId: 1, unitPrice: 100, quantity: 1 }], {
            orderSubtotal: 100,
            orderDiscount: 20,
            couponDiscount: 10,
            orderTax: 11.2,
        });
        expect(line).toMatchObject({ discountAllocated: 20, couponDiscountAllocated: 10, netAmount: 80, taxAllocated: 11.2, refundAmount: 91.2 });
    });
});
