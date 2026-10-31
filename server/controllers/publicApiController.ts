import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db } from '../db';
import { branches, menuCategories, menuItems, orderItems, orders, paymentSessions, payments, settings, tables } from '../../src/db/schema';
import { getPublicApiSandboxOrders } from '../utils/publicApiSandbox';
import { buildPublicMenuItem } from '../utils/publicApiMenuPolicy';
import { isMenuItemAvailableNow } from '../utils/menuAvailabilityPolicy';
import { calculateOrderTotals } from '../../services/orderTotals';
import { normalizeChannel } from '../services/pricingService';
import { parsePublicQuoteLines, resolvePublicItemModifiers, resolvePublicItemSize } from '../utils/publicOrderQuotePolicy';
import { createOrder } from './orderController';
import { parseSettingJson } from '../utils/settingsStore';
import { getPublicBusinessHours } from '../utils/branchHoursPolicy';
import { createIntention } from '../modules/payments/paymobService';
import { ensurePaymentSessionSchema } from '../services/paymentSessionService';
import { decryptPaymentCheckoutUrl, encryptPaymentCheckoutUrl } from '../utils/paymentSessionCrypto';
import { signTrackToken } from '../utils/trackToken';

const loadBranchHours = async (timeZone: string, now = new Date()) => {
    const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, 'businessHours')).limit(1);
    const raw = parseSettingJson(row?.value, {} as Record<string, unknown>);
    return getPublicBusinessHours(raw, now, timeZone);
};

const OPENAPI_DOCUMENT = {
    openapi: '3.0.3',
    info: {
        title: 'RestoFlow Public API',
        version: '1.0.0',
        description: 'Branch-scoped integration API. Order writes are idempotent and payment details are never accepted from this endpoint.',
    },
    servers: [{ url: '/api/v1' }],
    security: [{ RestoFlowApiKey: [] }],
    paths: {
        '/oauth/token': {
            post: {
                summary: 'Issue or rotate OAuth 2.0 tokens',
                security: [],
                requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: { grant_type: { type: 'string', enum: ['authorization_code', 'client_credentials', 'refresh_token'] }, client_id: { type: 'string' }, client_secret: { type: 'string', format: 'password' }, code: { type: 'string' }, redirect_uri: { type: 'string', format: 'uri' }, code_verifier: { type: 'string' }, refresh_token: { type: 'string', format: 'password' }, scope: { type: 'string' } } } } } },
                responses: { '200': { description: 'Bearer access token and one-time refresh token' }, '400': { description: 'Invalid grant, refresh token or scope' }, '401': { description: 'Invalid client' } },
            },
        },
        '/oauth/authorize': {
            get: {
                summary: 'Authorize a managed public API client with S256 PKCE',
                security: [{ RestoFlowUserBearer: [] }],
                parameters: [
                    { name: 'response_type', in: 'query', required: true, schema: { type: 'string', enum: ['code'] } },
                    { name: 'client_id', in: 'query', required: true, schema: { type: 'string' } },
                    { name: 'redirect_uri', in: 'query', required: true, schema: { type: 'string', format: 'uri' } },
                    { name: 'scope', in: 'query', required: true, schema: { type: 'string' } },
                    { name: 'state', in: 'query', required: true, schema: { type: 'string', maxLength: 512 } },
                    { name: 'code_challenge', in: 'query', required: true, schema: { type: 'string' } },
                    { name: 'code_challenge_method', in: 'query', required: true, schema: { type: 'string', enum: ['S256'] } },
                    { name: 'consent', in: 'query', required: false, schema: { type: 'string', enum: ['approve'] } },
                ],
                responses: { '200': { description: 'Consent summary when consent=approve is absent' }, '302': { description: 'Redirect with one-time authorization code' }, '400': { description: 'Invalid client, redirect, scope or PKCE request' }, '401': { description: 'Authenticated user required' } },
            },
        },
        '/branches/{branchId}/orders': {
            get: {
                summary: 'List branch orders',
                parameters: [
                    { name: 'branchId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
                    { name: 'cursor', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
                ],
                responses: { '200': { description: 'Branch-scoped orders' }, '401': { description: 'Invalid API key' }, '403': { description: 'Scope or branch forbidden' } },
            },
            post: {
                summary: 'Create an unpaid online order',
                parameters: [
                    { name: 'branchId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 200 } },
                ],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['type', 'items'], properties: {
                    type: { type: 'string', enum: ['DELIVERY', 'TAKEAWAY', 'PICKUP'] },
                    customerName: { type: 'string', maxLength: 160 }, customerPhone: { type: 'string', maxLength: 50 },
                    deliveryAddress: { type: 'string', maxLength: 500 }, deliveryFee: { type: 'number', minimum: 0 }, notes: { type: 'string', maxLength: 1000 },
                    items: { type: 'array', items: { type: 'object', required: ['menuItemId', 'quantity'], properties: { menuItemId: { type: 'string' }, sizeId: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 99 }, modifiers: { type: 'array', items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } } } },
                } } } } },
                responses: { '201': { description: 'Created unpaid order' }, '400': { description: 'Invalid order input' }, '401': { description: 'Invalid API key' }, '403': { description: 'Scope or branch forbidden' }, '409': { description: 'Idempotency conflict or inventory conflict' }, '422': { description: 'One or more menu items are unavailable' } },
            },
        },
        '/branches/{branchId}/orders/{orderId}': {
            get: {
                summary: 'Read one privacy-safe branch order projection',
                parameters: [
                    { name: 'branchId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'orderId', in: 'path', required: true, schema: { type: 'string' } },
                ],
                responses: { '200': { description: 'Order status, totals, items and optional tracking URL' }, '401': { description: 'Invalid API key' }, '403': { description: 'Scope or branch forbidden' }, '404': { description: 'Order not found' } },
            },
        },
        '/branches/{branchId}/orders/{orderId}/checkout': {
            post: {
                summary: 'Create or replay a hosted Paymob checkout for an online order',
                parameters: [
                    { name: 'branchId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'orderId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 200 } },
                ],
                requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { method: { type: 'string', enum: ['CARD', 'INSTAPAY'], default: 'CARD' } } } } } },
                responses: { '201': { description: 'Hosted checkout created' }, '200': { description: 'Idempotent replay of the same checkout' }, '403': { description: 'Order is outside the API branch or not an online order' }, '409': { description: 'Payment already started or idempotency conflict' }, '503': { description: 'Payment provider unavailable' } },
            },
        },
        '/branches/{branchId}/menu': {
            get: {
                summary: 'Read the branch online menu',
                parameters: [
                    { name: 'branchId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'channel', in: 'query', required: false, schema: { type: 'string', enum: ['DELIVERY', 'TAKEAWAY', 'DINE_IN'], default: 'DELIVERY' } },
                ],
                responses: { '200': { description: 'Published, available branch menu with channel pricing' }, '401': { description: 'Invalid API key' }, '403': { description: 'Scope or branch forbidden' }, '404': { description: 'Branch not found' } },
            },
        },
        '/branches/{branchId}/hours': {
            get: {
                summary: 'Read branch operating hours and current availability',
                parameters: [{ name: 'branchId', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'Branch hours in the branch timezone' }, '401': { description: 'Invalid API key' }, '403': { description: 'Scope or branch forbidden' }, '404': { description: 'Branch not found' } },
            },
        },
        '/branches/{branchId}/orders/quote': {
            post: {
                summary: 'Quote an online order using authoritative branch pricing',
                parameters: [{ name: 'branchId', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['items'], properties: { channel: { type: 'string', enum: ['DELIVERY', 'TAKEAWAY', 'DINE_IN'] }, deliveryFee: { type: 'number', minimum: 0 }, items: { type: 'array', items: { type: 'object', required: ['menuItemId', 'quantity'], properties: { menuItemId: { type: 'string' }, sizeId: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 99 }, modifiers: { type: 'array', items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } } } } } } } } },
                responses: { '200': { description: 'Authoritative order quote' }, '400': { description: 'Invalid quote input' }, '401': { description: 'Invalid API key' }, '403': { description: 'Scope or branch forbidden' }, '422': { description: 'One or more menu items are unavailable' } },
            },
        },
        '/sandbox/orders': {
            get: {
                summary: 'List synthetic sandbox orders',
                security: [{ RestoFlowApiKey: [] }],
                responses: { '200': { description: 'Deterministic synthetic orders; never production data' }, '401': { description: 'Invalid API key' }, '403': { description: 'sandbox:read scope required' } },
            },
        },
        '/webhooks': {
            get: {
                summary: 'List webhooks owned by the API key',
                security: [{ RestoFlowApiKey: [] }],
                responses: { '200': { description: 'Owned webhook metadata' }, '403': { description: 'webhooks:read scope required' } },
            },
            post: {
                summary: 'Create a signed webhook subscription',
                security: [{ RestoFlowApiKey: [] }],
                responses: { '201': { description: 'Created webhook; signing secret is returned once' }, '403': { description: 'webhooks:manage scope required' } },
            },
        },
        '/webhooks/{id}': {
            delete: {
                summary: 'Delete an owned webhook subscription',
                security: [{ RestoFlowApiKey: [] }],
                responses: { '200': { description: 'Deleted' }, '404': { description: 'Webhook not found' } },
            },
        },
        '/webhooks/{id}/deliveries': {
            get: {
                summary: 'List sanitized delivery history for an owned webhook',
                security: [{ RestoFlowApiKey: [] }],
                responses: { '200': { description: 'Delivery metadata' }, '404': { description: 'Webhook not found' } },
            },
        },
    },
    components: {
        securitySchemes: {
            RestoFlowApiKey: { type: 'apiKey', in: 'header', name: 'X-RestoFlow-API-Key' },
            RestoFlowUserBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
    },
} as const;

export const getPublicApiOpenApi = (_req: Request, res: Response) => res.json(OPENAPI_DOCUMENT);

export const listPublicApiSandboxOrders = (_req: Request, res: Response) => {
    res.setHeader('X-RestoFlow-API-Sandbox', 'true');
    return res.json(getPublicApiSandboxOrders());
};

export const listPublicApiOrders = async (req: Request, res: Response) => {
    const branchId = String(req.params.branchId || '').trim();
    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 50;
    const cursorText = String(req.query.cursor || '').trim();
    const cursor = cursorText ? new Date(cursorText) : undefined;
    if (cursorText && (!cursor || Number.isNaN(cursor.getTime()))) {
        return res.status(400).json({ code: 'PUBLIC_API_CURSOR_INVALID', message: 'cursor must be an ISO date-time.' });
    }

    const rows = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        branchId: orders.branchId,
        type: orders.type,
        source: orders.source,
        status: orders.status,
        subtotal: orders.subtotal,
        discount: orders.discount,
        tax: orders.tax,
        deliveryFee: orders.deliveryFee,
        total: orders.total,
        isPaid: orders.isPaid,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
    })
        .from(orders)
        .where(and(eq(orders.branchId, branchId), cursor ? lt(orders.createdAt, cursor) : undefined))
        .orderBy(desc(orders.createdAt))
        .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);
    const nextCursor = hasMore && data[data.length - 1]?.createdAt
        ? new Date(data[data.length - 1].createdAt as any).toISOString()
        : null;
    return res.json({ data, paging: { limit, nextCursor } });
};

export const getPublicApiOrder = async (req: Request, res: Response) => {
    const branchId = String(req.params.branchId || '').trim();
    const orderId = String(req.params.orderId || '').trim();
    const [order] = await db.select({
        id: orders.id, orderNumber: orders.orderNumber, branchId: orders.branchId, type: orders.type,
        source: orders.source, status: orders.status, subtotal: orders.subtotal, discount: orders.discount,
        tax: orders.tax, deliveryFee: orders.deliveryFee, serviceCharge: orders.serviceCharge, total: orders.total,
        isPaid: orders.isPaid, createdAt: orders.createdAt, updatedAt: orders.updatedAt,
    }).from(orders).where(and(eq(orders.id, orderId), eq(orders.branchId, branchId))).limit(1);
    if (!order) return res.status(404).json({ code: 'PUBLIC_API_ORDER_NOT_FOUND', message: 'Order was not found.' });
    const items = await db.select({ name: orderItems.name, nameAr: orderItems.nameAr, quantity: orderItems.quantity, price: orderItems.price })
        .from(orderItems).where(eq(orderItems.orderId, orderId));
    const token = signTrackToken(orderId);
    const base = String(process.env.PUBLIC_TRACKING_URL || process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    return res.json({
        order: {
            ...order,
            items: items.map(item => ({ name: item.nameAr || item.name, quantity: Number(item.quantity || 0), unitPrice: Number(item.price || 0) })),
        },
        trackingUrl: token ? `${base}/t/${encodeURIComponent(orderId)}?t=${encodeURIComponent(token)}` : null,
    });
};

export const getPublicApiMenu = async (req: Request, res: Response) => {
    const branchId = String(req.params.branchId || '').trim();
    const channel = req.publicQrTableId ? 'DINE_IN' : String(req.query.channel || 'DELIVERY').toUpperCase();
    const [branch] = await db.select({
        id: branches.id, name: branches.name, nameAr: branches.nameAr, currency: branches.currency, timezone: branches.timezone,
        taxRate: branches.taxRate, serviceCharge: branches.serviceCharge, isActive: branches.isActive,
    }).from(branches).where(eq(branches.id, branchId)).limit(1);
    if (!branch) return res.status(404).json({ code: 'PUBLIC_API_BRANCH_NOT_FOUND', message: 'Branch was not found.' });
    if (branch.isActive === false) return res.status(409).json({ code: 'PUBLIC_API_BRANCH_INACTIVE', message: 'Branch is not accepting online orders.' });
    const branchHours = await loadBranchHours(String(branch.timezone || 'Africa/Cairo'));

    const [categories, items] = await Promise.all([
        db.select({ id: menuCategories.id, name: menuCategories.name, nameAr: menuCategories.nameAr, description: menuCategories.description, image: menuCategories.image, sortOrder: menuCategories.sortOrder })
            .from(menuCategories)
            .where(and(eq(menuCategories.isActive, true), isNull(menuCategories.deletedAt)))
            .orderBy(menuCategories.sortOrder),
        db.select({
            id: menuItems.id, categoryId: menuItems.categoryId, name: menuItems.name, nameAr: menuItems.nameAr,
            description: menuItems.description, descriptionAr: menuItems.descriptionAr, price: menuItems.price,
            branchPricing: menuItems.branchPricing, image: menuItems.image, sizes: menuItems.sizes,
            modifierGroups: menuItems.modifierGroups, preparationTime: menuItems.preparationTime,
            isPopular: menuItems.isPopular, isFeatured: menuItems.isFeatured, sortOrder: menuItems.sortOrder,
            availableFrom: menuItems.availableFrom, availableTo: menuItems.availableTo, availableDays: menuItems.availableDays,
            status: menuItems.status, isAvailable: menuItems.isAvailable, deletedAt: menuItems.deletedAt,
        }).from(menuItems).where(and(eq(menuItems.isAvailable, true), eq(menuItems.status, 'published'), isNull(menuItems.deletedAt))).orderBy(menuItems.sortOrder),
    ]);
    const activeCategoryIds = new Set(categories.map(category => category.id));
    const publicItems = items
        .filter(item => item.categoryId && activeCategoryIds.has(item.categoryId))
        .filter(item => isMenuItemAvailableNow(item, new Date(), String(branch.timezone || 'Africa/Cairo')))
        .map(item => buildPublicMenuItem(item, branchId, channel));
    return res.json({
        branch: { id: branch.id, name: branch.name, nameAr: branch.nameAr, currency: branch.currency, taxRate: branch.taxRate, serviceCharge: branch.serviceCharge, channel, isOpen: branchHours.isOpen, timezone: branchHours.timezone, hours: branchHours.hours },
        categories: categories.filter(category => publicItems.some(item => item.categoryId === category.id)),
        items: publicItems,
    });
};

export const getPublicApiBranchHours = async (req: Request, res: Response) => {
    const branchId = String(req.params.branchId || '').trim();
    const [branch] = await db.select({ id: branches.id, name: branches.name, nameAr: branches.nameAr, timezone: branches.timezone, isActive: branches.isActive })
        .from(branches).where(eq(branches.id, branchId)).limit(1);
    if (!branch) return res.status(404).json({ code: 'PUBLIC_API_BRANCH_NOT_FOUND', message: 'Branch was not found.' });
    const branchHours = await loadBranchHours(String(branch.timezone || 'Africa/Cairo'));
    return res.json({ branch: { id: branch.id, name: branch.name, nameAr: branch.nameAr, isActive: branch.isActive !== false }, ...branchHours });
};

export const quotePublicApiOrder = async (req: Request, res: Response) => {
    const branchId = String(req.params.branchId || '').trim();
    const body = req.body || {};
    const parsedLines = parsePublicQuoteLines(body.items);
    if (!parsedLines.ok) {
        const code = 'code' in parsedLines ? parsedLines.code : 'PUBLIC_API_QUOTE_ITEMS_INVALID';
        return res.status(400).json({ code, message: 'Quote items are invalid.' });
    }
    const channel = normalizeChannel(body.channel) || 'DELIVERY';
    const deliveryFee = Number(body.deliveryFee || 0);
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0 || deliveryFee > 10000) return res.status(400).json({ code: 'PUBLIC_API_QUOTE_DELIVERY_FEE_INVALID', message: 'deliveryFee is invalid.' });

    const requested = parsedLines.lines;

    const [branch] = await db.select({ currency: branches.currency, taxRate: branches.taxRate, serviceCharge: branches.serviceCharge, timezone: branches.timezone, isActive: branches.isActive }).from(branches).where(eq(branches.id, branchId)).limit(1);
    if (!branch) return res.status(404).json({ code: 'PUBLIC_API_BRANCH_NOT_FOUND', message: 'Branch was not found.' });
    if (branch.isActive === false) return res.status(409).json({ code: 'PUBLIC_API_BRANCH_INACTIVE', message: 'Branch is not accepting online orders.' });
    const branchHours = await loadBranchHours(String(branch.timezone || 'Africa/Cairo'));
    if (!branchHours.isOpen) return res.status(409).json({ code: 'PUBLIC_API_BRANCH_CLOSED', message: 'Branch is currently outside its operating hours.', hours: branchHours.hours, timezone: branchHours.timezone });

    const itemIds: string[] = Array.from(new Set(requested.map(line => line.menuItemId)));
    const itemRows = await db.select({
        id: menuItems.id, categoryId: menuItems.categoryId, name: menuItems.name, nameAr: menuItems.nameAr,
        price: menuItems.price, branchPricing: menuItems.branchPricing, isAvailable: menuItems.isAvailable,
        status: menuItems.status, deletedAt: menuItems.deletedAt, availableFrom: menuItems.availableFrom,
        availableTo: menuItems.availableTo, availableDays: menuItems.availableDays, image: menuItems.image,
        sizes: menuItems.sizes, modifierGroups: menuItems.modifierGroups, preparationTime: menuItems.preparationTime,
    }).from(menuItems).where(inArray(menuItems.id, itemIds));
    const byId = new Map(itemRows.map(item => [item.id, item]));
    const rejected: Array<{ menuItemId: string; code: string }> = [];
    const lines: Array<{ menuItemId: string; name: string; quantity: number; sizeId: string; unitPrice: number; modifiers: any[] }> = [];
    const quoteItems: any[] = [];
    for (const line of requested) {
        const item = byId.get(line.menuItemId);
        if (!item) { rejected.push({ menuItemId: line.menuItemId, code: 'MENU_ITEM_NOT_FOUND' }); continue; }
        if (!isMenuItemAvailableNow(item, new Date(), String(branch.timezone || 'Africa/Cairo'))) { rejected.push({ menuItemId: line.menuItemId, code: 'MENU_ITEM_UNAVAILABLE' }); continue; }
        const resolvedSize = resolvePublicItemSize(item, line.sizeId);
        if (!resolvedSize.ok) { rejected.push({ menuItemId: line.menuItemId, code: resolvedSize.code }); continue; }
        const resolvedModifiers = resolvePublicItemModifiers(item, line.modifiers);
        if (!resolvedModifiers.ok) { rejected.push({ menuItemId: line.menuItemId, code: resolvedModifiers.code }); continue; }
        const publicItem = buildPublicMenuItem(item, branchId, channel);
        const basePrice = resolvedSize.size ? resolvedSize.price : publicItem.price;
        lines.push({ menuItemId: item.id, name: item.name, quantity: line.quantity, sizeId: line.sizeId, unitPrice: basePrice, modifiers: resolvedModifiers.modifiers });
        const unitPrice = basePrice + resolvedModifiers.total;
        quoteItems.push({ menuItemId: item.id, name: item.name, nameAr: item.nameAr, sizeId: line.sizeId || undefined, quantity: line.quantity, unitPrice, modifiers: resolvedModifiers.modifiers, lineTotal: Number((unitPrice * line.quantity).toFixed(2)) });
    }
    if (rejected.length > 0) return res.status(422).json({ code: 'PUBLIC_API_QUOTE_ITEMS_UNAVAILABLE', message: 'One or more menu items are unavailable.', rejected });

    const totals = calculateOrderTotals({
        items: lines.map(line => ({ price: line.unitPrice, quantity: line.quantity, selectedModifiers: line.modifiers } as any)),
        taxRate: branch.taxRate,
        serviceCharge: branch.serviceCharge || 0,
        deliveryFee: channel === 'DELIVERY' ? deliveryFee : 0,
    });
    return res.json({
        quote: {
            currency: branch.currency || 'EGP', channel, taxRate: totals.taxRate,
            subtotal: totals.subtotal, tax: totals.tax, serviceCharge: totals.serviceCharge,
            deliveryFee: totals.deliveryFee, total: totals.total,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
        items: quoteItems,
    });
};

const publicOrderError = (message: string, code: string, status = 400) => ({ status, body: { code, message } });

/**
 * Creates through the canonical order pipeline after reducing the public input
 * to menu-item ids and quantities. The client can never submit totals, prices,
 * payments, discounts, or inventory instructions.
 */
export const createPublicApiOrder = async (req: Request, res: Response) => {
    const branchId = String(req.params.branchId || '').trim();
    const idempotencyKey = String(req.header('Idempotency-Key') || '').trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
        const error = publicOrderError('A valid Idempotency-Key (8-200 characters) is required.', 'PUBLIC_API_IDEMPOTENCY_KEY_INVALID');
        return res.status(error.status).json(error.body);
    }

    const body = req.body || {};
    const qrTableId = String(req.publicQrTableId || '').trim();
    const type = String(body.type || body.channel || (qrTableId ? 'DINE_IN' : '')).trim().toUpperCase();
    if (!['DELIVERY', 'TAKEAWAY', 'PICKUP', 'DINE_IN'].includes(type) || (type === 'DINE_IN' && !qrTableId) || (qrTableId && type !== 'DINE_IN')) {
        const error = publicOrderError('type must be DELIVERY, TAKEAWAY, or PICKUP; table QR orders must use DINE_IN.', 'PUBLIC_API_ORDER_TYPE_INVALID');
        return res.status(error.status).json(error.body);
    }
    const parsedLines = parsePublicQuoteLines(body.items);
    if (!parsedLines.ok) {
        const code = 'code' in parsedLines ? parsedLines.code : 'PUBLIC_API_ORDER_ITEMS_INVALID';
        const error = publicOrderError('Order items are invalid.', code);
        return res.status(error.status).json(error.body);
    }
    const text = (value: unknown, max: number) => String(value || '').trim().slice(0, max);
    const customerName = text(body.customerName, 160);
    const customerPhone = text(body.customerPhone, 50);
    const deliveryAddress = text(body.deliveryAddress, 500);
    const notes = text(body.notes, 1000);
    const campaignId = text(body.campaignId || body.campaign_id || body.utm_campaign, 255);
    if (type === 'DELIVERY' && (!customerPhone || !deliveryAddress)) {
        const error = publicOrderError('Delivery orders require customerPhone and deliveryAddress.', 'PUBLIC_API_DELIVERY_CONTACT_REQUIRED');
        return res.status(error.status).json(error.body);
    }
    const deliveryFee = Number(body.deliveryFee || 0);
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0 || deliveryFee > 10000) {
        const error = publicOrderError('deliveryFee is invalid.', 'PUBLIC_API_ORDER_DELIVERY_FEE_INVALID');
        return res.status(error.status).json(error.body);
    }
    const [branch] = await db.select({ id: branches.id, currency: branches.currency, timezone: branches.timezone, isActive: branches.isActive })
        .from(branches).where(eq(branches.id, branchId)).limit(1);
    if (!branch) return res.status(404).json({ code: 'PUBLIC_API_BRANCH_NOT_FOUND', message: 'Branch was not found.' });
    if (branch.isActive === false) return res.status(409).json({ code: 'PUBLIC_API_BRANCH_INACTIVE', message: 'Branch is not accepting online orders.' });
    const branchHours = await loadBranchHours(String(branch.timezone || 'Africa/Cairo'));
    if (!branchHours.isOpen) return res.status(409).json({ code: 'PUBLIC_API_BRANCH_CLOSED', message: 'Branch is currently outside its operating hours.', hours: branchHours.hours, timezone: branchHours.timezone });
    if (qrTableId) {
        const [table] = await db.select({ id: tables.id, branchId: tables.branchId, status: tables.status })
            .from(tables).where(and(eq(tables.id, qrTableId), eq(tables.branchId, branchId))).limit(1);
        if (!table) return res.status(404).json({ code: 'PUBLIC_API_TABLE_NOT_FOUND', message: 'Table was not found.' });
        if (String(table.status || '').toUpperCase() === 'OUT_OF_SERVICE') return res.status(409).json({ code: 'PUBLIC_API_TABLE_UNAVAILABLE', message: 'This table is not accepting orders.' });
    }

    const itemIds = Array.from(new Set(parsedLines.lines.map(line => line.menuItemId)));
    const itemRows = await db.select({
        id: menuItems.id, name: menuItems.name, nameAr: menuItems.nameAr, price: menuItems.price,
        branchPricing: menuItems.branchPricing, isAvailable: menuItems.isAvailable, status: menuItems.status,
        deletedAt: menuItems.deletedAt, availableFrom: menuItems.availableFrom, availableTo: menuItems.availableTo,
        availableDays: menuItems.availableDays, sizes: menuItems.sizes, modifierGroups: menuItems.modifierGroups,
    }).from(menuItems).where(inArray(menuItems.id, itemIds));
    const byId = new Map(itemRows.map(item => [item.id, item]));
    const unavailable: Array<{ menuItemId: string; code: string }> = [];
    const items = parsedLines.lines.map(line => {
        const item = byId.get(line.menuItemId);
        if (!item) { unavailable.push({ menuItemId: line.menuItemId, code: 'MENU_ITEM_NOT_FOUND' }); return null; }
        if (!isMenuItemAvailableNow(item, new Date(), String(branch.timezone || 'Africa/Cairo'))) {
            unavailable.push({ menuItemId: line.menuItemId, code: 'MENU_ITEM_UNAVAILABLE' }); return null;
        }
        const resolvedSize = resolvePublicItemSize(item, line.sizeId);
        if (!resolvedSize.ok) { unavailable.push({ menuItemId: line.menuItemId, code: resolvedSize.code }); return null; }
        const resolvedModifiers = resolvePublicItemModifiers(item, line.modifiers);
        if (!resolvedModifiers.ok) { unavailable.push({ menuItemId: line.menuItemId, code: resolvedModifiers.code }); return null; }
        const publicItem = buildPublicMenuItem(item, branchId, type === 'PICKUP' ? 'TAKEAWAY' : type);
        return { id: item.id, name: item.name, nameAr: item.nameAr, price: resolvedSize.size ? resolvedSize.price : publicItem.price, sizeId: line.sizeId || undefined, quantity: line.quantity, modifiers: resolvedModifiers.modifiers };
    }).filter(Boolean);
    if (unavailable.length > 0) return res.status(422).json({ code: 'PUBLIC_API_ORDER_ITEMS_UNAVAILABLE', message: 'One or more menu items are unavailable.', unavailable });

    const stableId = `public-${crypto.createHash('sha256').update(`${req.publicApiClient?.id || 'client'}:${branchId}:${idempotencyKey}`).digest('hex').slice(0, 40)}`;
    const internalBody = {
        id: stableId, branchId, type, tableId: qrTableId || undefined, source: 'online', isCallCenterOrder: true, status: 'PENDING',
        customerName: customerName || undefined, customerPhone: customerPhone || undefined,
        deliveryAddress: type === 'DELIVERY' ? deliveryAddress : undefined,
        campaignId: campaignId || undefined,
        deliveryFee: type === 'DELIVERY' ? deliveryFee : 0, notes: notes || undefined,
        isPaid: false, items, payments: [],
    };
    let statusCode = 500;
    let responseBody: any;
    const internalResponse = {
        status(code: number) { statusCode = code; return this; },
        json(payload: any) { responseBody = payload; return this; },
    } as unknown as Response;
    const internalRequest = Object.assign(req, {
        body: internalBody,
        user: { id: `public-api:${req.publicApiClient?.id || 'unknown'}`, role: 'EXTERNAL_INTEGRATION', permissions: [], branchId, allowedBranches: [branchId] },
        effectiveBranchId: branchId,
        headers: { ...req.headers, 'idempotency-key': idempotencyKey },
    });
    await createOrder(internalRequest, internalResponse);
    if (statusCode >= 400) return res.status(statusCode).json(responseBody || { code: 'PUBLIC_API_ORDER_CREATE_FAILED', message: 'Order could not be created.' });
    const created = responseBody || {};
    return res.status(statusCode || 201).json({
        order: { id: created.id, orderNumber: created.orderNumber, branchId: created.branchId, type: created.type, status: created.status, total: created.total, currency: branch.currency || 'EGP', isPaid: false, createdAt: created.createdAt },
        paymentRequired: true,
        trackingUrl: signTrackToken(String(created.id || stableId))
            ? `${String(process.env.PUBLIC_TRACKING_URL || process.env.FRONTEND_URL || '').replace(/\/+$/, '')}/t/${encodeURIComponent(String(created.id || stableId))}?t=${encodeURIComponent(signTrackToken(String(created.id || stableId)) || '')}`
            : null,
    });
};

export const createPublicApiCheckout = async (req: Request, res: Response) => {
    const branchId = String(req.params.branchId || '').trim();
    const orderId = String(req.params.orderId || '').trim();
    const rawKey = String(req.header('Idempotency-Key') || '').trim();
    if (rawKey.length < 8 || rawKey.length > 200) {
        return res.status(400).json({ code: 'PUBLIC_API_IDEMPOTENCY_KEY_INVALID', message: 'A valid Idempotency-Key (8-200 characters) is required.' });
    }
    const method = String(req.body?.method || 'CARD').trim().toUpperCase();
    if (!['CARD', 'INSTAPAY'].includes(method)) return res.status(400).json({ code: 'PUBLIC_API_PAYMENT_METHOD_INVALID', message: 'method must be CARD or INSTAPAY.' });

    const [order] = await db.select({
        id: orders.id, branchId: orders.branchId, source: orders.source, total: orders.total, isPaid: orders.isPaid,
        customerName: orders.customerName, customerPhone: orders.customerPhone,
    }).from(orders).where(and(eq(orders.id, orderId), eq(orders.branchId, branchId))).limit(1);
    if (!order) return res.status(404).json({ code: 'PUBLIC_API_ORDER_NOT_FOUND', message: 'Order was not found.' });
    if (String(order.source || '').toLowerCase() !== 'online') return res.status(403).json({ code: 'PUBLIC_API_ORDER_NOT_OWNED', message: 'Only online orders can use this payment endpoint.' });
    if (order.isPaid) return res.status(409).json({ code: 'PUBLIC_API_ORDER_ALREADY_PAID', message: 'Order is already paid.' });
    const amount = Number(order.total || 0);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(409).json({ code: 'PUBLIC_API_ORDER_AMOUNT_INVALID', message: 'Order total is not payable.' });

    const [branch] = await db.select({ currency: branches.currency }).from(branches).where(eq(branches.id, branchId)).limit(1);
    await ensurePaymentSessionSchema();
    const clientId = req.publicApiClient?.id || 'unknown';
    const paymentKey = `public-payment:${crypto.createHash('sha256').update(`${clientId}:${branchId}:${orderId}:${rawKey}`).digest('hex')}`;
    const providerType = method === 'INSTAPAY' ? 'paymob_instapay' : 'paymob_card';
    const replay = async (session: any) => {
        if (session.orderId !== orderId || session.branchId !== branchId || session.providerType !== providerType || Number(session.amount) !== amount) {
            return res.status(409).json({ code: 'PUBLIC_API_PAYMENT_IDEMPOTENCY_CONFLICT', message: 'Idempotency-Key was used for a different payment request.' });
        }
        const checkoutUrl = decryptPaymentCheckoutUrl(session.checkoutUrlCiphertext);
        if (session.status === 'failed') return res.status(503).json({ code: 'PUBLIC_API_PAYMENT_PROVIDER_UNAVAILABLE', message: 'Payment provider is temporarily unavailable. Use a new Idempotency-Key to retry.' });
        if (!checkoutUrl) return res.status(409).json({ code: 'PUBLIC_API_PAYMENT_IN_PROGRESS', message: 'Payment checkout is still being prepared. Retry shortly.' });
        return res.status(200).json({ payment: { sessionId: session.id, provider: 'PAYMOB', method, status: session.status, amount, currency: branch?.currency || 'EGP', checkoutUrl }, idempotentReplay: true });
    };

    const [existing] = await db.select().from(paymentSessions).where(eq(paymentSessions.idempotencyKey, paymentKey)).limit(1);
    if (existing) return replay(existing);

    const sessionId = `public-pay-${crypto.createHash('sha256').update(paymentKey).digest('hex').slice(0, 40)}`;
    const claimDeviceId = `public-api-${crypto.randomBytes(8).toString('hex')}`;
    await db.insert(paymentSessions).values({
        id: sessionId, orderId, branchId, providerType, amount, currency: branch?.currency || 'EGP',
        status: 'initiating', verified: false, idempotencyKey: paymentKey, deviceId: claimDeviceId,
        createdBy: `public-api:${clientId}`, createdAt: new Date(), updatedAt: new Date(),
    }).onConflictDoNothing();
    const [claimed] = await db.select().from(paymentSessions).where(eq(paymentSessions.idempotencyKey, paymentKey)).limit(1);
    if (!claimed) return res.status(503).json({ code: 'PUBLIC_API_PAYMENT_SESSION_FAILED', message: 'Payment session could not be reserved.' });
    if (claimed.id !== sessionId || claimed.status !== 'initiating' || claimed.deviceId !== claimDeviceId) return replay(claimed);

    try {
        const nameParts = String(order.customerName || 'Guest Customer').trim().split(/\s+/).filter(Boolean);
        const intention = await createIntention({
            amount, currency: branch?.currency || 'EGP', merchantOrderId: orderId,
            method: method as 'CARD' | 'INSTAPAY', branchId,
            billing: { first_name: nameParts[0] || 'Guest', last_name: nameParts.slice(1).join(' ') || 'Customer', phone_number: order.customerPhone || undefined },
        });
        const encryptedUrl = encryptPaymentCheckoutUrl(intention.iframeUrl);
        await db.transaction(async tx => {
            await tx.update(paymentSessions).set({ status: 'initiated', externalReference: String(intention.paymobOrderId), checkoutUrlCiphertext: encryptedUrl, updatedAt: new Date() }).where(eq(paymentSessions.id, sessionId));
            await tx.insert(payments).values({
                id: `PAYMOB-${intention.paymobOrderId}`, orderId, method: method === 'INSTAPAY' ? 'INSTAPAY' : 'PAYMOB', amount,
                referenceNumber: String(intention.paymobOrderId), status: 'PENDING', processedBy: `public-api:${clientId}`, createdAt: new Date(),
            }).onConflictDoNothing();
        });
        return res.status(201).json({ payment: { sessionId, provider: 'PAYMOB', method, status: 'initiated', amount, currency: branch?.currency || 'EGP', checkoutUrl: intention.iframeUrl } });
    } catch (error: any) {
        await db.update(paymentSessions).set({ status: 'failed', updatedAt: new Date() }).where(eq(paymentSessions.id, sessionId)).catch(() => undefined);
        const status = Number(error?.status) >= 500 ? 503 : (Number(error?.status) || 503);
        return res.status(status).json({ code: 'PUBLIC_API_PAYMENT_PROVIDER_UNAVAILABLE', message: 'Payment provider is temporarily unavailable.' });
    }
};
