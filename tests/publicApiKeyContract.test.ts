import { describe, expect, it } from 'vitest';
import { hashPublicApiKey, parsePublicApiClients } from '../server/services/publicApiKeyService';

describe('public API key contract', () => {
    it('hashes raw keys and accepts only hash-only scoped clients', () => {
        const hash = hashPublicApiKey('partner-secret');
        const clients = parsePublicApiClients(JSON.stringify([
            { id: 'partner-a', keyHash: hash, scopes: ['orders:read'], branchIds: ['branch-a'] },
            { id: 'invalid-raw', key: 'partner-secret', scopes: ['orders:read'], branchIds: ['branch-a'] },
        ]));

        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        expect(clients).toHaveLength(1);
        expect(clients[0]).toMatchObject({ id: 'partner-a', scopes: ['orders:read'], branchIds: ['branch-a'] });
        expect(JSON.stringify(clients)).not.toContain('partner-secret');
    });

    it('rejects malformed, unscoped, or branchless key records', () => {
        expect(parsePublicApiClients(JSON.stringify([
            { id: 'bad-hash', keyHash: 'abc', scopes: ['orders:read'], branchIds: ['branch-a'] },
            { id: 'no-scope', keyHash: 'a'.repeat(64), scopes: [], branchIds: ['branch-a'] },
            { id: 'no-branch', keyHash: 'b'.repeat(64), scopes: ['orders:read'], branchIds: [] },
        ]))).toEqual([]);
    });

    it('supports rotation metadata while rejecting revoked and expired keys', () => {
        const hash = hashPublicApiKey('rotating-secret');
        const clients = parsePublicApiClients(JSON.stringify([
            { id: 'active', keyHash: hash, scopes: ['orders:read'], branchIds: ['branch-a'], expiresAt: '2099-01-01T00:00:00.000Z' },
            { id: 'revoked', keyHash: 'c'.repeat(64), scopes: ['orders:read'], branchIds: ['branch-a'], revoked: true },
            { id: 'expired', keyHash: 'd'.repeat(64), scopes: ['orders:read'], branchIds: ['branch-a'], expiresAt: '2020-01-01T00:00:00.000Z' },
        ]));

        expect(clients).toHaveLength(1);
        expect(clients[0]).toMatchObject({ id: 'active', expiresAt: '2099-01-01T00:00:00.000Z' });
    });
});
