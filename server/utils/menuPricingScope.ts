/** Keep branch-specific prices private while the catalog itself remains shared. */
export const scopeMenuItemsToBranch = <T extends Record<string, any>>(items: T[], branchId?: string) => {
    if (!branchId) return items;
    return items.map((item) => {
        const pricing = Array.isArray(item.branchPricing)
            ? item.branchPricing
            : typeof item.branchPricing === 'string'
                ? (() => { try { return JSON.parse(item.branchPricing); } catch { return []; } })()
                : [];
        return {
            ...item,
            branchPricing: pricing.filter((entry: any) =>
                String(entry?.branchId ?? entry?.branch_id ?? '') === String(branchId),
            ),
        };
    });
};
