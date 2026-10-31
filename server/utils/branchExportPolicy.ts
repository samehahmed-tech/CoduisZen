export const MAX_BRANCH_EXPORT_ORDERS = 5000;
export const MAX_BRANCH_EXPORT_DAYS = 366;

export const assertBranchExportRange = (from: string, to: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error('INVALID_BRANCH_EXPORT_DATE_RANGE');
    const fromMs = Date.parse(`${from}T00:00:00Z`);
    const toMs = Date.parse(`${to}T00:00:00Z`);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || (toMs - fromMs) / 86400000 > MAX_BRANCH_EXPORT_DAYS) throw new Error('BRANCH_EXPORT_DATE_RANGE_TOO_LARGE');
};

