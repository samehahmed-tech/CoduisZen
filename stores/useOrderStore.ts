// Order Store - Connected to Database API (Production Ready)
import { create } from 'zustand';
import { Order, OrderType, OrderItem, OrderStatus, Table, TableStatus, AuditEventType, FloorZone } from '../types';
import { ordersApi } from '../services/api/orders';
import { tablesApi } from '../services/api/tables';
import { localDb } from '../db/localDb';
import { syncService } from '../services/syncService';
import { useAuthStore } from './useAuthStore';
import { printOrderReceipt } from '../services/posPrintOrchestrator';
import { translations } from '../services/translations';

const isClientOnlyItemId = (value: unknown) => {
    const id = String(value || '').trim();
    return !id || /^cart[_-]/i.test(id) || /^temp[_-]/i.test(id) || /^local[_-]/i.test(id);
};

const resolveMenuItemId = (item: any) => {
    const candidates = [
        item?.menu_item_id,
        item?.menuItemId,
        item?.menu_itemId,
        item?.itemId,
        item?.id,
    ];
    return candidates
        .map((value) => String(value || '').trim())
        .find((value) => value && !isClientOnlyItemId(value));
};

const normalizeOrderType = (value: unknown): OrderType => {
    const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (/تيك|TAKE/.test(normalized)) return OrderType.TAKEAWAY;
    if (/صالة|DINE/.test(normalized)) return OrderType.DINE_IN;
    if (/دليفري|ديلفري|DELIVERY/.test(normalized)) return OrderType.DELIVERY;
    if (/استلام|PICKUP/.test(normalized)) return OrderType.PICKUP;
    const map: Record<string, OrderType> = {
        DINEIN: OrderType.DINE_IN,
        DINE_IN: OrderType.DINE_IN,
        'صالة': OrderType.DINE_IN,
        TAKE_AWAY: OrderType.TAKEAWAY,
        TAKEAWAY: OrderType.TAKEAWAY,
        'تيك_اواي': OrderType.TAKEAWAY,
        DELIVERY: OrderType.DELIVERY,
        'ديلفري': OrderType.DELIVERY,
        PICKUP: OrderType.PICKUP,
        'استلام_عميل': OrderType.PICKUP,
        KIOSK: OrderType.KIOSK,
    };
    return map[normalized] || OrderType.TAKEAWAY;
};

interface HeldOrder {
    id: string;
    cart: OrderItem[];
    tableId?: string;
    customerId?: string;
    customerName?: string;
    timestamp: Date;
    notes?: string;
}

interface OrderState {
    orders: Order[];
    activeOrderType: OrderType;
    heldOrders: HeldOrder[];
    activeCart: OrderItem[];
    tableDrafts: Record<string, { cart: OrderItem[]; discount: number; updatedAt: number }>;
    tables: Table[];
    zones: FloorZone[];
    isLoading: boolean;
    isApplyingCoupon: boolean;
    error: string | null;

    // POS State
    tipAmount: number;
    discount: number;
    activeCoupon: string | null;
    recalledOrder: HeldOrder | null;

    // Async Actions (API)
    fetchOrders: (params?: { status?: string; branch_id?: string; date?: string; limit?: number }) => Promise<void>;
    placeOrder: (order: Order) => Promise<Order>;
    updateOrderStatus: (orderId: string, status: OrderStatus, changedBy?: string, notes?: string, options?: { skipPrint?: boolean; skipVersionCheck?: boolean }) => Promise<void>;

    fetchTables: (branchId: string) => Promise<void>;
    updateTableStatus: (tableId: string, status: TableStatus) => Promise<void>;

    // Local Actions
    setOrderMode: (mode: OrderType) => void;
    addToCart: (item: OrderItem) => void;
    removeFromCart: (itemId: string) => void;
    updateCartItemQuantity: (itemId: string, delta: number) => void;
    updateCartItemNotes: (itemId: string, notes: string) => void;
    updateCartItemSeat: (itemId: string, seatNumber: number) => void;
    updateCartItemCourse: (itemId: string, course: string) => void;
    updateCartItemDiscount: (itemId: string, discount: number, discountType: 'percent' | 'flat') => void;
    setTipAmount: (amount: number) => void;
    clearCart: () => void;
    saveTableDraft: (tableId: string, cart: OrderItem[], discount: number) => void;
    loadTableDraft: (tableId: string) => void;
    clearTableDraft: (tableId: string) => void;
    setDiscount: (amount: number) => void;
    applyCoupon: (payload: { code: string; branchId?: string; orderType: OrderType; subtotal: number; customerId?: string }) => Promise<void>;
    clearCoupon: () => void;
    holdOrder: (order: HeldOrder) => void;
    recallOrder: (index: number) => void;
    clearRecalledOrder: () => void;
    updateTables: (tables: Table[]) => void;
    updateTable: (id: string, updates: Partial<Table>) => void;
    updateZones: (zones: FloorZone[]) => void;
    clearError: () => void;

    // Socket Patch Actions (no full refetch)
    addOrderFromSocket: (order: any) => void;
    patchOrderStatus: (orderId: string, status: OrderStatus, updatedAt?: string) => boolean;
    removeOrderFromSocket: (orderId: string) => void;

    // Advanced Table Management
    transferTable: (sourceTableId: string, targetTableId: string) => Promise<void>;
    transferItems: (sourceTableId: string, targetTableId: string, itemCartIds: string[]) => Promise<void>;
    splitTable: (originalTableId: string, targetTableId: string, itemCartIds: string[]) => Promise<void>;
    loadTableOrder: (tableId: string) => void;
}

// Empty tables - should be configured in settings
const INITIAL_TABLES: Table[] = [];
const INITIAL_ZONES: FloorZone[] = [
    { id: 'MAIN', name: 'Main Hall', color: 'bg-indigo-600', width: 1600, height: 1200 }
];
import { persist } from 'zustand/middleware';
import { eventBus } from '../services/eventBus';
import { PaymentMethod } from '../types';

const isCompletionStatus = (status?: string) => status === OrderStatus.DELIVERED || status === 'COMPLETED';

const dedupeOrdersById = (orders: Order[]) => {
    const byId = new Map<string, Order>();
    for (const order of orders) {
        if (!order?.id) continue;
        byId.set(order.id, order);
    }
    return Array.from(byId.values());
};

const printCompletionReceiptIfNeeded = async (order: Order) => {
    if (typeof window === 'undefined') return;
    const { settings, branches, printers } = useAuthStore.getState();
    if (settings.autoPrintCompletionReceipt === false) return;

    const dedupeKey = `restoflow_completion_receipt_${order.id}_${order.status}`;
    if (window.sessionStorage.getItem(dedupeKey)) return;

    const lang = (settings.language || 'en') as 'en' | 'ar';
    const t = translations[lang] || translations.en;
    const branch = branches.find((b) => b.id === order.branchId);

    await printOrderReceipt({
        order,
        printers,
        settings,
        currencySymbol: settings.currencySymbol || (lang === 'ar' ? 'ج.م' : 'EGP'),
        lang,
        t,
        branch,
        title: lang === 'ar' ? 'شيك نهائي' : 'Final Receipt',
    });

    window.sessionStorage.setItem(dedupeKey, new Date().toISOString());
};

export const useOrderStore = create<OrderState>()(
    persist(
        (set, get) => ({
            orders: [], // Empty - loads from database
            activeOrderType: OrderType.DINE_IN,
            heldOrders: [],
            activeCart: [],
            tableDrafts: {},
            tables: INITIAL_TABLES,
            zones: INITIAL_ZONES,
            discount: 0,
            activeCoupon: null,
            recalledOrder: null,
            isLoading: false,
            isApplyingCoupon: false,
            error: null,
            tipAmount: 0,

            // ============ API Actions ============

            fetchOrders: async (params) => {
                set({ isLoading: true, error: null });
                try {
                    if (navigator.onLine) {
                        const data = await ordersApi.getAll(params);
                        const orders = data.map((o: any) => ({
                            id: o.id,
                            orderNumber: o.order_number || o.orderNumber,
                            type: o.type as OrderType,
                            branchId: o.branch_id || o.branchId,
                            tableId: o.table_id || o.tableId,
                            customerId: o.customer_id || o.customerId,
                            customerName: o.customer_name || o.customerName,
                            customerPhone: o.customer_phone || o.customerPhone,
                            deliveryAddress: o.delivery_address || o.deliveryAddress,
                            deliveryLat: o.delivery_lat ?? o.deliveryLat ?? o.deliveryLatitude,
                            deliveryLng: o.delivery_lng ?? o.deliveryLng ?? o.deliveryLongitude,
                            deliveryAddressLabel: o.delivery_address_label || o.deliveryAddressLabel,
                            isCallCenterOrder: o.is_call_center_order || o.isCallCenterOrder,
                            items: (o.items || []).map((item: any, index: number) => ({
                                ...item,
                                cartId: item.cartId || item.id || `${o.id}-${index}`,
                                nameAr: item.nameAr || item.name_ar,
                                course: item.course,
                                selectedModifiers: item.selectedModifiers || item.modifiers || [],
                            })),
                            status: o.status as OrderStatus,
                            subtotal: o.subtotal,
                            tax: o.tax,
                            tipAmount: o.tipAmount,
                            serviceCharge: o.serviceCharge,
                            total: o.total,
                            discount: o.discount,
                            freeDelivery: o.free_delivery,
                            isUrgent: o.is_urgent,
                            paymentMethod: o.payment_method,
                            notes: o.notes,
                            kitchenNotes: o.kitchen_notes || o.kitchenNotes,
                            deliveryNotes: o.delivery_notes || o.deliveryNotes,
                            driverId: o.driver_id || o.driverId,
                            deliveryFee: o.delivery_fee || o.deliveryFee,
                            createdAt: new Date(o.created_at || o.createdAt),
                            updatedAt: o.updated_at ? new Date(o.updated_at) : (o.updatedAt ? new Date(o.updatedAt) : undefined),
                            syncStatus: o.sync_status || 'SYNCED'
                        }));
                        const uniqueOrders = dedupeOrdersById(orders);
                        set({ orders: uniqueOrders, isLoading: false });
                        await localDb.orders.bulkPut(uniqueOrders as any[]);
                    } else {
                        const cached = await localDb.orders.toArray();
                        set({ orders: dedupeOrdersById(cached as Order[]), isLoading: false });
                    }
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'FETCH_ORDERS_FAILED', isLoading: false });
                    const code = String(error?.code || error?.message || '').toUpperCase();
                    if (code.includes('INVALID_TOKEN') || Number(error?.status) === 401) return;
                }
            },

            fetchTables: async (branchId: string) => {
                set({ isLoading: true });
                try {
                    if (navigator.onLine) {
                        const rawTables = await tablesApi.getAll(branchId);
                        const rawZones = await tablesApi.getZones(branchId);
                        const tables = rawTables.map((t: any) => ({
                            ...t,
                            position: {
                                x: t.position?.x ?? t.x ?? 0,
                                y: t.position?.y ?? t.y ?? 0
                            },
                            width: t.width ?? 100,
                            height: t.height ?? 100,
                            zoneId: t.zoneId ?? t.zone_id
                        }));
                        const zones = rawZones.map((z: any) => ({
                            ...z,
                            width: z.width ?? 1600,
                            height: z.height ?? 1200
                        }));
                        set({ tables, zones, isLoading: false });
                        await localDb.floorTables.bulkPut(tables.map((t: any) => ({ ...t, branchId, x: t.position?.x ?? t.x ?? 0, y: t.position?.y ?? t.y ?? 0 })));
                        await localDb.floorZones.bulkPut(zones.map((z: any) => ({ ...z, branchId })));
                    } else {
                        const tables = (await localDb.floorTables.where('branchId').equals(branchId).toArray())
                            .map((t: any) => ({
                                ...t,
                                position: {
                                    x: t.position?.x ?? t.x ?? 0,
                                    y: t.position?.y ?? t.y ?? 0
                                },
                                width: t.width ?? 100,
                                height: t.height ?? 100
                            }));
                        const zones = await localDb.floorZones.where('branchId').equals(branchId).toArray();
                        set({ tables, zones, isLoading: false });
                    }
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'FETCH_TABLES_FAILED', isLoading: false });
                }
            },

            placeOrder: async (order) => {
                set({ isLoading: true, error: null });
                try {
                    const state = get(); // Get current state to access tipAmount
                    const totalAmount = order.total + state.tipAmount; // Assuming totalAmount is calculated here
                    const activeMethod = order.payments?.[0]; // Assuming activeMethod is derived from payments

                    const payload = {
                        id: order.id,
                        type: normalizeOrderType(order.type),
                        source: order.source || (order.isCallCenterOrder ? 'call_center' : 'pos'),
                        platform_order_id: order.platformOrderId,
                        delivery_source: order.deliverySource,
                        branch_id: order.branchId,
                        shift_id: order.shiftId,
                        created_at: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
                        table_id: order.tableId,
                        customer_id: order.customerId,
                        customer_name: order.customerName,
                        customer_phone: order.customerPhone,
                        delivery_address: order.deliveryAddress,
                        delivery_lat: order.deliveryLat,
                        delivery_lng: order.deliveryLng,
                        delivery_address_label: order.deliveryAddressLabel,
                        is_call_center_order: order.isCallCenterOrder,
                        status: order.status || 'PENDING',
                        subtotal: order.subtotal,
                        discount: order.discount,
                        couponCode: order.couponCode,
                        tax: order.tax,
                        total: totalAmount,
                        tip_amount: state.tipAmount || 0,
                        delivery_fee: Number(order.deliveryFee || 0),
                        free_delivery: order.freeDelivery,
                        is_urgent: order.isUrgent,
                        payment_method: order.paymentMethod,
                        payments: order.payments,
                        notes: order.notes,
                        kitchen_notes: order.kitchenNotes,
                        items: order.items.map(item => ({
                            menu_item_id: resolveMenuItemId(item),
                            name: item.name,
                            name_ar: item.nameAr || (item as any).name_ar || item.name,
                            price: item.price,
                            quantity: item.quantity,
                            notes: item.notes,
                            seat_number: item.seatNumber ?? item.seat_number ?? undefined,
                            course: item.course ?? undefined,
                            modifiers: item.selectedModifiers,
                        }))
                    };

                    let savedOrder: any = order;

                    const idempotencyKey = (order as any).clientSubmitKey || order.id;
                    if (navigator.onLine) {
                        savedOrder = await ordersApi.create(payload, { idempotencyKey });
                    } else {
                        await syncService.queue('order', 'CREATE', payload);
                        savedOrder = { ...order, syncStatus: 'PENDING' };
                    }

                    const normalizedOrder: Order = {
                        id: savedOrder.id,
                        orderNumber: savedOrder.order_number || savedOrder.orderNumber || order.orderNumber,
                        type: savedOrder.type || order.type,
                        branchId: savedOrder.branch_id || savedOrder.branchId || order.branchId,
                        tableId: savedOrder.table_id || savedOrder.tableId || order.tableId,
                        source: savedOrder.source || order.source,
                        platformOrderId: savedOrder.platform_order_id || savedOrder.platformOrderId || order.platformOrderId,
                        deliverySource: savedOrder.delivery_source || savedOrder.deliverySource || order.deliverySource,
                        customerId: savedOrder.customer_id || savedOrder.customerId || order.customerId,
                        customerName: savedOrder.customer_name || savedOrder.customerName || order.customerName,
                        customerPhone: savedOrder.customer_phone || savedOrder.customerPhone || order.customerPhone,
                        deliveryAddress: savedOrder.delivery_address || savedOrder.deliveryAddress || order.deliveryAddress,
                        deliveryLat: savedOrder.delivery_lat ?? savedOrder.deliveryLat ?? order.deliveryLat,
                        deliveryLng: savedOrder.delivery_lng ?? savedOrder.deliveryLng ?? order.deliveryLng,
                        deliveryAddressLabel: savedOrder.delivery_address_label || savedOrder.deliveryAddressLabel || order.deliveryAddressLabel,
                        isCallCenterOrder: savedOrder.is_call_center_order || savedOrder.isCallCenterOrder || order.isCallCenterOrder,
                        items: savedOrder.items || order.items || [],
                        status: savedOrder.status || order.status,
                        shiftId: savedOrder.shift_id || savedOrder.shiftId || order.shiftId,
                        subtotal: savedOrder.subtotal ?? order.subtotal,
                        tax: savedOrder.tax ?? order.tax,
                        total: savedOrder.total ?? order.total,
                        discount: savedOrder.discount ?? order.discount,
                        freeDelivery: savedOrder.free_delivery ?? order.freeDelivery,
                        isUrgent: savedOrder.is_urgent ?? order.isUrgent,
                        paymentMethod: savedOrder.payment_method ?? order.paymentMethod,
                        payments: savedOrder.payments ?? order.payments,
                        notes: savedOrder.notes ?? order.notes,
                        kitchenNotes: savedOrder.kitchen_notes ?? savedOrder.kitchenNotes ?? order.kitchenNotes,
                        deliveryNotes: savedOrder.delivery_notes ?? savedOrder.deliveryNotes ?? order.deliveryNotes,
                        createdAt: new Date(savedOrder.created_at || savedOrder.createdAt || new Date()),
                        updatedAt: savedOrder.updated_at ? new Date(savedOrder.updated_at) : (savedOrder.updatedAt ? new Date(savedOrder.updatedAt) : undefined),
                        warnings: savedOrder.warnings || order.warnings,
                        syncStatus: savedOrder.sync_status || savedOrder.syncStatus || 'SYNCED'
                    };

                    // Emit event for other systems (Inventory, Audit, etc.)
                    eventBus.emit(AuditEventType.POS_ORDER_PLACEMENT, {
                        order: normalizedOrder,
                        timestamp: new Date()
                    });

                    // Update local state
                    set((state) => ({
                        orders: [normalizedOrder, ...state.orders],
                        activeCart: [],
                        discount: 0,
                        isLoading: false
                    }));

                    await localDb.orders.put(normalizedOrder as any);

                    return normalizedOrder;
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'PLACE_ORDER_FAILED', isLoading: false });
                    throw error;
                }
            },

            updateOrderStatus: async (orderId, status, changedBy, notes, options) => {
                try {
                    const current = get().orders.find(o => o.id === orderId);
                    const previousStatus = current?.status;
                    const expectedUpdatedAt = options?.skipVersionCheck ? undefined : (current?.updatedAt ? new Date(current.updatedAt).toISOString() : undefined);
                    if (navigator.onLine) {
                        await ordersApi.updateStatus(orderId, { status, changed_by: changedBy, notes, expected_updated_at: expectedUpdatedAt }, { idempotencyKey: `${orderId}:${status}:${Date.now()}` });
                    } else {
                        await syncService.queue('orderStatus', 'UPDATE', {
                            id: orderId,
                            data: { status, changed_by: changedBy, notes, expected_updated_at: expectedUpdatedAt }
                        });
                    }
                    eventBus.emit(AuditEventType.ORDER_STATUS_CHANGE, {
                        orderId,
                        status,
                        changedBy,
                        timestamp: new Date()
                    });
                    set((state) => ({
                        orders: state.orders.map(o => o.id === orderId ? { ...o, status, updatedAt: new Date() } : o)
                    }));
                    const existing = await localDb.orders.get(orderId);
                    if (existing) {
                        await localDb.orders.put({ ...existing, status, updatedAt: new Date() } as any);
                    }

                    if (!options?.skipPrint && !isCompletionStatus(previousStatus) && isCompletionStatus(status)) {
                        const orderForPrint = current ? { ...current, status, updatedAt: new Date() } : get().orders.find(o => o.id === orderId);
                        if (orderForPrint) {
                            try {
                                // Run in background to prevent UI lag
                                printCompletionReceiptIfNeeded(orderForPrint as Order).catch((error) => {
                                    console.error('[print] completion receipt failed', error);
                                    set({ error: 'RECEIPT_PRINT_FAILED' });
                                });
                            } catch (error) {
                                console.error('[print] completion receipt failed', error);
                                set({ error: 'RECEIPT_PRINT_FAILED' });
                            }
                        }
                    }
                } catch (error: any) {
                    const errorCode = String(error?.code || error?.message || '');
                    const isConflict = Number(error?.status) === 409 || errorCode.includes('ORDER_VERSION_CONFLICT');
                    if (isConflict) {
                        const branchId = get().orders.find(o => o.id === orderId)?.branchId;
                        set({ error: 'ORDER_VERSION_CONFLICT' });
                        if (navigator.onLine) {
                            await get().fetchOrders({ branch_id: branchId, limit: 100 });
                        }
                        throw error;
                    }
                    set({ error: error?.code || error?.message || 'ORDER_STATUS_UPDATE_FAILED' });
                    throw error;
                }
            },

            // ============ Local Actions ============

            setOrderMode: (mode) => set({ activeOrderType: mode }),

            addToCart: (item) => set((state) => ({ activeCart: [...state.activeCart, item] })),

            removeFromCart: (itemId) => set((state) => ({
                activeCart: state.activeCart.filter(i => i.cartId !== itemId)
            })),

            updateCartItemQuantity: (itemId, delta) => set((state) => ({
                activeCart: state.activeCart.map(item =>
                    item.cartId === itemId
                        ? { ...item, quantity: Math.max(1, item.quantity + delta) }
                        : item
                )
            })),

            updateCartItemNotes: (itemId, notes) => set((state) => ({
                activeCart: state.activeCart.map(item =>
                    item.cartId === itemId ? { ...item, notes } : item
                )
            })),

            updateCartItemSeat: (itemId, seatNumber) => set((state) => ({
                activeCart: state.activeCart.map(item =>
                    item.cartId === itemId ? { ...item, seatNumber } : item
                )
            })),

            updateCartItemCourse: (itemId, course) => set((state) => ({
                activeCart: state.activeCart.map(item =>
                    item.cartId === itemId ? { ...item, course } : item
                )
            })),

            updateCartItemDiscount: (itemId, discount, discountType) => set((state) => ({
                activeCart: state.activeCart.map(item =>
                    item.cartId === itemId ? { ...item, itemDiscount: discount, itemDiscountType: discountType } : item
                )
            })),

            setTipAmount: (amount) => set({ tipAmount: amount }),

            clearCart: () => set({
                activeCart: [],
                discount: 0,
                activeCoupon: null,
                isApplyingCoupon: false,
                tipAmount: 0,
            }),

            saveTableDraft: (tableId, cart, discount) => set((state) => ({
                tableDrafts: {
                    ...state.tableDrafts,
                    [tableId]: { cart: [...cart], discount, updatedAt: Date.now() }
                }
            })),

            loadTableDraft: (tableId) => set((state) => {
                const draft = state.tableDrafts[tableId];
                if (!draft) return state;
                return { activeCart: [...draft.cart], discount: draft.discount };
            }),

            clearTableDraft: (tableId) => set((state) => {
                const next = { ...state.tableDrafts };
                delete next[tableId];
                return { tableDrafts: next };
            }),

            setDiscount: (d) => set({ discount: d, activeCoupon: null }),

            applyCoupon: async ({ code, branchId, orderType, subtotal, customerId }) => {
                if (!navigator.onLine) {
                    throw new Error('COUPON_REQUIRES_ONLINE');
                }
                const result = await ordersApi.validateCoupon({
                    code,
                    branchId,
                    orderType,
                    subtotal,
                    customerId,
                });
                if (!result?.valid) {
                    throw new Error(result?.message || 'COUPON_INVALID');
                }
                set({
                    activeCoupon: String(result.code || code).toUpperCase(),
                    discount: Number(result.discountPercent || 0),
                });
            },

            clearCoupon: () => set({ activeCoupon: null, discount: 0 }),

            holdOrder: (order) => set((state) => ({
                heldOrders: [...state.heldOrders, order],
                activeCart: [],
                discount: 0
            })),

            recallOrder: (index) => set((state) => {
                const orderToRecall = state.heldOrders[index];
                const newHeldOrders = state.heldOrders.filter((_, i) => i !== index);
                return {
                    heldOrders: newHeldOrders,
                    recalledOrder: orderToRecall,
                    activeCart: orderToRecall.cart
                };
            }),

            clearRecalledOrder: () => set({ recalledOrder: null }),

            updateTables: (tables) => set({ tables }),

            updateTable: (id, updates) => set((state) => ({
                tables: state.tables.map(t => t.id === id ? { ...t, ...updates } : t)
            })),

            updateTableStatus: async (tableId, status) => {
                // Optimistic Update
                set((state) => ({
                    tables: state.tables.map(t => t.id === tableId ? { ...t, status } : t)
                }));
                try {
                    if (navigator.onLine) {
                        await tablesApi.updateStatus(tableId, status);
                    } else {
                        await syncService.queue('tableStatus', 'UPDATE', { id: tableId, status });
                    }
                    const existing = await localDb.floorTables.get(tableId);
                    if (existing) {
                        await localDb.floorTables.put({ ...existing, status });
                    }
                } catch (error) {
                    set({ error: (error as any)?.code || (error as any)?.message || 'TABLE_STATUS_SYNC_FAILED' });
                }
            },

            updateZones: (zones) => set({ zones }),

            clearError: () => set({ error: null }),

            // ============ Socket Patch Actions ============
            // These replace full refetch on socket events for Item 7 compliance

            addOrderFromSocket: (rawOrder: any) => {
                if (!rawOrder?.id) return;
                set((state) => {
                    // Skip if already present (idempotent)
                    if (state.orders.some(o => o.id === rawOrder.id)) return state;
                    const normalized: Order = {
                        id: rawOrder.id,
                        orderNumber: rawOrder.order_number || rawOrder.orderNumber,
                        type: rawOrder.type as OrderType,
                        branchId: rawOrder.branch_id || rawOrder.branchId,
                        tableId: rawOrder.table_id || rawOrder.tableId,
                        source: rawOrder.source,
                        platformOrderId: rawOrder.platform_order_id || rawOrder.platformOrderId,
                        deliverySource: rawOrder.delivery_source || rawOrder.deliverySource,
                        customerId: rawOrder.customer_id || rawOrder.customerId,
                        customerName: rawOrder.customer_name || rawOrder.customerName,
                        customerPhone: rawOrder.customer_phone || rawOrder.customerPhone,
                        deliveryAddress: rawOrder.delivery_address || rawOrder.deliveryAddress,
                        deliveryLat: rawOrder.delivery_lat ?? rawOrder.deliveryLat ?? rawOrder.deliveryLatitude,
                        deliveryLng: rawOrder.delivery_lng ?? rawOrder.deliveryLng ?? rawOrder.deliveryLongitude,
                        deliveryAddressLabel: rawOrder.delivery_address_label || rawOrder.deliveryAddressLabel,
                        isCallCenterOrder: rawOrder.is_call_center_order || rawOrder.isCallCenterOrder,
                        items: (rawOrder.items || []).map((item: any, index: number) => ({
                            ...item,
                            cartId: item.cartId || item.id || `${rawOrder.id}-${index}`,
                            nameAr: item.nameAr || item.name_ar,
                            selectedModifiers: item.selectedModifiers || item.modifiers || [],
                        })),
                        status: rawOrder.status as OrderStatus,
                        subtotal: rawOrder.subtotal,
                        tax: rawOrder.tax,
                        tipAmount: rawOrder.tipAmount,
                        total: rawOrder.total,
                        discount: rawOrder.discount,
                        freeDelivery: rawOrder.free_delivery || rawOrder.freeDelivery,
                        isUrgent: rawOrder.is_urgent || rawOrder.isUrgent,
                        paymentMethod: rawOrder.payment_method || rawOrder.paymentMethod,
                        notes: rawOrder.notes,
                        kitchenNotes: rawOrder.kitchen_notes || rawOrder.kitchenNotes,
                        deliveryNotes: rawOrder.delivery_notes || rawOrder.deliveryNotes,
                        createdAt: new Date(rawOrder.created_at || rawOrder.createdAt || new Date()),
                        updatedAt: rawOrder.updated_at ? new Date(rawOrder.updated_at) : (rawOrder.updatedAt ? new Date(rawOrder.updatedAt) : undefined),
                        syncStatus: rawOrder.sync_status || rawOrder.syncStatus || 'SYNCED',
                    };
                    return { orders: [normalized, ...state.orders] };
                });
            },

            patchOrderStatus: (orderId: string, status: OrderStatus, updatedAt?: string) => {
                if (!orderId || !status) return false;
                const exists = get().orders.some(o => o.id === orderId);
                if (!exists) return false;
                set((state) => ({
                    orders: state.orders.map(o =>
                        o.id === orderId
                            ? { ...o, status, updatedAt: updatedAt ? new Date(updatedAt) : new Date() }
                            : o
                    )
                }));
                return true;
            },

            removeOrderFromSocket: (orderId: string) => {
                if (!orderId) return;
                set((state) => ({
                    orders: state.orders.filter(o => o.id !== orderId)
                }));
            },

            transferTable: async (sourceId, targetId) => {
                const state = get(); // Access current state
                const sourceTable = state.tables.find(t => t.id === sourceId);
                const targetTable = state.tables.find(t => t.id === targetId);

                if (!sourceTable || !targetTable) return;

                // Optimistic Update
                set((state) => ({
                    tables: state.tables.map(t => {
                        if (t.id === sourceId) return { ...t, status: TableStatus.AVAILABLE, currentOrderTotal: 0 };
                        if (t.id === targetId) return { ...t, status: TableStatus.OCCUPIED, currentOrderTotal: sourceTable.currentOrderTotal };
                        return t;
                    }),
                    orders: state.orders.map(o => (o.tableId === sourceId && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status as string)) ? { ...o, tableId: targetId } : o)
                }));

                // API Call (transactional on backend)
                try {
                    if (navigator.onLine) {
                        await tablesApi.transfer({
                            sourceTableId: sourceId,
                            targetTableId: targetId,
                            reference_id: `table-transfer:${sourceId}:${targetId}:${Date.now()}`,
                        });
                    } else {
                        await tablesApi.updateStatus(sourceId, TableStatus.AVAILABLE);
                        await tablesApi.updateStatus(targetId, TableStatus.OCCUPIED);
                    }
                } catch (error) {
                    set({ error: (error as any)?.code || (error as any)?.message || 'TABLE_TRANSFER_FAILED' });
                }
            },

            transferItems: async (sourceId, targetId, itemIds) => {
                const snapshot = get();
                const sourceOrder = snapshot.orders.find(o => o.tableId === sourceId && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status as string));
                const targetOrder = snapshot.orders.find(o => o.tableId === targetId && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status as string));
                if (!sourceOrder) return;

                const itemsToMove = sourceOrder.items.filter(i => itemIds.includes(i.cartId));
                if (itemsToMove.length === 0) return;
                const remainingItems = sourceOrder.items.filter(i => !itemIds.includes(i.cartId));

                let newOrders = snapshot.orders.map(o => (o.id === sourceOrder.id ? { ...o, items: remainingItems } : o));
                if (targetOrder) {
                    newOrders = newOrders.map(o => (o.id === targetOrder.id ? { ...o, items: [...o.items, ...itemsToMove] } : o));
                } else {
                    const newOrder: Order = {
                        ...sourceOrder,
                        id: `transfer-${Date.now()}`,
                        tableId: targetId,
                        items: itemsToMove,
                        createdAt: new Date(),
                        payments: [],
                        status: OrderStatus.PENDING
                    };
                    newOrders = [newOrder, ...newOrders];
                }
                set({ orders: newOrders });

                try {
                    if (navigator.onLine) {
                        const payloadItems = itemsToMove.map(i => ({ name: i.name, price: Number(i.price || 0), quantity: Number(i.quantity || 1) }));
                        if (targetOrder) {
                            await tablesApi.merge({
                                sourceTableId: sourceId,
                                targetTableId: targetId,
                                items: payloadItems,
                                reference_id: `table-merge:${sourceId}:${targetId}:${Date.now()}`,
                            });
                        } else {
                            await tablesApi.split({
                                sourceTableId: sourceId,
                                targetTableId: targetId,
                                items: payloadItems,
                                reference_id: `table-split:${sourceId}:${targetId}:${Date.now()}`,
                            });
                        }
                    }
                } catch (error) {
                    set({ error: (error as any)?.code || (error as any)?.message || 'TABLE_ITEMS_TRANSFER_FAILED' });
                }
            },

            splitTable: async (sourceId, targetId, itemIds) => {
                const state = get();
                const sourceOrder = state.orders.find(o => o.tableId === sourceId && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status as string));
                if (!sourceOrder) return;

                const itemsToMove = sourceOrder.items.filter(i => itemIds.includes(i.cartId));
                const remainingItems = sourceOrder.items.filter(i => !itemIds.includes(i.cartId));

                const newOrder: Order = {
                    ...sourceOrder,
                    id: `split-${Date.now()}`,
                    tableId: targetId,
                    items: itemsToMove,
                    createdAt: new Date(),
                };

                set({
                    orders: [newOrder, ...state.orders.map(o => o.id === sourceOrder.id ? { ...o, items: remainingItems } : o)],
                    tables: state.tables.map(t => t.id === targetId ? { ...t, status: TableStatus.OCCUPIED } : t)
                });

                try {
                    if (navigator.onLine) {
                        const payloadItems = itemsToMove.map(i => ({ name: i.name, price: Number(i.price || 0), quantity: Number(i.quantity || 1) }));
                        await tablesApi.split({
                            sourceTableId: sourceId,
                            targetTableId: targetId,
                            items: payloadItems,
                            reference_id: `table-split:${sourceId}:${targetId}:${Date.now()}`,
                        });
                    }
                } catch (error) {
                    set({ error: (error as any)?.code || (error as any)?.message || 'TABLE_SPLIT_FAILED' });
                }
            },

            loadTableOrder: (tableId) => set((state) => {
                const activeOrder = state.orders.find(o => o.tableId === tableId && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status as string));
                if (activeOrder) {
                    return { activeCart: activeOrder.items || [], discount: activeOrder.discount || 0 };
                }
                return { activeCart: [], discount: 0 };
            }),
        }),
        { name: 'order-storage' }
    )
);
