import { apiRequest } from './core';

export interface PublicApiKeyMetadata {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    branchIds: string[];
    expiresAt: string | null;
    revokedAt: string | null;
    lastUsedAt: string | null;
    createdBy: string | null;
    createdAt: string | null;
}

export const publicApiKeysApi = {
    list: () => apiRequest<{ data: PublicApiKeyMetadata[]; scopes: string[] }>('/public-api/keys'),
    create: (data: { name: string; scopes: string[]; branchIds: string[]; expiresAt?: string }) =>
        apiRequest<PublicApiKeyMetadata & { secret: string }>('/public-api/keys', { method: 'POST', body: JSON.stringify(data) }),
    revoke: (id: string) => apiRequest<PublicApiKeyMetadata>(`/public-api/keys/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
    rotate: (id: string, data?: { name?: string; scopes?: string[]; branchIds?: string[]; expiresAt?: string }) =>
        apiRequest<PublicApiKeyMetadata & { secret: string; replacedKeyId: string }>(`/public-api/keys/${encodeURIComponent(id)}/rotate`, { method: 'POST', body: JSON.stringify(data || {}) }),
};
