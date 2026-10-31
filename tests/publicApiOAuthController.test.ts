import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    findManagedPublicApiClient: vi.fn(),
    findManagedPublicApiClientById: vi.fn(),
    consumePublicApiAuthorizationCode: vi.fn(),
    createPublicApiRefreshTokenRecord: vi.fn(),
    consumePublicApiRefreshToken: vi.fn(),
}));
vi.mock('../server/services/publicApiKeyStore', () => mocks);

import { issuePublicApiAccessToken } from '../server/controllers/publicApiOAuthController';

const response = () => {
    const state: any = { statusCode: 200, headers: {}, body: undefined };
    state.status = (code: number) => { state.statusCode = code; return state; };
    state.setHeader = (name: string, value: string) => { state.headers[name] = value; return state; };
    state.json = (body: unknown) => { state.body = body; return state; };
    return state;
};

describe('public API OAuth token endpoint', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = 'oauth-test-secret';
        mocks.findManagedPublicApiClient.mockReset();
        mocks.findManagedPublicApiClientById.mockReset();
        mocks.consumePublicApiAuthorizationCode.mockReset();
        mocks.createPublicApiRefreshTokenRecord.mockReset();
        mocks.consumePublicApiRefreshToken.mockReset();
        mocks.createPublicApiRefreshTokenRecord.mockResolvedValue(undefined);
    });

    it('issues a short-lived bearer token with only granted scopes', async () => {
        mocks.findManagedPublicApiClient.mockResolvedValue({ id: 'client-1', scopes: ['orders:read'], branchIds: ['branch-1'] });
        const res = response();
        await issuePublicApiAccessToken({
            body: { grant_type: 'client_credentials', client_id: 'client-1', client_secret: 'secret', scope: 'orders:read' },
            header: () => '',
        } as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'orders:read' });
        expect(res.body.refresh_token).toContain('.');
        expect(String(res.body.access_token)).toContain('.');
    });

    it('rejects a scope escalation without issuing a token', async () => {
        mocks.findManagedPublicApiClient.mockResolvedValue({ id: 'client-1', scopes: ['orders:read'], branchIds: ['branch-1'] });
        const res = response();
        await issuePublicApiAccessToken({
            body: { grant_type: 'client_credentials', client_id: 'client-1', client_secret: 'secret', scope: 'sandbox:read' },
            header: () => '',
        } as any, res as any);

        expect(res.statusCode).toBe(400);
        expect(res.body).toMatchObject({ error: 'invalid_scope' });
    });

    it('rotates a refresh token once and rechecks active client scopes', async () => {
        const refreshToken = (await import('jsonwebtoken')).default.sign({
            sub: 'client-1', typ: 'restoflow-public-api-refresh', iss: 'restoflow-public-api',
            jti: 'refresh-1', scopes: ['orders:read'], branchIds: ['branch-1'],
        }, 'oauth-test-secret', { expiresIn: 3600 });
        mocks.findManagedPublicApiClientById.mockResolvedValue({ id: 'client-1', scopes: ['orders:read'], branchIds: ['branch-1'] });
        mocks.consumePublicApiRefreshToken.mockResolvedValue({ clientId: 'client-1', expiresAt: new Date(Date.now() + 60_000) });
        const res = response();
        await issuePublicApiAccessToken({ body: { grant_type: 'refresh_token', refresh_token: refreshToken }, header: () => '' } as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ token_type: 'Bearer', scope: 'orders:read' });
        expect(mocks.consumePublicApiRefreshToken).toHaveBeenCalled();
        expect(mocks.createPublicApiRefreshTokenRecord).toHaveBeenCalledTimes(1);
    });

    it('rejects a replayed refresh token', async () => {
        const refreshToken = (await import('jsonwebtoken')).default.sign({
            sub: 'client-1', typ: 'restoflow-public-api-refresh', iss: 'restoflow-public-api', jti: 'refresh-replayed',
            scopes: ['orders:read'], branchIds: ['branch-1'],
        }, 'oauth-test-secret');
        mocks.findManagedPublicApiClientById.mockResolvedValue({ id: 'client-1', scopes: ['orders:read'], branchIds: ['branch-1'] });
        mocks.consumePublicApiRefreshToken.mockResolvedValue(null);
        const res = response();
        await issuePublicApiAccessToken({ body: { grant_type: 'refresh_token', refresh_token: refreshToken }, header: () => '' } as any, res as any);
        expect(res.statusCode).toBe(400);
        expect(res.body).toMatchObject({ error: 'invalid_grant' });
    });

    it('exchanges a one-time authorization code only with the matching PKCE verifier', async () => {
        const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXA';
        mocks.findManagedPublicApiClientById.mockResolvedValue({ id: 'client-1', scopes: ['orders:read'], branchIds: ['branch-1'] });
        mocks.consumePublicApiAuthorizationCode.mockResolvedValue({ clientId: 'client-1', scopes: ['orders:read'], branchIds: ['branch-1'] });
        const res = response();
        await issuePublicApiAccessToken({
            body: { grant_type: 'authorization_code', client_id: 'client-1', code: 'rf_code_one-time', redirect_uri: 'https://app.example.com/callback', code_verifier: verifier },
            header: () => '',
        } as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ token_type: 'Bearer', scope: 'orders:read' });
        expect(mocks.consumePublicApiAuthorizationCode).toHaveBeenCalledWith('rf_code_one-time', expect.objectContaining({ clientId: 'client-1', redirectUri: 'https://app.example.com/callback' }));
    });

    it('rejects an already-consumed authorization code', async () => {
        mocks.findManagedPublicApiClientById.mockResolvedValue({ id: 'client-1', scopes: ['orders:read'], branchIds: ['branch-1'] });
        mocks.consumePublicApiAuthorizationCode.mockResolvedValue(null);
        const res = response();
        await issuePublicApiAccessToken({
            body: { grant_type: 'authorization_code', client_id: 'client-1', code: 'rf_code_replayed', redirect_uri: 'https://app.example.com/callback', code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXA' },
            header: () => '',
        } as any, res as any);
        expect(res.statusCode).toBe(400);
        expect(res.body).toMatchObject({ error: 'invalid_grant' });
    });
});
