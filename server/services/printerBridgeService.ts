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

export const markBridgePoll = (gatewayId: string, branchId?: string) => {
    pollingBridges.set(gatewayId, { id: gatewayId, branchId: branchId || '*', lastSeenAt: new Date() });
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
