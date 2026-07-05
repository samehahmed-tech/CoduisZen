import { apiRequest } from './core';

export const platformsApi = {
    getAll: () => apiRequest<any[]>('/platforms'),
    create: (data: any) => apiRequest<any>('/platforms', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiRequest<any>(`/platforms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => apiRequest<any>(`/platforms/${id}`, { method: 'DELETE' }),
};
