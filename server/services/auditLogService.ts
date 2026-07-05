import crypto from 'crypto';
import { db } from '../db';
import { auditLogs } from '../../src/db/schema';
import { requireEnv } from '../config/env';

function stableStringify(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function computeAuditSignature(input: {
    eventType: string;
    userId?: string | null;
    branchId?: string | null;
    deviceId?: string | null;
    payload?: any;
    before?: any;
    after?: any;
    reason?: string | null;
    createdAt: Date;
}): string {
    const secret = requireEnv('AUDIT_HMAC_SECRET');
    const toSign = stableStringify({
        eventType: input.eventType,
        userId: input.userId ?? null,
        branchId: input.branchId ?? null,
        deviceId: input.deviceId ?? null,
        payload: input.payload ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        reason: input.reason ?? null,
        createdAt: input.createdAt.toISOString(),
    });
    return crypto.createHmac('sha256', secret).update(toSign).digest('hex');
}

type CreateAuditInput = {
    eventType: string;
    userId?: string | null;
    userName?: string | null;
    userRole?: string | null;
    branchId?: string | null;
    deviceId?: string | null;
    ipAddress?: string | null;
    payload?: any;
    before?: any;
    after?: any;
    reason?: string | null;
    createdAt?: Date;
};

export const createSignedAuditLog = async (input: CreateAuditInput) => {
    const createdAt = input.createdAt || new Date();
    const signature = computeAuditSignature({
        eventType: input.eventType,
        userId: input.userId,
        branchId: input.branchId,
        deviceId: input.deviceId,
        payload: input.payload,
        before: input.before,
        after: input.after,
        reason: input.reason,
        createdAt,
    });

    await db.insert(auditLogs).values({
        eventType: input.eventType,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        userRole: input.userRole ?? null,
        branchId: input.branchId ?? null,
        deviceId: input.deviceId ?? null,
        ipAddress: input.ipAddress ?? null,
        payload: input.payload ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        reason: input.reason ?? null,
        signature,
        createdAt,
    });
};
