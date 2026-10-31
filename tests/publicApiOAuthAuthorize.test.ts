import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    findManagedPublicApiClientById: vi.fn(),
    createPublicApiAuthorizationCode: vi.fn(),
}));
vi.mock('../server/services/publicApiKeyStore', () => mocks);

import { authorizePublicApi } from '../server/controllers/publicApiOAuthAuthorizeController';

const response = () => {
    const state: any = { statusCode: 200, body: undefined, redirected: undefined };
    state.status = (code: number) => { state.statusCode = code; return state; };
    state.json = (body: unknown) => { state.body = body; return state; };
    state.redirect = (_status: number, url: string) => { state.redirected = url; return state; };
    return state;
};

describe('public API OAuth authorization endpoint', () => {
    beforeEach(() => {
        mocks.findManagedPublicApiClientById.mockReset();
        mocks.createPublicApiAuthorizationCode.mockReset();
        mocks.createPublicApiAuthorizationCode.mockResolvedValue('rf_code_test');
    });

    const request = (consent: string) => ({
        query: {
            response_type: 'code',
            client_id: 'client-1',
            redirect_uri: 'https://app.example.com/callback',
            state: 'state-123',
            scope: 'orders:read',
            code_challenge: 'bg-qE9_oRKWSMTs0NG0Z4wCHtL_7saC-y174jTvSl18',
            code_challenge_method: 'S256',
            consent,
        },
        user: { id: 'user-1', role: 'BRANCH_MANAGER', branchId: 'branch-1', allowedBranches: ['branch-1'] },
    } as any);

    it('shows bounded consent data before issuing a code', async () => {
        mocks.findManagedPublicApiClientById.mockResolvedValue({ id: 'client-1', scopes: ['orders:read'], branchIds: ['branch-1'], redirectUris: ['https://app.example.com/callback'] });
        const res = response();
        await authorizePublicApi(request('') as any, res as any);
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ consent_required: true, scope: 'orders:read', state: 'state-123' });
        expect(mocks.createPublicApiAuthorizationCode).not.toHaveBeenCalled();
    });

    it('redirects with a one-time code only after approval', async () => {
        mocks.findManagedPublicApiClientById.mockResolvedValue({ id: 'client-1', scopes: ['orders:read'], branchIds: ['branch-1'], redirectUris: ['https://app.example.com/callback'] });
        const res = response();
        await authorizePublicApi(request('approve') as any, res as any);
        expect(res.statusCode).toBe(200);
        expect(res.redirected).toContain('https://app.example.com/callback?code=rf_code_test&state=state-123');
        expect(mocks.createPublicApiAuthorizationCode).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-1', userId: 'user-1', branchIds: ['branch-1'] }));
    });
});
