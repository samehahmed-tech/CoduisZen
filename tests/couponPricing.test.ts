import { describe, expect, it } from 'vitest';
import { calculateCouponDiscount } from '../server/services/couponPricing';

describe('calculateCouponDiscount', () => {
    it.each([
        [{ type: 'PERCENT' as const, value: 10 }, 250, 25],
        [{ type: 'PERCENT' as const, value: 50, maxDiscount: 30 }, 100, 30],
        [{ type: 'FIXED' as const, value: 200 }, 75, 75],
    ])('calculates a bounded monetary discount', (coupon, subtotal, expected) => {
        expect(calculateCouponDiscount(coupon, subtotal)).toBe(expected);
    });
});
