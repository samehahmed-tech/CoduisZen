export const isBelowTableMinimumSpend = (
    subtotal: unknown,
    minimumSpend: unknown,
) => {
    const subtotalAmount = Number(subtotal);
    const minimumAmount = Math.max(0, Number(minimumSpend) || 0);
    return Number.isFinite(subtotalAmount) && minimumAmount > 0 && subtotalAmount < minimumAmount;
};
