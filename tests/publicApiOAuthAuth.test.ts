import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { authenticatePublicApiKeyWithClients } from '../server/services/publicApiKeyService';

describe('public API OAuth bearer authentication', () => {
    it('rechecks client identity and narrows scopes from the signed token', () => {
        process.env.JWT_SECRET = 'bearer-test-secret';
        const token = jwt.sign({
            sub: 'client-1', typ: 'restoflow-public-api', iss: 'restoflow-public-api',
            scopes: ['orders:read'], branchIds: ['branch-1'],
        }, process.env.JWT_SECRET);
        const req: any = { header: (name: string) => name.toLowerCase() === 'authorization' ? `Bearer ${token}` : '' };
        const res: any = { status: () => res, json: (body: unknown) => { res.body = body; return res; } };
        let called = false;
        authenticatePublicApiKeyWithClients(req, res, () => { called = true; }, [{
            id: 'client-1', keyHash: 'a'.repeat(64), scopes: ['orders:read', 'sandbox:read'], branchIds: ['branch-1', 'branch-2'],
        }]);

        expect(called).toBe(true);
        expect(req.publicApiClient.scopes).toEqual(['orders:read']);
        expect(req.publicApiClient.branchIds).toEqual(['branch-1']);
    });
});
