import { apiRequest } from './core';

export const campaignsApi = {
    getAll: () => apiRequest<any[]>('/campaigns'),
    getStats: () => apiRequest<any>('/campaigns/stats'),
    create: (data: any) => apiRequest<any>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    dispatch: (id: string, data: { mode?: 'DRY_RUN' | 'SEND'; phones?: string[]; customerIds?: string[]; message?: string }) =>
        apiRequest<{
            ok: boolean;
            campaignId: string;
            method: 'SMS' | 'Email' | 'Push' | 'WHATSAPP';
            dryRun: boolean;
            recipients: number;
            sent: number;
            failed: number;
            dispatchId: string;
        }>(`/campaigns/${id}/dispatch`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiRequest<any>(`/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => apiRequest<any>(`/campaigns/${id}`, { method: 'DELETE' }),
};
