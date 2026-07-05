import { apiRequest } from './core';

export const shiftsApi = {
    getActive: (branchId: string) =>
        apiRequest<any>(`/shifts/active?branchId=${encodeURIComponent(branchId)}`),
    getXReport: (shiftId: string, branchId?: string) => {
        const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
        return apiRequest<any>(`/shifts/${shiftId}/x-report${query}`);
    },
    open: (data: { id: string; branchId: string; userId: string; openingBalance: number; notes?: string }) =>
        apiRequest<any>('/shifts/open', { method: 'POST', body: JSON.stringify(data) }),
    close: (id: string, data: { actualBalance: number; notes?: string; branchId?: string }) =>
        apiRequest<any>(`/shifts/${id}/close`, { method: 'PUT', body: JSON.stringify(data) }),
};
