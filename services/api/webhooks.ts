import { apiRequest } from './core';

export interface WebhookEndpointMetadata {
    id: string;
    name: string;
    url: string;
    events: string[];
    branchId: string | null;
    isActive: boolean;
    retryCount?: number;
    timeoutMs?: number;
    secretConfigured?: boolean;
    createdAt?: string | null;
}

export const webhooksApi = {
    list: () => apiRequest<WebhookEndpointMetadata[]>('/webhooks'),
    create: (data: { name: string; url: string; branchId?: string | null; events: string[]; retryCount?: number; timeoutMs?: number }) =>
        apiRequest<WebhookEndpointMetadata & { secret?: string }>('/webhooks', { method: 'POST', body: JSON.stringify(data) }),
    remove: (id: string) => apiRequest<{ success: boolean }>(`/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
