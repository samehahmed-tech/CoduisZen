import { beforeEach, describe, expect, it, vi } from 'vitest';

const localDbMock = vi.hoisted(() => ({
    orders: {
        toArray: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
    },
}));
const syncServiceMock = vi.hoisted(() => ({ queue: vi.fn() }));

vi.mock('../src/db/localDb', () => ({ localDb: localDbMock }));
vi.mock('../src/services/syncService', () => ({ syncService: syncServiceMock }));

import { getLocalKdsTickets, mapLocalOrderToKdsTicket, updateLocalKdsStatus } from '../src/services/localKdsService';

describe('local KDS fallback', () => {
    beforeEach(() => vi.clearAllMocks());

    it('maps an unsynced POS order to an actionable local ticket', () => {
        const ticket = mapLocalOrderToKdsTicket({
            id: 'order-1',
            branchId: 'branch-a',
            status: 'PENDING',
            createdAt: new Date('2026-10-26T10:00:00.000Z'),
            items: [{ id: 'line-1', name: 'Burger', quantity: 2, notes: 'No onions' }],
        });

        expect(ticket).toMatchObject({
            id: 'LOCAL-KDS-order-1',
            orderId: 'order-1',
            branchId: 'branch-a',
            status: 'PREPARING',
        });
        expect(ticket.items[0]).toMatchObject({ itemName: 'Burger', quantity: 2, itemNotes: 'No onions' });
    });

    it('scopes fallback tickets to the active branch and unsynced orders', async () => {
        localDbMock.orders.toArray.mockResolvedValue([
            { id: 'a', branchId: 'branch-a', status: 'PENDING', syncStatus: 'PENDING', items: [] },
            { id: 'b', branchId: 'branch-b', status: 'PENDING', syncStatus: 'PENDING', items: [] },
            { id: 'c', branchId: 'branch-a', status: 'PREPARING', syncStatus: 'SYNCED', items: [] },
        ]);

        await expect(getLocalKdsTickets('branch-a')).resolves.toHaveLength(1);
    });

    it('queues local bump/recall status changes with branch binding', async () => {
        localDbMock.orders.get.mockResolvedValue({ id: 'order-1', branchId: 'branch-a', status: 'PREPARING' });

        await updateLocalKdsStatus('LOCAL-KDS-order-1', 'READY', { id: 'chef-1', name: 'Chef' });

        expect(syncServiceMock.queue).toHaveBeenCalledWith('orderStatus', 'UPDATE', {
            id: 'order-1',
            branchId: 'branch-a',
            data: { status: 'READY', changed_by: 'chef-1', changed_by_name: 'Chef' },
        });
        expect(localDbMock.orders.update).toHaveBeenCalledWith('order-1', { status: 'READY', syncStatus: 'PENDING' });
    });
});
