import { beforeEach, describe, expect, it, vi } from 'vitest';

const menuApiMock = vi.hoisted(() => ({
    createItem: vi.fn(),
    updateItem: vi.fn(),
    updateCategory: vi.fn(),
    deleteItem: vi.fn(),
    restoreItem: vi.fn(),
}));

vi.mock('../services/api/menu', () => ({ menuApi: menuApiMock }));
vi.mock('../services/api/platforms', () => ({ platformsApi: {} }));
vi.mock('zustand/middleware', () => ({ persist: (initializer: unknown) => initializer }));
vi.mock('../services/syncService', () => ({
    syncService: { queue: vi.fn(), syncPending: vi.fn() },
}));
vi.mock('../db/localDb', () => ({
    localDb: {
        menuItems: { put: vi.fn(), delete: vi.fn() },
        menuCategories: { put: vi.fn() },
    },
}));

import { useMenuStore } from '../stores/useMenuStore';

const sourceItem = {
    id: 'menu-item-1',
    name: 'Burger',
    nameAr: 'برجر',
    price: 50,
    cost: 20,
    isAvailable: true,
    categoryId: 'category-1',
};

describe('menu persistence actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('navigator', { onLine: true });
        useMenuStore.setState({
            categories: [{
                id: 'category-1',
                name: 'Food',
                nameAr: 'طعام',
                isActive: true,
                menuIds: ['menu-1'],
                items: [sourceItem],
            }, {
                id: 'category-2',
                name: 'Drinks',
                nameAr: 'مشروبات',
                isActive: true,
                menuIds: ['menu-1'],
                items: [],
            }] as any,
            error: null,
        });
    });

    it('persists archive and restore before changing local state', async () => {
        menuApiMock.deleteItem.mockResolvedValue({ archived: true });
        menuApiMock.restoreItem.mockResolvedValue({ id: sourceItem.id });

        await useMenuStore.getState().archiveItem('menu-1', 'category-1', sourceItem.id);
        expect(menuApiMock.deleteItem).toHaveBeenCalledWith(sourceItem.id);
        expect(useMenuStore.getState().categories[0].items[0]).toMatchObject({
            isAvailable: false,
            archivedAt: expect.any(String),
        });

        await useMenuStore.getState().restoreItem('menu-1', 'category-1', sourceItem.id);
        expect(menuApiMock.restoreItem).toHaveBeenCalledWith(sourceItem.id);
        expect(useMenuStore.getState().categories[0].items[0]).toMatchObject({
            isAvailable: true,
            archivedAt: undefined,
        });
    });

    it('persists duplicate and bulk updates through create/update APIs', async () => {
        menuApiMock.createItem.mockResolvedValue({ id: 'menu-item-copy' });
        menuApiMock.updateItem.mockResolvedValue({ id: sourceItem.id });

        const duplicate = await useMenuStore.getState().duplicateItem('menu-1', 'category-1', sourceItem.id);
        expect(menuApiMock.createItem).toHaveBeenCalledOnce();
        expect(duplicate).toMatchObject({ id: 'menu-item-copy', name: 'Burger (Copy)' });

        await useMenuStore.getState().bulkUpdateItems([{
            menuId: 'menu-1',
            categoryId: 'category-1',
            itemId: sourceItem.id,
            changes: { price: 60, isAvailable: false },
        }]);
        expect(menuApiMock.updateItem).toHaveBeenCalledWith(
            sourceItem.id,
            expect.objectContaining({ price: 60, isAvailable: false }),
        );
        expect(useMenuStore.getState().categories[0].items.find(item => item.id === sourceItem.id))
            .toMatchObject({ price: 60, isAvailable: false });
    });

    it('keeps item/category locations unchanged when persistence fails', async () => {
        menuApiMock.updateItem.mockRejectedValueOnce(new Error('NETWORK_FAILED'));

        await expect(useMenuStore.getState().updateMenuItem(
            'menu-1',
            'category-2',
            { ...sourceItem, categoryId: 'category-2' } as any,
        )).rejects.toThrow('NETWORK_FAILED');
        expect(useMenuStore.getState().categories[0].items).toContainEqual(sourceItem);
        expect(useMenuStore.getState().categories[1].items).toHaveLength(0);

        menuApiMock.updateCategory.mockRejectedValueOnce(new Error('NETWORK_FAILED'));
        const reversed = [...useMenuStore.getState().categories].reverse();
        await expect(useMenuStore.getState().reorderCategories('menu-1', reversed))
            .rejects.toThrow('NETWORK_FAILED');
        expect(useMenuStore.getState().categories.map(category => category.id))
            .toEqual(['category-1', 'category-2']);
    });

    it('does not hide an item behind an archive fallback when delete fails', async () => {
        menuApiMock.deleteItem.mockRejectedValueOnce(new Error('DELETE_FAILED'));

        await expect(useMenuStore.getState().deleteMenuItem(
            'menu-1',
            'category-1',
            sourceItem.id,
        )).rejects.toThrow('DELETE_FAILED');

        expect(menuApiMock.updateItem).not.toHaveBeenCalled();
        expect(useMenuStore.getState().categories[0].items).toContainEqual(sourceItem);
    });
});
