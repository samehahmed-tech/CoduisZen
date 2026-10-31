import { Request, Response } from 'express';
import { db } from '../db';
import { printers } from '../../src/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { isForeignKeyDeleteError, writeForeignKeyDeleteConflict } from '../utils/dbErrors';
import net from 'node:net';
import { pool } from '../db';
import { createSignedAuditLog } from '../services/auditService';
import { canAccessBranch } from '../middleware/branchIsolation';

let printerSchemaReady = false;

const ensurePrinterSchema = async () => {
    if (printerSchemaReady) return;
    try {
        await pool.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'printers')
            CREATE TABLE printers (
                id nvarchar(255) primary key,
                name nvarchar(max) not null,
                type nvarchar(max) not null,
                address nvarchar(max),
                location nvarchar(max),
                branch_id nvarchar(max),
                is_active bit default 1,
                paper_width integer default 80,
                created_at datetime2 default GETDATE()
            );
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('printers') AND name = 'code')
            ALTER TABLE printers ADD code nvarchar(max);
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('printers') AND name = 'role')
            ALTER TABLE printers ADD role nvarchar(max) DEFAULT 'OTHER';
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('printers') AND name = 'roles')
            ALTER TABLE printers ADD roles nvarchar(max) DEFAULT '[]';
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('printers') AND name = 'station_id')
            ALTER TABLE printers ADD station_id nvarchar(max);
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('printers') AND name = 'gateway_id')
            ALTER TABLE printers ADD gateway_id nvarchar(max);
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('printers') AND name = 'is_primary_cashier')
            ALTER TABLE printers ADD is_primary_cashier bit DEFAULT 0;
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('printers') AND name = 'last_heartbeat_at')
            ALTER TABLE printers ADD last_heartbeat_at datetime2;
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('printers') AND name = 'heartbeat_status')
            ALTER TABLE printers ADD heartbeat_status nvarchar(max) DEFAULT 'UNKNOWN';
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('printers') AND name = 'paper_width')
            ALTER TABLE printers ADD paper_width integer DEFAULT 80;
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('printers') AND name = 'updated_at')
            ALTER TABLE printers ADD updated_at datetime2 DEFAULT GETDATE();
        `);
    } catch (error: any) {
        if (error?.code !== '42501') throw error;
        const { rows } = await pool.query(`select 1 from information_schema.tables where table_schema = SCHEMA_NAME() and table_name = 'printers'`);
        if (rows.length === 0) throw error;
        const columns = await pool.query(`
            select column_name
            from information_schema.columns
            where table_schema = SCHEMA_NAME()
              and table_name = 'printers'
              and column_name in ('station_id', 'gateway_id', 'roles', 'is_primary_cashier', 'updated_at')
        `);
        if (columns.rowCount < 5) {
            throw new Error('PRINTER_SCHEMA_REPAIR_REQUIRED: run Fix-Printer-Table-Owner.bat once, then restart RestoFlow');
        }
    }
    printerSchemaReady = true;
};

const enforceSinglePrimaryCashier = async (branchId: string | null, printerId: string) => {
    if (!branchId) return;
    await pool.query(
`update printers
         set is_primary_cashier = 0,
              updated_at = GETDATE()
         where branch_id = $1
           and id <> $2`,
        [branchId, printerId],
    );
};

const makePrinterCode = (body: any, id: string) => {
    const raw = String(body.code || '').trim();
    if (raw) return raw;
    const base = `${body.type || 'LOCAL'}-${body.name || id}-${id}`;
    return base.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || id;
};

const normalizeLocalAddress = (body: any) => {
    const address = String(body.address || '').trim();
    if (String(body.type || '').toUpperCase() !== 'LOCAL') return address;
    if (!address || address.includes(':')) return address;
    return `windows:${address}`;
};

const parsePrinterRoles = (printer: any) => {
    if (!printer) return printer;
    try {
        if (typeof printer.roles === 'string') {
            printer.roles = JSON.parse(printer.roles || '[]');
        }
    } catch {
        printer.roles = printer.role ? [printer.role] : [];
    }
    return printer;
};

const normalizePrinterRoles = (body: any) => {
    const r = body.roles || (body.role ? [body.role] : []);
    return Array.isArray(r) ? r : [];
};

const auditPrinterMutation = (req: Request, eventType: string, branchId: string | null, payload: Record<string, unknown>, before?: Record<string, unknown>, after?: Record<string, unknown>) => createSignedAuditLog({
    eventType,
    userId: req.user?.id || 'system',
    userRole: req.user?.role,
    branchId: req.effectiveBranchId || branchId || null,
    requestId: req.requestId,
    sourceDevice: req.headers['user-agent'],
    payload,
    before,
    after,
    reason: `Printer mutation: ${eventType}`,
});

const printerNetworkAdminRoles = new Set(['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER']);
const canViewPrinterNetwork = (req: Request) => {
    const role = String(req.user?.role || '').toUpperCase();
    return printerNetworkAdminRoles.has(role)
        || req.user?.permissions?.includes('*')
        || req.user?.permissions?.includes('CFG_MANAGE_PRINTERS');
};

const sanitizePrinterForViewer = (printer: any, includeNetwork: boolean) => {
    if (includeNetwork) return printer;
    const { address: _address, gatewayId: _gatewayId, ...safePrinter } = printer || {};
    return safePrinter;
};

export const getPrinters = async (req: Request, res: Response) => {
    try {
        await ensurePrinterSchema();
        const branchId = req.effectiveBranchId || getStringParam(req.query.branchId);
        const active = getStringParam(req.query.active);

        const conditions: any[] = [];
        if (branchId) conditions.push(eq(printers.branchId, branchId));
        if (active === 'true') conditions.push(eq(printers.isActive, true));

        const base = db.select().from(printers);
        const query = conditions.length ? base.where(and(...conditions)) : base;
        const all = await query.orderBy(desc(printers.createdAt));

        res.json(all.map(parsePrinterRoles).map((printer) => sanitizePrinterForViewer(printer, canViewPrinterNetwork(req))));
    } catch (error: any) {
        if (isForeignKeyDeleteError(error)) {
            return writeForeignKeyDeleteConflict(res, 'printer', ['print_jobs']);
        }
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

        res.json(sanitizePrinterForViewer(parsePrinterRoles(printer), canViewPrinterNetwork(req)));
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
        const branchId = req.effectiveBranchId || body.branch_id || body.branchId || null;
        const isPrimaryCashier = body.is_primary_cashier === true || body.isPrimaryCashier === true;

        const [created] = await db.insert(printers).output().values({
            id: printerId,
            name: body.name,
            code: makePrinterCode(body, printerId),
            type: body.type,
            address: normalizeLocalAddress(body),
            location: body.location || '',
            role: body.role || 'OTHER',
            roles: normalizePrinterRoles(body),
            stationId: body.station_id || body.stationId || null,
            gatewayId: body.gateway_id || body.gatewayId || null,
            isPrimaryCashier,
            branchId,
            isActive: body.is_active !== false,
            paperWidth: body.paper_width ?? 80,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        if (isPrimaryCashier) {
            await enforceSinglePrimaryCashier(branchId, created.id);
        }

        await auditPrinterMutation(req, 'PRINTER_CREATED', branchId, {
            printerId: created.id,
            type: created.type,
            role: created.role,
            isPrimaryCashier,
            hasAddress: Boolean(created.address),
        }, undefined, { active: created.isActive !== false });

        res.status(201).json(parsePrinterRoles(created));
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
        const [current] = await db.select({ id: printers.id, branchId: printers.branchId, isActive: printers.isActive, type: printers.type }).from(printers).where(eq(printers.id, id));
        if (!current) return res.status(404).json({ error: 'Printer not found' });
        if (current.branchId && !canAccessBranch(req.user, current.branchId)) return res.status(403).json({ error: 'BRANCH_MISMATCH' });

        const branchId = body.branch_id !== undefined || body.branchId !== undefined ? (req.effectiveBranchId || body.branch_id || body.branchId || null) : undefined;
        const hasPrimaryFlag = Object.prototype.hasOwnProperty.call(body, 'is_primary_cashier') || Object.prototype.hasOwnProperty.call(body, 'isPrimaryCashier');
        const isPrimaryCashier = body.is_primary_cashier === true || body.isPrimaryCashier === true;

        const updateData: any = {
            updatedAt: new Date(),
        };

        if (body.name !== undefined) updateData.name = body.name;
        if (body.code !== undefined || body.name !== undefined) updateData.code = makePrinterCode(body, id);
        if (body.type !== undefined) updateData.type = body.type;
        if (body.address !== undefined) updateData.address = normalizeLocalAddress(body);
        if (body.location !== undefined) updateData.location = body.location;
        if (body.role !== undefined) updateData.role = body.role;
        
        if (body.roles !== undefined || body.role !== undefined) {
            updateData.roles = normalizePrinterRoles(body);
        }
        
        const stationId = body.station_id ?? body.stationId;
        if (stationId !== undefined) updateData.stationId = stationId || null;
        
        const gatewayId = body.gateway_id ?? body.gatewayId;
        if (gatewayId !== undefined) updateData.gatewayId = gatewayId || null;
        
        if (branchId !== undefined) updateData.branchId = branchId;
        
        const isActive = body.is_active ?? body.isActive;
        if (isActive !== undefined) updateData.isActive = isActive !== false;
        
        const paperWidth = body.paper_width ?? body.paperWidth;
        if (paperWidth !== undefined) updateData.paperWidth = Number(paperWidth || 80);

        if (hasPrimaryFlag) {
            updateData.isPrimaryCashier = isPrimaryCashier;
        }

        const [updated] = await db.update(printers)
            .set(updateData)
            .output()
            .where(eq(printers.id, id));

        if (!updated) return res.status(404).json({ error: 'Printer not found' });

        if (hasPrimaryFlag && isPrimaryCashier) {
            await enforceSinglePrimaryCashier(updated.branchId || null, updated.id);
        }
        await auditPrinterMutation(req, 'PRINTER_UPDATED', updated.branchId || current.branchId || null, {
            printerId: updated.id,
            changedKeys: Object.keys(body).filter((key) => !/address|ip|password|secret|token/i.test(key)).sort(),
        }, { active: current.isActive, type: current.type }, { active: updated.isActive, type: updated.type });
        res.json(parsePrinterRoles(updated));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deletePrinter = async (req: Request, res: Response) => {
    try {
        await ensurePrinterSchema();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRINTER_ID_REQUIRED' });

        const [current] = await db.select({ id: printers.id, branchId: printers.branchId, isActive: printers.isActive }).from(printers).where(eq(printers.id, id));
        if (!current) return res.status(404).json({ error: 'Printer not found' });
        if (current.branchId && !canAccessBranch(req.user, current.branchId)) return res.status(403).json({ error: 'BRANCH_MISMATCH' });

        const [deleted] = await db.update(printers)
            .set({ isActive: false, updatedAt: new Date() })
            .output()
            .where(eq(printers.id, id));
        if (!deleted) return res.status(404).json({ error: 'Printer not found' });

        await auditPrinterMutation(req, 'PRINTER_DEACTIVATED', deleted.branchId || null, { printerId: deleted.id }, { active: true }, { active: false });

        res.json({ success: true, printer: parsePrinterRoles(deleted) });
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
            .output()
            .where(eq(printers.id, id));

        res.json({ id, online, printer: parsePrinterRoles(updated) });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
