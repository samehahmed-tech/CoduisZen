import type { AppSettings, Order, OrderItem } from '../types';

type TaxRateInput = number | null | undefined;

export interface CalculatedOrderTotals {
    subtotal: number;
    itemDiscountTotal: number;
    orderDiscountAmount: number;
    orderDiscountPercent: number;
    afterDiscount: number;
    taxRate: number;
    tax: number;
    tipAmount: number;
    serviceCharge: number;
    deliveryFee: number;
    total: number;
}

const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const normalizeTaxRate = (value: TaxRateInput, fallback = 0.14) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    if (parsed > 1) return parsed / 100;
    return parsed;
};

export const calculateOrderTotals = ({
    items,
    discountPercent = 0,
    discountAmount,
    tipAmount = 0,
    taxRate,
    taxAmount,
    totalAmount,
    serviceCharge = 0,
    deliveryFee = 0,
}: {
    items: OrderItem[];
    discountPercent?: number;
    discountAmount?: number | null;
    tipAmount?: number;
    taxRate?: TaxRateInput;
    taxAmount?: number | null;
    totalAmount?: number | null;
    serviceCharge?: number;
    deliveryFee?: number;
}): CalculatedOrderTotals => {
    let itemDiscountTotal = 0;

    const subtotal = roundMoney((items || []).reduce((acc, item) => {
        const modsPrice = (item.selectedModifiers || []).reduce((sum, mod) => sum + Number(mod.price || 0), 0);
        const lineGross = (Number(item.price || 0) + modsPrice) * Number(item.quantity || 1);
        let lineDiscount = 0;

        if (item.itemDiscount && item.itemDiscount > 0) {
            lineDiscount = item.itemDiscountType === 'percent'
                ? lineGross * (Number(item.itemDiscount || 0) / 100)
                : Number(item.itemDiscount || 0);
        }

        itemDiscountTotal += lineDiscount;
        return acc + (lineGross - lineDiscount);
    }, 0));

    const orderDiscountAmount = roundMoney(Math.max(0, Math.min(
        subtotal,
        discountAmount == null
            ? subtotal * (Number(discountPercent || 0) / 100)
            : Number(discountAmount || 0),
    )));
    const orderDiscountPercent = subtotal > 0
        ? roundMoney((orderDiscountAmount / subtotal) * 100)
        : 0;
    const afterDiscount = roundMoney(subtotal - orderDiscountAmount);
    const normalizedTaxRate = normalizeTaxRate(taxRate);
    const resolvedTax = taxAmount != null
        ? roundMoney(Number(taxAmount))
        : roundMoney(afterDiscount * normalizedTaxRate);
    const resolvedTip = roundMoney(Number(tipAmount || 0));
    const resolvedServiceCharge = roundMoney(Number(serviceCharge || 0));
    const resolvedDeliveryFee = roundMoney(Number(deliveryFee || 0));
    const resolvedTotal = totalAmount != null
        ? roundMoney(Number(totalAmount))
        : roundMoney(afterDiscount + resolvedTax + resolvedTip + resolvedServiceCharge + resolvedDeliveryFee);

    return {
        subtotal,
        itemDiscountTotal: roundMoney(itemDiscountTotal),
        orderDiscountAmount,
        orderDiscountPercent,
        afterDiscount,
        taxRate: normalizedTaxRate,
        tax: resolvedTax,
        tipAmount: resolvedTip,
        serviceCharge: resolvedServiceCharge,
        deliveryFee: resolvedDeliveryFee,
        total: resolvedTotal,
    };
};

export const calculateOrderTotalsFromOrder = (order: Partial<Order>, settings?: Partial<AppSettings>) =>
    calculateOrderTotals({
        items: order.items || [],
        discountAmount: Number(order.discount || 0),
        tipAmount: Number(order.tipAmount || 0),
        taxRate: settings?.taxRate,
        taxAmount: order.tax,
        totalAmount: order.total,
        serviceCharge: Number((order as any).serviceCharge || settings?.serviceCharge || 0),
        deliveryFee: Number((order as any).deliveryFee || 0),
    });

/**
 * Wire format for order discounts (POST /api/orders).
 *
 * Repo contract: `order.discount` is always MONEY (an amount), never a
 * percent — see calculateOrderTotalsFromOrder and the receipt generators.
 * The server applies `discount_type: 'PERCENT'` as subtotal × value / 100,
 * so sending an amount tagged PERCENT silently inflates the discount
 * (e.g. 15 EGP off 150 becomes a 15% / 22.50 cut).
 *
 * With a coupon the server computes the coupon value authoritatively from
 * `couponCode` and stacks it on top of the manual discount, therefore the
 * manual part must be zeroed — otherwise the client's coupon estimate
 * would be counted twice.
 */
export const buildOrderDiscountPayload = (order: {
    discount?: unknown;
    couponCode?: unknown;
}): { discount: number; discount_type: 'AMOUNT' | 'COUPON' } => {
    const couponCode = String((order as any)?.couponCode || '').trim();
    if (couponCode) return { discount: 0, discount_type: 'COUPON' };
    const amount = Number((order as any)?.discount || 0);
    return { discount: Number.isFinite(amount) && amount > 0 ? amount : 0, discount_type: 'AMOUNT' };
};
