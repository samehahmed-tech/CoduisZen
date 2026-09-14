import { apiRequest } from './core';

export const inventoryApi = {
    getAll: (since?: string) => apiRequest<any[]>(`/inventory${since ? `?since=${since}` : ''}`),
    create: (item: any) => apiRequest<any>('/inventory', { method: 'POST', body: JSON.stringify(item) }),
    update: (id: string, item: any) => apiRequest<any>(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(item) }),
    delete: (id: string) => apiRequest<any>(`/inventory/${id}`, { method: 'DELETE' }),
    getWarehouses: () => apiRequest<any[]>('/warehouses'),
    createWarehouse: (warehouse: any) => apiRequest<any>('/warehouses', { method: 'POST', body: JSON.stringify(warehouse) }),
    updateWarehouse: (id: string, warehouse: any) => apiRequest<any>(`/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(warehouse) }),
    deleteWarehouse: (id: string) => apiRequest<any>(`/warehouses/${id}`, { method: 'DELETE' }),
    updateStock: (data: { item_id: string; warehouse_id: string; quantity: number; type: string; reason?: string; actor_id?: string; reference_id?: string }) =>
        apiRequest<any>('/inventory/stock/update', { method: 'POST', body: JSON.stringify(data) }),
    receiveStock: (data: {
        warehouse_id: string;
        supplier_id?: string;
        reference_id: string;
        actor_id?: string;
        items: Array<{ item_id: string; quantity: number; unit_cost: number; purchase_unit?: string }>;
    }) => apiRequest<any>('/inventory/stock/receive', { method: 'POST', body: JSON.stringify(data) }),
    transferStock: (data: { item_id: string; from_warehouse_id: string; to_warehouse_id: string; quantity: number; reason?: string; actor_id?: string; reference_id?: string }) =>
        apiRequest<any>('/inventory/stock/transfer', { method: 'POST', body: JSON.stringify(data) }),
    getTransferRequests: (params?: { status?: string; branchId?: string }) => {
        const query = new URLSearchParams();
        if (params?.status) query.set('status', params.status);
        if (params?.branchId) query.set('branchId', params.branchId);
        const qs = query.toString();
        return apiRequest<any[]>(`/inventory/stock/transfer-requests${qs ? `?${qs}` : ''}`);
    },
    getIncomingTransferRequests: (branchId?: string) => {
        const query = new URLSearchParams({ scope: 'incoming' });
        if (branchId) query.set('branchId', branchId);
        return apiRequest<any[]>(`/inventory/stock/transfer-requests?${query.toString()}`);
    },
    createTransferRequest: (data: {
        branchId: string;
        sourceWarehouseId?: string;
        destinationWarehouseId: string;
        priority?: string;
        notes?: string;
        items: Array<{ itemId: string; quantity: number; unit?: string }>;
    }) => apiRequest<any>('/inventory/stock/transfer-requests', { method: 'POST', body: JSON.stringify(data) }),
    approveTransferRequest: (id: string, sourceWarehouseId: string, items?: Array<{ itemId: string; approvedQty: number }>) =>
        apiRequest<any>(`/inventory/stock/transfer-requests/${id}/approve`, { method: 'POST', body: JSON.stringify({ sourceWarehouseId, items }) }),
    dispatchTransferRequest: (id: string) =>
        apiRequest<any>(`/inventory/stock/transfer-requests/${id}/dispatch`, { method: 'POST' }),
    receiveTransferRequest: (id: string) =>
        apiRequest<any>(`/inventory/stock/transfer-requests/${id}/receive`, { method: 'POST' }),
    cancelTransferRequest: (id: string) =>
        apiRequest<any>(`/inventory/stock/transfer-requests/${id}/cancel`, { method: 'POST' }),
    zeroStock: (data: { branchId: string; warehouseId?: string }) =>
        apiRequest<{ success: true; affectedRows: number }>('/inventory/stock/zero', {
            method: 'POST',
            body: JSON.stringify({ ...data, confirmation: 'ZERO_STOCK' }),
        }),
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
    getStockCounts: (params?: { branchId?: string; warehouseId?: string; date?: string; startDate?: string; endDate?: string; status?: string; limit?: number }) => {
        const query = new URLSearchParams();
        if (params?.branchId) query.set('branchId', params.branchId);
        if (params?.warehouseId) query.set('warehouseId', params.warehouseId);
        if (params?.date) query.set('date', params.date);
        if (params?.startDate) query.set('startDate', params.startDate);
        if (params?.endDate) query.set('endDate', params.endDate);
        if (params?.status) query.set('status', params.status);
        if (params?.limit) query.set('limit', String(params.limit));
        const qs = query.toString();
        return apiRequest<any[]>(`/inventory/counts${qs ? `?${qs}` : ''}`);
    },
    getStockCount: (id: string) => apiRequest<any>(`/inventory/counts/${id}`),
    createStockCount: (payload: { branchId: string; warehouseId: string; countDate?: string; type?: string; remarks?: string; userId?: string }) =>
        apiRequest<any>('/inventory/counts', { method: 'POST', body: JSON.stringify(payload) }),
    freezeStockCount: (id: string) => apiRequest<any>(`/inventory/counts/${id}/freeze`, { method: 'POST' }),
    submitCount: (
        id: string,
        counts: Array<{ itemId: string; countedQty: number | null; notes?: string }>,
        options?: { finalize?: boolean },
    ) => apiRequest<any>(`/inventory/counts/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ counts, finalize: options?.finalize }),
    }),
    postStockCount: (id: string) => apiRequest<any>(`/inventory/counts/${id}/post`, { method: 'POST' }),
    getMenuAvailability: (branchId: string, menuItemIds: string[], opts?: { signal?: AbortSignal }) => {
        const query = new URLSearchParams({ branchId, menuItemIds: menuItemIds.join(',') });
        return apiRequest<{ branchId: string; items: Array<{ menuItemId: string; hasRecipe: boolean; maxServings: number | null; short: boolean; shortIngredients: any[] }> }>(
            `/inventory/menu-availability?${query.toString()}`,
            opts?.signal ? { signal: opts.signal } : {},
        );
    },
};
