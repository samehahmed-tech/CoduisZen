import { beforeEach, describe, expect, it, vi } from 'vitest';

const menuApiMock = vi.hoisted(() => ({
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
}));
const inventoryApiMock = vi.hoisted(() => ({
    createWarehouse: vi.fn(),
    updateWarehouse: vi.fn(),
    deleteWarehouse: vi.fn(),
}));
const localDbMock = vi.hoisted(() => ({
    settings: { get: vi.fn().mockResolvedValue({ value: { activeBranchId: 'branch-a' } }) },
}));

vi.mock('../services/api/menu', () => ({ menuApi: menuApiMock }));
vi.mock('../services/api/inventory', () => ({ inventoryApi: inventoryApiMock }));
vi.mock('../src/db/localDb', () => ({ localDb: localDbMock }));

import { syncService } from '../src/services/syncService';

const queuedItem = (action: 'CREATE' | 'UPDATE' | 'DELETE', payload: Record<string, unknown>) => ({
    id: `sync-${action}`,
    entity: 'menuItem',
    action,
    payload,
    dedupeKey: `menuItem:${action}:${String(payload.id || '')}`,
    branchId: 'branch-a',
    status: 'PENDING' as const,
    retryCount: 0,
    createdAt: Date.now(),
});

describe('offline menu replay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('replays create, update/restore, and archive through menu persistence APIs', async () => {
        await syncService.processItem(queuedItem('CREATE', { id: 'offline-new', name: 'Offline item' }));
        await syncService.processItem(queuedItem('UPDATE', { id: 'offline-edit', price: 25 }));
        await syncService.processItem(queuedItem('UPDATE', {
            id: 'offline-restore',
            restore: true,
            status: 'published',
            isAvailable: true,
        }));
        await syncService.processItem(queuedItem('DELETE', { id: 'offline-archive' }));

        expect(menuApiMock.createItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'offline-new' }));
        expect(menuApiMock.updateItem).toHaveBeenCalledWith(
            'offline-edit',
            expect.objectContaining({ price: 25 }),
        );
        expect(menuApiMock.updateItem).toHaveBeenCalledWith(
            'offline-restore',
            expect.objectContaining({ restore: true, isAvailable: true }),
        );
        expect(menuApiMock.deleteItem).toHaveBeenCalledWith('offline-archive');
    });

    it('replays warehouse updates and deletes instead of silently marking them synced', async () => {
        await syncService.processItem({
            ...queuedItem('UPDATE', { id: 'warehouse-edit', name: 'Updated' }),
            entity: 'warehouse',
        });
        await syncService.processItem({
            ...queuedItem('DELETE', { id: 'warehouse-delete' }),
            entity: 'warehouse',
        });

        expect(inventoryApiMock.updateWarehouse).toHaveBeenCalledWith(
            'warehouse-edit',
            expect.objectContaining({ name: 'Updated' }),
        );
        expect(inventoryApiMock.deleteWarehouse).toHaveBeenCalledWith('warehouse-delete');
    });

    it('fails closed instead of accepting an unknown action', async () => {
        await expect(syncService.processItem({
            ...queuedItem('UPDATE', { id: 'warehouse-unknown' }),
            entity: 'warehouse',
            action: 'ARCHIVE',
        } as any)).rejects.toThrow('UNSUPPORTED_OFFLINE_OPERATION');
    });
});
