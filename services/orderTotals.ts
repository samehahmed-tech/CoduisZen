import type { AppSettings, Order, OrderItem } from '../types';

type TaxRateInput = number | null | undefined;

export interface CalculatedOrderTotals {
    subtotal: number;
    itemDiscountTotal: number;
    orderDiscountAmount: number;
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
    tipAmount = 0,
    taxRate,
    taxAmount,
    totalAmount,
    serviceCharge = 0,
    deliveryFee = 0,
}: {
    items: OrderItem[];
    discountPercent?: number;
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

    const orderDiscountAmount = roundMoney(subtotal * (Number(discountPercent || 0) / 100));
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
        discountPercent: Number(order.discount || 0),
        tipAmount: Number(order.tipAmount || 0),
        taxRate: settings?.taxRate,
        taxAmount: order.tax,
        totalAmount: order.total,
        serviceCharge: Number((order as any).serviceCharge || settings?.serviceCharge || 0),
        deliveryFee: Number((order as any).deliveryFee || 0),
    });
