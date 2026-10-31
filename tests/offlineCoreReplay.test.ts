import { beforeEach, describe, expect, it, vi } from 'vitest';

const ordersApiMock = vi.hoisted(() => ({
    create: vi.fn(),
    updateStatus: vi.fn(),
}));
const tablesApiMock = vi.hoisted(() => ({
    updateStatus: vi.fn(),
    saveLayout: vi.fn(),
}));
const customersApiMock = vi.hoisted(() => ({
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
}));
const settingsApiMock = vi.hoisted(() => ({
    update: vi.fn(),
    updateBulk: vi.fn(),
}));
const inventoryApiMock = vi.hoisted(() => ({
    create: vi.fn(),
    updateStock: vi.fn(),
}));
const auditApiMock = vi.hoisted(() => ({
    create: vi.fn(),
}));
const localDbMock = vi.hoisted(() => ({
    settings: { get: vi.fn().mockResolvedValue({ value: { activeBranchId: 'branch-a' } }) },
    orders: { get: vi.fn(), update: vi.fn(), put: vi.fn() },
    transaction: vi.fn(async (...args: any[]) => args[args.length - 1]()),
    syncQueue: {
        add: vi.fn(),
        update: vi.fn(),
        where: vi.fn(() => ({
            equals: vi.fn(() => ({
                and: vi.fn(() => ({ first: vi.fn().mockResolvedValue(undefined) })),
            })),
        })),
    },
}));

vi.mock('../services/api/orders', () => ({ ordersApi: ordersApiMock }));
vi.mock('../services/api/tables', () => ({ tablesApi: tablesApiMock }));
vi.mock('../services/api/customers', () => ({ customersApi: customersApiMock }));
vi.mock('../services/api/settings', () => ({ settingsApi: settingsApiMock }));
vi.mock('../services/api/inventory', () => ({ inventoryApi: inventoryApiMock }));
vi.mock('../services/api/audit', () => ({ auditApi: auditApiMock }));
vi.mock('../src/db/localDb', () => ({ localDb: localDbMock }));

import { syncService } from '../src/services/syncService';

const item = (entity: string, action: string, payload: Record<string, unknown>) => ({
    id: `sync-${entity}-${action}`,
    entity,
    action,
    payload,
    dedupeKey: `branch:branch-a:${entity}:${action}:offline`,
    branchId: 'branch-a',
    status: 'PENDING' as const,
    retryCount: 0,
    createdAt: Date.now(),
});

describe('offline core replay', () => {
    beforeEach(() => vi.clearAllMocks());

    it('replays stock adjustments with a stable reference id', async () => {
        await syncService.processItem(item('stockUpdate', 'UPDATE', {
            item_id: 'item-1', quantity: -2, branch_id: 'branch-a',
        }));

        expect(inventoryApiMock.updateStock).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 'item-1',
            reference_id: 'branch:branch-a:stockUpdate:UPDATE:offline',
        }));
    });

    it('replays order creation and status transitions idempotently', async () => {
        await syncService.processItem(item('order', 'CREATE', { id: 'order-1', total: 100 }));
        await syncService.processItem(item('orderStatus', 'UPDATE', {
            id: 'order-1', data: { status: 'READY' },
        }));

        expect(ordersApiMock.create).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'order-1' }),
            { idempotencyKey: expect.stringContaining('branch:branch-a:order:CREATE') },
        );
        expect(ordersApiMock.updateStatus).toHaveBeenCalledWith(
            'order-1',
            { status: 'READY' },
            { idempotencyKey: expect.stringContaining('branch:branch-a:orderStatus:UPDATE') },
        );
    });

    it('does not hide an idempotency conflict as a synced order', async () => {
        ordersApiMock.create.mockRejectedValueOnce({
            status: 409,
            code: 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT',
            message: 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT',
        });

        await expect(syncService.processItem(item('order', 'CREATE', { id: 'order-conflict', total: 125 })))
            .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT' });
        expect(localDbMock.orders.update).not.toHaveBeenCalledWith('order-conflict', { syncStatus: 'SYNCED' });
    });

    it('does not treat a business 409 as a successful create replay', async () => {
        inventoryApiMock.create.mockRejectedValueOnce({
            status: 409,
            code: 'WAREHOUSE_INACTIVE',
            message: 'WAREHOUSE_INACTIVE',
        });

        await expect(syncService.processItem(item('inventoryItem', 'CREATE', { id: 'item-1' })))
            .rejects.toMatchObject({ code: 'WAREHOUSE_INACTIVE' });
    });

    it('replays an offline order with a locally recorded non-cash payment', async () => {
        await syncService.processItem(item('order', 'CREATE', {
            id: 'order-card-offline',
            branchId: 'branch-a',
            paymentMethod: 'VISA',
            total: 100,
        }));
        expect(ordersApiMock.create).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'order-card-offline', paymentMethod: 'VISA' }),
            expect.objectContaining({ idempotencyKey: expect.any(String) }),
        );
    });

    it('queues a non-cash payment locally when the gateway is optional', async () => {
        await syncService.queue('order', 'CREATE', {
            id: 'queued-card-offline',
            paymentMethod: 'CARD',
            total: 75,
        });
        expect(localDbMock.syncQueue.add).toHaveBeenCalled();
    });

    it('replays table state and layout mutations', async () => {
        await syncService.processItem(item('tableStatus', 'UPDATE', {
            id: 'table-1', status: 'OCCUPIED', currentOrderId: 'order-1', branchId: 'branch-a',
        }));
        await syncService.processItem(item('tableLayout', 'SAVE', {
            branchId: 'branch-a', zones: [], tables: [],
        }));

        expect(tablesApiMock.updateStatus).toHaveBeenCalledWith('table-1', expect.objectContaining({
            status: 'OCCUPIED',
            reference_id: expect.stringContaining('branch:branch-a:tableStatus:UPDATE'),
        }));
        expect(tablesApiMock.saveLayout).toHaveBeenCalledWith(expect.objectContaining({
            branchId: 'branch-a',
            reference_id: expect.stringContaining('branch:branch-a:tableLayout:SAVE'),
        }));
    });

    it('replays customer and settings mutations through their APIs', async () => {
        await syncService.processItem(item('customer', 'CREATE', { id: 'customer-1', name: 'Offline' }));
        await syncService.processItem(item('customer', 'UPDATE', { id: 'customer-1', name: 'Updated' }));
        await syncService.processItem(item('customer', 'DELETE', { id: 'customer-1' }));
        await syncService.processItem(item('setting', 'UPDATE', {
            key: 'receiptCopies', value: 2, category: 'printing', updated_by: 'offline-user',
        }));
        await syncService.processItem(item('settingsBulk', 'UPDATE', { kitchenMode: true }));

        expect(customersApiMock.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'customer-1' }));
        expect(customersApiMock.update).toHaveBeenCalledWith('customer-1', expect.objectContaining({ name: 'Updated' }));
        expect(customersApiMock.delete).toHaveBeenCalledWith('customer-1');
        expect(settingsApiMock.update).toHaveBeenCalledWith('receiptCopies', 2, 'printing', 'offline-user');
        expect(settingsApiMock.updateBulk).toHaveBeenCalledWith({ kitchenMode: true });
    });

    it('fails closed for a supported entity with an unsupported action', async () => {
        await expect(syncService.processItem(item('orderStatus', 'DELETE', { id: 'order-1' })))
            .rejects.toThrow('UNSUPPORTED_OFFLINE_OPERATION');
    });
});
