export type ReconciliationDay = {
    date: string;
    revenue: number;
    netRevenue: number;
    orders: number;
    tax: number;
    discounts: number;
};

export type ReconciliationMismatch = {
    date: string;
    fields: Record<string, { expected: number; actual: number; difference: number }>;
};

const round = (value: number) => Number(value.toFixed(4));

/** Compares canonical order aggregates to persisted daily BI snapshots without mutating either side. */
export const reconcileDailyBranchSnapshots = (
    expected: ReconciliationDay[],
    actual: ReconciliationDay[],
    tolerance = 0.01,
): ReconciliationMismatch[] => {
    const byDate = new Map<string, { expected?: ReconciliationDay; actual?: ReconciliationDay }>();
    for (const row of expected) byDate.set(row.date, { ...byDate.get(row.date), expected: row });
    for (const row of actual) byDate.set(row.date, { ...byDate.get(row.date), actual: row });

    const fields: Array<keyof Omit<ReconciliationDay, 'date'>> = ['revenue', 'netRevenue', 'orders', 'tax', 'discounts'];
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).flatMap(([date, pair]) => {
        const expectedRow = pair.expected || { date, revenue: 0, netRevenue: 0, orders: 0, tax: 0, discounts: 0 };
        const actualRow = pair.actual || { date, revenue: 0, netRevenue: 0, orders: 0, tax: 0, discounts: 0 };
        const mismatch = Object.fromEntries(fields.flatMap(field => {
            const expectedValue = Number(expectedRow[field] || 0);
            const actualValue = Number(actualRow[field] || 0);
            const difference = round(expectedValue - actualValue);
            return Math.abs(difference) > tolerance
                ? [[field, { expected: round(expectedValue), actual: round(actualValue), difference }]]
                : [];
        }));
        return Object.keys(mismatch).length > 0 ? [{ date, fields: mismatch }] : [];
    });
};
