import { describe, expect, it } from 'vitest';
import { buildSafeAuditPayload, redactAuditValue } from '../server/utils/auditPayload';
import { signAuditWithCurrentKey, verifyAuditSignature } from '../server/utils/auditSignature';

describe('audit payload redaction', () => {
    it('removes secrets without losing business context', () => {
        const result = redactAuditValue({
            orderId: 'order-1',
            password: 'do-not-store',
            nested: { apiKey: 'do-not-store', amount: 42 },
        });
        expect(result).toEqual({
            orderId: 'order-1',
            password: '[REDACTED]',
            nested: { apiKey: '[REDACTED]', amount: 42 },
        });
    });

    it('handles circular payloads safely', () => {
        const value: any = { event: 'TEST' };
        value.self = value;
        expect(redactAuditValue(value)).toEqual({ event: 'TEST', self: '[CIRCULAR]' });
    });

    it('builds one canonical signed shape for audit writers', () => {
        expect(buildSafeAuditPayload({ apiKey: 'hidden', amount: 42 }, {
            requestId: 'req-1',
            sourceDevice: 'browser',
        })).toEqual({
            apiKey: '[REDACTED]',
            amount: 42,
            _auditContext: { requestId: 'req-1', sourceDevice: 'browser' },
        });
    });

    it('supports one previous audit key during rotation', () => {
        const before = {
            JWT: process.env.AUDIT_HMAC_SECRET,
            previous: process.env.AUDIT_HMAC_SECRET_PREVIOUS,
            version: process.env.AUDIT_HMAC_KEY_VERSION,
        };
        process.env.AUDIT_HMAC_SECRET = 'current-audit-secret-123456';
        process.env.AUDIT_HMAC_SECRET_PREVIOUS = 'previous-audit-secret-123456';
        process.env.AUDIT_HMAC_KEY_VERSION = '2';
        const input = { eventType: 'TEST', userId: 'u1', createdAt: new Date('2026-10-26T12:00:00Z') };
        const current = signAuditWithCurrentKey(input);
        expect(current.signatureVersion).toBe(2);
        expect(verifyAuditSignature(input, current.signature, 2)).toBe(true);

        process.env.AUDIT_HMAC_SECRET = 'previous-audit-secret-123456';
        process.env.AUDIT_HMAC_KEY_VERSION = '1';
        const legacy = signAuditWithCurrentKey(input);
        process.env.AUDIT_HMAC_SECRET = 'current-audit-secret-123456';
        process.env.AUDIT_HMAC_KEY_VERSION = '2';
        expect(verifyAuditSignature(input, legacy.signature, 1)).toBe(true);

        if (before.JWT === undefined) delete process.env.AUDIT_HMAC_SECRET; else process.env.AUDIT_HMAC_SECRET = before.JWT;
        if (before.previous === undefined) delete process.env.AUDIT_HMAC_SECRET_PREVIOUS; else process.env.AUDIT_HMAC_SECRET_PREVIOUS = before.previous;
        if (before.version === undefined) delete process.env.AUDIT_HMAC_KEY_VERSION; else process.env.AUDIT_HMAC_KEY_VERSION = before.version;
    });

    it('rejects a tampered signature and malformed signature safely', () => {
        const before = {
            secret: process.env.AUDIT_HMAC_SECRET,
            version: process.env.AUDIT_HMAC_KEY_VERSION,
        };
        process.env.AUDIT_HMAC_SECRET = 'current-audit-secret-123456';
        process.env.AUDIT_HMAC_KEY_VERSION = '2';
        const input = { eventType: 'BRIDGE_MUTATION', branchId: 'branch-1', createdAt: new Date('2026-10-27T12:00:00Z') };
        const signed = signAuditWithCurrentKey(input);
        expect(verifyAuditSignature(input, signed.signature, signed.signatureVersion)).toBe(true);
        expect(verifyAuditSignature({ ...input, branchId: 'branch-2' }, signed.signature, signed.signatureVersion)).toBe(false);
        expect(verifyAuditSignature(input, 'not-a-hex-signature', signed.signatureVersion)).toBe(false);

        if (before.secret === undefined) delete process.env.AUDIT_HMAC_SECRET; else process.env.AUDIT_HMAC_SECRET = before.secret;
        if (before.version === undefined) delete process.env.AUDIT_HMAC_KEY_VERSION; else process.env.AUDIT_HMAC_KEY_VERSION = before.version;
    });
});
