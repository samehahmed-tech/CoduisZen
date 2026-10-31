import { beforeEach, describe, expect, it, vi } from 'vitest';

const menuApiMock = vi.hoisted(() => ({
    createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn(),
    createItem: vi.fn(), updateItem: vi.fn(), deleteItem: vi.fn(),
}));
const inventoryApiMock = vi.hoisted(() => ({
    create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    createWarehouse: vi.fn(), updateWarehouse: vi.fn(), deleteWarehouse: vi.fn(),
    updateStock: vi.fn(),
}));
const customerApiMock = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), delete: vi.fn() }));
const orderApiMock = vi.hoisted(() => ({ create: vi.fn(), updateStatus: vi.fn() }));
const tableApiMock = vi.hoisted(() => ({ updateStatus: vi.fn(), saveLayout: vi.fn() }));
const settingsApiMock = vi.hoisted(() => ({ update: vi.fn(), updateBulk: vi.fn() }));
const deploymentApiMock = vi.hoisted(() => ({ pullCommandsAt: vi.fn(), ackCommandAt: vi.fn(), queueCommand: vi.fn() }));
const branchesApiMock = vi.hoisted(() => ({ create: vi.fn() }));
const auditApiMock = vi.hoisted(() => ({ create: vi.fn() }));
const localDbMock = vi.hoisted(() => ({
    settings: { get: vi.fn().mockResolvedValue({ value: { activeBranchId: 'branch-a' } }) },
    orders: { update: vi.fn(), get: vi.fn() },
}));

vi.mock('../services/api/menu', () => ({ menuApi: menuApiMock }));
vi.mock('../services/api/inventory', () => ({ inventoryApi: inventoryApiMock }));
vi.mock('../services/api/customers', () => ({ customersApi: customerApiMock }));
vi.mock('../services/api/orders', () => ({ ordersApi: orderApiMock }));
vi.mock('../services/api/tables', () => ({ tablesApi: tableApiMock }));
vi.mock('../services/api/settings', () => ({ settingsApi: settingsApiMock }));
vi.mock('../services/api/deployment', () => ({ deploymentApi: deploymentApiMock }));
vi.mock('../services/api/branches', () => ({ branchesApi: branchesApiMock }));
vi.mock('../services/api/audit', () => ({ auditApi: auditApiMock }));
vi.mock('../src/db/localDb', () => ({ localDb: localDbMock }));

import { syncService } from '../src/services/syncService';

const item = (entity: string, action: string, payload: Record<string, unknown>) => ({
    id: `sync-${entity}-${action}`,
    entity,
    action,
    payload,
    dedupeKey: `branch:branch-a:${entity}:${action}:fixture`,
    branchId: 'branch-a',
    status: 'PENDING' as const,
    retryCount: 0,
    createdAt: Date.now(),
});

describe('offline adapter coverage', () => {
    beforeEach(() => vi.clearAllMocks());

    it('replays menu category mutations through persistence APIs', async () => {
        await syncService.processItem(item('menuCategory', 'CREATE', { id: 'cat-1', name: 'Mains' }));
        await syncService.processItem(item('menuCategory', 'UPDATE', { id: 'cat-1', name: 'Main dishes' }));
        await syncService.processItem(item('menuCategory', 'DELETE', { id: 'cat-1' }));

        expect(menuApiMock.createCategory).toHaveBeenCalledWith(expect.objectContaining({ id: 'cat-1' }));
        expect(menuApiMock.updateCategory).toHaveBeenCalledWith('cat-1', expect.objectContaining({ name: 'Main dishes' }));
        expect(menuApiMock.deleteCategory).toHaveBeenCalledWith('cat-1');
    });

    it('replays inventory item create/update/delete mutations', async () => {
        await syncService.processItem(item('inventoryItem', 'CREATE', { id: 'inv-1', name: 'Rice' }));
        await syncService.processItem(item('inventoryItem', 'UPDATE', { id: 'inv-1', costPrice: 40 }));
        await syncService.processItem(item('inventoryItem', 'DELETE', { id: 'inv-1' }));

        expect(inventoryApiMock.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-1' }));
        expect(inventoryApiMock.update).toHaveBeenCalledWith('inv-1', expect.objectContaining({ costPrice: 40 }));
        expect(inventoryApiMock.delete).toHaveBeenCalledWith('inv-1');
    });

    it('replays the remaining supported adapters through their persistence APIs', async () => {
        await syncService.processItem(item('menuItem', 'CREATE', { id: 'menu-1', name: 'Soup' }));
        await syncService.processItem(item('warehouse', 'CREATE', { id: 'warehouse-1', name: 'Main' }));
        await syncService.processItem(item('warehouse', 'UPDATE', { id: 'warehouse-1', name: 'Main 2' }));
        await syncService.processItem(item('warehouse', 'DELETE', { id: 'warehouse-1' }));
        await syncService.processItem(item('stockUpdate', 'UPDATE', { item_id: 'inv-1', warehouse_id: 'warehouse-1', quantity: 2, type: 'IN' }));
        await syncService.processItem(item('customer', 'CREATE', { id: 'customer-1', name: 'Ali' }));
        await syncService.processItem(item('customer', 'UPDATE', { id: 'customer-1', name: 'Ali Updated' }));
        await syncService.processItem(item('customer', 'DELETE', { id: 'customer-1' }));
        await syncService.processItem(item('order', 'CREATE', { id: 'order-1', total: 100 }));
        await syncService.processItem(item('orderStatus', 'UPDATE', { id: 'order-1', data: { status: 'READY' } }));
        await syncService.processItem(item('tableStatus', 'UPDATE', { id: 'table-1', status: 'OCCUPIED' }));
        await syncService.processItem(item('tableLayout', 'SAVE', { zones: [], tables: [] }));
        await syncService.processItem(item('setting', 'UPDATE', { key: 'service_charge', value: 12 }));
        await syncService.processItem(item('settingsBulk', 'UPDATE', { currency: 'EGP', tax: 14 }));

        expect(menuApiMock.createItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'menu-1' }));
        expect(inventoryApiMock.createWarehouse).toHaveBeenCalledWith(expect.objectContaining({ id: 'warehouse-1' }));
        expect(inventoryApiMock.updateWarehouse).toHaveBeenCalledWith('warehouse-1', expect.objectContaining({ name: 'Main 2' }));
        expect(inventoryApiMock.deleteWarehouse).toHaveBeenCalledWith('warehouse-1');
        expect(inventoryApiMock.updateStock).toHaveBeenCalledWith(expect.objectContaining({ reference_id: expect.any(String) }));
        expect(customerApiMock.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'customer-1' }));
        expect(customerApiMock.update).toHaveBeenCalledWith('customer-1', expect.objectContaining({ name: 'Ali Updated' }));
        expect(customerApiMock.delete).toHaveBeenCalledWith('customer-1');
        expect(orderApiMock.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'order-1' }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
        expect(orderApiMock.updateStatus).toHaveBeenCalledWith('order-1', { status: 'READY' }, expect.objectContaining({ idempotencyKey: expect.any(String) }));
        expect(tableApiMock.updateStatus).toHaveBeenCalledWith('table-1', expect.objectContaining({ status: 'OCCUPIED', reference_id: expect.any(String) }));
        expect(tableApiMock.saveLayout).toHaveBeenCalledWith(expect.objectContaining({ reference_id: expect.any(String) }));
        expect(settingsApiMock.update).toHaveBeenCalledWith('service_charge', 12, undefined, undefined);
        expect(settingsApiMock.updateBulk).toHaveBeenCalledWith({ currency: 'EGP', tax: 14 });
    });

    it('keeps branch creation online-only and replays audit event creation', async () => {
        await expect(syncService.processItem(item('branch', 'CREATE', { id: 'branch-b', name: 'Second branch' })))
            .rejects.toThrow('UNSUPPORTED_OFFLINE_OPERATION');
        await syncService.processItem(item('auditLog', 'CREATE', {
            eventType: 'OFFLINE_CONFLICT_RESOLVED', branchId: 'branch-a',
        }));

        expect(branchesApiMock.create).not.toHaveBeenCalled();
        expect(auditApiMock.create).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'OFFLINE_CONFLICT_RESOLVED',
        }));
    });

    it('rejects a replay when the payload branch differs from the queue branch', async () => {
        await expect(syncService.processItem(item('customer', 'UPDATE', {
            id: 'customer-1', branchId: 'branch-b', name: 'Retargeted',
            }))).rejects.toThrow('OFFLINE_BRANCH_MISMATCH');
    });

    it('does not execute or acknowledge a central command for another branch', async () => {
        localDbMock.settings.get.mockResolvedValueOnce({ value: {
            activeBranchId: 'branch-a',
            deploymentMode: 'BRANCH',
            deploymentCentralApiUrl: 'https://central.test',
            deploymentSiteId: 'site-a',
            deploymentSiteToken: 'site-token',
        }});
        deploymentApiMock.pullCommandsAt.mockResolvedValueOnce({ commands: [{
            id: 'command-1',
            entity: 'menuItem',
            action: 'UPDATE',
            payload: { id: 'menu-1', branchId: 'branch-b', name: 'Wrong branch' },
        }] });

        await syncService.pullCentralCommands();

        expect(menuApiMock.updateItem).not.toHaveBeenCalled();
        expect(deploymentApiMock.ackCommandAt).not.toHaveBeenCalled();
    });
});
