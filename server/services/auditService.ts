/**
 * Audit Service Helper
 * For creating signed audit logs from other services
 */

import { db } from '../db';
import { auditLogs } from '../../src/db/schema';
import crypto from 'crypto';
import { requireEnv } from '../config/env';

function stableStringify(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

interface AuditLogInput {
    eventType: string;
    userId?: string | null;
    userName?: string | null;
    userRole?: string | null;
    branchId?: string | null;
    deviceId?: string | null;
    sourceDevice?: string | string[] | null;
    requestId?: string | null;
    ipAddress?: string | null;
    payload?: any;
    before?: any;
    after?: any;
    reason?: string | null;
}

export async function createSignedAuditLog(input: AuditLogInput) {
    const createdAt = new Date();

    // Compute signature
    let signature: string | undefined;
    try {
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
            createdAt: createdAt.toISOString(),
        });
        signature = crypto.createHmac('sha256', secret).update(toSign).digest('hex');
    } catch {
        // HMAC secret not configured, skip signature
    }

    const [created] = await db.insert(auditLogs).output().values({
        eventType: input.eventType,
        userId: input.userId,
        userName: input.userName,
        userRole: input.userRole,
        branchId: input.branchId,
        deviceId: input.deviceId,
        ipAddress: input.ipAddress,
        payload: input.payload,
        before: input.before,
        after: input.after,
        reason: input.reason,
        signature,
        createdAt,
    });

    return created;
}

export default { createSignedAuditLog };
