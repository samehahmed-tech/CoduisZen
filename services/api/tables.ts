import { apiRequest } from './core';

export const tablesApi = {
    getAll: (branchId: string) => apiRequest<any[]>(`/tables?branchId=${branchId}`),
    getZones: (branchId: string) => apiRequest<any[]>(`/tables/zones?branchId=${branchId}`),
    saveLayout: (data: { branchId: string; zones: any[]; tables: any[]; reference_id?: string }) =>
        apiRequest<any>('/tables/layout', { method: 'POST', body: JSON.stringify(data) }),
    transfer: (data: { sourceTableId: string; targetTableId: string; branchId: string; reference_id?: string }) =>
        apiRequest<any>('/tables/transfer', { method: 'POST', body: JSON.stringify(data) }),
    split: (data: { sourceTableId: string; targetTableId: string; branchId: string; items: Array<{ id?: string; name: string; price: number; quantity: number }>; sourceOrderIds?: string[]; reference_id?: string }) =>
        apiRequest<any>('/tables/split', { method: 'POST', body: JSON.stringify(data) }),
    merge: (data: { sourceTableId: string; targetTableId: string; branchId: string; items: Array<{ id?: string; name: string; price: number; quantity: number }>; sourceOrderIds?: string[]; reference_id?: string }) =>
        apiRequest<any>('/tables/merge', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: string, data: { status: string; currentOrderId?: string; reference_id?: string; branchId?: string }) =>
        apiRequest<any>(`/tables/${id}/status`, { method: 'PUT', body: JSON.stringify(data) }),
    reset: (id: string, reason?: string, branchId?: string) =>
        apiRequest<any>(`/tables/${id}/reset`, { method: 'POST', body: JSON.stringify({ reason, branchId }) }),
};
