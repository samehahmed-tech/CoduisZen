import { apiRequest } from './core';

export const platformsApi = {
    getAll: () => apiRequest<any[]>('/platforms'),
    create: (data: any) => apiRequest<any>('/platforms', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiRequest<any>(`/platforms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => apiRequest<any>(`/platforms/${id}`, { method: 'DELETE' }),
};

export const aggregatorsApi = {
    providers: () => apiRequest<any[]>('/integrations/providers'),
    update: (id: string, data: any) => apiRequest<any>(`/integrations/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    history: (id: string, limit = 50) => apiRequest<any>(`/integrations/providers/${id}/orders?limit=${limit}`),
    testOrder: (id: string, data?: any) => apiRequest<any>(`/integrations/providers/${id}/test-order`, { method: 'POST', body: JSON.stringify(data || {}) }),
};

export const paymobApi = {
    getConfig: () => apiRequest<any>('/payments/paymob/config'),
    saveConfig: (data: any) => apiRequest<any>('/payments/paymob/config', { method: 'PUT', body: JSON.stringify(data) }),
    intention: (data: any) => apiRequest<any>('/payments/paymob/intention', { method: 'POST', body: JSON.stringify(data) }),
    refund: (data: any) => apiRequest<any>('/payments/paymob/refund', { method: 'POST', body: JSON.stringify(data) }),
};

export const talabatApi = {
    getConfig: () => apiRequest<any>('/integrations/talabat/config'),
    saveConfig: (data: any) => apiRequest<any>('/integrations/talabat/config', { method: 'PUT', body: JSON.stringify(data) }),
    history: (limit = 50) => apiRequest<any>(`/integrations/talabat/orders?limit=${limit}`),
    syncOrder: (orderId: string, data?: any) => apiRequest<any>(`/integrations/talabat/orders/${orderId}/sync`, { method: 'POST', body: JSON.stringify(data || {}) }),
    fetchRemote: (talabatOrderId: string) => apiRequest<any>(`/integrations/talabat/orders/${talabatOrderId}`),
    testOrder: (data?: any) => apiRequest<any>('/integrations/talabat/test-order', { method: 'POST', body: JSON.stringify(data || {}) }),
    catalogPreview: () => apiRequest<any>('/integrations/talabat/catalog/preview'),
    catalogPush: (vendorId: string, products?: any[]) => apiRequest<any>('/integrations/talabat/catalog/push', { method: 'POST', body: JSON.stringify({ vendor_id: vendorId, products }) }),
    catalogJob: (jobId: string) => apiRequest<any>(`/integrations/talabat/catalog/jobs/${jobId}`),
    vendorCatalog: (vendorId: string, params?: any) => apiRequest<any>(`/integrations/talabat/vendors/${vendorId}/catalog${params ? `?${new URLSearchParams(params).toString()}` : ''}`),
    outletStatus: (vendorId: string) => apiRequest<any>(`/integrations/talabat/vendors/${vendorId}/status`),
    outletUpdate: (vendorId: string, data: any) => apiRequest<any>(`/integrations/talabat/vendors/${vendorId}/status`, { method: 'PUT', body: JSON.stringify(data) }),
    promoPreview: (data: any) => apiRequest<any>('/integrations/talabat/promotions/preview', { method: 'POST', body: JSON.stringify(data) }),
    promoPush: (data: any) => apiRequest<any>('/integrations/talabat/promotions/push', { method: 'POST', body: JSON.stringify(data) }),
    promoJob: (jobId: string) => apiRequest<any>(`/integrations/talabat/promotions/jobs/${jobId}`),
};
