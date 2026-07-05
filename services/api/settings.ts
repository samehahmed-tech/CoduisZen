import { apiRequest } from './core';

export const settingsApi = {
    getAll: () => apiRequest<Record<string, any>>('/settings'),
    update: (key: string, value: any, category?: string, updatedBy?: string) =>
        apiRequest<any>(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value, category, updated_by: updatedBy }) }),
    updateBulk: (settings: Record<string, any>) =>
        apiRequest<any>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
};
