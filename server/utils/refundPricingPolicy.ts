export type RefundPricingLine = {
    orderItemId: number;
    unitPrice: number;
    quantity: number;
};

export type AllocatedRefundPricingLine = RefundPricingLine & {
    grossAmount: number;
    discountAllocated: number;
    couponDiscountAllocated: number;
    netAmount: number;
    taxAllocated: number;
    refundAmount: number;
};

const cents = (value: number) => Math.max(0, Math.round(Number(value || 0) * 100));
const money = (value: number) => Number((Math.max(0, value) / 100).toFixed(2));

/**
 * Allocates the order-level coupon discount proportionally to requested item
 * gross values. The allocation is deterministic and never exceeds either the
 * line gross or the recorded coupon discount.
 */
export const allocateRefundPricing = (
    lines: RefundPricingLine[],
    input: { orderSubtotal: number; orderDiscount: number; couponDiscount: number; orderTax: number },
): AllocatedRefundPricingLine[] => {
    const subtotalCents = cents(input.orderSubtotal);
    const orderDiscountCents = Math.min(subtotalCents, cents(input.orderDiscount));
    const couponCents = Math.min(orderDiscountCents, cents(input.couponDiscount));
    const orderTaxCents = cents(input.orderTax);
    const netOrderCents = Math.max(0, subtotalCents - orderDiscountCents);

    return lines.map((line) => {
        const grossCents = cents(line.unitPrice * line.quantity);
        const allocated = subtotalCents > 0
            ? Math.min(grossCents, Math.round(orderDiscountCents * grossCents / subtotalCents))
            : 0;
        const couponAllocated = subtotalCents > 0
            ? Math.min(allocated, Math.round(couponCents * grossCents / subtotalCents))
            : 0;
        const netCents = grossCents - allocated;
        const taxAllocated = netOrderCents > 0
            ? Math.round(orderTaxCents * netCents / netOrderCents)
            : 0;
        return {
            ...line,
            grossAmount: money(grossCents),
            discountAllocated: money(allocated),
            couponDiscountAllocated: money(couponAllocated),
            netAmount: money(netCents),
            taxAllocated: money(taxAllocated),
            refundAmount: money(netCents + taxAllocated),
        };
    });
};

export const allocateCouponDiscount = (
    lines: RefundPricingLine[],
    orderSubtotal: number,
    couponDiscount: number,
) => allocateRefundPricing(lines, {
    orderSubtotal,
    orderDiscount: couponDiscount,
    couponDiscount,
    orderTax: 0,
});
