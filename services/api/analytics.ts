import { apiRequest } from './core';

export const analyticsApi = {
    getBranchPerformance: (params?: { branchId?: string; startDate?: string; endDate?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/analytics/branches${query ? `?${query}` : ''}`);
    },
    getLeaderboard: (limit = 5) =>
        apiRequest<any[]>(`/analytics/leaderboard?limit=${encodeURIComponent(String(limit))}`),
};
