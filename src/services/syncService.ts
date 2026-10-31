import { localDb, SyncQueueItem } from '../db/localDb';
import { auditApi } from '../../services/api/audit';
import { ordersApi } from '../../services/api/orders';
import { branchesApi } from '../../services/api/branches';
import { settingsApi } from '../../services/api/settings';
import { tablesApi } from '../../services/api/tables';
import { customersApi } from '../../services/api/customers';
import { menuApi } from '../../services/api/menu';
import { inventoryApi } from '../../services/api/inventory';
import { deploymentApi } from '../../services/api/deployment';
import { assertOfflinePaymentPolicy, assertQueueBranch, assertSupportedSyncOperation, buildDedupeKey, claimSyncQueueItem, classifySyncError, computeNextAttempt, isOfflinePayloadConflict, isQueueItemForBranch, isSyncLockStale, mergeConflictPayload, resolveQueueBranchId, serializeSyncConflict } from './syncQueueUtils';

const MAX_RETRIES = 10;
const BASE_RETRY_MS = 2000;

const isReplaySafeConflict = (error: any) => {
    const code = String(error?.code || error?.message || '').toUpperCase();
    if (code.includes('ALREADY_EXISTS')) return true;
    if (code.includes('DUPLICATE')) return true;
    if (code.includes('UNIQUE')) return true;
    return false;
};

const enrichPayload = (payload: any) => {
    if (!payload || typeof payload !== 'object') return payload;
    if (payload.clientUpdatedAt) return payload;
    return { ...payload, clientUpdatedAt: Date.now() };
};

const createQueueItem = (entity: string, action: string, payload: any, branchId: string): SyncQueueItem => ({
    id: `SYNC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase(),
    entity,
    action,
    payload: enrichPayload(payload),
    dedupeKey: buildDedupeKey(entity, action, payload, branchId),
    branchId,
    status: 'PENDING',
    retryCount: 0,
    createdAt: Date.now(),
    nextAttemptAt: Date.now(),
});

export const syncService = {
    _isSyncing: false,
    _started: false,
    _intervalId: undefined as ReturnType<typeof setInterval> | undefined,

    async queue(entity: string, action: string, payload: any) {
        assertSupportedSyncOperation(entity, action);
        const app = await localDb.settings.get('app');
        const branchId = resolveQueueBranchId(payload, app?.value?.activeBranchId || app?.value?.branchId);
        const scopedPayload = payload && typeof payload === 'object' && !payload.branchId
            ? { ...payload, branchId }
            : payload;
        if (entity === 'order' && String(action).toUpperCase() === 'CREATE') {
            assertOfflinePaymentPolicy(scopedPayload);
        }
        const item = createQueueItem(entity, action, scopedPayload, branchId);
        // The dedupe lookup and write must share one IndexedDB transaction.
        // Otherwise two tabs can both observe no existing item and enqueue the
        // same order/payment mutation before either write becomes visible.
        await localDb.transaction('rw', localDb.syncQueue, async () => {
            const existing = await localDb.syncQueue
                .where('dedupeKey')
                .equals(item.dedupeKey)
                .and(i => i.status !== 'SYNCED')
                .first();

            if (existing) {
                if (isOfflinePayloadConflict(entity, action, existing.payload, item.payload)) {
                    await localDb.syncQueue.update(existing.id, {
                        status: 'CONFLICT',
                        lastError: 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT',
                        conflict: {
                            code: 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT',
                            message: 'The same offline order id was queued with a different payload.',
                            detectedAt: Date.now(),
                        },
                        nextAttemptAt: undefined,
                        updatedAt: Date.now(),
                    });
                    return;
                }
                await localDb.syncQueue.update(existing.id, {
                    payload: item.payload,
                    status: 'PENDING',
                    retryCount: 0,
                    lastError: undefined,
                    nextAttemptAt: Date.now(),
                    updatedAt: Date.now(),
                });
                return;
            }

            await localDb.syncQueue.add(item);
        });
    },

    async syncPending() {
        if (!navigator.onLine) return;
        if (this._isSyncing) return;
        this._isSyncing = true;

        try {
            const app = await localDb.settings.get('app');
            const activeBranchId = String(app?.value?.activeBranchId || app?.value?.branchId || '').trim();
            if (!activeBranchId) return;
            await this.quarantineLegacyQueueItems(activeBranchId);
            await this.pullCentralCommands().catch(() => undefined);
            const now = Date.now();
            const candidates = await localDb.syncQueue
                .where('status')
                .anyOf('PENDING', 'FAILED')
                .toArray();

            const pending = candidates
                .filter(item => !item.lockedAt || isSyncLockStale(item.lockedAt, now))
                .filter(item => item.branchId === activeBranchId)
                .filter(item => (item.retryCount || 0) < MAX_RETRIES)
                .filter(item => (item.nextAttemptAt ?? 0) <= now)
                .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

            for (const item of pending) {
                const claimed = await claimSyncQueueItem(localDb, item, activeBranchId);
                if (!claimed) continue;

                try {
                    await this.processItem(item);
                    await localDb.syncQueue.update(item.id, {
                        status: 'SYNCED',
                        updatedAt: Date.now(),
                        lockedAt: undefined,
                        lastError: undefined,
                    });
                } catch (error: any) {
                    const retryCount = (item.retryCount || 0) + 1;
                    const classification = classifySyncError(error);
                    await localDb.syncQueue.update(item.id, classification === 'CONFLICT'
                        ? {
                            status: 'CONFLICT',
                            retryCount,
                            lastError: error.message,
                            conflict: serializeSyncConflict(error),
                            updatedAt: Date.now(),
                            lockedAt: undefined,
                            nextAttemptAt: undefined,
                        }
                        : {
                            status: 'FAILED',
                            retryCount,
                            lastError: error.message,
                            updatedAt: Date.now(),
                            nextAttemptAt: computeNextAttempt(retryCount, BASE_RETRY_MS),
                            lockedAt: undefined,
                        });
                }
            }
        } finally {
            this._isSyncing = false;
        }
    },

    async getDeploymentSettings() {
        const app = await localDb.settings.get('app');
        return app?.value || {};
    },

    async pullCentralCommands() {
        const config = await this.getDeploymentSettings();
        if (config.deploymentMode !== 'BRANCH' || !config.deploymentCentralApiUrl || !config.deploymentSiteId || !config.deploymentSiteToken) return;
        const activeBranchId = String(config.activeBranchId || config.branchId || '').trim();
        if (!activeBranchId) return;
        const result = await deploymentApi.pullCommandsAt(config.deploymentCentralApiUrl, config.deploymentSiteId, config.deploymentSiteToken);
        for (const command of result.commands || []) {
            try {
                // Central commands are still untrusted at the branch boundary.
                // Never apply or acknowledge a command carrying another branch.
                assertQueueBranch(resolveQueueBranchId(command.payload, activeBranchId), activeBranchId);
                if (command.entity === 'menuCategory') {
                    if (command.action === 'CREATE') await menuApi.createCategory(command.payload);
                    if (command.action === 'UPDATE') await menuApi.updateCategory(command.payload.id, command.payload);
                    if (command.action === 'DELETE') await menuApi.deleteCategory(command.payload.id);
                } else if (command.entity === 'menuItem') {
                    if (command.action === 'CREATE') await menuApi.createItem(command.payload);
                    if (command.action === 'UPDATE') await menuApi.updateItem(command.payload.id, command.payload);
                    if (command.action === 'DELETE') await menuApi.deleteItem(command.payload.id);
                } else if (command.entity === 'inventoryItem') {
                    if (command.action === 'CREATE') await inventoryApi.create(command.payload);
                    if (command.action === 'UPDATE') await inventoryApi.update(command.payload.id, command.payload);
                } else if (command.entity === 'warehouse' && command.action === 'CREATE') {
                    await inventoryApi.createWarehouse(command.payload);
                } else if (command.entity === 'settingsBulk') {
                    await settingsApi.updateBulk(command.payload);
                } else if (command.entity === 'branch' && command.action === 'UPDATE') {
                    await branchesApi.update(command.payload.id, command.payload);
                }
                await deploymentApi.ackCommandAt(config.deploymentCentralApiUrl, config.deploymentSiteId, config.deploymentSiteToken, command.id);
            } catch {
                // Keep the command in the central queue for the next retry.
                break;
            }
        }
    },

    async broadcastCentralCommand(entity: string, action: string, payload: any) {
        const config = await this.getDeploymentSettings();
        if (config.deploymentMode !== 'CENTRAL') return;
        try {
            await deploymentApi.queueCommand({ siteId: 'ALL_BRANCHES', entity, action, payload, policy: 'CENTRAL_MASTER' });
        } catch {
            // Central database remains authoritative; a branch will retry after
            // the deployment command endpoint is available.
        }
    },

    async markSynced(item: SyncQueueItem) {
        await localDb.syncQueue.update(item.id, {
            status: 'SYNCED',
            updatedAt: Date.now(),
            lockedAt: undefined,
            lastError: undefined,
        });
    },

    async processItem(item: SyncQueueItem) {
        const app = await localDb.settings.get('app');
        const activeBranchId = app?.value?.activeBranchId || app?.value?.branchId;
        assertQueueBranch(item.branchId, activeBranchId);
        // The queue envelope and payload are both untrusted at replay time.
        // Reject a payload that was retargeted after it was queued.
        assertQueueBranch(resolveQueueBranchId(item.payload, activeBranchId), item.branchId);
        assertSupportedSyncOperation(item.entity, item.action);
        const { entity, action, payload } = item;

        switch (entity) {
            case 'menuCategory':
                if (action === 'CREATE') {
                    try {
                        return await menuApi.createCategory(payload);
                    } catch (error: any) {
                        if (isReplaySafeConflict(error)) return;
                        throw error;
                    }
                }
                if (action === 'UPDATE') return menuApi.updateCategory(payload.id, payload);
                if (action === 'DELETE') return menuApi.deleteCategory(payload.id);
                break;
            case 'menuItem':
                if (action === 'CREATE') {
                    try {
                        return await menuApi.createItem(payload);
                    } catch (error: any) {
                        if (isReplaySafeConflict(error)) return;
                        throw error;
                    }
                }
                if (action === 'UPDATE') return menuApi.updateItem(payload.id, payload);
                if (action === 'DELETE') return menuApi.deleteItem(payload.id);
                break;
            case 'inventoryItem':
                if (action === 'CREATE') {
                    try {
                        return await inventoryApi.create(payload);
                    } catch (error: any) {
                        if (isReplaySafeConflict(error)) return;
                        throw error;
                    }
                }
                if (action === 'UPDATE') return inventoryApi.update(payload.id, payload);
                if (action === 'DELETE') return inventoryApi.delete(payload.id);
                break;
            case 'warehouse':
                if (action === 'CREATE') {
                    try {
                        return await inventoryApi.createWarehouse(payload);
                    } catch (error: any) {
                        if (isReplaySafeConflict(error)) return;
                        throw error;
                    }
                }
                if (action === 'UPDATE') return inventoryApi.updateWarehouse(payload.id, payload);
                if (action === 'DELETE') return inventoryApi.deleteWarehouse(payload.id);
                break;
            case 'stockUpdate':
                return inventoryApi.updateStock({
                    ...payload,
                    reference_id: payload.reference_id || item.dedupeKey || item.id,
                });
            case 'customer':
                if (action === 'CREATE') {
                    try {
                        return await customersApi.create(payload);
                    } catch (error: any) {
                        if (isReplaySafeConflict(error)) return;
                        throw error;
                    }
                }
                if (action === 'UPDATE') return customersApi.update(payload.id, payload);
                if (action === 'DELETE') return customersApi.delete(payload.id);
                break;
            case 'order':
                if (action === 'CREATE') {
                    assertOfflinePaymentPolicy(payload);
                    // The server returns 200 for a safe idempotent replay. A
                    // 409 is not success: it can mean a payload conflict or
                    // an in-progress claim, both of which must remain visible
                    // to the queue classifier instead of being hidden as
                    // SYNCED.
                    const result = await ordersApi.create(payload, { idempotencyKey: item.dedupeKey || item.id });
                    await localDb.orders.update(payload.id, { syncStatus: 'SYNCED' } as any);
                    return result;
                }
                break;
            case 'orderStatus':
                if (action === 'UPDATE') {
                    const result = await ordersApi.updateStatus(
                        payload.id,
                        payload.data,
                        { idempotencyKey: item.dedupeKey || item.id },
                    );
                    const existing = await localDb.orders.get(payload.id);
                    if (existing) {
                        await localDb.orders.put({ ...existing, status: payload.data.status } as any);
                    }
                    return result;
                }
                break;
            case 'tableStatus':
                if (action === 'UPDATE') {
                    return tablesApi.updateStatus(payload.id, {
                        status: payload.status,
                        currentOrderId: payload.currentOrderId,
                        reference_id: payload.reference_id || item.dedupeKey || item.id,
                        branchId: payload.branchId,
                    });
                }
                break;
            case 'tableLayout':
                if (action === 'SAVE') {
                    return tablesApi.saveLayout({
                        ...payload,
                        reference_id: payload.reference_id || item.dedupeKey || item.id,
                    });
                }
                break;
            case 'setting':
                if (action === 'UPDATE') return settingsApi.update(payload.key, payload.value, payload.category, payload.updated_by);
                break;
            case 'settingsBulk':
                if (action === 'UPDATE') return settingsApi.updateBulk(payload);
                break;
            case 'auditLog':
                if (action === 'CREATE') return auditApi.create(payload);
                break;
            default:
                throw new Error(`Unknown sync entity: ${entity}`);
        }

        // Every supported operation must return from its case. This guard
        // prevents an accidentally added action from being marked SYNCED
        // without an API call.
        throw new Error(`UNSUPPORTED_OFFLINE_OPERATION:${entity}:${action}`);
    },

    initSyncInterval(ms: number = 30000) {
        this._intervalId = setInterval(() => {
            if (navigator.onLine) {
                this.syncPending();
            }
        }, ms);
    },

    init(ms: number = 30000) {
        if (this._started) return;
        this._started = true;
        window.addEventListener('online', () => this.syncPending());
        this.initSyncInterval(ms);
        if (navigator.onLine) {
            this.syncPending();
        }
    },

    async getQueueStats() {
        const app = await localDb.settings.get('app');
        const activeBranchId = String(app?.value?.activeBranchId || app?.value?.branchId || '').trim();
        if (activeBranchId) await this.quarantineLegacyQueueItems(activeBranchId);
        const all = await localDb.syncQueue.toArray();
        const scoped = activeBranchId
            ? all.filter(item => isQueueItemForBranch(item.branchId, activeBranchId))
            : [];
        return {
            total: scoped.length,
            pending: scoped.filter(i => i.status === 'PENDING').length,
            failed: scoped.filter(i => i.status === 'FAILED').length,
            conflicts: scoped.filter(i => i.status === 'CONFLICT').length,
            synced: scoped.filter(i => i.status === 'SYNCED').length,
        };
    },

    async resolveConflict(id: string, resolution: 'RETRY' | 'DISCARD' | 'MERGE') {
        const item = await localDb.syncQueue.get(id);
        if (!item || item.status !== 'CONFLICT') return false;
        const app = await localDb.settings.get('app');
        assertQueueBranch(item.branchId, app?.value?.activeBranchId || app?.value?.branchId);
        const mergedPayload = resolution === 'MERGE'
            ? (() => {
                if (!item.conflict?.serverState) throw new Error('MERGE_REQUIRES_SERVER_STATE');
                return mergeConflictPayload(item.payload, item.conflict.serverState);
            })()
            : undefined;

        // Resolution is itself a business event. Queue it before changing the
        // conflict state so a local storage failure cannot silently lose the
        // audit trail.
        await this.queue('auditLog', 'CREATE', {
            id: `OFFLINE-CONFLICT-${id}-${Date.now()}`,
            eventType: 'OFFLINE_CONFLICT_RESOLVED',
            branchId: item.branchId,
            entity: item.entity,
            action: item.action,
            resolution,
            conflictCode: item.conflict?.code,
            queueItemId: id,
        });

        if (resolution === 'MERGE') {
            await localDb.syncQueue.update(id, {
                payload: mergedPayload,
                status: 'PENDING',
                retryCount: 0,
                nextAttemptAt: Date.now(),
                lockedAt: undefined,
                lastError: undefined,
                conflict: undefined,
                updatedAt: Date.now(),
            });
        } else if (resolution === 'RETRY') {
            await localDb.syncQueue.update(id, {
                status: 'PENDING',
                retryCount: 0,
                nextAttemptAt: Date.now(),
                lockedAt: undefined,
                lastError: undefined,
                conflict: undefined,
                updatedAt: Date.now(),
            });
        } else {
            await localDb.syncQueue.update(id, {
                status: 'SYNCED',
                lockedAt: undefined,
                nextAttemptAt: undefined,
                lastError: undefined,
                conflict: undefined,
                updatedAt: Date.now(),
            });
        }
        return true;
    },

    async retryFailed(id: string) {
        const item = await localDb.syncQueue.get(id);
        if (!item || item.status !== 'FAILED') return false;
        const app = await localDb.settings.get('app');
        assertQueueBranch(item.branchId, app?.value?.activeBranchId || app?.value?.branchId);

        await this.queue('auditLog', 'CREATE', {
            id: `OFFLINE-FAILED-RETRY-${id}-${Date.now()}`,
            eventType: 'OFFLINE_SYNC_RETRY_REQUESTED',
            branchId: item.branchId,
            entity: item.entity,
            action: item.action,
            queueItemId: id,
            previousRetryCount: item.retryCount,
        });

        await localDb.syncQueue.update(id, {
            status: 'PENDING',
            retryCount: 0,
            nextAttemptAt: Date.now(),
            lockedAt: undefined,
            lastError: undefined,
            updatedAt: Date.now(),
        });
        return true;
    },

    async quarantineLegacyQueueItems(activeBranchId: string) {
        const legacy = await localDb.syncQueue.filter(item => !item.branchId).toArray();
        for (const item of legacy) {
            await localDb.syncQueue.update(item.id, {
                status: 'CONFLICT',
                conflict: {
                    code: 'OFFLINE_BRANCH_UNKNOWN',
                    message: 'This offline change was created before branch binding and must be reviewed before sync.',
                    detectedAt: Date.now(),
                },
                lastError: 'OFFLINE_BRANCH_UNKNOWN',
                updatedAt: Date.now(),
                lockedAt: undefined,
                branchId: activeBranchId,
            } as any);
        }
    },
};

export default syncService;
