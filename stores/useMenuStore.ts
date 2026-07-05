// Menu Store - Connected to Database API (Production Ready)
import { create } from 'zustand';
import { RestaurantMenu, MenuCategory, MenuItem, DeliveryPlatform, Printer, ItemVersionEntry } from '../types';
import { menuApi } from '../services/api/menu';
import { platformsApi } from '../services/api/platforms';
import { localDb } from '../db/localDb';
import { syncService } from '../services/syncService';

interface MenuState {
    menus: RestaurantMenu[];
    categories: MenuCategory[];
    platforms: DeliveryPlatform[];
    printers: Printer[];
    isLoading: boolean;
    error: string | null;
    lastSynced: Date | null;
    activePriceListId: string | null;

    // Async Actions (API)
    fetchMenu: (availableOnly?: boolean) => Promise<void>;
    fetchPlatforms: () => Promise<void>;

    // Category Actions
    addCategory: (menuId: string, category: MenuCategory) => Promise<void>;
    updateCategory: (category: MenuCategory) => Promise<void>;
    deleteCategory: (menuId: string, categoryId: string) => Promise<void>;
    reorderCategories: (menuId: string, reorderedCategories: MenuCategory[]) => Promise<void>;

    // Item Actions
    addMenuItem: (menuId: string, categoryId: string, item: MenuItem) => Promise<void>;
    updateMenuItem: (menuId: string, categoryId: string, item: MenuItem) => Promise<void>;
    deleteMenuItem: (menuId: string, categoryId: string, itemId: string) => Promise<void>;

    // Menu Actions
    addMenu: (menu: RestaurantMenu) => void;
    updateMenu: (menu: RestaurantMenu) => void;
    linkCategoryToMenu: (menuId: string, categoryId: string) => void;
    linkCategory: (menuId: string, categoryId: string) => void; // Alias for linkCategoryToMenu

    // Helpers
    clearError: () => void;
    setCategories: (categories: MenuCategory[]) => void;
    setPriceList: (id: string | null) => void;
    syncToDatabase: () => Promise<void>;

    // Platforms Actions
    addPlatform: (platform: Omit<DeliveryPlatform, 'id'> | DeliveryPlatform) => Promise<void>;
    updatePlatform: (platform: DeliveryPlatform) => Promise<void>;
    deletePlatform: (id: string) => Promise<void>;

    // --- Profit Control Center Extensions ---
    bulkUpdateItems: (updates: { menuId: string; categoryId: string; itemId: string; changes: Partial<MenuItem> }[]) => void;
    archiveItem: (menuId: string, categoryId: string, itemId: string) => void;
    restoreItem: (menuId: string, categoryId: string, itemId: string) => void;
    duplicateItem: (menuId: string, categoryId: string, itemId: string) => MenuItem | null;
    addVersionEntry: (categoryId: string, itemId: string, entry: ItemVersionEntry) => void;
}

import { persist } from 'zustand/middleware';

// Start with empty data - will be loaded from database
const INITIAL_MENUS: RestaurantMenu[] = [
    { id: 'menu-1', name: 'Main Menu', isDefault: true, status: 'ACTIVE', targetBranches: ['b1'] }
];

export const useMenuStore = create<MenuState>()(
    persist(
        (set, get) => ({
            menus: INITIAL_MENUS,
            categories: [], // Empty - loads from database
            platforms: [], // Loaded from DB
            printers: [],
            isLoading: false,
            error: null,
            lastSynced: null,
            activePriceListId: null,

            // ============ API Actions ============

            fetchMenu: async (availableOnly?: boolean) => {
                set({ isLoading: true, error: null });
                try {
                    try {
                        const menuData = await menuApi.getFullMenu(availableOnly);

                        // Transform API data to local format
                        const categories: MenuCategory[] = menuData.map((cat: any) => ({
                            id: cat.id,
                            name: cat.nameAr || cat.name_ar || cat.name,
                            nameAr: cat.nameAr || cat.name_ar,
                            image: cat.image || cat.image_url,
                            icon: cat.icon,
                            printerIds: cat.printerIds || cat.printer_ids || [],
                            targetOrderTypes: cat.targetOrderTypes || cat.target_order_types || [],
                            menuIds: cat.menuIds || cat.menu_ids || ['menu-1'],
                            isActive: cat.isActive !== false && cat.is_active !== false,
                            items: (cat.items || []).map((item: any) => ({
                                id: item.id,
                                name: item.nameAr || item.name_ar || item.name,
                                nameAr: item.nameAr || item.name_ar,
                                description: item.description,
                                descriptionAr: item.descriptionAr || item.description_ar,
                                price: Number(item.price),
                                image: item.image || item.image_url,
                                categoryId: cat.id,
                                category: cat.nameAr || cat.name_ar || cat.name,
                                categoryAr: cat.nameAr || cat.name_ar || cat.name,
                                isAvailable: item.isAvailable !== false && item.is_available !== false,
                                isPopular: item.isPopular || item.is_popular || false,
                                preparationTime: item.preparationTime || item.preparation_time || 15,
                                availableFrom: item.availableFrom || item.available_from,
                                availableTo: item.availableTo || item.available_to,
                                availableDays: item.availableDays || item.available_days || [],
                                modifierGroups: item.modifierGroups || item.modifier_groups || [],
                                priceLists: item.priceLists || item.price_lists || [],
                                printerIds: item.printerIds || item.printer_ids || [],
                                dietaryBadges: item.dietaryBadges || item.dietary_badges || [],
                                sizes: item.sizes || [],
                                branchPricing: item.branchPricing || item.branch_pricing || [],
                                platformPricing: item.platformPricing || item.platform_pricing || [],
                                recipe: item.recipe || [],
                                cost: Number(item.cost || 0),
                                sku: item.sku,
                                barcode: item.barcode,
                                archivedAt: item.archivedAt || item.archived_at || item.deletedAt || item.deleted_at || (item.status === 'archived' ? item.updatedAt || item.updated_at || new Date().toISOString() : undefined),
                            }))
                        }));

                        set({ categories, isLoading: false, lastSynced: new Date() });

                        await localDb.transaction('rw', localDb.menuCategories, localDb.menuItems, async () => {
                            await localDb.menuCategories.clear();
                            await localDb.menuItems.clear();
                            await localDb.menuCategories.bulkPut(categories.map(c => ({ ...c, updatedAt: Date.now() })));
                            const flatItems = categories.flatMap(c => c.items.map(i => ({ ...i, updatedAt: Date.now() })));
                            await localDb.menuItems.bulkPut(flatItems);
                        });
                    } catch (apiError) {
                        const cats = await localDb.menuCategories.toArray();
                        const items = await localDb.menuItems.toArray();
                        const categories: MenuCategory[] = cats.map((c: any) => ({
                            ...c,
                            items: items.filter((i: any) => i.categoryId === c.id)
                        }));
                        set({ categories, isLoading: false, lastSynced: new Date() });
                        if (categories.length === 0) throw apiError;
                    }
                } catch (error: any) {
                    set({ error: error.message, isLoading: false });
                    const code = String(error?.code || error?.message || '').toUpperCase();
                    if (code.includes('INVALID_TOKEN') || Number(error?.status) === 401) return;
                }
            },

            fetchPlatforms: async () => {
                try {
                    if (navigator.onLine) {
                        const platforms = await platformsApi.getAll();
                        set({ platforms });
                    }
                } catch (error) {
                    set({ error: (error as any)?.code || (error as any)?.message || 'FETCH_PLATFORMS_FAILED' });
                }
            },

            // ============ Category Actions ============

            addCategory: async (menuId, category) => {
                set({ isLoading: true, error: null });
                try {
                    // Validation: Prevent duplicate category names
                    const isDuplicate = get().categories.some(c =>
                        c.id !== category.id && (
                            c.name.trim().toLowerCase() === category.name.trim().toLowerCase() ||
                            (c.nameAr && category.nameAr && c.nameAr.trim() === category.nameAr.trim())
                        )
                    );
                    if (isDuplicate) {
                        throw new Error('Category name already exists / اسم القسم موجود مسبقاً');
                    }

                    const payload = {
                        id: category.id,
                        name: category.name,
                        nameAr: category.nameAr,
                        image: category.image,
                        icon: category.icon,
                        printerIds: category.printerIds || [],
                        menuIds: category.menuIds,
                        targetOrderTypes: category.targetOrderTypes,
                        isActive: true
                    };

                    if (navigator.onLine) {
                        await menuApi.createCategory(payload);
                    } else {
                        await syncService.queue('menuCategory', 'CREATE', payload);
                    }

                    set((state) => ({
                        categories: [...state.categories, { ...category, menuIds: [menuId], items: category.items || [] }],
                        isLoading: false
                    }));

                    await localDb.menuCategories.put({ ...category, menuIds: [menuId], items: category.items || [], updatedAt: Date.now() });
                } catch (error: any) {
                    set({ error: error.message, isLoading: false });
                    throw error;
                }
            },

            updateCategory: async (category) => {
                set({ isLoading: true, error: null });
                try {
                    // Validation: Prevent duplicate category names
                    const isDuplicate = get().categories.some(c =>
                        c.id !== category.id && (
                            c.name.trim().toLowerCase() === category.name.trim().toLowerCase() ||
                            (c.nameAr && category.nameAr && c.nameAr.trim() === category.nameAr.trim())
                        )
                    );
                    if (isDuplicate) {
                        throw new Error('Category name already exists / اسم القسم موجود مسبقاً');
                    }

                    const payload = {
                        name: category.name,
                        nameAr: category.nameAr,
                        image: category.image,
                        icon: category.icon,
                        printerIds: category.printerIds || [],
                        menuIds: category.menuIds,
                        targetOrderTypes: category.targetOrderTypes,
                    };

                    if (navigator.onLine) {
                        await menuApi.updateCategory(category.id, payload);
                    } else {
                        await syncService.queue('menuCategory', 'UPDATE', { id: category.id, ...payload });
                    }

                    set((state) => ({
                        categories: state.categories.map(c => c.id === category.id ? category : c),
                        isLoading: false
                    }));
                    await localDb.menuCategories.put({ ...category, updatedAt: Date.now() });
                } catch (error: any) {
                    set({ error: error.message, isLoading: false });
                    throw error;
                }
            },

            deleteCategory: async (menuId, categoryId) => {
                try {
                    if (navigator.onLine) {
                        await menuApi.deleteCategory(categoryId);
                    } else {
                        await syncService.queue('menuCategory', 'DELETE', { id: categoryId });
                    }

                    set((state) => ({
                        categories: state.categories.filter(c => c.id !== categoryId)
                    }));
                    await localDb.menuCategories.delete(categoryId);
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'DELETE_CATEGORY_FAILED' });
                    throw error;
                }
            },

            reorderCategories: async (menuId, reorderedCategories) => {
                // Optimistic UI update
                set((state) => {
                    const otherCategories = state.categories.filter(c => !c.menuIds.includes(menuId));
                    return { categories: [...otherCategories, ...reorderedCategories] };
                });

                try {
                    const payloads = reorderedCategories.map(c => ({ id: c.id, sortOrder: c.sortOrder }));

                    if (navigator.onLine) {
                        // Assuming the backend can handle a bulk update. If not, we might need Promise.all
                        // For now we simulate an API call or use the existing update logic in a loop
                        await Promise.all(reorderedCategories.map(c =>
                            menuApi.updateCategory(c.id, { sortOrder: c.sortOrder })
                        ));
                    } else {
                        reorderedCategories.forEach(c => {
                            syncService.queue('menuCategory', 'UPDATE', { id: c.id, sortOrder: c.sortOrder });
                        });
                    }

                    for (const cat of reorderedCategories) {
                        await localDb.menuCategories.put({ ...cat, updatedAt: Date.now() });
                    }
                } catch (error: any) {
                    set({ error: 'Failed to save new category order.', isLoading: false });
                    // Ideally, we should rollback state here if it fails
                }
            },

            // ============ Item Actions ============

            addMenuItem: async (menuId, categoryId, item) => {
                set({ isLoading: true });
                try {
                    // Validation: Prevent duplicate item names across all categories
                    const allItems = get().categories.flatMap(c => c.items);
                    const isDuplicate = allItems.some(i =>
                        i.id !== item.id && (
                            i.name.trim().toLowerCase() === item.name.trim().toLowerCase() ||
                            (i.nameAr && item.nameAr && i.nameAr.trim() === item.nameAr.trim())
                        )
                    );
                    if (isDuplicate) {
                        throw new Error('Item name already exists / اسم الصنف موجود مسبقاً');
                    }

                    const payload = {
                        id: item.id,
                        categoryId: categoryId,
                        name: item.name,
                        nameAr: item.nameAr,
                        description: item.description,
                        descriptionAr: item.descriptionAr,
                        price: item.price,
                        image: item.image,
                        isAvailable: item.isAvailable !== false,
                        isPopular: item.isPopular,
                        preparationTime: item.preparationTime,
                        availableFrom: item.availableFrom,
                        availableTo: item.availableTo,
                        availableDays: item.availableDays,
                        modifierGroups: item.modifierGroups,
                        sizes: item.sizes || [],
                        branchPricing: item.branchPricing || [],
                        platformPricing: item.platformPricing || [],
                        priceLists: item.priceLists,
                        printerIds: item.printerIds,
                        dietaryBadges: item.dietaryBadges || [],
                        cost: item.cost || 0,
                        sku: item.sku,
                        barcode: item.barcode,
                        recipe: item.recipe || [],
                    };

                    if (navigator.onLine) {
                        await menuApi.createItem(payload);
                    } else {
                        await syncService.queue('menuItem', 'CREATE', payload);
                    }

                    set((state) => {
                        const targetCat = state.categories.find(c => c.id === categoryId);
                        const itemWithCategory = {
                            ...item,
                            category: targetCat?.name || 'General',
                            categoryAr: targetCat?.nameAr || targetCat?.name || 'عام',
                            categoryId
                        };

                        return {
                            categories: state.categories.map(c =>
                                c.id === categoryId ? { ...c, items: [...c.items, itemWithCategory] } : c
                            ),
                            isLoading: false
                        };
                    });
                    await localDb.menuItems.put({ ...item, categoryId, updatedAt: Date.now() });
                } catch (error: any) {
                    set({ error: error.message, isLoading: false });
                    throw error;
                }
            },

            updateMenuItem: async (menuId, categoryId, item) => {
                try {
                    // Validation: Prevent duplicate item names
                    const allItems = get().categories.flatMap(c => c.items);
                    const isDuplicate = allItems.some(i =>
                        i.id !== item.id && (
                            i.name.trim().toLowerCase() === item.name.trim().toLowerCase() ||
                            (i.nameAr && item.nameAr && i.nameAr.trim() === item.nameAr.trim())
                        )
                    );
                    if (isDuplicate) {
                        throw new Error('Item name already exists / اسم الصنف موجود مسبقاً');
                    }

                    const payload = {
                        categoryId: categoryId,
                        name: item.name,
                        nameAr: item.nameAr,
                        description: item.description,
                        price: item.price,
                        image: item.image,
                        isAvailable: item.isAvailable,
                        isPopular: item.isPopular,
                        preparationTime: item.preparationTime,
                        availableFrom: item.availableFrom,
                        availableTo: item.availableTo,
                        availableDays: item.availableDays,
                        modifierGroups: item.modifierGroups,
                        sizes: item.sizes || [],
                        branchPricing: item.branchPricing || [],
                        platformPricing: item.platformPricing || [],
                        priceLists: item.priceLists,
                        printerIds: item.printerIds,
                        cost: item.cost || 0,
                        sku: item.sku,
                        barcode: item.barcode,
                        recipe: item.recipe || [],
                    };

                    if (navigator.onLine) {
                        await menuApi.updateItem(item.id, payload);
                    } else {
                        await syncService.queue('menuItem', 'UPDATE', { id: item.id, ...payload });
                    }

                    set((state) => {
                        const targetCat = state.categories.find(c => c.id === categoryId);
                        const updatedItem = {
                            ...item,
                            category: targetCat?.name || 'General',
                            categoryAr: targetCat?.nameAr || targetCat?.name || 'عام',
                            categoryId
                        };

                        // Remove item from its current category first (to handle moves)
                        const updatedCategories = state.categories.map(c => ({
                            ...c,
                            items: c.items.filter(i => i.id !== item.id)
                        }));

                        // Add/Update item in the target category
                        return {
                            categories: updatedCategories.map(c =>
                                c.id === categoryId ? { ...c, items: [...c.items, updatedItem] } : c
                            )
                        };
                    });
                    await localDb.menuItems.put({ ...item, categoryId, updatedAt: Date.now() });
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'UPDATE_MENU_ITEM_FAILED' });
                    throw error;
                }
            },

            deleteMenuItem: async (menuId, categoryId, itemId) => {
                try {
                    if (navigator.onLine) {
                        try {
                            await menuApi.deleteItem(itemId);
                        } catch (deleteError: any) {
                            await menuApi.updateItem(itemId, {
                                isAvailable: false,
                                status: 'archived',
                                archivedAt: new Date().toISOString(),
                            });
                        }
                    } else {
                        await syncService.queue('menuItem', 'DELETE', { id: itemId });
                    }

                    set((state) => ({
                        categories: state.categories.map(c =>
                            c.id === categoryId ? { ...c, items: c.items.filter(i => i.id !== itemId) } : c
                        )
                    }));
                    await localDb.menuItems.delete(itemId);
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'DELETE_MENU_ITEM_FAILED' });
                    throw error;
                }
            },

            // ============ Menu Actions ============

            addMenu: (menu) => set((state) => ({ menus: [...state.menus, menu] })),
            updateMenu: (menu) => set((state) => ({ menus: state.menus.map(m => m.id === menu.id ? menu : m) })),

            linkCategoryToMenu: (menuId, categoryId) => set((state) => ({
                categories: state.categories.map(c =>
                    c.id === categoryId && !c.menuIds.includes(menuId)
                        ? { ...c, menuIds: [...c.menuIds, menuId] }
                        : c
                )
            })),

            // Alias for linkCategoryToMenu (backward compatibility)
            linkCategory: (menuId, categoryId) => set((state) => ({
                categories: state.categories.map(c =>
                    c.id === categoryId && !c.menuIds.includes(menuId)
                        ? { ...c, menuIds: [...c.menuIds, menuId] }
                        : c
                )
            })),

            // ============ Helpers ============

            clearError: () => set({ error: null }),
            setCategories: (categories) => set({ categories }),
            setPriceList: (id) => set({ activePriceListId: id }),
            syncToDatabase: async () => {
                await syncService.syncPending();
            },

            // ============ Platforms Actions ============

            addPlatform: async (platform) => {
                try {
                    const created = await platformsApi.create(platform);
                    set(state => ({ platforms: [...state.platforms, created] }));
                } catch (error) {
                    set({ error: (error as any)?.code || (error as any)?.message || 'ADD_PLATFORM_FAILED' });
                    throw error;
                }
            },

            updatePlatform: async (platform) => {
                try {
                    const updated = await platformsApi.update(platform.id, platform);
                    set(state => ({
                        platforms: state.platforms.map(p => p.id === updated.id ? updated : p)
                    }));
                } catch (error) {
                    set({ error: (error as any)?.code || (error as any)?.message || 'UPDATE_PLATFORM_FAILED' });
                    throw error;
                }
            },

            deletePlatform: async (id) => {
                try {
                    await platformsApi.delete(id);
                    set(state => ({
                        platforms: state.platforms.filter(p => p.id !== id)
                    }));
                } catch (error) {
                    set({ error: (error as any)?.code || (error as any)?.message || 'DELETE_PLATFORM_FAILED' });
                    throw error;
                }
            },

            // ============ Profit Control Center Extensions ============

            bulkUpdateItems: (updates) => set((state) => {
                const cats = [...state.categories];
                for (const u of updates) {
                    const catIdx = cats.findIndex(c => c.id === u.categoryId);
                    if (catIdx === -1) continue;
                    const itemIdx = cats[catIdx].items.findIndex(i => i.id === u.itemId);
                    if (itemIdx === -1) continue;
                    cats[catIdx] = {
                        ...cats[catIdx],
                        items: cats[catIdx].items.map(i => i.id === u.itemId ? { ...i, ...u.changes } : i)
                    };
                }
                return { categories: cats };
            }),

            archiveItem: (menuId, categoryId, itemId) => set((state) => ({
                categories: state.categories.map(c =>
                    c.id === categoryId
                        ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, archivedAt: new Date().toISOString(), isAvailable: false } : i) }
                        : c
                )
            })),

            restoreItem: (menuId, categoryId, itemId) => set((state) => ({
                categories: state.categories.map(c =>
                    c.id === categoryId
                        ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, archivedAt: undefined, isAvailable: true } : i) }
                        : c
                )
            })),

            duplicateItem: (menuId, categoryId, itemId) => {
                const state = get();
                const cat = state.categories.find(c => c.id === categoryId);
                const item = cat?.items.find(i => i.id === itemId);
                if (!item) return null;
                const newItem: MenuItem = {
                    ...item,
                    id: `item-${Date.now()}`,
                    name: `${item.name} (Copy)`,
                    nameAr: item.nameAr ? `${item.nameAr} (نسخة)` : undefined,
                    sortOrder: (item.sortOrder || 0) + 1,
                    versionHistory: [],
                };
                set((state) => ({
                    categories: state.categories.map(c =>
                        c.id === categoryId ? { ...c, items: [...c.items, newItem] } : c
                    )
                }));
                return newItem;
            },

            addVersionEntry: (categoryId, itemId, entry) => set((state) => ({
                categories: state.categories.map(c =>
                    c.id === categoryId
                        ? {
                            ...c,
                            items: c.items.map(i => i.id === itemId
                                ? { ...i, versionHistory: [...(i.versionHistory || []), entry].slice(-50) }
                                : i
                            )
                        }
                        : c
                )
            })),
        }),
        {
            name: 'menu-storage',
            // Only persist menus and UI state, NOT categories/items which must come from DB
            partialize: (state) => ({
                menus: state.menus,
                activePriceListId: state.activePriceListId
            }),
        }
    )
);
