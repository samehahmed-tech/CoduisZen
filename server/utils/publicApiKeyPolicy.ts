import { isAllowedOAuthRedirectUri } from './publicApiPkce';

export const PUBLIC_API_SCOPES = ['orders:read', 'orders:write', 'orders:quote', 'menu:read', 'sandbox:read', 'webhooks:read', 'webhooks:manage'] as const;
export type PublicApiScope = typeof PUBLIC_API_SCOPES[number];

export const validatePublicApiKeyInput = (input: { name: string; scopes: string[]; branchIds: string[]; redirectUris?: string[]; expiresAt?: Date | null }) => {
    const name = input.name.trim();
    const scopes = Array.from(new Set(input.scopes.map(scope => scope.trim())));
    const branchIds = Array.from(new Set(input.branchIds.map(branch => branch.trim()).filter(Boolean)));
    if (!name || name.length > 160) throw Object.assign(new Error('PUBLIC_API_KEY_NAME_INVALID'), { statusCode: 422 });
    if (!scopes.length || scopes.some(scope => !(PUBLIC_API_SCOPES as readonly string[]).includes(scope))) {
        throw Object.assign(new Error('PUBLIC_API_SCOPE_INVALID'), { statusCode: 422 });
    }
    if (!branchIds.length) throw Object.assign(new Error('PUBLIC_API_BRANCHES_REQUIRED'), { statusCode: 422 });
    const redirectUris = Array.from(new Set((input.redirectUris || []).map(uri => uri.trim()).filter(Boolean)));
    if (redirectUris.some(uri => !isAllowedOAuthRedirectUri(uri))) {
        throw Object.assign(new Error('PUBLIC_API_REDIRECT_URIS_INVALID'), { statusCode: 422 });
    }
    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
        throw Object.assign(new Error('PUBLIC_API_EXPIRY_INVALID'), { statusCode: 422 });
    }
    return input.redirectUris === undefined
        ? { name, scopes, branchIds }
        : { name, scopes, branchIds, redirectUris };
};
