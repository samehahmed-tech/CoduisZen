// Database Schema for Coduis Zen
// Using Drizzle ORM with PostgreSQL

import { pgTable, text, serial, integer, boolean, timestamp, real, json, jsonb, uniqueIndex, index, unique, foreignKey, numeric, varchar, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// 👤 USERS & AUTHENTICATION
// ============================================================================

export const users = pgTable('users', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').unique().notNull(),
    passwordHash: text('password_hash'),
    pinCode: text('pin_code'), // 6 digit PIN for quick login
    pinCodeHash: text('pin_code_hash'), // Hashed PIN for security
    role: text('role').notNull(), // OWNER, ADMIN, MANAGER, ACCOUNTANT, CASHIER, IT, WAITER, etc.
    roleId: text('role_id'), // Reference to roles table for custom roles
    permissions: json('permissions').$type<string[]>().default([]), // Custom user-specific permissions
    customPermissions: json('custom_permissions').$type<Record<string, boolean>>().default({}), // Granular permission overrides
    assignedBranchId: text('assigned_branch_id'),
    allowedBranches: json('allowed_branches').$type<string[]>().default([]), // Multiple branch access
    isActive: boolean('is_active').default(true),
    managerPin: text('manager_pin'), // 4-digit PIN for manager overrides
    mfaEnabled: boolean('mfa_enabled').default(false),
    mfaSecret: text('mfa_secret'),
    pinLoginEnabled: boolean('pin_login_enabled').default(false), // Enable PIN-based login
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    emailIdx: index('users_email_idx').on(table.email),
    roleIdx: index('users_role_idx').on(table.role),
}));

export const userSessions = pgTable('user_sessions', {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id).notNull(),
    tokenId: text('token_id').notNull().unique(),
    deviceName: text('device_name'),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    isActive: boolean('is_active').default(true),
    revokedAt: timestamp('revoked_at'),
    expiresAt: timestamp('expires_at').notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userActiveIdx: index('user_sessions_user_active_idx').on(table.userId, table.isActive),
    lastSeenIdx: index('user_sessions_last_seen_idx').on(table.lastSeenAt),
    expiresIdx: index('user_sessions_expires_idx').on(table.expiresAt),
}));

// ============================================================================
// 🔐 ROLES & PERMISSIONS
// ============================================================================

// Predefined and custom roles
export const roles = pgTable('roles', {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(), // OWNER, ADMIN, MANAGER, ACCOUNTANT, CASHIER, IT, WAITER
    nameAr: text('name_ar'), // Arabic name
    description: text('description'),
    descriptionAr: text('description_ar'),
    permissions: json('permissions').$type<string[]>().default([]), // List of permission keys
    isSystem: boolean('is_system').default(false), // System roles cannot be deleted
    isActive: boolean('is_active').default(true),
    priority: integer('priority').default(0), // Higher = more privileged (for conflict resolution)
    color: text('color').default('#6366f1'), // UI color for displaying role
    icon: text('icon').default('user'), // Lucide icon name
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Permission definitions for the entire system
export const permissionDefinitions = pgTable('permission_definitions', {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(), // e.g., 'orders.create', 'menu.edit', 'reports.view'
    name: text('name').notNull(), // Human-readable name
    nameAr: text('name_ar'), // Arabic name
    description: text('description'),
    descriptionAr: text('description_ar'),
    category: text('category').notNull(), // orders, menu, reports, settings, users, etc.
    categoryAr: text('category_ar'),
    subCategory: text('sub_category'), // For nested grouping
    isActive: boolean('is_active').default(true),
    sortOrder: integer('sort_order').default(0),
    dependsOn: json('depends_on').$type<string[]>().default([]), // Required permissions
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 🏪 BRANCHES
// ============================================================================

export const branches = pgTable('branches', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    location: text('location'),
    address: text('address'),
    serverIp: text('server_ip'),
    dayCloseEmails: json('day_close_emails').$type<string[]>().default([]),
    phone: text('phone'),
    email: text('email'),
    isActive: boolean('is_active').default(true),
    timezone: text('timezone').default('Africa/Cairo'),
    currency: text('currency').default('EGP'),
    taxRate: real('tax_rate').default(14),
    serviceCharge: real('service_charge').default(0),
    businessDate: text('business_date'), // Logical accounting day string (YYYY-MM-DD)
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// 👥 CUSTOMERS (CRM)
// ============================================================================

export const customers = pgTable('customers', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    phone: varchar('phone', { length: 20 }).unique().notNull(),
    email: text('email'),
    // Address Details
    address: text('address'),
    lat: real('lat'),
    lng: real('lng'),
    addressLabel: text('address_label'),
    zoneId: integer('zone_id').references(() => deliveryZones.id),
    area: text('area'),
    building: text('building'),
    floor: text('floor'),
    apartment: text('apartment'),
    landmark: text('landmark'),
    // Customer Notes
    notes: text('notes'),
    // Loyalty & Stats
    visits: integer('visits').default(0),
    totalSpent: real('total_spent').default(0),
    loyaltyTier: text('loyalty_tier').default('Bronze'), // Bronze, Silver, Gold, Platinum
    loyaltyPoints: integer('loyalty_points').default(0),
    // Metadata
    source: text('source').default('call_center'), // call_center, pos, online, app
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    nameIdx: index('customers_name_idx').on(table.name),
}));

// Customer Addresses (Multiple per customer)
export const customerAddresses = pgTable('customer_addresses', {
    id: serial('id').primaryKey(),
    customerId: text('customer_id').references(() => customers.id).notNull(),
    label: text('label').notNull(), // Home, Work, etc.
    address: text('address').notNull(),
    lat: real('lat'),
    lng: real('lng'),
    zoneId: integer('zone_id').references(() => deliveryZones.id),
    area: text('area'),
    building: text('building'),
    floor: text('floor'),
    apartment: text('apartment'),
    landmark: text('landmark'),
    isDefault: boolean('is_default').default(false),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 🍽️ MENU MANAGEMENT
// ============================================================================

export const menuCategories = pgTable('menu_categories', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    description: text('description'),
    icon: text('icon'),
    image: text('image'),
    color: text('color'),
    sortOrder: integer('sort_order').default(0),
    isActive: boolean('is_active').default(true),
    targetOrderTypes: json('target_order_types').$type<string[]>().default([]),
    menuIds: json('menu_ids').$type<string[]>().default(['menu-1']),
    printerIds: json('printer_ids').$type<string[]>().default([]),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const menuItems = pgTable('menu_items', {
    id: text('id').primaryKey(),
    categoryId: text('category_id').references(() => menuCategories.id),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    description: text('description'),
    descriptionAr: text('description_ar'),
    price: real('price').notNull(),
    cost: real('cost').default(0), // Cost price for profit calculation
    image: text('image'),
    // Lifecycle Status
    status: text('status').default('published'), // draft, pending_approval, approved, published
    approvedBy: text('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at'),
    publishedAt: timestamp('published_at'),
    // Price Change Audit
    previousPrice: real('previous_price'),
    pendingPrice: real('pending_price'), // Proposed price awaiting approval
    priceChangeReason: text('price_change_reason'),
    priceApprovedBy: text('price_approved_by').references(() => users.id),
    priceApprovedAt: timestamp('price_approved_at'),
    // Availability
    isAvailable: boolean('is_available').default(true),
    availableFrom: text('available_from'), // Time: "09:00"
    availableTo: text('available_to'), // Time: "22:00"
    availableDays: jsonb('available_days').$type<string[]>(), // ["mon", "tue", ...]
    modifierGroups: jsonb('modifier_groups').$type<any[]>(), // Inline modifiers (UI-friendly)
    sizes: jsonb('sizes').$type<any[]>().default([]), // Inline item sizes (S/M/L/Family)
    // Multi-Branch Enterprise Extensions
    branchPricing: jsonb('branch_pricing').$type<{ branchId: string; price: number; isLocked?: boolean }[]>(),
    platformPricing: jsonb('platform_pricing').$type<{ platformId: string; price: number; commission?: number }[]>(),
    // Kitchen
    preparationTime: integer('preparation_time').default(15), // minutes
    printerIds: jsonb('printer_ids').$type<string[]>(), // Which printers to send
    // Display
    isPopular: boolean('is_popular').default(false),
    isFeatured: boolean('is_featured').default(false),
    sortOrder: integer('sort_order').default(0),
    layoutType: text('layout_type').default('standard'), // standard, wide, image-only
    // Barcode & SKU
    barcode: text('barcode'),
    sku: text('sku'),
    // Metadata
    isTaxExempt: boolean('is_tax_exempt').default(false),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    categoryIdx: index('menu_items_category_idx').on(table.categoryId, table.isAvailable),
    barcodeIdx: index('idx_menu_items_barcode').on(table.barcode).where(sql`barcode IS NOT NULL`),
    skuIdx: index('idx_menu_items_sku').on(table.sku).where(sql`sku IS NOT NULL`),
}));

// Modifier Groups (Size, Extras, etc.)
export const modifierGroups = pgTable('modifier_groups', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    minSelection: integer('min_selection').default(0),
    maxSelection: integer('max_selection').default(1),
    isRequired: boolean('is_required').default(false),
    createdAt: timestamp('created_at').defaultNow(),
});

export const modifierOptions = pgTable('modifier_options', {
    id: text('id').primaryKey(),
    groupId: text('group_id').references(() => modifierGroups.id).notNull(),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    price: real('price').default(0),
    sortOrder: integer('sort_order').default(0),
    isAvailable: boolean('is_available').default(true),
});

// Link items to modifier groups
export const menuItemModifiers = pgTable('menu_item_modifiers', {
    id: serial('id').primaryKey(),
    menuItemId: text('menu_item_id').references(() => menuItems.id).notNull(),
    modifierGroupId: text('modifier_group_id').references(() => modifierGroups.id).notNull(),
    sortOrder: integer('sort_order').default(0),
});

// ============================================================================
// 📋 ORDERS
// ============================================================================

export const orders = pgTable('orders', {
    id: text('id').primaryKey(),
    traceId: text('trace_id'), // Trace ID for cross-module tracking
    parentOrderId: text('parent_order_id'), // Self-referencing link for split checks (null for original)
    orderNumber: serial('order_number'), // Sequential daily number
    type: text('type').notNull(), // DINE_IN, TAKEAWAY, DELIVERY
    source: text('source').default('pos'), // pos, call_center, online, app
    // Branch & Location
    branchId: text('branch_id').references(() => branches.id).notNull(),
    tableId: text('table_id'),
    // Customer
    customerId: text('customer_id').references(() => customers.id),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    deliveryAddress: text('delivery_address'),
    deliveryAddressId: integer('delivery_address_id'),
    deliveryLat: real('delivery_lat'),
    deliveryLng: real('delivery_lng'),
    deliveryAddressLabel: text('delivery_address_label'),
    // Call Center specific
    isCallCenterOrder: boolean('is_call_center_order').default(false),
    callCenterAgentId: text('call_center_agent_id'),
    // Status
    status: text('status').notNull().default('PENDING'), // PENDING, PREPARING, READY, OUT_FOR_DELIVERY, DELIVERED, CANCELLED
    // Pricing
    subtotal: real('subtotal').notNull(),
    discount: real('discount').default(0),
    discountType: text('discount_type'), // percentage, fixed
    discountReason: text('discount_reason'),
    tax: real('tax').notNull(),
    deliveryFee: real('delivery_fee').default(0),
    serviceCharge: real('service_charge').default(0),
    total: real('total').notNull(),
    tipAmount: real('tip_amount').default(0),

    // Details
    freeDelivery: boolean('free_delivery').default(false),
    isUrgent: boolean('is_urgent').default(false),
    isPaid: boolean('is_paid').default(false),
    // Payment
    paymentMethod: text('payment_method'),
    paidAmount: real('paid_amount'),
    changeAmount: real('change_amount'),
    // Platform Integration
    platformOrderId: text('platform_order_id'), // External order ID from Talabat, Elmenus, etc.
    deliverySource: text('delivery_source').default('restaurant'), // restaurant, talabat, elmenus, jahez, etc.
    // Notes
    notes: text('notes'),
    kitchenNotes: text('kitchen_notes'),
    deliveryNotes: text('delivery_notes'),
    // Delivery
    driverId: text('driver_id'),
    estimatedDeliveryTime: timestamp('estimated_delivery_time'),
    actualDeliveryTime: timestamp('actual_delivery_time'),
    // Sync
    syncStatus: text('sync_status').default('SYNCED'), // SYNCED, PENDING, FAILED
    etaReceiptUuid: text('eta_receipt_uuid'), // Egyptian Tax Authority Receipt ID
    etaStatus: text('eta_status').default('pending'), // pending, submitted, failed, valid
    // Timestamps
    businessDate: text('business_date'), // Snapshot of branch's active logical day
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    cancelledAt: timestamp('cancelled_at'),
    cancelReason: text('cancel_reason'),
    // Shift Tracking (Phase 3: Financial Ironclad)
    shiftId: text('shift_id'), // Will be linked logically to shifts.id
    deletedAt: timestamp('deleted_at'),
}, (table) => ({
    branchDateIdx: index('orders_branch_date_idx').on(table.branchId, table.createdAt),
    statusIdx: index('orders_status_idx').on(table.status),
    customerIdx: index('orders_customer_idx').on(table.customerId),
    shiftIdx: index('orders_shift_idx').on(table.shiftId),
}));

export const idempotencyKeys = pgTable('idempotency_keys', {
    id: serial('id').primaryKey(),
    key: text('key').notNull(),
    scope: text('scope').notNull().default('ORDER_CREATE'),
    requestHash: text('request_hash').notNull(),
    resourceId: text('resource_id'),
    responseCode: integer('response_code'),
    responseBody: json('response_body'),
    status: text('status').notNull().default('IN_PROGRESS'), // IN_PROGRESS, COMPLETED
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    keyScopeUnique: uniqueIndex('idempotency_keys_key_scope_idx').on(table.key, table.scope),
}));

export const orderItems = pgTable('order_items', {
    id: serial('id').primaryKey(),
    orderId: text('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    menuItemId: text('menu_item_id').references(() => menuItems.id),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    price: real('price').notNull(),
    cost: real('cost').default(0), // Snapshot of calculated cost at time of order
    quantity: integer('quantity').notNull(),
    notes: text('notes'),
    modifiers: json('modifiers').$type<{
        groupName: string;
        optionName: string;
        price: number;
    }[]>(),
    // Kitchen
    status: text('status').default('PENDING'), // PENDING, PREPARING, READY, SERVED
    preparedAt: timestamp('prepared_at'),
    servedAt: timestamp('served_at'),
    tax: real('tax').default(0), // Tax amount for this line item
    seatNumber: integer('seat_number'),
    course: text('course'),
}, (table) => ({
    orderIdx: index('order_items_order_idx').on(table.orderId),
    menuItemIdx: index('order_items_menu_item_idx').on(table.menuItemId),
}));

// Order Status History (for tracking)
export const orderStatusHistory = pgTable('order_status_history', {
    id: serial('id').primaryKey(),
    orderId: text('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    status: text('status').notNull(),
    changedBy: text('changed_by'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 💳 PAYMENTS
// ============================================================================

export const payments = pgTable('payments', {
    id: text('id').primaryKey(),
    orderId: text('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    method: text('method').notNull(), // CASH, VISA, VODAFONE_CASH, INSTAPAY
    amount: real('amount').notNull(),
    referenceNumber: text('reference_number'),
    status: text('status').default('COMPLETED'), // PENDING, COMPLETED, REFUNDED
    processedBy: text('processed_by'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    orderIdx: index('payments_order_idx').on(table.orderId),
}));

export const paymentSessions = pgTable('payment_sessions', {
    id: text('id').primaryKey(),
    orderId: text('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    providerType: text('provider_type'), // 'manual_cash', 'eft_pos', 'fawry', 'instapay', 'vodafone_cash'
    status: text('status').default('initiated'), // initiated, pending, confirmed, failed, cancelled, requires_reconciliation
    amount: real('amount').notNull(),
    currency: text('currency').default('EGP'),
    verified: boolean('verified').default(false),
    externalReference: text('external_reference'),
    idempotencyKey: text('idempotency_key').unique(),
    deviceId: text('device_id'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    orderIdx: index('payment_sessions_order_idx').on(table.orderId),
    idempotencyIdx: index('payment_sessions_idempotency_idx').on(table.idempotencyKey),
}));

export const ledgerEntries = pgTable('ledger_entries', {
    id: text('id').primaryKey(),
    orderId: text('order_id').references(() => orders.id),
    paymentSessionId: text('payment_session_id').references(() => paymentSessions.id),
    account: text('account').notNull(), // 'cash_drawer_1', 'cib_bank', 'revenue_food', 'cogs', 'inventory'
    direction: text('direction').notNull(), // 'debit', 'credit'
    amount: real('amount').notNull(),
    currency: text('currency').default('EGP'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    orderIdx: index('ledger_entries_order_idx').on(table.orderId),
    accountIdx: index('ledger_entries_account_idx').on(table.account),
}));

// ============================================================================
// 📦 INVENTORY
// ============================================================================

export const warehouses = pgTable('warehouses', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    branchId: text('branch_id').references(() => branches.id),
    type: text('type').default('MAIN'), // MAIN, SUB, KITCHEN, POINT_OF_SALE
    parentId: text('parent_id'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const inventoryItems = pgTable('inventory_items', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    sku: text('sku').unique(),
    barcode: text('barcode'),
    unit: text('unit').notNull(), // kg, g, liter, piece, etc.
    category: text('category'),
    threshold: real('threshold').default(0), // Low stock alert threshold
    costPrice: real('cost_price').default(0),
    purchasePrice: real('purchase_price').default(0),
    supplierId: text('supplier_id'),
    isAudited: boolean('is_audited').default(true),
    auditFrequency: text('audit_frequency').default('DAILY'),
    isComposite: boolean('is_composite').default(false),
    bom: json('bom').$type<any[]>().default([]),
    isActive: boolean('is_active').default(true),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    barcodeIdx: index('idx_inventory_items_barcode').on(table.barcode).where(sql`barcode IS NOT NULL`),
    skuIdx: index('idx_inventory_items_sku').on(table.sku).where(sql`sku IS NOT NULL`),
}));

export const inventoryLedger = pgTable('inventory_ledger', {
    id: text('id').primaryKey(),
    productId: text('product_id').references(() => inventoryItems.id).notNull(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    change: real('change').notNull(), // (+) for add, (-) for remove
    unitCost: real('unit_cost').notNull(), // MAC costing at time of event
    reason: text('reason').notNull(), // 'sale', 'waste', 'purchase', 'transfer'
    referenceId: text('reference_id'), // order_id, po_id
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    productBranchIdx: index('inventory_ledger_product_branch_idx').on(table.productId, table.branchId),
    referenceIdx: index('inventory_ledger_reference_idx').on(table.referenceId),
}));

export const inventoryStock = pgTable('inventory_stock', {
    id: serial('id').primaryKey(),
    itemId: text('item_id').references(() => inventoryItems.id).notNull(),
    warehouseId: text('warehouse_id').references(() => warehouses.id).notNull(),
    quantity: real('quantity').default(0),
    lastUpdated: timestamp('last_updated').defaultNow(),
}, (table) => ({
    itemWhIdx: index('inv_stock_item_wh_idx').on(table.itemId, table.warehouseId),
}));

export const stockMovements = pgTable('stock_movements', {
    id: serial('id').primaryKey(),
    itemId: text('item_id').references(() => inventoryItems.id).notNull(),
    fromWarehouseId: text('from_warehouse_id').references(() => warehouses.id),
    toWarehouseId: text('to_warehouse_id').references(() => warehouses.id),
    quantity: real('quantity').notNull(),
    unitCost: real('unit_cost').default(0), // Cost per unit at time of movement
    totalCost: real('total_cost').default(0), // Total cost of movement
    type: text('type').notNull(), // TRANSFER, ADJUSTMENT, PURCHASE, SALE_CONSUMPTION, WASTE
    referenceId: text('reference_id'), // Order ID, PO ID, etc.
    reason: text('reason'),
    performedBy: text('performed_by'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    itemDateIdx: index('stock_mov_item_date_idx').on(table.itemId, table.createdAt),
}));

export const inventoryBatches = pgTable('inventory_batches', {
    id: text('id').primaryKey(),
    itemId: text('item_id').references(() => inventoryItems.id).notNull(),
    warehouseId: text('warehouse_id').references(() => warehouses.id).notNull(),
    batchNumber: text('batch_number').notNull(),
    receivedDate: timestamp('received_date').notNull().defaultNow(),
    expiryDate: timestamp('expiry_date').notNull(),
    initialQty: real('initial_qty').notNull(),
    currentQty: real('current_qty').notNull(),
    unitCost: real('unit_cost').notNull(),
    supplierId: text('supplier_id'), // Optional foreign key if linking to suppliers
    status: text('status').default('ACTIVE').notNull(), // ACTIVE, DEPLETED, EXPIRED, QUARANTINE
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    fefoIdx: index('fefo_idx').on(table.itemId, table.warehouseId, table.expiryDate, table.status),
    itemExpiryIdx: index('inv_batches_item_expiry_idx').on(table.itemId, table.expiryDate),
}));

export const batchTransactions = pgTable('batch_transactions', {
    id: serial('id').primaryKey(),
    batchId: text('batch_id').references(() => inventoryBatches.id).notNull(),
    stockMovementId: integer('stock_movement_id').references(() => stockMovements.id).notNull(),
    quantityUsed: real('quantity_used').notNull(),
    costAtTime: real('cost_at_time').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 🍳 RECIPES
// ============================================================================

export const recipes = pgTable('recipes', {
    id: text('id').primaryKey(),
    menuItemId: text('menu_item_id').references(() => menuItems.id),
    inventoryItemId: text('inventory_item_id').references(() => inventoryItems.id),
    yield: real('yield').default(1), // How many servings this makes
    sizeId: text('size_id'), // Link to specific size if multi-size item
    instructions: text('instructions'),
    // Version tracking
    version: integer('version').default(1),
    currentVersionId: text('current_version_id'),
    // Cost tracking
    calculatedCost: real('calculated_cost'), // Auto-calculated from ingredients
    lastCostCalculation: timestamp('last_cost_calculation'),
    // Metadata
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const recipeVersions = pgTable('recipe_versions', {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id').references(() => recipes.id).notNull(),
    version: integer('version').notNull(),
    yield: real('yield').default(1),
    instructions: text('instructions'),
    // Snapshot of ingredients at this version
    ingredientsSnapshot: json('ingredients_snapshot').$type<{
        inventoryItemId: string;
        itemName: string;
        quantity: number;
        unit: string;
        costPerUnit: number;
    }[]>(),
    calculatedCost: real('calculated_cost'),
    // Change tracking
    changedBy: text('changed_by').references(() => users.id),
    changeReason: text('change_reason'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const recipeIngredients = pgTable('recipe_ingredients', {
    id: serial('id').primaryKey(),
    recipeId: text('recipe_id').references(() => recipes.id).notNull(),
    inventoryItemId: text('inventory_item_id').references(() => inventoryItems.id).notNull(),
    quantity: real('quantity').notNull(),
    unit: text('unit').notNull(),
    notes: text('notes'),
    // Cost tracking
    lastKnownCost: real('last_known_cost'),
    lastCostUpdate: timestamp('last_cost_update'),
});

// ============================================================================
// 🚚 SUPPLIERS
// ============================================================================

export const suppliers = pgTable('suppliers', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    contactPerson: text('contact_person'),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    category: text('category'),
    paymentTerms: text('payment_terms'),
    notes: text('notes'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// 📋 PURCHASE ORDERS
// ============================================================================

export const purchaseOrders = pgTable('purchase_orders', {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id').references(() => suppliers.id).notNull(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    status: text('status').default('DRAFT'), // DRAFT, SENT, PARTIAL, RECEIVED, CANCELLED
    expectedDate: timestamp('expected_date'),
    subtotal: real('subtotal').default(0),
    notes: text('notes'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const purchaseOrderItems = pgTable('purchase_order_items', {
    id: serial('id').primaryKey(),
    poId: text('po_id').references(() => purchaseOrders.id).notNull(),
    itemId: text('item_id').references(() => inventoryItems.id).notNull(),
    orderedQty: real('ordered_qty').notNull(),
    receivedQty: real('received_qty').default(0),
    unitPrice: real('unit_price').notNull(),
});

export const purchaseRequests = pgTable('purchase_requests', {
    id: text('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    department: text('department'),
    status: text('status').default('PENDING'), // PENDING, APPROVED, REJECTED, CONVERTED
    requestedBy: text('requested_by').references(() => users.id),
    approvedBy: text('approved_by').references(() => users.id),
    expectedDate: timestamp('expected_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const purchaseRequestItems = pgTable('purchase_request_items', {
    id: serial('id').primaryKey(),
    prId: text('pr_id').references(() => purchaseRequests.id).notNull(),
    itemId: text('item_id').references(() => inventoryItems.id).notNull(),
    requestedQty: real('requested_qty').notNull(),
    approvedQty: real('approved_qty'),
});

export const goodsReceiptNotes = pgTable('goods_receipt_notes', {
    id: text('id').primaryKey(),
    poId: text('po_id').references(() => purchaseOrders.id),
    supplierId: text('supplier_id').references(() => suppliers.id).notNull(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    status: text('status').default('RECEIVED'),
    receivedBy: text('received_by').references(() => users.id),
    referenceNumber: text('reference_number'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const grnItems = pgTable('grn_items', {
    id: serial('id').primaryKey(),
    grnId: text('grn_id').references(() => goodsReceiptNotes.id).notNull(),
    itemId: text('item_id').references(() => inventoryItems.id).notNull(),
    poItemId: integer('po_item_id').references(() => purchaseOrderItems.id),
    receivedQty: real('received_qty').notNull(),
    rejectedQty: real('rejected_qty').default(0),
    unitPrice: real('unit_price').notNull(),
    expiryDate: timestamp('expiry_date'),
    batchNumber: text('batch_number'),
});

export const supplierInvoices = pgTable('supplier_invoices', {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id').references(() => suppliers.id).notNull(),
    grnId: text('grn_id').references(() => goodsReceiptNotes.id),
    status: text('status').default('DRAFT'), // DRAFT, PENDING_APPROVAL, APPROVED, PAID, PARTIAL
    invoiceNumber: text('invoice_number'),
    date: timestamp('date').defaultNow().notNull(),
    dueDate: timestamp('due_date'),
    subtotal: real('subtotal').default(0),
    tax: real('tax').default(0),
    discount: real('discount').default(0),
    total: real('total').default(0),
    amountPaid: real('amount_paid').default(0),
    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const supplierInvoiceItems = pgTable('supplier_invoice_items', {
    id: serial('id').primaryKey(),
    invoiceId: text('invoice_id').references(() => supplierInvoices.id).notNull(),
    itemId: text('item_id').references(() => inventoryItems.id).notNull(),
    qty: real('qty').notNull(),
    unitPrice: real('unit_price').notNull(),
    total: real('total').notNull(),
});

export const supplierPayments = pgTable('supplier_payments', {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id').references(() => suppliers.id).notNull(),
    invoiceId: text('invoice_id').references(() => supplierInvoices.id),
    amount: real('amount').notNull(),
    paymentMethod: text('payment_method').notNull(),
    reference: text('reference'),
    status: text('status').default('COMPLETED'),
    createdBy: text('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
});

export const stockCounts = pgTable('stock_counts', {
    id: text('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    warehouseId: text('warehouse_id').references(() => warehouses.id),
    countDate: date('count_date'),
    status: text('status').default('DRAFT'), // DRAFT, FROZEN, COUNTING, REVIEW, POSTED, CANCELLED
    type: text('type').default('FULL'), // FULL, CYCLE, SPOT
    remarks: text('remarks'),
    createdBy: text('created_by').references(() => users.id),
    approvedBy: text('approved_by').references(() => users.id),
    scheduledDate: timestamp('scheduled_date'),
    frozenAt: timestamp('frozen_at'),
    postedAt: timestamp('posted_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const stockCountLines = pgTable('stock_count_lines', {
    id: serial('id').primaryKey(),
    countId: text('count_id').references(() => stockCounts.id).notNull(),
    itemId: text('item_id').references(() => inventoryItems.id).notNull(),
    expectedQty: real('expected_qty').default(0),
    countedQty: real('counted_qty'),
    varianceQty: real('variance_qty'),
    cost: real('cost').default(0),
    notes: text('notes'),
});

// ============================================================================
// 🖨️ PRINTERS
// ============================================================================

export const printers = pgTable('printers', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    code: text('code'),
    type: text('type').notNull(), // NETWORK, USB, BLUETOOTH
    address: text('address'), // IP address or port
    location: text('location'), // Kitchen, Bar, Reception
    role: text('role').default('OTHER'),
    roles: json('roles').$type<string[]>().default([]),
    stationId: text('station_id'),
    gatewayId: text('gateway_id'),
    isPrimaryCashier: boolean('is_primary_cashier').default(false),
    lastHeartbeatAt: timestamp('last_heartbeat_at'),
    heartbeatStatus: text('heartbeat_status').default('UNKNOWN'),
    branchId: text('branch_id').references(() => branches.id),
    isActive: boolean('is_active').default(true),
    paperWidth: integer('paper_width').default(80), // mm
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// ⚠️ FINANCE EXCEPTIONS
// ============================================================================

export const financeExceptions = pgTable('finance_exceptions', {
    id: text('id').primaryKey(),
    reference: text('reference'),
    referenceType: text('reference_type'),
    payload: json('payload'), // The original JournalEntryInput
    reason: text('reason').notNull(), // 'NO_OPEN_PERIOD', 'UNBALANCED', 'ACCOUNT_NOT_FOUND', etc.
    status: text('status').default('PENDING'), // PENDING, RESOLVED, DISMISSED
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at'),
    resolutionNotes: text('resolution_notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// 🔒 AUDIT LOGS
// ============================================================================

export const auditLogs = pgTable('audit_logs', {
    id: serial('id').primaryKey(),
    eventType: text('event_type').notNull(),
    userId: text('user_id'),
    userName: text('user_name'),
    userRole: text('user_role'),
    branchId: text('branch_id'),
    deviceId: text('device_id'),
    ipAddress: text('ip_address'),
    payload: json('payload'),
    before: json('before'),
    after: json('after'),
    reason: text('reason'),
    signature: text('signature'), // HMAC for tamper detection
    signatureVersion: integer('signature_version').default(1),
    isVerified: boolean('is_verified'), // Set on verification check
    lastVerifiedAt: timestamp('last_verified_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 💰 FISCAL / ETA LOGS
// ============================================================================

export const fiscalLogs = pgTable('fiscal_logs', {
    id: serial('id').primaryKey(),
    orderId: text('order_id'),
    branchId: text('branch_id'),
    status: text('status').notNull(), // PENDING, SUBMITTED, FAILED
    attempt: integer('attempt').default(0),
    lastError: text('last_error'),
    payload: json('payload'),
    response: json('response'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const etaDeadLetters = pgTable('eta_dead_letters', {
    id: serial('id').primaryKey(),
    orderId: text('order_id'),
    branchId: text('branch_id'),
    payload: json('payload').notNull(),
    attempts: integer('attempts').default(0),
    lastError: text('last_error'),
    status: text('status').default('PENDING'), // PENDING, RETRYING, DISMISSED, RESOLVED
    dismissedBy: text('dismissed_by'),
    dismissedAt: timestamp('dismissed_at'),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// 🖼️ IMAGES
// ============================================================================

export const images = pgTable('images', {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    url: text('url').notNull(),
    filename: text('filename'),
    contentType: text('content_type'),
    width: integer('width'),
    height: integer('height'),
    size: integer('size'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 🕒 SHIFT MANAGEMENT
// ============================================================================

export const shifts = pgTable('shifts', {
    id: text('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    userId: text('user_id').references(() => users.id).notNull(),
    openingTime: timestamp('opening_time').defaultNow().notNull(),
    closingTime: timestamp('closing_time'),
    openingBalance: real('opening_balance').default(0).notNull(),
    expectedBalance: real('expected_balance').default(0), // System calculated
    actualBalance: real('actual_balance').default(0), // Cashier counted
    status: text('status').default('OPEN').notNull(), // OPEN, CLOSED
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    branchStatusIdx: index('shifts_branch_status_idx').on(table.branchId, table.status),
}));

// ============================================================================
// 🔐 MANAGER APPROVALS
// ============================================================================

export const managerApprovals = pgTable('manager_approvals', {
    id: serial('id').primaryKey(),
    managerId: text('manager_id').references(() => users.id).notNull(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    actionType: text('action_type').notNull(), // VOID, DISCOUNT, REFUND, ITEM_DELETE
    relatedId: text('related_id'), // Order ID, Item ID, etc.
    reason: text('reason').notNull(),
    details: json('details'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 📊 BUDGETS
// ============================================================================

export const budgets = pgTable('budgets', {
    id: text('id').primaryKey(),
    name: text('name').notNull(), // e.g., 'Q1 2026 Operating Budget'
    branchId: text('branch_id').references(() => branches.id),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    status: text('status').default('DRAFT').notNull(), // DRAFT, ACTIVE, CLOSED
    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const budgetLines = pgTable('budget_lines', {
    id: serial('id').primaryKey(),
    budgetId: text('budget_id').references(() => budgets.id, { onDelete: 'cascade' }).notNull(),
    accountId: text('account_id').references(() => chartOfAccounts.id).notNull(),
    plannedAmount: numeric('planned_amount', { precision: 14, scale: 2 }).default('0').notNull(),
    description: text('description'),
}, (table) => ({
    budgetIdx: index('budget_lines_budget_idx').on(table.budgetId),
    accountIdx: index('budget_lines_account_idx').on(table.accountId),
}));

// ============================================================================
// 🏦 ACCOUNTING CORE (GL ENGINE)
// ============================================================================

export const costCenters = pgTable('cost_centers', {
    id: text('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    code: text('code').notNull().unique(), // e.g., 'CC-MAADI-01'
    name: text('name').notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

export const fiscalPeriods = pgTable('fiscal_periods', {
    id: text('id').primaryKey(),
    name: text('name').notNull(), // e.g., 'Jan 2026'
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    status: text('status').default('OPEN').notNull(), // OPEN, CLOSED, LOCKED
    closedBy: text('closed_by').references(() => users.id),
    closedAt: timestamp('closed_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const chartOfAccounts = pgTable('chart_of_accounts', {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(), // typical hierachical code 1000, 1100
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    type: text('type').notNull(), // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    normalBalance: text('normal_balance').notNull(), // DEBIT, CREDIT
    // To support tree structure, parentId needs explicit mapping to the same table if used via relations later
    parentId: text('parent_id'),
    isActive: boolean('is_active').default(true),
    isControlAccount: boolean('is_control_account').default(false), // e.g., Accounts Receivable
    allowManualJournals: boolean('allow_manual_journals').default(true),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    coaTypeIdx: index('coa_type_idx').on(table.type),
    coaCodeIdx: index('coa_code_idx').on(table.code),
}));

export const paymentMethodAccounts = pgTable('payment_method_accounts', {
    id: serial('id').primaryKey(),
    paymentMethod: text('payment_method').notNull().unique(), // CASH, VISA, VODAFONE_CASH
    accountId: text('account_id').references(() => chartOfAccounts.id).notNull(),
    branchId: text('branch_id').references(() => branches.id), // Nullable for global fallback
});

export const taxAccounts = pgTable('tax_accounts', {
    id: serial('id').primaryKey(),
    taxType: text('tax_type').notNull(), // INPUT_VAT, OUTPUT_VAT, WITHHOLDING
    accountId: text('account_id').references(() => chartOfAccounts.id).notNull(),
    rate: real('rate').notNull(), // Percentage
});

export const journalEntries = pgTable('journal_entries', {
    id: text('id').primaryKey(),
    entryNumber: serial('entry_number'),
    date: timestamp('date').notNull().defaultNow(),
    reference: text('reference'), // Order ID, PO ID, Shift ID
    referenceType: text('reference_type').notNull(), // ORDER, PAYMENT, GRN, WASTE, MANUAL
    description: text('description').notNull(),
    status: text('status').default('POSTED').notNull(), // POSTED, REVERSED
    fiscalPeriodId: text('fiscal_period_id'), // Removed rigid foreign key to allow flexible period linking if period hasn't been strictly generated yet
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    refIdx: index('je_ref_idx').on(table.reference, table.referenceType),
    dateStatusIdx: index('je_date_status_idx').on(table.date, table.status),
    sourceIdx: index('je_source_idx').on(table.referenceType),
}));

export const journalLines = pgTable('journal_lines', {
    id: serial('id').primaryKey(),
    journalEntryId: text('journal_entry_id').references(() => journalEntries.id, { onDelete: 'cascade' }).notNull(),
    accountId: text('account_id').references(() => chartOfAccounts.id).notNull(),
    costCenterId: text('cost_center_id').references(() => costCenters.id), // Branch-level reporting
    debit: real('debit').default(0).notNull(),
    credit: real('credit').default(0).notNull(),
    description: text('description'),
}, (table) => ({
    accCcIdx: index('jl_acc_cc_idx').on(table.accountId, table.costCenterId),
    entryIdx: index('jl_entry_idx').on(table.journalEntryId),
    accountIdx: index('jl_account_idx').on(table.accountId),
}));

export const postingRules = pgTable('posting_rules', {
    id: text('id').primaryKey(),
    documentType: text('document_type').notNull(), // POS_SALE, POS_REFUND, GRN, PAYROLL
    amountSource: text('amount_source').notNull(), // SUBTOTAL, TOTAL, TAX, SERVICE_CHARGE
    direction: text('direction').notNull(), // DEBIT, CREDIT
    accountCode: text('account_code').notNull(), // e.g., '4110' or '{PAYMENT_METHOD}'
    conditionField: text('condition_field'), // e.g., 'orderType', 'paymentMethod'
    conditionValue: text('condition_value'), // e.g., 'DINE_IN', 'CASH'
    isActive: boolean('is_active').default(true),
    isSystem: boolean('is_system').default(false), // To block user from deleting seed rules
    version: integer('version').default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const recurringJournals = pgTable('recurring_journals', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    frequency: text('frequency').notNull(), // DAILY, WEEKLY, MONTHLY, YEARLY
    nextRunDate: timestamp('next_run_date').notNull(),
    status: text('status').default('ACTIVE'), // ACTIVE, PAUSED
    payload: jsonb('payload').notNull(),
    lastRunDate: timestamp('last_run_date'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// 🚚 DELIVERY & LOGISTICS
// ============================================================================

export const deliveryPlatforms = pgTable('delivery_platforms', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    feePercentage: real('fee_percentage').default(0),
    applyFeesToMenuPrice: boolean('apply_fees_to_menu_price').default(false).notNull(),
    priceMarkupPercentage: real('price_markup_percentage').default(0),
    priceMarkupFixed: real('price_markup_fixed').default(0),
    integrationType: text('integration_type').default('MANUAL'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const deliveryZones = pgTable('delivery_zones', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(), // Maadi, New Cairo, etc.
    nameAr: text('name_ar'),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    deliveryFee: real('delivery_fee').default(0),
    minOrderAmount: real('min_order_amount').default(0),
    estimatedTime: integer('estimated_time').default(45), // minutes
    isActive: boolean('is_active').default(true),
});

export const drivers = pgTable('drivers', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    branchId: text('branch_id').references(() => branches.id),
    status: text('status').default('AVAILABLE'), // AVAILABLE, BUSY, OFFLINE
    currentCashBalance: real('current_cash_balance').default(0),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 📍 DRIVER TELEMETRY (Scalable Location Tracking)
// ============================================================================

export const driverTelemetry = pgTable('driver_telemetry', {
    id: serial('id').primaryKey(),
    driverId: text('driver_id').references(() => drivers.id).notNull(),
    branchId: text('branch_id').references(() => branches.id),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    speedKmh: real('speed_kmh'),
    accuracy: real('accuracy'),
    heading: real('heading'),        // compass direction in degrees
    altitude: real('altitude'),
    batteryLevel: integer('battery_level'), // driver device battery %
    isCharging: boolean('is_charging'),
    orderId: text('order_id'),       // current delivery order if any
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    driverIdx: index('idx_telemetry_driver').on(table.driverId),
    branchIdx: index('idx_telemetry_branch').on(table.branchId),
    createdIdx: index('idx_telemetry_created').on(table.createdAt),
}));

// Latest telemetry per driver (materialized view-like, updated on each ping)
export const driverTelemetryLatest = pgTable('driver_telemetry_latest', {
    driverId: text('driver_id').references(() => drivers.id).primaryKey(),
    branchId: text('branch_id').references(() => branches.id),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    speedKmh: real('speed_kmh'),
    accuracy: real('accuracy'),
    heading: real('heading'),
    batteryLevel: integer('battery_level'),
    orderId: text('order_id'),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// ⚙️ SETTINGS
// ============================================================================


export const systemSettings = pgTable('system_settings', {
    id: serial('id').primaryKey(),
    key: text('key').unique().notNull(),
    value: json('value'),
    category: text('category'),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const settings = pgTable('settings', {
    key: text('key').primaryKey(),
    value: json('value').notNull(),
    category: text('category').default('general'),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// 🔌 WEBHOOKS & PLUGIN SYSTEM
// ============================================================================

export const webhookEndpoints = pgTable('webhook_endpoints', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    secret: text('secret'),                // HMAC-SHA256 signing secret
    events: json('events').$type<string[]>().default([]), // e.g. ['order.created', 'order.completed']
    isActive: boolean('is_active').default(true),
    branchId: text('branch_id'),           // null = all branches
    headers: json('headers').$type<Record<string, string>>().default({}),
    retryCount: integer('retry_count').default(3),
    timeoutMs: integer('timeout_ms').default(10000),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
    id: serial('id').primaryKey(),
    endpointId: text('endpoint_id').references(() => webhookEndpoints.id).notNull(),
    event: text('event').notNull(),        // e.g. 'order.created'
    payload: json('payload'),
    status: text('status').default('PENDING'), // PENDING, SUCCESS, FAILED
    httpStatus: integer('http_status'),
    responseBody: text('response_body'),
    attempt: integer('attempt').default(1),
    lastError: text('last_error'),
    deliveredAt: timestamp('delivered_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    endpointIdx: index('idx_webhook_delivery_endpoint').on(table.endpointId),
    eventIdx: index('idx_webhook_delivery_event').on(table.event),
    statusIdx: index('idx_webhook_delivery_status').on(table.status),
}));

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

export const floorZones = pgTable('floor_zones', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    width: integer('width').default(800),
    height: integer('height').default(600),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const tables = pgTable('tables', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    zoneId: text('zone_id').references(() => floorZones.id),
    branchId: text('branch_id').references(() => branches.id).notNull(),

    // Position & Layout
    x: integer('x').default(0),
    y: integer('y').default(0),
    width: integer('width').default(100),
    height: integer('height').default(100),
    shape: text('shape').default('rectangle'), // rectangle, circle, etc.
    seats: integer('seats').default(4),

    // State Machine
    status: text('status').default('AVAILABLE').notNull(),
    // AVAILABLE: Ready for refined guests
    // OCCUPIED: Guests are seated (even if no order yet)
    // RESERVED: Guests are expected
    // DIRTY: Guests left, needs cleaning
    // OUT_OF_SERVICE: Broken table / maintenance

    // Metadata for active session
    currentOrderId: text('current_order_id'), // Link to the active order if occupied
    lockedByUserId: text('locked_by_user_id'), // For soft locking (collision detection)

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export type Table = typeof tables.$inferSelect;
export type NewTable = typeof tables.$inferInsert;
export type FloorZone = typeof floorZones.$inferSelect;

// ============================================================================
// 👥 HR & PAYROLL (ZenPeople)
// ============================================================================

export const employees = pgTable('employees', {
    id: text('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    userId: text('user_id').references(() => users.id), // Optional linking to app user
    employeeCode: text('employee_code'),
    attendanceCode: text('attendance_code'),
    nationalId: text('national_id'),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    phone: text('phone'),
    email: text('email'),
    role: text('role').notNull(),
    departmentId: text('department_id').references(() => departments.id),
    jobTitleId: text('job_title_id').references(() => jobTitles.id),
    basicSalary: real('basic_salary').default(0).notNull(),
    hourlyRate: real('hourly_rate').default(0),
    emergencyContact: text('emergency_contact'),
    bankAccount: text('bank_account'),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    branchIdx: index('employees_branch_idx').on(table.branchId),
}));

export const employeeDocuments = pgTable('employee_documents', {
    id: text('id').primaryKey(),
    employeeId: text('employee_id').references(() => employees.id).notNull(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    documentType: text('document_type').notNull(),
    title: text('title').notNull(),
    documentNumber: text('document_number'),
    issueDate: timestamp('issue_date'),
    expiryDate: timestamp('expiry_date'),
    fileUrl: text('file_url'),
    status: text('status').default('ACTIVE').notNull(),
    notes: text('notes'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    employeeIdx: index('employee_documents_employee_idx').on(table.employeeId),
    branchExpiryIdx: index('employee_documents_branch_expiry_idx').on(table.branchId, table.expiryDate, table.status),
}));

export const attendance = pgTable('attendance', {
    id: text('id').primaryKey(), // Using uuid/nanoid text
    employeeId: text('employee_id').references(() => employees.id).notNull(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    clockIn: timestamp('clock_in').defaultNow().notNull(),
    clockOut: timestamp('clock_out'),
    clockInLat: real('clock_in_lat'),
    clockInLng: real('clock_in_lng'),
    clockOutLat: real('clock_out_lat'),
    clockOutLng: real('clock_out_lng'),
    status: text('status').default('PRESENT'), // PRESENT, LATE, ABSENT, ON_LEAVE
    totalHours: real('total_hours').default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    employeeDateIdx: index('attendance_employee_date_idx').on(table.employeeId, table.clockIn),
}));

export const payrollCycles = pgTable('payroll_cycles', {
    id: text('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    status: text('status').default('DRAFT').notNull(), // DRAFT, APPROVED, PAID
    totalAmount: real('total_amount').default(0),
    executedBy: text('executed_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const payrollPayouts = pgTable('payroll_payouts', {
    id: text('id').primaryKey(),
    cycleId: text('cycle_id').references(() => payrollCycles.id).notNull(),
    employeeId: text('employee_id').references(() => employees.id).notNull(),
    basicSalary: real('basic_salary').notNull(),
    deductions: real('deductions').default(0),
    overtime: real('overtime').default(0),
    netPay: real('net_pay').notNull(),
    status: text('status').default('PENDING'), // PENDING, PAID
    createdAt: timestamp('created_at').defaultNow(),
});

export const departments = pgTable('departments', {
    id: text('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    managerId: text('manager_id').references(() => employees.id),
    parentId: text('parent_id'), 
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

export const jobTitles = pgTable('job_titles', {
    id: text('id').primaryKey(),
    departmentId: text('department_id').references(() => departments.id),
    title: text('title').notNull(),
    nameAr: text('name_ar'),
    isActive: boolean('is_active').default(true),
});

export const leaveTypes = pgTable('leave_types', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    daysPerYear: real('days_per_year').notNull(),
    isPaid: boolean('is_paid').default(true),
    requiresApproval: boolean('requires_approval').default(true),
});

export const leaveRequests = pgTable('leave_requests', {
    id: text('id').primaryKey(),
    employeeId: text('employee_id').references(() => employees.id).notNull(),
    leaveTypeId: text('leave_type_id').references(() => leaveTypes.id).notNull(),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    totalDays: real('total_days').notNull(),
    reason: text('reason'),
    status: text('status').default('PENDING'), // PENDING, APPROVED, REJECTED
    approvedBy: text('approved_by').references(() => users.id),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const overtimeEntries = pgTable('overtime_entries', {
    id: text('id').primaryKey(),
    employeeId: text('employee_id').references(() => employees.id).notNull(),
    date: timestamp('date').notNull(),
    regularHours: real('regular_hours').default(0),
    overtimeHours: real('overtime_hours').notNull(),
    overtimeRate: real('overtime_rate').default(1.5),
    overtimeAmount: real('overtime_amount').notNull(),
    status: text('status').default('PENDING'), // PENDING, APPROVED
    approvedBy: text('approved_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 📢 MARKETING CAMPAIGNS (CampaignHub)
// ============================================================================

export const campaigns = pgTable('campaigns', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(), // SMS, EMAIL, WHATSAPP, PUSH
    status: text('status').default('DRAFT').notNull(), // DRAFT, ACTIVE, SCHEDULED, PAUSED, COMPLETED
    targetAudience: text('target_audience'), // e.g. "ALL", "VIP", "INACTIVE_30_DAYS"
    content: text('content').notNull(), // Message body
    scheduledAt: timestamp('scheduled_at'),
    reach: integer('reach').default(0),
    conversions: integer('conversions').default(0),
    revenue: real('revenue').default(0), // Estimated revenue generated
    budget: real('budget').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
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

export const deliveryAssignments = pgTable('delivery_assignments', {
    id: text('id').primaryKey(),
    orderId: text('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    driverId: text('driver_id').references(() => drivers.id).notNull(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    status: text('status').default('ASSIGNED').notNull(), // ASSIGNED, PICKED_UP, EN_ROUTE, DELIVERED, FAILED, RETURNED
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
    pickedUpAt: timestamp('picked_up_at'),
    deliveredAt: timestamp('delivered_at'),
    failureReason: text('failure_reason'),
    proofPhotoUrl: text('proof_photo_url'),
    customerRating: integer('customer_rating'), // 1-5
    distanceKm: real('distance_km'),
    deliveryTimeMinutes: integer('delivery_time_minutes'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    orderIdx: index('delivery_assignments_order_idx').on(table.orderId),
    driverIdx: index('delivery_assignments_driver_idx').on(table.driverId, table.status),
}));

// ============================================================================
// 🌅 DAY CLOSE REPORTS
// ============================================================================

export const dayCloseReports = pgTable('day_close_reports', {
    id: text('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    shiftId: text('shift_id').references(() => shifts.id),
    closedBy: text('closed_by').references(() => users.id).notNull(),
    date: date('date').notNull(),
    // Cash reconciliation
    expectedCash: real('expected_cash').default(0).notNull(),
    actualCash: real('actual_cash').default(0).notNull(),
    variance: real('variance').default(0).notNull(),
    // Payment method breakdowns (JSON for flexibility)
    paymentBreakdown: json('payment_breakdown').$type<{
        method: string;
        expected: number;
        actual: number;
    }[]>(),
    // Summaries
    totalOrders: integer('total_orders').default(0),
    totalRevenue: real('total_revenue').default(0),
    totalRefunds: real('total_refunds').default(0),
    totalDiscounts: real('total_discounts').default(0),
    salesSnapshot: jsonb('sales_snapshot').$type<Record<string, any>>().default({}),
    ordersSnapshot: jsonb('orders_snapshot').$type<Record<string, any>>().default({}),
    paymentsSnapshot: jsonb('payments_snapshot').$type<Record<string, any>>().default({}),
    inventorySnapshot: jsonb('inventory_snapshot').$type<Record<string, any>>().default({}),
    shiftsSnapshot: jsonb('shifts_snapshot').$type<Record<string, any>>().default({}),
    fiscalSnapshot: jsonb('fiscal_snapshot').$type<Record<string, any>>().default({}),
    financeSnapshot: jsonb('finance_snapshot').$type<Record<string, any>>().default({}),
    sideEffectSnapshot: jsonb('side_effect_snapshot').$type<Record<string, any>>().default({}),
    auditSnapshot: jsonb('audit_snapshot').$type<Record<string, any>>().default({}),
    operationalSnapshot: jsonb('operational_snapshot').$type<Record<string, any>>().default({}),
    // Status
    status: text('status').default('DRAFT').notNull(), // DRAFT, SUBMITTED, APPROVED, REJECTED, CLOSED
    approvedBy: text('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    branchDateIdx: index('day_close_branch_date_idx').on(table.branchId, table.date),
    branchDateUniqueIdx: uniqueIndex('day_close_branch_date_unique_idx').on(table.branchId, table.date),
}));



// ============================================================================
// 🏭 PRODUCTION ORDERS
// ============================================================================

export const productionOrders = pgTable('production_orders', {
    id: text('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id),
    targetItemId: text('target_item_id').references(() => inventoryItems.id).notNull(), // Links to the Semi-Finished Good
    recipeId: text('recipe_id').references(() => recipes.id),
    batchNumber: text('batch_number').notNull(),
    batchSize: real('batch_size').notNull().default(1), // Multiplier of recipe yield
    expectedYield: real('expected_yield').notNull(),
    actualYield: real('actual_yield'),
    status: text('status').default('PLANNED').notNull(), // PLANNED, IN_PROGRESS, COMPLETED, CANCELLED
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    warehouseId: text('warehouse_id').references(() => warehouses.id).notNull(),
    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const productionOrderItems = pgTable('production_order_items', {
    id: serial('id').primaryKey(),
    productionOrderId: text('production_order_id').references(() => productionOrders.id).notNull(),
    inventoryItemId: text('inventory_item_id').references(() => inventoryItems.id).notNull(),
    requiredQty: real('required_qty').notNull(),
    actualQty: real('actual_qty'), // How much was actually used
    unit: text('unit').notNull(),
});

// ============================================================================
// 🪑 RESERVATIONS
// ============================================================================

export const reservations = pgTable('reservations', {
    id: text('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    tableId: text('table_id').references(() => tables.id),
    customerId: text('customer_id').references(() => customers.id),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    date: date('date').notNull(),
    time: text('time').notNull(), // "19:00" format
    partySize: integer('party_size').notNull().default(2),
    duration: integer('duration').default(90), // Expected duration in minutes
    status: text('status').default('CONFIRMED').notNull(), // CONFIRMED, SEATED, COMPLETED, CANCELLED, NO_SHOW
    specialRequests: text('special_requests'),
    notes: text('notes'),
    source: text('source').default('PHONE'), // PHONE, WALK_IN, WEBSITE, APP
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    branchDateIdx: index('reservations_branch_date_idx').on(table.branchId, table.date),
}));

// ============================================================================
// 💸 REFUND RECORDS
// ============================================================================

export const refundRecords = pgTable('refund_records', {
    id: text('id').primaryKey(),
    orderId: text('order_id').references(() => orders.id).notNull(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    amount: real('amount').notNull(),
    refundMethod: text('refund_method').notNull(), // CASH, CREDIT, VOUCHER, ORIGINAL_METHOD
    reason: text('reason').notNull(),
    reasonCategory: text('reason_category'), // CUSTOMER_COMPLAINT, WRONG_ORDER, QUALITY, LATE_DELIVERY, OTHER
    items: json('items').$type<{
        menuItemId: string;
        name: string;
        quantity: number;
        amount: number;
    }[]>(),
    status: text('status').default('PENDING').notNull(), // PENDING, APPROVED, PROCESSED, REJECTED
    requestedBy: text('requested_by').references(() => users.id).notNull(),
    approvedBy: text('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at'),
    processedAt: timestamp('processed_at'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// 💬 WHATSAPP MESSAGES
// ============================================================================

export const whatsappMessages = pgTable('whatsapp_messages', {
    id: text('id').primaryKey(),
    customerId: text('customer_id').references(() => customers.id),
    customerPhone: text('customer_phone').notNull(),
    direction: text('direction').notNull(), // INBOUND, OUTBOUND
    content: text('content').notNull(),
    messageType: text('message_type').default('TEXT'), // TEXT, TEMPLATE, IMAGE, DOCUMENT
    templateId: text('template_id'),
    // Delivery status
    status: text('status').default('SENT').notNull(), // SENT, DELIVERED, READ, FAILED
    externalId: text('external_id'), // Message ID from WhatsApp API
    failureReason: text('failure_reason'),
    // Context
    campaignId: text('campaign_id').references(() => campaigns.id),
    orderId: text('order_id').references(() => orders.id),
    sentAt: timestamp('sent_at').defaultNow(),
    deliveredAt: timestamp('delivered_at'),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 🏢 FRANCHISE CONFIGURATIONS
// ============================================================================

export const franchiseConfigurations = pgTable('franchise_configurations', {
    id: text('id').primaryKey(),
    name: text('name').notNull(), // Franchise brand name
    branchId: text('branch_id').references(() => branches.id).notNull(),
    contractType: text('contract_type').default('STANDARD'), // STANDARD, PREMIUM, MASTER
    royaltyPercentage: real('royalty_percentage').default(0),
    marketingFeePercentage: real('marketing_fee_percentage').default(0),
    contractStartDate: date('contract_start_date'),
    contractEndDate: date('contract_end_date'),
    allowMenuOverride: boolean('allow_menu_override').default(false),
    allowPricingOverride: boolean('allow_pricing_override').default(false),
    settings: json('settings').$type<Record<string, any>>().default({}),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// 📊 CAMPAIGN LOGS
// ============================================================================

export const campaignLogs = pgTable('campaign_logs', {
    id: serial('id').primaryKey(),
    campaignId: text('campaign_id').references(() => campaigns.id).notNull(),
    customerId: text('customer_id').references(() => customers.id),
    channel: text('channel').notNull(), // SMS, EMAIL, WHATSAPP, PUSH
    sentAt: timestamp('sent_at').defaultNow(),
    delivered: boolean('delivered').default(false),
    opened: boolean('opened').default(false),
    clicked: boolean('clicked').default(false),
    errorMessage: text('error_message'),
});

// NOTE: Performance indexes for existing tables (orders, order_items, inventory_stock,
// stock_movements, audit_logs, payments, menu_items, customers) are added via a
// raw SQL migration file, since Drizzle standalone index() calls require being
// inside a pgTable's third argument.

// ============================================================================
// 👥 HR & WORKFORCE (CORE)
// ============================================================================

export const payroll = pgTable('payroll', {
    id: serial('id').primaryKey(),
    userId: text('user_id').references(() => users.id).notNull(),
    month: text('month').notNull(), // YYYY-MM
    baseSalary: real('base_salary').notNull(),
    overtimePay: real('overtime_pay').default(0),
    bonuses: real('bonuses').default(0),
    deductions: real('deductions').default(0),
    netSalary: real('net_salary').notNull(),
    status: text('status').default('DRAFT'), // DRAFT, APPROVED, PAID
    paidAt: timestamp('paid_at'),
    processedBy: text('processed_by'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userMonthIdx: uniqueIndex('idx_payroll_user_month').on(table.userId, table.month),
}));

// ============================================================================
// 📊 BI & ANALYTICS (Centralized Intelligence Layer)
// ============================================================================


// Daily aggregated performance per branch
export const dailyBranchSummaries = pgTable('daily_branch_summaries', {
    id: serial('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    date: date('date').notNull(),
    totalRevenue: real('total_revenue').default(0),
    netRevenue: real('net_revenue').default(0), // after tax/discounts
    totalOrders: integer('total_orders').default(0),
    avgOrderValue: real('avg_order_value').default(0),
    totalTax: real('total_tax').default(0),
    totalDiscounts: real('total_discounts').default(0),
    dineInRevenue: real('dine_in_revenue').default(0),
    takeawayRevenue: real('takeaway_revenue').default(0),
    deliveryRevenue: real('delivery_revenue').default(0),
    grossProfit: real('gross_profit').default(0),
    uniqueCustomers: integer('unique_customers').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    branchDateIdx: uniqueIndex('idx_branch_summary_date').on(table.branchId, table.date),
}));

// Performance tracking per menu item (Sales Analytics)
export const itemDailySnapshots = pgTable('item_daily_snapshots', {
    id: serial('id').primaryKey(),
    menuItemId: text('menu_item_id').references(() => menuItems.id).notNull(),
    branchId: text('branch_id').references(() => branches.id),
    date: date('date').notNull(),
    quantitySold: real('quantity_sold').default(0),
    totalSales: real('total_sales').default(0),
    totalCost: real('total_cost').default(0),
    grossProfit: real('gross_profit').default(0),
    avgPrice: real('avg_price').default(0),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    itemBranchDateIdx: uniqueIndex('idx_item_snapshot_date').on(table.menuItemId, table.branchId, table.date),
}));

// Customer Intelligence (RFM Analysis)
export const customerRfmMetrics = pgTable('customer_rfm_metrics', {
    id: serial('id').primaryKey(),
    customerId: text('customer_id').references(() => customers.id).notNull(),
    branchId: text('branch_id'), // optional, for branch-specific loyalty
    recency: integer('recency'), // Days since last order
    frequency: integer('frequency'), // Total orders
    monetary: real('monetary'), // Total lifetime spent
    recencyScore: integer('recency_score'), // 1-5 rank
    frequencyScore: integer('frequency_score'), // 1-5 rank
    monetaryScore: integer('monetary_score'), // 1-5 rank
    rfmSegment: text('rfm_segment'), // CHAMPIONS, LOYAL, AT_RISK, ABOUT_TO_SLEEP, etc.
    lastOrderDate: timestamp('last_order_date'),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    customerBranchIdx: uniqueIndex('idx_customer_rfm_unique').on(table.customerId, table.branchId),
}));

// ============================================================================
// 🔔 NOTIFICATIONS & MESSAGING (INTERNAL COMMUNICATION)
// ============================================================================

export const notifications = pgTable('notifications', {
    id: serial('id').primaryKey(),
    userId: text('user_id').references(() => users.id).notNull(), // recipient
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type').default('INFO'), // INFO, SUCCESS, WARNING, ERROR, SYSTEM, MESSAGE
    isRead: boolean('is_read').default(false),
    actionUrl: text('action_url'), // Link to order, message, etc.
    metadata: json('metadata'), // e.g. { orderId: '...', senderId: '...' }
    createdAt: timestamp('created_at').defaultNow(),
});

export const internalMessages = pgTable('internal_messages', {
    id: serial('id').primaryKey(),
    senderId: text('sender_id').references(() => users.id).notNull(),
    receiverId: text('receiver_id').references(() => users.id).notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    isRead: boolean('is_read').default(false),
    isArchived: boolean('is_archived').default(false), // User clears from inbox
    createdAt: timestamp('created_at').defaultNow(),
});
// ============================================================================
// 🏆 WORKSTREAM 7: CRM, LOYALTY, AND MARKETING
// ============================================================================

export const customerWallets = pgTable('customer_wallets', {
    id: text('id').primaryKey(),
    customerId: text('customer_id').references(() => customers.id).notNull(),
    balance: real('balance').default(0).notNull(),
    currency: text('currency').default('EGP').notNull(),
    lastUpdated: timestamp('last_updated').defaultNow(),
});

export const walletTransactions = pgTable('wallet_transactions', {
    id: serial('id').primaryKey(),
    walletId: text('wallet_id').references(() => customerWallets.id).notNull(),
    amount: real('amount').notNull(), // positive for deposit, negative for withdrawal
    type: text('type').notNull(), // DEPOSIT, PAYMENT, REFUND, ADJUSTMENT
    referenceId: text('reference_id'), // Order ID or Invoice ID
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const loyaltyRewards = pgTable('loyalty_rewards', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    pointsCost: integer('points_cost').notNull(),
    type: text('type').notNull(), // DISCOUNT, FREE_ITEM, STORE_CREDIT
    rewardValue: real('reward_value'), // Monetary amount if discount/credit
    menuItemId: text('menu_item_id').references(() => menuItems.id), // If FREE_ITEM
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

export const loyaltyLedger = pgTable('loyalty_ledger', {
    id: serial('id').primaryKey(),
    customerId: text('customer_id').references(() => customers.id).notNull(),
    points: integer('points').notNull(), // positive for EARNED, negative for REDEEMED
    type: text('type').notNull(), // EARNED, REDEEMED, ADJUSTMENT, EXPIRED
    referenceId: text('reference_id'), // Order ID or Reward ID
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const coupons = pgTable('coupons', {
    id: text('id').primaryKey(),
    code: text('code').unique().notNull(),
    type: text('type').notNull(), // PERCENTAGE, FIXED_AMOUNT, FREE_SHIPPING
    value: real('value').notNull(),
    minOrderValue: real('min_order_value').default(0),
    maxDiscount: real('max_discount'),
    startDate: timestamp('start_date').defaultNow(),
    endDate: timestamp('end_date'),
    usageLimit: integer('usage_limit'),
    usedCount: integer('used_count').default(0),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

export const customerComplaints = pgTable('customer_complaints', {
    id: text('id').primaryKey(),
    customerId: text('customer_id').references(() => customers.id).notNull(),
    orderId: text('order_id').references(() => orders.id), // Optional link to an order
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    status: text('status').default('OPEN'), // OPEN, IN_PROGRESS, RESOLVED, CLOSED
    priority: text('priority').default('MEDIUM'), // LOW, MEDIUM, HIGH, CRITICAL
    resolutionNotes: text('resolution_notes'),
    assignedTo: text('assigned_to'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
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

export const userDailyPerformance = pgTable('user_daily_performance', {
    id: serial('id').primaryKey(),
    userId: text('user_id').references(() => users.id).notNull(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    date: text('date').notNull(),
    orderCount: integer('order_count').default(0),
    totalSales: real('total_sales').default(0),
    totalPoints: integer('total_points').default(0),
    avgProcessingTime: real('avg_processing_time').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userDailyUnique: uniqueIndex('user_daily_perf_unique').on(table.userId, table.branchId, table.date),
}));

export type NotificationRecord = typeof notifications.$inferSelect;
export type NewNotificationRecord = typeof notifications.$inferInsert;
export type InternalMessage = typeof internalMessages.$inferSelect;
export type NewInternalMessage = typeof internalMessages.$inferInsert;

// ============================================================================
// 🍳 WORKSTREAM 8: RESTAURANT OPERATIONS EXCELLENCE (KDS & WAITLIST)
// ============================================================================

export const waitlists = pgTable('waitlists', {
    id: serial('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone'),
    partySize: integer('party_size').notNull(),
    quotedTimeMinutes: integer('quoted_time_minutes').default(0), // "15 mins"
    status: text('status').default('WAITING'), // WAITING, SEATED, NO_SHOW, CANCELLED
    tableId: text('table_id').references(() => tables.id), // Assigned table if SEATED
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    seatedAt: timestamp('seated_at'),
});

export const kdsTickets = pgTable('kds_tickets', {
    id: text('id').primaryKey(),
    branchId: text('branch_id').references(() => branches.id).notNull(),
    orderId: text('order_id').references(() => orders.id).notNull(),
    routingStation: text('routing_station').notNull(), // 'GRILL', 'BAR', 'FRYER'
    targetTime: timestamp('target_time'), // Expected completion time
    status: text('status').default('PENDING'), // PENDING, PREPARING, READY, SERVED
    priority: text('priority').default('NORMAL'), // NORMAL, RUSH, REMAKE
    printedAt: timestamp('printed_at'),
    bumpedAt: timestamp('bumped_at'), // Marked ready
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const kdsTicketItems = pgTable('kds_ticket_items', {
    id: serial('id').primaryKey(),
    kdsTicketId: text('kds_ticket_id').references(() => kdsTickets.id).notNull(),
    orderItemId: serial('order_item_id'), // Links loosely to orderItems
    menuItemId: text('menu_item_id').notNull(), // Duplicated for raw query speed
    itemName: text('item_name').notNull(),
    quantity: integer('quantity').notNull(),
    modifiersText: text('modifiers_text'), // Flattened string for screen view
    isBumped: boolean('is_bumped').default(false), // Item-level tracking
});


// --- RESTORED TABLES ---
export const attendancePolicies = pgTable("attendance_policies", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	code: text(),
	graceLateMinutes: integer("grace_late_minutes").default(15).notNull(),
	earlyLeaveToleranceMinutes: integer("early_leave_tolerance_minutes").default(10).notNull(),
	overtimeThresholdMinutes: integer("overtime_threshold_minutes").default(30).notNull(),
	minHoursForPresent: real("min_hours_for_present").default(4).notNull(),
	attendanceProcessingMode: text("attendance_processing_mode").default('AUTO').notNull(),
	operationalDayStartHour: integer("operational_day_start_hour").default(8).notNull(),
	operationalDayEndHour: integer("operational_day_end_hour").default(5).notNull(),
	maxSmartSessionHours: real("max_smart_session_hours").default(22).notNull(),
	geofenceStrict: boolean("geofence_strict").default(false),
	faceRecognitionRequired: boolean("face_recognition_required").default(false),
	autoCloseOpenSessions: boolean("auto_close_open_sessions").default(false),
	autoResolveMissingOut: boolean("auto_resolve_missing_out").default(false),
	isDefault: boolean("is_default").default(false),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("attendance_policies_branch_default_idx").using("btree", table.branchId.asc().nullsLast().op("bool_ops"), table.isDefault.asc().nullsLast().op("text_ops"), table.isActive.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_policies_branch_id_fkey"
		}),
]);


export const employeeShiftAssignments = pgTable("employee_shift_assignments", {
	id: serial().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	branchId: text("branch_id").notNull(),
	shiftTemplateId: text("shift_template_id").notNull(),
	effectiveFrom: date("effective_from", { mode: 'date' }).notNull(),
	effectiveTo: date("effective_to", { mode: 'date' }),
	isPrimary: boolean("is_primary").default(true),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "employee_shift_assignments_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_shift_assignments_employee_id_fkey"
		}),
	foreignKey({
			columns: [table.shiftTemplateId],
			foreignColumns: [shiftTemplates.id],
			name: "employee_shift_assignments_shift_template_id_fkey"
		}),
]);


export const shiftTemplates = pgTable("shift_templates", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	code: text(),
	attendancePolicyId: text("attendance_policy_id"),
	startTime: text("start_time").notNull(),
	endTime: text("end_time").notNull(),
	breakMinutes: integer("break_minutes").default(0).notNull(),
	graceLateMinutes: integer("grace_late_minutes"),
	earlyLeaveToleranceMinutes: integer("early_leave_tolerance_minutes"),
	overtimeThresholdMinutes: integer("overtime_threshold_minutes"),
	workDays: jsonb("work_days").default(["sun","mon","tue","wed","thu"]),
	isOvernight: boolean("is_overnight").default(false),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("shift_templates_branch_active_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.isActive.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.attendancePolicyId],
			foreignColumns: [attendancePolicies.id],
			name: "shift_templates_attendance_policy_id_fkey"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "shift_templates_branch_id_fkey"
		}),
]);




// --- RESTORED TABLES ---


export const bonusPenaltyRecords = pgTable("bonus_penalty_records", {
	id: text().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	branchId: text("branch_id").notNull(),
	type: text().notNull(),
	category: text(),
	status: text().default('PENDING').notNull(),
	amount: real().notNull(),
	effectiveDate: date("effective_date", { mode: 'date' }).notNull(),
	payrollCycleId: text("payroll_cycle_id"),
	reason: text().notNull(),
	notes: text(),
	requestedBy: text("requested_by"),
	approvedBy: text("approved_by"),
	approvedAt: timestamp("approved_at"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("bonus_penalty_branch_effective_idx").using("btree", table.branchId.asc().nullsLast().op("date_ops"), table.effectiveDate.asc().nullsLast().op("text_ops")),
	index("bonus_penalty_employee_type_status_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "bonus_penalty_records_approved_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "bonus_penalty_records_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "bonus_penalty_records_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.payrollCycleId],
			foreignColumns: [payrollCycles.id],
			name: "bonus_penalty_records_payroll_cycle_id_payroll_cycles_id_fk"
		}),
	foreignKey({
			columns: [table.requestedBy],
			foreignColumns: [users.id],
			name: "bonus_penalty_records_requested_by_users_id_fk"
		}),
]);


export const employeeLoans = pgTable("employee_loans", {
	id: text().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	branchId: text("branch_id").notNull(),
	type: text().default('ADVANCE').notNull(),
	status: text().default('PENDING').notNull(),
	principalAmount: real("principal_amount").notNull(),
	installmentAmount: real("installment_amount").default(0).notNull(),
	installmentsCount: integer("installments_count").default(1).notNull(),
	outstandingAmount: real("outstanding_amount").notNull(),
	requestedAt: timestamp("requested_at").defaultNow().notNull(),
	approvedAt: timestamp("approved_at"),
	disbursedAt: timestamp("disbursed_at"),
	effectiveFrom: date("effective_from", { mode: 'date' }),
	notes: text(),
	requestedBy: text("requested_by"),
	approvedBy: text("approved_by"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("employee_loans_branch_status_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("employee_loans_employee_status_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "employee_loans_approved_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "employee_loans_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_loans_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.requestedBy],
			foreignColumns: [users.id],
			name: "employee_loans_requested_by_users_id_fk"
		}),
]);


export const employeePayrollAssignments = pgTable("employee_payroll_assignments", {
	id: serial().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	payrollProfileId: text("payroll_profile_id").notNull(),
	effectiveFrom: date("effective_from", { mode: 'date' }).notNull(),
	effectiveTo: date("effective_to", { mode: 'date' }),
	isPrimary: boolean("is_primary").default(true),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("employee_payroll_assignments_employee_effective_idx").using("btree", table.employeeId.asc().nullsLast().op("date_ops"), table.effectiveFrom.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_payroll_assignments_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.payrollProfileId],
			foreignColumns: [payrollProfiles.id],
			name: "employee_payroll_assignments_payroll_profile_id_payroll_profile"
	}),
]);

export const employeeCompensationItems = pgTable("employee_compensation_items", {
	id: text().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	branchId: text("branch_id").notNull(),
	code: text(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	category: text().default('GENERAL').notNull(),
	type: text().default('ALLOWANCE').notNull(),
	amount: real().default(0).notNull(),
	currency: text().default('EGP').notNull(),
	isRecurring: boolean("is_recurring").default(true).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	effectiveFrom: date("effective_from", { mode: 'date' }),
	effectiveTo: date("effective_to", { mode: 'date' }),
	notes: text(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("employee_comp_items_branch_active_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.isActive.asc().nullsLast().op("bool_ops")),
	index("employee_comp_items_employee_effective_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.effectiveFrom.asc().nullsLast().op("date_ops"), table.effectiveTo.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "employee_compensation_items_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_compensation_items_employee_id_employees_id_fk"
		}),
]);




export const leaveBalances = pgTable("leave_balances", {
	id: serial().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	leaveTypeId: text("leave_type_id").notNull(),
	year: integer().notNull(),
	entitledDays: real("entitled_days").default(0).notNull(),
	carriedForwardDays: real("carried_forward_days").default(0).notNull(),
	usedDays: real("used_days").default(0).notNull(),
	pendingDays: real("pending_days").default(0).notNull(),
	adjustmentDays: real("adjustment_days").default(0).notNull(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	uniqueIndex("leave_balances_employee_leave_year_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.leaveTypeId.asc().nullsLast().op("int4_ops"), table.year.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "leave_balances_employee_id_employees_id_fk"
		}),
]);


export const loanInstallments = pgTable("loan_installments", {
	id: serial().primaryKey().notNull(),
	loanId: text("loan_id").notNull(),
	dueDate: date("due_date", { mode: 'date' }).notNull(),
	amount: real().notNull(),
	status: text().default('PENDING').notNull(),
	payrollCycleId: text("payroll_cycle_id"),
	paidAt: timestamp("paid_at"),
	notes: text(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("loan_installments_loan_due_idx").using("btree", table.loanId.asc().nullsLast().op("date_ops"), table.dueDate.asc().nullsLast().op("date_ops")),
	index("loan_installments_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.loanId],
			foreignColumns: [employeeLoans.id],
			name: "loan_installments_loan_id_employee_loans_id_fk"
		}),
	foreignKey({
			columns: [table.payrollCycleId],
			foreignColumns: [payrollCycles.id],
			name: "loan_installments_payroll_cycle_id_payroll_cycles_id_fk"
		}),
]);


export const payrollComponents = pgTable("payroll_components", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	code: text().notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	type: text().notNull(),
	amountType: text("amount_type").default('FIXED').notNull(),
	calculationBasis: text("calculation_basis").default('BASE_SALARY').notNull(),
	defaultValue: real("default_value").default(0).notNull(),
	taxable: boolean().default(false),
	pensionable: boolean().default(false),
	affectsNetPay: boolean("affects_net_pay").default(true),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	uniqueIndex("payroll_components_branch_code_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.code.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payroll_components_branch_id_branches_id_fk"
		}),
]);


export const payrollProfiles = pgTable("payroll_profiles", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	code: text(),
	payFrequency: text("pay_frequency").default('MONTHLY').notNull(),
	salaryMode: text("salary_mode").default('MONTHLY').notNull(),
	currency: text().default('EGP').notNull(),
	defaultAttendancePolicyId: text("default_attendance_policy_id"),
	defaultOvertimeRate: real("default_overtime_rate").default(1.5).notNull(),
	lateDeductionMode: text("late_deduction_mode").default('NONE').notNull(),
	absenceDeductionMode: text("absence_deduction_mode").default('DAILY_RATE').notNull(),
	autoPostToGl: boolean("auto_post_to_gl").default(true),
	isDefault: boolean("is_default").default(false),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("payroll_profiles_branch_default_idx").using("btree", table.branchId.asc().nullsLast().op("bool_ops"), table.isDefault.asc().nullsLast().op("text_ops"), table.isActive.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payroll_profiles_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.defaultAttendancePolicyId],
			foreignColumns: [attendancePolicies.id],
			name: "payroll_profiles_default_attendance_policy_id_attendance_polici"
		}),
]);


export const payrollRules = pgTable("payroll_rules", {
	id: text().primaryKey().notNull(),
	payrollProfileId: text("payroll_profile_id").notNull(),
	branchId: text("branch_id").notNull(),
	code: text().notNull(),
	name: text().notNull(),
	triggerType: text("trigger_type").notNull(),
	operation: text().notNull(),
	componentId: text("component_id"),
	thresholdValue: real("threshold_value").default(0).notNull(),
	rateValue: real("rate_value").default(0).notNull(),
	capValue: real("cap_value").default(0),
	formula: text(),
	priority: integer().default(0).notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("payroll_rules_profile_priority_idx").using("btree", table.payrollProfileId.asc().nullsLast().op("int4_ops"), table.priority.asc().nullsLast().op("int4_ops"), table.isActive.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payroll_rules_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.componentId],
			foreignColumns: [payrollComponents.id],
			name: "payroll_rules_component_id_payroll_components_id_fk"
		}),
	foreignKey({
			columns: [table.payrollProfileId],
			foreignColumns: [payrollProfiles.id],
			name: "payroll_rules_payroll_profile_id_payroll_profiles_id_fk"
		}),
]);





// --- DUMMY RESTORED TABLES ---
export const domainEvents = pgTable('domain_events', {
	id: text('id').primaryKey(),
	type: text('type'),
	entityType: text('entity_type'),
	entityId: text('entity_id'),
	branchId: text('branch_id'),
	status: text('status').default('PENDING'),
	payload: jsonb('payload'),
	processedAt: timestamp('processed_at'),
	createdAt: timestamp('created_at').defaultNow(),
});
// --- RESTORED attendanceSessions ---
export const attendanceSessions = pgTable("attendance_sessions", {
	id: text().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	branchId: text("branch_id").notNull(),
	sourceType: text("source_type").notNull(),
	status: text().default('OPEN').notNull(),
	checkInRawLogId: text("check_in_raw_log_id"),
	checkOutRawLogId: text("check_out_raw_log_id"),
	clockInAt: timestamp("clock_in_at").notNull(),
	clockOutAt: timestamp("clock_out_at"),
	totalHours: real("total_hours").default(0).notNull(),
	lateMinutes: integer("late_minutes").default(0).notNull(),
	earlyLeaveMinutes: integer("early_leave_minutes").default(0).notNull(),
	overtimeMinutes: integer("overtime_minutes").default(0).notNull(),
	riskFlags: jsonb("risk_flags").default([]),
	notes: text(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("attendance_sessions_branch_status_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("attendance_sessions_employee_clock_in_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.clockInAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_sessions_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_sessions_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.checkInRawLogId],
			foreignColumns: [attendanceRawLogs.id],
			name: "attendance_sessions_check_in_raw_log_id_attendance_raw_logs_id_"
		}),
	foreignKey({
			columns: [table.checkInRawLogId],
			foreignColumns: [attendanceRawLogs.id],
			name: "attendance_sessions_check_in_raw_log_id_fkey"
		}),
	foreignKey({
			columns: [table.checkOutRawLogId],
			foreignColumns: [attendanceRawLogs.id],
			name: "attendance_sessions_check_out_raw_log_id_attendance_raw_logs_id"
		}),
	foreignKey({
			columns: [table.checkOutRawLogId],
			foreignColumns: [attendanceRawLogs.id],
			name: "attendance_sessions_check_out_raw_log_id_fkey"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_sessions_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_sessions_employee_id_fkey"
		}),
]);


// --- RESTORED AUTO ---
export const payrollRunLines = pgTable("payroll_run_lines", {
	id: text().primaryKey().notNull(),
	runId: text("run_id").notNull(),
	employeeId: text("employee_id").notNull(),
	baseSalary: real("base_salary").default(0).notNull(),
	overtime: real().default(0).notNull(),
	bonuses: real().default(0).notNull(),
	penalties: real().default(0).notNull(),
	loanDeductions: real("loan_deductions").default(0).notNull(),
	otherDeductions: real("other_deductions").default(0).notNull(),
	grossPay: real("gross_pay").default(0).notNull(),
	netPay: real("net_pay").default(0).notNull(),
	components: jsonb().default({}),
	createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
	index("payroll_run_lines_run_employee_idx").using("btree", table.runId.asc().nullsLast().op("text_ops"), table.employeeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "payroll_run_lines_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [payrollRuns.id],
			name: "payroll_run_lines_run_id_payroll_runs_id_fk"
		}),
]);


// --- RESTORED AUTO ---
export const payrollRuns = pgTable("payroll_runs", {
	id: text().primaryKey().notNull(),
	cycleId: text("cycle_id").notNull(),
	branchId: text("branch_id").notNull(),
	status: text().default('DRAFT').notNull(),
	totalEmployees: integer("total_employees").default(0).notNull(),
	grossTotal: real("gross_total").default(0).notNull(),
	deductionsTotal: real("deductions_total").default(0).notNull(),
	netTotal: real("net_total").default(0).notNull(),
	createdBy: text("created_by"),
	closedBy: text("closed_by"),
	closedAt: timestamp("closed_at"),
	notes: text(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("payroll_runs_cycle_idx").using("btree", table.cycleId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payroll_runs_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.closedBy],
			foreignColumns: [users.id],
			name: "payroll_runs_closed_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "payroll_runs_created_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.cycleId],
			foreignColumns: [payrollCycles.id],
			name: "payroll_runs_cycle_id_payroll_cycles_id_fk"
		}),
]);


// --- RESTORED AUTO ---
export const payrollLocks = pgTable("payroll_locks", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	lockedThrough: timestamp("locked_through").notNull(),
	lockedBy: text("locked_by"),
	reason: text(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("payroll_locks_branch_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payroll_locks_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.lockedBy],
			foreignColumns: [users.id],
			name: "payroll_locks_locked_by_users_id_fk"
		}),
]);


// --- RESTORED AUTO ---
export const payslips = pgTable("payslips", {
	id: text().primaryKey().notNull(),
	runId: text("run_id").notNull(),
	cycleId: text("cycle_id").notNull(),
	employeeId: text("employee_id").notNull(),
	issuedAt: timestamp("issued_at").defaultNow().notNull(),
	payload: jsonb().default({}),
	version: integer().default(1).notNull(),
	pdfUrl: text("pdf_url"),
	pdfHash: text("pdf_hash"),
	generatedAt: timestamp("generated_at"),
	generatedBy: text("generated_by"),
}, (table) => [
	index("payslips_cycle_employee_idx").using("btree", table.cycleId.asc().nullsLast().op("text_ops"), table.employeeId.asc().nullsLast().op("text_ops")),
	index("payslips_version_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.cycleId.asc().nullsLast().op("int4_ops"), table.version.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.cycleId],
			foreignColumns: [payrollCycles.id],
			name: "payslips_cycle_id_payroll_cycles_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "payslips_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.generatedBy],
			foreignColumns: [users.id],
			name: "payslips_generated_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [payrollRuns.id],
			name: "payslips_run_id_payroll_runs_id_fk"
		}),
]);


// --- RESTORED AUTO ---
export const shiftPlanEntries = pgTable("shift_plan_entries", {
	id: serial().primaryKey().notNull(),
	planId: text("plan_id").notNull(),
	branchId: text("branch_id").notNull(),
	employeeId: text("employee_id").notNull(),
	shiftTemplateId: text("shift_template_id"),
	date: date("date").notNull(),
	startTime: text("start_time"),
	endTime: text("end_time"),
	status: text().default('PLANNED').notNull(),
	notes: text(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("shift_plan_entries_employee_date_idx").using("btree", table.employeeId.asc().nullsLast().op("date_ops"), table.date.asc().nullsLast().op("date_ops")),
	index("shift_plan_entries_plan_idx").using("btree", table.planId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "shift_plan_entries_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "shift_plan_entries_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.planId],
			foreignColumns: [shiftPlans.id],
			name: "shift_plan_entries_plan_id_shift_plans_id_fk"
		}),
	foreignKey({
			columns: [table.shiftTemplateId],
			foreignColumns: [shiftTemplates.id],
			name: "shift_plan_entries_shift_template_id_shift_templates_id_fk"
		}),
]);


// --- RESTORED AUTO ---
export const shiftPlans = pgTable("shift_plans", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	weekStart: date("week_start").notNull(),
	weekEnd: date("week_end").notNull(),
	status: text().default('DRAFT').notNull(),
	createdBy: text("created_by"),
	approvedBy: text("approved_by"),
	frozenAt: timestamp("frozen_at"),
	postedAt: timestamp("posted_at"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("shift_plans_branch_week_idx").using("btree", table.branchId.asc().nullsLast().op("date_ops"), table.weekStart.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "shift_plans_approved_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "shift_plans_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "shift_plans_created_by_users_id_fk"
		}),
]);


// --- RESTORED AUTO ---
export const shiftTaskRuns = pgTable("shift_task_runs", {
	id: serial().primaryKey().notNull(),
	shiftId: text("shift_id").notNull(),
	taskId: text("task_id").notNull(),
	status: text().default('PENDING').notNull(),
	completedBy: text("completed_by"),
	completedAt: timestamp("completed_at"),
	notes: text(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("shift_task_runs_shift_idx").using("btree", table.shiftId.asc().nullsLast().op("text_ops")),
	index("shift_task_runs_task_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.completedBy],
			foreignColumns: [users.id],
			name: "shift_task_runs_completed_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.shiftId],
			foreignColumns: [shifts.id],
			name: "shift_task_runs_shift_id_shifts_id_fk"
		}),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [shiftTasks.id],
			name: "shift_task_runs_task_id_shift_tasks_id_fk"
		}),
]);


// --- RESTORED AUTO ---
export const shiftTasks = pgTable("shift_tasks", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	type: text().default('DAILY').notNull(),
	description: text(),
	requiresVerification: boolean("requires_verification").default(false),
	sortOrder: integer("sort_order").default(0),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "shift_tasks_branch_id_branches_id_fk"
		}),
]);


// --- RESTORED AUTO ---
export const attendanceCorrections = pgTable("attendance_corrections", {
	id: text().primaryKey().notNull(),
	sessionId: text("session_id").notNull(),
	employeeId: text("employee_id").notNull(),
	requestedBy: text("requested_by").notNull(),
	approvedBy: text("approved_by"),
	status: text().default('PENDING').notNull(),
	requestedClockInAt: timestamp("requested_clock_in_at"),
	requestedClockOutAt: timestamp("requested_clock_out_at"),
	reason: text().notNull(),
	approverNotes: text("approver_notes"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "attendance_corrections_approved_by_fkey"
		}),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "attendance_corrections_approved_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_corrections_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_corrections_employee_id_fkey"
		}),
	foreignKey({
			columns: [table.requestedBy],
			foreignColumns: [users.id],
			name: "attendance_corrections_requested_by_fkey"
		}),
	foreignKey({
			columns: [table.requestedBy],
			foreignColumns: [users.id],
			name: "attendance_corrections_requested_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [attendanceSessions.id],
			name: "attendance_corrections_session_id_attendance_sessions_id_fk"
		}),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [attendanceSessions.id],
			name: "attendance_corrections_session_id_fkey"
		}),
]);


// --- RESTORED AUTO ---
export const attendanceDeviceMappings = pgTable("attendance_device_mappings", {
	id: serial().primaryKey().notNull(),
	deviceId: text("device_id").notNull(),
	employeeId: text("employee_id").notNull(),
	deviceUserId: text("device_user_id").notNull(),
	employeeCodeSnapshot: text("employee_code_snapshot"),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	uniqueIndex("attendance_device_mappings_device_user_idx").using("btree", table.deviceId.asc().nullsLast().op("text_ops"), table.deviceUserId.asc().nullsLast().op("text_ops")).where(sql`(is_active = true)`),
	index("attendance_device_mappings_employee_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [attendanceDevices.id],
			name: "attendance_device_mappings_device_id_attendance_devices_id_fk"
		}),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [attendanceDevices.id],
			name: "attendance_device_mappings_device_id_fkey"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_device_mappings_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_device_mappings_employee_id_fkey"
		}),
]);


// --- RESTORED AUTO ---
export const attendanceDevices = pgTable("attendance_devices", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	code: text(),
	vendor: text().default('ZKTeco').notNull(),
	model: text(),
	sourceType: text("source_type").default('BIOMETRIC_ZK').notNull(),
	ipAddress: text("ip_address"),
	port: integer(),
	serialNumber: text("serial_number"),
	communicationMode: text("communication_mode").default('LAN'),
	branchGatewayId: text("branch_gateway_id"),
	isActive: boolean("is_active").default(true),
	lastSeenAt: timestamp("last_seen_at"),
	lastSyncAt: timestamp("last_sync_at"),
	notes: text(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("attendance_devices_branch_source_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.sourceType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_devices_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_devices_branch_id_fkey"
		}),
]);


// --- RESTORED AUTO ---
export const attendanceExceptions = pgTable("attendance_exceptions", {
	id: text().primaryKey().notNull(),
	employeeId: text("employee_id"),
	branchId: text("branch_id").notNull(),
	rawLogId: text("raw_log_id"),
	sessionId: text("session_id"),
	type: text().notNull(),
	severity: text().default('MEDIUM').notNull(),
	status: text().default('OPEN').notNull(),
	title: text().notNull(),
	details: text(),
	metadata: jsonb().default({}),
	assignedTo: text("assigned_to"),
	slaDueAt: timestamp("sla_due_at"),
	escalationLevel: integer("escalation_level").default(0).notNull(),
	lastEscalatedAt: timestamp("last_escalated_at"),
	resolvedBy: text("resolved_by"),
	resolvedAt: timestamp("resolved_at"),
	resolutionNotes: text("resolution_notes"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("attendance_exceptions_assigned_idx").using("btree", table.assignedTo.asc().nullsLast().op("text_ops")),
	index("attendance_exceptions_branch_status_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops"), table.severity.asc().nullsLast().op("text_ops")),
	index("attendance_exceptions_employee_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops")),
	index("attendance_exceptions_sla_idx").using("btree", table.slaDueAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [users.id],
			name: "attendance_exceptions_assigned_to_fkey"
		}),
	foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [users.id],
			name: "attendance_exceptions_assigned_to_users_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_exceptions_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_exceptions_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_exceptions_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_exceptions_employee_id_fkey"
		}),
	foreignKey({
			columns: [table.rawLogId],
			foreignColumns: [attendanceRawLogs.id],
			name: "attendance_exceptions_raw_log_id_attendance_raw_logs_id_fk"
		}),
	foreignKey({
			columns: [table.rawLogId],
			foreignColumns: [attendanceRawLogs.id],
			name: "attendance_exceptions_raw_log_id_fkey"
		}),
	foreignKey({
			columns: [table.resolvedBy],
			foreignColumns: [users.id],
			name: "attendance_exceptions_resolved_by_fkey"
		}),
	foreignKey({
			columns: [table.resolvedBy],
			foreignColumns: [users.id],
			name: "attendance_exceptions_resolved_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [attendanceSessions.id],
			name: "attendance_exceptions_session_id_attendance_sessions_id_fk"
		}),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [attendanceSessions.id],
			name: "attendance_exceptions_session_id_fkey"
		}),
]);


// --- RESTORED AUTO ---
export const attendanceGeofences = pgTable("attendance_geofences", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	latitude: real().notNull(),
	longitude: real().notNull(),
	radiusMeters: real("radius_meters").default(150).notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("attendance_geofences_branch_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.isActive.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_geofences_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_geofences_branch_id_fkey"
		}),
]);


// --- RESTORED AUTO ---
export const attendanceRawLogs = pgTable("attendance_raw_logs", {
	id: text().primaryKey().notNull(),
	syncRunId: text("sync_run_id"),
	deviceId: text("device_id"),
	employeeId: text("employee_id"),
	branchId: text("branch_id").notNull(),
	sourceType: text("source_type").default('BIOMETRIC_ZK').notNull(),
	eventType: text("event_type").default('UNKNOWN').notNull(),
	employeeIdentifier: text("employee_identifier"),
	deviceUserId: text("device_user_id"),
	occurredAt: timestamp("occurred_at").notNull(),
	deviceOccurredAt: timestamp("device_occurred_at"),
	geoLat: numeric("geo_lat"),
	geoLng: numeric("geo_lng"),
	geoAccuracyMeters: numeric("geo_accuracy_meters"),
	confidenceScore: numeric("confidence_score"),
	imageUrl: text("image_url"),
	dedupeHash: text("dedupe_hash"),
	processingStatus: text("processing_status").default('PENDING'),
	processingNotes: text("processing_notes"),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	index("attendance_raw_logs_branch_occurred_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.occurredAt.asc().nullsLast().op("timestamp_ops")),
	uniqueIndex("attendance_raw_logs_dedupe_idx").using("btree", table.dedupeHash.asc().nullsLast().op("text_ops")),
	index("attendance_raw_logs_employee_occurred_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.occurredAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_raw_logs_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_raw_logs_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [attendanceDevices.id],
			name: "attendance_raw_logs_device_id_attendance_devices_id_fk"
		}),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [attendanceDevices.id],
			name: "attendance_raw_logs_device_id_fkey"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_raw_logs_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_raw_logs_employee_id_fkey"
		}),
	foreignKey({
			columns: [table.syncRunId],
			foreignColumns: [attendanceSyncRuns.id],
			name: "attendance_raw_logs_sync_run_id_attendance_sync_runs_id_fk"
		}),
	unique("attendance_raw_logs_dedupe_hash_key").on(table.dedupeHash),
]);


// --- RESTORED AUTO ---
export const attendanceSyncRuns = pgTable("attendance_sync_runs", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id"),
	deviceId: text("device_id"),
	sourceType: text("source_type").notNull(),
	status: text().default('IN_PROGRESS'),
	logsReceived: integer("logs_received").default(0),
	logsAccepted: integer("logs_accepted").default(0),
	logsRejected: integer("logs_rejected").default(0),
	errorMessage: text("error_message"),
	metadata: jsonb().default({}),
	startedAt: timestamp("started_at").defaultNow(),
	completedAt: timestamp("completed_at"),
	createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_sync_runs_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_sync_runs_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [attendanceDevices.id],
			name: "attendance_sync_runs_device_id_attendance_devices_id_fk"
		}),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [attendanceDevices.id],
			name: "attendance_sync_runs_device_id_fkey"
		}),
]);


// --- RESTORED AUTO ---
export const onboardingRecords = pgTable("onboarding_records", {
	id: text().primaryKey().notNull(),
	tenantBranchId: text("tenant_branch_id").notNull(),
	setupBranchCompleted: boolean("setup_branch_completed").default(false),
	setupMenuCompleted: boolean("setup_menu_completed").default(false),
	setupStaffCompleted: boolean("setup_staff_completed").default(false),
	setupPrintersCompleted: boolean("setup_printers_completed").default(false),
	setupHardwareCompleted: boolean("setup_hardware_completed").default(false),
	isFullyOnboarded: boolean("is_fully_onboarded").default(false),
	completedAt: timestamp("completed_at"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	uniqueIndex("onboarding_records_tenant_idx").using("btree", table.tenantBranchId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantBranchId],
			foreignColumns: [branches.id],
			name: "onboarding_records_tenant_branch_id_branches_id_fk"
		}),
]);


// --- RESTORED AUTO ---
export const subscriptionPlans = pgTable("subscription_plans", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	description: text(),
	price: numeric({ precision: 10, scale:  2 }).default('0.00').notNull(),
	currency: text().default('EGP'),
	billingCycle: text("billing_cycle").default('MONTHLY'),
	features: json().default([]),
	maxBranches: integer("max_branches").default(1),
	maxUsers: integer("max_users").default(10),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	unique("subscription_plans_name_unique").on(table.name),
]);


// --- RESTORED AUTO ---
export const subscriptions = pgTable("subscriptions", {
	id: text().primaryKey().notNull(),
	tenantBranchId: text("tenant_branch_id").notNull(),
	planId: text("plan_id").notNull(),
	status: text().default('TRIALING'),
	trialEndsAt: timestamp("trial_ends_at"),
	currentPeriodStart: timestamp("current_period_start"),
	currentPeriodEnd: timestamp("current_period_end"),
	cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
	paymentMethodId: text("payment_method_id"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
	uniqueIndex("subscriptions_tenant_branch_idx").using("btree", table.tenantBranchId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.planId],
			foreignColumns: [subscriptionPlans.id],
			name: "subscriptions_plan_id_subscription_plans_id_fk"
		}),
	foreignKey({
			columns: [table.tenantBranchId],
			foreignColumns: [branches.id],
			name: "subscriptions_tenant_branch_id_branches_id_fk"
		}),
]);

