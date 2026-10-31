import { describe, expect, it } from 'vitest';
import { parseRequestedOAuthScopes, resolveOAuthScopes } from '../server/utils/publicApiOAuthPolicy';

describe('public API OAuth client-credentials policy', () => {
    it('parses space-delimited scopes and removes duplicates', () => {
        expect(parseRequestedOAuthScopes('orders:read sandbox:read orders:read')).toEqual(['orders:read', 'sandbox:read']);
    });

    it('defaults to all allowed scopes and rejects escalation', () => {
        expect(resolveOAuthScopes(undefined, ['orders:read', 'sandbox:read'])).toEqual(['orders:read', 'sandbox:read']);
        expect(() => resolveOAuthScopes('orders:write', ['orders:read'])).toThrow('OAUTH_SCOPE_FORBIDDEN');
    });
});
