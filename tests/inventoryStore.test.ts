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
import { useInventoryStore } from '../stores/useInventoryStore';

describe('inventory store', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(globalThis, 'navigator', {
            value: { onLine: true },
            configurable: true,
        });
        useInventoryStore.setState({ warehouses: [], error: null });
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
