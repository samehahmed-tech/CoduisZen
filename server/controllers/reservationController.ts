import { Request, Response } from 'express';
import { db } from '../db';
import { reservations, tables } from '../../src/db/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { getIO } from '../socket';
import { getStringParam } from '../utils/request';

const VALID_STATUSES = new Set(['CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);

const dayBounds = (date: string) => {
    const day = String(date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    return { day, start: new Date(`${day}T00:00:00`), end: new Date(`${day}T23:59:59.999`) };
};

export const reservationController = {
    async list(req: Request, res: Response) {
        try {
            const branchId = getStringParam(req.query.branchId);
            if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
            const { day } = dayBounds(String(req.query.date || ''));
            const rows = await db.select().from(reservations).where(and(
                eq(reservations.branchId, branchId),
                gte(reservations.date, new Date(`${day}T00:00:00`)),
                lte(reservations.date, new Date(`${day}T23:59:59.999`)),
            ));
            res.json(rows.sort((a: any, b: any) => String(a.time).localeCompare(String(b.time))));
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    async create(req: Request, res: Response) {
        try {
            const body = req.body || {};
            const branchId = String(body.branchId || '').trim();
            const customerName = String(body.customerName || '').trim();
            const customerPhone = String(body.customerPhone || '').trim();
            const partySize = Number(body.partySize || 2);
            if (!branchId || !customerName || !customerPhone || !(partySize > 0)) {
                return res.status(400).json({ error: 'BRANCH_NAME_PHONE_SIZE_REQUIRED' });
            }
            const { day } = dayBounds(String(body.date || ''));
            const time = String(body.time || '').trim();
            if (!/^\d{2}:\d{2}$/.test(time)) {
                return res.status(400).json({ error: 'INVALID_TIME' });
            }
            // Table must belong to the branch when assigned.
            if (body.tableId) {
                const [table] = await db.select({ id: tables.id, branchId: tables.branchId })
                    .top(1).from(tables).where(eq(tables.id, String(body.tableId)));
                if (!table || String(table.branchId) !== branchId) {
                    return res.status(400).json({ error: 'INVALID_TABLE_REFERENCE' });
                }
            }
            const [created] = await db.insert(reservations).output().values({
                id: `RSV-${Date.now().toString(36).toUpperCase()}`,
                branchId,
                tableId: body.tableId ? String(body.tableId) : null,
                customerId: body.customerId ? String(body.customerId) : null,
                customerName,
                customerPhone,
                date: new Date(`${day}T00:00:00`),
                time,
                partySize,
                duration: Number(body.duration || 90),
                status: 'CONFIRMED',
                specialRequests: body.specialRequests || null,
                notes: body.notes || null,
                source: body.source || 'PHONE',
                createdBy: (req as any)?.user?.id || null,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            try { getIO().to(`branch:${branchId}`).emit('reservations:updated', created); } catch { /* socket optional */ }
            res.status(201).json(created);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    async setStatus(req: Request, res: Response) {
        try {
            const id = getStringParam((req.params as any).id);
            const status = String(req.body?.status || '').toUpperCase();
            if (!id || !VALID_STATUSES.has(status)) {
                return res.status(400).json({ error: 'VALID_ID_AND_STATUS_REQUIRED' });
            }
            const [updated] = await db.update(reservations)
                .set({ status, updatedAt: new Date() })
                .output()
                .where(eq(reservations.id, id));
            if (!updated) return res.status(404).json({ error: 'RESERVATION_NOT_FOUND' });
            try { getIO().to(`branch:${updated.branchId}`).emit('reservations:updated', updated); } catch { /* socket optional */ }
            res.json(updated);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },
};
