import { apiRequest } from './core';

export const branchesApi = {
    getAll: () => apiRequest<any[]>(`/branches?_t=${Date.now()}`),
    getById: (id: string) => apiRequest<any>(`/branches/${id}`),
    create: (branch: any) => apiRequest<any>('/branches', { method: 'POST', body: JSON.stringify(branch) }),
    update: (id: string, branch: any) => apiRequest<any>(`/branches/${id}`, { method: 'PUT', body: JSON.stringify(branch) }),
    delete: (id: string, hard?: boolean) => apiRequest<any>(`/branches/${id}${hard ? '?hard=true' : ''}`, { method: 'DELETE' }),
};
