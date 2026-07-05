import { apiRequest } from './core';

export const inventoryApi = {
    getAll: (since?: string) => apiRequest<any[]>(`/inventory${since ? `?since=${since}` : ''}`),
    create: (item: any) => apiRequest<any>('/inventory', { method: 'POST', body: JSON.stringify(item) }),
    update: (id: string, item: any) => apiRequest<any>(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(item) }),
    delete: (id: string) => apiRequest<any>(`/inventory/${id}`, { method: 'DELETE' }),
    getWarehouses: () => apiRequest<any[]>('/warehouses'),
    createWarehouse: (warehouse: any) => apiRequest<any>('/warehouses', { method: 'POST', body: JSON.stringify(warehouse) }),
    updateStock: (data: { item_id: string; warehouse_id: string; quantity: number; type: string; reason?: string; actor_id?: string; reference_id?: string }) =>
        apiRequest<any>('/inventory/stock/update', { method: 'POST', body: JSON.stringify(data) }),
    transferStock: (data: { item_id: string; from_warehouse_id: string; to_warehouse_id: string; quantity: number; reason?: string; actor_id?: string; reference_id?: string }) =>
        apiRequest<any>('/inventory/stock/transfer', { method: 'POST', body: JSON.stringify(data) }),
    getTransfers: (limit?: number) => apiRequest<any[]>(`/inventory/stock/transfers${limit ? `?limit=${limit}` : ''}`),
    getRecipeConsumption: (params?: { startDate?: string; endDate?: string; branchId?: string; limit?: number }) => {
        const query = new URLSearchParams();
        if (params?.startDate) query.set('startDate', params.startDate);
        if (params?.endDate) query.set('endDate', params.endDate);
        if (params?.branchId) query.set('branchId', params.branchId);
        if (params?.limit) query.set('limit', String(params.limit));
        const qs = query.toString();
        return apiRequest<any[]>(`/inventory/stock/recipe-consumption${qs ? `?${qs}` : ''}`);
    },
    getStockCounts: (params?: { branchId?: string; warehouseId?: string; date?: string; status?: string; limit?: number }) => {
        const query = new URLSearchParams();
        if (params?.branchId) query.set('branchId', params.branchId);
        if (params?.warehouseId) query.set('warehouseId', params.warehouseId);
        if (params?.date) query.set('date', params.date);
        if (params?.status) query.set('status', params.status);
        if (params?.limit) query.set('limit', String(params.limit));
        const qs = query.toString();
        return apiRequest<any[]>(`/inventory/counts${qs ? `?${qs}` : ''}`);
    },
    getStockCount: (id: string) => apiRequest<any>(`/inventory/counts/${id}`),
    createStockCount: (payload: { branchId: string; warehouseId: string; countDate?: string; type?: string; remarks?: string; userId?: string }) =>
        apiRequest<any>('/inventory/counts', { method: 'POST', body: JSON.stringify(payload) }),
    freezeStockCount: (id: string) => apiRequest<any>(`/inventory/counts/${id}/freeze`, { method: 'POST' }),
    submitCount: (id: string, counts: Array<{ itemId: string; countedQty: number; notes?: string }>) => apiRequest<any>(`/inventory/counts/${id}/submit`, { method: 'POST', body: JSON.stringify({ counts }) }),
    postStockCount: (id: string) => apiRequest<any>(`/inventory/counts/${id}/post`, { method: 'POST' })
};
