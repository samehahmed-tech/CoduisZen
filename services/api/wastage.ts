import { apiRequest } from './core';

export const wastageApi = {
    record: (data: { itemId: string; warehouseId: string; quantity: number; reason: string; notes?: string; performedBy?: string }) =>
        apiRequest<any>('/wastage', { method: 'POST', body: JSON.stringify(data) }),
    getReport: (params?: { startDate?: string; endDate?: string; warehouseId?: string; itemId?: string; reason?: string }) => {
        const query = new URLSearchParams(Object.entries(params || {}).filter(([, value]) => Boolean(value)) as string[][]).toString();
        return apiRequest<any>(`/wastage/report${query ? `?${query}` : ''}`);
    },
    getRecent: (limit?: number) => apiRequest<any[]>(`/wastage/recent${limit ? `?limit=${limit}` : ''}`),
};
