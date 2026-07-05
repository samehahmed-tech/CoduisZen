import { apiRequest } from './core';

export const refundApi = {
    getRefunds: (filters?: { branchId?: string; status?: string; orderId?: string }) => {
        const query = new URLSearchParams(filters as any).toString();
        return apiRequest<any[]>(`/refunds${query ? `?${query}` : ''}`);
    },
    getRefundById: (id: string) => apiRequest<any>(`/refunds/${id}`),
    requestRefund: (data: {
        orderId: string; type: string; reason: string; reasonCategory: string;
        refundMethod: string; requestedByName?: string;
        items?: { orderItemId: number; quantity: number; reason?: string }[];
        customAmount?: number;
    }) => apiRequest<any>('/refunds', { method: 'POST', body: JSON.stringify(data) }),
    approveRefund: (id: string) => apiRequest<any>(`/refunds/${id}/approve`, { method: 'PUT' }),
    rejectRefund: (id: string, reason: string) =>
        apiRequest<any>(`/refunds/${id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) }),
    processRefund: (id: string) => apiRequest<any>(`/refunds/${id}/process`, { method: 'POST' }),
    getPolicy: () => apiRequest<any>('/refunds/policy'),
    updatePolicy: (policy: any) => apiRequest<any>('/refunds/policy', { method: 'PUT', body: JSON.stringify(policy) }),
    getStats: (branchId?: string, startDate?: string, endDate?: string) => {
        const params: any = {};
        if (branchId) params.branchId = branchId;
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        const query = new URLSearchParams(params).toString();
        return apiRequest<any>(`/refunds/stats${query ? `?${query}` : ''}`);
    },
};
