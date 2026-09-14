import crypto from 'crypto';
import { pool } from '../db/index.js';
import { pushJobToBridge, getGatewayForPrinter } from './printerBridgeService.js';

export interface EnqueuePrintJobInput {
    branchId: string;
    type: 'RECEIPT' | 'KITCHEN';
    content: string;
    contentType?: 'text' | 'image';
    printerId?: string | null;
    printerAddress?: string | null;
    printerType?: 'LOCAL' | 'NETWORK' | 'WINDOWS' | 'USB' | null;
    targetGatewayId?: string | null;
    createdBy?: string | null;
    maxAttempts?: number;
}

export const shouldEnqueueServerCashierReceipt = (paidNow: boolean, source?: string | null) =>
    paidNow && String(source || '').toLowerCase() !== 'pos';

let ensured = false;

const normalizeGatewayId = (value?: string | null) => {
    const trimmed = String(value || '').trim();
    return trimmed || null;
};

const ensureTable = async () => {
    if (ensured) return;
    await pool.query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='print_jobs' AND xtype='U')
        CREATE TABLE print_jobs (
            id NVARCHAR(100) PRIMARY KEY,
            branch_id NVARCHAR(50) NOT NULL,
            type NVARCHAR(20) NOT NULL,
            content NVARCHAR(MAX) NOT NULL,
            content_type NVARCHAR(20) NOT NULL DEFAULT 'text',
            printer_id NVARCHAR(100) NULL,
            printer_address NVARCHAR(500) NULL,
            printer_type NVARCHAR(20) DEFAULT 'LOCAL',
            target_gateway_id NVARCHAR(100) NULL,
            status NVARCHAR(20) NOT NULL DEFAULT 'QUEUED',
            error NVARCHAR(1000) NULL,
            created_by NVARCHAR(100) NULL,
            completed_at DATETIME2 NULL,
            created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
            updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
        )
    `);
    const columns = [
        ['target_gateway_id', 'NVARCHAR(100) NULL'],
        ['gateway_id', 'NVARCHAR(100) NULL'],
        ['error', 'NVARCHAR(1000) NULL'],
        ['error_message', 'NVARCHAR(MAX) NULL'],
        ['claimed_by', 'NVARCHAR(100) NULL'],
        ['claimed_at', 'DATETIME2 NULL'],
        ['failed_at', 'DATETIME2 NULL'],
        ['attempts', 'INT NOT NULL DEFAULT 0'],
        ['max_attempts', 'INT NOT NULL DEFAULT 3'],
    ];
    for (const [name, definition] of columns) {
        await pool.query(`
            IF COL_LENGTH('print_jobs', '${name}') IS NULL
            ALTER TABLE print_jobs ADD ${name} ${definition}
        `);
    }
    try {
        await pool.query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_print_jobs_branch_status' AND object_id = OBJECT_ID(N'print_jobs')) CREATE INDEX idx_print_jobs_branch_status ON print_jobs(branch_id, status, created_at)`);
    } catch { }
    ensured = true;
};

export const claimNextPrintJob = async (params: {
    branchId?: string;
    gatewayId: string;
    claimUnassigned: boolean;
    globalClaim?: boolean;
    /** Windows printer names visible to this bridge (capability routing). */
    printers?: string[];
}) => {
    await ensureTable();

    // Capability names come from the bridge (user-controlled) — escape single
    // quotes before inlining into the IN (...) list.
    const capablePrinters = Array.from(new Set(
        (params.printers || [])
            .map(name => String(name || '').trim().slice(0, 300))
            .filter(Boolean),
    )).map(name => name.replace(/'/g, "''"));

    // Backward compatibility: a bridge without capability data keeps the
    // legacy behavior (any unassigned job is claimable by anyone).
    let capabilityClause = '';
    if (capablePrinters.length > 0) {
        const inList = capablePrinters.map(name => "N'" + name + "'").join(', ');
        capabilityClause =
            'AND (' +
            'COALESCE(target_gateway_id, gateway_id) IS NOT NULL ' +
            'OR printer_address IN (' + inList + ') ' +
            'OR (' +
            'created_at < DATEADD(SECOND, -30, GETDATE()) ' +
            'AND NOT EXISTS (' +
            'SELECT 1 FROM bridge_printers bp WITH (NOLOCK) ' +
            'WHERE bp.printer_name = print_jobs.printer_address ' +
            'AND bp.gateway_id <> $2 ' +
            'AND bp.last_seen_at >= DATEADD(SECOND, -60, GETDATE())' +
            ')' +
            ')' +
            ')';
    }

    const { rows } = await pool.query(
        `UPDATE print_jobs
         SET status = CASE
                 WHEN claimed_by IS NOT NULL AND attempts < max_attempts THEN 'QUEUED'
                 ELSE 'FAILED'
             END,
             claimed_by = NULL, claimed_at = NULL, updated_at = GETDATE(),
             error = COALESCE(error, 'STALE_PROCESSING_REQUEUED')
         WHERE ($1 IS NULL OR branch_id = $1)
           AND status = 'PROCESSING'
           AND claimed_at < DATEADD(MINUTE, -2, GETDATE());

         ;WITH next_job AS (
            SELECT TOP (1) *
            FROM print_jobs WITH (UPDLOCK, READPAST, ROWLOCK)
            WHERE ($1 IS NULL OR branch_id = $1)
              AND status = 'QUEUED'
              AND attempts < max_attempts
              AND (COALESCE(target_gateway_id, gateway_id) = $2
                   OR ($3 = 1 AND COALESCE(target_gateway_id, gateway_id) IS NULL
                       ${capabilityClause}))
            ORDER BY created_at ASC
         )
         UPDATE next_job
         SET status = 'PROCESSING', claimed_by = $2, claimed_at = GETDATE(),
             attempts = attempts + 1, updated_at = GETDATE()
         OUTPUT INSERTED.*`,
        [params.branchId || null, params.gatewayId, params.claimUnassigned ? 1 : 0, params.globalClaim ? 1 : 0]
    );
    return rows[0] || null;
};

const resolvePrinterTarget = async (input: EnqueuePrintJobInput) => {
    if (!input.printerId) {
        return {
            printerAddress: input.printerAddress || null,
            printerType: input.printerType || 'LOCAL',
            targetGatewayId: input.targetGatewayId || null,
        };
    }

    const { rows } = await pool.query(
        `SELECT address, type, gateway_id, station_id FROM printers WHERE id = $1`,
        [input.printerId]
    );
    const printer = rows[0];
    if (!printer) {
        return {
            printerAddress: input.printerAddress || null,
            printerType: input.printerType || 'LOCAL',
            targetGatewayId: input.targetGatewayId || null,
        };
    }

    // Auto-bind: an unbound printer is routed to whichever gateway bridge
    // registered its Windows name — no manual gateway configuration needed.
    let autoGatewayId: string | null = null;
    if (!printer.gateway_id && !printer.station_id) {
        autoGatewayId = await getGatewayForPrinter(printer.address || input.printerAddress, input.branchId || null).catch(() => null);
    }

    return {
        printerAddress: printer.address || input.printerAddress || null,
        printerType: printer.type || input.printerType || 'LOCAL',
        targetGatewayId: input.targetGatewayId || printer.gateway_id || printer.station_id || autoGatewayId || null,
    };
};

export const enqueuePrintJob = async (input: EnqueuePrintJobInput) => {
    await ensureTable();
    const id = `PRNJOB-${crypto.randomUUID()}`;
    const target = await resolvePrinterTarget(input);
    const targetGatewayId = normalizeGatewayId(target.targetGatewayId);
    const requestedMaxAttempts = Number(input.maxAttempts);
    const maxAttempts = Number.isFinite(requestedMaxAttempts)
        ? Math.max(1, Math.floor(requestedMaxAttempts))
        : 3;

    await pool.query(
        `INSERT INTO print_jobs (id, branch_id, type, content, content_type, printer_id, printer_address, printer_type, target_gateway_id, gateway_id, status, created_by, max_attempts)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 'QUEUED', $10, $11)`,
        [id, input.branchId, input.type, input.content, input.contentType || 'text',
         input.printerId || null, target.printerAddress, target.printerType, targetGatewayId, input.createdBy || null,
         maxAttempts]
    );

    // Try to push via SSE immediately — if bridge is connected, it prints now
    const pushed = await pushJobToBridge(id, input.branchId).catch(() => false);

    return { id, pushed };
};

export const completePrintJob = async (jobId: string, gatewayId: string, branchId?: string | null) => {
    await ensureTable();
    const targetGatewayId = normalizeGatewayId(gatewayId);
    const targetBranchId = normalizeGatewayId(branchId);
    const { rows } = await pool.query(
        `UPDATE print_jobs
         SET status = 'COMPLETED', completed_at = GETDATE(), updated_at = GETDATE()
         OUTPUT INSERTED.*
         WHERE id = $1
           AND ($2 IS NULL OR branch_id = $2)
           AND (status = 'COMPLETED' OR (status = 'PROCESSING' AND claimed_by = $3))`,
        [jobId, targetBranchId, targetGatewayId]
    );
    return rows[0] || null;
};

export const failPrintJob = async (jobId: string, error: string, gatewayId?: string | null, branchId?: string | null) => {
    await ensureTable();
    const message = error.slice(0, 1000);
    const targetGatewayId = normalizeGatewayId(gatewayId);
    const targetBranchId = normalizeGatewayId(branchId);
    const { rows } = await pool.query(
        `UPDATE print_jobs
         SET status = CASE
                 WHEN claimed_by IS NOT NULL AND attempts < max_attempts THEN 'QUEUED'
                 ELSE 'FAILED'
             END,
             error = $1, error_message = $1, failed_at = GETDATE(), updated_at = GETDATE()
         OUTPUT INSERTED.*
         WHERE id = $2
           AND ($3 IS NULL OR branch_id = $3)
           AND status = 'PROCESSING'
           AND claimed_by = $4`,
        [message, jobId, targetBranchId, targetGatewayId]
    );
    return rows[0] || null;
};

export const listPrintJobs = async (params: {
    branchId?: string;
    status?: string;
    gatewayId?: string;
    limit?: number;
}) => {
    await ensureTable();
    const conditions: string[] = [];
    const values: any[] = [];
    if (params.branchId) {
        values.push(params.branchId);
        conditions.push(`branch_id = $${values.length}`);
    }
    if (params.status) {
        values.push(params.status);
        conditions.push(`status = $${values.length}`);
    }
    if (params.gatewayId) {
        values.push(params.gatewayId);
        conditions.push(`(COALESCE(target_gateway_id, gateway_id) IS NULL OR COALESCE(target_gateway_id, gateway_id) = $${values.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(500, Math.max(1, Number(params.limit || 100)));
    const { rows } = await pool.query(
        `SELECT * FROM print_jobs ${where} ORDER BY created_at DESC`,
        values
    );
    return (rows || []).slice(0, limit);
};

export const getPrintQueueStats = async (branchId?: string) => {
    await ensureTable();
    const scope = branchId ? `WHERE branch_id = $1` : '';
    const params = branchId ? [branchId] : [];
    const { rows } = await pool.query(
        `SELECT status, COUNT(*) AS count FROM print_jobs ${scope} GROUP BY status`,
        params
    );
    const stats = { queued: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    for (const row of (rows || [])) {
        const count = Number(row.count || 0);
        const status = String(row.status || '').toUpperCase();
        if (status === 'QUEUED') stats.queued = count;
        if (status === 'PROCESSING') stats.processing = count;
        if (status === 'COMPLETED') stats.completed = count;
        if (status === 'FAILED') stats.failed = count;
        stats.total += count;
    }
    return stats;
};

export const retryPrintJob = async (jobId: string, branchId: string) => {
    await ensureTable();
    const { rows } = await pool.query(
        `UPDATE print_jobs SET status = 'QUEUED', attempts = 0, claimed_by = NULL, claimed_at = NULL,
             error = NULL, error_message = NULL, failed_at = NULL, updated_at = GETDATE()
         OUTPUT INSERTED.* WHERE id = $1 AND branch_id = $2 AND status = 'FAILED'`,
        [jobId, branchId]
    );
    const job = rows[0];
    if (job) {
        await pushJobToBridge(jobId, branchId).catch(() => false);
    }
    return job || null;
};

export const cancelPrintJob = async (jobId: string, branchId: string) => {
    await ensureTable();
    const { rows } = await pool.query(
        `DELETE FROM print_jobs OUTPUT DELETED.* WHERE id = $1 AND branch_id = $2`,
        [jobId, branchId]
    );
    return rows[0] || null;
};

export const purgePrintJobs = async (branchId: string) => {
    await ensureTable();
    const result = await pool.query(
        `DELETE FROM print_jobs WHERE branch_id = $1`,
        [branchId]
    );
    return result.rowCount || 0;
};
