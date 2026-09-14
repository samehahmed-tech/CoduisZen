import { Response } from 'express';
import { pool } from '../db/index.js';
import logger from '../utils/logger.js';

interface BridgeClient {
    id: string;
    branchId: string;
    res: Response;
    connectedAt: Date;
}

const clients = new Map<string, BridgeClient>();
const pollingBridges = new Map<string, { id: string; branchId: string; lastSeenAt: Date }>();

const ONLINE_WINDOW_SECONDS = 60;
let printersTableEnsured = false;

const ensurePrintersTable = async () => {
    if (printersTableEnsured) return;
    await pool.query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='bridge_printers' AND xtype='U')
        CREATE TABLE bridge_printers (
            gateway_id NVARCHAR(100) NOT NULL,
            printer_name NVARCHAR(300) NOT NULL,
            branch_id NVARCHAR(50) NULL,
            last_seen_at DATETIME2 NOT NULL DEFAULT GETDATE(),
            CONSTRAINT pk_bridge_printers PRIMARY KEY (gateway_id, printer_name)
        )
    `);
    await pool.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_bridge_printers_name' AND object_id = OBJECT_ID(N'bridge_printers'))
        CREATE INDEX idx_bridge_printers_name ON bridge_printers(printer_name, last_seen_at)
    `);
    printersTableEnsured = true;
};

const sanitizePrinterName = (value: unknown) => String(value || '').trim().slice(0, 300);

/**
 * Records a bridge poll and (when provided) the Windows printer names visible
 * to that bridge. This capability registry is what lets the print queue hand a
 * USB job ONLY to the machine that actually owns the printer.
 */
export const markBridgePoll = async (gatewayId: string, branchId: string | undefined, printers?: string[]) => {
    pollingBridges.set(gatewayId, { id: gatewayId, branchId: branchId || '*', lastSeenAt: new Date() });
    if (!printers || printers.length === 0) return;
    try {
        await ensurePrintersTable();
        const names = Array.from(new Set(printers.map(sanitizePrinterName).filter(Boolean))).slice(0, 100);
        for (const printerName of names) {
            await pool.query(`
                MERGE bridge_printers AS target
                USING (SELECT $1 AS gateway_id, $2 AS printer_name) AS src
                ON target.gateway_id = src.gateway_id AND target.printer_name = src.printer_name
                WHEN MATCHED THEN
                    UPDATE SET last_seen_at = GETDATE(), branch_id = COALESCE($3, target.branch_id)
                WHEN NOT MATCHED THEN
                    INSERT (gateway_id, printer_name, branch_id, last_seen_at)
                    VALUES ($1, $2, $3, GETDATE());
            `, [gatewayId, printerName, branchId || null]);
        }
        // Drop stale registrations (bridge gone for a week) to keep the table lean.
        await pool.query(`DELETE FROM bridge_printers WHERE gateway_id = $1 AND last_seen_at < DATEADD(DAY, -7, GETDATE())`, [gatewayId]);
    } catch (error) {
        logger.warn({ err: error, gatewayId }, '[bridge] printer capability registration failed');
    }
};

/**
 * Resolves which gateway registered a given Windows printer name.
 * Prefers an online gateway (seen within 60s); falls back to the most recent.
 */
export const getGatewayForPrinter = async (printerAddress: string | null | undefined, branchId?: string | null): Promise<string | null> => {
    const raw = sanitizePrinterName(printerAddress);
    if (!raw) return null;
    const stripped = raw.startsWith('windows:') ? raw.slice('windows:'.length) : raw;
    await ensurePrintersTable();
    const { rows } = await pool.query(`
        SELECT TOP (1) gateway_id, last_seen_at
        FROM bridge_printers
        WHERE printer_name IN ($1, $2)
          AND ($3 IS NULL OR branch_id IS NULL OR branch_id = $3)
        ORDER BY (CASE WHEN last_seen_at >= DATEADD(SECOND, -${ONLINE_WINDOW_SECONDS}, GETDATE()) THEN 0 ELSE 1 END) ASC,
                 last_seen_at DESC
    `, [raw, stripped, branchId || null]);
    return rows[0]?.gateway_id || null;
};

/** Full registry for the Printers UI: online state + registered printers per gateway. */
export const getBridgeRegistry = async () => {
    await ensurePrintersTable();
    const { rows } = await pool.query(`
        SELECT gateway_id, printer_name, branch_id, last_seen_at
        FROM bridge_printers
        WHERE last_seen_at >= DATEADD(DAY, -2, GETDATE())
        ORDER BY gateway_id, printer_name
    `);
    const online = new Map<string, { branchId: string | null; lastSeenAt: string; mode: string }>();
    for (const bridge of getConnectedBridges() as any[]) {
        online.set(bridge.id, { branchId: bridge.branchId ?? null, lastSeenAt: new Date(bridge.connectedAt).toISOString(), mode: bridge.mode });
    }
    const grouped = new Map<string, { gatewayId: string; online: boolean; lastSeenAt: string | null; branchId: string | null; printers: string[] }>();
    const touch = (gatewayId: string) => {
        if (!grouped.has(gatewayId)) {
            const live = online.get(gatewayId);
            grouped.set(gatewayId, {
                gatewayId,
                online: Boolean(live),
                lastSeenAt: live?.lastSeenAt || null,
                branchId: live?.branchId || null,
                printers: [],
            });
        }
        return grouped.get(gatewayId)!;
    };
    for (const [gatewayId] of online.entries()) touch(gatewayId);
    for (const row of rows) {
        const entry = touch(row.gateway_id);
        entry.printers.push(row.printer_name);
        if (!entry.lastSeenAt || new Date(row.last_seen_at) > new Date(entry.lastSeenAt)) {
            entry.lastSeenAt = new Date(row.last_seen_at).toISOString();
        }
        if (!entry.branchId && row.branch_id) entry.branchId = row.branch_id;
    }
    return Array.from(grouped.values());
};

export const registerBridge = (gatewayId: string, branchId: string, res: Response) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    res.write(`data: ${JSON.stringify({ event: 'connected', gatewayId, branchId })}\n\n`);

    const client: BridgeClient = { id: gatewayId, branchId, res, connectedAt: new Date() };
    clients.set(gatewayId, client);

    logger.info({ gatewayId, branchId }, '[bridge] SSE client connected');

    const heartbeat = setInterval(() => {
        try {
            res.write(`:heartbeat\n\n`);
        } catch {
            clearInterval(heartbeat);
            clients.delete(gatewayId);
        }
    }, 15000);

    res.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(gatewayId);
        logger.info({ gatewayId }, '[bridge] SSE client disconnected');
    });
};

export const pushJobToBridge = async (jobId: string, branchId: string) => {
    const { rows } = await pool.query(
        `SELECT id, type, content, content_type, printer_id, printer_address, printer_type, branch_id,
                COALESCE(target_gateway_id, gateway_id) AS target_gateway_id
         FROM print_jobs WHERE id = $1`,
        [jobId]
    );
    const job = rows[0];
    if (!job) return false;

    for (const [, client] of clients) {
        if (job.target_gateway_id === client.id && (client.branchId === branchId || !branchId)) {
            try {
                const payload = {
                    event: 'print_job',
                    job: {
                        id: job.id,
                        type: job.type,
                        content: job.content,
                        contentType: job.content_type,
                        printerId: job.printer_id,
                        printerAddress: job.printer_address,
                        printerType: job.printer_type,
                        branchId: job.branch_id,
                    },
                };
                client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
                return true;
            } catch {
                clients.delete(client.id);
            }
        }
    }
    return false;
};

export const getConnectedBridges = () => {
    const sse = Array.from(clients.values()).map(c => ({
        id: c.id,
        branchId: c.branchId,
        connectedAt: c.connectedAt,
        mode: 'SSE',
    }));
    const cutoff = Date.now() - 15_000;
    const polling = Array.from(pollingBridges.values())
        .filter(bridge => bridge.lastSeenAt.getTime() >= cutoff)
        .map(bridge => ({ ...bridge, connectedAt: bridge.lastSeenAt, mode: 'POLL' }));
    return [...sse, ...polling];
};
