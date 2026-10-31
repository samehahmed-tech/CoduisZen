import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    rotateManagedPublicApiKey: vi.fn(),
    createSignedAuditLog: vi.fn(),
}));

vi.mock('../server/services/publicApiKeyStore', () => ({
    rotateManagedPublicApiKey: mocks.rotateManagedPublicApiKey,
    PUBLIC_API_SCOPES: ['orders:read'],
}));
vi.mock('../server/services/auditService', () => ({ createSignedAuditLog: mocks.createSignedAuditLog }));

import { rotateKey } from '../server/controllers/publicApiKeyController';

const response = () => {
    const state: any = { statusCode: 200, body: undefined };
    state.status = (code: number) => { state.statusCode = code; return state; };
    state.json = (body: unknown) => { state.body = body; return state; };
    return state;
};

describe('public API key rotation contract', () => {
    beforeEach(() => {
        mocks.rotateManagedPublicApiKey.mockReset();
        mocks.createSignedAuditLog.mockReset();
        mocks.createSignedAuditLog.mockResolvedValue(undefined);
    });

    it('returns the replacement secret once and audits only metadata', async () => {
        mocks.rotateManagedPublicApiKey.mockResolvedValue({
            replacedKeyId: 'old-key',
            metadata: { id: 'new-key', keyPrefix: 'rf_live_123', scopes: ['orders:read'], branchIds: ['branch-1'], expiresAt: null },
            secret: 'rf_live_secret-never-log',
        });
        const res = response();
        await rotateKey({ params: { id: 'old-key' }, body: {}, user: { id: 'admin-1' }, headers: {} } as any, res as any);

        expect(res.statusCode).toBe(201);
        expect(res.body).toMatchObject({ id: 'new-key', replacedKeyId: 'old-key', secret: 'rf_live_secret-never-log' });
        expect(JSON.stringify(mocks.createSignedAuditLog.mock.calls[0]?.[0] || {})).not.toContain('rf_live_secret-never-log');
    });

    it('rejects an invalid expiry before touching the rotation service', async () => {
        const res = response();
        await rotateKey({ params: { id: 'old-key' }, body: { expiresAt: 'not-a-date' }, user: { id: 'admin-1' }, headers: {} } as any, res as any);

        expect(res.statusCode).toBe(422);
        expect(mocks.rotateManagedPublicApiKey).not.toHaveBeenCalled();
    });
});
