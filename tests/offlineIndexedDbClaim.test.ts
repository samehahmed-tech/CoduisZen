import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { CoduisZenLocalDb } from '../src/db/localDb';
import { claimSyncQueueItem } from '../src/services/syncQueueUtils';

const databases: CoduisZenLocalDb[] = [];

const makeItem = (lockedAt?: number) => ({
    id: 'real-indexeddb-claim',
    entity: 'customer',
    action: 'UPDATE',
    payload: { id: 'customer-1', branchId: 'branch-a' },
    dedupeKey: 'branch:branch-a:customer:UPDATE:customer-1',
    branchId: 'branch-a',
    status: 'PENDING' as const,
    retryCount: 0,
    createdAt: Date.now(),
    nextAttemptAt: Date.now() - 1,
    lockedAt,
});

afterEach(async () => {
    for (const database of databases.splice(0)) {
        database.close();
    }
    const cleanup = new CoduisZenLocalDb();
    await cleanup.delete();
});

describe('offline IndexedDB claim transaction', () => {
    it('allows only one of two concurrent database connections to claim an item', async () => {
        const first = new CoduisZenLocalDb();
        const second = new CoduisZenLocalDb();
        databases.push(first, second);
        await first.syncQueue.clear();
        await first.syncQueue.add(makeItem());
        const item = makeItem();

        const claims = await Promise.all([
            claimSyncQueueItem(first, item, 'branch-a'),
            claimSyncQueueItem(second, item, 'branch-a'),
        ]);

        expect(claims.sort()).toEqual([false, true]);
        expect(await first.syncQueue.get(item.id)).toMatchObject({ lockedAt: expect.any(Number) });
    });

    it('recovers a stale lease through the real IndexedDB path', async () => {
        const database = new CoduisZenLocalDb();
        databases.push(database);
        await database.syncQueue.clear();
        const item = makeItem(Date.now() - 120_000);
        await database.syncQueue.add(item);

        expect(await claimSyncQueueItem(database, item, 'branch-a')).toBe(true);
        expect(await database.syncQueue.get(item.id)).toMatchObject({ lockedAt: expect.any(Number) });
    });
});
