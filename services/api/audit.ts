import { apiRequest } from './core';

export const auditApi = {
    getAll: (params?: { event_type?: string; user_id?: string; limit?: number }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/audit-logs${query ? `?${query}` : ''}`);
    },
    create: (log: any) => apiRequest<any>('/audit-logs', { method: 'POST', body: JSON.stringify(log) }),
};
