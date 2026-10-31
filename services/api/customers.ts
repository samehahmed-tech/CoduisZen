import { apiRequest } from './core';

export const customersApi = {
    getAll: (params?: { search?: string; phone?: string }, opts?: { signal?: AbortSignal }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/customers${query ? `?${query}` : ''}`, opts?.signal ? { signal: opts.signal } : {});
    },
    getById: (id: string) => apiRequest<any>(`/customers/${encodeURIComponent(id)}`),
    get360: (id: string) => apiRequest<any>(`/customers/${encodeURIComponent(id)}/360`),
    getByPhone: (phone: string) => apiRequest<any>(`/customers/phone/${encodeURIComponent(phone)}`),
    getIdentityCandidates: (params: { phone?: string; email?: string }) => apiRequest<any>(`/customers/identity-candidates?${new URLSearchParams(params as any).toString()}`),
    getDuplicateReport: () => apiRequest<any>('/customers/identity-duplicates'),
    merge: (sourceId: string, targetCustomerId: string) => apiRequest<any>(`/customers/${encodeURIComponent(sourceId)}/merge`, { method: 'POST', body: JSON.stringify({ targetCustomerId, confirmation: 'MERGE_CUSTOMER' }) }),
    updateMarketingConsent: (id: string, marketingOptIn: boolean, channel: 'GLOBAL' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH' = 'GLOBAL') => apiRequest<any>(`/customers/${encodeURIComponent(id)}/marketing-consent`, { method: 'PATCH', body: JSON.stringify({ marketingOptIn, channel }) }),
    create: (customer: any) => apiRequest<any>('/customers', { method: 'POST', body: JSON.stringify(customer) }),
    update: (id: string, customer: any) => apiRequest<any>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(customer) }),
    delete: (id: string) => apiRequest<any>(`/customers/${id}`, { method: 'DELETE' }),
    addAddress: (id: string, address: any) => apiRequest<any>(`/customers/${encodeURIComponent(id)}/addresses`, { method: 'POST', body: JSON.stringify(address) }),
};
