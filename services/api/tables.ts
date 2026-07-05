import { apiRequest } from './core';

export const tablesApi = {
    getAll: (branchId: string) => apiRequest<any[]>(`/tables?branchId=${branchId}`),
    getZones: (branchId: string) => apiRequest<any[]>(`/tables/zones?branchId=${branchId}`),
    saveLayout: (data: { branchId: string; zones: any[]; tables: any[]; reference_id?: string }) =>
        apiRequest<any>('/tables/layout', { method: 'POST', body: JSON.stringify(data) }),
    transfer: (data: { sourceTableId: string; targetTableId: string; reference_id?: string }) =>
        apiRequest<any>('/tables/transfer', { method: 'POST', body: JSON.stringify(data) }),
    split: (data: { sourceTableId: string; targetTableId: string; items: Array<{ name: string; price: number; quantity: number }>; reference_id?: string }) =>
        apiRequest<any>('/tables/split', { method: 'POST', body: JSON.stringify(data) }),
    merge: (data: { sourceTableId: string; targetTableId: string; items: Array<{ name: string; price: number; quantity: number }>; reference_id?: string }) =>
        apiRequest<any>('/tables/merge', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string, currentOrderId?: string, reference_id?: string) =>
        apiRequest<any>(`/tables/${id}/status`, { method: 'PUT', body: JSON.stringify({ status, currentOrderId, reference_id }) }),
};
