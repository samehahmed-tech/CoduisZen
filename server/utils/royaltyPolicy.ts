export const ROYALTY_ELIGIBLE_STATUSES = new Set(['COMPLETED', 'DELIVERED']);

export type RoyaltyPolicyInput = {
    subtotal: number;
    discount?: number | null;
    royaltyPercentage?: number | null;
    marketingFeePercentage?: number | null;
};

export type RoyaltyPolicyResult = {
    netSales: number;
    royaltyAmount: number;
    marketingFeeAmount: number;
    totalDue: number;
};

const toCents = (value: unknown) => Math.round((Number(value) || 0) * 100);
const fromCents = (value: number) => value / 100;

export const normalizeFeePercentage = (value: unknown, field: string): number => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
        throw new Error(`${field}_PERCENTAGE_OUT_OF_RANGE`);
    }
    return numeric;
};

export const calculateRoyalty = (input: RoyaltyPolicyInput): RoyaltyPolicyResult => {
    const netSalesCents = Math.max(0, toCents(input.subtotal) - toCents(input.discount));
    const royaltyPercentage = normalizeFeePercentage(input.royaltyPercentage, 'ROYALTY');
    const marketingFeePercentage = normalizeFeePercentage(input.marketingFeePercentage, 'MARKETING_FEE');
    const royaltyCents = Math.round(netSalesCents * royaltyPercentage / 100);
    const marketingCents = Math.round(netSalesCents * marketingFeePercentage / 100);
    return {
        netSales: fromCents(netSalesCents),
        royaltyAmount: fromCents(royaltyCents),
        marketingFeeAmount: fromCents(marketingCents),
        totalDue: fromCents(royaltyCents + marketingCents),
    };
};

export const isEligibleRoyaltyOrder = (status: unknown) => ROYALTY_ELIGIBLE_STATUSES.has(String(status || '').toUpperCase());

