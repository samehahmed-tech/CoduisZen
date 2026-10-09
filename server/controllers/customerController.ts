import { Request, Response } from 'express';
import { db, pool } from '../db';
import { customers, customerAddresses } from '../../src/db/schema';
import { eq, or, and, desc, lt, gt, sql, isNull } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { parseCursorPagination, decodeCursor, encodeCursor, cursorPaginatedResponse } from '../middleware/pagination';

const customerSelect = {
    id: customers.id,
    name: customers.name,
    phone: customers.phone,
    email: customers.email,
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
        const [customer] = await db.select(customerSelect).top(1).from(customers).where(eq(customers.phone, phone));

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
 * Create customer
 */
export const createCustomer = async (req: Request, res: Response) => {
    try {
        const customerData = req.body;
        const phone = String(customerData.phone || '').trim();
        if (!customerData.name || !phone) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                code: 'VALIDATION_ERROR',
                message: 'Customer name and phone are required.',
            });
        }

        const result = await db.transaction(async (tx) => {
            const [existingCustomer] = await tx
                .select(customerSelect)
                .top(1)
                .from(customers)
                .where(eq(customers.phone, phone));

            if (existingCustomer) return existingCustomer;

            const [newCustomer] = await tx.insert(customers).output(customerSelect).values({
                id: customerData.id || `CUS-${Date.now()}`,
                name: customerData.name,
                phone,
                email: customerData.email,
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

            return newCustomer;
        });

        res.status(201).json(result);
    } catch (error: any) {
        console.error('Customer create failed:', error);
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

        const [updated] = await db.update(customers)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .output()
            .where(eq(customers.id, id));

        if (!updated) {
            return res.status(404).json({ error: 'Customer not found' });
        }

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
        const branchId = user?.branchId || undefined;

        if (!customerId || !points || points <= 0) {
            return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Customer ID and valid points amount are required.' });
        }

        const { loyaltyService } = await import('../services/loyaltyService');
        await loyaltyService.redeemPoints(customerId, Number(points), branchId);

        res.json({ success: true, message: `Successfully redeemed ${points} points.` });
    } catch (error: any) {
        if (error.message.includes('Insufficient points')) {
            return res.status(400).json({ error: 'INSUFFICIENT_POINTS', message: error.message });
        }
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
};
