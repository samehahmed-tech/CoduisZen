import { apiRequest } from './core';

export const printersApi = {
    getAll: (params?: { branchId?: string; active?: boolean }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/printers${query ? `?${query}` : ''}`);
    },
    getById: (id: string) => apiRequest<any>(`/printers/${id}`),
    create: (data: any) => apiRequest<any>('/printers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiRequest<any>(`/printers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    heartbeat: (id: string) => apiRequest<{ id: string; online: boolean; printer: any }>(`/printers/${id}/heartbeat`, { method: 'POST' }),
    delete: (id: string) => apiRequest<any>(`/printers/${id}`, { method: 'DELETE' }),
};
