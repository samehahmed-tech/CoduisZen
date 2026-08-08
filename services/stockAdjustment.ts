export const parseStockAdjustmentQuantity = (value: string | number): number | null => {
    if (typeof value === 'string' && value.trim() === '') return null;

    const quantity = Number(value);
    return Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
};

export const getStockAdjustmentPreview = (currentQuantity: number, value: string | number) => {
    const quantity = parseStockAdjustmentQuantity(value);
    const current = Number.isFinite(currentQuantity) ? currentQuantity : 0;

    return {
        currentQuantity: current,
        newQuantity: quantity,
        delta: quantity === null ? null : quantity - current,
        isValid: quantity !== null,
    };
};
