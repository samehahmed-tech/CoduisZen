import { apiRequest } from './core';

export const fiscalApi = {
    submit: (orderId: string, options?: { force?: boolean }) =>
        apiRequest<any>('/fiscal/submit', { method: 'POST', body: JSON.stringify({ orderId, ...options }) }),
    getLogs: (params?: { branchId?: string; limit?: number }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/fiscal/logs${query ? `?${query}` : ''}`);
    },
    getConfig: () => apiRequest<{ ok: boolean; missing: string[] }>('/fiscal/config'),
    getReadiness: (branchId?: string) =>
        apiRequest<{
            ok: boolean;
            branchId: string;
            period: { from: string; to: string };
            config: { ok: boolean; missing: string[] };
            metrics24h: { submitted: number; pending: number; failed: number; total: number; successRate: number };
            deadLetter: { pendingCount: number; oldestPendingAgeMinutes: number };
            alerts: { configMissing: boolean; lowSuccessRate: boolean; hasPendingDlq: boolean; stalePendingDlq: boolean };
        }>(`/fiscal/readiness${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),
};
