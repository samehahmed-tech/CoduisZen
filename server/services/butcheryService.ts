import { convertQuantity } from './unitConversion';

export type ButcheryOutputType = 'USABLE' | 'BY_PRODUCT' | 'WASTE';

export interface ButcheryOutputInput {
    itemId?: string | null;
    quantity: number;
    unit: string;
    outputType: ButcheryOutputType;
    warehouseId?: string;
    wasteReason?: string;
}

export interface AllocatedOutput extends ButcheryOutputInput {
    quantityInSourceUnit: number;
    yieldPct: number;
    allocatedUnitCost: number;
    totalAllocatedCost: number;
}

const EPS = 0.000001;
export const COST_TOLERANCE = 0.05;

const toQty = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
};

/** Convert an output quantity into the source unit for yield math. Throws INCOMPATIBLE_UNITS. */
export const toSourceUnit = (qty: number, fromUnit: string, sourceUnit: string): number =>
    convertQuantity(qty, fromUnit || sourceUnit, sourceUnit);

/** Yield % of a single output relative to the source quantity (both in source unit). */
export const calcYieldPct = (outputQtyInSourceUnit: number, sourceQty: number): number => {
    if (!Number.isFinite(outputQtyInSourceUnit) || !Number.isFinite(sourceQty) || sourceQty <= 0) return 0;
    return (outputQtyInSourceUnit / sourceQty) * 100;
};

/**
 * Allocate the source total cost across outputs proportionally by weight
 * (quantity converted to the source unit). WASTE lines receive their share
 * as tracked loss — they are recorded but never enter sellable stock — so
 * TotalAllocated + WasteShare == InputCost is preserved by construction.
 * Largest-remainder rounding keeps the penny on the biggest line.
 */
export const allocateCost = (
    sourceQty: number,
    sourceUnit: string,
    sourceTotalCost: number,
    outputs: ButcheryOutputInput[],
): AllocatedOutput[] => {
    const converted = outputs.map((o) => ({
        ...o,
        quantityInSourceUnit: toSourceUnit(Number(o.quantity), o.unit, sourceUnit),
    }));
    const totalConverted = converted.reduce((s, o) => s + o.quantityInSourceUnit, 0);
    if (totalConverted <= EPS) {
        return converted.map((o) => ({
            ...o,
            yieldPct: calcYieldPct(o.quantityInSourceUnit, sourceQty),
            allocatedUnitCost: 0,
            totalAllocatedCost: 0,
        }));
    }
    const raws = converted.map((o) => (o.quantityInSourceUnit / totalConverted) * sourceTotalCost);
    const floored = raws.map((r) => Math.floor(r * 100) / 100);
    let remainder = Math.round((sourceTotalCost - floored.reduce((s, v) => s + v, 0)) * 100);
    const order = raws
        .map((r, i) => ({ i, frac: r * 100 - Math.floor(r * 100) }))
        .sort((a, b) => b.frac - a.frac)
        .map((x) => x.i);
    const totals = [...floored];
    for (const i of order) {
        if (remainder <= 0) break;
        totals[i] = Math.round((totals[i] + 0.01) * 100) / 100;
        remainder -= 1;
    }
    return converted.map((o, i) => ({
        ...o,
        yieldPct: Math.round(calcYieldPct(o.quantityInSourceUnit, sourceQty) * 100) / 100,
        allocatedUnitCost:
            o.quantity > 0 ? Math.round((totals[i] / Number(o.quantity)) * 10000) / 10000 : 0,
        totalAllocatedCost: totals[i],
    }));
};

/** Usable yield = (USABLE + BY_PRODUCT) weight / input weight. Waste is excluded. */
export const calcUsableYieldPct = (
    allocated: { quantityInSourceUnit: number; outputType: ButcheryOutputType }[],
    sourceQty: number,
): number => {
    if (sourceQty <= 0) return 0;
    const usable = allocated
        .filter((o) => o.outputType === 'USABLE' || o.outputType === 'BY_PRODUCT')
        .reduce((s, o) => s + o.quantityInSourceUnit, 0);
    return Math.round((usable / sourceQty) * 100 * 100) / 100;
};

export const calcWastePct = (
    allocated: { quantityInSourceUnit: number; outputType: ButcheryOutputType }[],
    sourceQty: number,
): number => {
    if (sourceQty <= 0) return 0;
    const waste = allocated
        .filter((o) => o.outputType === 'WASTE')
        .reduce((s, o) => s + o.quantityInSourceUnit, 0);
    return Math.round((waste / sourceQty) * 100 * 100) / 100;
};

export const validateButcheryInput = (
    sourceQty: unknown,
    sourceUnit: unknown,
    outputs: ButcheryOutputInput[],
): string | null => {
    const qty = toQty(sourceQty);
    if (!Number.isFinite(qty) || qty <= 0) return 'INVALID_SOURCE_QTY';
    if (!sourceUnit || !String(sourceUnit).trim()) return 'SOURCE_UNIT_REQUIRED';
    if (!Array.isArray(outputs) || outputs.length === 0) return 'OUTPUTS_REQUIRED';
    const types: string[] = ['USABLE', 'BY_PRODUCT', 'WASTE'];
    for (const o of outputs) {
        const q = toQty(o.quantity);
        if (!Number.isFinite(q) || q < 0) return 'INVALID_OUTPUT_QTY';
        if (!o.unit || !String(o.unit).trim()) return 'OUTPUT_UNIT_REQUIRED';
        if (!types.includes(String(o.outputType))) return 'INVALID_OUTPUT_TYPE';
        if (String(o.outputType) !== 'WASTE' && (!o.itemId || !String(o.itemId).trim())) {
            return 'OUTPUT_ITEM_REQUIRED';
        }
    }
    // At least one stockable output — a 100% waste run is still legal (records loss).
    return null;
};

/** Absolute variance between expected template % and actual yield %. */
export const calcYieldVariance = (expectedPct: number, actualPct: number): number =>
    Math.round((Number(actualPct) - Number(expectedPct)) * 100) / 100;

export const butcheryService = {
    allocateCost,
    calcYieldPct,
    calcUsableYieldPct,
    calcWastePct,
    calcYieldVariance,
    toSourceUnit,
    validateButcheryInput,
    COST_TOLERANCE,
};
