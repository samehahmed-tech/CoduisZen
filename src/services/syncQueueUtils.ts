const MAX_RETRY_MS = 5 * 60 * 1000;

export const simpleHash = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
};

export const buildDedupeKey = (entity: string, action: string, payload: any, branchId?: string) => {
    const prefix = String(branchId || '').trim() ? `branch:${String(branchId).trim()}:` : '';
    const id = payload?.id
        || payload?.key
        || payload?.item_id
        || payload?.order_id
        || payload?.table_id;
    // Status updates must not collapse: PENDING→PREPARING→READY queued
    // offline would otherwise shrink to last-write-wins and skip history.
    if (id && entity === 'orderStatus' && payload?.data?.status) {
        return `${prefix}${entity}:${action}:${id}:${String(payload.data.status).toUpperCase()}`;
    }
    if (id) return `${prefix}${entity}:${action}:${id}`;
    return `${prefix}${entity}:${action}:${simpleHash(JSON.stringify(payload || {}))}`;
};

const stableSerialize = (value: any): string => {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

/** Same offline order id + create key must not silently replace a different payload. */
export const isOfflinePayloadConflict = (entity: string, action: string, existingPayload: any, nextPayload: any) =>
    String(entity) === 'order'
    && String(action).toUpperCase() === 'CREATE'
    && stableSerialize(existingPayload) !== stableSerialize(nextPayload);

export const computeNextAttempt = (retryCount: number, baseRetryMs: number) => {
    const delay = Math.min(MAX_RETRY_MS, baseRetryMs * Math.pow(2, Math.max(0, retryCount - 1)));
    return Date.now() + delay;
};

const SUPPORTED_SYNC_OPERATIONS: Record<string, readonly string[]> = {
    menuCategory: ['CREATE', 'UPDATE', 'DELETE'],
    menuItem: ['CREATE', 'UPDATE', 'DELETE'],
    inventoryItem: ['CREATE', 'UPDATE', 'DELETE'],
    warehouse: ['CREATE', 'UPDATE', 'DELETE'],
    stockUpdate: ['UPDATE'],
    customer: ['CREATE', 'UPDATE', 'DELETE'],
    order: ['CREATE'],
    orderStatus: ['UPDATE'],
    tableStatus: ['UPDATE'],
    tableLayout: ['SAVE'],
    setting: ['UPDATE'],
    settingsBulk: ['UPDATE'],
    auditLog: ['CREATE'],
};

export const assertSupportedSyncOperation = (entity: string, action: string) => {
    const normalizedEntity = String(entity || '').trim();
    const normalizedAction = String(action || '').trim().toUpperCase();
    if (!SUPPORTED_SYNC_OPERATIONS[normalizedEntity]?.includes(normalizedAction)) {
        throw new Error(`UNSUPPORTED_OFFLINE_OPERATION:${normalizedEntity}:${normalizedAction}`);
    }
    return true;
};

/**
 * Offline orders use a local tender ledger. A gateway is optional: CARD,
 * wallet, transfer and other methods are recorded locally and can be linked
 * to a provider later from settings. Keep only the structural split guard
 * here; amount/method validation belongs to the order boundary.
 */
export const assertOfflinePaymentPolicy = (payload: any) => {
    const source = payload?.data && typeof payload.data === 'object'
        ? { ...payload, ...payload.data }
        : payload || {};
    const declared = String(source.paymentMethod || source.payment_method || '').trim().toUpperCase();
    const payments = Array.isArray(source.payments) ? source.payments : [];
    const methods = payments
        .map((payment: any) => String(payment?.method || payment?.paymentMethod || '').trim().toUpperCase())
        .filter(Boolean);

    if (!declared && methods.length === 0) return true;
    const splitIsComplete = declared !== 'SPLIT' || methods.length > 0;

    if (!splitIsComplete) {
        throw new Error('OFFLINE_NON_CASH_PAYMENT_UNSUPPORTED');
    }
    return true;
};

export const resolveQueueBranchId = (payload: any, activeBranchId?: unknown) => {
    const payloadBranch = payload?.branchId
        || payload?.branch_id
        || payload?.data?.branchId
        || payload?.data?.branch_id;
    const payloadId = String(payloadBranch || '').trim();
    const activeId = String(activeBranchId || '').trim();
    if (!payloadId && !activeId) throw new Error('OFFLINE_BRANCH_CONTEXT_REQUIRED');
    if (payloadId && activeId && payloadId !== activeId) throw new Error('OFFLINE_BRANCH_MISMATCH');
    return payloadId || activeId;
};

export const assertQueueBranch = (itemBranchId: unknown, activeBranchId: unknown) => {
    const item = String(itemBranchId || '').trim();
    const active = String(activeBranchId || '').trim();
    if (!item || !active) throw new Error('OFFLINE_BRANCH_CONTEXT_REQUIRED');
    if (item !== active) throw new Error('OFFLINE_BRANCH_MISMATCH');
    return true;
};

export const isQueueItemForBranch = (itemBranchId: unknown, activeBranchId: unknown) => {
    const item = String(itemBranchId || '').trim();
    const active = String(activeBranchId || '').trim();
    return Boolean(item && active && item === active);
};

export const SYNC_LOCK_LEASE_MS = 2 * 60 * 1000;

export const isSyncLockStale = (lockedAt: number | undefined, now = Date.now()) =>
    Boolean(lockedAt && now - lockedAt >= SYNC_LOCK_LEASE_MS);

/**
 * Atomically claim one queue item. The database argument is intentionally
 * structural so the same transaction can be exercised with a real Dexie
 * database in tests, not only with a mocked table.
 */
export const claimSyncQueueItem = async (
    localDb: any,
    item: { id: string; branchId: string; status: string; retryCount?: number; nextAttemptAt?: number; lockedAt?: number },
    activeBranchId: string,
    now = Date.now(),
) => localDb.transaction('rw', localDb.syncQueue, async () => {
    const current = await localDb.syncQueue.get(item.id);
    if (!current || current.branchId !== activeBranchId) return false;
    if (!['PENDING', 'FAILED'].includes(current.status)) return false;
    if (current.lockedAt && !isSyncLockStale(current.lockedAt, now)) return false;
    if ((current.retryCount || 0) >= 10) return false;
    if ((current.nextAttemptAt ?? 0) > now) return false;

    await localDb.syncQueue.update(item.id, {
        lockedAt: now,
        lastAttemptAt: now,
    });
    return true;
});

export const classifySyncError = (error: any): 'CONFLICT' | 'RETRY' => {
    const status = Number(error?.status || 0);
    const code = String(error?.code || error?.message || '').toUpperCase();
    const terminalCode = [
        'CONFLICT',
        'VERSION_CONFLICT',
        'OFFLINE_',
        'BRANCH_',
        'FORBIDDEN',
        'UNAUTHORIZED',
        'AUTH',
        'UNSUPPORTED_OFFLINE_OPERATION',
        'DUPLICATE',
        'ALREADY_EXISTS',
        'UNIQUE',
    ].some((fragment) => code.includes(fragment));
    return status === 401 || status === 403 || status === 409 || status === 422 || terminalCode
        ? 'CONFLICT'
        : 'RETRY';
};

export const serializeSyncConflict = (error: any) => ({
    code: String(error?.code || error?.message || 'SYNC_CONFLICT'),
    message: String(error?.message || 'The server rejected this offline change because it conflicts with newer data.'),
    serverState: error?.currentOrder || error?.currentState,
    detectedAt: Date.now(),
});

const isPlainRecord = (value: unknown): value is Record<string, any> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** Server wins on shared keys; local-only keys are preserved for safe replay. */
export const mergeConflictPayload = (localPayload: any, serverState: any) => {
    if (!isPlainRecord(localPayload) || !isPlainRecord(serverState)) {
        throw new Error('MERGE_REQUIRES_OBJECT_STATES');
    }
    const merged: Record<string, any> = { ...serverState };
    for (const [key, localValue] of Object.entries(localPayload)) {
        if (!(key in serverState)) merged[key] = localValue;
        else if (isPlainRecord(localValue) && isPlainRecord(serverState[key])) {
            merged[key] = mergeConflictPayload(localValue, serverState[key]);
        }
    }
    return merged;
};
