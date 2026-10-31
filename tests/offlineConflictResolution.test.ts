import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueItems = vi.hoisted(() => new Map<string, any>([
    ['conflict-1', {
        id: 'conflict-1',
        entity: 'menuItem',
        action: 'UPDATE',
        payload: { id: 'item-1', name: 'Local', metadata: { localOnly: true } },
        dedupeKey: 'branch:branch-a:menuItem:UPDATE:item-1',
        branchId: 'branch-a',
        status: 'CONFLICT',
        retryCount: 1,
        conflict: {
            code: 'VERSION_CONFLICT',
            message: 'stale version',
            serverState: { id: 'item-1', name: 'Server', status: 'published' },
            detectedAt: Date.now(),
        },
    }],
]));
const localDbMock = vi.hoisted(() => ({
    settings: { get: vi.fn().mockResolvedValue({ value: { activeBranchId: 'branch-a' } }) },
    transaction: vi.fn(async (...args: any[]) => args[args.length - 1]()),
    syncQueue: {
        get: vi.fn((id: string) => Promise.resolve(queueItems.get(id))),
        update: vi.fn(async (id: string, changes: any) => {
            const item = queueItems.get(id);
            if (item) queueItems.set(id, { ...item, ...changes });
        }),
        add: vi.fn(async (item: any) => queueItems.set(item.id, item)),
        where: vi.fn(() => ({
            equals: vi.fn(() => ({
                and: vi.fn(() => ({ first: vi.fn().mockResolvedValue(undefined) })),
            })),
        })),
    },
}));

vi.mock('../src/db/localDb', () => ({ localDb: localDbMock }));

import { syncService } from '../src/services/syncService';

describe('offline conflict resolution audit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queueItems.set('conflict-1', {
            id: 'conflict-1',
            entity: 'menuItem',
            action: 'UPDATE',
            payload: { id: 'item-1', name: 'Local', metadata: { localOnly: true } },
            dedupeKey: 'branch:branch-a:menuItem:UPDATE:item-1',
            branchId: 'branch-a',
            status: 'CONFLICT',
            retryCount: 1,
            conflict: {
                code: 'VERSION_CONFLICT',
                message: 'stale version',
                serverState: { id: 'item-1', name: 'Server', status: 'published' },
                detectedAt: Date.now(),
            },
        });
    });

    it('queues a branch-bound audit event and replays the conservative merge', async () => {
        await expect(syncService.resolveConflict('conflict-1', 'MERGE')).resolves.toBe(true);

        const audit = Array.from(queueItems.values()).find((item: any) => item.entity === 'auditLog');
        expect(audit).toMatchObject({
            entity: 'auditLog',
            branchId: 'branch-a',
            payload: expect.objectContaining({
                eventType: 'OFFLINE_CONFLICT_RESOLVED',
                resolution: 'MERGE',
                queueItemId: 'conflict-1',
            }),
        });
        expect(queueItems.get('conflict-1')).toMatchObject({
            status: 'PENDING',
            payload: { id: 'item-1', name: 'Server', status: 'published', metadata: { localOnly: true } },
        });
    });

    it('clears stale conflict metadata when the manager discards the change', async () => {
        await expect(syncService.resolveConflict('conflict-1', 'DISCARD')).resolves.toBe(true);

        expect(queueItems.get('conflict-1')).toMatchObject({ status: 'SYNCED' });
        expect(queueItems.get('conflict-1').conflict).toBeUndefined();
        expect(queueItems.get('conflict-1').lastError).toBeUndefined();
        expect(queueItems.get('conflict-1').nextAttemptAt).toBeUndefined();
    });

    it('audits a failed-item retry and resets it to pending', async () => {
        queueItems.set('failed-1', {
            id: 'failed-1', entity: 'order', action: 'CREATE', payload: { id: 'order-1' },
            dedupeKey: 'branch:branch-a:order:CREATE:order-1', branchId: 'branch-a', status: 'FAILED', retryCount: 3,
        });
        await expect(syncService.retryFailed('failed-1')).resolves.toBe(true);
        expect(queueItems.get('failed-1')).toMatchObject({ status: 'PENDING', retryCount: 0, lastError: undefined });
        const audit = Array.from(queueItems.values()).find((item: any) => item.entity === 'auditLog' && item.payload?.eventType === 'OFFLINE_SYNC_RETRY_REQUESTED');
        expect(audit).toMatchObject({ branchId: 'branch-a', payload: expect.objectContaining({ queueItemId: 'failed-1', previousRetryCount: 3 }) });
    });
});
