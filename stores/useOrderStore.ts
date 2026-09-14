// Order Store - Connected to Database API (Production Ready)
import { create } from 'zustand';
import { Order, OrderType, OrderItem, OrderStatus, Table, TableStatus, AuditEventType, FloorZone } from '../types';
import { ordersApi } from '../services/api/orders';
import { tablesApi } from '../services/api/tables';
import { localDb } from '../db/localDb';
import { syncService } from '../services/syncService';
import { useAuthStore } from './useAuthStore';
import { translations } from '../services/translations';
import { branchEntityCacheKey, fromBranchEntityCache, toBranchEntityCache } from '../src/utils/branchEntityCache';
import { findActiveTableOrder } from '../utils/tableOrder';

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
    tableDrafts: Record<string, { cart: OrderItem[]; discount: number; activeCoupon: string | null; updatedAt: number }>;
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
    updateOrderStatus: (orderId: string, status: OrderStatus, changedBy?: string, notes?: string, options?: { skipPrint?: boolean; skipVersionCheck?: boolean; approvalId?: number }) => Promise<void>;
    updateOrderItems: (orderId: string, data: { items: any[]; notes?: string; discount?: number; deliveryFee?: number; changedBy?: string; deliverySource?: string; paymentMethod?: string; deliveryAddress?: string; deliveryLat?: number; deliveryLng?: number; deliveryAddressLabel?: string; platformOrderId?: string; scheduledFor?: string }) => Promise<any>;

    fetchTables: (branchId: string) => Promise<void>;
    updateTableStatus: (tableId: string, status: TableStatus, currentOrderId?: string) => Promise<void>;
    resetTable: (tableId: string, reason?: string) => Promise<void>;

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
    saveTableDraft: (tableId: string, cart: OrderItem[], discount: number, activeCoupon?: string | null) => void;
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

    // Print chain (receipt templates, html2canvas, react-dom/server) is heavy
    // and only needed when actually printing — never on the critical path.
    const { printOrderReceipt } = await import('../services/posPrintOrchestrator');
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
                        const payload: any = await ordersApi.getAll(params);
                        const data: any[] = Array.isArray(payload)
                            ? payload
                            : Array.isArray(payload?.data)
                                ? payload.data
                                : Array.isArray(payload?.orders)
                                    ? payload.orders
                                    : [];
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
                            couponCode: o.coupon_code || o.couponCode,
                            freeDelivery: o.free_delivery,
                            isUrgent: o.is_urgent,
                            paymentMethod: o.payment_method,
                            notes: o.notes,
                            kitchenNotes: o.kitchen_notes || o.kitchenNotes,
                            deliveryNotes: o.delivery_notes || o.deliveryNotes,
                            driverId: o.driver_id || o.driverId,
                            deliveryFee: o.delivery_fee || o.deliveryFee,
                            scheduledFor: o.scheduled_for || o.scheduledFor,
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
                            status: t.status === TableStatus.AVAILABLE ? TableStatus.AVAILABLE : TableStatus.OCCUPIED,
                            defaultCouponCode: t.defaultCouponCode ?? t.default_coupon_code ?? undefined,
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
                        await localDb.floorTables.where('branchId').equals(branchId).delete();
                        await localDb.floorZones.where('branchId').equals(branchId).delete();
                        await localDb.floorTables.bulkPut(tables.map((t: any) => toBranchEntityCache({
                            ...t,
                            x: t.position?.x ?? t.x ?? 0,
                            y: t.position?.y ?? t.y ?? 0,
                        }, branchId)));
                        await localDb.floorZones.bulkPut(zones.map((z: any) => toBranchEntityCache(z, branchId)));
                    } else {
                        const tables = (await localDb.floorTables.where('branchId').equals(branchId).toArray())
                            .map((t: any) => ({
                                ...fromBranchEntityCache(t),
                                position: {
                                    x: t.position?.x ?? t.x ?? 0,
                                    y: t.position?.y ?? t.y ?? 0
                                },
                                width: t.width ?? 100,
                                height: t.height ?? 100
                            }));
                        const zones = (await localDb.floorZones.where('branchId').equals(branchId).toArray())
                            .map((zone: any) => fromBranchEntityCache(zone));
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

                    const serializedItems = order.items.map((item) => {
                        const menuItemId = resolveMenuItemId(item);
                        if (!menuItemId) {
                            throw new Error('INVALID_MENU_ITEM_REFERENCE');
                        }
                        return {
                            menu_item_id: menuItemId,
                            name: item.name,
                            name_ar: item.nameAr || (item as any).name_ar || item.name,
                            price: item.price,
                            size_id: item.sizeId || (item as any).size_id || undefined,
                            quantity: item.quantity,
                            notes: item.notes,
                            seat_number: item.seatNumber ?? item.seat_number ?? undefined,
                            course: item.course ?? undefined,
                            modifiers: (item.selectedModifiers || (item as any).modifiers || []).map((modifier: any) => ({
                                ...modifier,
                                id: modifier?.id || modifier?.optionId,
                                optionId: modifier?.optionId || modifier?.id,
                            })),
                        };
                    });

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
                        call_center_agent_id: (order as any).callCenterAgentId || (order as any).call_center_agent_id || undefined,
                        status: order.status || 'PENDING',
                        subtotal: order.subtotal,
                        discount: order.discount,
                        discount_type: 'PERCENT',
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
                        scheduled_for: (order as any).scheduledFor || undefined,
                        items: serializedItems
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
                        couponCode: savedOrder.coupon_code ?? savedOrder.couponCode ?? order.couponCode,
                        freeDelivery: savedOrder.free_delivery ?? order.freeDelivery,
                        isUrgent: savedOrder.is_urgent ?? order.isUrgent,
                        paymentMethod: savedOrder.payment_method ?? order.paymentMethod,
                        payments: savedOrder.payments ?? order.payments,
                        notes: savedOrder.notes ?? order.notes,
                        kitchenNotes: savedOrder.kitchen_notes ?? savedOrder.kitchenNotes ?? order.kitchenNotes,
                        deliveryNotes: savedOrder.delivery_notes ?? savedOrder.deliveryNotes ?? order.deliveryNotes,
                        scheduledFor: savedOrder.scheduled_for ?? savedOrder.scheduledFor ?? (order as any).scheduledFor,
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
                        activeCoupon: null,
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
                        await ordersApi.updateStatus(orderId, {
                            status,
                            changed_by: changedBy,
                            notes,
                            expected_updated_at: expectedUpdatedAt,
                            approval_id: options?.approvalId,
                        }, { idempotencyKey: `${orderId}:${status}` });
                    } else {
                        if (options?.approvalId) throw new Error('MANAGER_APPROVAL_REQUIRES_ONLINE');
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

            updateOrderItems: async (orderId, data) => {
                try {
                    const current = get().orders.find(o => o.id === orderId);
                    const serializedItems = (data.items || []).map((item: any) => {
                        const menuItemId = resolveMenuItemId(item);
                        if (!menuItemId) throw new Error('INVALID_MENU_ITEM_REFERENCE');
                        return {
                            menu_item_id: menuItemId,
                            name: item.name,
                            name_ar: item.nameAr || item.name_ar || item.name,
                            price: item.price,
                            size_id: item.sizeId || item.size_id || undefined,
                            quantity: item.quantity,
                            notes: item.notes,
                            modifiers: (item.selectedModifiers || item.modifiers || []).map((modifier: any) => ({
                                ...modifier,
                                id: modifier?.id || modifier?.optionId,
                                optionId: modifier?.optionId || modifier?.id,
                            })),
                        };
                    });
                    const saved: any = navigator.onLine
                        ? await ordersApi.updateItems(orderId, {
                            items: serializedItems,
                            notes: data.notes,
                            discount: data.discount,
                            deliveryFee: data.deliveryFee,
                            changedBy: data.changedBy,
                            deliverySource: (data as any).deliverySource,
                            paymentMethod: (data as any).paymentMethod,
                            deliveryAddress: (data as any).deliveryAddress,
                            deliveryLat: (data as any).deliveryLat,
                            deliveryLng: (data as any).deliveryLng,
                            deliveryAddressLabel: (data as any).deliveryAddressLabel,
                            platformOrderId: (data as any).platformOrderId,
                            scheduledFor: (data as any).scheduledFor,
                            expectedUpdatedAt: current?.updatedAt ? new Date(current.updatedAt).toISOString() : undefined,
                        })
                        : (() => { throw new Error('ORDER_EDIT_REQUIRES_ONLINE'); })();
                    const mergedItems = Array.isArray(saved?.items) && saved.items.length > 0 ? saved.items : data.items;
                    set((state) => ({
                        orders: state.orders.map(o => o.id === orderId
                            ? {
                                ...o, ...saved, items: mergedItems,
                                subtotal: saved?.subtotal ?? o.subtotal,
                                tax: saved?.tax ?? o.tax,
                                total: saved?.total ?? o.total,
                                discount: saved?.discount ?? o.discount,
                                updatedAt: new Date(),
                            } as any
                            : o),
                    }));
                    const existing = await localDb.orders.get(orderId);
                    if (existing) {
                        await localDb.orders.put({ ...existing, ...saved, items: mergedItems, updatedAt: new Date() } as any);
                    }
                    return saved;
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'ORDER_ITEMS_UPDATE_FAILED' });
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

            saveTableDraft: (tableId, cart, discount, activeCoupon = null) => set((state) => ({
                tableDrafts: {
                    ...state.tableDrafts,
                    [tableId]: { cart: [...cart], discount, activeCoupon, updatedAt: Date.now() }
                }
            })),

            loadTableDraft: (tableId) => set((state) => {
                const draft = state.tableDrafts[tableId];
                if (!draft) return state;
                return {
                    activeCart: [...draft.cart],
                    discount: draft.discount,
                    activeCoupon: draft.activeCoupon || null,
                };
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
                discount: 0,
                activeCoupon: null,
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

            updateTableStatus: async (tableId, status, currentOrderId) => {
                const previousTable = get().tables.find((table) => table.id === tableId);
                // Optimistic Update
                set((state) => ({
                    tables: state.tables.map(t => t.id === tableId ? { ...t, status, currentOrderId } : t)
                }));
                try {
                    if (navigator.onLine) {
                        const saved = await tablesApi.updateStatus(tableId, {
                            status,
                            currentOrderId,
                            branchId: useAuthStore.getState().settings.activeBranchId,
                        });
                        set((state) => ({ tables: state.tables.map(t => t.id === tableId ? { ...t, ...saved } : t) }));
                    } else {
                        await syncService.queue('tableStatus', 'UPDATE', {
                            id: tableId,
                            branchId: useAuthStore.getState().settings.activeBranchId,
                            status, currentOrderId,
                        });
                    }
                    const branchId = useAuthStore.getState().settings.activeBranchId;
                    const existing = branchId
                        ? await localDb.floorTables.get(branchEntityCacheKey(branchId, tableId))
                            || await localDb.floorTables.where('branchId').equals(branchId)
                                .and((row: any) => (row.entityId || row.id) === tableId)
                                .first()
                        : null;
                    if (existing) {
                        await localDb.floorTables.put(
                            branchId
                                ? { ...toBranchEntityCache(fromBranchEntityCache(existing) as any, branchId), status, currentOrderId }
                                : { ...existing, status, currentOrderId },
                        );
                    }
                } catch (error) {
                    set((state) => ({
                        tables: state.tables.map((table) => table.id === tableId && previousTable
                            ? { ...table, status: previousTable.status, currentOrderId: previousTable.currentOrderId }
                            : table),
                        error: (error as any)?.code || (error as any)?.message || 'TABLE_STATUS_SYNC_FAILED',
                    }));
                    throw error;
                }
            },

            resetTable: async (tableId, reason) => {
                const branchId = useAuthStore.getState().settings.activeBranchId;
                const saved = await tablesApi.reset(tableId, reason, branchId);
                set((state) => ({
                    tables: state.tables.map((table) => table.id === tableId
                        ? { ...table, status: TableStatus.AVAILABLE, currentOrderId: undefined, lockedByUserId: undefined }
                        : table),
                    orders: state.orders.map((order) => saved.resetOrderIds?.includes(order.id)
                        ? { ...order, status: OrderStatus.CANCELLED, cancelReason: reason, cancelledAt: new Date() }
                        : order),
                }));
                if (branchId) await get().fetchTables(branchId);
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
                const branchId = useAuthStore.getState().settings.activeBranchId;
                if (!branchId) throw new Error('BRANCH_SCOPE_REQUIRED');
                if (!navigator.onLine) throw new Error('TABLE_MANAGEMENT_REQUIRES_ONLINE');
                try {
                    await tablesApi.transfer({
                        sourceTableId: sourceId,
                        targetTableId: targetId,
                        branchId,
                        reference_id: `table-transfer:${sourceId}:${targetId}:${Date.now()}`,
                    });
                    await get().fetchOrders({ branch_id: branchId, limit: 500 });
                    await get().fetchTables(branchId);
                } catch (error) {
                    set({
                        error: (error as any)?.code || (error as any)?.message || 'TABLE_TRANSFER_FAILED'
                    });
                    throw error;
                }
            },

            transferItems: async (sourceId, targetId, itemIds) => {
                const state = get();
                const branchId = useAuthStore.getState().settings.activeBranchId;
                if (!branchId) throw new Error('BRANCH_SCOPE_REQUIRED');
                if (!navigator.onLine) throw new Error('TABLE_MANAGEMENT_REQUIRES_ONLINE');
                const sourceOrder = findActiveTableOrder(state.orders, state.tables, sourceId);
                const targetOrder = findActiveTableOrder(state.orders, state.tables, targetId);
                if (!sourceOrder) throw new Error('SOURCE_ORDER_NOT_FOUND');

                const itemsToMove = sourceOrder.items.filter(i => itemIds.includes(i.cartId));
                if (itemsToMove.length === 0) throw new Error('NO_ITEMS_SELECTED');

                try {
                    const payloadItems = itemsToMove.map(i => ({
                        id: i.cartId,
                        name: i.name,
                        price: Number(i.price || 0),
                        quantity: Number(i.quantity || 1),
                    }));
                    if (targetOrder) {
                        await tablesApi.merge({
                            sourceTableId: sourceId,
                            targetTableId: targetId,
                            branchId,
                            items: payloadItems,
                            reference_id: `table-merge:${sourceId}:${targetId}:${Date.now()}`,
                        });
                    } else {
                        await tablesApi.split({
                            sourceTableId: sourceId,
                            targetTableId: targetId,
                            branchId,
                            items: payloadItems,
                            reference_id: `table-split:${sourceId}:${targetId}:${Date.now()}`,
                        });
                    }
                    await get().fetchOrders({ branch_id: branchId, limit: 500 });
                    await get().fetchTables(branchId);
                } catch (error) {
                    set({
                        error: (error as any)?.code || (error as any)?.message || 'TABLE_ITEMS_TRANSFER_FAILED'
                    });
                    throw error;
                }
            },

            splitTable: async (sourceId, targetId, itemIds) => {
                const state = get();
                const branchId = useAuthStore.getState().settings.activeBranchId;
                if (!branchId) throw new Error('BRANCH_SCOPE_REQUIRED');
                if (!navigator.onLine) throw new Error('TABLE_MANAGEMENT_REQUIRES_ONLINE');
                const sourceOrder = findActiveTableOrder(state.orders, state.tables, sourceId);
                if (!sourceOrder) throw new Error('SOURCE_ORDER_NOT_FOUND');

                const itemsToMove = sourceOrder.items.filter(i => itemIds.includes(i.cartId));
                if (itemsToMove.length === 0) throw new Error('NO_ITEMS_SELECTED');

                try {
                    const payloadItems = itemsToMove.map(i => ({
                        id: i.cartId,
                        name: i.name,
                        price: Number(i.price || 0),
                        quantity: Number(i.quantity || 1),
                    }));
                    await tablesApi.split({
                        sourceTableId: sourceId,
                        targetTableId: targetId,
                        branchId,
                        items: payloadItems,
                        reference_id: `table-split:${sourceId}:${targetId}:${Date.now()}`,
                    });
                    await get().fetchOrders({ branch_id: branchId, limit: 500 });
                    await get().fetchTables(branchId);
                } catch (error) {
                    set({
                        error: (error as any)?.code || (error as any)?.message || 'TABLE_SPLIT_FAILED'
                    });
                    throw error;
                }
            },

            loadTableOrder: (tableId) => set((state) => {
                let activeOrder = findActiveTableOrder(state.orders, state.tables, tableId);
                // Fallback: if the floor-plan registry is not loaded yet (e.g. in
                // tests or before fetchTables resolves), still allow restoring a
                // draft from an active order belonging to this table.
                if (!activeOrder) {
                    activeOrder = state.orders.find((order) =>
                        order.tableId === tableId &&
                        order.status !== OrderStatus.DELIVERED &&
                        order.status !== OrderStatus.COMPLETED &&
                        order.status !== OrderStatus.CANCELLED &&
                        order.status !== OrderStatus.REFUNDED,
                    );
                }
                if (activeOrder) {
                    const subtotal = Number(activeOrder.subtotal || 0);
                    const discountAmount = Number(activeOrder.discount || 0);
                    return {
                        activeCart: activeOrder.items || [],
                        discount: subtotal > 0 ? (discountAmount / subtotal) * 100 : 0,
                        activeCoupon: activeOrder.couponCode || null,
                    };
                }
                return { activeCart: [], discount: 0, activeCoupon: null };
            }),
        }),
        { name: 'order-storage' }
    )
);
