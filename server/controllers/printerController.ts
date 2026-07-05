import { Request, Response } from 'express';
import { db } from '../db';
import { printers } from '../../src/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import net from 'node:net';
import { pool } from '../db';

let printerSchemaReady = false;

const ensurePrinterSchema = async () => {
    if (printerSchemaReady) return;
    await pool.query(`
        create table if not exists printers (
            id text primary key,
            name text not null,
            type text not null,
            address text,
            location text,
            branch_id text,
            is_active boolean default true,
            paper_width integer default 80,
            created_at timestamp default now()
        );
        alter table printers add column if not exists code text;
        alter table printers add column if not exists role text default 'OTHER';
        alter table printers add column if not exists roles json default '[]'::json;
        alter table printers add column if not exists station_id text;
        alter table printers add column if not exists gateway_id text;
        alter table printers add column if not exists is_primary_cashier boolean default false;
        alter table printers add column if not exists last_heartbeat_at timestamptz;
        alter table printers add column if not exists heartbeat_status text default 'UNKNOWN';
        alter table printers add column if not exists paper_width integer default 80;
        alter table printers add column if not exists updated_at timestamptz default now();
    `);
    printerSchemaReady = true;
};

const enforceSinglePrimaryCashier = async (branchId: string | null, printerId: string) => {
    if (!branchId) return;
    await pool.query(
        `update printers
         set is_primary_cashier = false,
             updated_at = now()
         where branch_id = $1
           and id <> $2`,
        [branchId, printerId],
    );
};

export const getPrinters = async (req: Request, res: Response) => {
    try {
        await ensurePrinterSchema();
        const branchId = getStringParam(req.query.branchId);
        const active = getStringParam(req.query.active);

        const conditions: any[] = [];
        if (branchId) conditions.push(eq(printers.branchId, branchId));
        if (active === 'true') conditions.push(eq(printers.isActive, true));

        const base = db.select().from(printers);
        const query = conditions.length ? base.where(and(...conditions)) : base;
        const all = await query.orderBy(desc(printers.createdAt));

        res.json(all);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getPrinterById = async (req: Request, res: Response) => {
    try {
        await ensurePrinterSchema();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRINTER_ID_REQUIRED' });

        const [printer] = await db.select().from(printers).where(eq(printers.id, id));
        if (!printer) return res.status(404).json({ error: 'Printer not found' });

        res.json(printer);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createPrinter = async (req: Request, res: Response) => {
    try {
        await ensurePrinterSchema();
        const body = req.body || {};
        if (!body.name || !body.type) {
            return res.status(400).json({ error: 'name and type are required' });
        }

        const printerId = body.id || `PRN-${Date.now()}`;
        const branchId = body.branch_id || body.branchId || null;
        const isPrimaryCashier = body.is_primary_cashier === true || body.isPrimaryCashier === true;

        const [created] = await db.insert(printers).values({
            id: printerId,
            name: body.name,
            code: body.code || null,
            type: body.type,
            address: body.address || '',
            location: body.location || '',
            role: body.role || 'OTHER',
            roles: body.roles || [],
            stationId: body.station_id || body.stationId || null,
            gatewayId: body.gateway_id || body.gatewayId || null,
            isPrimaryCashier,
            branchId,
            isActive: body.is_active !== false,
            paperWidth: body.paper_width ?? 80,
            createdAt: new Date(),
            updatedAt: new Date(),
        }).returning();

        if (isPrimaryCashier) {
            await enforceSinglePrimaryCashier(branchId, created.id);
        }

        res.status(201).json(created);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updatePrinter = async (req: Request, res: Response) => {
    try {
        await ensurePrinterSchema();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRINTER_ID_REQUIRED' });
        const body = req.body || {};

        const branchId = body.branch_id || body.branchId || null;
        const hasPrimaryFlag = Object.prototype.hasOwnProperty.call(body, 'is_primary_cashier') || Object.prototype.hasOwnProperty.call(body, 'isPrimaryCashier');
        const isPrimaryCashier = body.is_primary_cashier === true || body.isPrimaryCashier === true;

        const updateData: any = {
            name: body.name,
            code: body.code,
            type: body.type,
            address: body.address,
            location: body.location,
            role: body.role,
            roles: body.roles,
            stationId: body.station_id ?? body.stationId,
            gatewayId: body.gateway_id ?? body.gatewayId,
            branchId,
            isActive: body.is_active,
            paperWidth: body.paper_width,
            updatedAt: new Date(),
        };
        if (hasPrimaryFlag) {
            updateData.isPrimaryCashier = isPrimaryCashier;
        }

        const [updated] = await db.update(printers)
            .set(updateData)
            .where(eq(printers.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: 'Printer not found' });

        if (hasPrimaryFlag && isPrimaryCashier) {
            await enforceSinglePrimaryCashier(updated.branchId || null, updated.id);
        }
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deletePrinter = async (req: Request, res: Response) => {
    try {
        await ensurePrinterSchema();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRINTER_ID_REQUIRED' });

        const [deleted] = await db.delete(printers).where(eq(printers.id, id)).returning();
        if (!deleted) return res.status(404).json({ error: 'Printer not found' });

        res.json({ success: true, printer: deleted });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

const probeNetworkPrinter = (address: string): Promise<boolean> => {
    return new Promise((resolve) => {
        const [hostRaw, portRaw] = String(address || '').split(':');
        const host = hostRaw?.trim();
        const port = Number(portRaw || 9100);
        if (!host || Number.isNaN(port)) return resolve(false);

        const socket = new net.Socket();
        const timeout = setTimeout(() => {
            socket.destroy();
            resolve(false);
        }, 1500);

        socket.once('connect', () => {
            clearTimeout(timeout);
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => {
            clearTimeout(timeout);
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, host);
    });
};

export const heartbeatPrinter = async (req: Request, res: Response) => {
    try {
        await ensurePrinterSchema();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRINTER_ID_REQUIRED' });
        const [printer] = await db.select().from(printers).where(eq(printers.id, id));
        if (!printer) return res.status(404).json({ error: 'Printer not found' });

        let online = false;
        if (printer.type === 'NETWORK') {
            online = await probeNetworkPrinter(printer.address || '');
        } else {
            // Local printers require local bridge health check.
            online = Boolean(printer.isActive);
        }

        const [updated] = await db.update(printers)
            .set({
                isActive: online,
                heartbeatStatus: online ? 'ONLINE' : 'OFFLINE',
                lastHeartbeatAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(printers.id, id))
            .returning();

        res.json({ id, online, printer: updated });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
