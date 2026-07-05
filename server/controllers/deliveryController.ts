import { Request, Response } from 'express';
import { db } from '../db';
import { deliveryZones, drivers, orders, settings, driverTelemetry, driverTelemetryLatest, users } from '../../src/db/schema';
import { eq, and, desc, or, sql } from 'drizzle-orm';
import { getIO } from '../socket';
import { getStringParam } from '../utils/request';
import { webhookService } from '../services/webhookService';

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
        CREATE TABLE IF NOT EXISTS driver_telemetry (
            id serial PRIMARY KEY,
            driver_id text NOT NULL,
            branch_id text,
            lat real NOT NULL,
            lng real NOT NULL,
            speed_kmh real,
            accuracy real,
            heading real,
            altitude real,
            battery_level integer,
            is_charging boolean,
            order_id text,
            created_at timestamp DEFAULT now()
        )
    `);
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS driver_telemetry_latest (
            driver_id text PRIMARY KEY,
            branch_id text,
            lat real NOT NULL,
            lng real NOT NULL,
            speed_kmh real,
            accuracy real,
            heading real,
            battery_level integer,
            order_id text,
            updated_at timestamp DEFAULT now()
        )
    `);
};

const normalizeDriverStatus = (status: unknown, fallback = 'AVAILABLE') => {
    const next = String(status || fallback).trim().toUpperCase();
    return DRIVER_STATUSES.has(next) ? next : fallback;
};

const emitDriverStatus = (driver: { id: string; branchId?: string | null; status?: string | null }) => {
    try {
        const branchRoom = driver.branchId ? `branch:${driver.branchId}` : null;
        if (branchRoom) getIO().to(branchRoom).emit('driver:status', { id: driver.id, status: driver.status });
    } catch {
        // socket optional
    }
};

export const getAllZones = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        let query = db.select().from(deliveryZones).where(eq(deliveryZones.isActive, true));
        if (branchId) {
            // @ts-ignore
            query = query.where(eq(deliveryZones.branchId, branchId as string));
        }
        const zones = await query.orderBy(deliveryZones.name);
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
                }).onConflictDoUpdate({
                    target: users.id,
                    set: {
                        name,
                        role: 'DRIVER',
                        permissions: ['NAV_DRIVER'],
                        assignedBranchId: branchId,
                        allowedBranches: [branchId],
                        isActive: true,
                        ...(passwordHash ? { passwordHash } : {}),
                        ...(pinCodeHash ? { pinCodeHash, pinLoginEnabled } : {}),
                        updatedAt: new Date(),
                    },
                });
            }

            const [inserted] = await tx.insert(drivers).values({
                id: driverId,
                name,
                phone,
                branchId,
                status,
                isActive: body.isActive !== false,
                createdAt: new Date(),
            }).returning();
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

        const [updated] = await db.update(drivers).set(patch).where(eq(drivers.id, id)).returning();
        if (!updated) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
        emitDriverStatus(updated);
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_UPDATE_DRIVER' });
    }
};

export const updateDriverStatus = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'DRIVER_ID_REQUIRED' });
        const status = normalizeDriverStatus(req.body?.status, '');
        if (!status) return res.status(400).json({ error: 'INVALID_DRIVER_STATUS' });
        const [updated] = await db.update(drivers).set({ status }).where(eq(drivers.id, id)).returning();
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
            // 0. Double Booking Prevention (Item 42)
            const [driver] = await tx.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
            if (!driver) throw new Error('DRIVER_NOT_FOUND');
            if (driver.status !== 'AVAILABLE' || !driver.isActive) throw new Error('DRIVER_ALREADY_BUSY');

            const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
            if (!order) throw new Error('ORDER_NOT_FOUND');
            if (order.driverId && order.driverId !== driverId) throw new Error('ORDER_ALREADY_ASSIGNED');

            // 1. Update Order
            const [updatedOrder] = await tx.update(orders)
                .set({ driverId, status: 'OUT_FOR_DELIVERY', updatedAt: new Date() })
                .where(eq(orders.id, orderId))
                .returning();
            orderBranchId = updatedOrder?.branchId || null;

            // 2. Update Driver status
            await tx.update(drivers)
                .set({ status: 'BUSY' })
                .where(eq(drivers.id, driverId));
        });

        try {
            const branchRoom = orderBranchId ? `branch:${orderBranchId}` : null;
            if (branchRoom) {
                getIO().to(branchRoom).emit('dispatch:assigned', { orderId, driverId });
                getIO().to(branchRoom).emit('order:status', { id: orderId, status: 'OUT_FOR_DELIVERY' });
                getIO().to(branchRoom).emit('driver:status', { id: driverId, status: 'BUSY' });
            }
        } catch {
            // socket optional
        }

        res.json({ message: 'Driver assigned successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
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

        const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
        if (!driver) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });

        // 1. Insert into telemetry history (time-series)
        await db.insert(driverTelemetry).values({
            driverId,
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
        await db.insert(driverTelemetryLatest).values({
            driverId,
            branchId: driver.branchId || null,
            lat,
            lng,
            ...(Number.isFinite(speedKmh) ? { speedKmh } : {}),
            ...(Number.isFinite(accuracy) ? { accuracy } : {}),
            ...(Number.isFinite(heading) ? { heading } : {}),
            ...(Number.isFinite(batteryLevel) ? { batteryLevel } : {}),
            updatedAt: now,
        }).onConflictDoUpdate({
            target: driverTelemetryLatest.driverId,
            set: {
                branchId: driver.branchId || null,
                lat,
                lng,
                ...(Number.isFinite(speedKmh) ? { speedKmh } : {}),
                ...(Number.isFinite(accuracy) ? { accuracy } : {}),
                ...(Number.isFinite(heading) ? { heading } : {}),
                ...(Number.isFinite(batteryLevel) ? { batteryLevel } : {}),
                updatedAt: now,
            },
        });

        const nextItem: DriverTelemetryData = {
            driverId,
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
    const [row] = await db.select().from(settings).where(eq(settings.key, SLA_ESCALATIONS_KEY)).limit(1);
    const raw = row?.value;
    if (!Array.isArray(raw)) return [];
    return raw as DeliverySlaEscalationRecord[];
};

const saveSlaEscalations = async (records: DeliverySlaEscalationRecord[], updatedBy?: string | null) => {
    await db.insert(settings).values({
        key: SLA_ESCALATIONS_KEY,
        value: records,
        category: 'delivery',
        updatedBy: updatedBy || 'system',
        updatedAt: new Date(),
    }).onConflictDoUpdate({
        target: settings.key,
        set: {
            value: records,
            category: 'delivery',
            updatedBy: updatedBy || 'system',
            updatedAt: new Date(),
        },
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
        const data = req.body;
        const [inserted] = await db.insert(deliveryZones).values(data).returning();
        res.json(inserted);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const updateZone = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const data = req.body;
        const [updated] = await db.update(deliveryZones).set(data).where(eq(deliveryZones.id, id)).returning();
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
