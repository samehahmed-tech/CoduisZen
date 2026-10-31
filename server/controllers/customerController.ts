import { Request, Response } from 'express';
import { db, pool } from '../db';
import { customers, customerAddresses, orders, loyaltyLedger, customerWallets, walletTransactions, giftCards } from '../../src/db/schema';
import { eq, or, and, desc, lt, gt, sql, isNull } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { parseCursorPagination, decodeCursor, encodeCursor, cursorPaginatedResponse } from '../middleware/pagination';
import { createSignedAuditLog } from '../services/auditService';
import { customerIdentityConfidence, customerPhoneVariants, normalizeCustomerPhone } from '../utils/customerIdentityPolicy';
import { mergeCustomers } from '../services/customerMergeService';
import { refundService } from '../services/refundService';
import { ensureLoyaltySchema } from '../services/loyaltyService';
import { walletService } from '../services/walletService';
import { CHANNEL_FIELD, ensureCustomerConsentSchema, parseMarketingConsentChannel } from '../services/customerConsentService';
import { ensureMarketingSchema } from '../services/marketingSchemaService';

const customerSelect = {
    id: customers.id,
    name: customers.name,
    phone: customers.phone,
    email: customers.email,
    birthDate: customers.birthDate,
    address: customers.address,
    lat: customers.lat,
    lng: customers.lng,
    addressLabel: customers.addressLabel,
    zoneId: customers.zoneId,
    area: customers.area,
    building: customers.building,
    floor: customers.floor,
    apartment: customers.apartment,
    landmark: customers.landmark,
    notes: customers.notes,
    visits: customers.visits,
    totalSpent: customers.totalSpent,
    loyaltyTier: customers.loyaltyTier,
    loyaltyPoints: customers.loyaltyPoints,
    source: customers.source,
    marketingOptIn: customers.marketingOptIn,
    marketingOptOutAt: customers.marketingOptOutAt,
    marketingEmailOptIn: customers.marketingEmailOptIn,
    marketingSmsOptIn: customers.marketingSmsOptIn,
    marketingWhatsappOptIn: customers.marketingWhatsappOptIn,
    marketingPushOptIn: customers.marketingPushOptIn,
    createdAt: customers.createdAt,
    updatedAt: customers.updatedAt,
};

const parseZoneId = (value: unknown) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const likeSearch = (column: any, search: string) => sql`LOWER(${column}) LIKE ${`%${search.toLowerCase()}%`}`;

/**
 * Get all customers with optional search and cursor pagination.
 * Supports: ?cursor=<opaque>&limit=50 for cursor pagination
 * Falls back to offset-based limit for backward compatibility.
 */
export const getAllCustomers = async (req: Request, res: Response) => {
    try {
        const search = getStringParam(req.query.search);
        const phone = getStringParam(req.query.phone);

        // Phone lookup (exact match, no pagination needed)
        if (phone) {
            const results = await db.select(customerSelect).from(customers).where(and(eq(customers.phone, phone), isNull(customers.deletedAt)));
            return res.json(results);
        }

        // Offset pager (Phase-6): `?mode=page&page=2` returns an envelope
        // with an exact total. Applies to both the directory and search
        // branches so no customer is ever hidden behind a silent cap.
        const wantPage = String(req.query.mode || '') === 'page';
        const pageSize = wantPage ? Math.min(Math.max(1, Number(req.query.limit) || 10), 100) : 0;
        const pageNum = wantPage ? Math.max(1, Math.floor(Number(req.query.page) || 1)) : 1;

        // Shared directory-wide KPI summary for page envelopes.
        const directorySummary = () => pool.query(`
            SELECT COUNT(*) AS total,
                SUM(CASE WHEN c.loyalty_points > 0 THEN 1 ELSE 0 END) AS loyaltyMembers,
                AVG(CAST(c.total_spent AS FLOAT)) AS avgLTV,
                SUM(CASE WHEN c.created_at < DATEADD(day, -30, GETDATE()) AND ro.cid IS NULL THEN 1 ELSE 0 END) AS atRisk
            FROM customers c
            LEFT JOIN (
                SELECT customer_id AS cid FROM orders
                WHERE created_at >= DATEADD(day, -30, GETDATE()) AND customer_id IS NOT NULL
                UNION
                SELECT c2.id AS cid FROM customers c2
                INNER JOIN orders o ON o.customer_phone = c2.phone
                WHERE c2.phone IS NOT NULL AND o.created_at >= DATEADD(day, -30, GETDATE())
            ) ro ON ro.cid = c.id
            WHERE c.deleted_at IS NULL
        `).then((r: any) => {
            const agg: any = r?.rows?.[0] || {};
            return {
                loyaltyMembers: Number(agg.loyaltyMembers || 0),
                avgLTV: Number(agg.avgLTV || 0),
                atRisk: Number(agg.atRisk || 0),
            };
        });

        // Search mode (limited, no cursor)
        if (search) {
            const cond = and(
                isNull(customers.deletedAt),
                or(
                    likeSearch(customers.name, search),
                    likeSearch(customers.phone, search),
                    likeSearch(customers.email, search)
                )
            );
            if (!wantPage) {
                const results = await db.select(customerSelect).top(100).from(customers).where(cond);
                return res.json(results);
            }
            const [countRows, rows, summary] = await Promise.all([
                db.select({ n: sql<number>`count(*)` }).from(customers).where(cond),
                db.select(customerSelect).from(customers).where(cond)
                    .orderBy(desc(customers.createdAt), desc(customers.id))
                    .offset((pageNum - 1) * pageSize).fetch(pageSize),
                directorySummary(),
            ]);
            const total = Number((countRows as any[])[0]?.n || 0);
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            return res.json({
                data: rows,
                pagination: {
                    page: pageNum, limit: pageSize, total, totalPages,
                    hasNext: pageNum < totalPages, hasPrev: pageNum > 1,
                },
                summary: { total, ...summary },
            });
        }

        if (wantPage) {
            const base = and(isNull(customers.deletedAt));
            const [countRows, rows, summary] = await Promise.all([
                db.select({ n: sql<number>`count(*)` }).from(customers).where(base),
                db.select(customerSelect).from(customers).where(base)
                    .orderBy(desc(customers.createdAt), desc(customers.id))
                    .offset((pageNum - 1) * pageSize).fetch(pageSize),
                directorySummary(),
            ]);
            const total = Number((countRows as any[])[0]?.n || 0);
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            return res.json({
                data: rows,
                pagination: {
                    page: pageNum, limit: pageSize, total, totalPages,
                    hasNext: pageNum < totalPages, hasPrev: pageNum > 1,
                },
                summary: { total, ...summary },
            });
        }

        // Cursor pagination mode
        const { limit, cursor } = parseCursorPagination(req, 50);
        const conditions: any[] = [];

        if (cursor) {
            const decoded = decodeCursor(cursor);
            if (decoded) {
                conditions.push(
                    sql`(${customers.createdAt}, ${customers.id}) < (CAST(${decoded.createdAt} AS DATETIME2), ${decoded.id})`
                );
            }
        }

        const rows = await db.select(customerSelect)
            .from(customers)
            .where(and(isNull(customers.deletedAt), ...conditions))
            .orderBy(desc(customers.createdAt), desc(customers.id))
            .offset(0).fetch(limit + 1);

        res.json(cursorPaginatedResponse(rows as any, limit));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get customer by phone
 */
export const getCustomerByPhone = async (req: Request, res: Response) => {
    try {
        const phone = getStringParam((req.params as any).phone);
        if (!phone) return res.status(400).json({ error: 'PHONE_REQUIRED' });
        const variants = customerPhoneVariants(phone);
        const [customer] = await db.select(customerSelect).top(1).from(customers).where(and(
            or(...variants.map((variant) => eq(customers.phone, variant))),
            isNull(customers.deletedAt),
        ));

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Get addresses
        const addresses = await db.select().from(customerAddresses).where(eq(customerAddresses.customerId, customer.id));

        res.json({ ...customer, addresses });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** Resolve likely existing identities before a caller creates a duplicate. */
export const getCustomerIdentityCandidates = async (req: Request, res: Response) => {
    try {
        const phone = getStringParam(req.query.phone);
        const email = getStringParam(req.query.email);
        if (!phone && !email) return res.status(400).json({ error: 'PHONE_OR_EMAIL_REQUIRED', code: 'PHONE_OR_EMAIL_REQUIRED' });

        const conditions: any[] = [isNull(customers.deletedAt)];
        if (phone) {
            const variants = customerPhoneVariants(phone);
            if (variants.length) conditions.push(or(...variants.map((variant) => eq(customers.phone, variant))));
        }
        if (email) conditions.push(sql`LOWER(${customers.email}) = ${email.toLowerCase()}`);
        const rows = await db.select(customerSelect).top(20).from(customers).where(and(...conditions));
        return res.json({
            canonicalPhone: phone ? normalizeCustomerPhone(phone) : null,
            matches: rows.map((candidate) => ({ ...candidate, confidence: customerIdentityConfidence(candidate, { phone, email }) })),
        });
    } catch (error: any) {
        return res.status(500).json({ error: 'CUSTOMER_IDENTITY_LOOKUP_FAILED', code: 'CUSTOMER_IDENTITY_LOOKUP_FAILED', message: error?.message });
    }
};

/** Read-only duplicate review report; it never merges or deletes records. */
export const getCustomerDuplicateReport = async (_req: Request, res: Response) => {
    try {
        const rows = await db.select(customerSelect).top(10000).from(customers)
            .where(isNull(customers.deletedAt))
            .orderBy(desc(customers.createdAt));
        const groups = new Map<string, { signal: 'PHONE' | 'EMAIL'; key: string; customers: any[] }>();
        for (const customer of rows) {
            const signals: Array<{ signal: 'PHONE' | 'EMAIL'; key: string }> = [];
            const phone = normalizeCustomerPhone(customer.phone);
            const email = String(customer.email || '').trim().toLowerCase();
            if (phone) signals.push({ signal: 'PHONE', key: phone });
            if (email) signals.push({ signal: 'EMAIL', key: email });
            for (const identity of signals) {
                const groupKey = `${identity.signal}:${identity.key}`;
                const group = groups.get(groupKey) || { ...identity, customers: [] };
                group.customers.push({
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    email: customer.email,
                    visits: customer.visits,
                    totalSpent: customer.totalSpent,
                    loyaltyPoints: customer.loyaltyPoints,
                    createdAt: customer.createdAt,
                });
                groups.set(groupKey, group);
            }
        }
        const duplicates = [...groups.values()]
            .filter((group) => group.customers.length > 1)
            .sort((a, b) => b.customers.length - a.customers.length || a.signal.localeCompare(b.signal));
        return res.json({ scanned: rows.length, truncated: rows.length >= 10000, duplicateGroups: duplicates });
    } catch (error: any) {
        return res.status(500).json({ error: 'CUSTOMER_DUPLICATE_REPORT_FAILED', code: 'CUSTOMER_DUPLICATE_REPORT_FAILED', message: error?.message });
    }
};

export const mergeCustomer = async (req: Request, res: Response) => {
    try {
        const sourceCustomerId = getStringParam((req.params as any).id);
        const targetCustomerId = String(req.body?.targetCustomerId || '').trim();
        if (req.body?.confirmation !== 'MERGE_CUSTOMER') {
            return res.status(400).json({ error: 'MERGE_CONFIRMATION_REQUIRED', code: 'MERGE_CONFIRMATION_REQUIRED' });
        }
        if (!sourceCustomerId || !targetCustomerId) {
            return res.status(400).json({ error: 'MERGE_TARGET_REQUIRED', code: 'MERGE_TARGET_REQUIRED' });
        }
        const result = await mergeCustomers(sourceCustomerId, targetCustomerId);
        await createSignedAuditLog({
            eventType: 'CUSTOMER_MERGED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: req.effectiveBranchId,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: result,
            after: { sourceArchived: true, targetCustomerId, mergeId: result.mergeId },
            reason: 'Duplicate customer merged into canonical profile',
        });
        return res.json({ success: true, ...result });
    } catch (error: any) {
        return res.status(error?.status || 500).json({ error: error?.code || 'CUSTOMER_MERGE_FAILED', code: error?.code || 'CUSTOMER_MERGE_FAILED', message: error?.message });
    }
};

export const updateMarketingConsent = async (req: Request, res: Response) => {
    try {
        await ensureCustomerConsentSchema();
        const customerId = getStringParam((req.params as any).id);
        const raw = req.body?.marketingOptIn ?? req.body?.enabled;
        const channel = parseMarketingConsentChannel(req.body?.channel);
        if (!customerId || typeof raw !== 'boolean' || !channel) {
            return res.status(400).json({ error: 'MARKETING_CONSENT_BOOLEAN_REQUIRED', code: 'MARKETING_CONSENT_BOOLEAN_REQUIRED' });
        }
        const [customer] = await db.select({ id: customers.id }).top(1).from(customers).where(and(
            eq(customers.id, customerId),
            isNull(customers.deletedAt),
        ));
        if (!customer) return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', code: 'CUSTOMER_NOT_FOUND' });

        const marketingOptOutAt = raw ? null : new Date();
        const updates: Record<string, unknown> = channel === 'GLOBAL'
            ? {
                marketingOptIn: raw,
                marketingEmailOptIn: raw,
                marketingSmsOptIn: raw,
                marketingWhatsappOptIn: raw,
                marketingPushOptIn: raw,
                marketingOptOutAt,
            }
            : { [CHANNEL_FIELD[channel]]: raw };
        await db.update(customers)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .where(eq(customers.id, customerId));

        await createSignedAuditLog({
            eventType: 'CUSTOMER_MARKETING_CONSENT_UPDATED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: req.effectiveBranchId,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { customerId, channel, marketingOptIn: raw },
            after: { channel, marketingOptIn: raw, marketingOptOutAt: channel === 'GLOBAL' ? marketingOptOutAt : undefined },
            reason: raw ? `Customer ${channel.toLowerCase()} marketing consent enabled` : `Customer ${channel.toLowerCase()} marketing consent withdrawn`,
        });
        return res.json({ id: customerId, channel, marketingOptIn: raw, marketingOptOutAt: channel === 'GLOBAL' ? marketingOptOutAt : undefined });
    } catch (error: any) {
        return res.status(500).json({ error: 'MARKETING_CONSENT_UPDATE_FAILED', code: 'MARKETING_CONSENT_UPDATE_FAILED', message: error?.message });
    }
};

export const getCustomerById = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'CUSTOMER_ID_REQUIRED' });

        const [customer] = await db.select(customerSelect).top(1).from(customers).where(and(eq(customers.id, id), isNull(customers.deletedAt)));
        if (!customer) {
            return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' });
        }

        const addresses = await db.select().from(customerAddresses).where(eq(customerAddresses.customerId, customer.id));
        res.json({ ...customer, addresses });
    } catch (error: any) {
        res.status(500).json({ error: 'CUSTOMER_LOOKUP_FAILED', code: 'CUSTOMER_LOOKUP_FAILED', message: 'Customer could not be loaded.' });
    }
};

/**
 * Customer 360: one branch-scoped, read-only view over the existing customer,
 * ordering, loyalty, wallet, and gift-card ledgers. This deliberately reuses
 * the financial sources of truth instead of calculating a second balance.
 */
export const getCustomer360 = async (req: Request, res: Response) => {
    try {
        await ensureLoyaltySchema();
        await walletService.ensureWalletSchema();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'CUSTOMER_ID_REQUIRED', code: 'CUSTOMER_ID_REQUIRED' });

        const [customer] = await db.select(customerSelect).top(1).from(customers)
            .where(and(eq(customers.id, id), isNull(customers.deletedAt)));
        if (!customer) return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', code: 'CUSTOMER_NOT_FOUND' });

        const branchId = req.effectiveBranchId;
        const orderConditions: any[] = [eq(orders.customerId, id)];
        if (branchId) orderConditions.push(eq(orders.branchId, branchId));

        const [addresses, recentOrders, customerOrderRows, loyalty, wallets, cards] = await Promise.all([
            db.select().from(customerAddresses).where(eq(customerAddresses.customerId, id)),
            db.select({
                id: orders.id,
                branchId: orders.branchId,
                status: orders.status,
                type: orders.type,
                subtotal: orders.subtotal,
                discount: orders.discount,
                tax: orders.tax,
                deliveryFee: orders.deliveryFee,
                total: orders.total,
                isPaid: orders.isPaid,
                paymentMethod: orders.paymentMethod,
                createdAt: orders.createdAt,
                completedAt: orders.completedAt,
            }).from(orders).where(and(...orderConditions)).orderBy(desc(orders.createdAt)).offset(0).fetch(20),
            db.select({ id: orders.id, total: orders.total, status: orders.status }).from(orders)
                .where(and(...orderConditions)).orderBy(desc(orders.createdAt)).offset(0).fetch(10000),
            db.select({
                id: loyaltyLedger.id,
                points: loyaltyLedger.points,
                type: loyaltyLedger.type,
                referenceId: loyaltyLedger.referenceId,
                notes: loyaltyLedger.notes,
                createdAt: loyaltyLedger.createdAt,
            }).from(loyaltyLedger).where(and(
                eq(loyaltyLedger.customerId, id),
                ...(branchId ? [eq(loyaltyLedger.branchId, branchId)] : []),
            )).orderBy(desc(loyaltyLedger.createdAt)).offset(0).fetch(50),
            db.select().from(customerWallets).where(and(
                eq(customerWallets.customerId, id),
                ...(branchId ? [eq(customerWallets.branchId, branchId)] : []),
            )),
            db.select({
                id: giftCards.id,
                code: giftCards.code,
                branchId: giftCards.branchId,
                balance: giftCards.balance,
                initialAmount: giftCards.initialAmount,
                status: giftCards.status,
                expiresAt: giftCards.expiresAt,
                createdAt: giftCards.createdAt,
            }).from(giftCards).where(and(
                eq(giftCards.customerId, id),
                ...(branchId ? [eq(giftCards.branchId, branchId)] : []),
            )).orderBy(desc(giftCards.createdAt)),
        ]);

        const wallet = wallets[0] || null;
        const walletTransactionsForCustomer = wallet
            ? await db.select().from(walletTransactions).where(and(
                eq(walletTransactions.walletId, wallet.id),
                ...(branchId ? [eq(walletTransactions.branchId, branchId)] : []),
            )).orderBy(desc(walletTransactions.createdAt)).offset(0).fetch(50)
            : [];
        const orderTotals = customerOrderRows.reduce((acc, order) => {
            const total = Number(order.total || 0);
            acc.orderCount += 1;
            acc.totalValue += Number.isFinite(total) ? total : 0;
            if (String(order.status || '').toUpperCase() === 'CANCELLED') acc.cancelledCount += 1;
            return acc;
        }, { orderCount: 0, totalValue: 0, cancelledCount: 0 });
        const customerOrderIds = new Set(customerOrderRows.map((order) => String(order.id)));
        const refundById = new Map<string, any>();
        let customerRefunds: any[] = [];
        try {
            customerRefunds = await refundService.getRefunds({
                ...(branchId ? { branchId } : {}),
                orderIds: [...customerOrderIds],
            });
        } catch {
            customerRefunds = [];
        }
        for (const refund of customerRefunds) {
            const normalized = {
                id: refund.id,
                orderId: refund.orderId,
                status: refund.status,
                amount: Number(refund.refundAmount || refund.totalAmount || 0),
                method: refund.refundMethod,
                reason: refund.reason,
                reasonCategory: refund.reasonCategory,
                createdAt: refund.createdAt,
                processedAt: refund.processedAt,
            };
            if (!refundById.has(String(normalized.id))) refundById.set(String(normalized.id), normalized);
        }
        const allRefunds = [...refundById.values()].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        const requestedRefundLimit = Number(req.query.refundLimit || 50);
        const requestedRefundPage = Number(req.query.refundPage || 1);
        const refundLimit = Number.isFinite(requestedRefundLimit) ? Math.min(Math.max(1, Math.floor(requestedRefundLimit)), 200) : 50;
        const refundPage = Number.isFinite(requestedRefundPage) ? Math.max(1, Math.floor(requestedRefundPage)) : 1;
        const refundTotal = allRefunds.length;
        const refundTotalPages = Math.max(1, Math.ceil(refundTotal / refundLimit));
        const refunds = allRefunds.slice((refundPage - 1) * refundLimit, refundPage * refundLimit);

        return res.json({
            customer,
            addresses,
            summary: {
                ...orderTotals,
                loyaltyPoints: Number(customer.loyaltyPoints || 0),
                loyaltyTier: customer.loyaltyTier || 'Bronze',
                walletBalance: wallet ? Number(wallet.balance || 0) : 0,
                giftCardBalance: cards.reduce((sum, card) => sum + Number(card.balance || 0), 0),
                refundCount: refundTotal,
                refundedValue: allRefunds.filter((refund) => String(refund.status).toUpperCase() === 'PROCESSED')
                    .reduce((sum, refund) => sum + refund.amount, 0),
            },
            recentOrders,
            refunds,
            refundsPagination: {
                page: refundPage,
                limit: refundLimit,
                total: refundTotal,
                totalPages: refundTotalPages,
                hasNext: refundPage < refundTotalPages,
                hasPrev: refundPage > 1 && refundPage <= refundTotalPages,
            },
            loyaltyLedger: loyalty,
            wallet: wallet ? {
                ...wallet,
                scope: branchId ? 'BRANCH' : (wallet.branchId ? 'BRANCH' : 'GLOBAL_LEGACY'),
                transactions: walletTransactionsForCustomer,
            } : null,
            giftCards: cards,
            scope: { branchId: branchId || null, branchScoped: Boolean(branchId) },
        });
    } catch (error: any) {
        res.status(500).json({ error: 'CUSTOMER_360_FAILED', code: 'CUSTOMER_360_FAILED', message: error?.message || 'Customer profile could not be loaded.' });
    }
};

/**
 * Create customer
 */
export const createCustomer = async (req: Request, res: Response) => {
    try {
        // Direct app imports used by embedded workers/tests do not run the
        // production index bootstrap, so ensure additive CRM columns here too.
        await ensureMarketingSchema();
        const customerData = req.body;
        const phone = normalizeCustomerPhone(customerData.phone);
        if (!customerData.name || !phone) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                code: 'VALIDATION_ERROR',
                message: 'Customer name and phone are required.',
            });
        }

        const result = await db.transaction(async (tx) => {
            const phoneVariants = customerPhoneVariants(phone);
            const [existingCustomer] = await tx
                .select(customerSelect)
                .top(1)
                .from(customers)
                .where(and(or(...phoneVariants.map((variant) => eq(customers.phone, variant))), isNull(customers.deletedAt)));

            if (existingCustomer) return { customer: existingCustomer, created: false };

            const [newCustomer] = await tx.insert(customers).output(customerSelect).values({
                id: customerData.id || `CUS-${Date.now()}`,
                name: customerData.name,
                phone,
                email: customerData.email,
                birthDate: customerData.birthDate ? new Date(customerData.birthDate) : undefined,
                address: customerData.address,
                lat: customerData.lat ?? customerData.latitude,
                lng: customerData.lng ?? customerData.longitude,
                addressLabel: customerData.address_label ?? customerData.addressLabel,
                zoneId: parseZoneId(customerData.zone_id ?? customerData.zoneId),
                area: customerData.area,
                building: customerData.building,
                floor: customerData.floor,
                apartment: customerData.apartment,
                landmark: customerData.landmark,
                notes: customerData.notes,
                visits: customerData.visits || 0,
                totalSpent: customerData.total_spent ?? customerData.totalSpent ?? 0,
                loyaltyTier: customerData.loyalty_tier || customerData.loyaltyTier || 'Bronze',
                loyaltyPoints: customerData.loyalty_points ?? customerData.loyaltyPoints ?? 0,
                source: customerData.source || 'call_center',
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            if (customerData.address) {
                await tx.insert(customerAddresses).values({
                    customerId: newCustomer.id,
                    label: customerData.addressLabel || 'Home',
                    address: customerData.address,
                    lat: customerData.lat ?? customerData.latitude,
                    lng: customerData.lng ?? customerData.longitude,
                    zoneId: parseZoneId(customerData.zone_id ?? customerData.zoneId),
                    area: customerData.area,
                    building: customerData.building,
                    floor: customerData.floor,
                    apartment: customerData.apartment,
                    landmark: customerData.landmark,
                    isDefault: true,
                });
            }

            return { customer: newCustomer, created: true };
        });

        if (result.created) {
            await createSignedAuditLog({
                eventType: 'CUSTOMER_CREATED',
                userId: req.user?.id || 'system',
                userRole: req.user?.role,
                branchId: req.effectiveBranchId,
                requestId: req.requestId,
                sourceDevice: req.headers['user-agent'],
                payload: { customerId: result.customer.id, source: result.customer.source, hasAddress: Boolean(result.customer.address) },
                after: { customerId: result.customer.id },
                reason: 'Customer created',
            });
        }
        // Phone-based customer creation is idempotent: returning the same
        // creation contract for a replay keeps offline/call-center retries
        // deterministic for clients.
        res.status(201).json(result.customer);
    } catch (error: any) {
        console.error('Customer create failed:', error?.message || String(error));
        if (error?.code === '23505') {
            return res.status(409).json({
                error: 'DUPLICATE_CUSTOMER',
                code: 'DUPLICATE_CUSTOMER',
                message: 'A customer with this phone already exists.',
            });
        }
        res.status(500).json({
            error: 'CUSTOMER_CREATE_FAILED',
            code: 'CUSTOMER_CREATE_FAILED',
            message: 'Customer could not be saved. Please retry.',
            details: process.env.NODE_ENV === 'production' ? undefined : error?.message,
        });
    }
};

/**
 * Update customer
 */
export const updateCustomer = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'CUSTOMER_ID_REQUIRED' });
        const body = req.body || {};

        const updates: any = {
            name: body.name,
            phone: body.phone,
            email: body.email,
            birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
            address: body.address,
            lat: body.lat ?? body.latitude,
            lng: body.lng ?? body.longitude,
            addressLabel: body.address_label ?? body.addressLabel,
            area: body.area,
            building: body.building,
            floor: body.floor,
            apartment: body.apartment,
            landmark: body.landmark,
            notes: body.notes,
            visits: body.visits,
            totalSpent: body.total_spent ?? body.totalSpent,
            loyaltyTier: body.loyalty_tier ?? body.loyaltyTier,
        };

        const [current] = await db.select().top(1).from(customers).where(eq(customers.id, id));
        if (!current) return res.status(404).json({ error: 'Customer not found' });
        const changedFields = Object.keys(updates).filter((key) => updates[key] !== undefined && updates[key] !== (current as any)[key]);
        const [updated] = await db.update(customers)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .output()
            .where(eq(customers.id, id));

        if (!updated) return res.status(404).json({ error: 'Customer not found' });

        await createSignedAuditLog({
            eventType: 'CUSTOMER_UPDATED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: req.effectiveBranchId,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { customerId: id, changedFields },
            before: { customerId: id, changedFields },
            after: { customerId: id, changedFields },
            reason: 'Customer profile updated',
        });

        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Delete customer
 */
export const deleteCustomer = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'CUSTOMER_ID_REQUIRED' });

        const [result] = await db.update(customers)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .output()
            .where(eq(customers.id, id));

        if (!result) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        await createSignedAuditLog({
            eventType: 'CUSTOMER_ARCHIVED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: req.effectiveBranchId,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { customerId: id },
            before: { deleted: false },
            after: { deleted: true },
            reason: 'Customer archived',
        });

        res.json({ message: 'Customer archived', customer: result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Add a delivery address to a customer (used by the call-center profile to
 * replace the old hardcoded Home/Work mock with real saved addresses).
 */
export const addCustomerAddress = async (req: Request, res: Response) => {
    try {
        const customerId = getStringParam((req.params as any).id);
        if (!customerId) return res.status(400).json({ error: 'CUSTOMER_ID_REQUIRED', code: 'CUSTOMER_ID_REQUIRED' });
        const body = req.body || {};
        const address = String(body.address || '').trim();
        if (!address) {
            return res.status(400).json({ error: 'ADDRESS_REQUIRED', code: 'ADDRESS_REQUIRED', message: 'Address text is required.' });
        }
        const [customer] = await db.select({ id: customers.id }).top(1).from(customers).where(eq(customers.id, customerId));
        if (!customer) return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', code: 'CUSTOMER_NOT_FOUND' });

        const [existing] = await db.select({ id: customerAddresses.id }).top(1).from(customerAddresses).where(and(
            eq(customerAddresses.customerId, customerId),
            eq(customerAddresses.address, address),
        ));
        if (existing) return res.status(409).json({ error: 'ADDRESS_EXISTS', code: 'ADDRESS_EXISTS' });

        const zoneId = body.zoneId || body.zone_id ? Number(body.zoneId || body.zone_id) : undefined;
        const [created] = await db.insert(customerAddresses).output().values({
            customerId,
            label: String(body.label || body.addressLabel || 'Home'),
            address,
            lat: body.lat ?? body.latitude,
            lng: body.lng ?? body.longitude,
            zoneId,
            area: body.area,
            building: body.building,
            floor: body.floor,
            apartment: body.apartment,
            landmark: body.landmark,
            isDefault: body.isDefault === true,
            createdAt: new Date(),
        });
        await createSignedAuditLog({
            eventType: 'CUSTOMER_ADDRESS_ADDED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: req.effectiveBranchId,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { customerId, addressId: created.id, label: created.label, hasCoordinates: created.lat != null && created.lng != null },
            after: { addressId: created.id },
            reason: 'Customer address added',
        });
        res.status(201).json(created);
    } catch (error: any) {
        res.status(500).json({ error: 'ADDRESS_CREATE_FAILED', code: 'ADDRESS_CREATE_FAILED', message: error?.message });
    }
};

/**
 * Redeem loyalty points for a customer (Item 41)
 */
export const redeemLoyaltyPoints = async (req: Request, res: Response) => {
    try {
        const customerId = getStringParam((req.params as any).id);
        const { points } = req.body;
        const user = (req as any).user;
        const branchId = req.effectiveBranchId || user?.branchId || undefined;
        const operationKey = String(req.get('Idempotency-Key') || req.body?.operationKey || '').trim() || undefined;

        if (!customerId || !points || points <= 0) {
            return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Customer ID and valid points amount are required.' });
        }

        const { loyaltyService } = await import('../services/loyaltyService');
        await loyaltyService.redeemPoints(customerId, Number(points), branchId, operationKey);

        await createSignedAuditLog({
            eventType: 'CUSTOMER_LOYALTY_POINTS_REDEEMED',
            userId: user?.id || 'system',
            userRole: user?.role,
            branchId: branchId || req.effectiveBranchId,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { customerId, points: Number(points), operationKey: operationKey || null },
            reason: 'Loyalty points redeemed',
        });

        res.json({ success: true, message: `Successfully redeemed ${points} points.` });
    } catch (error: any) {
        if (error.message.includes('Insufficient points')) {
            return res.status(400).json({ error: 'INSUFFICIENT_POINTS', message: error.message });
        }
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
};
