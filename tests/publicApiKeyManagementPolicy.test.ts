import { describe, expect, it } from 'vitest';
import { validatePublicApiKeyInput } from '../server/utils/publicApiKeyPolicy';

describe('managed public API key policy', () => {
    it('accepts only supported least-privilege scopes and normalizes duplicates', () => {
        expect(validatePublicApiKeyInput({
            name: ' Partner ',
            scopes: ['orders:read', 'orders:read'],
            branchIds: ['branch-a', 'branch-a'],
        })).toEqual({ name: 'Partner', scopes: ['orders:read'], branchIds: ['branch-a'] });
    });

    it('accepts order-write scope but rejects unsupported scopes and branchless credentials', () => {
        expect(validatePublicApiKeyInput({ name: 'x', scopes: ['orders:write'], branchIds: ['branch-a'] })).toEqual({ name: 'x', scopes: ['orders:write'], branchIds: ['branch-a'] });
        expect(() => validatePublicApiKeyInput({ name: 'x', scopes: ['orders:unknown'], branchIds: ['branch-a'] })).toThrow('PUBLIC_API_SCOPE_INVALID');
        expect(() => validatePublicApiKeyInput({ name: 'x', scopes: ['orders:read'], branchIds: [] })).toThrow('PUBLIC_API_BRANCHES_REQUIRED');
    });

    it('rejects already expired credentials before they reach storage', () => {
        expect(() => validatePublicApiKeyInput({
            name: 'expired',
            scopes: ['sandbox:read'],
            branchIds: ['*'],
            expiresAt: new Date(Date.now() - 1000),
        })).toThrow('PUBLIC_API_EXPIRY_INVALID');
    });

    it('allows only HTTPS or localhost OAuth redirect URIs', () => {
        expect(validatePublicApiKeyInput({
            name: 'oauth-client',
            scopes: ['orders:read'],
            branchIds: ['branch-a'],
            redirectUris: ['https://app.example.com/callback', 'https://app.example.com/callback'],
        })).toMatchObject({ redirectUris: ['https://app.example.com/callback'] });
        expect(() => validatePublicApiKeyInput({
            name: 'oauth-client',
            scopes: ['orders:read'],
            branchIds: ['branch-a'],
            redirectUris: ['http://evil.example.com/callback'],
        })).toThrow('PUBLIC_API_REDIRECT_URIS_INVALID');
    });
});
