/**
 * Audit Service Helper
 * For creating signed audit logs from other services
 */

import { db } from '../db';
import { auditLogs } from '../../src/db/schema';
import { buildSafeAuditPayload, redactAuditValue } from '../utils/auditPayload';
import { signAuditWithCurrentKey } from '../utils/auditSignature';
export { buildSafeAuditPayload, redactAuditValue } from '../utils/auditPayload';

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
    const safePayload = buildSafeAuditPayload(input.payload, {
        requestId: input.requestId,
        sourceDevice: input.sourceDevice,
    });

    const signed = signAuditWithCurrentKey({
        eventType: input.eventType,
        userId: input.userId ?? null,
        branchId: input.branchId ?? null,
        deviceId: input.deviceId ?? null,
        payload: safePayload,
        before: redactAuditValue(input.before) ?? null,
        after: redactAuditValue(input.after) ?? null,
        reason: input.reason ?? null,
        createdAt,
    });

    const [created] = await db.insert(auditLogs).output().values({
        eventType: input.eventType,
        userId: input.userId,
        userName: input.userName,
        userRole: input.userRole,
        branchId: input.branchId,
        deviceId: input.deviceId,
        ipAddress: input.ipAddress,
        payload: safePayload,
        before: redactAuditValue(input.before),
        after: redactAuditValue(input.after),
        reason: input.reason,
        signature: signed.signature,
        signatureVersion: signed.signatureVersion,
        createdAt,
    });

    return created;
}

export default { createSignedAuditLog };
