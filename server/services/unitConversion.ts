const UNITS: Record<string, { dimension: 'mass' | 'volume' | 'count'; factor: number }> = {
    mg: { dimension: 'mass', factor: 0.001 }, g: { dimension: 'mass', factor: 1 }, gram: { dimension: 'mass', factor: 1 }, grams: { dimension: 'mass', factor: 1 },
    kg: { dimension: 'mass', factor: 1000 }, kilogram: { dimension: 'mass', factor: 1000 }, kilograms: { dimension: 'mass', factor: 1000 }, lb: { dimension: 'mass', factor: 453.592 }, oz: { dimension: 'mass', factor: 28.3495 },
    ml: { dimension: 'volume', factor: 1 }, milliliter: { dimension: 'volume', factor: 1 }, milliliters: { dimension: 'volume', factor: 1 }, liter: { dimension: 'volume', factor: 1000 }, litre: { dimension: 'volume', factor: 1000 }, liters: { dimension: 'volume', factor: 1000 }, litres: { dimension: 'volume', factor: 1000 },
    piece: { dimension: 'count', factor: 1 }, pieces: { dimension: 'count', factor: 1 }, pcs: { dimension: 'count', factor: 1 }, unit: { dimension: 'count', factor: 1 }, units: { dimension: 'count', factor: 1 }, each: { dimension: 'count', factor: 1 },
};
const ALIASES: Record<string, string> = { كجم: 'kg', كيلو: 'kg', كيلوجرام: 'kg', جم: 'g', جرام: 'g', جرامات: 'g', ملجم: 'mg', لتر: 'liter', مل: 'ml', مليلتر: 'ml', قطعة: 'piece', قطع: 'pieces', وحدة: 'unit', count: 'unit', qty: 'unit', quantity: 'unit' };
export const normalizeUnit = (unit: string) => ALIASES[String(unit || '').trim().toLowerCase()] || String(unit || '').trim().toLowerCase();
export const canConvertUnits = (from: string, to: string) => {
    const a = UNITS[normalizeUnit(from)], b = UNITS[normalizeUnit(to)];
    return !!a && !!b && a.dimension === b.dimension;
};
export const convertQuantity = (value: number, from: string, to: string) => {
    const numeric = Number(value), a = UNITS[normalizeUnit(from)], b = UNITS[normalizeUnit(to)];
    if (!Number.isFinite(numeric)) throw new Error(`INVALID_UNIT_QUANTITY|value=${value}`);
    if (normalizeUnit(from) === normalizeUnit(to)) return numeric;
    if (!a || !b || a.dimension !== b.dimension) throw new Error(`INCOMPATIBLE_UNITS|from=${from}|to=${to}`);
    return numeric * a.factor / b.factor;
};
