import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueItems = vi.hoisted(() => new Map<string, any>());
const customerApiMock = vi.hoisted(() => ({ update: vi.fn() }));
const ordersApiMock = vi.hoisted(() => ({ create: vi.fn() }));
const deploymentApiMock = vi.hoisted(() => ({ pullCommandsAt: vi.fn(), ackCommandAt: vi.fn() }));
const localDbMock = vi.hoisted(() => ({
    settings: { get: vi.fn().mockResolvedValue({ value: { activeBranchId: 'branch-a' } }) },
    orders: { update: vi.fn() },
    transaction: vi.fn(async (...args: any[]) => args[args.length - 1]()),
    syncQueue: {
        get: vi.fn(async (id: string) => queueItems.get(id)),
        toArray: vi.fn(async () => Array.from(queueItems.values())),
        filter: vi.fn(() => ({ toArray: vi.fn(async () => Array.from(queueItems.values()).filter((item) => !item.branchId)) })),
        where: vi.fn((field: string) => {
            if (field === 'status') {
                return { anyOf: vi.fn(() => ({ toArray: vi.fn(async () => Array.from(queueItems.values())) })) };
            }
            return {
                equals: vi.fn(() => ({
                    and: vi.fn(() => ({ first: vi.fn().mockResolvedValue(undefined) })),
                })),
            };
        }),
        update: vi.fn(async (id: string, changes: any) => {
            const item = queueItems.get(id);
            if (item) queueItems.set(id, { ...item, ...changes });
        }),
    },
}));

vi.mock('../src/db/localDb', () => ({ localDb: localDbMock }));
vi.mock('../services/api/customers', () => ({ customersApi: customerApiMock }));
vi.mock('../services/api/orders', () => ({ ordersApi: ordersApiMock }));
vi.mock('../services/api/deployment', () => ({ deploymentApi: deploymentApiMock }));
vi.mock('../services/api/audit', () => ({ auditApi: { create: vi.fn() } }));
vi.mock('../services/api/branches', () => ({ branchesApi: {} }));
vi.mock('../services/api/settings', () => ({ settingsApi: {} }));
vi.mock('../services/api/tables', () => ({ tablesApi: {} }));
vi.mock('../services/api/menu', () => ({ menuApi: {} }));
vi.mock('../services/api/inventory', () => ({ inventoryApi: {} }));

import { syncService } from '../src/services/syncService';

const makeItem = (payload: Record<string, unknown>) => ({
    id: 'sync-1',
    entity: 'customer',
    action: 'UPDATE',
    payload,
    dedupeKey: 'branch:branch-a:customer:UPDATE:customer-1',
    branchId: 'branch-a',
    status: 'PENDING' as const,
    retryCount: 0,
    createdAt: Date.now(),
    nextAttemptAt: Date.now(),
});

describe('offline sync lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queueItems.clear();
        syncService._isSyncing = false;
        vi.stubGlobal('navigator', { onLine: true });
        localDbMock.orders.update.mockResolvedValue(undefined);
    });

    it('quarantines a branch conflict without scheduling a retry', async () => {
        queueItems.set('sync-1', makeItem({ id: 'customer-1', branchId: 'branch-b' }));

        await syncService.syncPending();
        expect(queueItems.get('sync-1')).toMatchObject({
            status: 'CONFLICT',
            retryCount: 1,
            conflict: { code: 'OFFLINE_BRANCH_MISMATCH' },
        });
        expect(queueItems.get('sync-1').nextAttemptAt).toBeUndefined();
        expect(customerApiMock.update).not.toHaveBeenCalled();
    });

    it('keeps transient upstream failures retryable with backoff', async () => {
        queueItems.set('sync-1', makeItem({ id: 'customer-1', name: 'Ali' }));
        customerApiMock.update.mockRejectedValueOnce({ status: 503, message: 'UPSTREAM_TIMEOUT' });

        await syncService.syncPending();

        expect(queueItems.get('sync-1')).toMatchObject({
            status: 'FAILED',
            retryCount: 1,
            lastError: 'UPSTREAM_TIMEOUT',
        });
        expect(queueItems.get('sync-1').nextAttemptAt).toBeGreaterThan(Date.now());
    });

    it('recovers a stale local lease and replays it once', async () => {
        queueItems.set('sync-1', { ...makeItem({ id: 'customer-1', name: 'Recovered' }), lockedAt: Date.now() - 120_000 });
        customerApiMock.update.mockResolvedValueOnce({ id: 'customer-1' });

        await syncService.syncPending();

        expect(customerApiMock.update).toHaveBeenCalledTimes(1);
        expect(queueItems.get('sync-1')).toMatchObject({ status: 'SYNCED' });
        expect(queueItems.get('sync-1').lockedAt).toBeUndefined();
    });

    it('does not replay an item held by another active tab lease', async () => {
        queueItems.set('sync-1', { ...makeItem({ id: 'customer-1', name: 'Held' }), lockedAt: Date.now() - 1_000 });

        await syncService.syncPending();

        expect(customerApiMock.update).not.toHaveBeenCalled();
        expect(queueItems.get('sync-1')).toMatchObject({ status: 'PENDING' });
    });

    it('keeps network recovery single-flight within one tab', async () => {
        queueItems.set('sync-1', makeItem({ id: 'customer-1', name: 'Single flight' }));
        let releaseUpdate!: () => void;
        const updateFinished = new Promise<void>((resolve) => { releaseUpdate = resolve; });
        customerApiMock.update.mockImplementationOnce(async () => {
            await updateFinished;
            return { id: 'customer-1' };
        });

        const first = syncService.syncPending();
        await vi.waitFor(() => expect(customerApiMock.update).toHaveBeenCalledTimes(1));
        const second = syncService.syncPending();

        await expect(second).resolves.toBeUndefined();
        expect(customerApiMock.update).toHaveBeenCalledTimes(1);

        releaseUpdate();
        await first;
        expect(queueItems.get('sync-1')).toMatchObject({ status: 'SYNCED' });
    });

    it('retries a locally interrupted order with the same key and one server effect', async () => {
        const serverEffects = new Map<string, { id: string }>();
        ordersApiMock.create.mockImplementation(async (payload: any, options: { idempotencyKey: string }) => {
            const key = options.idempotencyKey;
            if (!serverEffects.has(key)) serverEffects.set(key, { id: payload.id });
            return serverEffects.get(key);
        });
        const queued = {
            id: 'order-sync-1',
            entity: 'order',
            action: 'CREATE',
            payload: { id: 'order-1', branchId: 'branch-a', total: 100 },
            dedupeKey: 'branch:branch-a:order:CREATE:order-1',
            branchId: 'branch-a',
            status: 'PENDING' as const,
            retryCount: 0,
            createdAt: Date.now(),
            nextAttemptAt: Date.now(),
        };
        queueItems.set(queued.id, queued);
        localDbMock.orders.update.mockRejectedValueOnce(new Error('LOCAL_COMMIT_INTERRUPTED'));

        await syncService.syncPending();
        expect(queueItems.get(queued.id)).toMatchObject({ status: 'FAILED', retryCount: 1 });
        expect(queueItems.get(queued.id)?.lastError).not.toBe('UNSUPPORTED_OFFLINE_OPERATION:order:CREATE');

        queueItems.set(queued.id, {
            ...queueItems.get(queued.id),
            nextAttemptAt: Date.now() - 1,
            lockedAt: undefined,
        });
        await syncService.syncPending();

        expect(ordersApiMock.create).toHaveBeenCalledTimes(2);
        expect(ordersApiMock.create.mock.calls[0][1]).toEqual(ordersApiMock.create.mock.calls[1][1]);
        expect(serverEffects.size).toBe(1);
        expect(queueItems.get(queued.id)).toMatchObject({ status: 'SYNCED' });
    });

    it('reports queue health for the active branch only', async () => {
        queueItems.set('pending-a', { ...makeItem({ id: 'customer-a' }), status: 'PENDING' });
        queueItems.set('failed-a', { ...makeItem({ id: 'customer-b' }), status: 'FAILED' });
        queueItems.set('conflict-a', { ...makeItem({ id: 'customer-c' }), status: 'CONFLICT' });
        queueItems.set('synced-a', { ...makeItem({ id: 'customer-d' }), status: 'SYNCED' });
        queueItems.set('pending-b', { ...makeItem({ id: 'customer-e', branchId: 'branch-b' }), branchId: 'branch-b', status: 'PENDING' });

        await expect(syncService.getQueueStats()).resolves.toEqual({
            total: 4,
            pending: 1,
            failed: 1,
            conflicts: 1,
            synced: 1,
        });
    });
});
