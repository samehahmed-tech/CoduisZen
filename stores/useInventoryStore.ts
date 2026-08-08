// Inventory Store - Connected to Database API (Production Ready)
import { create } from 'zustand';
import { InventoryItem, Supplier, PurchaseOrder, Warehouse, WarehouseType, ProductionOrder, PurchaseRequest } from '../types';
import { suppliersApi, purchaseOrdersApi, productionApi } from '../services/api/procurement';
import { inventoryApi } from '../services/api/inventory';
import { localDb } from '../db/localDb';
import { syncService } from '../services/syncService';
import { parseStockAdjustmentQuantity } from '../services/stockAdjustment';
import { applyAbsoluteStockQuantity } from '../services/stockSocket';

interface InventoryState {
    inventory: InventoryItem[];
    suppliers: Supplier[];
    purchaseOrders: PurchaseOrder[];
    productionOrders: ProductionOrder[];
    purchaseRequests: PurchaseRequest[];
    warehouses: Warehouse[];
    transferMovements: any[];
    isLoading: boolean;
    error: string | null;

    // Async Actions (API)
    fetchInventory: (since?: string) => Promise<void>;
    fetchWarehouses: () => Promise<void>;
    fetchSuppliers: () => Promise<void>;
    fetchPurchaseOrders: () => Promise<void>;
    fetchTransferMovements: (limit?: number) => Promise<void>;
    fetchProductionOrders: (params?: { status?: string; branchId?: string }) => Promise<void>;
    addInventoryItem: (item: InventoryItem) => Promise<void>;
    updateInventoryItem: (id: string, item: Partial<InventoryItem>) => Promise<void>;
    addWarehouse: (warehouse: Warehouse) => Promise<void>;
    updateStock: (itemId: string, warehouseId: string, quantity: number, type: string, reason?: string) => Promise<void>;
    patchStockFromSocket: (itemId: string, warehouseId: string, quantity: number) => void;
    createSupplierInDB: (supplier: Supplier) => Promise<void>;
    updateSupplierInDB: (supplier: Supplier) => Promise<void>;
    deactivateSupplierInDB: (id: string) => Promise<void>;
    createPurchaseOrderInDB: (po: PurchaseOrder, branchId: string) => Promise<void>;
    updatePurchaseOrderStatusInDB: (id: string, status: PurchaseOrder['status']) => Promise<void>;
    receivePurchaseOrderInDB: (id: string, warehouseId: string, items: { itemId: string; receivedQty: number }[]) => Promise<void>;
    createBranchTransferInDB: (payload: { itemId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number; reason?: string; actorId?: string }) => Promise<void>;

    // Local Actions
    addPurchaseOrder: (po: PurchaseOrder) => void;
    receivePurchaseOrder: (poId: string, receivedAt: Date) => void;
    addProductionOrder: (po: ProductionOrder) => Promise<void>;
    startProductionOrder: (poId: string) => Promise<void>;
    completeProductionOrder: (poId: string, actualQuantity: number) => Promise<void>;
    cancelProductionOrder: (poId: string) => Promise<void>;
    addSupplier: (supplier: Supplier) => void;
    clearError: () => void;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
    inventory: [],
    suppliers: [],
    purchaseOrders: [],
    productionOrders: [],
    purchaseRequests: [],
    warehouses: [],
    transferMovements: [],
    isLoading: false,
    error: null,

    // ============ API Actions ============

    fetchInventory: async (since?: string) => {
        set({ isLoading: !since && get().inventory.length === 0, error: null });
        try {
            // SWR Phase 1: Stale (Load from cache instantly if not incremental)
            if (!since) {
                const cached = await localDb.inventoryItems.toArray();
                if (cached && cached.length > 0 && get().inventory.length === 0) {
                    set({ inventory: cached as InventoryItem[], isLoading: false });
                }
            }

            // Revalidate from the API even if the browser reports offline; local deployments
            // can still reach localhost while navigator.onLine is false.
            const data = await inventoryApi.getAll(since);
            const fetchedItems = data.map((item: any) => ({
                id: item.id,
                name: item.name_ar || item.name,
                nameAr: item.name_ar || item.name,
                sku: item.sku,
                barcode: item.barcode,
                unit: item.unit,
                category: item.category,
                costPrice: Number(item.cost_price),
                purchasePrice: Number(item.purchase_price),
                threshold: Number(item.threshold),
                isAudited: item.is_audited,
                auditFrequency: item.audit_frequency,
                isComposite: item.is_composite,
                bom: item.bom,
                warehouseQuantities: item.warehouseQuantities || [],
            }));

            if (since) {
                // Incremental update: Merge with existing
                const { inventory: currentInventory } = get();
                const newInventory = [...currentInventory];
                
                fetchedItems.forEach(newItem => {
                    const idx = newInventory.findIndex(i => i.id === newItem.id);
                    if (idx >= 0) {
                        newInventory[idx] = { ...newInventory[idx], ...newItem };
                    } else {
                        newInventory.push(newItem);
                    }
                });

                set({ inventory: newInventory, isLoading: false });
                await localDb.inventoryItems.bulkPut(fetchedItems.map((i: any) => ({ ...i, updatedAt: Date.now() })));
            } else {
                // Full update: Replace
                set({ inventory: fetchedItems, isLoading: false });
                await localDb.inventoryItems.bulkPut(fetchedItems.map((i: any) => ({ ...i, updatedAt: Date.now() })));
            }
        } catch (error: any) {
            set({ error: error.message, isLoading: false });
        }
    },

    fetchWarehouses: async () => {
        try {
            // SWR Phase 1: Stale
            const cached = await localDb.warehouses.toArray();
            if (cached && cached.length > 0 && get().warehouses.length === 0) {
                set({ warehouses: cached as Warehouse[] });
            }

            const data = await inventoryApi.getWarehouses();
            const warehouses = data.map((w: any) => ({
                id: w.id,
                name: w.name_ar || w.name,
                nameAr: w.name_ar || w.name,
                branchId: w.branch_id,
                type: w.type,
                isActive: w.is_active,
                parentId: w.parent_id
            }));
            set({ warehouses });
            await localDb.warehouses.bulkPut(warehouses.map((w: any) => ({ ...w, updatedAt: Date.now() })));
        } catch (error: any) {
            set({ error: error?.code || error?.message || 'FETCH_WAREHOUSES_FAILED' });
        }
    },

    fetchSuppliers: async () => {
        set({ isLoading: get().suppliers.length === 0, error: null });
        try {
            const cached = await localDb.suppliers.toArray();
            if (cached && cached.length > 0 && get().suppliers.length === 0) {
                set({ suppliers: cached });
            }

            if (navigator.onLine) {
                const data = await suppliersApi.getAll();
                const suppliers = data.map((s: any) => ({
                    id: s.id,
                    name: s.name,
                    contactPerson: s.contactPerson || '',
                    phone: s.phone || '',
                    email: s.email || '',
                    category: s.category || '',
                }));
                set({ suppliers, isLoading: false });
                await localDb.suppliers.bulkPut(suppliers.map(s => ({ ...s, updatedAt: Date.now() })));
            }
        } catch (error: any) {
            set({ error: error.message, isLoading: false });
        }
    },

    fetchPurchaseOrders: async () => {
        set({ isLoading: get().purchaseOrders.length === 0, error: null });
        try {
            const cached = await localDb.purchaseOrders.toArray();
            if (cached && cached.length > 0 && get().purchaseOrders.length === 0) {
                set({ purchaseOrders: cached.map(po => ({ ...po, date: new Date(po.date) })) });
            }

            if (navigator.onLine) {
                const data = await purchaseOrdersApi.getAll();
                const detailResults = await Promise.allSettled(
                    data.map((po: any) => purchaseOrdersApi.getById(po.id))
                );
                const purchaseOrders = data.map((po: any, idx: number) => {
                    const details =
                        detailResults[idx].status === 'fulfilled'
                            ? (detailResults[idx] as PromiseFulfilledResult<any>).value
                            : null;
                    return {
                        id: po.id,
                        supplierId: po.supplierId,
                        status: po.status,
                        items: (details?.items || []).map((item: any) => ({
                            itemId: item.itemId,
                            itemName: item.itemName || item.itemId,
                            quantity: Number(item.orderedQty || 0),
                            unitPrice: Number(item.unitPrice || 0),
                            receivedQuantity: Number(item.receivedQty || 0),
                        })),
                        totalCost: Number(po.subtotal || 0),
                        date: new Date(po.createdAt || Date.now()),
                        receivedDate: po.updatedAt ? new Date(po.updatedAt) : undefined,
                    };
                });
                set({ purchaseOrders, isLoading: false });
                await localDb.purchaseOrders.bulkPut(purchaseOrders.map(po => ({ ...po, updatedAt: Date.now() })));
            }
        } catch (error: any) {
            set({ error: error.message, isLoading: false });
        }
    },

    fetchTransferMovements: async (limit = 100) => {
        try {
            const data = await inventoryApi.getTransfers(limit);
            set({ transferMovements: Array.isArray(data) ? data : [] });
        } catch (error: any) {
            set({ error: error.message });
        }
    },

    fetchProductionOrders: async (params) => {
        try {
            const data = await productionApi.getOrders(params);
            const productionOrders: ProductionOrder[] = (Array.isArray(data) ? data : []).map((o: any) => ({
                id: o.id,
                targetItemId: o.targetItemId,
                quantityRequested: Number(o.quantityRequested || 0),
                quantityProduced: Number(o.quantityProduced || 0),
                warehouseId: o.warehouseId,
                status: o.status,
                batchNumber: o.batchNumber,
                createdAt: new Date(o.createdAt || Date.now()),
                completedAt: o.completedAt ? new Date(o.completedAt) : undefined,
                actorId: o.actorId || 'system',
                ingredientsConsumed: Array.isArray(o.ingredientsConsumed) ? o.ingredientsConsumed : [],
            }));
            set({ productionOrders });
        } catch (error: any) {
            set({ error: error.message });
        }
    },

    addInventoryItem: async (item) => {
        // Optimistic update
        set((state) => ({ inventory: [...state.inventory, item] }));
        await localDb.inventoryItems.put({ ...item, updatedAt: Date.now() });

        try {
            const payload = {
                id: item.id,
                name: item.name,
                name_ar: item.nameAr,
                sku: item.sku,
                barcode: item.barcode,
                unit: item.unit,
                category: item.category,
                cost_price: item.costPrice,
                purchase_price: item.purchasePrice,
                threshold: item.threshold,
                is_audited: item.isAudited,
                audit_frequency: item.auditFrequency,
                is_composite: item.isComposite,
                bom: item.bom,
                warehouse_ids: item.warehouseQuantities.map(row => row.warehouseId),
            };
            if (navigator.onLine) {
                await inventoryApi.create(payload);
            } else {
                await syncService.queue('inventoryItem', 'CREATE', payload);
            }
        } catch (error: any) {
            // Revert
            set((state) => ({ inventory: state.inventory.filter(i => i.id !== item.id) }));
            await localDb.inventoryItems.delete(item.id);
            set({ error: error.message });
            throw error;
        }
    },

    updateInventoryItem: async (id, item) => {
        const current = get().inventory.find(i => i.id === id);
        if (!current) return;

        const updated = { ...current, ...item };
        // Optimistic update
        set((state) => ({ inventory: state.inventory.map(i => i.id === id ? updated : i) }));
        await localDb.inventoryItems.put({ ...updated, updatedAt: Date.now() });

        try {
            const payload = {
                name: updated.name,
                name_ar: updated.nameAr,
                sku: updated.sku,
                barcode: updated.barcode,
                unit: updated.unit,
                category: updated.category,
                cost_price: updated.costPrice,
                purchase_price: updated.purchasePrice,
                threshold: updated.threshold,
                is_audited: updated.isAudited,
                audit_frequency: updated.auditFrequency,
                is_composite: updated.isComposite,
                bom: updated.bom,
                warehouse_ids: updated.warehouseQuantities.map(row => row.warehouseId),
                is_active: true
            };
            if (navigator.onLine) {
                await inventoryApi.update(id, payload);
            } else {
                await syncService.queue('inventoryItem', 'UPDATE', { id, ...payload });
            }
        } catch (error: any) {
            // Revert
            set((state) => ({ inventory: state.inventory.map(i => i.id === id ? current : i) }));
            await localDb.inventoryItems.put({ ...current, updatedAt: Date.now() });
            set({ error: error.message });
            throw error;
        }
    },

    addWarehouse: async (warehouse) => {
        // Optimistic update
        set((state) => ({ warehouses: [...state.warehouses, warehouse] }));
        await localDb.warehouses.put({ ...warehouse, updatedAt: Date.now() });

        try {
            const payload = {
                id: warehouse.id,
                name: warehouse.name,
                name_ar: warehouse.nameAr,
                branch_id: warehouse.branchId,
                type: warehouse.type,
                parent_id: warehouse.parentId
            };
            if (navigator.onLine) {
                await inventoryApi.createWarehouse(payload);
            } else {
                await syncService.queue('warehouse', 'CREATE', payload);
            }
        } catch (error: any) {
            // Revert
            set((state) => ({ warehouses: state.warehouses.filter(w => w.id !== warehouse.id) }));
            await localDb.warehouses.delete(warehouse.id);
            set({ error: error.message });
            throw error;
        }
    },

    patchStockFromSocket: (itemId: string, warehouseId: string, quantity: number) => {
        const { inventory } = get();
        const updatedInventory = applyAbsoluteStockQuantity(inventory, itemId, warehouseId, quantity);
        if (updatedInventory === inventory) return;

        set({ inventory: updatedInventory });
        
        // Update local DB in background
        localDb.inventoryItems.update(itemId, { 
            warehouseQuantities: updatedInventory.find(i => i.id === itemId)?.warehouseQuantities 
        }).catch(() => undefined);
    },

    createSupplierInDB: async (supplier) => {
        try {
            const created = await suppliersApi.create({
                id: supplier.id,
                name: supplier.name,
                contactPerson: supplier.contactPerson,
                phone: supplier.phone,
                email: supplier.email,
                category: supplier.category,
            });
            const mapped: Supplier = {
                id: created.id,
                name: created.name,
                contactPerson: created.contactPerson || '',
                phone: created.phone || '',
                email: created.email || '',
                category: created.category || '',
            };
            set((state) => ({ suppliers: [mapped, ...state.suppliers] }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    updateSupplierInDB: async (supplier) => {
        try {
            const updated = await suppliersApi.update(supplier.id, {
                name: supplier.name,
                contactPerson: supplier.contactPerson,
                phone: supplier.phone,
                email: supplier.email,
                category: supplier.category,
            });
            const mapped: Supplier = {
                id: updated.id,
                name: updated.name,
                contactPerson: updated.contactPerson || '',
                phone: updated.phone || '',
                email: updated.email || '',
                category: updated.category || '',
            };
            set((state) => ({
                suppliers: state.suppliers.map(s => s.id === mapped.id ? mapped : s)
            }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    deactivateSupplierInDB: async (id) => {
        try {
            await suppliersApi.delete(id);
            set((state) => ({ suppliers: state.suppliers.filter(s => s.id !== id) }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    createPurchaseOrderInDB: async (po, branchId) => {
        try {
            const created = await purchaseOrdersApi.create({
                id: po.id,
                supplierId: po.supplierId,
                branchId,
                targetWarehouseId: po.targetWarehouseId,
                items: po.items.map(i => ({ itemId: i.itemId, orderedQty: i.quantity, unitPrice: i.unitPrice })),
            });
            const mapped: PurchaseOrder = {
                id: created.id,
                supplierId: created.supplierId,
                status: created.status,
                targetWarehouseId: created.targetWarehouseId || po.targetWarehouseId,
                items: po.items,
                totalCost: Number(created.subtotal || po.totalCost || 0),
                date: new Date(created.createdAt || Date.now()),
            };
            set((state) => ({ purchaseOrders: [mapped, ...state.purchaseOrders] }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    updatePurchaseOrderStatusInDB: async (id, status) => {
        try {
            await purchaseOrdersApi.updateStatus(id, status);
            set((state) => ({
                purchaseOrders: state.purchaseOrders.map(po => po.id === id ? { ...po, status } : po)
            }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    receivePurchaseOrderInDB: async (id, warehouseId, items) => {
        try {
            let payloadItems = items;
            if (!payloadItems || payloadItems.length === 0) {
                const poDetails = await purchaseOrdersApi.getById(id);
                payloadItems = (poDetails.items || []).map((i: any) => ({
                    itemId: i.itemId,
                    receivedQty: Math.max(0, Number(i.orderedQty || 0) - Number(i.receivedQty || 0)),
                })).filter((i: any) => i.receivedQty > 0);
            }
            if (!payloadItems || payloadItems.length === 0) {
                throw new Error('No remaining quantity available for receiving');
            }

            await purchaseOrdersApi.receive(id, { warehouseId, items: payloadItems });
            await get().fetchPurchaseOrders();
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    createBranchTransferInDB: async ({ itemId, fromWarehouseId, toWarehouseId, quantity, reason, actorId }) => {
        try {
            await inventoryApi.transferStock({
                item_id: itemId,
                from_warehouse_id: fromWarehouseId,
                to_warehouse_id: toWarehouseId,
                quantity,
                reason,
                actor_id: actorId,
                reference_id: `TR-${Date.now()}`,
            });
            await Promise.all([
                get().fetchInventory(),
                get().fetchTransferMovements(100),
            ]);
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    updateStock: async (itemId, warehouseId, quantity, type, reason) => {
        const validatedQuantity = parseStockAdjustmentQuantity(quantity);
        if (validatedQuantity === null) {
            throw new Error('Stock quantity must be a finite number greater than or equal to zero');
        }
        quantity = validatedQuantity;

        const itemOrigin = get().inventory.find(i => i.id === itemId);
        if (!itemOrigin) return;

        // Optimistic update
        set((state) => ({
            inventory: state.inventory.map(item => {
                if (item.id !== itemId) return item;
                const wqExists = item.warehouseQuantities.some(wq => wq.warehouseId === warehouseId);
                const updatedWq = wqExists
                    ? item.warehouseQuantities.map(wq => wq.warehouseId === warehouseId ? { ...wq, quantity } : wq)
                    : [...item.warehouseQuantities, { warehouseId, quantity }];
                return { ...item, warehouseQuantities: updatedWq };
            })
        }));

        const existing = await localDb.inventoryItems.get(itemId);
        if (existing) {
            const wqExists = (existing.warehouseQuantities || []).some((wq: any) => wq.warehouseId === warehouseId);
            const updatedWq = wqExists
                ? existing.warehouseQuantities.map((wq: any) => wq.warehouseId === warehouseId ? { ...wq, quantity } : wq)
                : [...(existing.warehouseQuantities || []), { warehouseId, quantity }];
            await localDb.inventoryItems.put({ ...existing, warehouseQuantities: updatedWq, updatedAt: Date.now() });
        }

        try {
            const payload = { item_id: itemId, warehouse_id: warehouseId, quantity, type, reason };
            if (navigator.onLine) {
                await inventoryApi.updateStock(payload);
            } else {
                await syncService.queue('stockUpdate', 'UPDATE', payload);
            }
        } catch (error: any) {
            // Revert
            set((state) => ({
                inventory: state.inventory.map(item => item.id === itemId ? itemOrigin : item)
            }));
            if (existing) {
                await localDb.inventoryItems.put({ ...existing, updatedAt: Date.now() });
            }
            set({ error: error.message });
            throw error;
        }
    },

    // ============ Local Actions ============

    addPurchaseOrder: (po) => set((state) => ({ purchaseOrders: [...state.purchaseOrders, po] })),

    receivePurchaseOrder: (poId, receivedAt) => set((state) => ({
        purchaseOrders: state.purchaseOrders.map(po => {
            if (po.id !== poId) return po;
            return { ...po, status: 'RECEIVED', receivedDate: receivedAt };
        })
    })),

    addProductionOrder: async (po) => {
        try {
            await productionApi.createOrder({
                targetItemId: po.targetItemId,
                quantityRequested: po.quantityRequested,
                warehouseId: po.warehouseId,
                actorId: po.actorId,
            });
            await get().fetchProductionOrders();
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    startProductionOrder: async (poId) => {
        try {
            await productionApi.startOrder(poId);
            await get().fetchProductionOrders();
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    completeProductionOrder: async (poId, actualQuantity) => {
        try {
            await productionApi.completeOrder(poId, { quantityProduced: actualQuantity });
            await Promise.all([
                get().fetchProductionOrders(),
                get().fetchInventory(),
            ]);
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    cancelProductionOrder: async (poId) => {
        try {
            await productionApi.cancelOrder(poId);
            await Promise.all([get().fetchProductionOrders(), get().fetchInventory()]);
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    addSupplier: (supplier) => set((state) => ({ suppliers: [...state.suppliers, supplier] })),

    clearError: () => set({ error: null }),
}));
