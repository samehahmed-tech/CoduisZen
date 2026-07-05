import { apiRequest } from './core';

export const whatsappApi = {
    getStatus: () => apiRequest<{
        ok: boolean;
        provider: string;
        configured?: boolean;
        status?: 'INITIALIZING' | 'AWAITING_SCAN' | 'READY' | 'DISCONNECTED' | 'AUTH_ERROR';
        qr?: string;
        bridgeUrl?: string;
        sessionId?: string;
        sessionName?: string;
        queueCount?: number;
        isProcessing?: boolean;
        checkedAt?: string;
        reason?: string;
        lastWebhookAt: string | null;
        inboxCount: number;
        openEscalations: number;
    }>('/whatsapp/status'),
    sendTest: (data: { to: string; text: string }) =>
        apiRequest<{ ok: boolean; result: any }>('/whatsapp/send-test', { method: 'POST', body: JSON.stringify(data) }),
    getInbox: (params?: { limit?: number; from?: string; branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ ok: boolean; total: number; inbox: any[] }>(`/whatsapp/inbox${query ? `?${query}` : ''}`);
    },
    getEscalations: (status?: 'OPEN' | 'RESOLVED') =>
        apiRequest<{ ok: boolean; total: number; escalations: any[] }>(`/whatsapp/escalations${status ? `?status=${status}` : ''}`),
    resolveEscalation: (id: string, resolutionNotes?: string) =>
        apiRequest<{ ok: boolean; escalation: any }>(`/whatsapp/escalations/${id}/resolve`, {
            method: 'PUT',
            body: JSON.stringify({ resolutionNotes: resolutionNotes || '' }),
        }),
};
