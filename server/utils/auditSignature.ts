import crypto from 'crypto';
import { requireEnv } from '../config/env';

export interface AuditSignatureInput {
    eventType: string;
    userId?: string | null;
    branchId?: string | null;
    deviceId?: string | null;
    payload?: any;
    before?: any;
    after?: any;
    reason?: string | null;
    createdAt: Date;
}

export const stableStringify = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

export const getAuditKeyVersion = () => {
    const parsed = Number.parseInt(String(process.env.AUDIT_HMAC_KEY_VERSION || '1'), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

const signWithSecret = (input: AuditSignatureInput, secret: string) => crypto.createHmac('sha256', secret)
    .update(stableStringify({
        eventType: input.eventType,
        userId: input.userId ?? null,
        branchId: input.branchId ?? null,
        deviceId: input.deviceId ?? null,
        payload: input.payload ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        reason: input.reason ?? null,
        createdAt: input.createdAt.toISOString(),
    }))
    .digest('hex');

const signaturesMatch = (actual: string, expected: string) => {
    const actualBuffer = Buffer.from(String(actual || ''), 'hex');
    const expectedBuffer = Buffer.from(String(expected || ''), 'hex');
    return actualBuffer.length > 0
        && actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

export const signAuditWithCurrentKey = (input: AuditSignatureInput) => ({
    signature: signWithSecret(input, requireEnv('AUDIT_HMAC_SECRET')),
    signatureVersion: getAuditKeyVersion(),
});

export const verifyAuditSignature = (input: AuditSignatureInput, signature: string, signatureVersion?: number | null) => {
    const currentVersion = getAuditKeyVersion();
    const version = Number(signatureVersion || 1);
    const candidates: string[] = [];
    if (version === currentVersion) candidates.push(String(process.env.AUDIT_HMAC_SECRET || ''));
    if (version === currentVersion - 1) candidates.push(String(process.env.AUDIT_HMAC_SECRET_PREVIOUS || ''));
    return candidates.filter(Boolean).some((secret) => signaturesMatch(signature, signWithSecret(input, secret)));
};
