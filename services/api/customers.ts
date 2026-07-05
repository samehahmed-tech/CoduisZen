import { apiRequest } from './core';

export const customersApi = {
    getAll: (params?: { search?: string; phone?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/customers${query ? `?${query}` : ''}`);
    },
    getById: (id: string) => apiRequest<any>(`/customers/${encodeURIComponent(id)}`),
    getByPhone: (phone: string) => apiRequest<any>(`/customers/phone/${encodeURIComponent(phone)}`),
    create: (customer: any) => apiRequest<any>('/customers', { method: 'POST', body: JSON.stringify(customer) }),
    update: (id: string, customer: any) => apiRequest<any>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(customer) }),
    delete: (id: string) => apiRequest<any>(`/customers/${id}`, { method: 'DELETE' }),
};
