import { Request, Response } from 'express';
import { db } from '../db';
import { deliveryZones, drivers, orders, orderItems, payments, settings, driverTelemetry, driverTelemetryLatest, users, employees, driverCashLedger } from '../../src/db/schema';
import { eq, and, desc, or, inArray, sql } from 'drizzle-orm';
import { transitionOrderStatus } from '../services/orderLifecycleService';
import { getIO } from '../socket';
import { getStringParam } from '../utils/request';
import { webhookService } from '../services/webhookService';
import { parseSettingJson, upsertSetting } from '../utils/settingsStore.js';

type DriverTelemetryData = {
    driverId: string;
    branchId?: string | null;
    lat: number;
    lng: number;
    speedKmh?: number;
    accuracy?: number;
    heading?: number;
    batteryLevel?: number;
    orderId?: string | null;
    updatedAt: string;
};

const SLA_ESCALATIONS_KEY = 'deliverySlaEscalations';
const DRIVER_STATUSES = new Set(['AVAILABLE', 'BUSY', 'BREAK', 'OFFLINE', 'RETURNING']);

const ensureDeliveryTelemetryTables = async () => {
    await db.execute(sql`
        IF OBJECT_ID(N'dbo.driver_telemetry', N'U') IS NULL
        CREATE TABLE dbo.driver_telemetry (
            id int IDENTITY(1,1) PRIMARY KEY,
            driver_id nvarchar(255) NOT NULL,
            branch_id nvarchar(255),
            lat real NOT NULL,
            lng real NOT NULL,
            speed_kmh real,
            accuracy real,
            heading real,
            altitude real,
            battery_level int,
            is_charging bit,
            order_id nvarchar(255),
            created_at datetime2 DEFAULT GETDATE()
        )
    `);
    await db.execute(sql`
        IF OBJECT_ID(N'dbo.driver_telemetry_latest', N'U') IS NULL
        CREATE TABLE dbo.driver_telemetry_latest (
            driver_id nvarchar(255) PRIMARY KEY,
            branch_id nvarchar(255),
            lat real NOT NULL,
            lng real NOT NULL,
            speed_kmh real,
            accuracy real,
            heading real,
            battery_level int,
            order_id nvarchar(255),
            updated_at datetime2 DEFAULT GETDATE()
        )
    `);
};

const normalizeDriverStatus = (status: unknown, fallback = 'AVAILABLE') => {
    const next = String(status || fallback).trim().toUpperCase();
    return DRIVER_STATUSES.has(next) ? next : fallback;
};

/** Cash ledger + branch check-in tables (pilot accountability). */
let driverCashReady: Promise<void> | null = null;
const ensureDriverCashTables = () => {
    if (!driverCashReady) {
        driverCashReady = (async () => {
            await db.execute(sql`
                IF COL_LENGTH('drivers', 'current_cash_balance') IS NULL
                    ALTER TABLE drivers ADD current_cash_balance real NOT NULL DEFAULT 0
            `);
            await db.execute(sql`
                IF OBJECT_ID(N'dbo.driver_cash_ledger', N'U') IS NULL
                CREATE TABLE dbo.driver_cash_ledger (
                    id int IDENTITY(1,1) PRIMARY KEY,
                    driver_id nvarchar(255) NOT NULL,
                    branch_id nvarchar(255),
                    order_id nvarchar(255),
                    type nvarchar(20) NOT NULL,
                    amount real NOT NULL,
                    balance_after real NOT NULL DEFAULT 0,
                    created_by nvarchar(255),
                    notes nvarchar(max),
                    created_at datetime2 DEFAULT GETDATE()
                )
            `);
            await db.execute(sql`
                IF OBJECT_ID(N'dbo.driver_branch_checkins', N'U') IS NULL
                CREATE TABLE dbo.driver_branch_checkins (
                    id nvarchar(255) PRIMARY KEY,
                    driver_id nvarchar(255) NOT NULL,
                    branch_id nvarchar(255),
                    status nvarchar(20) NOT NULL DEFAULT 'REQUESTED',
                    requested_at datetime2 DEFAULT GETDATE(),
                    decided_at datetime2,
                    decided_by nvarchar(255),
                    notes nvarchar(max)
                )
            `);
            await db.execute(sql`
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_cash_ledger_driver' AND object_id = OBJECT_ID('dbo.driver_cash_ledger'))
                    CREATE INDEX idx_cash_ledger_driver ON dbo.driver_cash_ledger(driver_id, created_at)
            `);
            await db.execute(sql`
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_checkins_status' AND object_id = OBJECT_ID('dbo.driver_branch_checkins'))
                    CREATE INDEX idx_checkins_status ON dbo.driver_branch_checkins(status, requested_at)
            `);
        })().catch((err: any) => {
            driverCashReady = null;
            throw err;
        });
    }
    return driverCashReady;
};

/** Current cash held by a driver = ledger truth (COLLECT − SETTLE). */
const getDriverCashBalance = async (driverId: string): Promise<number> => {
    await ensureDriverCashTables();
    const rows = await db.execute(sql`
        SELECT COALESCE(SUM(CASE WHEN type = 'COLLECT' THEN amount ELSE -amount END), 0) AS balance
        FROM dbo.driver_cash_ledger WHERE driver_id = ${driverId}
    `) as any;
    const list = Array.isArray(rows) ? rows : (rows?.rows || rows?.recordset || []);
    return Number(list?.[0]?.balance || 0);
};

const recordCashMovement = async (params: {
    driverId: string; branchId?: string | null; orderId?: string | null;
    type: 'COLLECT' | 'SETTLE'; amount: number; createdBy?: string | null; notes?: string | null;
}): Promise<{ after: number; ledgerId: number }> => {
    await ensureDriverCashTables();
    const amount = Math.max(0, Number(params.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('INVALID_CASH_AMOUNT');
    const before = await getDriverCashBalance(params.driverId);
    if (params.type === 'SETTLE' && amount - before > 0.01) throw new Error('SETTLE_EXCEEDS_BALANCE');
    const after = params.type === 'COLLECT' ? before + amount : Math.max(0, before - amount);
    const [row] = await db.insert(driverCashLedger).output().values({
        driverId: params.driverId,
        branchId: params.branchId || null,
        orderId: params.orderId || null,
        type: params.type,
        amount,
        balanceAfter: after,
        createdBy: params.createdBy || null,
        notes: params.notes || null,
    });
    await db.update(drivers).set({ currentCashBalance: after }).where(eq(drivers.id, params.driverId)).catch(() => {});
    return { after, ledgerId: row.id };
};

const emitDriverStatus = (driver: { id: string; branchId?: string | null; status?: string | null }) => {
    try {
        const branchRoom = driver.branchId ? `branch:${driver.branchId}` : null;
        if (branchRoom) getIO().to(branchRoom).emit('driver:status', { id: driver.id, status: driver.status });
    } catch {
        // socket optional
    }
};

/** delivery_zones.branch_id is optional: NULL = all branches (global zone). */
let deliveryZoneBranchNullableReady: Promise<void> | null = null;
const ensureDeliveryZoneBranchNullable = () => {
    if (!deliveryZoneBranchNullableReady) {
        deliveryZoneBranchNullableReady = db.execute(sql`
            IF COL_LENGTH('delivery_zones', 'branch_id') IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM sys.columns c
                JOIN sys.tables t ON c.object_id = t.object_id
                WHERE t.name = 'delivery_zones' AND c.name = 'branch_id' AND c.is_nullable = 0
            )
                ALTER TABLE delivery_zones ALTER COLUMN branch_id nvarchar(255) NULL
        `).then(() => undefined).catch((err: any) => {
            deliveryZoneBranchNullableReady = null;
            throw err;
        });
    }
    return deliveryZoneBranchNullableReady;
};

const sanitizeZonePayload = (body: any) => {
    const name = String(body?.name || '').trim();
    const nameAr = String(body?.nameAr || body?.name_ar || '').trim() || null;
    const rawBranch = body?.branchId ?? body?.branch_id ?? '';
    const branchId = String(rawBranch || '').trim() || null;
    const deliveryFee = Math.max(0, Number(body?.deliveryFee ?? body?.delivery_fee ?? 0) || 0);
    const minOrderAmount = Math.max(0, Number(body?.minOrderAmount ?? body?.min_order_amount ?? 0) || 0);
    const estimatedTime = Math.max(1, Math.min(480, Number(body?.estimatedTime ?? body?.estimated_time ?? 45) || 45));
    const isActive = body?.isActive ?? body?.is_active ?? true;
    return { name, nameAr, branchId, deliveryFee, minOrderAmount, estimatedTime, isActive: isActive !== false };
};

export const getAllZones = async (req: Request, res: Response) => {
    try {
        await ensureDeliveryZoneBranchNullable().catch(() => {});
        const branchId = getStringParam(req.query.branchId);
        const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
        const conditions: any[] = [];
        if (!includeInactive) conditions.push(eq(deliveryZones.isActive, true));
        if (branchId) {
            // Branch sees its own zones + global (NULL branch) zones.
            conditions.push(or(eq(deliveryZones.branchId, branchId), sql`${deliveryZones.branchId} IS NULL`));
        }
        const zones = conditions.length > 0
            ? await db.select().from(deliveryZones).where(and(...conditions)).orderBy(deliveryZones.name)
            : await db.select().from(deliveryZones).orderBy(deliveryZones.name);
        res.json(zones);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getAvailableDrivers = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const conditions: any[] = [eq(drivers.status, 'AVAILABLE'), eq(drivers.isActive, true)];
        if (branchId) conditions.push(eq(drivers.branchId, branchId as string));
        const availableDrivers = await db.select().from(drivers).where(and(...conditions)).orderBy(desc(drivers.createdAt));
        res.json(availableDrivers);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getDrivers = async (req: Request, res: Response) => {
    try {
        const { branchId, status } = req.query;
        const conditions: any[] = [eq(drivers.isActive, true)];
        if (branchId) conditions.push(eq(drivers.branchId, branchId as string));
        if (status) conditions.push(eq(drivers.status, status as string));
        const allDrivers = await db.select().from(drivers).where(and(...conditions)).orderBy(desc(drivers.createdAt));
        res.json(allDrivers);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createDriver = async (req: Request, res: Response) => {
    try {
        await ensureDriverUserIdColumn();
        const body = req.body || {};
        const name = String(body.name || '').trim();
        const phone = String(body.phone || '').trim();
        const branchId = String(body.branchId || req.user?.branchId || '').trim() || null;
        const createLogin = Boolean(body.createLogin || body.email || body.password || body.pin);
        const driverId = String(body.id || body.userId || crypto.randomUUID()).trim();

        if (!name) return res.status(400).json({ error: 'DRIVER_NAME_REQUIRED' });
        if (!phone) return res.status(400).json({ error: 'DRIVER_PHONE_REQUIRED' });
        if (!branchId) return res.status(400).json({ error: 'DRIVER_BRANCH_REQUIRED' });
        if (createLogin && !String(body.email || '').trim()) return res.status(400).json({ error: 'DRIVER_LOGIN_EMAIL_REQUIRED' });

        const status = normalizeDriverStatus(body.status);
        let createdDriver: any;

        await db.transaction(async (tx) => {
            if (createLogin) {
                const email = String(body.email).trim().toLowerCase();
                let passwordHash: string | undefined;
                let pinCodeHash: string | undefined;
                let pinLoginEnabled = false;

                if (body.password) {
                    const bcrypt = await import('bcryptjs');
                    passwordHash = await bcrypt.hash(String(body.password), 10);
                }
                if (body.pin) {
                    if (!/^\d{6}$/.test(String(body.pin))) {
                        throw new Error('PIN_MUST_BE_6_DIGITS');
                    }
                    const bcrypt = await import('bcryptjs');
                    pinCodeHash = await bcrypt.hash(String(body.pin), 10);
                    pinLoginEnabled = true;
                }

                const [existingUser] = await tx.select().top(1).from(users).where(eq(users.id, driverId));
                if (existingUser) {
                    await tx.update(users)
                        .set({
                        name,
                        role: 'DRIVER',
                        permissions: ['NAV_DRIVER'],
                        assignedBranchId: branchId,
                        allowedBranches: [branchId],
                        isActive: true,
                        ...(passwordHash ? { passwordHash } : {}),
                        ...(pinCodeHash ? { pinCodeHash, pinLoginEnabled } : {}),
                        updatedAt: new Date(),
                    })
                        .where(eq(users.id, driverId));
                } else {
                    await tx.insert(users).values({
                        id: driverId,
                        name,
                        email,
                        role: 'DRIVER',
                        permissions: ['NAV_DRIVER'],
                        assignedBranchId: branchId,
                        allowedBranches: [branchId],
                        isActive: true,
                        passwordHash,
                        pinCodeHash,
                        pinLoginEnabled,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                }
            }

            const [inserted] = await tx.insert(drivers).output().values({
                id: driverId,
                ...(createLogin ? { userId: driverId } : {}),
                name,
                phone,
                branchId,
                status,
                isActive: body.isActive !== false,
                createdAt: new Date(),
            });
            createdDriver = inserted;
        });

        emitDriverStatus(createdDriver);
        res.status(201).json(createdDriver);
    } catch (error: any) {
        const message = String(error?.message || '');
        if (message.includes('duplicate') || message.includes('unique')) {
            return res.status(409).json({ error: 'DRIVER_OR_LOGIN_ALREADY_EXISTS' });
        }
        res.status(500).json({ error: error.message || 'FAILED_TO_CREATE_DRIVER' });
    }
};

export const updateDriver = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'DRIVER_ID_REQUIRED' });

        const patch: any = {};
        if (req.body?.name !== undefined) patch.name = String(req.body.name || '').trim();
        if (req.body?.phone !== undefined) patch.phone = String(req.body.phone || '').trim();
        if (req.body?.branchId !== undefined) patch.branchId = String(req.body.branchId || '').trim() || null;
        if (req.body?.status !== undefined) patch.status = normalizeDriverStatus(req.body.status);
        if (req.body?.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);
        if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'NO_DRIVER_CHANGES' });

        const [updated] = await db.update(drivers).set(patch).output().where(eq(drivers.id, id));
        if (!updated) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
        emitDriverStatus(updated);
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_UPDATE_DRIVER' });
    }
};

export const updateDriverStatus = async (req: Request, res: Response) => {
    try {
        await ensureDriverUserIdColumn();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'DRIVER_ID_REQUIRED' });
        const status = normalizeDriverStatus(req.body?.status, '');
        if (!status) return res.status(400).json({ error: 'INVALID_DRIVER_STATUS' });
        // Driver app sends the login user id, which may differ from the driver
        // row id (linked via user_id) — resolve either form.
        const [row] = await db.select({ id: drivers.id }).from(drivers)
            .where(or(eq(drivers.id, id), eq(drivers.userId, id))).top(1);
        if (!row) return res.status(404).json({ error: 'Driver not found' });
        // Going OFFLINE with live orders strands them — refuse and tell the
        // branch to reassign first.
        if (status === 'OFFLINE') {
            const stuck = await db.select({ id: orders.id }).from(orders).where(
                and(eq(orders.driverId, row.id), inArray(orders.status, ['READY', 'ASSIGNED', 'OUT_FOR_DELIVERY'])),
            ).top(1);
            if (stuck.length > 0) {
                const [{ count }] = await db.select({ count: sql`COUNT(*)` }).from(orders).where(
                    and(eq(orders.driverId, row.id), inArray(orders.status, ['READY', 'ASSIGNED', 'OUT_FOR_DELIVERY'])),
                ) as any[];
                return res.status(409).json({ error: 'DRIVER_HAS_ACTIVE_ORDERS', activeOrders: Number(count || 0) });
            }
        }
        const [updated] = await db.update(drivers).set({ status }).output().where(eq(drivers.id, row.id));
        if (!updated) return res.status(404).json({ error: 'Driver not found' });
        emitDriverStatus(updated);
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const assignDriver = async (req: Request, res: Response) => {
    try {
        const { orderId, driverId } = req.body;
        let orderBranchId: string | null = null;
        await db.transaction(async (tx) => {
            // Driver must exist, be active and not offline. BUSY no longer
            // blocks assignment — dispatchers batch multiple orders per pilot,
            // and the pilot confirms each pickup from the driver screen.
            const [driver] = await tx.select().top(1).from(drivers).where(eq(drivers.id, driverId));
            if (!driver) throw new Error('DRIVER_NOT_FOUND');
            if (!driver.isActive || String(driver.status || '').toUpperCase() === 'OFFLINE') throw new Error('DRIVER_NOT_AVAILABLE');
            // HR linkage: a deactivated login or HR employee record blocks
            // dispatch, so offboarded pilots can't be booked from stale rows.
            if ((driver as any).userId) {
                const [linkedUser] = await tx.select({ isActive: users.isActive }).top(1)
                    .from(users).where(eq(users.id, String((driver as any).userId)));
                if (linkedUser && linkedUser.isActive === false) throw new Error('DRIVER_USER_DEACTIVATED');
                const [linkedEmployee] = await tx.select({ isActive: employees.isActive }).top(1)
                    .from(employees).where(eq(employees.userId, String((driver as any).userId)));
                if (linkedEmployee && linkedEmployee.isActive === false) throw new Error('DRIVER_EMPLOYEE_DEACTIVATED');
            }

            const [order] = await tx.select().top(1).from(orders).where(eq(orders.id, orderId));
            if (!order) throw new Error('ORDER_NOT_FOUND');
            // Cross-branch dispatch is a data leak — pilots only run their own branch.
            if (driver.branchId && order.branchId && String(driver.branchId) !== String(order.branchId)) {
                throw new Error('CROSS_BRANCH_ASSIGN');
            }
            // Reassign is allowed before pickup; once the pilot is on the road
            // the order sticks to them (prevents mid-route confusion).
            if (order.driverId && order.driverId !== driverId && String(order.status) === 'OUT_FOR_DELIVERY') {
                throw new Error('ORDER_ALREADY_ON_ROAD');
            }
            // The pilot page only lists READY/ASSIGNED orders and pickup only
            // accepts those — assigning a kitchen-pending order would make it
            // invisible to the pilot, so refuse early with a clear error.
            if (!['READY', 'ASSIGNED'].includes(String(order.status))) {
                throw new Error(`ORDER_NOT_READY_FOR_DISPATCH|status=${order.status}`);
            }

            // 1. Link driver, keep kitchen status untouched. The pilot confirms
            // pickup (READY -> OUT_FOR_DELIVERY) from the driver screen, so
            // tracking reflects reality instead of jumping straight to road.
            const [updatedOrder] = await tx.update(orders)
                .set({ driverId, updatedAt: new Date() })
                .output()
                .where(eq(orders.id, orderId));
            orderBranchId = updatedOrder?.branchId || null;
        });

        try {
            const branchRoom = orderBranchId ? `branch:${orderBranchId}` : null;
            if (branchRoom) {
                getIO().to(branchRoom).emit('dispatch:assigned', { orderId, driverId });
            }
        } catch {
            // socket optional
        }

        res.json({ message: 'Driver assigned successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

let driverUserIdReady: Promise<void> | null = null;
const ensureDriverUserIdColumn = () => {
    if (!driverUserIdReady) {
        driverUserIdReady = db.execute(sql`
            IF COL_LENGTH('drivers', 'user_id') IS NULL
                ALTER TABLE drivers ADD user_id nvarchar(255)
        `).then(() => undefined).catch((err: any) => {
            driverUserIdReady = null;
            throw err;
        });
    }
    return driverUserIdReady;
};

/** Delivery OTP column (proof-of-delivery code handed to the customer). */
let deliveryOtpReady: Promise<void> | null = null;
const ensureDeliveryOtpColumn = () => {
    if (!deliveryOtpReady) {
        deliveryOtpReady = db.execute(sql`
            IF COL_LENGTH('orders', 'delivery_otp') IS NULL
                ALTER TABLE orders ADD delivery_otp nvarchar(10)
        `).then(() => undefined).catch((err: any) => {
            deliveryOtpReady = null;
            throw err;
        });
    }
    return deliveryOtpReady;
};

/** Driver rows owned by the logged-in driver user (id match + lazy backfill). */
const resolveMyDriverIds = async (userId: string): Promise<{ ids: string[]; branchId: string | null }> => {
    await ensureDriverUserIdColumn();
    const rows = await db
        .select({ id: drivers.id, userId: drivers.userId, branchId: drivers.branchId })
        .from(drivers)
        .where(or(eq(drivers.id, userId), eq(drivers.userId, userId)));
    const missing = rows.filter((r) => !r.userId && r.id === userId);
    if (missing.length > 0) {
        await db.update(drivers).set({ userId }).where(eq(drivers.id, userId)).catch(() => {});
    }
    return { ids: rows.map((r) => r.id), branchId: rows[0]?.branchId || null };
};

const DRIVER_ACTIVE_STATUSES = ['READY', 'OUT_FOR_DELIVERY', 'ASSIGNED'];

const getOrderCashDue = async (orderId: string, order: any): Promise<number> => {
    const pays = await db.select().from(payments).where(eq(payments.orderId, orderId));
    if (pays.length > 0) {
        return pays
            .filter((p: any) => String(p.method || '').toUpperCase() === 'CASH')
            .reduce((sum: number, p: any) => sum + Math.max(0, Number(p.amount || 0)), 0);
    }
    const method = String(order?.paymentMethod || '').toUpperCase();
    if (!method || method === 'CASH') return Math.max(0, Number(order?.total || 0));
    return 0;
};

/** Scoped task list for the logged-in pilot — no mass order download. */
export const getMyAssignments = async (req: Request, res: Response) => {
    try {
        const userId = String(req.user?.id || '').trim();
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const { ids: driverIds, branchId: driverBranch } = await resolveMyDriverIds(userId);
        if (driverIds.length === 0) return res.json([]);
        const branchId = (req.effectiveBranchId as string) || driverBranch || undefined;

        const conditions: any[] = [
            inArray(orders.driverId, driverIds),
            inArray(orders.status, DRIVER_ACTIVE_STATUSES),
        ];
        if (branchId) conditions.push(eq(orders.branchId, branchId as string));
        const rows = await db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt)).top(50);
        // Never leak the handover OTP to the pilot app — the customer holds it.
        for (const r of rows) { delete (r as any).delivery_otp; }
        const orderIds = rows.map((o) => o.id);
        const [itemRows, payRows] = await Promise.all([
            orderIds.length > 0 ? db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : Promise.resolve([] as any[]),
            orderIds.length > 0 ? db.select().from(payments).where(inArray(payments.orderId, orderIds)) : Promise.resolve([] as any[]),
        ]);
        const itemsByOrder: Record<string, any[]> = {};
        for (const item of itemRows) {
            (itemsByOrder[item.orderId] = itemsByOrder[item.orderId] || []).push({
                name: item.name,
                quantity: item.quantity,
                notes: item.notes,
            });
        }
        const paysByOrder: Record<string, any[]> = {};
        for (const pay of payRows) {
            (paysByOrder[pay.orderId] = paysByOrder[pay.orderId] || []).push({ method: pay.method, amount: pay.amount });
        }
        res.json(rows.map((order: any) => ({ ...order, items: itemsByOrder[order.id] || [], payments: paysByOrder[order.id] || [] })));
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_LOAD_ASSIGNMENTS' });
    }
};

/** Pilot confirms pickup: READY/ASSIGNED -> OUT_FOR_DELIVERY + driver BUSY. */
export const pickupOrder = async (req: Request, res: Response) => {
    try {
        const userId = String(req.user?.id || '').trim();
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const orderId = String((req.params as any).id || '').trim();
        if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });
        const { ids: driverIds } = await resolveMyDriverIds(userId);
        if (driverIds.length === 0) return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });

        const [order] = await db.select().top(1).from(orders).where(
            and(eq(orders.id, orderId), inArray(orders.driverId, driverIds)),
        );
        if (!order) return res.status(404).json({ error: 'ORDER_NOT_ASSIGNED_TO_YOU' });
        if (!['READY', 'ASSIGNED'].includes(String(order.status))) {
            return res.status(409).json({ error: 'ORDER_NOT_READY_FOR_PICKUP', status: order.status });
        }

        await transitionOrderStatus({
            orderId,
            nextStatus: 'OUT_FOR_DELIVERY',
            notes: `Picked up by pilot`,
            changedBy: `driver:${userId}`,
            user: {
                role: req.user?.role,
                branchId: req.user?.branchId,
                allowedBranches: req.user?.allowedBranches,
                permissions: req.user?.permissions,
            },
        } as any);
        // Proof-of-delivery code: generated at pickup and sent to the CUSTOMER
        // (WhatsApp) — the pilot learns it only from the customer at handover.
        // It is never exposed to dispatch screens (collusion-proof).
        let otp: string | null = null;
        try {
            await ensureDeliveryOtpColumn();
            otp = String(Math.floor(1000 + Math.random() * 9000));
            await db.execute(sql`UPDATE orders SET delivery_otp = ${otp} WHERE id = ${orderId}`);
            const customerPhone = String((order as any).customerPhone || '').trim();
            if (customerPhone) {
                const { sendWhatsAppText } = await import('../services/whatsappService');
                const baseUrl = String(process.env.PUBLIC_TRACKING_URL || process.env.FRONTEND_URL || '').replace(/\/+$/, '');
                const trackPart = baseUrl ? ` — تابع طلبك لحظة بلحظة: ${baseUrl}/t/${orderId}` : '';
                await sendWhatsAppText({
                    to: customerPhone,
                    text: `كود استلام طلبك #${(order as any).orderNumber || orderId}: ${otp} — أعطه للطيار عند الاستلام.${trackPart}`,
                }).catch(() => undefined);
            }
        } catch { otp = null; /* OTP is enforcement-level only when stored */ }
        await db.update(drivers).set({ status: 'BUSY' }).where(inArray(drivers.id, driverIds));
        try {
            if (order.branchId) getIO().to(`branch:${order.branchId}`).emit('driver:status', { id: driverIds[0], status: 'BUSY' });
        } catch { /* socket optional */ }
        // Never return the OTP to the driver app: the pilot must collect it
        // from the customer at handover (sent to the customer by WhatsApp).
        res.json({ ok: true, status: 'OUT_FOR_DELIVERY', otpSent: Boolean(otp) });
    } catch (error: any) {
        res.status(Number(error?.status) || 500).json({ error: error?.code || error?.message || 'PICKUP_FAILED' });
    }
};

/** Pilot confirms delivery with proof-of-collection when cash is due. */
export const deliverOrder = async (req: Request, res: Response) => {
    try {
        const userId = String(req.user?.id || '').trim();
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const orderId = String((req.params as any).id || '').trim();
        if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });
        let { ids: driverIds } = await resolveMyDriverIds(userId);
        let actingAs: string = `driver:${userId}`;
        let skipOtp = false;
        if (driverIds.length === 0) {
            // Branch fallback: a manager closing delivery on behalf of an
            // offline pilot (cash still lands in the pilot's ledger).
            // Requires manager PIN + written reason — verified here, audited.
            const role = String(req.user?.role || '').toUpperCase();
            if (!['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'CALL_CENTER_MANAGER', 'MANAGER'].includes(role)) {
                return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
            }
            const [target] = await db.select({ driverId: orders.driverId, branchId: orders.branchId }).top(1).from(orders).where(eq(orders.id, orderId));
            if (!target?.driverId) return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
            const managerPin = String(req.body?.managerPin || '').trim();
            const fallbackReason = String(req.body?.notes || req.body?.reason || '').trim();
            if (!managerPin || fallbackReason.length < 3) {
                return res.status(400).json({ error: 'MANAGER_PIN_AND_REASON_REQUIRED' });
            }
            const approvers = await db.select({
                id: users.id, name: users.name, role: users.role,
                assignedBranchId: users.assignedBranchId, allowedBranches: users.allowedBranches,
                managerPin: users.managerPin, pinCodeHash: users.pinCodeHash,
                pinLoginEnabled: users.pinLoginEnabled, passwordHash: users.passwordHash,
            }).from(users).where(eq(users.isActive, true));
            const { findApproverByPin } = await import('../services/managerApprovalAuth');
            const approver = await findApproverByPin(approvers as any, managerPin, String(target.branchId || ''));
            if (!approver) return res.status(403).json({ error: 'INVALID_MANAGER_PIN' });
            driverIds = [String(target.driverId)];
            actingAs = `manager:${approver.id}`;
            skipOtp = true;
        }

        const [order] = await db.select().top(1).from(orders).where(
            and(eq(orders.id, orderId), inArray(orders.driverId, driverIds)),
        );
        if (!order) return res.status(404).json({ error: 'ORDER_NOT_ASSIGNED_TO_YOU' });
        if (String(order.status) !== 'OUT_FOR_DELIVERY') {
            return res.status(409).json({ error: 'ORDER_NOT_OUT_FOR_DELIVERY', status: order.status });
        }

        // Proof of collection: cash due must be confirmed collected.
        const cashDue = await getOrderCashDue(orderId, order);
        const cashCollected = Number(req.body?.cashCollected ?? 0);
        if (cashDue > 0 && !(Number.isFinite(cashCollected) && cashCollected + 0.01 >= cashDue)) {
            return res.status(400).json({ error: 'CASH_COLLECTION_MISMATCH', expected: cashDue });
        }

        // Proof of handover: when an OTP was issued at pickup, the pilot must
        // enter the code the customer received — otherwise anyone could close it.
        // (Branch fallback closes are trusted and skip the code.)
        try { await ensureDeliveryOtpColumn(); } catch { /* best effort */ }
        const expectedOtp = String((order as any).delivery_otp || '').trim();
        if (expectedOtp && !skipOtp) {
            const givenOtp = String(req.body?.deliveryOtp || '').trim();
            if (givenOtp !== expectedOtp) {
                return res.status(400).json({ error: 'DELIVERY_OTP_MISMATCH' });
            }
        }

        const podNotes = [
            cashDue > 0 ? `Cash collected: ${cashCollected.toFixed(2)}` : 'Prepaid — no collection',
            String(req.body?.notes || '').trim(),
        ].filter(Boolean).join(' | ');

        // Pilot cash accountability: record the collection in the ledger first.
        // If the status transition below fails, the ledger row is rolled back.
        let ledgerRecorded = false;
        if (cashDue > 0 && cashCollected > 0) {
            await recordCashMovement({
                driverId: driverIds[0],
                branchId: order.branchId,
                orderId,
                type: 'COLLECT',
                amount: cashCollected,
                createdBy: actingAs,
                notes: `Order #${order.orderNumber || orderId}`,
            });
            ledgerRecorded = true;
        }
        try {
            await transitionOrderStatus({
                orderId,
                nextStatus: 'DELIVERED',
                notes: podNotes,
                changedBy: actingAs,
                user: {
                    role: req.user?.role,
                    branchId: req.user?.branchId,
                    allowedBranches: req.user?.allowedBranches,
                    permissions: req.user?.permissions,
                },
            } as any);
        } catch (e) {
            if (ledgerRecorded) {
                await db.execute(sql`DELETE FROM dbo.driver_cash_ledger WHERE driver_id = ${driverIds[0]} AND order_id = ${orderId} AND type = 'COLLECT'`).catch(() => {});
                await db.update(drivers).set({ currentCashBalance: await getDriverCashBalance(driverIds[0]).catch(() => 0) }).where(eq(drivers.id, driverIds[0])).catch(() => {});
            }
            throw e;
        }
        if (ledgerRecorded) {
            try {
                const bal = await getDriverCashBalance(driverIds[0]);
                if (order.branchId) getIO().to(`branch:${order.branchId}`).emit('driver:cash', { id: driverIds[0], balance: bal });
            } catch { /* socket optional */ }
        }

        // Back to RETURNING only when nothing else is still assigned.
        // (Previously checked OUT_FOR_DELIVERY only, so a pilot holding a
        // second READY order was wrongly marked as returning.)
        const [stillActive] = await db.select({ id: orders.id }).top(1).from(orders).where(
            and(inArray(orders.driverId, driverIds), inArray(orders.status, ['READY', 'ASSIGNED', 'OUT_FOR_DELIVERY'])),
        );
        const backStatus = stillActive ? 'BUSY' : 'RETURNING';
        if (!stillActive) {
            await db.update(drivers).set({ status: 'RETURNING' }).where(inArray(drivers.id, driverIds));
        } else {
            await db.update(drivers).set({ status: 'BUSY' }).where(inArray(drivers.id, driverIds));
        }
        // Single-use code: burn it so a delivered order can never be re-closed.
        try { await db.execute(sql`UPDATE orders SET delivery_otp = NULL WHERE id = ${orderId}`); } catch { /* best effort */ }
        try {
            if (order.branchId) getIO().to(`branch:${order.branchId}`).emit('driver:status', { id: driverIds[0], status: backStatus });
        } catch { /* socket optional */ }
        res.json({ ok: true, status: 'DELIVERED', cashDue, cashCollected: cashDue > 0 ? cashCollected : 0 });
    } catch (error: any) {
        res.status(Number(error?.status) || 500).json({ error: error?.code || error?.message || 'DELIVERY_FAILED' });
    }
};

/** Pilot reports a failed delivery — order returns to the dispatch queue. */
export const failDelivery = async (req: Request, res: Response) => {
    try {
        const userId = String(req.user?.id || '').trim();
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const orderId = String((req.params as any).id || '').trim();
        if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });
        const reason = String(req.body?.reason || '').trim().slice(0, 500);
        if (reason.length < 3) return res.status(400).json({ error: 'FAILURE_REASON_REQUIRED' });

        const { ids: driverIds } = await resolveMyDriverIds(userId);
        if (driverIds.length === 0) return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });

        const [order] = await db.select().top(1).from(orders).where(
            and(eq(orders.id, orderId), inArray(orders.driverId, driverIds)),
        );
        if (!order) return res.status(404).json({ error: 'ORDER_NOT_ASSIGNED_TO_YOU' });
        if (String(order.status) !== 'OUT_FOR_DELIVERY') {
            return res.status(409).json({ error: 'ORDER_NOT_OUT_FOR_DELIVERY', status: order.status });
        }

        // OUT_FOR_DELIVERY → READY is outside the normal policy map; this is
        // the sanctioned recall path (branch sees the reason in history).
        await transitionOrderStatus({
            orderId,
            nextStatus: 'READY',
            notes: `Failed delivery returned to dispatch: ${reason}`,
            changedBy: `driver:${userId}`,
            skipPolicy: true,
            user: {
                role: req.user?.role,
                branchId: req.user?.branchId,
                allowedBranches: req.user?.allowedBranches,
                permissions: req.user?.permissions,
            },
        } as any);
        await db.update(orders).set({ driverId: null, updatedAt: new Date() }).where(eq(orders.id, orderId));

        const [stillActive] = await db.select({ id: orders.id }).top(1).from(orders).where(
            and(inArray(orders.driverId, driverIds), inArray(orders.status, ['READY', 'ASSIGNED', 'OUT_FOR_DELIVERY'])),
        );
        const nextStatus = stillActive ? 'BUSY' : 'AVAILABLE';
        await db.update(drivers).set({ status: nextStatus }).where(inArray(drivers.id, driverIds));
        try {
            if (order.branchId) getIO().to(`branch:${order.branchId}`).emit('driver:status', { id: driverIds[0], status: nextStatus });
        } catch { /* socket optional */ }
        res.json({ ok: true, status: 'READY', driverStatus: nextStatus });
    } catch (error: any) {
        res.status(Number(error?.status) || 500).json({ error: error?.code || error?.message || 'FAIL_DELIVERY_FAILED' });
    }
};

export const updateDriverLocation = async (req: Request, res: Response) => {
    try {
        await ensureDeliveryTelemetryTables();
        const driverId = getStringParam((req.params as any).id);
        if (!driverId) return res.status(400).json({ error: 'DRIVER_ID_REQUIRED' });

        const lat = Number(req.body?.lat);
        const lng = Number(req.body?.lng);
        const speedKmh = req.body?.speedKmh !== undefined ? Number(req.body.speedKmh) : undefined;
        const accuracy = req.body?.accuracy !== undefined ? Number(req.body.accuracy) : undefined;
        const heading = req.body?.heading !== undefined ? Number(req.body.heading) : undefined;
        const batteryLevel = req.body?.batteryLevel !== undefined ? Number(req.body.batteryLevel) : undefined;
        const isCharging = req.body?.isCharging;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({ error: 'INVALID_COORDINATES' });
        }

        await ensureDriverUserIdColumn();
        // Driver app sends the login user id, which may differ from the driver
        // row id (linked via user_id) — resolve either form so GPS fixes from
        // the pilot's phone are never dropped with a 404.
        const [driver] = await db.select().top(1).from(drivers)
            .where(or(eq(drivers.id, driverId), eq(drivers.userId, driverId)));
        if (!driver) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });

        // 1. Insert into telemetry history (time-series)
        await db.insert(driverTelemetry).values({
            driverId: driver.id,
            branchId: driver.branchId || null,
            lat,
            lng,
            ...(Number.isFinite(speedKmh) ? { speedKmh } : {}),
            ...(Number.isFinite(accuracy) ? { accuracy } : {}),
            ...(Number.isFinite(heading) ? { heading } : {}),
            ...(Number.isFinite(batteryLevel) ? { batteryLevel } : {}),
            ...(isCharging !== undefined ? { isCharging: Boolean(isCharging) } : {}),
        });

        // 2. Upsert into latest-telemetry (fast lookups)
        const now = new Date();
        const telemetryUpdate = {
            branchId: driver.branchId || null,
            lat,
            lng,
            ...(Number.isFinite(speedKmh) ? { speedKmh } : {}),
            ...(Number.isFinite(accuracy) ? { accuracy } : {}),
            ...(Number.isFinite(heading) ? { heading } : {}),
            ...(Number.isFinite(batteryLevel) ? { batteryLevel } : {}),
            updatedAt: now,
        };
        const [existingTelemetry] = await db.select().top(1).from(driverTelemetryLatest).where(eq(driverTelemetryLatest.driverId, driver.id));
        if (existingTelemetry) {
            await db.update(driverTelemetryLatest).set(telemetryUpdate).where(eq(driverTelemetryLatest.driverId, driver.id));
        } else {
            await db.insert(driverTelemetryLatest).values({
                driverId: driver.id,
                ...telemetryUpdate,
            });
        }

        const nextItem: DriverTelemetryData = {
            driverId: driver.id,
            branchId: driver.branchId || null,
            lat,
            lng,
            ...(Number.isFinite(speedKmh) ? { speedKmh } : {}),
            ...(Number.isFinite(accuracy) ? { accuracy } : {}),
            ...(Number.isFinite(heading) ? { heading } : {}),
            ...(Number.isFinite(batteryLevel) ? { batteryLevel } : {}),
            updatedAt: now.toISOString(),
        };

        // 3. Emit via Socket.io
        try {
            const branchRoom = driver.branchId ? `branch:${driver.branchId}` : null;
            if (branchRoom) getIO().to(branchRoom).emit('driver:location', nextItem);
        } catch {
            // socket optional
        }

        // 4. Dispatch via webhook system
        webhookService.dispatch('driver.location_updated', nextItem, driver.branchId || undefined).catch(() => {});

        res.json(nextItem);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_UPDATE_DRIVER_LOCATION' });
    }
};

export const getDriverTelemetry = async (req: Request, res: Response) => {
    try {
        await ensureDeliveryTelemetryTables();
        const branchId = getStringParam(req.query.branchId);

        // Opportunistic retention: ~10% of reads prune fixes older than 30 days.
        if (Math.random() < 0.1) {
            db.execute(sql`DELETE FROM dbo.driver_telemetry WHERE created_at < DATEADD(day, -30, GETDATE())`).catch(() => {});
        }

        // Query from dedicated indexed table instead of KV store
        const conditions: any[] = [];
        if (branchId) conditions.push(eq(driverTelemetryLatest.branchId, branchId));

        const latest = conditions.length > 0
            ? await db.select().from(driverTelemetryLatest).where(and(...conditions)).orderBy(desc(driverTelemetryLatest.updatedAt))
            : await db.select().from(driverTelemetryLatest).orderBy(desc(driverTelemetryLatest.updatedAt));

        res.json(latest.map(t => ({
            driverId: t.driverId,
            branchId: t.branchId,
            lat: t.lat,
            lng: t.lng,
            speedKmh: t.speedKmh,
            accuracy: t.accuracy,
            heading: t.heading,
            batteryLevel: t.batteryLevel,
            orderId: t.orderId,
            updatedAt: t.updatedAt?.toISOString() || new Date().toISOString(),
        })));
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_LOAD_DRIVER_TELEMETRY' });
    }
};

type SlaAlert = {
    id: string;
    orderId: string;
    branchId?: string | null;
    driverId?: string | null;
    type: 'LATE_DELIVERY' | 'MISSED_PICKUP' | 'UNASSIGNED_DRIVER' | 'STALE_DRIVER_LOCATION';
    severity: 'MEDIUM' | 'HIGH' | 'CRITICAL';
    ageMinutes: number;
    details: string;
    createdAt: string;
};

type DeliverySlaEscalationRecord = SlaAlert & {
    status: 'OPEN' | 'RESOLVED';
    escalatedBy?: string | null;
};

const loadSlaEscalations = async (): Promise<DeliverySlaEscalationRecord[]> => {
    const [row] = await db.select().top(1).from(settings).where(eq(settings.key, SLA_ESCALATIONS_KEY));
    return parseSettingJson<DeliverySlaEscalationRecord[]>(row?.value, []);
};

const saveSlaEscalations = async (records: DeliverySlaEscalationRecord[], updatedBy?: string | null) => {
    await upsertSetting({
        key: SLA_ESCALATIONS_KEY,
        value: records,
        category: 'delivery',
        updatedBy: updatedBy || 'system',
    });
};

const buildSlaAlerts = async (branchId?: string, delayMinutes = 45, staleLocationMinutes = 10): Promise<SlaAlert[]> => {
    await ensureDeliveryTelemetryTables();
    const latestTelemetry = await db.select().from(driverTelemetryLatest);
    const telemetry: Record<string, any> = {};
    for (const t of latestTelemetry) {
        telemetry[t.driverId] = t;
    }
    const conditions: any[] = [
        eq(orders.type, 'DELIVERY'),
        or(eq(orders.status, 'READY'), eq(orders.status, 'PREPARING'), eq(orders.status, 'OUT_FOR_DELIVERY')),
    ];
    if (branchId) conditions.push(eq(orders.branchId, branchId));

    const activeDeliveryOrders = await db.select({
        id: orders.id,
        status: orders.status,
        branchId: orders.branchId,
        driverId: orders.driverId,
        createdAt: orders.createdAt,
        deliveryAddress: orders.deliveryAddress,
    }).from(orders).where(and(...conditions));

    const now = Date.now();
    const alerts: SlaAlert[] = [];

    for (const order of activeDeliveryOrders) {
        const createdAt = new Date(order.createdAt || new Date()).getTime();
        const ageMinutes = Math.max(0, Math.floor((now - createdAt) / 60000));
        const driverId = order.driverId || null;
        const base = {
            orderId: order.id,
            branchId: order.branchId || null,
            driverId,
            ageMinutes,
            createdAt: new Date().toISOString(),
        };

        if (!driverId && ageMinutes >= 20) {
            alerts.push({
                id: `sla-${order.id}-unassigned`,
                ...base,
                type: 'UNASSIGNED_DRIVER',
                severity: ageMinutes >= delayMinutes ? 'HIGH' : 'MEDIUM',
                details: `No driver assigned for ${ageMinutes}m`,
            });
        }

        if (order.status === 'READY' && ageMinutes >= delayMinutes) {
            alerts.push({
                id: `sla-${order.id}-pickup`,
                ...base,
                type: 'MISSED_PICKUP',
                severity: ageMinutes >= delayMinutes + 20 ? 'CRITICAL' : 'HIGH',
                details: `Pickup delay ${ageMinutes}m`,
            });
        }

        if (order.status === 'OUT_FOR_DELIVERY' && ageMinutes >= delayMinutes) {
            alerts.push({
                id: `sla-${order.id}-late`,
                ...base,
                type: 'LATE_DELIVERY',
                severity: ageMinutes >= delayMinutes + 25 ? 'CRITICAL' : 'HIGH',
                details: `Delivery delay ${ageMinutes}m`,
            });
        }

        if (driverId && telemetry[driverId]?.updatedAt) {
            const staleMinutes = Math.floor((now - new Date(telemetry[driverId].updatedAt).getTime()) / 60000);
            if (staleMinutes >= staleLocationMinutes) {
                alerts.push({
                    id: `sla-${order.id}-stale-location`,
                    ...base,
                    type: 'STALE_DRIVER_LOCATION',
                    severity: staleMinutes >= staleLocationMinutes + 10 ? 'CRITICAL' : 'MEDIUM',
                    details: `Driver location stale for ${staleMinutes}m`,
                });
            }
        }
    }

    alerts.sort((a, b) => b.ageMinutes - a.ageMinutes);
    return alerts;
};

export const getSlaAlerts = async (req: Request, res: Response) => {
    try {
        const branchId = getStringParam(req.query.branchId);
        const delayMinutes = Math.max(15, Number(req.query.delayMinutes || 45));
        const staleLocationMinutes = Math.max(3, Number(req.query.staleLocationMinutes || 10));
        const alerts = await buildSlaAlerts(branchId, delayMinutes, staleLocationMinutes);
        res.json({
            branchId: branchId || 'ALL',
            delayMinutes,
            staleLocationMinutes,
            total: alerts.length,
            alerts,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_LOAD_SLA_ALERTS' });
    }
};

export const autoEscalateSlaAlerts = async (req: Request, res: Response) => {
    try {
        const branchId = String(req.body?.branchId || req.user?.branchId || '').trim() || undefined;
        const delayMinutes = Math.max(15, Number(req.body?.delayMinutes || 45));
        const staleLocationMinutes = Math.max(3, Number(req.body?.staleLocationMinutes || 10));
        const alerts = await buildSlaAlerts(branchId, delayMinutes, staleLocationMinutes);
        const current = await loadSlaEscalations();
        const openKeys = new Set(current.filter((e) => e.status === 'OPEN').map((e) => `${e.orderId}:${e.type}`));
        const createdAt = new Date().toISOString();

        const additions: DeliverySlaEscalationRecord[] = [];
        for (const alert of alerts.filter((a) => a.severity === 'HIGH' || a.severity === 'CRITICAL')) {
            const key = `${alert.orderId}:${alert.type}`;
            if (openKeys.has(key)) continue;
            additions.push({
                ...alert,
                status: 'OPEN',
                createdAt,
                escalatedBy: req.user?.id || 'system',
            });
        }

        if (additions.length > 0) {
            const next = [...additions, ...current].slice(0, 5000);
            await saveSlaEscalations(next, req.user?.id || null);
            try {
                const io = getIO();
                const room = branchId ? `branch:${branchId}` : null;
                if (room) io.to(room).emit('delivery:sla-escalation', { count: additions.length, alerts: additions });
            } catch {
                // socket optional
            }
        }

        res.json({
            scanned: alerts.length,
            escalated: additions.length,
            branchId: branchId || 'ALL',
            escalations: additions,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_ESCALATE_SLA_ALERTS' });
    }
};

export const createZone = async (req: Request, res: Response) => {
    try {
        await ensureDeliveryZoneBranchNullable().catch(() => {});
        const payload = sanitizeZonePayload(req.body);
        if (!payload.name) return res.status(400).json({ error: 'ZONE_NAME_REQUIRED' });
        if (!Number.isFinite(payload.deliveryFee)) return res.status(400).json({ error: 'INVALID_DELIVERY_FEE' });
        const [inserted] = await db.insert(deliveryZones).output().values(payload);
        res.status(201).json(inserted);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const updateZone = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'INVALID_ZONE_ID' });
        const payload = sanitizeZonePayload({ ...(req.body || {}), isActive: req.body?.isActive ?? req.body?.is_active ?? true });
        if (req.body?.name !== undefined && !payload.name) return res.status(400).json({ error: 'ZONE_NAME_REQUIRED' });
        const patch: any = {};
        if (req.body?.name !== undefined) { patch.name = payload.name; patch.nameAr = payload.nameAr; }
        else if (req.body?.nameAr !== undefined || req.body?.name_ar !== undefined) patch.nameAr = payload.nameAr;
        if (req.body?.branchId !== undefined || req.body?.branch_id !== undefined) patch.branchId = payload.branchId;
        if (req.body?.deliveryFee !== undefined || req.body?.delivery_fee !== undefined) patch.deliveryFee = payload.deliveryFee;
        if (req.body?.minOrderAmount !== undefined || req.body?.min_order_amount !== undefined) patch.minOrderAmount = payload.minOrderAmount;
        if (req.body?.estimatedTime !== undefined || req.body?.estimated_time !== undefined) patch.estimatedTime = payload.estimatedTime;
        if (req.body?.isActive !== undefined || req.body?.is_active !== undefined) patch.isActive = payload.isActive;
        if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'NO_ZONE_CHANGES' });
        const [updated] = await db.update(deliveryZones).set(patch).output().where(eq(deliveryZones.id, id));
        if (!updated) return res.status(404).json({ error: 'ZONE_NOT_FOUND' });
        res.json(updated);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const deleteZone = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        await db.delete(deliveryZones).where(eq(deliveryZones.id, id));
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

// ══════════════════════════════════════════════════════════════
// Pilot cash account + branch settlement + return check-in approval
// ══════════════════════════════════════════════════════════════

const dayBounds = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { start };
};

const buildCashPayload = async (driverId: string, branchId?: string | null) => {
    await ensureDriverCashTables();
    const [driver] = await db.select().top(1).from(drivers).where(eq(drivers.id, driverId));
    if (!driver) return null;
    const balance = await getDriverCashBalance(driverId);
    const { start } = dayBounds();

    const history = await db.execute(sql`
        SELECT TOP 50 l.*, o.order_number AS order_number
        FROM dbo.driver_cash_ledger l
        LEFT JOIN orders o ON o.id = l.order_id
        WHERE l.driver_id = ${driverId}
        ORDER BY l.created_at DESC
    `) as any;
    const histRows: any[] = Array.isArray(history) ? history : (history?.rows || history?.recordset || []);

    const dayRows = await db.execute(sql`
        SELECT
            COALESCE(SUM(CASE WHEN type = 'COLLECT' AND created_at >= ${start} THEN amount ELSE 0 END), 0) AS collected,
            COALESCE(SUM(CASE WHEN type = 'SETTLE' AND created_at >= ${start} THEN amount ELSE 0 END), 0) AS settled
        FROM dbo.driver_cash_ledger WHERE driver_id = ${driverId}
    `) as any;
    const dayList: any[] = Array.isArray(dayRows) ? dayRows : (dayRows?.rows || dayRows?.recordset || []);

    const statRows = await db.execute(sql`
        SELECT COUNT(*) AS delivered,
            AVG(CAST(DATEDIFF(SECOND, created_at, updated_at) AS float) / 60.0) AS avg_mins
        FROM orders
        WHERE driver_id = ${driverId} AND status = 'DELIVERED'
          AND CAST(updated_at AS date) = CAST(GETDATE() AS date)
    `) as any;
    const statList: any[] = Array.isArray(statRows) ? statRows : (statRows?.rows || statRows?.recordset || []);

    const completed = await db.select({
        id: orders.id, orderNumber: orders.orderNumber, total: orders.total,
        status: orders.status, createdAt: orders.createdAt,
        customerName: orders.customerName, deliveryAddress: orders.deliveryAddress,
    }).from(orders)
        .where(and(eq(orders.driverId, driverId), eq(orders.status, 'DELIVERED')))
        .orderBy(desc(orders.createdAt)).offset(0).fetch(50);

    const collectByOrder = new Map<string, number>();
    for (const h of histRows) {
        if (h.order_id && String(h.type) === 'COLLECT') collectByOrder.set(String(h.order_id), Number(h.amount || 0));
    }

    const checkinRows = await db.execute(sql`
        SELECT TOP 1 * FROM dbo.driver_branch_checkins
        WHERE driver_id = ${driverId} AND (status = 'REQUESTED' OR CAST(requested_at AS date) = CAST(GETDATE() AS date))
        ORDER BY requested_at DESC
    `) as any;
    const checkinList: any[] = Array.isArray(checkinRows) ? checkinRows : (checkinRows?.rows || checkinRows?.recordset || []);

    return {
        driver: { id: driver.id, name: driver.name, phone: driver.phone, status: driver.status, branchId: driver.branchId },
        balance,
        todayCollected: Number(dayList?.[0]?.collected || 0),
        todaySettled: Number(dayList?.[0]?.settled || 0),
        history: histRows.map((h: any) => ({
            id: h.id, type: h.type, amount: Number(h.amount || 0), balanceAfter: Number(h.balance_after || 0),
            orderId: h.order_id, orderNumber: h.order_number, notes: h.notes,
            createdBy: h.created_by, createdAt: h.created_at,
        })),
        completedOrders: completed.map((o: any) => ({
            id: o.id, orderNumber: o.orderNumber, total: Number(o.total || 0),
            cashCollected: collectByOrder.get(String(o.id)) ?? null,
            customerName: o.customerName, deliveryAddress: o.deliveryAddress, createdAt: o.createdAt,
        })),
        branchId: branchId || driver.branchId || null,
        stats: {
            deliveredToday: Number(statList?.[0]?.delivered || 0),
            avgDeliveryMins: statList?.[0]?.avg_mins === null || statList?.[0]?.avg_mins === undefined
                ? null : Math.max(0, Math.round(Number(statList[0].avg_mins))),
        },
        checkin: checkinList[0] ? {
            id: checkinList[0].id, status: checkinList[0].status,
            requestedAt: checkinList[0].requested_at, decidedAt: checkinList[0].decided_at,
        } : null,
    };
};

/** Resolve a driver row from a driver id OR the linked login user id. */
const resolveDriverRow = async (id: string) => {
    await ensureDriverUserIdColumn();
    const [row] = await db.select().top(1).from(drivers)
        .where(or(eq(drivers.id, id), eq(drivers.userId, id)));
    return row || null;
};

/** GET /delivery/my-cash — the logged-in pilot's account. */
export const getMyCash = async (req: Request, res: Response) => {
    try {
        const userId = String(req.user?.id || '').trim();
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const { ids } = await resolveMyDriverIds(userId);
        if (ids.length === 0) return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
        const payload = await buildCashPayload(ids[0]);
        if (!payload) return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
        res.json(payload);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** GET /delivery/drivers/:id/cash — branch review of one pilot's account. */
export const getDriverCash = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'DRIVER_ID_REQUIRED' });
        const row = await resolveDriverRow(id);
        if (!row) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
        const payload = await buildCashPayload(row.id, (req.effectiveBranchId as string) || row.branchId);
        res.json(payload);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** POST /delivery/drivers/:id/settle { amount? } — branch collects cash, pilot balance zeroes down. */
export const settleDriverCash = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'DRIVER_ID_REQUIRED' });
        const row = await resolveDriverRow(id);
        if (!row) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
        const balance = await getDriverCashBalance(row.id);
        if (balance <= 0.01) return res.status(400).json({ error: 'NO_BALANCE_TO_SETTLE', balance });
        const amount = req.body?.amount !== undefined ? Number(req.body.amount) : balance;
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'INVALID_SETTLE_AMOUNT' });
        if (amount - balance > 0.01) return res.status(400).json({ error: 'SETTLE_EXCEEDS_BALANCE', balance });

        const { after: remaining, ledgerId } = await recordCashMovement({
            driverId: row.id,
            branchId: (req.effectiveBranchId as string) || row.branchId,
            type: 'SETTLE',
            amount,
            createdBy: req.user?.id || 'system',
            notes: String(req.body?.notes || `Branch cash handover`).trim(),
        });
        try {
            const io = getIO();
            if (row.branchId) io.to(`branch:${row.branchId}`).emit('driver:cash', { id: row.id, balance: remaining, settled: amount });
            const userRoom = (row as any).userId || row.id;
            io.to(`user:${userRoom}`).emit('driver:cash', { id: row.id, balance: remaining, settled: amount });
        } catch { /* socket optional */ }
        res.json({ success: true, settled: amount, remaining, driverId: row.id, driverName: row.name, receiptId: ledgerId });
    } catch (error: any) {
        const msg = String(error?.message || '');
        if (msg.includes('SETTLE_EXCEEDS_BALANCE')) return res.status(400).json({ error: msg });
        if (msg.includes('INVALID_CASH_AMOUNT')) return res.status(400).json({ error: msg });
        res.status(500).json({ error: error.message });
    }
};

/** POST /delivery/checkin/request — pilot taps "I'm back at the branch". Idempotent per open request. */
export const requestBranchCheckin = async (req: Request, res: Response) => {
    try {
        const userId = String(req.user?.id || '').trim();
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const { ids, branchId } = await resolveMyDriverIds(userId);
        if (ids.length === 0) return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
        await ensureDriverCashTables();

        const open = await db.execute(sql`
            SELECT TOP 1 * FROM dbo.driver_branch_checkins
            WHERE driver_id = ${ids[0]} AND status = 'REQUESTED' ORDER BY requested_at DESC
        `) as any;
        const openList: any[] = Array.isArray(open) ? open : (open?.rows || open?.recordset || []);
        if (openList.length > 0) return res.json({ ...openList[0], deduped: true });

        const checkinId = `CHK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        await db.execute(sql`
            INSERT INTO dbo.driver_branch_checkins (id, driver_id, branch_id, status, requested_at, notes)
            VALUES (${checkinId}, ${ids[0]}, ${branchId}, 'REQUESTED', GETDATE(), ${String(req.body?.notes || '').trim() || null})
        `);
        try {
            if (branchId) getIO().to(`branch:${branchId}`).emit('driver:checkin', { action: 'requested', id: checkinId, driverId: ids[0] });
        } catch { /* socket optional */ }
        res.status(201).json({ id: checkinId, driverId: ids[0], branchId, status: 'REQUESTED' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** GET /delivery/checkins?status=REQUESTED — branch inbox of return requests. */
export const getBranchCheckins = async (req: Request, res: Response) => {
    try {
        await ensureDriverCashTables();
        const status = String(req.query.status || 'REQUESTED').toUpperCase();
        const branchId = (req.effectiveBranchId as string) || getStringParam(req.query.branchId);
        const rows = await db.execute(sql`
            SELECT TOP 100 c.*, d.name AS driver_name, d.phone AS driver_phone, d.status AS driver_status
            FROM dbo.driver_branch_checkins c
            LEFT JOIN drivers d ON d.id = c.driver_id
            WHERE (${status} = 'ALL' OR c.status = ${status})
              AND (${branchId || null} IS NULL OR c.branch_id = ${branchId || null})
            ORDER BY c.requested_at DESC
        `) as any;
        const list: any[] = Array.isArray(rows) ? rows : (rows?.rows || rows?.recordset || []);
        res.json(list);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

const decideCheckin = async (req: Request, res: Response, approve: boolean) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'CHECKIN_ID_REQUIRED' });
        await ensureDriverCashTables();
        const found = await db.execute(sql`SELECT TOP 1 * FROM dbo.driver_branch_checkins WHERE id = ${id}`) as any;
        const list: any[] = Array.isArray(found) ? found : (found?.rows || found?.recordset || []);
        const checkin = list[0];
        if (!checkin) return res.status(404).json({ error: 'CHECKIN_NOT_FOUND' });
        if (String(checkin.status) !== 'REQUESTED') return res.status(409).json({ error: 'CHECKIN_ALREADY_DECIDED', status: checkin.status });

        const next = approve ? 'APPROVED' : 'REJECTED';
        await db.execute(sql`
            UPDATE dbo.driver_branch_checkins
            SET status = ${next}, decided_at = GETDATE(), decided_by = ${req.user?.id || 'system'},
                notes = ${String(req.body?.notes || checkin.notes || '').trim() || null}
            WHERE id = ${id}
        `);
        const [driver] = await db.select().top(1).from(drivers).where(eq(drivers.id, String(checkin.driver_id)));
        if (approve && driver) {
            await db.update(drivers).set({ status: 'AVAILABLE' }).where(eq(drivers.id, driver.id));
            emitDriverStatus({ ...driver, status: 'AVAILABLE' } as any);
        }
        try {
            const io = getIO();
            if (checkin.branch_id) io.to(`branch:${checkin.branch_id}`).emit('driver:checkin', { action: approve ? 'approved' : 'rejected', id, driverId: String(checkin.driver_id) });
            if (driver) io.to(`user:${(driver as any).userId || driver.id}`).emit('driver:checkin', { action: approve ? 'approved' : 'rejected', id, driverId: driver.id });
        } catch { /* socket optional */ }
        res.json({ success: true, id, status: next });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** POST /delivery/checkin/:id/approve — official return: pilot becomes AVAILABLE. */
export const approveCheckin = (req: Request, res: Response) => decideCheckin(req, res, true);

/** POST /delivery/checkin/:id/reject — pilot stays RETURNING until re-request. */
export const rejectCheckin = (req: Request, res: Response) => decideCheckin(req, res, false);
