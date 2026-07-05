import { apiRequest } from './core';

export const suppliersApi = {
    getAll: (active?: boolean) => apiRequest<any[]>(`/suppliers${active ? '?active=true' : ''}`),
    getById: (id: string) => apiRequest<any>(`/suppliers/${id}`),
    create: (data: any) => apiRequest<any>('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiRequest<any>(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => apiRequest<any>(`/suppliers/${id}`, { method: 'DELETE' }),
};

export const purchaseOrdersApi = {
    getAll: (params?: { status?: string; supplierId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/purchase-orders${query ? `?${query}` : ''}`);
    },
    getById: (id: string) => apiRequest<any>(`/purchase-orders/${id}`),
    getGRNs: (params?: { supplierId?: string; poId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/purchase-orders/grn${query ? `?${query}` : ''}`);
    },
    getSupplierInvoices: (params?: { supplierId?: string; status?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/purchase-orders/invoices${query ? `?${query}` : ''}`);
    },
    create: (data: any) => apiRequest<any>('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
    receive: (id: string, data: { warehouseId: string; items: { itemId: string; receivedQty: number }[]; receivedBy?: string }) =>
        apiRequest<any>(`/purchase-orders/${id}/receive`, { method: 'PUT', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) =>
        apiRequest<any>(`/purchase-orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    createGRN: (data: any) => apiRequest<any>('/purchase-orders/grn', { method: 'POST', body: JSON.stringify(data) }),
    createSupplierInvoice: (data: any) => apiRequest<any>('/purchase-orders/invoices', { method: 'POST', body: JSON.stringify(data) }),
    approveSupplierInvoice: (id: string, managerId?: string) => 
        apiRequest<any>(`/purchase-orders/invoices/${id}/approve`, { method: 'POST', body: JSON.stringify({ managerId }) }),
};

export const productionApi = {
    getOrders: (params?: { status?: string; branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/production/orders${query ? `?${query}` : ''}`);
    },
    createOrder: (data: { targetItemId: string; quantityRequested: number; warehouseId: string; actorId?: string }) =>
        apiRequest<any>('/production/orders', { method: 'POST', body: JSON.stringify(data) }),
    startOrder: (id: string, data?: { actorId?: string }) =>
        apiRequest<any>(`/production/orders/${id}/start`, { method: 'PUT', body: JSON.stringify(data || {}) }),
    completeOrder: (id: string, data: { quantityProduced: number; actorId?: string }) =>
        apiRequest<any>(`/production/orders/${id}/complete`, { method: 'PUT', body: JSON.stringify(data) }),
    cancelOrder: (id: string, data?: { actorId?: string }) =>
        apiRequest<any>(`/production/orders/${id}/cancel`, { method: 'PUT', body: JSON.stringify(data || {}) }),
};
