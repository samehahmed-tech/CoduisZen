/**
 * Zod Request Validation Schemas
 * Centralised validation for critical API endpoints.
 */

import { z } from 'zod';

const MAX_IMAGE_REFERENCE_LENGTH = 2 * 1024 * 1024;

const optionalTrimmedString = z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
});

const optionalStringArray = z.array(z.union([z.string(), z.null(), z.undefined()]))
    .optional()
    .default([])
    .transform((values) => values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean));

const optionalNumber = z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
});

const optionalSalarySchema = z.union([
    z.object({
        baseSalary: optionalNumber,
        allowances: optionalNumber,
        deductions: optionalNumber,
        payFrequency: optionalTrimmedString,
        currency: optionalTrimmedString,
    }),
    z.null(),
    z.undefined(),
]).transform((value) => {
    if (!value || typeof value !== 'object') return undefined;
    return {
        baseSalary: value.baseSalary ?? 0,
        allowances: value.allowances ?? 0,
        deductions: value.deductions ?? 0,
        payFrequency: value.payFrequency || 'monthly',
        currency: value.currency,
    };
});

// Generic schema that accepts any object (used for routes without specific validation)
export const anySchema = z.object({}).passthrough();

// ============================================================================
// Auth Schemas
// ============================================================================

export const loginSchema = z.object({
    email: z.string().email('Valid email is required').max(255),
    password: z.string().min(1, 'Password is required').max(128),
    deviceName: z.string().max(500).optional(),
});

export const pinLoginSchema = z.object({
    pin: z.string().length(6, 'PIN must be exactly 6 digits').regex(/^\d+$/, 'PIN must be numeric'),
    branchId: z.string().trim().min(1).max(100).optional(),
    deviceName: z.string().max(500).optional(),
});

export const mfaVerifySchema = z.object({
    mfaToken: z.string().min(1, 'MFA token is required'),
    code: z.string().min(4).max(8, 'MFA code must be 4-8 characters'),
    deviceName: z.string().max(500).optional(),
});

export const setupPinSchema = z.object({
    pin: z.string().length(6, 'PIN must be exactly 6 digits').regex(/^\d+$/, 'PIN must be numeric'),
    currentPassword: z.string().optional(),
});

// ============================================================================
// Order Schemas
// ============================================================================

const normalizeOrderType = (value: unknown) => {
    const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (/تيك|TAKE/.test(normalized)) return 'TAKEAWAY';
    if (/صالة|DINE/.test(normalized)) return 'DINE_IN';
    if (/دليفري|ديلفري|DELIVERY/.test(normalized)) return 'DELIVERY';
    if (/استلام|PICKUP/.test(normalized)) return 'PICKUP';
    const map: Record<string, string> = {
        DINEIN: 'DINE_IN',
        DINE_IN: 'DINE_IN',
        'صالة': 'DINE_IN',
        TAKE_AWAY: 'TAKEAWAY',
        TAKEAWAY: 'TAKEAWAY',
        'تيك_اواي': 'TAKEAWAY',
        DELIVERY: 'DELIVERY',
        'ديلفري': 'DELIVERY',
        PICKUP: 'PICKUP',
        'استلام_عميل': 'PICKUP',
        KIOSK: 'KIOSK',
    };
    return map[normalized] || value;
};

const orderItemSchema = z.object({
    menu_item_id: z.string().min(1),
    name: z.string().optional(),
    price: z.number().min(0).optional(),
    size_id: z.string().min(1).optional(),
    sizeId: z.string().min(1).optional(),
    quantity: z.number().int().min(1).max(9999),
    notes: z.string().max(500).optional().nullable(),
    modifiers: z.array(z.object({
        id: z.string().min(1).optional(),
        optionId: z.string().min(1).optional(),
        groupId: z.string().min(1).optional(),
        groupName: z.string().optional(),
        optionName: z.string().optional(),
        name: z.string().optional(),
        nameAr: z.string().optional(),
        price: z.number().min(0).optional(),
    }).refine(modifier => Boolean(modifier.id || modifier.optionId || modifier.optionName), {
        message: 'Modifier option reference is required',
    })).optional().default([]),
    // Legacy compat — accept cartId/selectedModifiers too
    cartId: z.string().optional(),
    selectedModifiers: z.array(z.any()).optional(),
    seatNumber: z.number().int().min(1).max(999).optional().nullable(),
    seat_number: z.number().int().min(1).max(999).optional().nullable(),
    course: z.string().max(100).optional().nullable(),
});

export const createOrderSchema = z.object({
    id: z.string().optional(),
    type: z.preprocess(normalizeOrderType, z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'PICKUP', 'KIOSK'])),
    source: z.string().max(50).optional(),
    platform_order_id: z.string().max(100).optional().nullable(),
    platformOrderId: z.string().max(100).optional().nullable(),
    delivery_source: z.string().max(50).optional().nullable(),
    deliverySource: z.string().max(50).optional().nullable(),
    branchId: z.string().min(1).optional(),
    branch_id: z.string().min(1).optional(),
    shiftId: z.string().min(1).optional(),
    shift_id: z.string().min(1).optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    created_at: z.union([z.string(), z.date()]).optional(),
    items: z.array(orderItemSchema).min(1, 'Order must have at least one item'),
    tableId: z.string().optional().nullable(),
    table_id: z.string().optional().nullable(),
    customerId: z.string().optional().nullable(),
    customer_id: z.string().optional().nullable(),
    customerName: z.string().max(200).optional().nullable(),
    customer_name: z.string().max(200).optional().nullable(),
    customerPhone: z.string().max(20).optional().nullable(),
    customer_phone: z.string().max(20).optional().nullable(),
    deliveryAddress: z.string().max(500).optional().nullable(),
    delivery_address: z.string().max(500).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    kitchenNotes: z.string().max(1000).optional().nullable(),
    kitchen_notes: z.string().max(1000).optional().nullable(),
    deliveryNotes: z.string().max(1000).optional().nullable(),
    delivery_notes: z.string().max(1000).optional().nullable(),
    status: z.string().optional(),
    subtotal: z.number().min(0).optional(),
    discount: z.number().min(0).max(999999).optional().nullable(),
    tax: z.number().min(0).optional(),
    total: z.number().min(0).optional(),
    freeDelivery: z.boolean().optional().nullable(),
    free_delivery: z.boolean().optional().nullable(),
    isUrgent: z.boolean().optional().nullable(),
    is_urgent: z.boolean().optional().nullable(),
    isCallCenterOrder: z.boolean().optional().nullable(),
    is_call_center_order: z.boolean().optional().nullable(),
    paymentMethod: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,39}$/).optional().nullable(),
    payment_method: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,39}$/).optional().nullable(),
    payments: z.array(z.object({
        method: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,39}$/),
        amount: z.number().min(0),
    })).optional(),
    couponCode: z.string().max(50).optional().nullable(),
}).refine(data => data.branchId || data.branch_id, {
    message: 'Branch ID is required (branchId or branch_id)',
});

export const updateOrderStatusSchema = z.object({
    status: z.enum(['PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED']),
    changed_by: z.string().optional(),
    notes: z.string().max(1000).optional(),
    expected_updated_at: z.string().optional(),
    expectedUpdatedAt: z.string().optional(),
    cancellationReason: z.string().max(500).optional(),
    approval_id: z.coerce.number().int().positive().optional(),
});

// ============================================================================
// Menu Schemas
// ============================================================================

const itemSizeSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(100),
    price: z.number().min(0),
    isAvailable: z.boolean().optional(),
}).passthrough();

const menuRecipeIngredientSchema = z.object({
    itemId: z.string().optional(),
    inventoryItemId: z.string().optional(),
    quantity: z.number().positive(),
    unit: z.string().max(50).optional(),
}).passthrough().refine((value) => value.itemId || value.inventoryItemId, {
    message: 'Recipe ingredient itemId or inventoryItemId is required',
});

const menuRecipeSchema = z.union([
    z.array(menuRecipeIngredientSchema),
    z.array(z.object({
        sizeId: z.string().nullable().optional(),
        ingredients: z.array(menuRecipeIngredientSchema).default([]),
    }).passthrough()),
]).optional();

const menuItemBaseSchema = z.object({
    id: z.string().min(1),
    categoryId: z.string().optional().nullable(),
    category_id: z.string().optional().nullable(),
    name: z.string().min(1).max(200),
    nameAr: z.string().max(200).optional().nullable(),
    name_ar: z.string().max(200).optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
    descriptionAr: z.string().max(2000).optional().nullable(),
    description_ar: z.string().max(2000).optional().nullable(),
    price: z.number().min(0),
    cost: z.number().min(0).optional(),
    image: z.string().max(MAX_IMAGE_REFERENCE_LENGTH, 'Image reference is too large').optional().nullable(),
    status: z.enum(['draft', 'pending_approval', 'approved', 'published', 'archived']).optional(),
    isAvailable: z.boolean().optional(),
    is_available: z.boolean().optional(),
    availableFrom: z.string().max(20).optional().nullable(),
    availableTo: z.string().max(20).optional().nullable(),
    availableDays: z.array(z.string()).optional(),
    modifierGroups: z.array(z.any()).optional(),
    sizes: z.array(itemSizeSchema).optional(),
    branchPricing: z.array(z.any()).optional(),
    platformPricing: z.array(z.any()).optional(),
    preparationTime: z.number().int().min(0).max(1440).optional(),
    printerIds: z.array(z.string()).optional(),
    isPopular: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    layoutType: z.string().max(50).optional(),
    barcode: z.string().max(200).optional().nullable(),
    sku: z.string().max(200).optional().nullable(),
    isTaxExempt: z.boolean().optional(),
    recipe: menuRecipeSchema,
}).strip();

const normalizeMenuItemPayload = (value: z.infer<typeof menuItemBaseSchema>) => {
    const { category_id, name_ar, description_ar, is_available, ...normalized } = value;
    return {
        ...normalized,
        categoryId: value.categoryId ?? category_id ?? undefined,
        nameAr: value.nameAr ?? name_ar ?? undefined,
        descriptionAr: value.descriptionAr ?? description_ar ?? undefined,
        isAvailable: value.isAvailable ?? is_available ?? undefined,
    };
};

export const createMenuItemSchema = menuItemBaseSchema.transform(normalizeMenuItemPayload);

export const updateMenuItemSchema = menuItemBaseSchema.partial().extend({
    id: z.string().optional(),
    restore: z.boolean().optional(),
}).transform(normalizeMenuItemPayload);

// ============================================================================
// Inventory Schemas
// ============================================================================

export const stockUpdateSchema = z.object({
    item_id: z.string().min(1),
    warehouse_id: z.string().min(1),
    quantity: z.number().finite('Quantity must be finite').min(0, 'Quantity cannot be negative'),
    type: z.enum(['TRANSFER', 'ADJUSTMENT', 'PURCHASE', 'SALE_CONSUMPTION', 'WASTE']),
    reason: z.string().max(500).optional(),
    actor_id: z.string().optional(),
    reference_id: z.string().optional(),
});

export const stockTransferSchema = z.object({
    item_id: z.string().min(1),
    from_warehouse_id: z.string().min(1),
    to_warehouse_id: z.string().min(1),
    quantity: z.number().positive('Quantity must be positive'),
    reason: z.string().max(500).optional(),
    actor_id: z.string().optional(),
    reference_id: z.string().optional(),
});

// ============================================================================
// Settings Schemas
// ============================================================================

export const updateSettingSchema = z.object({
    value: z.any(),
    category: z.string().max(100).optional(),
    updated_by: z.string().optional(),
});

export const directStockReceiptSchema = z.object({
    warehouse_id: z.string().min(1),
    supplier_id: z.string().min(1).optional(),
    reference_id: z.string().min(1).max(200),
    actor_id: z.string().optional(),
    items: z.array(z.object({
        item_id: z.string().min(1),
        quantity: z.number().finite().positive(),
        unit_cost: z.number().finite().positive(),
    })).min(1),
});

// ============================================================================
// User Schemas
// ============================================================================

export const createUserSchema = z.object({
    id: optionalTrimmedString,
    name: z.string().trim().min(1, 'Name is required').max(200),
    email: optionalTrimmedString.refine((value) => !value || z.string().email().safeParse(value).success, {
        message: 'Valid email is required',
    }),
    role: z.string().min(1),
    permissions: z.array(z.string()).optional().default([]),
    assignedBranchId: optionalTrimmedString,
    assigned_branch_id: optionalTrimmedString,
    allowedBranches: optionalStringArray,
    isActive: z.boolean().optional().default(true),
    is_active: z.boolean().optional(),
    password: optionalTrimmedString,
    pin: optionalTrimmedString,
    phone: optionalTrimmedString,
    nationalId: optionalTrimmedString,
    employeeCode: optionalTrimmedString,
    attendanceCode: optionalTrimmedString,
    employmentDate: optionalTrimmedString,
    salary: optionalSalarySchema,
    createEmployeeRecord: z.boolean().optional().default(false),
    basicSalary: z.number().min(0).optional(),
    hourlyRate: z.number().min(0).optional(),
    departmentId: optionalTrimmedString,
    jobTitleId: optionalTrimmedString,
    emergencyContact: optionalTrimmedString,
    bankAccount: optionalTrimmedString,
});

export const updateUserSchema = createUserSchema.partial();

// ============================================================================
// Finance Schemas
// ============================================================================

export const createJournalSchema = z.object({
    description: z.string().min(1, 'Description is required').max(500),
    amount: z.number().positive('Amount must be positive'),
    debitAccountCode: z.string().min(1),
    creditAccountCode: z.string().min(1),
    referenceId: z.string().optional(),
    source: z.string().optional(),
    date: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

// ============================================================================
// Refund Schemas
// ============================================================================

export const createRefundSchema = z.object({
    orderId: z.string().min(1, 'Order ID is required'),
    type: z.enum(['FULL', 'PARTIAL', 'ITEM']),
    reason: z.string().trim().min(1, 'Reason is required').max(1000),
    reasonCategory: z.enum(['QUALITY', 'WRONG_ORDER', 'CUSTOMER_REQUEST', 'OVERCHARGE', 'OTHER']).default('OTHER'),
    refundMethod: z.enum(['CASH', 'ORIGINAL_PAYMENT', 'STORE_CREDIT']).default('ORIGINAL_PAYMENT'),
    customAmount: z.number().positive().optional(),
    items: z.array(z.object({
        orderItemId: z.number().int().positive(),
        quantity: z.number().int().min(1),
        reason: z.string().trim().max(500).optional(),
    })).optional(),
});
