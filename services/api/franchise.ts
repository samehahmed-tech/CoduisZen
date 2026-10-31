import { apiRequest, apiRequestBlob } from './core';

export type FranchiseRoyaltyPreview = {
    preview: true;
    period: { from: string; to: string };
    source: { entity: string; dateField: string; basis: string; statuses: string[] };
    totals: { eligibleOrderCount: number; netSales: number; royaltyAmount: number; marketingFeeAmount: number; totalDue: number };
    branches: Array<{
        branchId: string;
        branchName: string;
        configured: boolean;
        contractType: string | null;
        royaltyPercentage: number;
        marketingFeePercentage: number;
        eligibleOrderCount: number;
        netSales: number;
        royaltyAmount: number;
        marketingFeeAmount: number;
        totalDue: number;
    }>;
};

export const franchiseApi = {
    previewRoyalties: (from: string, to: string, branchIds?: string[]) => {
        const params = new URLSearchParams({ from, to });
        if (branchIds?.length) params.set('branchIds', branchIds.join(','));
        return apiRequest<FranchiseRoyaltyPreview>(`/franchise/royalties/preview?${params.toString()}`);
    },
    exportBranchData: (branchId: string, from: string, to: string) => {
        const params = new URLSearchParams({ branchId, from, to });
        return apiRequestBlob(`/ops/data-governance/branch-export?${params.toString()}`);
    },
};
