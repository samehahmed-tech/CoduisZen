import { Request, Response } from 'express';
import { db } from '../db';
import { orders, orderItems, orderStatusHistory, payments, warehouses, shifts, settings, idempotencyKeys, menuItems, menuItemModifiers, modifierOptions, tables, branches, inventoryStock, customers, customerAddresses, printers, deliveryPlatforms, coupons } from '../../src/db/schema';
import { eq, and, desc, gte, lte, inArray, gt, sql } from 'drizzle-orm';
import { inventoryService } from '../services/inventoryService';
import { getStringParam } from '../utils/request';
import { getIO } from '../socket';
import { emitBranchEvent } from '../utils/socketEmit';
import { submitOrderToFiscal } from '../services/fiscalSubmitService';
import { postCogsForOrderEntry, postPosOrderEntry } from '../services/financePostingService';
import { buildRequestHash, getIdempotencyKeyFromRequest, sanitizeIdempotencyPayload } from '../services/idempotencyService';
import { transitionOrderStatus } from '../services/orderLifecycleService';
import { webhookService } from '../services/webhookService';
import { analyticsService } from '../services/analyticsService';
import { loyaltyService } from '../services/loyaltyService';
import { whatsappAutomationService } from '../services/whatsappAutomationService';
import { kdsController } from './kdsController';
import { enqueuePrintJob, shouldEnqueueServerCashierReceipt } from '../services/printQueueService';
import { randomUUID } from 'crypto';
import { nanoid } from 'nanoid';
import { parseSettingJson, toSettingValue } from '../utils/settingsStore.js';
import { calculateCouponDiscount } from '../services/couponPricing';
import { allocateDailyOrderNumber } from '../services/orderNumberService';
import { isBelowTableMinimumSpend } from '../../src/utils/tableMinimumSpend';

const ORDER_CREATE_SCOPE = 'ORDER_CREATE';
const ORDER_STATUS_UPDATE_SCOPE = 'ORDER_STATUS_UPDATE';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const INVENTORY_DEDUCTION_WARNING_PATTERN = /^(INSUFFICIENT_STOCK|INSUFFICIENT_STOCK_BATCHES|INVALID_DEDUCTION_QUANTITY)\|/;
const ALLOW_SALE_WITH_INSUFFICIENT_STOCK = String(process.env.ALLOW_SALE_WITH_INSUFFICIENT_STOCK || 'true').toLowerCase() !== 'false';

const parseOrderTimestamp = (value: unknown) => {
    if (!value) return undefined;
    const parsed = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const formatServerReceipt = (order: any, items: any[]) => {
    const lines: string[] = [];
    const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString('ar-EG') : new Date().toLocaleString('ar-EG');
    lines.push('*** إيصال بيع ***');
    lines.push(`رقم الطلب: ${order.orderNumber || order.id}`);
    lines.push(`Order ID: ${order.id}`);
    if (order.platformOrderId) lines.push(`أوردر المنصة: ${order.platformOrderId}`);
    lines.push(`النوع: ${order.type || '-'}`);
    lines.push(`المصدر: ${order.deliverySource || order.source || '-'}`);
    lines.push(`الوقت: ${createdAt}`);
    if (order.notes) lines.push(`ملاحظة: ${order.notes}`);
    if (order.kitchenNotes) lines.push(`ملاحظة المطبخ: ${order.kitchenNotes}`);
    if (order.deliveryNotes) lines.push(`ملاحظة التوصيل: ${order.deliveryNotes}`);
    lines.push('------------------------------');
    for (const item of items) {
        const qty = Number(item.quantity || 0);
        const price = Number(item.price || 0);
        lines.push(`${qty} x ${item.name || ''}`);
        lines.push(`  ${price.toFixed(2)} = ${(qty * price).toFixed(2)}`);
    }
    lines.push('------------------------------');
    lines.push(`الإجمالي: ${Number(order.total || 0).toFixed(2)}`);
    if (order.paymentMethod) lines.push(`الدفع: ${order.paymentMethod}`);
    lines.push('شكرا لزيارتكم');
    lines.push('\n\n');
    return lines.join('\n');
};

const enqueueCashierReceiptPrint = async (order: any) => {
    if (String(process.env.SERVER_AUTO_PRINT_RECEIPT || 'false').toLowerCase() !== 'true') return;
    try {
const [cashierPrinter] = await db
            .select()
            .top(1)
            .from(printers)
            .where(and(
                eq(printers.branchId, order.branchId),
                eq(printers.isActive, true),
                eq(printers.isPrimaryCashier, true),
            ));
        if (!cashierPrinter) return;

        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
        await enqueuePrintJob({
            branchId: order.branchId,
            type: 'RECEIPT',
            content: formatServerReceipt(order, items),
            contentType: 'text',
            printerId: cashierPrinter.id,
            printerAddress: cashierPrinter.address || null,
            printerType: String(cashierPrinter.type).toUpperCase() as any || 'LOCAL',
            createdBy: 'order-server',
            maxAttempts: 3,
        });
    } catch (printError: any) {
        console.error('[PRINT] cashier receipt enqueue failed:', printError?.message || printError);
    }
};

const isWithinShiftWindow = (timestamp: Date, shift: typeof shifts.$inferSelect) => {
    const openedAt = shift.openingTime ? new Date(shift.openingTime).getTime() : NaN;
    const closedAt = shift.closingTime ? new Date(shift.closingTime).getTime() : undefined;
    const orderTime = timestamp.getTime();
    if (Number.isNaN(openedAt) || orderTime < openedAt) return false;
    return closedAt === undefined || orderTime <= closedAt;
};

const cleanQueryString = (value: unknown) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed === 'ALL') return undefined;
    return trimmed;
};

const parseBooleanQuery = (value: unknown) => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    return undefined;
};

const cleanOptionalReference = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    const trimmed = String(value).trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return undefined;
    return trimmed;
};

const isClientOnlyReference = (value: unknown) => {
    const trimmed = String(value || '').trim();
    return !trimmed || /^c[_-]/i.test(trimmed) || /^temp[_-]/i.test(trimmed) || /^local[_-]/i.test(trimmed);
};

const isClientOnlyItemReference = (value: unknown) => {
    const trimmed = String(value || '').trim();
    return !trimmed || /^cart[_-]/i.test(trimmed) || /^temp[_-]/i.test(trimmed) || /^local[_-]/i.test(trimmed);
};

const resolveOrderItemMenuItemId = (item: any) => {
    const candidates = [
        item?.menu_item_id,
        item?.menuItemId,
        item?.menu_itemId,
        item?.itemId,
        item?.id,
    ];
    return candidates
        .map((value) => String(value || '').trim())
        .find((value) => value && !isClientOnlyItemReference(value));
};

const appError = (status: number, code: string, message: string, details?: any) => {
    const error = new Error(message) as Error & { status?: number; code?: string; details?: any };
    error.status = status;
    error.code = code;
    error.details = details;
    return error;
};

const formatCreateOrderError = (error: any) => {
    const raw = String(error?.message || '');
    const constraint = String(error?.constraint || '');

    if (error?.code === '23503') {
        if (constraint.includes('orders_customer_id') || raw.includes('orders_customer_id')) {
            return {
                status: 400,
                body: {
                    error: 'INVALID_CUSTOMER_REFERENCE',
                    code: 'INVALID_CUSTOMER_REFERENCE',
                    message: 'Customer reference is missing or was not saved. Save/select the customer, then retry.',
                },
            };
        }
        if (constraint.includes('orders_branch_id') || raw.includes('orders_branch_id')) {
            return {
                status: 400,
                body: {
                    error: 'INVALID_BRANCH_REFERENCE',
                    code: 'INVALID_BRANCH_REFERENCE',
                    message: 'Order branch does not exist or is not available.',
                },
            };
        }
        if (constraint.includes('shift') || raw.includes('shift')) {
            return {
                status: 400,
                body: {
                    error: 'INVALID_SHIFT_REFERENCE',
                    code: 'INVALID_SHIFT_REFERENCE',
                    message: 'Order shift is missing or no longer valid. Open/refresh the active shift, then retry.',
                },
            };
        }
        return {
            status: 400,
            body: {
                error: 'INVALID_REFERENCE',
                code: 'INVALID_REFERENCE',
                message: 'One of the selected records is missing. Refresh the page and retry.',
            },
        };
    }

    if (error?.code === '23505') {
        return {
            status: 409,
            body: {
                error: 'DUPLICATE_RECORD',
                code: 'DUPLICATE_RECORD',
                message: 'This record already exists. Refresh the page and retry.',
            },
        };
    }

    if (raw.includes('Failed query:')) {
        return {
            status: 500,
            body: {
                error: 'DATABASE_QUERY_FAILED',
                code: 'DATABASE_QUERY_FAILED',
                message: 'The order could not be saved because related data is not consistent. Refresh the page and retry.',
            },
        };
    }

    return null;
};

const orderSelect = {
    id: orders.id,
    parentOrderId: orders.parentOrderId,
    orderNumber: orders.orderNumber,
    type: orders.type,
    source: orders.source,
    platformOrderId: orders.platformOrderId,
    deliverySource: orders.deliverySource,
    branchId: orders.branchId,
    tableId: orders.tableId,
    customerId: orders.customerId,
    customerName: orders.customerName,
    customerPhone: orders.customerPhone,
    deliveryAddress: orders.deliveryAddress,
    deliveryAddressId: orders.deliveryAddressId,
    deliveryLat: orders.deliveryLat,
    deliveryLng: orders.deliveryLng,
    deliveryAddressLabel: orders.deliveryAddressLabel,
    isCallCenterOrder: orders.isCallCenterOrder,
    callCenterAgentId: orders.callCenterAgentId,
    status: orders.status,
    subtotal: orders.subtotal,
    discount: orders.discount,
    discountType: orders.discountType,
    discountReason: orders.discountReason,
    tax: orders.tax,
    deliveryFee: orders.deliveryFee,
    serviceCharge: orders.serviceCharge,
    total: orders.total,
    tipAmount: orders.tipAmount,
    freeDelivery: orders.freeDelivery,
    isUrgent: orders.isUrgent,
    isPaid: orders.isPaid,
    paymentMethod: orders.paymentMethod,
    paidAmount: orders.paidAmount,
    changeAmount: orders.changeAmount,
    notes: orders.notes,
    kitchenNotes: orders.kitchenNotes,
    deliveryNotes: orders.deliveryNotes,
    driverId: orders.driverId,
    estimatedDeliveryTime: orders.estimatedDeliveryTime,
    actualDeliveryTime: orders.actualDeliveryTime,
    syncStatus: orders.syncStatus,
    etaReceiptUuid: orders.etaReceiptUuid,
    etaStatus: orders.etaStatus,
    businessDate: orders.businessDate,
    createdAt: orders.createdAt,
    updatedAt: orders.updatedAt,
    completedAt: orders.completedAt,
    cancelledAt: orders.cancelledAt,
    cancelReason: orders.cancelReason,
    shiftId: orders.shiftId,
};

type CouponRule = {
    code: string;
    type: 'PERCENT' | 'FIXED';
    value: number;
    active?: boolean;
    minSubtotal?: number;
    maxDiscount?: number;
    branchIds?: string[];
    orderTypes?: string[];
    startAt?: string;
    endAt?: string;
    usageLimit?: number;
    usedCount?: number;
};

const toCouponRules = (raw: unknown): CouponRule[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item: any): CouponRule => {
            const discountType: 'PERCENT' | 'FIXED' = String(item?.type || 'PERCENT').toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENT';
            return {
                code: String(item?.code || '').trim().toUpperCase(),
                type: discountType,
                value: Number(item?.value || 0),
                active: item?.active !== false,
                minSubtotal: item?.minSubtotal !== undefined ? Number(item.minSubtotal) : undefined,
                maxDiscount: item?.maxDiscount !== undefined ? Number(item.maxDiscount) : undefined,
                branchIds: Array.isArray(item?.branchIds) ? item.branchIds.map((v: any) => String(v)) : undefined,
                orderTypes: Array.isArray(item?.orderTypes) ? item.orderTypes.map((v: any) => String(v).toUpperCase()) : undefined,
                startAt: item?.startAt ? String(item.startAt) : undefined,
                endAt: item?.endAt ? String(item.endAt) : undefined,
                usageLimit: item?.usageLimit !== undefined ? Number(item.usageLimit) : undefined,
                usedCount: item?.usedCount !== undefined ? Number(item.usedCount) : undefined,
            };
        })
        .filter((c) => Boolean(c.code) && Number(c.value) > 0);
};

export const validateCoupon = async (req: Request, res: Response) => {
    try {
        const { code, branchId, orderType, subtotal, customerId } = req.body || {};
        const normalizedCode = String(code || '').trim().toUpperCase();
        const orderTypeValue = String(orderType || '').trim().toUpperCase();
        const subtotalValue = Number(subtotal || 0);

        if (!normalizedCode) {
            return res.status(400).json({ valid: false, message: 'COUPON_CODE_REQUIRED' });
        }
        if (!orderTypeValue) {
            return res.status(400).json({ valid: false, message: 'ORDER_TYPE_REQUIRED' });
        }
        if (subtotalValue <= 0) {
            return res.status(400).json({ valid: false, message: 'SUBTOTAL_REQUIRED' });
        }

        const [couponSetting] = await db
            .select()
            .top(1)
            .from(settings)
            .where(eq(settings.key, 'posCoupons'));

        const settingsCoupons = toCouponRules(couponSetting?.value);
        let coupon = settingsCoupons.find((c) => c.code === normalizedCode);

        // Fallback: check the coupons DB table.
        if (!coupon) {
            const { coupons: couponsTable } = await import('../../src/db/schema');
            const [dbCoupon] = await db.select().top(1).from(couponsTable).where(eq(couponsTable.code, normalizedCode));
            if (dbCoupon) {
                coupon = {
                    code: dbCoupon.code,
                    type: String(dbCoupon.type).toUpperCase() === 'FIXED' || String(dbCoupon.type).toUpperCase() === 'FIXED_AMOUNT' ? 'FIXED' : 'PERCENT',
                    value: Number(dbCoupon.value),
                    active: dbCoupon.isActive !== false,
                    minSubtotal: dbCoupon.minOrderValue ? Number(dbCoupon.minOrderValue) : undefined,
                    maxDiscount: dbCoupon.maxDiscount ? Number(dbCoupon.maxDiscount) : undefined,
                    startAt: dbCoupon.startDate?.toISOString(),
                    endAt: dbCoupon.endDate?.toISOString(),
                    usageLimit: dbCoupon.usageLimit ?? undefined,
                    usedCount: dbCoupon.usedCount ?? 0,
                };
            }
        }

        if (!coupon) {
            return res.status(404).json({ valid: false, message: 'COUPON_NOT_FOUND' });
        }
        if (coupon.active === false) {
            return res.status(400).json({ valid: false, message: 'COUPON_INACTIVE' });
        }
        if (coupon.minSubtotal !== undefined && subtotalValue < coupon.minSubtotal) {
            return res.status(400).json({ valid: false, message: 'MIN_SUBTOTAL_NOT_MET' });
        }
        if (coupon.branchIds && coupon.branchIds.length > 0 && branchId && !coupon.branchIds.includes(String(branchId))) {
            return res.status(400).json({ valid: false, message: 'COUPON_NOT_ALLOWED_FOR_BRANCH' });
        }
        if (coupon.orderTypes && coupon.orderTypes.length > 0 && !coupon.orderTypes.includes(orderTypeValue)) {
            return res.status(400).json({ valid: false, message: 'COUPON_NOT_ALLOWED_FOR_ORDER_TYPE' });
        }

        const now = Date.now();
        if (coupon.startAt) {
            const start = new Date(coupon.startAt).getTime();
            if (!Number.isNaN(start) && now < start) {
                return res.status(400).json({ valid: false, message: 'COUPON_NOT_STARTED' });
            }
        }
        if (coupon.endAt) {
            const end = new Date(coupon.endAt).getTime();
            if (!Number.isNaN(end) && now > end) {
                return res.status(400).json({ valid: false, message: 'COUPON_EXPIRED' });
            }
        }

        // Usage limit enforcement (Item 41)
        if (coupon.usageLimit !== undefined && coupon.usageLimit > 0) {
            const currentUsage = coupon.usedCount || 0;
            if (currentUsage >= coupon.usageLimit) {
                return res.status(400).json({ valid: false, message: 'COUPON_USAGE_LIMIT_REACHED' });
            }
        }

        const discountAmount = calculateCouponDiscount(coupon, subtotalValue);

        const discountPercent = subtotalValue > 0 ? (discountAmount / subtotalValue) * 100 : 0;

        return res.json({
            valid: true,
            code: normalizedCode,
            customerId: customerId || null,
            discountType: coupon.type,
            discountValue: coupon.value,
            discountAmount: Number(discountAmount.toFixed(2)),
            discountPercent: Number(discountPercent.toFixed(4)),
            message: 'COUPON_VALID',
        });
    } catch (error: any) {
        return res.status(500).json({ valid: false, message: error.message || 'COUPON_VALIDATION_FAILED' });
    }
};

export const getAllOrders = async (req: Request, res: Response) => {
    try {
        const { status, type, date, limit, cursor } = req.query;
        const requestedBranchId =
            cleanQueryString(req.query.branch_id) ||
            cleanQueryString(req.query.branchId) ||
            cleanQueryString(req.effectiveBranchId);
        const source = cleanQueryString(req.query.source);
        const fromDate = cleanQueryString(req.query.from_date) || cleanQueryString(req.query.startDate);
        const toDate = cleanQueryString(req.query.to_date) || cleanQueryString(req.query.endDate);
        const isCallCenterOrder = parseBooleanQuery(req.query.is_call_center_order ?? req.query.isCallCenterOrder);
        const conditions = [];

        if (status) conditions.push(eq(orders.status, status as string));
        if (requestedBranchId) conditions.push(eq(orders.branchId, requestedBranchId));
        if (type) conditions.push(eq(orders.type, type as string));
        if (source) conditions.push(eq(orders.source, source));
        if (isCallCenterOrder !== undefined) conditions.push(eq(orders.isCallCenterOrder, isCallCenterOrder));

        if (date) {
            const dateStr = date as string;
            conditions.push(
                sql`(${orders.businessDate} = ${dateStr} OR (
                    ${orders.businessDate} IS NULL AND
                    ${orders.createdAt} >= CAST(${dateStr} AS DATE) AND
                    ${orders.createdAt} < DATEADD(day, 1, CAST(${dateStr} AS DATE))
                ))`
            );
        }
        if (!date && (fromDate || toDate)) {
            const startDate = fromDate || toDate;
            const endDate = toDate || fromDate;
            conditions.push(
                sql`(
                    (${orders.businessDate} IS NOT NULL AND ${orders.businessDate} >= ${startDate} AND ${orders.businessDate} <= ${endDate})
                    OR (
                        ${orders.businessDate} IS NULL AND
                        ${orders.createdAt} >= CAST(${startDate} AS DATE) AND
                        ${orders.createdAt} < DATEADD(day, 1, CAST(${endDate} AS DATE))
                    )
                )`
            );
        }

        const max = Math.min(Number(limit) || 100, 500);

        // Item 13: Cursor-based pagination
        if (cursor && typeof cursor === 'string') {
            const { decodeCursor } = await import('../middleware/pagination');
            const decoded = decodeCursor(cursor);
            if (decoded) {
                conditions.push(
                    sql`(${orders.createdAt} < CAST(${decoded.createdAt} AS DATETIME2) OR (${orders.createdAt} = CAST(${decoded.createdAt} AS DATETIME2) AND ${orders.id} < ${decoded.id}))`
                );
            }
        }

        const fetchLimit = cursor ? max + 1 : max;
        let query = db.select(orderSelect).from(orders);
        if (conditions.length > 0) {
            // @ts-ignore
            query = query.where(and(...conditions));
        }
        const allOrders = await query.orderBy(desc(orders.createdAt)).offset(0).fetch(fetchLimit);

        if (allOrders.length === 0) {
            if (cursor) return res.json({ data: [], pagination: { limit: max, nextCursor: null, hasMore: false } });
            return res.json([]);
        }

        const trimmedOrders = cursor && allOrders.length > max ? allOrders.slice(0, max) : allOrders;
        const orderIds = trimmedOrders.map((o) => o.id);
        const tableIds = Array.from(new Set(trimmedOrders.map((o) => o.tableId).filter((id): id is string => Boolean(id))));
        const allOrderItems = await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds));
        const tableRows = tableIds.length > 0
            ? await db.select({ id: tables.id, name: tables.name }).from(tables).where(inArray(tables.id, tableIds))
            : [];
        const tableNamesById = new Map(tableRows.map((table) => [table.id, table.name]));
        const menuItemIds = Array.from(
            new Set(
                allOrderItems
                    .map((item) => item.menuItemId)
                    .filter((id): id is string => Boolean(id)),
            ),
        );
        const menuItemsById = new Map<string, { id: string; categoryId: string | null; printerIds: string[] | null; nameAr: string | null }>();
        if (menuItemIds.length > 0) {
            const relatedMenuItems = await db
                .select({
                    id: menuItems.id,
                    categoryId: menuItems.categoryId,
                    printerIds: menuItems.printerIds,
                    nameAr: menuItems.nameAr,
                })
                .from(menuItems)
                .where(inArray(menuItems.id, menuItemIds));
            for (const mi of relatedMenuItems) {
                menuItemsById.set(mi.id, mi);
            }
        }
        const itemsByOrderId = new Map<string, any[]>();
        for (const item of allOrderItems) {
            const menuMeta = item.menuItemId ? menuItemsById.get(item.menuItemId) : undefined;
            const bucket = itemsByOrderId.get(item.orderId) || [];
            bucket.push({
                id: item.menuItemId,
                menu_item_id: item.menuItemId,
                menuItemId: item.menuItemId,
                name: item.name,
                name_ar: item.nameAr || menuMeta?.nameAr || item.name,
                nameAr: item.nameAr || menuMeta?.nameAr || item.name,
                categoryId: menuMeta?.categoryId || null,
                printerIds: menuMeta?.printerIds || [],
                price: item.price,
                quantity: item.quantity,
                notes: item.notes,
                seatNumber: item.seatNumber,
                course: item.course,
                modifiers: item.modifiers,
                selectedModifiers: item.modifiers || [],
            });
            itemsByOrderId.set(item.orderId, bucket);
        }

        const enrichedOrders = trimmedOrders.map((order) => ({
            ...order,
            tableName: order.tableId ? tableNamesById.get(order.tableId) || null : null,
            items: itemsByOrderId.get(order.id) || [],
        }));

        if (cursor) {
            const hasMore = allOrders.length > max;
            const last = enrichedOrders[enrichedOrders.length - 1];
            const { encodeCursor } = await import('../middleware/pagination');
            return res.json({
                data: enrichedOrders,
                pagination: {
                    limit: max,
                    nextCursor: last && hasMore ? encodeCursor(last.createdAt || new Date(), last.id) : null,
                    hasMore,
                },
            });
        }
        res.json(enrichedOrders);
    } catch (error: any) {
        console.error('[getAllOrders] Error:', error?.stack || error?.message || error);
        res.status(500).json({ error: error.message });
    }
};

export const createOrder = async (req: Request, res: Response) => {
    const idempotencyKey = getIdempotencyKeyFromRequest(req);
    const idempotencyHash = idempotencyKey
        ? buildRequestHash(sanitizeIdempotencyPayload(req.body))
        : undefined;
    const idempotencyExpiry = new Date(Date.now() + IDEMPOTENCY_TTL_MS);

    const replayIdempotentResponse = async () => {
        if (!idempotencyKey || !idempotencyHash) return null;
        const [existingClaim] = await db
            .select()
            .top(1)
            .from(idempotencyKeys)
            .where(
                and(
                    eq(idempotencyKeys.key, idempotencyKey),
                    eq(idempotencyKeys.scope, ORDER_CREATE_SCOPE),
                    gt(idempotencyKeys.expiresAt, new Date()),
                ),
            );

        if (!existingClaim) return null;
        if (existingClaim.requestHash !== idempotencyHash) {
            return res.status(409).json({
                error: 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT',
                message: 'This Idempotency-Key was used with a different payload.',
            });
        }

        if (existingClaim.responseBody) {
            return res.status(existingClaim.responseCode || 200).json(parseSettingJson(existingClaim.responseBody, existingClaim.responseBody));
        }

        if (existingClaim.resourceId) {
            const [existingOrder] = await db.select().top(1).from(orders).where(eq(orders.id, existingClaim.resourceId));
            if (existingOrder) {
                return res.status(existingClaim.responseCode || 200).json(existingOrder);
            }
        }

        return res.status(409).json({
            error: 'IDEMPOTENCY_KEY_IN_PROGRESS',
            message: 'Request with this Idempotency-Key is still being processed.',
        });
    };

    const clearIdempotencyClaim = async () => {
        if (!idempotencyKey) return;
        await db.delete(idempotencyKeys).where(
            and(
                eq(idempotencyKeys.key, idempotencyKey),
                eq(idempotencyKeys.scope, ORDER_CREATE_SCOPE),
            ),
        );
    };

    try {
        const { items, userId, ...bodyData } = req.body;

        if (idempotencyKey && idempotencyHash) {
            const replay = await replayIdempotentResponse();
            if (replay) return replay;

            const [existingClaim] = await db
                .select({ id: idempotencyKeys.id })
                .top(1)
                .from(idempotencyKeys)
                .where(and(eq(idempotencyKeys.key, idempotencyKey), eq(idempotencyKeys.scope, ORDER_CREATE_SCOPE)));
            if (!existingClaim) {
                await db.insert(idempotencyKeys).values({
                    key: idempotencyKey,
                    scope: ORDER_CREATE_SCOPE,
                    requestHash: idempotencyHash,
                    status: 'IN_PROGRESS',
                    expiresAt: idempotencyExpiry,
                    updatedAt: new Date(),
                });
            }

            if (existingClaim) {
                const replay = await replayIdempotentResponse();
                if (replay) return replay;
            }
        }

        // Map incoming snake_case to schema's camelCase
        const orderData = {
            id: bodyData.id || randomUUID(),
            orderNumber: bodyData.order_number,
            type: bodyData.type,
            source: bodyData.source,
            platformOrderId: bodyData.platform_order_id || bodyData.platformOrderId,
            deliverySource: bodyData.delivery_source || bodyData.deliverySource,
            branchId: cleanOptionalReference(bodyData.branch_id || bodyData.branchId), // Handle both
            tableId: cleanOptionalReference(bodyData.table_id || bodyData.tableId),
            customerId: cleanOptionalReference(bodyData.customer_id || bodyData.customerId),
            customerName: bodyData.customer_name || bodyData.customerName,
            customerPhone: bodyData.customer_phone || bodyData.customerPhone,
            deliveryAddress: bodyData.delivery_address || bodyData.deliveryAddress,
            deliveryLat: bodyData.delivery_lat ?? bodyData.deliveryLat ?? bodyData.deliveryLatitude,
            deliveryLng: bodyData.delivery_lng ?? bodyData.deliveryLng ?? bodyData.deliveryLongitude,
            deliveryAddressLabel: bodyData.delivery_address_label || bodyData.deliveryAddressLabel,
            isCallCenterOrder: bodyData.is_call_center_order || bodyData.isCallCenterOrder,
            callCenterAgentId: cleanOptionalReference(bodyData.call_center_agent_id || bodyData.callCenterAgentId),
            status: bodyData.status,
            subtotal: bodyData.subtotal,
            discount: bodyData.discount,
            couponCode: String(bodyData.couponCode || bodyData.coupon_code || '').trim().toUpperCase() || undefined,
            discountType: bodyData.discount_type || bodyData.discountType,
            discountReason: bodyData.discount_reason || bodyData.discountReason,
            tax: bodyData.tax,
            tipAmount: bodyData.tip_amount || bodyData.tipAmount,
            deliveryFee: bodyData.delivery_fee || bodyData.deliveryFee,
            serviceCharge: bodyData.service_charge || bodyData.serviceCharge,
            total: bodyData.total,
            freeDelivery: bodyData.free_delivery || bodyData.freeDelivery,
            isUrgent: bodyData.is_urgent || bodyData.isUrgent,
            isPaid: bodyData.is_paid || bodyData.isPaid,
            paymentMethod: bodyData.payment_method || bodyData.paymentMethod,
            paidAmount: bodyData.paid_amount || bodyData.paidAmount,
            changeAmount: bodyData.change_amount || bodyData.changeAmount,
            notes: bodyData.notes,
            kitchenNotes: bodyData.kitchen_notes || bodyData.kitchenNotes,
            deliveryNotes: bodyData.delivery_notes || bodyData.deliveryNotes,
            driverId: cleanOptionalReference(bodyData.driver_id || bodyData.driverId),
            syncStatus: bodyData.sync_status || bodyData.syncStatus,
            shiftId: cleanOptionalReference(bodyData.shift_id || bodyData.shiftId),
            createdAt: parseOrderTimestamp(bodyData.created_at || bodyData.createdAt),
        };

        if (!orderData.branchId) {
            if (idempotencyKey) await clearIdempotencyClaim();
            return res.status(400).json({
                error: 'BRANCH_REQUIRED',
                code: 'BRANCH_REQUIRED',
                message: 'Order branch is required before placing an order.',
            });
        }

        const isPaymentAttempt = Array.isArray(bodyData.payments) && bodyData.payments.length > 0;
        if (orderData.type === 'DINE_IN' && orderData.tableId && isPaymentAttempt) {
            const [table] = await db.select({
                id: tables.id,
                branchId: tables.branchId,
                name: tables.name,
                minSpend: tables.minSpend,
            }).from(tables).where(eq(tables.id, orderData.tableId)).top(1);
            if (!table || table.branchId !== orderData.branchId) {
                if (idempotencyKey) await clearIdempotencyClaim();
                return res.status(400).json({ error: 'INVALID_TABLE_REFERENCE', code: 'INVALID_TABLE_REFERENCE' });
            }
            if (isBelowTableMinimumSpend(orderData.subtotal, table.minSpend)) {
                if (idempotencyKey) await clearIdempotencyClaim();
                return res.status(409).json({
                    error: 'TABLE_MINIMUM_SPEND_NOT_MET',
                    code: 'TABLE_MINIMUM_SPEND_NOT_MET',
                    details: {
                        tableId: table.id,
                        tableName: table.name,
                        minimumSpend: Number(table.minSpend || 0),
                        subtotal: Number(orderData.subtotal || 0),
                    },
                });
            }
        }

        // Authorization: Call Center Agents can only assign orders to their allowed branches.
        if (String(req.user?.role).toUpperCase() === 'CALL_CENTER_AGENT') {
            const allowedBranches = Array.isArray(req.user?.allowedBranches)
                ? req.user.allowedBranches.map((branchId) => String(branchId))
                : [];
            if (!allowedBranches.includes(orderData.branchId)) {
                if (idempotencyKey) await clearIdempotencyClaim();
                return res.status(403).json({
                    error: 'FORBIDDEN_BRANCH_SCOPE',
                    message: `You are not authorized to assign orders to branch: ${orderData.branchId}`
                });
            }
            // Tag it as a call center order
            orderData.isCallCenterOrder = true;
            orderData.callCenterAgentId = req.user?.id;
            orderData.source = orderData.source || 'call_center';
        }

        // Idempotency guard: if client retries the same order id, return existing record.
        if (orderData.id) {
            const [existingOrderRef] = await db
                .select({ id: orders.id })
                .top(1)
                .from(orders)
                .where(eq(orders.id, orderData.id));
            if (existingOrderRef) {
                let existingOrder: any = { id: existingOrderRef.id };
                try {
                    const [fullOrder] = await db.select().top(1).from(orders).where(eq(orders.id, orderData.id));
                    if (fullOrder) {
                        existingOrder = fullOrder;
                    }
                } catch {
                    // Fallback to minimal payload when schema drift exists.
                }
                if (idempotencyKey) {
                    await db
                        .update(idempotencyKeys)
                        .set({
                            status: 'COMPLETED',
                            responseCode: 200,
                            resourceId: existingOrder.id,
                            responseBody: toSettingValue(existingOrder),
                            updatedAt: new Date(),
                            expiresAt: idempotencyExpiry,
                        })
                        .where(
                            and(
                                eq(idempotencyKeys.key, idempotencyKey),
                                eq(idempotencyKeys.scope, ORDER_CREATE_SCOPE),
                            ),
                        );
                }
                return res.status(200).json(existingOrder);
            }
        }

        // ================== SHIFT-LOCK ENFORCEMENT ==================
        // Every order MUST be linked to an active shift for cash reconciliation
        // Prioritize shift provided by frontend (Crucial for offline sync when a shift might have closed)
        let activeShift: typeof shifts.$inferSelect | null = null;
        if (orderData.shiftId) {
            const [found] = await db.select().top(1).from(shifts).where(eq(shifts.id, orderData.shiftId));
            if (found && found.branchId !== orderData.branchId) {
                await clearIdempotencyClaim();
                return res.status(400).json({
                    error: 'INVALID_SHIFT_BRANCH',
                    message: 'The provided shift does not belong to the order branch.'
                });
            }
            if (found?.status === 'OPEN') {
                activeShift = found;
            } else if (found && orderData.createdAt && isWithinShiftWindow(orderData.createdAt, found)) {
                activeShift = found;
            } else if (found) {
                await clearIdempotencyClaim();
                return res.status(400).json({
                    error: 'SHIFT_CLOSED',
                    message: 'The provided shift is closed and the order timestamp is outside the shift window.'
                });
            }
        }

        if (!activeShift) {
            const [found] = await db.select().top(1).from(shifts).where(
                and(
                    eq(shifts.branchId, orderData.branchId),
                    eq(shifts.status, 'OPEN')
                )
            );
            activeShift = found;
        }

        if (!activeShift) {
            await clearIdempotencyClaim();
            return res.status(400).json({
                error: 'SHIFT_REQUIRED',
                message: 'No active shift found. Please open a shift before placing orders.'
            });
        }

const [branchRecordForOrder] = await db
            .select({ id: branches.id, businessDate: branches.businessDate })
            .top(1)
            .from(branches)
            .where(eq(branches.id, orderData.branchId));

        if (!branchRecordForOrder) {
            await clearIdempotencyClaim();
            return res.status(400).json({
                error: 'INVALID_BRANCH_REFERENCE',
                code: 'INVALID_BRANCH_REFERENCE',
                message: 'Order branch does not exist or is not available.',
            });
        }

        if (orderData.customerId) {
const [customerRecordForOrder] = await db
                .select({ id: customers.id })
                .top(1)
                .from(customers)
                .where(eq(customers.id, orderData.customerId));

            if (!customerRecordForOrder && !String(orderData.customerPhone || '').trim()) {
                await clearIdempotencyClaim();
                return res.status(400).json({
                    error: 'INVALID_CUSTOMER_REFERENCE',
                    code: 'INVALID_CUSTOMER_REFERENCE',
                    message: 'Customer reference is missing and no phone number was provided to create it.',
                });
            }
        }

        // ================== ETA CONFIG GATE ==================
        const [etaRequiredSetting] = await db.select().from(settings).where(eq(settings.key, 'GO_LIVE_REQUIRE_ETA'));
        const isETARequired = etaRequiredSetting?.value === 'true';

        if (isETARequired && !process.env.ETA_RIN) {
            await clearIdempotencyClaim();
            return res.status(503).json({
                error: 'FISCAL_CONFIGURATION_MISSING',
                message: 'System is in Go-Live mode but ETA configuration (RIN) is missing. Please contact administrator.'
            });
        }

        // Fetch only the columns needed for price/tax verification. Selecting the
        // full menu_items row makes order creation depend on unrelated menu schema
        // migrations such as branch/platform pricing columns.
        const resolvedMenuItemIds = items.map(resolveOrderItemMenuItemId);
        const invalidItemIndex = resolvedMenuItemIds.findIndex((id: unknown) => typeof id !== 'string' || id.length === 0);
        const menuItemIds: string[] = Array.from(new Set(
            resolvedMenuItemIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
        ));
        if (invalidItemIndex !== -1) {
            await clearIdempotencyClaim();
            return res.status(400).json({
                error: 'INVALID_MENU_ITEM',
                code: 'INVALID_MENU_ITEM',
                message: 'Every order item must reference an existing menu item.',
                details: items.map((item: any, index: number) => ({
                    index,
                    invalid: index === invalidItemIndex,
                    id: item?.id,
                    menu_item_id: item?.menu_item_id,
                    menuItemId: item?.menuItemId,
                    name: item?.name,
                })),
            });
        }
        const dbMenuItems = menuItemIds.length > 0
            ? await db
                .select({
                    id: menuItems.id,
                    price: menuItems.price,
                    sizes: menuItems.sizes,
                    isTaxExempt: menuItems.isTaxExempt,
                    modifierGroups: menuItems.modifierGroups,
                })
                .from(menuItems)
                .where(inArray(menuItems.id, menuItemIds))
            : [];
        const menuLookup = new Map(dbMenuItems.map(m => [m.id, m]));
        const missingMenuItemIds = menuItemIds.filter((id: string) => !menuLookup.has(id));
        if (missingMenuItemIds.length > 0) {
            await clearIdempotencyClaim();
            return res.status(400).json({
                error: 'INVALID_MENU_ITEM',
                message: `Menu item not found: ${missingMenuItemIds.join(', ')}`,
                missingItemIds: missingMenuItemIds,
            });
        }
        const linkedModifierRows = menuItemIds.length > 0
            ? await db.select({
                menuItemId: menuItemModifiers.menuItemId,
                optionId: modifierOptions.id,
                price: modifierOptions.price,
            })
                .from(menuItemModifiers)
                .innerJoin(modifierOptions, eq(modifierOptions.groupId, menuItemModifiers.modifierGroupId))
                .where(inArray(menuItemModifiers.menuItemId, menuItemIds))
            : [];
        const modifierPricesByItem = new Map<string, Map<string, number>>();
        for (const item of dbMenuItems) {
            const prices = new Map<string, number>();
            for (const group of Array.isArray(item.modifierGroups) ? item.modifierGroups : []) {
                for (const option of Array.isArray(group?.options) ? group.options : []) {
                    if (option?.id) prices.set(String(option.id), Number(option.price || 0));
                }
            }
            modifierPricesByItem.set(item.id, prices);
        }
        for (const row of linkedModifierRows) {
            const prices = modifierPricesByItem.get(row.menuItemId) || new Map<string, number>();
            prices.set(String(row.optionId), Number(row.price || 0));
            modifierPricesByItem.set(row.menuItemId, prices);
        }
        const sourceKey = String(orderData.deliverySource || '').trim().toLowerCase();
const [sourcePlatform] = sourceKey
            ? await db
                .select({
                    id: deliveryPlatforms.id,
                    name: deliveryPlatforms.name,
                    applyFeesToMenuPrice: deliveryPlatforms.applyFeesToMenuPrice,
                    priceMarkupPercentage: deliveryPlatforms.priceMarkupPercentage,
                    priceMarkupFixed: deliveryPlatforms.priceMarkupFixed,
                })
                .top(1)
                .from(deliveryPlatforms)
                .where(and(
                    eq(deliveryPlatforms.isActive, true),
                    sql`(
                        lower(${deliveryPlatforms.id}) = ${sourceKey}
                        OR lower(${deliveryPlatforms.name}) = ${sourceKey}
                    )`,
                ))
            : [];
        const platformPriceConfig = sourcePlatform?.applyFeesToMenuPrice ? sourcePlatform : undefined;
        // =============================================================

        const inventoryWarnings: any[] = [];
        const { savedOrder, paidNow, finalStocks, cogsCost } = await db.transaction(async (tx) => {
            // 1. Calculate and Enforce Totals (Egyptian Standards)
            // Tax is server-authoritative and reads the saved setting. Zero is a valid rate.
            const [taxSetting] = await tx.select({ value: settings.value }).top(1)
                .from(settings).where(eq(settings.key, 'taxRate'));
            const [branchRecord] = await tx.select({ taxRate: branches.taxRate, serviceCharge: branches.serviceCharge }).top(1)
                .from(branches).where(eq(branches.id, orderData.branchId));
            const rawTaxPercent = Number(parseSettingJson(taxSetting?.value, branchRecord?.taxRate ?? 14));
            const taxPercent = Number.isFinite(rawTaxPercent) && rawTaxPercent >= 0 && rawTaxPercent <= 100 ? rawTaxPercent : 14;
            const configuredTaxRate = taxPercent / 100;
            let calculatedSubtotal = 0;
            let calculatedTax = 0;

            const processedItems = items.map((item: any) => {
                const menuItemId = resolveOrderItemMenuItemId(item);
                const dbItem = menuLookup.get(menuItemId || '');
                const sizeId = String(item?.sizeId || item?.size_id || '').trim();
                const configuredSize = sizeId && Array.isArray(dbItem?.sizes)
                    ? dbItem.sizes.find((size: any) => String(size?.id || '').trim() === sizeId)
                    : undefined;
                if (sizeId && !configuredSize) {
                    throw appError(400, 'INVALID_ITEM_SIZE', 'Selected size is not available for this menu item.');
                }
                const basePrice = Number(configuredSize?.price ?? dbItem?.price ?? item.price ?? 0);
                const price = platformPriceConfig
                    ? Number((basePrice * (1 + Number(platformPriceConfig.priceMarkupPercentage || 0) / 100) + Number(platformPriceConfig.priceMarkupFixed || 0)).toFixed(2))
                    : basePrice;
                const isExempt = dbItem?.isTaxExempt || false;
                const selectedModifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
                const allowedModifierPrices = modifierPricesByItem.get(menuItemId || '') || new Map<string, number>();
                let modifierTotal = 0;
                const canonicalModifiers = selectedModifiers.map((modifier: any) => {
                    const optionId = String(modifier?.id || modifier?.optionId || '').trim();
                    if (!optionId || !allowedModifierPrices.has(optionId)) {
                        throw appError(400, 'INVALID_MODIFIER_OPTION', 'Selected modifier is not available for this menu item.');
                    }
                    const modifierPrice = Number(allowedModifierPrices.get(optionId) || 0);
                    modifierTotal += modifierPrice;
                    return { ...modifier, id: optionId, price: modifierPrice };
                });

                const lineSubtotal = (price + modifierTotal) * item.quantity;
                const lineTax = isExempt ? 0 : parseFloat((lineSubtotal * configuredTaxRate).toFixed(2));

                calculatedSubtotal += lineSubtotal;
                calculatedTax += lineTax;

                return { ...item, price, modifiers: canonicalModifiers, tax: lineTax };
            });

            const subtotal = calculatedSubtotal;
            let discountAmount = Math.max(0, Math.min(Number(orderData.discount || 0), subtotal));
            if (orderData.couponCode) {
                const [coupon] = await tx.select().top(1).from(coupons).where(eq(coupons.code, orderData.couponCode));
                const now = new Date();
                if (!coupon || coupon.isActive === false) throw appError(400, 'COUPON_INACTIVE', 'Coupon is missing or inactive.');
                if (coupon.startDate && now < coupon.startDate) throw appError(400, 'COUPON_NOT_STARTED', 'Coupon has not started.');
                if (coupon.endDate && now > coupon.endDate) throw appError(400, 'COUPON_EXPIRED', 'Coupon has expired.');
                if (subtotal < Number(coupon.minOrderValue || 0)) throw appError(400, 'MIN_SUBTOTAL_NOT_MET', 'Minimum subtotal was not met.');
                discountAmount = calculateCouponDiscount({
                    type: String(coupon.type).toUpperCase() === 'FIXED_AMOUNT' ? 'FIXED' : 'PERCENT',
                    value: Number(coupon.value),
                    maxDiscount: coupon.maxDiscount === null ? undefined : Number(coupon.maxDiscount),
                }, subtotal);
                const [claimedCoupon] = await tx.update(coupons)
                    .set({ usedCount: sql`coalesce(${coupons.usedCount}, 0) + 1` })
                    .output()
                    .where(and(
                        eq(coupons.id, coupon.id),
                        eq(coupons.isActive, true),
                        sql`(${coupons.usageLimit} is null or coalesce(${coupons.usedCount}, 0) < ${coupons.usageLimit})`,
                    ));
                if (!claimedCoupon) throw appError(400, 'COUPON_USAGE_LIMIT_REACHED', 'Coupon usage limit was reached.');
                orderData.discountType = 'COUPON';
                orderData.discountReason = `Coupon: ${coupon.code}`;
            }
            const netAmount = subtotal - discountAmount;

            // VAT on net amount (proportionally reduced if there's a discount).
            // If the discount is overall, we reduce the total tax by the same ratio
            const taxRatio = subtotal > 0 ? (netAmount / subtotal) : 0;
            const tax = parseFloat((calculatedTax * taxRatio).toFixed(2));

            // Standard 12% Service Charge for Dine-In if not provided
            let serviceCharge = 0;
            if (orderData.type === 'DINE_IN') {
                const serviceRate = branchRecord?.serviceCharge || 0.12;
                serviceCharge = orderData.serviceCharge !== undefined ? orderData.serviceCharge : parseFloat((netAmount * serviceRate).toFixed(2));
            }

            const total = netAmount + tax + serviceCharge + (orderData.deliveryFee || 0);

            const customerPhone = String(orderData.customerPhone || '').trim();
            if (orderData.customerId || customerPhone) {
                let crmCustomer: { id: string } | undefined;
                if (orderData.customerId) {
const [customerById] = await tx
                        .select({ id: customers.id })
                        .top(1)
                        .from(customers)
                        .where(eq(customers.id, orderData.customerId));
                    crmCustomer = customerById;
                }

                if (!crmCustomer && customerPhone) {
const [customerByPhone] = await tx
                        .select({ id: customers.id })
                        .top(1)
                        .from(customers)
                        .where(eq(customers.phone, customerPhone));
                    crmCustomer = customerByPhone;
                }

                if (!crmCustomer && customerPhone) {
                    const customerIdToInsert = orderData.customerId && !isClientOnlyReference(orderData.customerId)
                        ? orderData.customerId
                        : `CUS-${Date.now()}-${nanoid(4)}`;
                    const [existingCustomerById] = await tx.select({ id: customers.id }).top(1).from(customers).where(eq(customers.id, customerIdToInsert));
                    if (!existingCustomerById) {
                        await tx.insert(customers).values({
                            id: customerIdToInsert,
                            name: orderData.customerName || customerPhone,
                            phone: customerPhone,
                            address: orderData.deliveryAddress,
                            lat: orderData.deliveryLat,
                            lng: orderData.deliveryLng,
                            addressLabel: orderData.deliveryAddressLabel,
                            visits: 0,
                            totalSpent: 0,
                            loyaltyTier: 'Bronze',
                            loyaltyPoints: 0,
                            source: orderData.source || 'pos',
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        });
                    }

const [createdOrExistingCustomer] = await tx
                        .select({ id: customers.id })
                        .top(1)
                        .from(customers)
                        .where(eq(customers.phone, customerPhone));
                    crmCustomer = createdOrExistingCustomer;
                }

                if (!crmCustomer && orderData.customerId) {
                    throw appError(
                        400,
                        'INVALID_CUSTOMER_REFERENCE',
                        'Customer reference is missing and no phone number was provided to create it.',
                    );
                }

                if (crmCustomer) {
                    orderData.customerId = crmCustomer.id;
                    await tx.update(customers)
                        .set({
                            name: orderData.customerName || undefined,
                            phone: customerPhone || undefined,
                            address: orderData.deliveryAddress || undefined,
                            lat: orderData.deliveryLat,
                            lng: orderData.deliveryLng,
                            addressLabel: orderData.deliveryAddressLabel,
                            visits: sql`coalesce(${customers.visits}, 0) + 1`,
                            totalSpent: sql`coalesce(${customers.totalSpent}, 0) + ${total}`,
                            updatedAt: new Date(),
                        })
                        .where(eq(customers.id, crmCustomer.id));

                    if (orderData.deliveryAddress) {
                        const [existingAddress] = await tx.select({ id: customerAddresses.id }).top(1).from(customerAddresses).where(and(
                            eq(customerAddresses.customerId, crmCustomer.id),
                            eq(customerAddresses.address, orderData.deliveryAddress),
                        ));
                        if (!existingAddress) {
                            await tx.insert(customerAddresses).values({
                                customerId: crmCustomer.id,
                                label: 'Order Address',
                                address: orderData.deliveryAddress,
                                lat: orderData.deliveryLat,
                                lng: orderData.deliveryLng,
                                isDefault: false,
                                createdAt: new Date(),
                            });
                        }
                    }
                }
            } else {
                orderData.customerId = undefined;
            }

            const orderTimestamp = parseOrderTimestamp(orderData.createdAt) || new Date();
            const activeBusinessDate = branchRecordForOrder.businessDate || orderTimestamp.toISOString().split('T')[0];
            if (!branchRecordForOrder.businessDate) {
                await tx.update(branches)
                    .set({ businessDate: activeBusinessDate, updatedAt: new Date() })
                    .where(eq(branches.id, orderData.branchId));
            }

            const dailyOrderNumber = await allocateDailyOrderNumber(tx, orderData.branchId, activeBusinessDate);

            const [newOrder] = await tx.insert(orders).output().values({
                ...orderData,
                orderNumber: dailyOrderNumber,
                subtotal,
                discount: discountAmount,
                tax,
                tipAmount: orderData.tipAmount || 0,
                serviceCharge: serviceCharge,
                total,
                shiftId: activeShift.id,
                businessDate: activeBusinessDate,
                createdAt: sql`CAST(${orderTimestamp.toISOString()} AS datetime2(3))` as any,
                updatedAt: new Date(),
            });

            // 2. Prefer the kitchen, then fall back to any branch warehouse that
            // can actually fulfil the recipe. Alphabetical type sorting used to
            // pick POINT_OF_SALE first and silently skip stock held in MAIN.
            const branchWarehouses = await tx.select({ id: warehouses.id })
                .from(warehouses)
                .where(eq(warehouses.branchId, newOrder.branchId))
                .orderBy(sql`CASE ${warehouses.type}
                    WHEN 'KITCHEN' THEN 0
                    WHEN 'MAIN' THEN 1
                    WHEN 'POINT_OF_SALE' THEN 2
                    ELSE 3
                END`);

            let cogsCost = 0;

            // 3. Insert Order Items and Deduct Inventory
            for (const item of processedItems) {
                await tx.insert(orderItems).values({
                    orderId: newOrder.id,
                    menuItemId: resolveOrderItemMenuItemId(item),
                    name: item.name,
                    nameAr: item.nameAr || item.name_ar || item.name,
                    price: item.price,
                    quantity: item.quantity,
                    tax: item.tax, // Store calculated tax per line
                    notes: item.notes,
                    seatNumber: item.seatNumber ?? item.seat_number ?? null,
                    course: item.course ?? null,
                    modifiers: item.modifiers,
                });

                if (branchWarehouses.length > 0) {
                    let deductionApplied = false;
                    let lastDeductionError: any = null;
                    let attemptedWarehouseId = branchWarehouses[0].id;

                    for (const candidateWarehouse of branchWarehouses) {
                        attemptedWarehouseId = candidateWarehouse.id;
                        try {
                            const deduction = await inventoryService.deductIngredients(
                                tx,
                                resolveOrderItemMenuItemId(item) || item.id,
                                item.quantity,
                                candidateWarehouse.id,
                                newOrder.id,
                                newOrder.callCenterAgentId || 'system'
                            );
                            cogsCost += Number(Array.isArray(deduction) ? 0 : deduction?.totalCost || 0);
                            deductionApplied = true;
                            break;
                        } catch (deductionError: any) {
                            const message = String(deductionError?.message || '');
                            if (!INVENTORY_DEDUCTION_WARNING_PATTERN.test(message)) throw deductionError;
                            lastDeductionError = deductionError;
                        }
                    }

                    if (!deductionApplied && lastDeductionError) {
                        const message = String(lastDeductionError.message || '');
                        if (!ALLOW_SALE_WITH_INSUFFICIENT_STOCK) {
                            throw appError(409, 'INSUFFICIENT_INVENTORY', 'Order cannot be saved because recipe stock is not enough.', {
                                orderId: newOrder.id,
                                menuItemId: resolveOrderItemMenuItemId(item) || item.id,
                                warehouseId: attemptedWarehouseId,
                                reason: message,
                            });
                        }
                        inventoryWarnings.push({
                            code: 'INSUFFICIENT_INVENTORY',
                            menuItemId: resolveOrderItemMenuItemId(item) || item.id,
                            warehouseId: attemptedWarehouseId,
                            reason: message,
                        });
                        console.warn('[ORDER] inventory deduction skipped', {
                            orderId: newOrder.id,
                            menuItemId: resolveOrderItemMenuItemId(item) || item.id,
                            warehouseId: attemptedWarehouseId,
                            reason: message,
                        });
                    }
                }
            }

            // 4. Status History
            try {
                await tx.insert(orderStatusHistory).values({
                    orderId: newOrder.id,
                    status: newOrder.status || 'PENDING',
                    createdAt: new Date(),
                });
            } catch (error) {
                console.warn('Order status history insert failed', error);
            }

            // 5. Payments (if provided)
            const rawPayments = Array.isArray(bodyData.payments) ? bodyData.payments : [];
            const fallbackPayment = (orderData.paymentMethod && (orderData.paidAmount || orderData.total))
                ? [{ method: orderData.paymentMethod, amount: orderData.paidAmount || orderData.total }]
                : [];
            const paymentsToInsert = rawPayments.length > 0 ? rawPayments : fallbackPayment;

            for (let idx = 0; idx < paymentsToInsert.length; idx += 1) {
                const p = paymentsToInsert[idx];
                if (!p?.method || p?.amount === undefined) continue;
                const paymentId = p.id || p.paymentId || `PAY-${newOrder.id}-${idx + 1}`;
                const [existingPayment] = await tx.select().top(1).from(payments).where(eq(payments.id, paymentId));
                if (existingPayment) continue;
                await tx.insert(payments).values({
                    id: paymentId,
                    orderId: newOrder.id,
                    method: p.method,
                    amount: Number(p.amount),
                    referenceNumber: p.referenceNumber || p.reference_number,
                    status: 'COMPLETED',
                    processedBy: userId || orderData.callCenterAgentId || 'system',
                    createdAt: new Date(),
                });
            }

            const paidNow = Boolean(orderData.isPaid) || paymentsToInsert.length > 0;

            // Auto-release table when DINE_IN order is paid/completed
            if (paidNow && newOrder.type === 'DINE_IN' && newOrder.tableId) {
                await tx.update(tables)
                    .set({ status: 'AVAILABLE', currentOrderId: null, lockedByUserId: null, updatedAt: new Date() })
                    .where(eq(tables.id, newOrder.tableId));
            }

            // Let's re-fetch the affected stocks to ensure we have the absolute latest for emission
            const stocks = await tx.select({
                itemId: inventoryStock.itemId,
                warehouseId: inventoryStock.warehouseId,
                quantity: inventoryStock.quantity
            })
            .from(inventoryStock)
            .innerJoin(warehouses, eq(inventoryStock.warehouseId, warehouses.id))
            .where(eq(warehouses.branchId, newOrder.branchId));

            return { savedOrder: newOrder, paidNow, finalStocks: stocks, cogsCost };
        });

        try {
            const branchId = savedOrder.branchId;
            if (branchId) {
                emitBranchEvent(branchId, 'order:created', savedOrder);

                // Item 7: Realtime Stock Patches
                if (Array.isArray(finalStocks)) {
                    for (const s of finalStocks) {
                        emitBranchEvent(branchId, 'stock:updated', {
                            itemId: s.itemId,
                            warehouseId: s.warehouseId,
                            quantity: Number(s.quantity || 0),
                            type: 'SALE'
                        });
                    }
                }

                // Keep general event for legacy/simpler listeners
                emitBranchEvent(branchId, 'stock:updated', {
                    branchId: savedOrder.branchId,
                    orderId: savedOrder.id
                });
                if (paidNow && savedOrder.type === 'DINE_IN' && savedOrder.tableId) {
                    emitBranchEvent(branchId, 'table:status', { id: savedOrder.tableId, status: 'AVAILABLE', currentOrderId: null, lockedByUserId: null });
                }
            }
        } catch {
            // socket is optional
        }

        // Analytics & Loyalty hooks (non-blocking)
        if (['COMPLETED', 'DELIVERED'].includes(String(savedOrder.status))) {
            analyticsService.recordOrderImpact(savedOrder.id).catch(() => {});
            if (savedOrder.customerId) {
                loyaltyService.awardPoints(savedOrder.customerId, Number(savedOrder.total || 0), savedOrder.branchId || undefined).catch(() => {});
            }
        }

        // ================== KDS DISPATCHING LOGIC ==================
        // Dine-in must reach KDS before the create response so the POS follow-up
        // dispatch is an idempotent confirmation, not a race that can lose the ticket.
        const isPosOrder = String(orderData.source || '').toLowerCase() === 'pos';
        if (['DINE_IN', 'KIOSK'].includes(String(savedOrder.type))) {
            await kdsController.dispatchToKitchen(savedOrder.branchId, savedOrder.id).catch((error) => {
                console.error('[Orders] KDS auto-dispatch failed', savedOrder.id, error);
                inventoryWarnings.push({ code: 'KDS_DISPATCH_FAILED', orderId: savedOrder.id });
            });
        } else if (paidNow && !isPosOrder) {
            kdsController.dispatchToKitchen(savedOrder.branchId, savedOrder.id).catch(() => {});
        }
        // POS prints the cashier receipt through the client orchestrator so its
        // selected template and station apply. Other order sources need the
        // server queue as their printing fallback.
        if (shouldEnqueueServerCashierReceipt(paidNow, savedOrder.source)) {
            enqueueCashierReceiptPrint(savedOrder).catch(() => {});
        }
        // ============================================================

        // Webhook: notify external integrations (non-blocking)
        webhookService.dispatch('order.created', {
            id: savedOrder.id,
            orderNumber: savedOrder.orderNumber,
            type: savedOrder.type,
            status: savedOrder.status,
            total: savedOrder.total,
            branchId: savedOrder.branchId,
            customerId: savedOrder.customerId,
            createdAt: savedOrder.createdAt,
        }, savedOrder.branchId || undefined).catch(() => {});

        whatsappAutomationService.onOrderCreated(savedOrder).catch(() => {});

        // Finance posting stays non-blocking, but sale must be visible before COGS for the same order.
        void (async () => {
            await postPosOrderEntry({
                orderId: savedOrder.id,
                amount: Number(savedOrder.total || 0),
                branchId: savedOrder.branchId,
                userId: userId || savedOrder.callCenterAgentId || 'system',
            });

            await postCogsForOrderEntry({
                orderId: savedOrder.id,
                amount: Number(cogsCost || 0),
                branchId: savedOrder.branchId,
                userId: userId || savedOrder.callCenterAgentId || 'system',
            });
        })().catch(() => {
            // Finance exceptions capture posting failures without blocking customer flow
        });

        if (paidNow) {
            setTimeout(() => {
                submitOrderToFiscal(savedOrder.id).catch(() => {
                    // background submission; errors are stored in fiscal logs
                });
            }, 0);
        }

        if (idempotencyKey) {
            await db
                .update(idempotencyKeys)
                .set({
                    status: 'COMPLETED',
                    responseCode: 201,
                    resourceId: savedOrder.id,
                    responseBody: toSettingValue(savedOrder),
                    updatedAt: new Date(),
                    expiresAt: idempotencyExpiry,
                })
                .where(
                    and(
                        eq(idempotencyKeys.key, idempotencyKey),
                        eq(idempotencyKeys.scope, ORDER_CREATE_SCOPE),
                    ),
                );
        }

        res.status(201).json(inventoryWarnings.length > 0 ? { ...savedOrder, warnings: inventoryWarnings } : savedOrder);
    } catch (error: any) {
        console.error('CRITICAL ORDER ERROR:', error);
        await clearIdempotencyClaim();
        if (error?.status && error?.code) {
            return res.status(error.status).json({
                error: error.code,
                code: error.code,
                message: error.message,
                details: error.details,
            });
        }

        const formatted = formatCreateOrderError(error);
        if (formatted) {
            return res.status(formatted.status).json(formatted.body);
        }

        res.status(500).json({
            error: 'ORDER_CREATE_FAILED',
            code: 'ORDER_CREATE_FAILED',
            message: 'Order could not be saved. Please refresh and retry.',
        });
    }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
    const idempotencyKey = getIdempotencyKeyFromRequest(req);
    const idempotencyHash = idempotencyKey
        ? buildRequestHash(sanitizeIdempotencyPayload({
            orderId: getStringParam((req.params as any).id),
            ...req.body,
        }))
        : undefined;
    const idempotencyExpiry = new Date(Date.now() + IDEMPOTENCY_TTL_MS);

    const replayIdempotentResponse = async () => {
        if (!idempotencyKey || !idempotencyHash) return null;
        const [existingClaim] = await db
            .select()
            .top(1)
            .from(idempotencyKeys)
            .where(
                and(
                    eq(idempotencyKeys.key, idempotencyKey),
                    eq(idempotencyKeys.scope, ORDER_STATUS_UPDATE_SCOPE),
                    gt(idempotencyKeys.expiresAt, new Date()),
                ),
            );

        if (!existingClaim) return null;
        if (existingClaim.requestHash !== idempotencyHash) {
            return res.status(409).json({
                error: 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT',
                message: 'This Idempotency-Key was used with a different payload.',
            });
        }

        if (existingClaim.responseBody) {
            return res.status(existingClaim.responseCode || 200).json(parseSettingJson(existingClaim.responseBody, existingClaim.responseBody));
        }

        if (existingClaim.resourceId) {
            const [existingOrder] = await db.select().top(1).from(orders).where(eq(orders.id, existingClaim.resourceId));
            if (existingOrder) {
                return res.status(existingClaim.responseCode || 200).json(existingOrder);
            }
        }

        return res.status(409).json({
            error: 'IDEMPOTENCY_KEY_IN_PROGRESS',
            message: 'Request with this Idempotency-Key is still being processed.',
        });
    };

    const clearIdempotencyClaim = async () => {
        if (!idempotencyKey) return;
        await db.delete(idempotencyKeys).where(
            and(
                eq(idempotencyKeys.key, idempotencyKey),
                eq(idempotencyKeys.scope, ORDER_STATUS_UPDATE_SCOPE),
            ),
        );
    };

    try {
        const { status, changed_by, notes, approval_id } = req.body;
        const expectedUpdatedAtRaw = req.body?.expected_updated_at || req.body?.expectedUpdatedAt;
        const nextStatus = String(status || '').toUpperCase();
        const orderId = getStringParam((req.params as any).id);
        if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });

        if (idempotencyKey && idempotencyHash) {
            const replay = await replayIdempotentResponse();
            if (replay) return replay;

            const [existingClaim] = await db
                .select({ id: idempotencyKeys.id })
                .top(1)
                .from(idempotencyKeys)
                .where(and(eq(idempotencyKeys.key, idempotencyKey), eq(idempotencyKeys.scope, ORDER_STATUS_UPDATE_SCOPE)));
            if (!existingClaim) {
                await db.insert(idempotencyKeys).values({
                    key: idempotencyKey,
                    scope: ORDER_STATUS_UPDATE_SCOPE,
                    requestHash: idempotencyHash,
                    status: 'IN_PROGRESS',
                    expiresAt: idempotencyExpiry,
                    updatedAt: new Date(),
                });
            }

            if (existingClaim) {
                const replay = await replayIdempotentResponse();
                if (replay) return replay;
            }
        }

        const result = await transitionOrderStatus({
            orderId,
            nextStatus,
            notes,
            changedBy: changed_by || req.user?.id,
            expectedUpdatedAt: expectedUpdatedAtRaw,
            approvalId: approval_id,
            user: {
                role: req.user?.role,
                branchId: req.user?.branchId,
                allowedBranches: req.user?.allowedBranches,
                permissions: req.user?.permissions,
            },
        });

        if (idempotencyKey) {
            await db
                .update(idempotencyKeys)
                .set({
                    status: 'COMPLETED',
                    responseCode: 200,
                    resourceId: result.id,
                    responseBody: toSettingValue(result),
                    updatedAt: new Date(),
                    expiresAt: idempotencyExpiry,
                })
                .where(
                    and(
                        eq(idempotencyKeys.key, idempotencyKey),
                        eq(idempotencyKeys.scope, ORDER_STATUS_UPDATE_SCOPE),
                    ),
                );
        }
        res.json(result);
    } catch (error: any) {
        await clearIdempotencyClaim();
        const statusCode = Number(error?.status) || 500;
        if (statusCode === 409) {
            return res.status(409).json({
                error: error.message,
                currentUpdatedAt: error.currentUpdatedAt
            });
        }
        if (statusCode === 403 || statusCode === 400) {
            return res.status(statusCode).json({ error: error.message });
        }
        res.status(statusCode).json({ error: error.message });
    }
};

export const updateOrderCustomer = async (req: Request, res: Response) => {
    try {
        const orderId = getStringParam((req.params as any).id);
        if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED', code: 'ORDER_ID_REQUIRED' });

        const body = req.body || {};
        const phone = String(body.phone || body.customerPhone || '').trim();
        const name = String(body.name || body.customerName || '').trim();
        if (!phone || !name) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                code: 'VALIDATION_ERROR',
                message: 'Customer name and phone are required.',
            });
        }

        const updated = await db.transaction(async (tx) => {
const [currentOrder] = await tx.select().top(1).from(orders).where(eq(orders.id, orderId));
            if (!currentOrder) throw appError(404, 'ORDER_NOT_FOUND', 'Order not found.');

            const customerId = String(body.id || body.customerId || currentOrder.customerId || '').trim();
            let crmCustomer: any;
            if (customerId) {
[crmCustomer] = await tx.select().top(1).from(customers).where(eq(customers.id, customerId));
            }
            if (!crmCustomer) {
                [crmCustomer] = await tx.select().top(1).from(customers).where(eq(customers.phone, phone));
            }

            const zoneId = body.zoneId || body.zone_id ? Number(body.zoneId || body.zone_id) : undefined;
            const address = body.address || body.deliveryAddress || '';
            const lat = body.lat ?? body.deliveryLat ?? body.delivery_lat ?? body.latitude;
            const lng = body.lng ?? body.deliveryLng ?? body.delivery_lng ?? body.longitude;
            const addressLabel = body.addressLabel || body.address_label || body.deliveryAddressLabel || body.delivery_address_label;
            if (!crmCustomer) {
                [crmCustomer] = await tx.insert(customers).output().values({
                    id: customerId || `CUS-${Date.now()}-${nanoid(4)}`,
                    name,
                    phone,
                    email: body.email,
                    address,
                    lat,
                    lng,
                    addressLabel,
                    zoneId,
                    area: body.area,
                    building: body.building,
                    floor: body.floor,
                    apartment: body.apartment,
                    landmark: body.landmark,
                    notes: body.notes,
                    visits: 0,
                    totalSpent: 0,
                    loyaltyTier: body.loyaltyTier || body.loyalty_tier || 'Bronze',
                    loyaltyPoints: body.loyaltyPoints || body.loyalty_points || 0,
                    source: body.source || currentOrder.source || 'pos',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

            } else {
                [crmCustomer] = await tx.update(customers)
                    .set({
                        name,
                        phone,
                        email: body.email,
                        address,
                        lat,
                        lng,
                        addressLabel,
                        zoneId,
                        area: body.area,
                        building: body.building,
                        floor: body.floor,
                        apartment: body.apartment,
                        landmark: body.landmark,
                        notes: body.notes,
                        updatedAt: new Date(),
                    })
                    .output()
                    .where(eq(customers.id, crmCustomer.id));
            }

            if (address) {
                const [existingAddress] = await tx.select({ id: customerAddresses.id }).top(1).from(customerAddresses).where(and(
                    eq(customerAddresses.customerId, crmCustomer.id),
                    eq(customerAddresses.address, address),
                ));
                if (!existingAddress) {
                    await tx.insert(customerAddresses).values({
                        customerId: crmCustomer.id,
                        label: addressLabel || 'Order Address',
                        address,
                        lat,
                        lng,
                        zoneId,
                        area: body.area,
                        building: body.building,
                        floor: body.floor,
                        apartment: body.apartment,
                        landmark: body.landmark,
                        isDefault: false,
                        createdAt: new Date(),
                    });
                }
            }

            const [updatedOrder] = await tx.update(orders)
                .set({
                    customerId: crmCustomer.id,
                    customerName: crmCustomer.name,
                    customerPhone: crmCustomer.phone,
                    deliveryAddress: crmCustomer.address || address || currentOrder.deliveryAddress,
                    deliveryLat: crmCustomer.lat ?? lat ?? currentOrder.deliveryLat,
                    deliveryLng: crmCustomer.lng ?? lng ?? currentOrder.deliveryLng,
                    deliveryAddressLabel: crmCustomer.addressLabel || addressLabel || currentOrder.deliveryAddressLabel,
                    updatedAt: new Date(),
                })
                .output()
                .where(eq(orders.id, orderId));

            return { order: updatedOrder, customer: crmCustomer };
        });

        emitBranchEvent(updated.order.branchId, 'order:updated', updated.order);
        res.json(updated);
    } catch (error: any) {
        if (error?.status && error?.code) {
            return res.status(error.status).json({ error: error.code, code: error.code, message: error.message });
        }
        if (error?.code === '23505') {
            return res.status(409).json({
                error: 'DUPLICATE_CUSTOMER',
                code: 'DUPLICATE_CUSTOMER',
                message: 'A customer with this phone already exists.',
            });
        }
        res.status(500).json({
            error: 'ORDER_CUSTOMER_UPDATE_FAILED',
            code: 'ORDER_CUSTOMER_UPDATE_FAILED',
            message: 'Order customer details could not be updated.',
        });
    }
};

// =======================================================
// Check Splitting Logic
// =======================================================
export const splitOrder = async (req: Request, res: Response) => {
    try {
        const { parentOrderId, itemIdsToExtract } = req.body;

        if (!parentOrderId || !Array.isArray(itemIdsToExtract) || itemIdsToExtract.length === 0) {
            return res.status(400).json({ error: 'Valid parentOrderId and itemIdsToExtract are required.' });
        }

        // Fetch Parent Order
        const [parentOrder] = await db.select().from(orders).where(eq(orders.id, parentOrderId));
        if (!parentOrder) return res.status(404).json({ error: 'Parent order not found.' });
        if (parentOrder.isPaid) return res.status(400).json({ error: 'Cannot dynamically split an already paid checkout without full void.' });

        // Fetch Selected Items to Split
        const itemsToSplit = await db.select().from(orderItems).where(inArray(orderItems.id, itemIdsToExtract));
        if (itemsToSplit.length === 0) return res.status(400).json({ error: 'Selected items not found or already moved.' });

        // Calculate Split Totals
        const newSubtotal = itemsToSplit.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
        const subtotalBase = Number(parentOrder.subtotal || 0);
        const taxRate = subtotalBase > 0 ? Number(parentOrder.tax || 0) / subtotalBase : 0;
        const newTax = Number((newSubtotal * taxRate).toFixed(2));
        const newTotal = Number((newSubtotal + newTax).toFixed(2));

        const childOrderId = `ORD-SPLIT-${nanoid(8)}`;

        await db.transaction(async (tx) => {
            // 1. Create Child Order referencing the parent
            await tx.insert(orders).values({
                id: childOrderId,
                parentOrderId: parentOrderId,
                type: parentOrder.type,
                source: parentOrder.source,
                branchId: parentOrder.branchId,
                tableId: parentOrder.tableId, // Stays at same table structurally
                customerId: parentOrder.customerId,
                status: parentOrder.status,
                subtotal: newSubtotal,
                tax: newTax,
                total: newTotal,
                createdAt: parentOrder.createdAt // Preserve original time for accurate SLA!
            });

            // 2. Re-assign item foreign keys
            await tx.update(orderItems)
                .set({ orderId: childOrderId })
                .where(inArray(orderItems.id, itemIdsToExtract));

            // 3. Deduct from Parent Order to prevent double inflation
            await tx.update(orders)
                .set({
                    subtotal: sql`subtotal - ${newSubtotal}`,
                    tax: sql`tax - ${newTax}`,
                    total: sql`total - ${newTotal}`,
                })
                .where(eq(orders.id, parentOrderId));
        });

        res.json({ success: true, parentOrderId, childOrderId });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
