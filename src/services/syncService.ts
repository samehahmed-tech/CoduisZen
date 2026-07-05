import { localDb, SyncQueueItem } from '../db/localDb';
import { auditApi } from '../../services/api/audit';
import { ordersApi } from '../../services/api/orders';
import { branchesApi } from '../../services/api/branches';
import { settingsApi } from '../../services/api/settings';
import { tablesApi } from '../../services/api/tables';
import { customersApi } from '../../services/api/customers';
import { menuApi } from '../../services/api/menu';
import { inventoryApi } from '../../services/api/inventory';
import { buildDedupeKey, computeNextAttempt } from './syncQueueUtils';

const MAX_RETRIES = 10;
const BASE_RETRY_MS = 2000;

const isReplaySafeConflict = (error: any) => {
    const status = Number(error?.status || 0);
    const code = String(error?.code || error?.message || '').toUpperCase();
    if (status === 409) return true;
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

const createQueueItem = (entity: string, action: string, payload: any): SyncQueueItem => ({
    id: `SYNC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase(),
    entity,
    action,
    payload: enrichPayload(payload),
    dedupeKey: buildDedupeKey(entity, action, payload),
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
        const item = createQueueItem(entity, action, payload);
        const existing = await localDb.syncQueue
            .where('dedupeKey')
            .equals(item.dedupeKey)
            .and(i => i.status !== 'SYNCED')
            .first();

        if (existing) {
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
    },

    async syncPending() {
        if (!navigator.onLine) return;
        if (this._isSyncing) return;
        this._isSyncing = true;

        try {
            const now = Date.now();
            const candidates = await localDb.syncQueue
                .where('status')
                .anyOf('PENDING', 'FAILED')
                .toArray();

            const pending = candidates
                .filter(item => !item.lockedAt)
                .filter(item => (item.retryCount || 0) < MAX_RETRIES)
                .filter(item => (item.nextAttemptAt ?? 0) <= now)
                .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

            for (const item of pending) {
                await localDb.syncQueue.update(item.id, {
                    lockedAt: Date.now(),
                    lastAttemptAt: Date.now(),
                });

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
                    await localDb.syncQueue.update(item.id, {
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

    async markSynced(item: SyncQueueItem) {
        await localDb.syncQueue.update(item.id, {
            status: 'SYNCED',
            updatedAt: Date.now(),
            lockedAt: undefined,
            lastError: undefined,
        });
    },

    async processItem(item: SyncQueueItem) {
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
                break;
            case 'branch':
                if (action === 'CREATE') {
                    try {
                        return await branchesApi.create(payload);
                    } catch (error: any) {
                        if (isReplaySafeConflict(error)) return;
                        throw error;
                    }
                }
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
                    try {
                        const result = await ordersApi.create(payload, { idempotencyKey: item.dedupeKey || item.id });
                        await localDb.orders.update(payload.id, { syncStatus: 'SYNCED' } as any);
                        return result;
                    } catch (error: any) {
                        if (error?.status === 409) {
                            await localDb.orders.update(payload.id, { syncStatus: 'SYNCED' } as any);
                            return;
                        }
                        throw error;
                    }
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
                    return tablesApi.updateStatus(
                        payload.id,
                        payload.status,
                        payload.currentOrderId,
                        payload.reference_id || item.dedupeKey || item.id,
                    );
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
        const all = await localDb.syncQueue.toArray();
        return {
            total: all.length,
            pending: all.filter(i => i.status === 'PENDING').length,
            failed: all.filter(i => i.status === 'FAILED').length,
            synced: all.filter(i => i.status === 'SYNCED').length,
        };
    },
};

export default syncService;

