import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WarehouseType } from '../types';

vi.mock('../services/api/inventory', () => ({
    inventoryApi: {
        createWarehouse: vi.fn(),
    },
}));

vi.mock('../services/api/procurement', () => ({
    suppliersApi: {},
    purchaseOrdersApi: {},
    productionApi: {},
}));

vi.mock('../services/syncService', () => ({
    syncService: {
        queue: vi.fn(),
    },
}));

vi.mock('../db/localDb', () => ({
    localDb: {
        warehouses: {
            put: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

import { localDb } from '../db/localDb';
import { inventoryApi } from '../services/api/inventory';
import { mapInventoryItem, mapWarehouse, useInventoryStore } from '../stores/useInventoryStore';

describe('inventory store', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(globalThis, 'navigator', {
            value: { onLine: true },
            configurable: true,
        });
        useInventoryStore.setState({ warehouses: [], error: null });
    });

    it('preserves the saved primary item name when Arabic name exists', () => {
        const item = mapInventoryItem({ id: 'item-1', name: 'Pizza Sauce', name_ar: 'صوص بيتزا' });

        expect(item.name).toBe('Pizza Sauce');
        expect(item.nameAr).toBe('صوص بيتزا');
    });

    it('preserves the saved primary warehouse name when Arabic name exists', () => {
        const warehouse = mapWarehouse({ id: 'warehouse-1', name: 'Main Store', name_ar: 'المخزن الرئيسي' });

        expect(warehouse.name).toBe('Main Store');
        expect(warehouse.nameAr).toBe('المخزن الرئيسي');
    });

    it('rethrows warehouse create failures after rolling back optimistic state', async () => {
        vi.mocked(inventoryApi.createWarehouse).mockRejectedValueOnce(new Error('warehouse failed'));

        await expect(useInventoryStore.getState().addWarehouse({
            id: 'warehouse-failure-test',
            name: 'Warehouse Failure Test',
            nameAr: 'اختبار فشل المخزن',
            branchId: 'branch-test',
            type: WarehouseType.SUB,
            isActive: true,
        })).rejects.toThrow('warehouse failed');

        expect(useInventoryStore.getState().warehouses).toEqual([]);
        expect(localDb.warehouses.delete).toHaveBeenCalledWith('warehouse-failure-test');
    });
});
