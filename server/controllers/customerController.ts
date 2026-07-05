import { Request, Response } from 'express';
import { db } from '../db';
import { customers, customerAddresses } from '../../src/db/schema';
import { eq, or, ilike, and, desc, lt, gt, sql } from 'drizzle-orm';
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
            const results = await db.select(customerSelect).from(customers).where(eq(customers.phone, phone));
            return res.json(results);
        }

        // Search mode (limited, no cursor)
        if (search) {
            const results = await db.select(customerSelect).from(customers).where(
                or(
                    ilike(customers.name, `%${search}%`),
                    ilike(customers.phone, `%${search}%`),
                    ilike(customers.email, `%${search}%`)
                )
            ).limit(100);
            return res.json(results);
        }

        // Cursor pagination mode
        const { limit, cursor } = parseCursorPagination(req, 50);
        const conditions: any[] = [];

        if (cursor) {
            const decoded = decodeCursor(cursor);
            if (decoded) {
                conditions.push(
                    sql`(${customers.createdAt}, ${customers.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
                );
            }
        }

        const rows = await db.select(customerSelect)
            .from(customers)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(customers.createdAt), desc(customers.id))
            .limit(limit + 1);

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
        const [customer] = await db.select(customerSelect).from(customers).where(eq(customers.phone, phone));

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

        const [customer] = await db.select(customerSelect).from(customers).where(eq(customers.id, id)).limit(1);
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
                .from(customers)
                .where(eq(customers.phone, phone))
                .limit(1);

            if (existingCustomer) return existingCustomer;

            const [newCustomer] = await tx.insert(customers).values({
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
            }).returning(customerSelect);

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
            .where(eq(customers.id, id))
            .returning();

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

        const result = await db.transaction(async (tx) => {
            await tx.delete(customerAddresses).where(eq(customerAddresses.customerId, id));
            const [deleted] = await tx.delete(customers).where(eq(customers.id, id)).returning();
            return deleted;
        });

        if (!result) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.json({ message: 'Customer deleted', customer: result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
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
