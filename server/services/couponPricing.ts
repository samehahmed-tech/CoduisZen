export type CouponPricingRule = {
    type: 'PERCENT' | 'FIXED';
    value: number;
    maxDiscount?: number;
};

export const calculateCouponDiscount = (coupon: CouponPricingRule, subtotal: number) => {
    const rawDiscount = coupon.type === 'PERCENT' ? subtotal * coupon.value / 100 : coupon.value;
    const cappedDiscount = coupon.maxDiscount === undefined ? rawDiscount : Math.min(rawDiscount, coupon.maxDiscount);
    return Number(Math.max(0, Math.min(cappedDiscount, subtotal)).toFixed(2));
};
