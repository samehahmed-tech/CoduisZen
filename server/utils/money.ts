/**
 * Currency-safe arithmetic for values persisted in decimal/real columns.
 * Database schema migration to fixed-point columns is tracked separately;
 * all payment decisions must still compare integer minor units in-process.
 */
export const MONEY_SCALE = 100;

export const toMinorUnits = (value: number | string): number => {
    const raw = String(value).trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(raw)) {
        throw new RangeError(`Invalid monetary value: ${raw}`);
    }
    const negative = raw.startsWith('-');
    const unsigned = negative ? raw.slice(1) : raw;
    const [whole, fraction = ''] = unsigned.split('.');
    const cents = Number((fraction + '00').slice(0, 2));
    const roundedCents = fraction.length > 2 && Number(fraction[2]) >= 5 ? cents + 1 : cents;
    const minor = Number(whole) * MONEY_SCALE + roundedCents;
    if (!Number.isSafeInteger(minor)) throw new RangeError('Monetary value exceeds safe integer range');
    return negative ? -minor : minor;
};

export const fromMinorUnits = (minor: number): number => {
    if (!Number.isSafeInteger(minor)) throw new RangeError('Minor units must be a safe integer');
    return minor / MONEY_SCALE;
};

export const sameMoney = (left: number | string, right: number | string): boolean =>
    toMinorUnits(left) === toMinorUnits(right);
