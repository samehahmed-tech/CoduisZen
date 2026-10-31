import { apiRequest } from './core';

export const campaignsApi = {
    getAll: () => apiRequest<any[]>('/campaigns'),
    getStats: () => apiRequest<any>('/campaigns/stats'),
    getAutomationConfig: () => apiRequest<{ ok: boolean; config: { welcomeRegistration: boolean; dormantRecovery: boolean; birthdayOffer: boolean } }>('/campaigns/automation-config'),
    saveAutomationConfig: (config: { welcomeRegistration: boolean; dormantRecovery: boolean; birthdayOffer: boolean }) =>
        apiRequest<{ ok: boolean; config: typeof config }>('/campaigns/automation-config', { method: 'PUT', body: JSON.stringify({ config }) }),
    getDeliveryLogs: (id: string, limit = 100) => apiRequest<any>(`/campaigns/${encodeURIComponent(id)}/logs?limit=${Math.min(Math.max(limit, 1), 500)}`),
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

export type ManagedCoupon = {
    id: string;
    code: string;
    type: 'PERCENTAGE' | 'FIXED_AMOUNT';
    value: number;
    usedCount: number | null;
    usageLimit: number | null;
    isActive: boolean | null;
};

export const couponsApi = {
    getAll: () => apiRequest<ManagedCoupon[]>('/marketing/coupons'),
    createPercentage: (code: string, percent: number, campaignId?: string) => apiRequest<ManagedCoupon>('/marketing/coupons', {
        method: 'POST',
        body: JSON.stringify({ code, type: 'PERCENTAGE', value: percent, campaignId }),
    }),
};
