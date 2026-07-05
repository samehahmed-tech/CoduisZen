import { apiRequest } from './core';

export const wastageApi = {
    record: (data: { itemId: string; warehouseId: string; quantity: number; reason: string; notes?: string; performedBy?: string }) =>
        apiRequest<any>('/wastage', { method: 'POST', body: JSON.stringify(data) }),
    getReport: () => apiRequest<any>('/wastage/report'),
    getRecent: (limit?: number) => apiRequest<any[]>(`/wastage/recent${limit ? `?limit=${limit}` : ''}`),
};
