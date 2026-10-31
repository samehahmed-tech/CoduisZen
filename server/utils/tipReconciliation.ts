export const sumTipAllocations = (amounts: Array<number | string>) =>
    Math.round(amounts.reduce<number>((sum, amount) => sum + (Number(amount) || 0), 0) * 100) / 100;

export const assertTipAllocationBalanced = (pooledAmount: number | string, allocatedAmounts: Array<number | string>) => {
    const pooled = Math.round((Number(pooledAmount) || 0) * 100) / 100;
    const allocated = sumTipAllocations(allocatedAmounts);
    if (allocated !== pooled) {
        throw Object.assign(new Error('TIP_ALLOCATION_UNBALANCED'), {
            status: 409,
            code: 'TIP_ALLOCATION_UNBALANCED',
            pooled,
            allocated,
        });
    }
    return { pooled, allocated };
};
