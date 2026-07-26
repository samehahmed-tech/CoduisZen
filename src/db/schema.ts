// Database Schema for Coduis Zen
// Using Drizzle ORM with SQL Server

import { mssqlTable, nvarchar, int, bit, datetime2, real, uniqueIndex, index, unique, foreignKey, numeric, date, customType } from 'drizzle-orm/mssql-core';
import { sql } from 'drizzle-orm';

const jsonText = customType<{ data: any; driverData: string }>({
    dataType() {
        return 'nvarchar(max)';
    },
    toDriver(value) {
        return typeof value === 'string' ? value : JSON.stringify(value ?? null);
    },
    fromDriver(value) {
        if (typeof value !== 'string') return value;
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    },
});

// ============================================================================
// 👤 USERS & AUTHENTICATION
// ============================================================================

export const users = mssqlTable('users', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    email: nvarchar('email').unique().notNull(),
    passwordHash: nvarchar('password_hash'),
    pinCode: nvarchar('pin_code'), // 6 digit PIN for quick login
    pinCodeHash: nvarchar('pin_code_hash'), // Hashed PIN for security
    role: nvarchar('role').notNull(), // OWNER, ADMIN, MANAGER, ACCOUNTANT, CASHIER, IT, WAITER, etc.
    roleId: nvarchar('role_id'), // Reference to roles table for custom roles
    permissions: nvarchar('permissions').$type<string[]>().default(sql`'[]'`), // Custom user-specific permissions
    customPermissions: nvarchar('custom_permissions').$type<Record<string, boolean>>().default(sql`'{}'`), // Granular permission overrides
    assignedBranchId: nvarchar('assigned_branch_id'),
    allowedBranches: nvarchar('allowed_branches').$type<string[]>().default(sql`'[]'`), // Multiple branch access
    isActive: bit('is_active').default(true),
    managerPin: nvarchar('manager_pin'), // 4-digit PIN for manager overrides
    mfaEnabled: bit('mfa_enabled').default(false),
    mfaSecret: nvarchar('mfa_secret'),
    pinLoginEnabled: bit('pin_login_enabled').default(false), // Enable PIN-based login
    lastLoginAt: datetime2('last_login_at'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    index('users_email_idx').on(table.email),
    index('users_role_idx').on(table.role),
]);

export const userSessions = mssqlTable('user_sessions', {
    id: nvarchar('id').primaryKey(),
    userId: nvarchar('user_id').references(() => users.id).notNull(),
    tokenId: nvarchar('token_id').notNull().unique(),
    deviceName: nvarchar('device_name'),
    userAgent: nvarchar('user_agent'),
    ipAddress: nvarchar('ip_address'),
    isActive: bit('is_active').default(true),
    revokedAt: datetime2('revoked_at'),
    expiresAt: datetime2('expires_at').notNull(),
    lastSeenAt: datetime2('last_seen_at').default(sql`GETDATE()`),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    index('user_sessions_user_active_idx').on(table.userId, table.isActive),
    index('user_sessions_last_seen_idx').on(table.lastSeenAt),
    index('user_sessions_expires_idx').on(table.expiresAt),
]);

// ============================================================================
// 🔐 ROLES & PERMISSIONS
// ============================================================================

// Predefined and custom roles
export const roles = mssqlTable('roles', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull().unique(), // OWNER, ADMIN, MANAGER, ACCOUNTANT, CASHIER, IT, WAITER
    nameAr: nvarchar('name_ar'), // Arabic name
    description: nvarchar('description'),
    descriptionAr: nvarchar('description_ar'),
    permissions: nvarchar('permissions').$type<string[]>().default(sql`'[]'`), // List of permission keys
    isSystem: bit('is_system').default(false), // System roles cannot be deleted
    isActive: bit('is_active').default(true),
    priority: int('priority').default(0), // Higher = more privileged (for conflict resolution)
    color: nvarchar('color').default('#6366f1'), // UI color for displaying role
    icon: nvarchar('icon').default('user'), // Lucide icon name
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// Permission definitions for the entire system
export const permissionDefinitions = mssqlTable('permission_definitions', {
    id: nvarchar('id').primaryKey(),
    key: nvarchar('key').notNull().unique(), // e.g., 'orders.create', 'menu.edit', 'reports.view'
    name: nvarchar('name').notNull(), // Human-readable name
    nameAr: nvarchar('name_ar'), // Arabic name
    description: nvarchar('description'),
    descriptionAr: nvarchar('description_ar'),
    category: nvarchar('category').notNull(), // orders, menu, reports, settings, users, etc.
    categoryAr: nvarchar('category_ar'),
    subCategory: nvarchar('sub_category'), // For nested grouping
    isActive: bit('is_active').default(true),
    sortOrder: int('sort_order').default(0),
    dependsOn: nvarchar('depends_on').$type<string[]>().default(sql`'[]'`), // Required permissions
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

// ============================================================================
// 🏪 BRANCHES
// ============================================================================

export const branches = mssqlTable('branches', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    nameAr: nvarchar('name_ar'),
    location: nvarchar('location'),
    address: nvarchar('address'),
    serverIp: nvarchar('server_ip'),
    dayCloseEmails: nvarchar('day_close_emails').$type<string[]>().default(sql`'[]'`),
    phone: nvarchar('phone'),
    email: nvarchar('email'),
    isActive: bit('is_active').default(true),
    timezone: nvarchar('timezone').default('Africa/Cairo'),
    currency: nvarchar('currency').default('EGP'),
    taxRate: real('tax_rate').default(14),
    serviceCharge: real('service_charge').default(0),
    businessDate: nvarchar('business_date'), // Logical accounting day string (YYYY-MM-DD)
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// ============================================================================
// 👥 CUSTOMERS (CRM)
// ============================================================================

export const customers = mssqlTable('customers', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    phone: nvarchar('phone', { length: 20 }).unique().notNull(),
    email: nvarchar('email'),
    // Address Details
    address: nvarchar('address'),
    lat: real('lat'),
    lng: real('lng'),
    addressLabel: nvarchar('address_label'),
    zoneId: int('zone_id').references(() => deliveryZones.id),
    area: nvarchar('area'),
    building: nvarchar('building'),
    floor: nvarchar('floor'),
    apartment: nvarchar('apartment'),
    landmark: nvarchar('landmark'),
    // Customer Notes
    notes: nvarchar('notes'),
    // Loyalty & Stats
    visits: int('visits').default(0),
    totalSpent: real('total_spent').default(0),
    loyaltyTier: nvarchar('loyalty_tier').default('Bronze'), // Bronze, Silver, Gold, Platinum
    loyaltyPoints: int('loyalty_points').default(0),
    // Metadata
    source: nvarchar('source').default('call_center'), // call_center, pos, online, app
    deletedAt: datetime2('deleted_at'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    index('customers_name_idx').on(table.name),
]);

// Customer Addresses (Multiple per customer)
export const customerAddresses = mssqlTable('customer_addresses', {
    id: int('id').identity().primaryKey(),
    customerId: nvarchar('customer_id').references(() => customers.id).notNull(),
    label: nvarchar('label').notNull(), // Home, Work, etc.
    address: nvarchar('address').notNull(),
    lat: real('lat'),
    lng: real('lng'),
    zoneId: int('zone_id').references(() => deliveryZones.id),
    area: nvarchar('area'),
    building: nvarchar('building'),
    floor: nvarchar('floor'),
    apartment: nvarchar('apartment'),
    landmark: nvarchar('landmark'),
    isDefault: bit('is_default').default(false),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

// ============================================================================
// 🍽️ MENU MANAGEMENT
// ============================================================================

export const menuCategories = mssqlTable('menu_categories', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    nameAr: nvarchar('name_ar'),
    description: nvarchar('description'),
    icon: nvarchar('icon'),
    image: nvarchar('image'),
    color: nvarchar('color'),
    sortOrder: int('sort_order').default(0),
    isActive: bit('is_active').default(true),
    targetOrderTypes: jsonText('target_order_types').$type<string[]>().default(sql`'[]'`),
    menuIds: jsonText('menu_ids').$type<string[]>().default(sql`'["menu-1"]'`),
    printerIds: jsonText('printer_ids').$type<string[]>().default(sql`'[]'`),
    deletedAt: datetime2('deleted_at'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const menuItems = mssqlTable('menu_items', {
    id: nvarchar('id').primaryKey(),
    categoryId: nvarchar('category_id').references(() => menuCategories.id),
    name: nvarchar('name').notNull(),
    nameAr: nvarchar('name_ar'),
    description: nvarchar('description'),
    descriptionAr: nvarchar('description_ar'),
    price: real('price').notNull(),
    cost: real('cost').default(0), // Cost price for profit calculation
    image: nvarchar('image'),
    // Lifecycle Status
    status: nvarchar('status').default('published'), // draft, pending_approval, approved, published
    approvedBy: nvarchar('approved_by').references(() => users.id),
    approvedAt: datetime2('approved_at'),
    publishedAt: datetime2('published_at'),
    // Price Change Audit
    previousPrice: real('previous_price'),
    pendingPrice: real('pending_price'), // Proposed price awaiting approval
    priceChangeReason: nvarchar('price_change_reason'),
    priceApprovedBy: nvarchar('price_approved_by').references(() => users.id),
    priceApprovedAt: datetime2('price_approved_at'),
    // Availability
    isAvailable: bit('is_available').default(true),
    availableFrom: nvarchar('available_from'), // Time: "09:00"
    availableTo: nvarchar('available_to'), // Time: "22:00"
    availableDays: jsonText('available_days').$type<string[]>(), // ["mon", "tue", ...]
    modifierGroups: jsonText('modifier_groups').$type<any[]>(), // Inline modifiers (UI-friendly)
    sizes: jsonText('sizes').$type<any[]>().default(sql`'[]'`), // Inline item sizes (S/M/L/Family)
    // Multi-Branch Enterprise Extensions
    branchPricing: jsonText('branch_pricing').$type<{ branchId: string; price: number; isLocked?: boolean }[]>(),
    platformPricing: jsonText('platform_pricing').$type<{ platformId: string; price: number; commission?: number }[]>(),
    // Kitchen
    preparationTime: int('preparation_time').default(15), // minutes
    printerIds: jsonText('printer_ids').$type<string[]>(), // Which printers to send
    // Display
    isPopular: bit('is_popular').default(false),
    isFeatured: bit('is_featured').default(false),
    sortOrder: int('sort_order').default(0),
    layoutType: nvarchar('layout_type').default('standard'), // standard, wide, image-only
    // Barcode & SKU
    barcode: nvarchar('barcode'),
    sku: nvarchar('sku'),
    // Metadata
    isTaxExempt: bit('is_tax_exempt').default(false),
    deletedAt: datetime2('deleted_at'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    index('menu_items_category_idx').on(table.categoryId, table.isAvailable),
    index('idx_menu_items_barcode').on(table.barcode).where(sql`barcode IS NOT NULL`),
    uniqueIndex('idx_menu_items_sku_unique').on(table.sku).where(sql`sku IS NOT NULL AND deleted_at IS NULL`),
    uniqueIndex('idx_menu_items_name_unique').on(table.name).where(sql`deleted_at IS NULL`),
]);

// Modifier Groups (Size, Extras, etc.)
export const modifierGroups = mssqlTable('modifier_groups', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    nameAr: nvarchar('name_ar'),
    minSelection: int('min_selection').default(0),
    maxSelection: int('max_selection').default(1),
    isRequired: bit('is_required').default(false),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

export const modifierOptions = mssqlTable('modifier_options', {
    id: nvarchar('id').primaryKey(),
    groupId: nvarchar('group_id').references(() => modifierGroups.id).notNull(),
    name: nvarchar('name').notNull(),
    nameAr: nvarchar('name_ar'),
    price: real('price').default(0),
    sortOrder: int('sort_order').default(0),
    isAvailable: bit('is_available').default(true),
});

// Link items to modifier groups
export const menuItemModifiers = mssqlTable('menu_item_modifiers', {
    id: int('id').identity().primaryKey(),
    menuItemId: nvarchar('menu_item_id').references(() => menuItems.id).notNull(),
    modifierGroupId: nvarchar('modifier_group_id').references(() => modifierGroups.id).notNull(),
    sortOrder: int('sort_order').default(0),
});

// ============================================================================
// 📋 ORDERS
// ============================================================================

export const orders = mssqlTable('orders', {
    id: nvarchar('id').primaryKey(),
    traceId: nvarchar('trace_id'), // Trace ID for cross-module tracking
    parentOrderId: nvarchar('parent_order_id'), // Self-referencing link for split checks (null for original)
    globalOrderNumber: int('order_number').identity(),
    orderNumber: int('daily_order_number'), // Restarts from 1 per branch business date
    type: nvarchar('type').notNull(), // DINE_IN, TAKEAWAY, DELIVERY
    source: nvarchar('source').default('pos'), // pos, call_center, online, app
    // Branch & Location
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    tableId: nvarchar('table_id'),
    // Customer
    customerId: nvarchar('customer_id').references(() => customers.id),
    customerName: nvarchar('customer_name'),
    customerPhone: nvarchar('customer_phone'),
    deliveryAddress: nvarchar('delivery_address'),
    deliveryAddressId: int('delivery_address_id'),
    deliveryLat: real('delivery_lat'),
    deliveryLng: real('delivery_lng'),
    deliveryAddressLabel: nvarchar('delivery_address_label'),
    // Call Center specific
    isCallCenterOrder: bit('is_call_center_order').default(false),
    callCenterAgentId: nvarchar('call_center_agent_id'),
    // Status
    status: nvarchar('status').notNull().default('PENDING'), // PENDING, PREPARING, READY, OUT_FOR_DELIVERY, DELIVERED, CANCELLED
    // Pricing
    subtotal: real('subtotal').notNull(),
    discount: real('discount').default(0),
    discountType: nvarchar('discount_type'), // percentage, fixed
    discountReason: nvarchar('discount_reason'),
    tax: real('tax').notNull(),
    deliveryFee: real('delivery_fee').default(0),
    serviceCharge: real('service_charge').default(0),
    total: real('total').notNull(),
    tipAmount: real('tip_amount').default(0),

    // Details
    freeDelivery: bit('free_delivery').default(false),
    isUrgent: bit('is_urgent').default(false),
    isPaid: bit('is_paid').default(false),
    // Payment
    paymentMethod: nvarchar('payment_method'),
    paidAmount: real('paid_amount'),
    changeAmount: real('change_amount'),
    // Platform Integration
    platformOrderId: nvarchar('platform_order_id'), // External order ID from Talabat, Elmenus, etc.
    deliverySource: nvarchar('delivery_source').default('restaurant'), // restaurant, talabat, elmenus, jahez, etc.
    // Notes
    notes: nvarchar('notes'),
    kitchenNotes: nvarchar('kitchen_notes'),
    deliveryNotes: nvarchar('delivery_notes'),
    // Delivery
    driverId: nvarchar('driver_id'),
    estimatedDeliveryTime: datetime2('estimated_delivery_time'),
    actualDeliveryTime: datetime2('actual_delivery_time'),
    // Sync
    syncStatus: nvarchar('sync_status').default('SYNCED'), // SYNCED, PENDING, FAILED
    etaReceiptUuid: nvarchar('eta_receipt_uuid'), // Egyptian Tax Authority Receipt ID
    etaStatus: nvarchar('eta_status').default('pending'), // pending, submitted, failed, valid
    // Timestamps
    businessDate: nvarchar('business_date'), // Snapshot of branch's active logical day
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
    completedAt: datetime2('completed_at'),
    cancelledAt: datetime2('cancelled_at'),
    cancelReason: nvarchar('cancel_reason'),
    // Shift Tracking (Phase 3: Financial Ironclad)
    shiftId: nvarchar('shift_id'), // Will be linked logically to shifts.id
    deletedAt: datetime2('deleted_at'),
}, (table) => [
    index('orders_branch_date_idx').on(table.branchId, table.createdAt),
    index('orders_status_idx').on(table.status),
    index('orders_customer_idx').on(table.customerId),
    index('orders_shift_idx').on(table.shiftId),
]);

export const idempotencyKeys = mssqlTable('idempotency_keys', {
    id: int('id').identity().primaryKey(),
    key: nvarchar('key').notNull(),
    scope: nvarchar('scope').notNull().default('ORDER_CREATE'),
    requestHash: nvarchar('request_hash').notNull(),
    resourceId: nvarchar('resource_id'),
    responseCode: int('response_code'),
    responseBody: jsonText('response_body'),
    status: nvarchar('status').notNull().default('IN_PROGRESS'), // IN_PROGRESS, COMPLETED
    expiresAt: datetime2('expires_at').notNull(),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    uniqueIndex('idempotency_keys_key_scope_idx').on(table.key, table.scope),
]);

export const orderItems = mssqlTable('order_items', {
    id: int('id').identity().primaryKey(),
    orderId: nvarchar('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    menuItemId: nvarchar('menu_item_id').references(() => menuItems.id),
    name: nvarchar('name').notNull(),
    nameAr: nvarchar('name_ar'),
    price: real('price').notNull(),
    cost: real('cost').default(0), // Snapshot of calculated cost at time of order
    quantity: int('quantity').notNull(),
    notes: nvarchar('notes'),
    modifiers: nvarchar('modifiers').$type<{
        groupName: string;
        optionName: string;
        price: number;
    }[]>(),
    // Kitchen
    status: nvarchar('status').default('PENDING'), // PENDING, PREPARING, READY, SERVED
    preparedAt: datetime2('prepared_at'),
    servedAt: datetime2('served_at'),
    tax: real('tax').default(0), // Tax amount for this line item
    seatNumber: int('seat_number'),
    course: nvarchar('course'),
}, (table) => [
    index('order_items_order_idx').on(table.orderId),
    index('order_items_menu_item_idx').on(table.menuItemId),
]);

// Order Status History (for tracking)
export const orderStatusHistory = mssqlTable('order_status_history', {
    id: int('id').identity().primaryKey(),
    orderId: nvarchar('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    status: nvarchar('status').notNull(),
    changedBy: nvarchar('changed_by'),
    notes: nvarchar('notes'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

// ============================================================================
// 💳 PAYMENTS
// ============================================================================

export const payments = mssqlTable('payments', {
    id: nvarchar('id').primaryKey(),
    orderId: nvarchar('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    method: nvarchar('method').notNull(), // CASH, VISA, VODAFONE_CASH, INSTAPAY
    amount: real('amount').notNull(),
    referenceNumber: nvarchar('reference_number'),
    status: nvarchar('status').default('COMPLETED'), // PENDING, COMPLETED, REFUNDED
    processedBy: nvarchar('processed_by'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
}, (table) => [
    index('payments_order_idx').on(table.orderId),
]);

export const paymentSessions = mssqlTable('payment_sessions', {
    id: nvarchar('id').primaryKey(),
    orderId: nvarchar('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    providerType: nvarchar('provider_type'), // 'manual_cash', 'eft_pos', 'fawry', 'instapay', 'vodafone_cash'
    status: nvarchar('status').default('initiated'), // initiated, pending, confirmed, failed, cancelled, requires_reconciliation
    amount: real('amount').notNull(),
    currency: nvarchar('currency').default('EGP'),
    verified: bit('verified').default(false),
    externalReference: nvarchar('external_reference'),
    idempotencyKey: nvarchar('idempotency_key').unique(),
    deviceId: nvarchar('device_id'),
    createdBy: nvarchar('created_by'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    index('payment_sessions_order_idx').on(table.orderId),
    index('payment_sessions_idempotency_idx').on(table.idempotencyKey),
]);

export const ledgerEntries = mssqlTable('ledger_entries', {
    id: nvarchar('id').primaryKey(),
    orderId: nvarchar('order_id').references(() => orders.id),
    paymentSessionId: nvarchar('payment_session_id').references(() => paymentSessions.id),
    account: nvarchar('account').notNull(), // 'cash_drawer_1', 'cib_bank', 'revenue_food', 'cogs', 'inventory'
    direction: nvarchar('direction').notNull(), // 'debit', 'credit'
    amount: real('amount').notNull(),
    currency: nvarchar('currency').default('EGP'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
}, (table) => [
    index('ledger_entries_order_idx').on(table.orderId),
    index('ledger_entries_account_idx').on(table.account),
]);

// ============================================================================
// 📦 INVENTORY
// ============================================================================

export const warehouses = mssqlTable('warehouses', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    nameAr: nvarchar('name_ar'),
    branchId: nvarchar('branch_id').references(() => branches.id),
    type: nvarchar('type').default('MAIN'), // MAIN, SUB, KITCHEN, POINT_OF_SALE
    parentId: nvarchar('parent_id'),
    isActive: bit('is_active').default(true),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const inventoryItems = mssqlTable('inventory_items', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    nameAr: nvarchar('name_ar'),
    sku: nvarchar('sku'),
    barcode: nvarchar('barcode'),
    unit: nvarchar('unit').notNull(), // kg, g, liter, piece, etc.
    category: nvarchar('category'),
    threshold: real('threshold').default(0), // Low stock alert threshold
    costPrice: real('cost_price').default(0),
    purchasePrice: real('purchase_price').default(0),
    supplierId: nvarchar('supplier_id'),
    isAudited: bit('is_audited').default(true),
    auditFrequency: nvarchar('audit_frequency').default('DAILY'),
    isComposite: bit('is_composite').default(false),
    bom: nvarchar('bom').$type<any[]>().default([]),
    isActive: bit('is_active').default(true),
    deletedAt: datetime2('deleted_at'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    index('idx_inventory_items_barcode').on(table.barcode).where(sql`barcode IS NOT NULL`),
    uniqueIndex('idx_inventory_items_sku_not_null').on(table.sku).where(sql`sku IS NOT NULL`),
]);

export const inventoryLedger = mssqlTable('inventory_ledger', {
    id: nvarchar('id').primaryKey(),
    productId: nvarchar('product_id').references(() => inventoryItems.id).notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    change: real('change').notNull(), // (+) for add, (-) for remove
    unitCost: real('unit_cost').notNull(), // MAC costing at time of event
    reason: nvarchar('reason').notNull(), // 'sale', 'waste', 'purchase', 'transfer'
    referenceId: nvarchar('reference_id'), // order_id, po_id
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
}, (table) => [
    index('inventory_ledger_product_branch_idx').on(table.productId, table.branchId),
    index('inventory_ledger_reference_idx').on(table.referenceId),
]);

export const inventoryStock = mssqlTable('inventory_stock', {
    id: int('id').identity().primaryKey(),
    itemId: nvarchar('item_id').references(() => inventoryItems.id).notNull(),
    warehouseId: nvarchar('warehouse_id').references(() => warehouses.id).notNull(),
    quantity: real('quantity').default(0),
    lastUpdated: datetime2('last_updated').default(sql`GETDATE()`),
}, (table) => [
    index('inv_stock_item_wh_idx').on(table.itemId, table.warehouseId),
]);

export const stockMovements = mssqlTable('stock_movements', {
    id: int('id').identity().primaryKey(),
    itemId: nvarchar('item_id').references(() => inventoryItems.id).notNull(),
    fromWarehouseId: nvarchar('from_warehouse_id').references(() => warehouses.id),
    toWarehouseId: nvarchar('to_warehouse_id').references(() => warehouses.id),
    quantity: real('quantity').notNull(),
    unitCost: real('unit_cost').default(0), // Cost per unit at time of movement
    totalCost: real('total_cost').default(0), // Total cost of movement
    type: nvarchar('type').notNull(), // TRANSFER, ADJUSTMENT, PURCHASE, SALE_CONSUMPTION, WASTE
    referenceId: nvarchar('reference_id'), // Order ID, PO ID, etc.
    reason: nvarchar('reason'),
    performedBy: nvarchar('performed_by'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
}, (table) => [
    index('stock_mov_item_date_idx').on(table.itemId, table.createdAt),
]);

export const inventoryBatches = mssqlTable('inventory_batches', {
    id: nvarchar('id').primaryKey(),
    itemId: nvarchar('item_id').references(() => inventoryItems.id).notNull(),
    warehouseId: nvarchar('warehouse_id').references(() => warehouses.id).notNull(),
    batchNumber: nvarchar('batch_number').notNull(),
    receivedDate: datetime2('received_date').notNull().default(sql`GETDATE()`),
    expiryDate: datetime2('expiry_date').notNull(),
    initialQty: real('initial_qty').notNull(),
    currentQty: real('current_qty').notNull(),
    unitCost: real('unit_cost').notNull(),
    supplierId: nvarchar('supplier_id'), // Optional foreign key if linking to suppliers
    status: nvarchar('status').default('ACTIVE').notNull(), // ACTIVE, DEPLETED, EXPIRED, QUARANTINE
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
}, (table) => [
    index('fefo_idx').on(table.itemId, table.warehouseId, table.expiryDate, table.status),
    index('inv_batches_item_expiry_idx').on(table.itemId, table.expiryDate),
]);

export const batchTransactions = mssqlTable('batch_transactions', {
    id: int('id').identity().primaryKey(),
    batchId: nvarchar('batch_id').references(() => inventoryBatches.id).notNull(),
    stockMovementId: int('stock_movement_id').references(() => stockMovements.id).notNull(),
    quantityUsed: real('quantity_used').notNull(),
    costAtTime: real('cost_at_time').notNull(),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

// ============================================================================
// 🍳 RECIPES
// ============================================================================

export const recipes = mssqlTable('recipes', {
    id: nvarchar('id').primaryKey(),
    menuItemId: nvarchar('menu_item_id').references(() => menuItems.id),
    inventoryItemId: nvarchar('inventory_item_id').references(() => inventoryItems.id),
    yield: real('yield').default(1), // How many servings this makes
    sizeId: nvarchar('size_id'), // Link to specific size if multi-size item
    instructions: nvarchar('instructions'),
    // Version tracking
    version: int('version').default(1),
    currentVersionId: nvarchar('current_version_id'),
    // Cost tracking
    calculatedCost: real('calculated_cost'), // Auto-calculated from ingredients
    lastCostCalculation: datetime2('last_cost_calculation'),
    // Metadata
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const recipeVersions = mssqlTable('recipe_versions', {
    id: nvarchar('id').primaryKey(),
    recipeId: nvarchar('recipe_id').references(() => recipes.id).notNull(),
    version: int('version').notNull(),
    yield: real('yield').default(1),
    instructions: nvarchar('instructions'),
    // Snapshot of ingredients at this version
    ingredientsSnapshot: nvarchar('ingredients_snapshot').$type<{
        inventoryItemId: string;
        itemName: string;
        quantity: number;
        unit: string;
        costPerUnit: number;
    }[]>(),
    calculatedCost: real('calculated_cost'),
    // Change tracking
    changedBy: nvarchar('changed_by').references(() => users.id),
    changeReason: nvarchar('change_reason'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

export const recipeIngredients = mssqlTable('recipe_ingredients', {
    id: int('id').identity().primaryKey(),
    recipeId: nvarchar('recipe_id').references(() => recipes.id).notNull(),
    inventoryItemId: nvarchar('inventory_item_id').references(() => inventoryItems.id).notNull(),
    quantity: real('quantity').notNull(),
    unit: nvarchar('unit').notNull(),
    notes: nvarchar('notes'),
    // Cost tracking
    lastKnownCost: real('last_known_cost'),
    lastCostUpdate: datetime2('last_cost_update'),
});

// ============================================================================
// 🚚 SUPPLIERS
// ============================================================================

export const suppliers = mssqlTable('suppliers', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    contactPerson: nvarchar('contact_person'),
    phone: nvarchar('phone'),
    email: nvarchar('email'),
    address: nvarchar('address'),
    category: nvarchar('category'),
    paymentTerms: nvarchar('payment_terms'),
    notes: nvarchar('notes'),
    isActive: bit('is_active').default(true),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// ============================================================================
// 📋 PURCHASE ORDERS
// ============================================================================

export const purchaseOrders = mssqlTable('purchase_orders', {
    id: nvarchar('id').primaryKey(),
    supplierId: nvarchar('supplier_id').references(() => suppliers.id).notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    status: nvarchar('status').default('DRAFT'), // DRAFT, SENT, PARTIAL, RECEIVED, CANCELLED
    expectedDate: datetime2('expected_date'),
    subtotal: real('subtotal').default(0),
    notes: nvarchar('notes'),
    createdBy: nvarchar('created_by'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const purchaseOrderItems = mssqlTable('purchase_order_items', {
    id: int('id').identity().primaryKey(),
    poId: nvarchar('po_id').references(() => purchaseOrders.id).notNull(),
    itemId: nvarchar('item_id').references(() => inventoryItems.id).notNull(),
    orderedQty: real('ordered_qty').notNull(),
    receivedQty: real('received_qty').default(0),
    unitPrice: real('unit_price').notNull(),
});

export const purchaseRequests = mssqlTable('purchase_requests', {
    id: nvarchar('id').primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    department: nvarchar('department'),
    status: nvarchar('status').default('PENDING'), // PENDING, APPROVED, REJECTED, CONVERTED
    requestedBy: nvarchar('requested_by').references(() => users.id),
    approvedBy: nvarchar('approved_by').references(() => users.id),
    expectedDate: datetime2('expected_date'),
    notes: nvarchar('notes'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const purchaseRequestItems = mssqlTable('purchase_request_items', {
    id: int('id').identity().primaryKey(),
    prId: nvarchar('pr_id').references(() => purchaseRequests.id).notNull(),
    itemId: nvarchar('item_id').references(() => inventoryItems.id).notNull(),
    requestedQty: real('requested_qty').notNull(),
    approvedQty: real('approved_qty'),
});

export const goodsReceiptNotes = mssqlTable('goods_receipt_notes', {
    id: nvarchar('id').primaryKey(),
    poId: nvarchar('po_id').references(() => purchaseOrders.id),
    supplierId: nvarchar('supplier_id').references(() => suppliers.id).notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    status: nvarchar('status').default('RECEIVED'),
    receivedBy: nvarchar('received_by').references(() => users.id),
    referenceNumber: nvarchar('reference_number'),
    notes: nvarchar('notes'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const grnItems = mssqlTable('grn_items', {
    id: int('id').identity().primaryKey(),
    grnId: nvarchar('grn_id').references(() => goodsReceiptNotes.id).notNull(),
    itemId: nvarchar('item_id').references(() => inventoryItems.id).notNull(),
    poItemId: int('po_item_id').references(() => purchaseOrderItems.id),
    receivedQty: real('received_qty').notNull(),
    rejectedQty: real('rejected_qty').default(0),
    unitPrice: real('unit_price').notNull(),
    expiryDate: datetime2('expiry_date'),
    batchNumber: nvarchar('batch_number'),
});

export const supplierInvoices = mssqlTable('supplier_invoices', {
    id: nvarchar('id').primaryKey(),
    supplierId: nvarchar('supplier_id').references(() => suppliers.id).notNull(),
    grnId: nvarchar('grn_id').references(() => goodsReceiptNotes.id),
    status: nvarchar('status').default('DRAFT'), // DRAFT, PENDING_APPROVAL, APPROVED, PAID, PARTIAL
    invoiceNumber: nvarchar('invoice_number'),
    date: datetime2('date').default(sql`GETDATE()`).notNull(),
    dueDate: datetime2('due_date'),
    subtotal: real('subtotal').default(0),
    tax: real('tax').default(0),
    discount: real('discount').default(0),
    total: real('total').default(0),
    amountPaid: real('amount_paid').default(0),
    notes: nvarchar('notes'),
    createdBy: nvarchar('created_by').references(() => users.id),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const supplierInvoiceItems = mssqlTable('supplier_invoice_items', {
    id: int('id').identity().primaryKey(),
    invoiceId: nvarchar('invoice_id').references(() => supplierInvoices.id).notNull(),
    itemId: nvarchar('item_id').references(() => inventoryItems.id).notNull(),
    qty: real('qty').notNull(),
    unitPrice: real('unit_price').notNull(),
    total: real('total').notNull(),
});

export const supplierPayments = mssqlTable('supplier_payments', {
    id: nvarchar('id').primaryKey(),
    supplierId: nvarchar('supplier_id').references(() => suppliers.id).notNull(),
    invoiceId: nvarchar('invoice_id').references(() => supplierInvoices.id),
    amount: real('amount').notNull(),
    paymentMethod: nvarchar('payment_method').notNull(),
    reference: nvarchar('reference'),
    status: nvarchar('status').default('COMPLETED'),
    createdBy: nvarchar('created_by').references(() => users.id),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

export const stockCounts = mssqlTable('stock_counts', {
    id: nvarchar('id').primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    warehouseId: nvarchar('warehouse_id').references(() => warehouses.id),
    countDate: date('count_date'),
    status: nvarchar('status').default('DRAFT'), // DRAFT, FROZEN, COUNTING, REVIEW, POSTED, CANCELLED
    type: nvarchar('type').default('FULL'), // FULL, CYCLE, SPOT
    remarks: nvarchar('remarks'),
    createdBy: nvarchar('created_by').references(() => users.id),
    approvedBy: nvarchar('approved_by').references(() => users.id),
    scheduledDate: datetime2('scheduled_date'),
    frozenAt: datetime2('frozen_at'),
    postedAt: datetime2('posted_at'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const stockCountLines = mssqlTable('stock_count_lines', {
    id: int('id').identity().primaryKey(),
    countId: nvarchar('count_id').references(() => stockCounts.id).notNull(),
    itemId: nvarchar('item_id').references(() => inventoryItems.id).notNull(),
    expectedQty: real('expected_qty').default(0),
    countedQty: real('counted_qty'),
    varianceQty: real('variance_qty'),
    cost: real('cost').default(0),
    notes: nvarchar('notes'),
});

// ============================================================================
// 🖨️ PRINTERS
// ============================================================================

export const printers = mssqlTable('printers', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    code: nvarchar('code'),
    type: nvarchar('type').notNull(), // NETWORK, USB, BLUETOOTH
    address: nvarchar('address'), // IP address or port
    location: nvarchar('location'), // Kitchen, Bar, Reception
    role: nvarchar('role').default('OTHER'),
    roles: jsonText('roles').$type<string[]>().default(sql`'[]'`),
    stationId: nvarchar('station_id'),
    gatewayId: nvarchar('gateway_id'),
    isPrimaryCashier: bit('is_primary_cashier').default(false),
    lastHeartbeatAt: datetime2('last_heartbeat_at'),
    heartbeatStatus: nvarchar('heartbeat_status').default('UNKNOWN'),
    branchId: nvarchar('branch_id').references(() => branches.id),
    isActive: bit('is_active').default(true),
    paperWidth: int('paper_width').default(80), // mm
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// ============================================================================
// ⚠️ FINANCE EXCEPTIONS
// ============================================================================

export const financeExceptions = mssqlTable('finance_exceptions', {
    id: nvarchar('id').primaryKey(),
    reference: nvarchar('reference'),
    referenceType: nvarchar('reference_type'),
    payload: jsonText('payload'), // The original JournalEntryInput
    reason: nvarchar('reason').notNull(), // 'NO_OPEN_PERIOD', 'UNBALANCED', 'ACCOUNT_NOT_FOUND', etc.
    status: nvarchar('status').default('PENDING'), // PENDING, RESOLVED, DISMISSED
    resolvedBy: nvarchar('resolved_by'),
    resolvedAt: datetime2('resolved_at'),
    resolutionNotes: nvarchar('resolution_notes'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// ============================================================================
// 🔒 AUDIT LOGS
// ============================================================================

export const auditLogs = mssqlTable('audit_logs', {
    id: int('id').identity().primaryKey(),
    eventType: nvarchar('event_type').notNull(),
    userId: nvarchar('user_id'),
    userName: nvarchar('user_name'),
    userRole: nvarchar('user_role'),
    branchId: nvarchar('branch_id'),
    deviceId: nvarchar('device_id'),
    ipAddress: nvarchar('ip_address'),
    payload: jsonText('payload'),
    before: jsonText('before'),
    after: jsonText('after'),
    reason: nvarchar('reason'),
    signature: nvarchar('signature'), // HMAC for tamper detection
    signatureVersion: int('signature_version').default(1),
    isVerified: bit('is_verified'), // Set on verification check
    lastVerifiedAt: datetime2('last_verified_at'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

// ============================================================================
// 💰 FISCAL / ETA LOGS
// ============================================================================

export const fiscalLogs = mssqlTable('fiscal_logs', {
    id: int('id').identity().primaryKey(),
    orderId: nvarchar('order_id'),
    branchId: nvarchar('branch_id'),
    status: nvarchar('status').notNull(), // PENDING, SUBMITTED, FAILED
    attempt: int('attempt').default(0),
    lastError: nvarchar('last_error'),
    payload: jsonText('payload'),
    response: jsonText('response'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const etaDeadLetters = mssqlTable('eta_dead_letters', {
    id: int('id').identity().primaryKey(),
    orderId: nvarchar('order_id'),
    branchId: nvarchar('branch_id'),
    payload: jsonText('payload').notNull(),
    attempts: int('attempts').default(0),
    lastError: nvarchar('last_error'),
    status: nvarchar('status').default('PENDING'), // PENDING, RETRYING, DISMISSED, RESOLVED
    dismissedBy: nvarchar('dismissed_by'),
    dismissedAt: datetime2('dismissed_at'),
    resolvedAt: datetime2('resolved_at'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// ============================================================================
// 🖼️ IMAGES
// ============================================================================

export const images = mssqlTable('images', {
    id: nvarchar('id').primaryKey(),
    key: nvarchar('key').notNull(),
    url: nvarchar('url').notNull(),
    filename: nvarchar('filename'),
    contentType: nvarchar('content_type'),
    width: int('width'),
    height: int('height'),
    size: int('size'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

// ============================================================================
// 🕒 SHIFT MANAGEMENT
// ============================================================================

export const shifts = mssqlTable('shifts', {
    id: nvarchar('id').primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    userId: nvarchar('user_id').references(() => users.id).notNull(),
    openingTime: datetime2('opening_time').default(sql`GETDATE()`).notNull(),
    closingTime: datetime2('closing_time'),
    openingBalance: real('opening_balance').default(0).notNull(),
    expectedBalance: real('expected_balance').default(0), // System calculated
    actualBalance: real('actual_balance').default(0), // Cashier counted
    status: nvarchar('status').default('OPEN').notNull(), // OPEN, CLOSED
    notes: nvarchar('notes'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    index('shifts_branch_status_idx').on(table.branchId, table.status),
]);

// ============================================================================
// 🔐 MANAGER APPROVALS
// ============================================================================

export const managerApprovals = mssqlTable('manager_approvals', {
    id: int('id').identity().primaryKey(),
    managerId: nvarchar('manager_id').references(() => users.id).notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    actionType: nvarchar('action_type').notNull(), // VOID, DISCOUNT, REFUND, ITEM_DELETE
    relatedId: nvarchar('related_id'), // Order ID, Item ID, etc.
    reason: nvarchar('reason').notNull(),
    details: jsonText('details'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

// ============================================================================
// 📊 BUDGETS
// ============================================================================

export const budgets = mssqlTable('budgets', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(), // e.g., 'Q1 2026 Operating Budget'
    branchId: nvarchar('branch_id').references(() => branches.id),
    periodStart: datetime2('period_start').notNull(),
    periodEnd: datetime2('period_end').notNull(),
    status: nvarchar('status').default('DRAFT').notNull(), // DRAFT, ACTIVE, CLOSED
    notes: nvarchar('notes'),
    createdBy: nvarchar('created_by').references(() => users.id),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const budgetLines = mssqlTable('budget_lines', {
    id: int('id').identity().primaryKey(),
    budgetId: nvarchar('budget_id').references(() => budgets.id, { onDelete: 'cascade' }).notNull(),
    accountId: nvarchar('account_id').references(() => chartOfAccounts.id).notNull(),
    plannedAmount: numeric('planned_amount', { precision: 14, scale: 2 }).default('0').notNull(),
    description: nvarchar('description'),
}, (table) => [
    index('budget_lines_budget_idx').on(table.budgetId),
    index('budget_lines_account_idx').on(table.accountId),
]);

// ============================================================================
// 🏦 ACCOUNTING CORE (GL ENGINE)
// ============================================================================

export const costCenters = mssqlTable('cost_centers', {
    id: nvarchar('id').primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    code: nvarchar('code').notNull().unique(), // e.g., 'CC-MAADI-01'
    name: nvarchar('name').notNull(),
    isActive: bit('is_active').default(true),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

export const fiscalPeriods = mssqlTable('fiscal_periods', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(), // e.g., 'Jan 2026'
    startDate: datetime2('start_date').notNull(),
    endDate: datetime2('end_date').notNull(),
    status: nvarchar('status').default('OPEN').notNull(), // OPEN, CLOSED, LOCKED
    closedBy: nvarchar('closed_by').references(() => users.id),
    closedAt: datetime2('closed_at'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

export const chartOfAccounts = mssqlTable('chart_of_accounts', {
    id: nvarchar('id').primaryKey(),
    code: nvarchar('code').notNull().unique(), // typical hierachical code 1000, 1100
    name: nvarchar('name').notNull(),
    nameAr: nvarchar('name_ar'),
    type: nvarchar('type').notNull(), // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    normalBalance: nvarchar('normal_balance').notNull(), // DEBIT, CREDIT
    // To support tree structure, parentId needs explicit mapping to the same table if used via relations later
    parentId: nvarchar('parent_id'),
    isActive: bit('is_active').default(true),
    isControlAccount: bit('is_control_account').default(false), // e.g., Accounts Receivable
    allowManualJournals: bit('allow_manual_journals').default(true),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
}, (table) => [
    index('coa_type_idx').on(table.type),
    index('coa_code_idx').on(table.code),
]);

export const paymentMethodAccounts = mssqlTable('payment_method_accounts', {
    id: int('id').identity().primaryKey(),
    paymentMethod: nvarchar('payment_method').notNull().unique(), // CASH, VISA, VODAFONE_CASH
    accountId: nvarchar('account_id').references(() => chartOfAccounts.id).notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id), // Nullable for global fallback
});

export const taxAccounts = mssqlTable('tax_accounts', {
    id: int('id').identity().primaryKey(),
    taxType: nvarchar('tax_type').notNull(), // INPUT_VAT, OUTPUT_VAT, WITHHOLDING
    accountId: nvarchar('account_id').references(() => chartOfAccounts.id).notNull(),
    rate: real('rate').notNull(), // Percentage
});

export const journalEntries = mssqlTable('journal_entries', {
    id: nvarchar('id').primaryKey(),
    entryNumber: int('entry_number').identity(),
    date: datetime2('date').notNull().default(sql`GETDATE()`),
    reference: nvarchar('reference'), // Order ID, PO ID, Shift ID
    referenceType: nvarchar('reference_type').notNull(), // ORDER, PAYMENT, GRN, WASTE, MANUAL
    description: nvarchar('description').notNull(),
    status: nvarchar('status').default('POSTED').notNull(), // POSTED, REVERSED
    fiscalPeriodId: nvarchar('fiscal_period_id'), // Removed rigid foreign key to allow flexible period linking if period hasn't been strictly generated yet
    createdBy: nvarchar('created_by'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
}, (table) => [
    index('je_ref_idx').on(table.reference, table.referenceType),
    index('je_date_status_idx').on(table.date, table.status),
    index('je_source_idx').on(table.referenceType),
]);

export const journalLines = mssqlTable('journal_lines', {
    id: int('id').identity().primaryKey(),
    journalEntryId: nvarchar('journal_entry_id').references(() => journalEntries.id, { onDelete: 'cascade' }).notNull(),
    accountId: nvarchar('account_id').references(() => chartOfAccounts.id).notNull(),
    costCenterId: nvarchar('cost_center_id').references(() => costCenters.id), // Branch-level reporting
    debit: real('debit').default(0).notNull(),
    credit: real('credit').default(0).notNull(),
    description: nvarchar('description'),
}, (table) => [
    index('jl_acc_cc_idx').on(table.accountId, table.costCenterId),
    index('jl_entry_idx').on(table.journalEntryId),
    index('jl_account_idx').on(table.accountId),
]);

export const postingRules = mssqlTable('posting_rules', {
    id: nvarchar('id').primaryKey(),
    documentType: nvarchar('document_type').notNull(), // POS_SALE, POS_REFUND, GRN, PAYROLL
    amountSource: nvarchar('amount_source').notNull(), // SUBTOTAL, TOTAL, TAX, SERVICE_CHARGE
    direction: nvarchar('direction').notNull(), // DEBIT, CREDIT
    accountCode: nvarchar('account_code').notNull(), // e.g., '4110' or '{PAYMENT_METHOD}'
    conditionField: nvarchar('condition_field'), // e.g., 'orderType', 'paymentMethod'
    conditionValue: nvarchar('condition_value'), // e.g., 'DINE_IN', 'CASH'
    isActive: bit('is_active').default(true),
    isSystem: bit('is_system').default(false), // To block user from deleting seed rules
    version: int('version').default(1),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const recurringJournals = mssqlTable('recurring_journals', {
    id: nvarchar('id').primaryKey(),
    title: nvarchar('title').notNull(),
    frequency: nvarchar('frequency').notNull(), // DAILY, WEEKLY, MONTHLY, YEARLY
    nextRunDate: datetime2('next_run_date').notNull(),
    status: nvarchar('status').default('ACTIVE'), // ACTIVE, PAUSED
    payload: nvarchar('payload').notNull(),
    lastRunDate: datetime2('last_run_date'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// ============================================================================
// 🚚 DELIVERY & LOGISTICS
// ============================================================================

export const deliveryPlatforms = mssqlTable('delivery_platforms', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    isActive: bit('is_active').default(true).notNull(),
    feePercentage: real('fee_percentage').default(0),
    applyFeesToMenuPrice: bit('apply_fees_to_menu_price').default(false).notNull(),
    priceMarkupPercentage: real('price_markup_percentage').default(0),
    priceMarkupFixed: real('price_markup_fixed').default(0),
    integrationType: nvarchar('integration_type').default('MANUAL'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const deliveryZones = mssqlTable('delivery_zones', {
    id: int('id').identity().primaryKey(),
    name: nvarchar('name').notNull(), // Maadi, New Cairo, etc.
    nameAr: nvarchar('name_ar'),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    deliveryFee: real('delivery_fee').default(0),
    minOrderAmount: real('min_order_amount').default(0),
    estimatedTime: int('estimated_time').default(45), // minutes
    isActive: bit('is_active').default(true),
});

export const drivers = mssqlTable('drivers', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    phone: nvarchar('phone').notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id),
    status: nvarchar('status').default('AVAILABLE'), // AVAILABLE, BUSY, OFFLINE
    currentCashBalance: real('current_cash_balance').default(0),
    isActive: bit('is_active').default(true),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

// ============================================================================
// 📍 DRIVER TELEMETRY (Scalable Location Tracking)
// ============================================================================

export const driverTelemetry = mssqlTable('driver_telemetry', {
    id: int('id').identity().primaryKey(),
    driverId: nvarchar('driver_id').references(() => drivers.id).notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    speedKmh: real('speed_kmh'),
    accuracy: real('accuracy'),
    heading: real('heading'),        // compass direction in degrees
    altitude: real('altitude'),
    batteryLevel: int('battery_level'), // driver device battery %
    isCharging: bit('is_charging'),
    orderId: nvarchar('order_id'),       // current delivery order if any
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
}, (table) => [
    index('idx_telemetry_driver').on(table.driverId),
    index('idx_telemetry_branch').on(table.branchId),
    index('idx_telemetry_created').on(table.createdAt),
]);

// Latest telemetry per driver (materialized view-like, updated on each ping)
export const driverTelemetryLatest = mssqlTable('driver_telemetry_latest', {
    driverId: nvarchar('driver_id').references(() => drivers.id).primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    speedKmh: real('speed_kmh'),
    accuracy: real('accuracy'),
    heading: real('heading'),
    batteryLevel: int('battery_level'),
    orderId: nvarchar('order_id'),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// ============================================================================
// ⚙️ SETTINGS
// ============================================================================


export const systemSettings = mssqlTable('system_settings', {
    id: int('id').identity().primaryKey(),
    key: nvarchar('key').unique().notNull(),
    value: nvarchar('value'),
    category: nvarchar('category'),
    updatedBy: nvarchar('updated_by'),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const settings = mssqlTable('settings', {
    key: nvarchar('key').primaryKey(),
    value: jsonText('value').notNull(),
    category: nvarchar('category').default('general'),
    updatedBy: nvarchar('updated_by'),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// ============================================================================
// 🔌 WEBHOOKS & PLUGIN SYSTEM
// ============================================================================

export const webhookEndpoints = mssqlTable('webhook_endpoints', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    url: nvarchar('url').notNull(),
    secret: nvarchar('secret'),                // HMAC-SHA256 signing secret
    events: jsonText('events').$type<string[]>().default(sql`'[]'`), // e.g. ['order.created', 'order.completed']
    isActive: bit('is_active').default(true),
    branchId: nvarchar('branch_id'),           // null = all branches
    headers: jsonText('headers').$type<Record<string, string>>().default(sql`'{}'`),
    retryCount: int('retry_count').default(3),
    timeoutMs: int('timeout_ms').default(10000),
    createdBy: nvarchar('created_by'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const webhookDeliveries = mssqlTable('webhook_deliveries', {
    id: int('id').identity().primaryKey(),
    endpointId: nvarchar('endpoint_id').references(() => webhookEndpoints.id).notNull(),
    event: nvarchar('event').notNull(),        // e.g. 'order.created'
    payload: jsonText('payload'),
    status: nvarchar('status').default('PENDING'), // PENDING, SUCCESS, FAILED
    httpStatus: int('http_status'),
    responseBody: jsonText('response_body'),
    attempt: int('attempt').default(1),
    lastError: nvarchar('last_error'),
    deliveredAt: datetime2('delivered_at'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
}, (table) => [
    index('idx_webhook_delivery_endpoint').on(table.endpointId),
    index('idx_webhook_delivery_event').on(table.event),
    index('idx_webhook_delivery_status').on(table.status),
]);

// ============================================================================
// 📊 TYPE EXPORTS
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export type MenuCategory = typeof menuCategories.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;

export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;

export type ManagerApproval = typeof managerApprovals.$inferSelect;

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type InventoryBatch = typeof inventoryBatches.$inferSelect;
export type BatchTransaction = typeof batchTransactions.$inferSelect;

export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type DeliveryPlatformType = typeof deliveryPlatforms.$inferSelect;
export type JournalLine = typeof journalLines.$inferSelect;
export type FinanceException = typeof financeExceptions.$inferSelect;

export type AuditLog = typeof auditLogs.$inferSelect;
export type Image = typeof images.$inferSelect;
export type FiscalLog = typeof fiscalLogs.$inferSelect;

// ============================================================================
// 🪑 TABLES & FLOOR PLAN
// ============================================================================

export const floorZones = mssqlTable('floor_zones', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    width: int('width').default(800),
    height: int('height').default(600),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const tables = mssqlTable('tables', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    zoneId: nvarchar('zone_id').references(() => floorZones.id),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),

    // Position & Layout
    x: int('x').default(0),
    y: int('y').default(0),
    width: int('width').default(100),
    height: int('height').default(100),
    shape: nvarchar('shape').default('rectangle'), // rectangle, circle, etc.
    seats: int('seats').default(4),

    // State Machine
    status: nvarchar('status').default('AVAILABLE').notNull(),
    // AVAILABLE: Ready for refined guests
    // OCCUPIED: Guests are seated (even if no order yet)
    // RESERVED: Guests are expected
    // DIRTY: Guests left, needs cleaning
    // OUT_OF_SERVICE: Broken table / maintenance

    // Metadata for active session
    currentOrderId: nvarchar('current_order_id'), // Link to the active order if occupied
    lockedByUserId: nvarchar('locked_by_user_id'), // For soft locking (collision detection)

    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export type Table = typeof tables.$inferSelect;
export type NewTable = typeof tables.$inferInsert;
export type FloorZone = typeof floorZones.$inferSelect;

// ============================================================================
// 👥 HR & PAYROLL (ZenPeople)
// ============================================================================

export const employees = mssqlTable('employees', {
    id: nvarchar('id').primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    userId: nvarchar('user_id').references(() => users.id), // Optional linking to app user
    employeeCode: nvarchar('employee_code'),
    attendanceCode: nvarchar('attendance_code'),
    nationalId: nvarchar('national_id'),
    name: nvarchar('name').notNull(),
    nameAr: nvarchar('name_ar'),
    phone: nvarchar('phone'),
    email: nvarchar('email'),
    role: nvarchar('role').notNull(),
    departmentId: nvarchar('department_id').references(() => departments.id),
    jobTitleId: nvarchar('job_title_id').references(() => jobTitles.id),
    basicSalary: real('basic_salary').default(0).notNull(),
    hourlyRate: real('hourly_rate').default(0),
    emergencyContact: nvarchar('emergency_contact'),
    bankAccount: nvarchar('bank_account'),
    joinedAt: datetime2('joined_at').default(sql`GETDATE()`).notNull(),
    isActive: bit('is_active').default(true),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    index('employees_branch_idx').on(table.branchId),
]);

export const employeeDocuments = mssqlTable('employee_documents', {
    id: nvarchar('id').primaryKey(),
    employeeId: nvarchar('employee_id').references(() => employees.id).notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    documentType: nvarchar('document_type').notNull(),
    title: nvarchar('title').notNull(),
    documentNumber: nvarchar('document_number'),
    issueDate: datetime2('issue_date'),
    expiryDate: datetime2('expiry_date'),
    fileUrl: nvarchar('file_url'),
    status: nvarchar('status').default('ACTIVE').notNull(),
    notes: nvarchar('notes'),
    metadata: jsonText('metadata').default(sql`'{}'`),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    index('employee_documents_employee_idx').on(table.employeeId),
    index('employee_documents_branch_expiry_idx').on(table.branchId, table.expiryDate, table.status),
]);

export const attendance = mssqlTable('attendance', {
    id: nvarchar('id').primaryKey(), // Using uuid/nanoid text
    employeeId: nvarchar('employee_id').references(() => employees.id).notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    clockIn: datetime2('clock_in').default(sql`GETDATE()`).notNull(),
    clockOut: datetime2('clock_out'),
    clockInLat: real('clock_in_lat'),
    clockInLng: real('clock_in_lng'),
    clockOutLat: real('clock_out_lat'),
    clockOutLng: real('clock_out_lng'),
    status: nvarchar('status').default('PRESENT'), // PRESENT, LATE, ABSENT, ON_LEAVE
    totalHours: real('total_hours').default(0),
    notes: nvarchar('notes'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    index('attendance_employee_date_idx').on(table.employeeId, table.clockIn),
]);

export const payrollCycles = mssqlTable('payroll_cycles', {
    id: nvarchar('id').primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    periodStart: datetime2('period_start').notNull(),
    periodEnd: datetime2('period_end').notNull(),
    status: nvarchar('status').default('DRAFT').notNull(), // DRAFT, APPROVED, PAID
    totalAmount: real('total_amount').default(0),
    executedBy: nvarchar('executed_by').references(() => users.id),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const payrollPayouts = mssqlTable('payroll_payouts', {
    id: nvarchar('id').primaryKey(),
    cycleId: nvarchar('cycle_id').references(() => payrollCycles.id).notNull(),
    employeeId: nvarchar('employee_id').references(() => employees.id).notNull(),
    basicSalary: real('basic_salary').notNull(),
    deductions: real('deductions').default(0),
    overtime: real('overtime').default(0),
    netPay: real('net_pay').notNull(),
    status: nvarchar('status').default('PENDING'), // PENDING, PAID
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

export const departments = mssqlTable('departments', {
    id: nvarchar('id').primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id),
    name: nvarchar('name').notNull(),
    nameAr: nvarchar('name_ar'),
    managerId: nvarchar('manager_id').references(() => employees.id),
    parentId: nvarchar('parent_id'), 
    isActive: bit('is_active').default(true),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

export const jobTitles = mssqlTable('job_titles', {
    id: nvarchar('id').primaryKey(),
    departmentId: nvarchar('department_id').references(() => departments.id),
    title: nvarchar('title').notNull(),
    nameAr: nvarchar('name_ar'),
    isActive: bit('is_active').default(true),
});

export const leaveTypes = mssqlTable('leave_types', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    nameAr: nvarchar('name_ar'),
    daysPerYear: real('days_per_year').notNull(),
    isPaid: bit('is_paid').default(true),
    requiresApproval: bit('requires_approval').default(true),
});

export const leaveRequests = mssqlTable('leave_requests', {
    id: nvarchar('id').primaryKey(),
    employeeId: nvarchar('employee_id').references(() => employees.id).notNull(),
    leaveTypeId: nvarchar('leave_type_id').references(() => leaveTypes.id).notNull(),
    startDate: datetime2('start_date').notNull(),
    endDate: datetime2('end_date').notNull(),
    totalDays: real('total_days').notNull(),
    reason: nvarchar('reason'),
    status: nvarchar('status').default('PENDING'), // PENDING, APPROVED, REJECTED
    approvedBy: nvarchar('approved_by').references(() => users.id),
    rejectionReason: nvarchar('rejection_reason'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const overtimeEntries = mssqlTable('overtime_entries', {
    id: nvarchar('id').primaryKey(),
    employeeId: nvarchar('employee_id').references(() => employees.id).notNull(),
    date: datetime2('date').notNull(),
    regularHours: real('regular_hours').default(0),
    overtimeHours: real('overtime_hours').notNull(),
    overtimeRate: real('overtime_rate').default(1.5),
    overtimeAmount: real('overtime_amount').notNull(),
    status: nvarchar('status').default('PENDING'), // PENDING, APPROVED
    approvedBy: nvarchar('approved_by').references(() => users.id),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

// ============================================================================
// 📢 MARKETING CAMPAIGNS (CampaignHub)
// ============================================================================

export const campaigns = mssqlTable('campaigns', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    type: nvarchar('type').notNull(), // SMS, EMAIL, WHATSAPP, PUSH
    status: nvarchar('status').default('DRAFT').notNull(), // DRAFT, ACTIVE, SCHEDULED, PAUSED, COMPLETED
    targetAudience: nvarchar('target_audience'), // e.g. "ALL", "VIP", "INACTIVE_30_DAYS"
    content: nvarchar('content').notNull(), // Message body
    scheduledAt: datetime2('scheduled_at'),
    reach: int('reach').default(0),
    conversions: int('conversions').default(0),
    revenue: real('revenue').default(0), // Estimated revenue generated
    budget: real('budget').default(0),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// ============================================================================
// 📊 NEW TYPE EXPORTS
// ============================================================================

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type AttendanceRecord = typeof attendance.$inferSelect;
export type PayrollCycle = typeof payrollCycles.$inferSelect;
export type PayrollPayout = typeof payrollPayouts.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;

// ============================================================================
// 🚚 DELIVERY ASSIGNMENTS
// ============================================================================

export const deliveryAssignments = mssqlTable('delivery_assignments', {
    id: nvarchar('id').primaryKey(),
    orderId: nvarchar('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    driverId: nvarchar('driver_id').references(() => drivers.id).notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    status: nvarchar('status').default('ASSIGNED').notNull(), // ASSIGNED, PICKED_UP, EN_ROUTE, DELIVERED, FAILED, RETURNED
    assignedAt: datetime2('assigned_at').default(sql`GETDATE()`).notNull(),
    pickedUpAt: datetime2('picked_up_at'),
    deliveredAt: datetime2('delivered_at'),
    failureReason: nvarchar('failure_reason'),
    proofPhotoUrl: nvarchar('proof_photo_url'),
    customerRating: int('customer_rating'), // 1-5
    distanceKm: real('distance_km'),
    deliveryTimeMinutes: int('delivery_time_minutes'),
    notes: nvarchar('notes'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
}, (table) => [
    index('delivery_assignments_order_idx').on(table.orderId),
    index('delivery_assignments_driver_idx').on(table.driverId, table.status),
]);

// ============================================================================
// 🌅 DAY CLOSE REPORTS
// ============================================================================

export const dayCloseReports = mssqlTable('day_close_reports', {
    id: nvarchar('id').primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    // Kept for compatibility with databases created by the production installer.
    // That column is NOT NULL, so every close must populate both date columns.
    businessDate: date('business_date').notNull(),
    shiftId: nvarchar('shift_id').references(() => shifts.id),
    closedBy: nvarchar('closed_by').references(() => users.id).notNull(),
    date: date('date').notNull(),
    // Cash reconciliation
    expectedCash: real('expected_cash').default(0).notNull(),
    actualCash: real('actual_cash').default(0).notNull(),
    variance: real('variance').default(0).notNull(),
    // Payment method breakdowns (JSON for flexibility)
    paymentBreakdown: nvarchar('payment_breakdown').$type<{
        method: string;
        expected: number;
        actual: number;
    }[]>(),
    // Summaries
    totalOrders: int('total_orders').default(0),
    totalRevenue: real('total_revenue').default(0),
    totalRefunds: real('total_refunds').default(0),
    totalDiscounts: real('total_discounts').default(0),
    salesSnapshot: jsonText('sales_snapshot').$type<Record<string, any>>().default(sql`'{}'`),
    ordersSnapshot: jsonText('orders_snapshot').$type<Record<string, any>>().default(sql`'{}'`),
    paymentsSnapshot: jsonText('payments_snapshot').$type<Record<string, any>>().default(sql`'{}'`),
    inventorySnapshot: jsonText('inventory_snapshot').$type<Record<string, any>>().default(sql`'{}'`),
    shiftsSnapshot: jsonText('shifts_snapshot').$type<Record<string, any>>().default(sql`'{}'`),
    fiscalSnapshot: jsonText('fiscal_snapshot').$type<Record<string, any>>().default(sql`'{}'`),
    financeSnapshot: jsonText('finance_snapshot').$type<Record<string, any>>().default(sql`'{}'`),
    sideEffectSnapshot: jsonText('side_effect_snapshot').$type<Record<string, any>>().default(sql`'{}'`),
    auditSnapshot: jsonText('audit_snapshot').$type<Record<string, any>>().default(sql`'{}'`),
    operationalSnapshot: jsonText('operational_snapshot').$type<Record<string, any>>().default(sql`'{}'`),
    // Status
    status: nvarchar('status').default('DRAFT').notNull(), // DRAFT, SUBMITTED, APPROVED, REJECTED, CLOSED
    approvedBy: nvarchar('approved_by').references(() => users.id),
    approvedAt: datetime2('approved_at'),
    notes: nvarchar('notes'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    index('day_close_branch_date_idx').on(table.branchId, table.date),
    uniqueIndex('day_close_branch_date_unique_idx').on(table.branchId, table.date),
]);



// ============================================================================
// 🏭 PRODUCTION ORDERS
// ============================================================================

export const productionOrders = mssqlTable('production_orders', {
    id: nvarchar('id').primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id),
    targetItemId: nvarchar('target_item_id').references(() => inventoryItems.id).notNull(), // Links to the Semi-Finished Good
    recipeId: nvarchar('recipe_id').references(() => recipes.id),
    batchNumber: nvarchar('batch_number').notNull(),
    batchSize: real('batch_size').notNull().default(1), // Multiplier of recipe yield
    expectedYield: real('expected_yield').notNull(),
    actualYield: real('actual_yield'),
    status: nvarchar('status').default('PLANNED').notNull(), // PLANNED, IN_PROGRESS, COMPLETED, CANCELLED
    startedAt: datetime2('started_at'),
    completedAt: datetime2('completed_at'),
    warehouseId: nvarchar('warehouse_id').references(() => warehouses.id).notNull(),
    notes: nvarchar('notes'),
    createdBy: nvarchar('created_by').references(() => users.id),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const productionOrderItems = mssqlTable('production_order_items', {
    id: int('id').identity().primaryKey(),
    productionOrderId: nvarchar('production_order_id').references(() => productionOrders.id).notNull(),
    inventoryItemId: nvarchar('inventory_item_id').references(() => inventoryItems.id).notNull(),
    requiredQty: real('required_qty').notNull(),
    actualQty: real('actual_qty'), // How much was actually used
    unit: nvarchar('unit').notNull(),
});

// ============================================================================
// 🪑 RESERVATIONS
// ============================================================================

export const reservations = mssqlTable('reservations', {
    id: nvarchar('id').primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    tableId: nvarchar('table_id').references(() => tables.id),
    customerId: nvarchar('customer_id').references(() => customers.id),
    customerName: nvarchar('customer_name').notNull(),
    customerPhone: nvarchar('customer_phone').notNull(),
    date: date('date').notNull(),
    time: nvarchar('time').notNull(), // "19:00" format
    partySize: int('party_size').notNull().default(2),
    duration: int('duration').default(90), // Expected duration in minutes
    status: nvarchar('status').default('CONFIRMED').notNull(), // CONFIRMED, SEATED, COMPLETED, CANCELLED, NO_SHOW
    specialRequests: nvarchar('special_requests'),
    notes: nvarchar('notes'),
    source: nvarchar('source').default('PHONE'), // PHONE, WALK_IN, WEBSITE, APP
    createdBy: nvarchar('created_by'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    index('reservations_branch_date_idx').on(table.branchId, table.date),
]);

// ============================================================================
// 💸 REFUND RECORDS
// ============================================================================

export const refundRecords = mssqlTable('refund_records', {
    id: nvarchar('id').primaryKey(),
    orderId: nvarchar('order_id').references(() => orders.id).notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    amount: real('amount').notNull(),
    refundMethod: nvarchar('refund_method').notNull(), // CASH, CREDIT, VOUCHER, ORIGINAL_METHOD
    reason: nvarchar('reason').notNull(),
    reasonCategory: nvarchar('reason_category'), // CUSTOMER_COMPLAINT, WRONG_ORDER, QUALITY, LATE_DELIVERY, OTHER
    items: nvarchar('items').$type<{
        menuItemId: string;
        name: string;
        quantity: number;
        amount: number;
    }[]>(),
    status: nvarchar('status').default('PENDING').notNull(), // PENDING, APPROVED, PROCESSED, REJECTED
    requestedBy: nvarchar('requested_by').references(() => users.id).notNull(),
    approvedBy: nvarchar('approved_by').references(() => users.id),
    approvedAt: datetime2('approved_at'),
    processedAt: datetime2('processed_at'),
    rejectionReason: nvarchar('rejection_reason'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// ============================================================================
// 💬 WHATSAPP MESSAGES
// ============================================================================

export const whatsappMessages = mssqlTable('whatsapp_messages', {
    id: nvarchar('id').primaryKey(),
    customerId: nvarchar('customer_id').references(() => customers.id),
    customerPhone: nvarchar('customer_phone').notNull(),
    direction: nvarchar('direction').notNull(), // INBOUND, OUTBOUND
    content: nvarchar('content').notNull(),
    messageType: nvarchar('message_type').default('TEXT'), // TEXT, TEMPLATE, IMAGE, DOCUMENT
    templateId: nvarchar('template_id'),
    // Delivery status
    status: nvarchar('status').default('SENT').notNull(), // SENT, DELIVERED, READ, FAILED
    externalId: nvarchar('external_id'), // Message ID from WhatsApp API
    failureReason: nvarchar('failure_reason'),
    // Context
    campaignId: nvarchar('campaign_id').references(() => campaigns.id),
    orderId: nvarchar('order_id').references(() => orders.id),
    sentAt: datetime2('sent_at').default(sql`GETDATE()`),
    deliveredAt: datetime2('delivered_at'),
    readAt: datetime2('read_at'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

// ============================================================================
// 🏢 FRANCHISE CONFIGURATIONS
// ============================================================================

export const franchiseConfigurations = mssqlTable('franchise_configurations', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(), // Franchise brand name
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    contractType: nvarchar('contract_type').default('STANDARD'), // STANDARD, PREMIUM, MASTER
    royaltyPercentage: real('royalty_percentage').default(0),
    marketingFeePercentage: real('marketing_fee_percentage').default(0),
    contractStartDate: date('contract_start_date'),
    contractEndDate: date('contract_end_date'),
    allowMenuOverride: bit('allow_menu_override').default(false),
    allowPricingOverride: bit('allow_pricing_override').default(false),
    settings: nvarchar('settings').$type<Record<string, any>>().default(sql`'{}'`),
    isActive: bit('is_active').default(true),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// ============================================================================
// 📊 CAMPAIGN LOGS
// ============================================================================

export const campaignLogs = mssqlTable('campaign_logs', {
    id: int('id').identity().primaryKey(),
    campaignId: nvarchar('campaign_id').references(() => campaigns.id).notNull(),
    customerId: nvarchar('customer_id').references(() => customers.id),
    channel: nvarchar('channel').notNull(), // SMS, EMAIL, WHATSAPP, PUSH
    sentAt: datetime2('sent_at').default(sql`GETDATE()`),
    delivered: bit('delivered').default(false),
    opened: bit('opened').default(false),
    clicked: bit('clicked').default(false),
    errorMessage: nvarchar('error_message'),
});

// NOTE: Performance indexes for existing tables (orders, order_items, inventory_stock,
// stock_movements, audit_logs, payments, menu_items, customers) are added via a
// raw SQL migration file, since Drizzle standalone index() calls require being
// inside a pgTable's third argument.

// ============================================================================
// 👥 HR & WORKFORCE (CORE)
// ============================================================================

export const payroll = mssqlTable('payroll', {
    id: int('id').identity().primaryKey(),
    userId: nvarchar('user_id').references(() => users.id).notNull(),
    month: nvarchar('month').notNull(), // YYYY-MM
    baseSalary: real('base_salary').notNull(),
    overtimePay: real('overtime_pay').default(0),
    bonuses: real('bonuses').default(0),
    deductions: real('deductions').default(0),
    netSalary: real('net_salary').notNull(),
    status: nvarchar('status').default('DRAFT'), // DRAFT, APPROVED, PAID
    paidAt: datetime2('paid_at'),
    processedBy: nvarchar('processed_by'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    uniqueIndex('idx_payroll_user_month').on(table.userId, table.month),
]);

// ============================================================================
// 📊 BI & ANALYTICS (Centralized Intelligence Layer)
// ============================================================================


// Daily aggregated performance per branch
export const dailyBranchSummaries = mssqlTable('daily_branch_summaries', {
    id: int('id').identity().primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    date: date('date').notNull(),
    totalRevenue: real('total_revenue').default(0),
    netRevenue: real('net_revenue').default(0), // after tax/discounts
    totalOrders: int('total_orders').default(0),
    avgOrderValue: real('avg_order_value').default(0),
    totalTax: real('total_tax').default(0),
    totalDiscounts: real('total_discounts').default(0),
    dineInRevenue: real('dine_in_revenue').default(0),
    takeawayRevenue: real('takeaway_revenue').default(0),
    deliveryRevenue: real('delivery_revenue').default(0),
    grossProfit: real('gross_profit').default(0),
    uniqueCustomers: int('unique_customers').default(0),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    uniqueIndex('idx_branch_summary_date').on(table.branchId, table.date),
]);

// Performance tracking per menu item (Sales Analytics)
export const itemDailySnapshots = mssqlTable('item_daily_snapshots', {
    id: int('id').identity().primaryKey(),
    menuItemId: nvarchar('menu_item_id').references(() => menuItems.id).notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id),
    date: date('date').notNull(),
    quantitySold: real('quantity_sold').default(0),
    totalSales: real('total_sales').default(0),
    totalCost: real('total_cost').default(0),
    grossProfit: real('gross_profit').default(0),
    avgPrice: real('avg_price').default(0),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    uniqueIndex('idx_item_snapshot_date').on(table.menuItemId, table.branchId, table.date),
]);

// Customer Intelligence (RFM Analysis)
export const customerRfmMetrics = mssqlTable('customer_rfm_metrics', {
    id: int('id').identity().primaryKey(),
    customerId: nvarchar('customer_id').references(() => customers.id).notNull(),
    branchId: nvarchar('branch_id'), // optional, for branch-specific loyalty
    recency: int('recency'), // Days since last order
    frequency: int('frequency'), // Total orders
    monetary: real('monetary'), // Total lifetime spent
    recencyScore: int('recency_score'), // 1-5 rank
    frequencyScore: int('frequency_score'), // 1-5 rank
    monetaryScore: int('monetary_score'), // 1-5 rank
    rfmSegment: nvarchar('rfm_segment'), // CHAMPIONS, LOYAL, AT_RISK, ABOUT_TO_SLEEP, etc.
    lastOrderDate: datetime2('last_order_date'),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    uniqueIndex('idx_customer_rfm_unique').on(table.customerId, table.branchId),
]);

// ============================================================================
// 🔔 NOTIFICATIONS & MESSAGING (INTERNAL COMMUNICATION)
// ============================================================================

export const notifications = mssqlTable('notifications', {
    id: int('id').identity().primaryKey(),
    userId: nvarchar('user_id').references(() => users.id).notNull(), // recipient
    title: nvarchar('title').notNull(),
    message: nvarchar('message').notNull(),
    type: nvarchar('type').default('INFO'), // INFO, SUCCESS, WARNING, ERROR, SYSTEM, MESSAGE
    isRead: bit('is_read').default(false),
    actionUrl: nvarchar('action_url'), // Link to order, message, etc.
    metadata: jsonText('metadata'), // e.g. { orderId: '...', senderId: '...' }
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

export const internalMessages = mssqlTable('internal_messages', {
    id: int('id').identity().primaryKey(),
    senderId: nvarchar('sender_id').references(() => users.id).notNull(),
    receiverId: nvarchar('receiver_id').references(() => users.id).notNull(),
    subject: nvarchar('subject'),
    body: nvarchar('body').notNull(),
    isRead: bit('is_read').default(false),
    isArchived: bit('is_archived').default(false), // User clears from inbox
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});
// ============================================================================
// 🏆 WORKSTREAM 7: CRM, LOYALTY, AND MARKETING
// ============================================================================

export const customerWallets = mssqlTable('customer_wallets', {
    id: nvarchar('id').primaryKey(),
    customerId: nvarchar('customer_id').references(() => customers.id).notNull(),
    balance: real('balance').default(0).notNull(),
    currency: nvarchar('currency').default('EGP').notNull(),
    lastUpdated: datetime2('last_updated').default(sql`GETDATE()`),
});

export const walletTransactions = mssqlTable('wallet_transactions', {
    id: int('id').identity().primaryKey(),
    walletId: nvarchar('wallet_id').references(() => customerWallets.id).notNull(),
    amount: real('amount').notNull(), // positive for deposit, negative for withdrawal
    type: nvarchar('type').notNull(), // DEPOSIT, PAYMENT, REFUND, ADJUSTMENT
    referenceId: nvarchar('reference_id'), // Order ID or Invoice ID
    notes: nvarchar('notes'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

export const loyaltyRewards = mssqlTable('loyalty_rewards', {
    id: nvarchar('id').primaryKey(),
    name: nvarchar('name').notNull(),
    description: nvarchar('description'),
    pointsCost: int('points_cost').notNull(),
    type: nvarchar('type').notNull(), // DISCOUNT, FREE_ITEM, STORE_CREDIT
    rewardValue: real('reward_value'), // Monetary amount if discount/credit
    menuItemId: nvarchar('menu_item_id').references(() => menuItems.id), // If FREE_ITEM
    isActive: bit('is_active').default(true),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

export const loyaltyLedger = mssqlTable('loyalty_ledger', {
    id: int('id').identity().primaryKey(),
    customerId: nvarchar('customer_id').references(() => customers.id).notNull(),
    points: int('points').notNull(), // positive for EARNED, negative for REDEEMED
    type: nvarchar('type').notNull(), // EARNED, REDEEMED, ADJUSTMENT, EXPIRED
    referenceId: nvarchar('reference_id'), // Order ID or Reward ID
    notes: nvarchar('notes'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

export const coupons = mssqlTable('coupons', {
    id: nvarchar('id').primaryKey(),
    code: nvarchar('code').unique().notNull(),
    type: nvarchar('type').notNull(), // PERCENTAGE, FIXED_AMOUNT, FREE_SHIPPING
    value: real('value').notNull(),
    minOrderValue: real('min_order_value').default(0),
    maxDiscount: real('max_discount'),
    startDate: datetime2('start_date').default(sql`GETDATE()`),
    endDate: datetime2('end_date'),
    usageLimit: int('usage_limit'),
    usedCount: int('used_count').default(0),
    isActive: bit('is_active').default(true),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
});

export const customerComplaints = mssqlTable('customer_complaints', {
    id: nvarchar('id').primaryKey(),
    customerId: nvarchar('customer_id').references(() => customers.id).notNull(),
    orderId: nvarchar('order_id').references(() => orders.id), // Optional link to an order
    subject: nvarchar('subject').notNull(),
    description: nvarchar('description').notNull(),
    status: nvarchar('status').default('OPEN'), // OPEN, IN_PROGRESS, RESOLVED, CLOSED
    priority: nvarchar('priority').default('MEDIUM'), // LOW, MEDIUM, HIGH, CRITICAL
    resolutionNotes: nvarchar('resolution_notes'),
    assignedTo: nvarchar('assigned_to'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

// ============================================================================
// 📊 NEW TYPE EXPORTS
// ============================================================================

export type DeliveryAssignment = typeof deliveryAssignments.$inferSelect;
export type NewDeliveryAssignment = typeof deliveryAssignments.$inferInsert;
export type DayCloseReport = typeof dayCloseReports.$inferSelect;
export type NewDayCloseReport = typeof dayCloseReports.$inferInsert;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type NewLeaveRequest = typeof leaveRequests.$inferInsert;
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type NewProductionOrder = typeof productionOrders.$inferInsert;
export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
export type RefundRecord = typeof refundRecords.$inferSelect;
export type NewRefundRecord = typeof refundRecords.$inferInsert;
export type WhatsAppMessage = typeof whatsappMessages.$inferSelect;
export type FranchiseConfiguration = typeof franchiseConfigurations.$inferSelect;
export type CampaignLog = typeof campaignLogs.$inferSelect;
export type Driver = typeof drivers.$inferSelect;
export type NewDriver = typeof drivers.$inferInsert;
export type DeliveryZone = typeof deliveryZones.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;

// Guide.md Phase 1 additions
export type DriverTelemetryRecord = typeof driverTelemetry.$inferSelect;
export type DriverTelemetryLatestRecord = typeof driverTelemetryLatest.$inferSelect;
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoints.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

// Guide.md Phase 2 additions (Analytics)
export type DailyBranchSummary = typeof dailyBranchSummaries.$inferSelect;
export type ItemDailySnapshot = typeof itemDailySnapshots.$inferSelect;
export type CustomerRfmMetric = typeof customerRfmMetrics.$inferSelect;

export const userDailyPerformance = mssqlTable('user_daily_performance', {
    id: int('id').identity().primaryKey(),
    userId: nvarchar('user_id').references(() => users.id).notNull(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    date: nvarchar('date').notNull(),
    orderCount: int('order_count').default(0),
    totalSales: real('total_sales').default(0),
    totalPoints: int('total_points').default(0),
    avgProcessingTime: real('avg_processing_time').default(0),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
}, (table) => [
    uniqueIndex('user_daily_perf_unique').on(table.userId, table.branchId, table.date),
]);

export type NotificationRecord = typeof notifications.$inferSelect;
export type NewNotificationRecord = typeof notifications.$inferInsert;
export type InternalMessage = typeof internalMessages.$inferSelect;
export type NewInternalMessage = typeof internalMessages.$inferInsert;

// ============================================================================
// 🍳 WORKSTREAM 8: RESTAURANT OPERATIONS EXCELLENCE (KDS & WAITLIST)
// ============================================================================

export const waitlists = mssqlTable('waitlists', {
    id: int('id').identity().primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    customerName: nvarchar('customer_name').notNull(),
    customerPhone: nvarchar('customer_phone'),
    partySize: int('party_size').notNull(),
    quotedTimeMinutes: int('quoted_time_minutes').default(0), // "15 mins"
    status: nvarchar('status').default('WAITING'), // WAITING, SEATED, NO_SHOW, CANCELLED
    tableId: nvarchar('table_id').references(() => tables.id), // Assigned table if SEATED
    notes: nvarchar('notes'),
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    seatedAt: datetime2('seated_at'),
});

export const kdsTickets = mssqlTable('kds_tickets', {
    id: nvarchar('id').primaryKey(),
    branchId: nvarchar('branch_id').references(() => branches.id).notNull(),
    orderId: nvarchar('order_id').references(() => orders.id).notNull(),
    routingStation: nvarchar('routing_station').notNull(), // 'GRILL', 'BAR', 'FRYER'
    targetTime: datetime2('target_time'), // Expected completion time
    status: nvarchar('status').default('PENDING'), // PENDING, PREPARING, READY, SERVED
    priority: nvarchar('priority').default('NORMAL'), // NORMAL, RUSH, REMAKE
    printedAt: datetime2('printed_at'),
    bumpedAt: datetime2('bumped_at'), // Marked ready
    createdAt: datetime2('created_at').default(sql`GETDATE()`),
    updatedAt: datetime2('updated_at').default(sql`GETDATE()`),
});

export const kdsTicketItems = mssqlTable('kds_ticket_items', {
    id: int('id').identity().primaryKey(),
    kdsTicketId: nvarchar('kds_ticket_id').references(() => kdsTickets.id).notNull(),
    orderItemId: int('order_item_id'), // Links loosely to orderItems
    menuItemId: nvarchar('menu_item_id').notNull(), // Duplicated for raw query speed
    itemName: nvarchar('item_name').notNull(),
    quantity: int('quantity').notNull(),
    modifiersText: nvarchar('modifiers_text'), // Flattened string for screen view
    isBumped: bit('is_bumped').default(false), // Item-level tracking
});


// --- RESTORED TABLES ---
export const attendancePolicies = mssqlTable("attendance_policies", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	branchId: nvarchar("branch_id").notNull(),
	name: nvarchar({ length: 'max' }).notNull(),
	code: nvarchar({ length: 'max' }),
	graceLateMinutes: int("grace_late_minutes").default(15).notNull(),
	earlyLeaveToleranceMinutes: int("early_leave_tolerance_minutes").default(10).notNull(),
	overtimeThresholdMinutes: int("overtime_threshold_minutes").default(30).notNull(),
	minHoursForPresent: real("min_hours_for_present").default(4).notNull(),
	attendanceProcessingMode: nvarchar("attendance_processing_mode").default('AUTO').notNull(),
	operationalDayStartHour: int("operational_day_start_hour").default(8).notNull(),
	operationalDayEndHour: int("operational_day_end_hour").default(5).notNull(),
	maxSmartSessionHours: real("max_smart_session_hours").default(22).notNull(),
	geofenceStrict: bit("geofence_strict").default(false),
	faceRecognitionRequired: bit("face_recognition_required").default(false),
	autoCloseOpenSessions: bit("auto_close_open_sessions").default(false),
	autoResolveMissingOut: bit("auto_resolve_missing_out").default(false),
	isDefault: bit("is_default").default(false),
	isActive: bit("is_active").default(true),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("attendance_policies_branch_default_idx").on(table.branchId, table.isDefault, table.isActive),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_policies_branch_id_fkey",
    }),
]);


export const employeeShiftAssignments = mssqlTable("employee_shift_assignments", {
	id: int().identity().primaryKey().notNull(),
	employeeId: nvarchar("employee_id").notNull(),
	branchId: nvarchar("branch_id").notNull(),
	shiftTemplateId: nvarchar("shift_template_id").notNull(),
	effectiveFrom: date("effective_from", { mode: 'date' }).notNull(),
	effectiveTo: date("effective_to", { mode: 'date' }),
	isPrimary: bit("is_primary").default(true),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "employee_shift_assignments_branch_id_fkey",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "employee_shift_assignments_employee_id_fkey",
    }),
    foreignKey({
    columns: [table.shiftTemplateId],
    foreignColumns: [shiftTemplates.id],
    name: "employee_shift_assignments_shift_template_id_fkey",
    }),
]);


export const shiftTemplates = mssqlTable("shift_templates", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	branchId: nvarchar("branch_id").notNull(),
	name: nvarchar({ length: 'max' }).notNull(),
	code: nvarchar({ length: 'max' }),
	attendancePolicyId: nvarchar("attendance_policy_id"),
	startTime: nvarchar("start_time").notNull(),
	endTime: nvarchar("end_time").notNull(),
	breakMinutes: int("break_minutes").default(0).notNull(),
	graceLateMinutes: int("grace_late_minutes"),
	earlyLeaveToleranceMinutes: int("early_leave_tolerance_minutes"),
	overtimeThresholdMinutes: int("overtime_threshold_minutes"),
	workDays: jsonText("work_days").$type<string[]>().default(sql`'["sun","mon","tue","wed","thu"]'`),
	isOvernight: bit("is_overnight").default(false),
	isActive: bit("is_active").default(true),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("shift_templates_branch_active_idx").on(table.branchId, table.isActive),
    foreignKey({
    columns: [table.attendancePolicyId],
    foreignColumns: [attendancePolicies.id],
    name: "shift_templates_attendance_policy_id_fkey",
    }),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "shift_templates_branch_id_fkey",
    }),
]);




// --- RESTORED TABLES ---


export const bonusPenaltyRecords = mssqlTable("bonus_penalty_records", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	employeeId: nvarchar("employee_id").notNull(),
	branchId: nvarchar("branch_id").notNull(),
	type: nvarchar({ length: 'max' }).notNull(),
	category: nvarchar({ length: 'max' }),
	status: nvarchar({ length: 'max' }).default('PENDING').notNull(),
	amount: real().notNull(),
	effectiveDate: date("effective_date", { mode: 'date' }).notNull(),
	payrollCycleId: nvarchar("payroll_cycle_id"),
	reason: nvarchar({ length: 'max' }).notNull(),
	notes: nvarchar({ length: 'max' }),
	requestedBy: nvarchar("requested_by"),
	approvedBy: nvarchar("approved_by"),
	approvedAt: datetime2("approved_at"),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("bonus_penalty_branch_effective_idx").on(table.branchId, table.effectiveDate),
index("bonus_penalty_employee_type_status_idx").on(table.employeeId, table.type, table.status),
    foreignKey({
    columns: [table.approvedBy],
    foreignColumns: [users.id],
    name: "bonus_penalty_records_approved_by_users_id_fk",
    }),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "bonus_penalty_records_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "bonus_penalty_records_employee_id_employees_id_fk",
    }),
    foreignKey({
    columns: [table.payrollCycleId],
    foreignColumns: [payrollCycles.id],
    name: "bonus_penalty_records_payroll_cycle_id_payroll_cycles_id_fk",
    }),
    foreignKey({
    columns: [table.requestedBy],
    foreignColumns: [users.id],
    name: "bonus_penalty_records_requested_by_users_id_fk",
    }),
]);


export const employeeLoans = mssqlTable("employee_loans", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	employeeId: nvarchar("employee_id").notNull(),
	branchId: nvarchar("branch_id").notNull(),
	type: nvarchar({ length: 'max' }).default('ADVANCE').notNull(),
	status: nvarchar({ length: 'max' }).default('PENDING').notNull(),
	principalAmount: real("principal_amount").notNull(),
	installmentAmount: real("installment_amount").default(0).notNull(),
	installmentsCount: int("installments_count").default(1).notNull(),
	outstandingAmount: real("outstanding_amount").notNull(),
	requestedAt: datetime2("requested_at").default(sql`GETDATE()`).notNull(),
	approvedAt: datetime2("approved_at"),
	disbursedAt: datetime2("disbursed_at"),
	effectiveFrom: date("effective_from", { mode: 'date' }),
	notes: nvarchar({ length: 'max' }),
	requestedBy: nvarchar("requested_by"),
	approvedBy: nvarchar("approved_by"),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("employee_loans_branch_status_idx").on(table.branchId, table.status),
index("employee_loans_employee_status_idx").on(table.employeeId, table.status),
    foreignKey({
    columns: [table.approvedBy],
    foreignColumns: [users.id],
    name: "employee_loans_approved_by_users_id_fk",
    }),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "employee_loans_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "employee_loans_employee_id_employees_id_fk",
    }),
    foreignKey({
    columns: [table.requestedBy],
    foreignColumns: [users.id],
    name: "employee_loans_requested_by_users_id_fk",
    }),
]);


export const employeePayrollAssignments = mssqlTable("employee_payroll_assignments", {
	id: int().identity().primaryKey().notNull(),
	employeeId: nvarchar("employee_id").notNull(),
	payrollProfileId: nvarchar("payroll_profile_id").notNull(),
	effectiveFrom: date("effective_from", { mode: 'date' }).notNull(),
	effectiveTo: date("effective_to", { mode: 'date' }),
	isPrimary: bit("is_primary").default(true),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("employee_payroll_assignments_employee_effective_idx").on(table.employeeId, table.effectiveFrom),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "employee_payroll_assignments_employee_id_employees_id_fk",
    }),
    foreignKey({
    columns: [table.payrollProfileId],
    foreignColumns: [payrollProfiles.id],
    name: "employee_payroll_assignments_payroll_profile_id_payroll_profile",
    }),
]);

export const employeeCompensationItems = mssqlTable("employee_compensation_items", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	employeeId: nvarchar("employee_id").notNull(),
	branchId: nvarchar("branch_id").notNull(),
	code: nvarchar({ length: 'max' }),
	name: nvarchar({ length: 'max' }).notNull(),
	nameAr: nvarchar("name_ar"),
	category: nvarchar({ length: 'max' }).default('GENERAL').notNull(),
	type: nvarchar({ length: 'max' }).default('ALLOWANCE').notNull(),
	amount: real().default(0).notNull(),
	currency: nvarchar({ length: 'max' }).default('EGP').notNull(),
	isRecurring: bit("is_recurring").default(true).notNull(),
	isActive: bit("is_active").default(true).notNull(),
	effectiveFrom: date("effective_from", { mode: 'date' }),
	effectiveTo: date("effective_to", { mode: 'date' }),
	notes: nvarchar({ length: 'max' }),
	metadata: jsonText('metadata').default(sql`'{}'`),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("employee_comp_items_branch_active_idx").on(table.branchId, table.isActive),
index("employee_comp_items_employee_effective_idx").on(table.employeeId, table.effectiveFrom, table.effectiveTo),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "employee_compensation_items_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "employee_compensation_items_employee_id_employees_id_fk",
    }),
]);

export const leaveBalances = mssqlTable("leave_balances", {
	id: int().identity().primaryKey().notNull(),
	employeeId: nvarchar("employee_id").notNull(),
	leaveTypeId: nvarchar("leave_type_id").notNull(),
	year: int().notNull(),
	entitledDays: real("entitled_days").default(0).notNull(),
	carriedForwardDays: real("carried_forward_days").default(0).notNull(),
	usedDays: real("used_days").default(0).notNull(),
	pendingDays: real("pending_days").default(0).notNull(),
	adjustmentDays: real("adjustment_days").default(0).notNull(),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
uniqueIndex("leave_balances_employee_leave_year_idx").on(table.employeeId, table.leaveTypeId, table.year),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "leave_balances_employee_id_employees_id_fk",
    }),
]);


export const loanInstallments = mssqlTable("loan_installments", {
	id: int().identity().primaryKey().notNull(),
	loanId: nvarchar("loan_id").notNull(),
	dueDate: date("due_date", { mode: 'date' }).notNull(),
	amount: real().notNull(),
	status: nvarchar({ length: 'max' }).default('PENDING').notNull(),
	payrollCycleId: nvarchar("payroll_cycle_id"),
	paidAt: datetime2("paid_at"),
	notes: nvarchar({ length: 'max' }),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("loan_installments_loan_due_idx").on(table.loanId, table.dueDate),
index("loan_installments_status_idx").on(table.status),
    foreignKey({
    columns: [table.loanId],
    foreignColumns: [employeeLoans.id],
    name: "loan_installments_loan_id_employee_loans_id_fk",
    }),
    foreignKey({
    columns: [table.payrollCycleId],
    foreignColumns: [payrollCycles.id],
    name: "loan_installments_payroll_cycle_id_payroll_cycles_id_fk",
    }),
]);


export const payrollComponents = mssqlTable("payroll_components", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	branchId: nvarchar("branch_id").notNull(),
	code: nvarchar({ length: 'max' }).notNull(),
	name: nvarchar({ length: 'max' }).notNull(),
	nameAr: nvarchar("name_ar"),
	type: nvarchar({ length: 'max' }).notNull(),
	amountType: nvarchar("amount_type").default('FIXED').notNull(),
	calculationBasis: nvarchar("calculation_basis").default('BASE_SALARY').notNull(),
	defaultValue: real("default_value").default(0).notNull(),
	taxable: bit().default(false),
	pensionable: bit().default(false),
	affectsNetPay: bit("affects_net_pay").default(true),
	sortOrder: int("sort_order").default(0).notNull(),
	isActive: bit("is_active").default(true),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
uniqueIndex("payroll_components_branch_code_idx").on(table.branchId, table.code),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "payroll_components_branch_id_branches_id_fk",
    }),
]);


export const payrollProfiles = mssqlTable("payroll_profiles", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	branchId: nvarchar("branch_id").notNull(),
	name: nvarchar({ length: 'max' }).notNull(),
	code: nvarchar({ length: 'max' }),
	payFrequency: nvarchar("pay_frequency").default('MONTHLY').notNull(),
	salaryMode: nvarchar("salary_mode").default('MONTHLY').notNull(),
	currency: nvarchar({ length: 'max' }).default('EGP').notNull(),
	defaultAttendancePolicyId: nvarchar("default_attendance_policy_id"),
	defaultOvertimeRate: real("default_overtime_rate").default(1.5).notNull(),
	lateDeductionMode: nvarchar("late_deduction_mode").default('NONE').notNull(),
	absenceDeductionMode: nvarchar("absence_deduction_mode").default('DAILY_RATE').notNull(),
	autoPostToGl: bit("auto_post_to_gl").default(true),
	isDefault: bit("is_default").default(false),
	isActive: bit("is_active").default(true),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("payroll_profiles_branch_default_idx").on(table.branchId, table.isDefault, table.isActive),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "payroll_profiles_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.defaultAttendancePolicyId],
    foreignColumns: [attendancePolicies.id],
    name: "payroll_profiles_default_attendance_policy_id_attendance_polici",
    }),
]);


export const payrollRules = mssqlTable("payroll_rules", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	payrollProfileId: nvarchar("payroll_profile_id").notNull(),
	branchId: nvarchar("branch_id").notNull(),
	code: nvarchar({ length: 'max' }).notNull(),
	name: nvarchar({ length: 'max' }).notNull(),
	triggerType: nvarchar("trigger_type").notNull(),
	operation: nvarchar({ length: 'max' }).notNull(),
	componentId: nvarchar("component_id"),
	thresholdValue: real("threshold_value").default(0).notNull(),
	rateValue: real("rate_value").default(0).notNull(),
	capValue: real("cap_value").default(0),
	formula: nvarchar({ length: 'max' }),
	priority: int().default(0).notNull(),
	isActive: bit("is_active").default(true),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("payroll_rules_profile_priority_idx").on(table.payrollProfileId, table.priority, table.isActive),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "payroll_rules_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.componentId],
    foreignColumns: [payrollComponents.id],
    name: "payroll_rules_component_id_payroll_components_id_fk",
    }),
    foreignKey({
    columns: [table.payrollProfileId],
    foreignColumns: [payrollProfiles.id],
    name: "payroll_rules_payroll_profile_id_payroll_profiles_id_fk",
    }),
]);





// --- DUMMY RESTORED TABLES ---
export const domainEvents = mssqlTable('domain_events', {
	id: nvarchar('id').primaryKey(),
	type: nvarchar('type'),
	entityType: nvarchar('entity_type'),
	entityId: nvarchar('entity_id'),
	branchId: nvarchar('branch_id'),
	status: nvarchar('status').default('PENDING'),
	payload: jsonText('payload'),
	processedAt: datetime2('processed_at'),
	createdAt: datetime2('created_at').default(sql`GETDATE()`),
});
// --- RESTORED attendanceSessions ---
export const attendanceSessions = mssqlTable("attendance_sessions", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	employeeId: nvarchar("employee_id").notNull(),
	branchId: nvarchar("branch_id").notNull(),
	sourceType: nvarchar("source_type").notNull(),
	status: nvarchar({ length: 'max' }).default('OPEN').notNull(),
	checkInRawLogId: nvarchar("check_in_raw_log_id"),
	checkOutRawLogId: nvarchar("check_out_raw_log_id"),
	clockInAt: datetime2("clock_in_at").notNull(),
	clockOutAt: datetime2("clock_out_at"),
	totalHours: real("total_hours").default(0).notNull(),
	lateMinutes: int("late_minutes").default(0).notNull(),
	earlyLeaveMinutes: int("early_leave_minutes").default(0).notNull(),
	overtimeMinutes: int("overtime_minutes").default(0).notNull(),
	riskFlags: jsonText("risk_flags").$type<string[]>().default(sql`'[]'`),
	notes: nvarchar({ length: 'max' }),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("attendance_sessions_branch_status_idx").on(table.branchId, table.status),
index("attendance_sessions_employee_clock_in_idx").on(table.employeeId, table.clockInAt),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_sessions_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_sessions_branch_id_fkey",
    }),
    foreignKey({
    columns: [table.checkInRawLogId],
    foreignColumns: [attendanceRawLogs.id],
    name: "attendance_sessions_check_in_raw_log_id_attendance_raw_logs_id_",
    }),
    foreignKey({
    columns: [table.checkInRawLogId],
    foreignColumns: [attendanceRawLogs.id],
    name: "attendance_sessions_check_in_raw_log_id_fkey",
    }),
    foreignKey({
    columns: [table.checkOutRawLogId],
    foreignColumns: [attendanceRawLogs.id],
    name: "attendance_sessions_check_out_raw_log_id_attendance_raw_logs_id",
    }),
    foreignKey({
    columns: [table.checkOutRawLogId],
    foreignColumns: [attendanceRawLogs.id],
    name: "attendance_sessions_check_out_raw_log_id_fkey",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "attendance_sessions_employee_id_employees_id_fk",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "attendance_sessions_employee_id_fkey",
    }),
]);


// --- RESTORED AUTO ---
export const payrollRunLines = mssqlTable("payroll_run_lines", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	runId: nvarchar("run_id").notNull(),
	employeeId: nvarchar("employee_id").notNull(),
	baseSalary: real("base_salary").default(0).notNull(),
	overtime: real().default(0).notNull(),
	bonuses: real().default(0).notNull(),
	penalties: real().default(0).notNull(),
	loanDeductions: real("loan_deductions").default(0).notNull(),
	otherDeductions: real("other_deductions").default(0).notNull(),
	grossPay: real("gross_pay").default(0).notNull(),
	netPay: real("net_pay").default(0).notNull(),
	components: jsonText('components').default(sql`'{}'`),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
}, (table) => [
index("payroll_run_lines_run_employee_idx").on(table.runId, table.employeeId),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "payroll_run_lines_employee_id_employees_id_fk",
    }),
    foreignKey({
    columns: [table.runId],
    foreignColumns: [payrollRuns.id],
    name: "payroll_run_lines_run_id_payroll_runs_id_fk",
    }),
]);


// --- RESTORED AUTO ---
export const payrollRuns = mssqlTable("payroll_runs", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	cycleId: nvarchar("cycle_id").notNull(),
	branchId: nvarchar("branch_id").notNull(),
	status: nvarchar({ length: 'max' }).default('DRAFT').notNull(),
	totalEmployees: int("total_employees").default(0).notNull(),
	grossTotal: real("gross_total").default(0).notNull(),
	deductionsTotal: real("deductions_total").default(0).notNull(),
	netTotal: real("net_total").default(0).notNull(),
	createdBy: nvarchar("created_by"),
	closedBy: nvarchar("closed_by"),
	closedAt: datetime2("closed_at"),
	notes: nvarchar({ length: 'max' }),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("payroll_runs_cycle_idx").on(table.cycleId, table.status),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "payroll_runs_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.closedBy],
    foreignColumns: [users.id],
    name: "payroll_runs_closed_by_users_id_fk",
    }),
    foreignKey({
    columns: [table.createdBy],
    foreignColumns: [users.id],
    name: "payroll_runs_created_by_users_id_fk",
    }),
    foreignKey({
    columns: [table.cycleId],
    foreignColumns: [payrollCycles.id],
    name: "payroll_runs_cycle_id_payroll_cycles_id_fk",
    }),
]);


// --- RESTORED AUTO ---
export const payrollLocks = mssqlTable("payroll_locks", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	branchId: nvarchar("branch_id").notNull(),
	lockedThrough: datetime2("locked_through").notNull(),
	lockedBy: nvarchar("locked_by"),
	reason: nvarchar({ length: 'max' }),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("payroll_locks_branch_idx").on(table.branchId),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "payroll_locks_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.lockedBy],
    foreignColumns: [users.id],
    name: "payroll_locks_locked_by_users_id_fk",
    }),
]);


// --- RESTORED AUTO ---
export const payslips = mssqlTable("payslips", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	runId: nvarchar("run_id").notNull(),
	cycleId: nvarchar("cycle_id").notNull(),
	employeeId: nvarchar("employee_id").notNull(),
	issuedAt: datetime2("issued_at").default(sql`GETDATE()`).notNull(),
	payload: jsonText('payload').default(sql`'{}'`),
	version: int().default(1).notNull(),
	pdfUrl: nvarchar("pdf_url"),
	pdfHash: nvarchar("pdf_hash"),
	generatedAt: datetime2("generated_at"),
	generatedBy: nvarchar("generated_by"),
}, (table) => [
index("payslips_cycle_employee_idx").on(table.cycleId, table.employeeId),
index("payslips_version_idx").on(table.employeeId, table.cycleId, table.version),
    foreignKey({
    columns: [table.cycleId],
    foreignColumns: [payrollCycles.id],
    name: "payslips_cycle_id_payroll_cycles_id_fk",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "payslips_employee_id_employees_id_fk",
    }),
    foreignKey({
    columns: [table.generatedBy],
    foreignColumns: [users.id],
    name: "payslips_generated_by_users_id_fk",
    }),
    foreignKey({
    columns: [table.runId],
    foreignColumns: [payrollRuns.id],
    name: "payslips_run_id_payroll_runs_id_fk",
    }),
]);


// --- RESTORED AUTO ---
export const shiftPlanEntries = mssqlTable("shift_plan_entries", {
	id: int().identity().primaryKey().notNull(),
	planId: nvarchar("plan_id").notNull(),
	branchId: nvarchar("branch_id").notNull(),
	employeeId: nvarchar("employee_id").notNull(),
	shiftTemplateId: nvarchar("shift_template_id"),
	date: date("date").notNull(),
	startTime: nvarchar("start_time"),
	endTime: nvarchar("end_time"),
	status: nvarchar({ length: 'max' }).default('PLANNED').notNull(),
	notes: nvarchar({ length: 'max' }),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("shift_plan_entries_employee_date_idx").on(table.employeeId, table.date),
index("shift_plan_entries_plan_idx").on(table.planId),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "shift_plan_entries_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "shift_plan_entries_employee_id_employees_id_fk",
    }),
    foreignKey({
    columns: [table.planId],
    foreignColumns: [shiftPlans.id],
    name: "shift_plan_entries_plan_id_shift_plans_id_fk",
    }),
    foreignKey({
    columns: [table.shiftTemplateId],
    foreignColumns: [shiftTemplates.id],
    name: "shift_plan_entries_shift_template_id_shift_templates_id_fk",
    }),
]);


// --- RESTORED AUTO ---
export const shiftPlans = mssqlTable("shift_plans", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	branchId: nvarchar("branch_id").notNull(),
	name: nvarchar({ length: 'max' }).notNull(),
	weekStart: date("week_start").notNull(),
	weekEnd: date("week_end").notNull(),
	status: nvarchar({ length: 'max' }).default('DRAFT').notNull(),
	createdBy: nvarchar("created_by"),
	approvedBy: nvarchar("approved_by"),
	frozenAt: datetime2("frozen_at"),
	postedAt: datetime2("posted_at"),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("shift_plans_branch_week_idx").on(table.branchId, table.weekStart),
    foreignKey({
    columns: [table.approvedBy],
    foreignColumns: [users.id],
    name: "shift_plans_approved_by_users_id_fk",
    }),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "shift_plans_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.createdBy],
    foreignColumns: [users.id],
    name: "shift_plans_created_by_users_id_fk",
    }),
]);


// --- RESTORED AUTO ---
export const shiftTaskRuns = mssqlTable("shift_task_runs", {
	id: int().identity().primaryKey().notNull(),
	shiftId: nvarchar("shift_id").notNull(),
	taskId: nvarchar("task_id").notNull(),
	status: nvarchar({ length: 'max' }).default('PENDING').notNull(),
	completedBy: nvarchar("completed_by"),
	completedAt: datetime2("completed_at"),
	notes: nvarchar({ length: 'max' }),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("shift_task_runs_shift_idx").on(table.shiftId),
index("shift_task_runs_task_idx").on(table.taskId),
    foreignKey({
    columns: [table.completedBy],
    foreignColumns: [users.id],
    name: "shift_task_runs_completed_by_users_id_fk",
    }),
    foreignKey({
    columns: [table.shiftId],
    foreignColumns: [shifts.id],
    name: "shift_task_runs_shift_id_shifts_id_fk",
    }),
    foreignKey({
    columns: [table.taskId],
    foreignColumns: [shiftTasks.id],
    name: "shift_task_runs_task_id_shift_tasks_id_fk",
    }),
]);


// --- RESTORED AUTO ---
export const shiftTasks = mssqlTable("shift_tasks", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	branchId: nvarchar("branch_id").notNull(),
	name: nvarchar({ length: 'max' }).notNull(),
	type: nvarchar({ length: 'max' }).default('DAILY').notNull(),
	description: nvarchar({ length: 'max' }),
	requiresVerification: bit("requires_verification").default(false),
	sortOrder: int("sort_order").default(0),
	isActive: bit("is_active").default(true),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "shift_tasks_branch_id_branches_id_fk",
    }),
]);


// --- RESTORED AUTO ---
export const attendanceCorrections = mssqlTable("attendance_corrections", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	sessionId: nvarchar("session_id").notNull(),
	employeeId: nvarchar("employee_id").notNull(),
	requestedBy: nvarchar("requested_by").notNull(),
	approvedBy: nvarchar("approved_by"),
	status: nvarchar({ length: 'max' }).default('PENDING').notNull(),
	requestedClockInAt: datetime2("requested_clock_in_at"),
	requestedClockOutAt: datetime2("requested_clock_out_at"),
	reason: nvarchar({ length: 'max' }).notNull(),
	approverNotes: nvarchar("approver_notes"),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
    foreignKey({
    columns: [table.approvedBy],
    foreignColumns: [users.id],
    name: "attendance_corrections_approved_by_fkey",
    }),
    foreignKey({
    columns: [table.approvedBy],
    foreignColumns: [users.id],
    name: "attendance_corrections_approved_by_users_id_fk",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "attendance_corrections_employee_id_employees_id_fk",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "attendance_corrections_employee_id_fkey",
    }),
    foreignKey({
    columns: [table.requestedBy],
    foreignColumns: [users.id],
    name: "attendance_corrections_requested_by_fkey",
    }),
    foreignKey({
    columns: [table.requestedBy],
    foreignColumns: [users.id],
    name: "attendance_corrections_requested_by_users_id_fk",
    }),
    foreignKey({
    columns: [table.sessionId],
    foreignColumns: [attendanceSessions.id],
    name: "attendance_corrections_session_id_attendance_sessions_id_fk",
    }),
    foreignKey({
    columns: [table.sessionId],
    foreignColumns: [attendanceSessions.id],
    name: "attendance_corrections_session_id_fkey",
    }),
]);


// --- RESTORED AUTO ---
export const attendanceDeviceMappings = mssqlTable("attendance_device_mappings", {
	id: int().identity().primaryKey().notNull(),
	deviceId: nvarchar("device_id").notNull(),
	employeeId: nvarchar("employee_id").notNull(),
	deviceUserId: nvarchar("device_user_id").notNull(),
	employeeCodeSnapshot: nvarchar("employee_code_snapshot"),
	isActive: bit("is_active").default(true),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
uniqueIndex("attendance_device_mappings_device_user_idx").on(table.deviceId, table.deviceUserId),
index("attendance_device_mappings_employee_idx").on(table.employeeId),
    foreignKey({
    columns: [table.deviceId],
    foreignColumns: [attendanceDevices.id],
    name: "attendance_device_mappings_device_id_attendance_devices_id_fk",
    }),
    foreignKey({
    columns: [table.deviceId],
    foreignColumns: [attendanceDevices.id],
    name: "attendance_device_mappings_device_id_fkey",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "attendance_device_mappings_employee_id_employees_id_fk",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "attendance_device_mappings_employee_id_fkey",
    }),
]);


// --- RESTORED AUTO ---
export const attendanceDevices = mssqlTable("attendance_devices", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	branchId: nvarchar("branch_id").notNull(),
	name: nvarchar({ length: 'max' }).notNull(),
	code: nvarchar({ length: 'max' }),
	vendor: nvarchar({ length: 'max' }).default('ZKTeco').notNull(),
	model: nvarchar({ length: 'max' }),
	sourceType: nvarchar("source_type").default('BIOMETRIC_ZK').notNull(),
	ipAddress: nvarchar("ip_address"),
	port: int(),
	serialNumber: nvarchar("serial_number"),
	communicationMode: nvarchar("communication_mode").default('LAN'),
	branchGatewayId: nvarchar("branch_gateway_id"),
	isActive: bit("is_active").default(true),
	lastSeenAt: datetime2("last_seen_at"),
	lastSyncAt: datetime2("last_sync_at"),
	notes: nvarchar({ length: 'max' }),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("attendance_devices_branch_source_idx").on(table.branchId, table.sourceType),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_devices_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_devices_branch_id_fkey",
    }),
]);


// --- RESTORED AUTO ---
export const attendanceExceptions = mssqlTable("attendance_exceptions", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	employeeId: nvarchar("employee_id"),
	branchId: nvarchar("branch_id").notNull(),
	rawLogId: nvarchar("raw_log_id"),
	sessionId: nvarchar("session_id"),
	type: nvarchar({ length: 'max' }).notNull(),
	severity: nvarchar({ length: 'max' }).default('MEDIUM').notNull(),
	status: nvarchar({ length: 'max' }).default('OPEN').notNull(),
	title: nvarchar({ length: 'max' }).notNull(),
	details: jsonText('details'),
	metadata: jsonText('metadata').default(sql`'{}'`),
	assignedTo: nvarchar("assigned_to"),
	slaDueAt: datetime2("sla_due_at"),
	escalationLevel: int("escalation_level").default(0).notNull(),
	lastEscalatedAt: datetime2("last_escalated_at"),
	resolvedBy: nvarchar("resolved_by"),
	resolvedAt: datetime2("resolved_at"),
	resolutionNotes: nvarchar("resolution_notes"),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("attendance_exceptions_assigned_idx").on(table.assignedTo),
index("attendance_exceptions_branch_status_idx").on(table.branchId, table.status, table.severity),
index("attendance_exceptions_employee_idx").on(table.employeeId),
index("attendance_exceptions_sla_idx").on(table.slaDueAt),
    foreignKey({
    columns: [table.assignedTo],
    foreignColumns: [users.id],
    name: "attendance_exceptions_assigned_to_fkey",
    }),
    foreignKey({
    columns: [table.assignedTo],
    foreignColumns: [users.id],
    name: "attendance_exceptions_assigned_to_users_id_fk",
    }),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_exceptions_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_exceptions_branch_id_fkey",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "attendance_exceptions_employee_id_employees_id_fk",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "attendance_exceptions_employee_id_fkey",
    }),
    foreignKey({
    columns: [table.rawLogId],
    foreignColumns: [attendanceRawLogs.id],
    name: "attendance_exceptions_raw_log_id_attendance_raw_logs_id_fk",
    }),
    foreignKey({
    columns: [table.rawLogId],
    foreignColumns: [attendanceRawLogs.id],
    name: "attendance_exceptions_raw_log_id_fkey",
    }),
    foreignKey({
    columns: [table.resolvedBy],
    foreignColumns: [users.id],
    name: "attendance_exceptions_resolved_by_fkey",
    }),
    foreignKey({
    columns: [table.resolvedBy],
    foreignColumns: [users.id],
    name: "attendance_exceptions_resolved_by_users_id_fk",
    }),
    foreignKey({
    columns: [table.sessionId],
    foreignColumns: [attendanceSessions.id],
    name: "attendance_exceptions_session_id_attendance_sessions_id_fk",
    }),
    foreignKey({
    columns: [table.sessionId],
    foreignColumns: [attendanceSessions.id],
    name: "attendance_exceptions_session_id_fkey",
    }),
]);


// --- RESTORED AUTO ---
export const attendanceGeofences = mssqlTable("attendance_geofences", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	branchId: nvarchar("branch_id").notNull(),
	name: nvarchar({ length: 'max' }).notNull(),
	latitude: real().notNull(),
	longitude: real().notNull(),
	radiusMeters: real("radius_meters").default(150).notNull(),
	isActive: bit("is_active").default(true),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("attendance_geofences_branch_idx").on(table.branchId, table.isActive),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_geofences_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_geofences_branch_id_fkey",
    }),
]);


// --- RESTORED AUTO ---
export const attendanceRawLogs = mssqlTable("attendance_raw_logs", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	syncRunId: nvarchar("sync_run_id"),
	deviceId: nvarchar("device_id"),
	employeeId: nvarchar("employee_id"),
	branchId: nvarchar("branch_id").notNull(),
	sourceType: nvarchar("source_type").default('BIOMETRIC_ZK').notNull(),
	eventType: nvarchar("event_type").default('UNKNOWN').notNull(),
	employeeIdentifier: nvarchar("employee_identifier"),
	deviceUserId: nvarchar("device_user_id"),
	occurredAt: datetime2("occurred_at").notNull(),
	deviceOccurredAt: datetime2("device_occurred_at"),
	geoLat: real("geo_lat"),
	geoLng: real("geo_lng"),
	geoAccuracyMeters: real("geo_accuracy_meters"),
	confidenceScore: real("confidence_score"),
	imageUrl: nvarchar("image_url"),
	dedupeHash: nvarchar("dedupe_hash"),
	processingStatus: nvarchar("processing_status").default('PENDING'),
	processingNotes: nvarchar("processing_notes"),
	rawPayload: jsonText("raw_payload").default(sql`'{}'`),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
index("attendance_raw_logs_branch_occurred_idx").on(table.branchId, table.occurredAt),
uniqueIndex("attendance_raw_logs_dedupe_idx").on(table.dedupeHash),
index("attendance_raw_logs_employee_occurred_idx").on(table.employeeId, table.occurredAt),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_raw_logs_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_raw_logs_branch_id_fkey",
    }),
    foreignKey({
    columns: [table.deviceId],
    foreignColumns: [attendanceDevices.id],
    name: "attendance_raw_logs_device_id_attendance_devices_id_fk",
    }),
    foreignKey({
    columns: [table.deviceId],
    foreignColumns: [attendanceDevices.id],
    name: "attendance_raw_logs_device_id_fkey",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "attendance_raw_logs_employee_id_employees_id_fk",
    }),
    foreignKey({
    columns: [table.employeeId],
    foreignColumns: [employees.id],
    name: "attendance_raw_logs_employee_id_fkey",
    }),
    foreignKey({
    columns: [table.syncRunId],
    foreignColumns: [attendanceSyncRuns.id],
    name: "attendance_raw_logs_sync_run_id_attendance_sync_runs_id_fk",
    }),
    unique("attendance_raw_logs_dedupe_hash_key").on(table.dedupeHash),
]);


// --- RESTORED AUTO ---
export const attendanceSyncRuns = mssqlTable("attendance_sync_runs", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	branchId: nvarchar("branch_id"),
	deviceId: nvarchar("device_id"),
	sourceType: nvarchar("source_type").notNull(),
	status: nvarchar({ length: 'max' }).default('IN_PROGRESS'),
	logsReceived: int("logs_received").default(0),
	logsAccepted: int("logs_accepted").default(0),
	logsRejected: int("logs_rejected").default(0),
	errorMessage: nvarchar("error_message"),
	metadata: jsonText('metadata').default(sql`'{}'`),
	startedAt: datetime2("started_at").default(sql`GETDATE()`),
	completedAt: datetime2("completed_at"),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
}, (table) => [
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_sync_runs_branch_id_branches_id_fk",
    }),
    foreignKey({
    columns: [table.branchId],
    foreignColumns: [branches.id],
    name: "attendance_sync_runs_branch_id_fkey",
    }),
    foreignKey({
    columns: [table.deviceId],
    foreignColumns: [attendanceDevices.id],
    name: "attendance_sync_runs_device_id_attendance_devices_id_fk",
    }),
    foreignKey({
    columns: [table.deviceId],
    foreignColumns: [attendanceDevices.id],
    name: "attendance_sync_runs_device_id_fkey",
    }),
]);


// --- RESTORED AUTO ---
export const onboardingRecords = mssqlTable("onboarding_records", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	tenantBranchId: nvarchar("tenant_branch_id").notNull(),
	setupBranchCompleted: bit("setup_branch_completed").default(false),
	setupMenuCompleted: bit("setup_menu_completed").default(false),
	setupStaffCompleted: bit("setup_staff_completed").default(false),
	setupPrintersCompleted: bit("setup_printers_completed").default(false),
	setupHardwareCompleted: bit("setup_hardware_completed").default(false),
	isFullyOnboarded: bit("is_fully_onboarded").default(false),
	completedAt: datetime2("completed_at"),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
uniqueIndex("onboarding_records_tenant_idx").on(table.tenantBranchId),
    foreignKey({
    columns: [table.tenantBranchId],
    foreignColumns: [branches.id],
    name: "onboarding_records_tenant_branch_id_branches_id_fk",
    }),
]);


// --- RESTORED AUTO ---
export const subscriptionPlans = mssqlTable("subscription_plans", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	name: nvarchar({ length: 'max' }).notNull(),
	nameAr: nvarchar("name_ar"),
	description: nvarchar({ length: 'max' }),
	price: numeric({ precision: 10, scale:  2 }).default('0.00').notNull(),
	currency: nvarchar({ length: 'max' }).default('EGP'),
	billingCycle: nvarchar("billing_cycle").default('MONTHLY'),
	features: nvarchar({ length: 'max' }).default(sql`'[]'`),
	maxBranches: int("max_branches").default(1),
	maxUsers: int("max_users").default(10),
	isActive: bit("is_active").default(true),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
    unique("subscription_plans_name_unique").on(table.name),
]);


// --- RESTORED AUTO ---
export const subscriptions = mssqlTable("subscriptions", {
	id: nvarchar({ length: 'max' }).primaryKey().notNull(),
	tenantBranchId: nvarchar("tenant_branch_id").notNull(),
	planId: nvarchar("plan_id").notNull(),
	status: nvarchar({ length: 'max' }).default('TRIALING'),
	trialEndsAt: datetime2("trial_ends_at"),
	currentPeriodStart: datetime2("current_period_start"),
	currentPeriodEnd: datetime2("current_period_end"),
	cancelAtPeriodEnd: bit("cancel_at_period_end").default(false),
	paymentMethodId: nvarchar("payment_method_id"),
	createdAt: datetime2("created_at").default(sql`GETDATE()`),
	updatedAt: datetime2("updated_at").default(sql`GETDATE()`),
}, (table) => [
uniqueIndex("subscriptions_tenant_branch_idx").on(table.tenantBranchId),
    foreignKey({
    columns: [table.planId],
    foreignColumns: [subscriptionPlans.id],
    name: "subscriptions_plan_id_subscription_plans_id_fk",
    }),
    foreignKey({
    columns: [table.tenantBranchId],
    foreignColumns: [branches.id],
    name: "subscriptions_tenant_branch_id_branches_id_fk",
    }),
]);

