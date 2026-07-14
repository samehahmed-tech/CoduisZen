/**
 * System Health & Diagnostics Service
 * Implements: Phase 4.16 (Observability & Health Checks)
 * 
 * Provides real-time status of critical infrastructure components.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import os from 'os';
import logger from '../utils/logger';
import { whatsappService } from './whatsappService';
import { getConnectedBridges } from './printerBridgeService';
import { getPrintQueueStats } from './printQueueService';

const log = logger.child({ service: 'health' });

export interface HealthStatus {
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    timestamp: string;
    services: {
        database: { status: string; latencyMs: number };
        whatsapp: { status: string; provider: string; configured: boolean; reason?: string };
        printing: { status: string; connectedBridges: number; bridges: unknown[]; queue?: unknown; reason?: string };
        memory: { totalGb: number; freeGb: number; usagePercent: number };
        cpu: { loadAvg: number[]; cores: number };
        uptime: number; // seconds
    };
}

export const healthService = {

    /**
     * Comprehensive health check.
     */
    async getStatus(): Promise<HealthStatus> {
        let dbStatus = 'UNKNOWN';
        let dbLatency = -1;

        try {
            const start = Date.now();
            await db.execute(sql`SELECT 1`);
            dbLatency = Date.now() - start;
            dbStatus = 'CONNECTED';
        } catch (err: any) {
            dbStatus = 'DISCONNECTED';
            log.error({ err: err.message }, 'Database health check failed');
        }

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memUsage = ((totalMem - freeMem) / totalMem) * 100;
        let whatsapp: HealthStatus['services']['whatsapp'] = { status: 'DISABLED', provider: 'disabled', configured: false };
        if (String(process.env.ENABLE_WHATSAPP_WEB || '').toLowerCase() === 'true') {
            try {
                const current = await whatsappService.getStatus();
                whatsapp = {
                    status: String(current.status || 'UNKNOWN'),
                    provider: String(current.provider || whatsappService.getProvider()),
                    configured: Boolean(current.configured),
                    ...((current as any).reason ? { reason: String((current as any).reason).slice(0, 300) } : {}),
                };
            } catch (err: any) {
                whatsapp = { status: 'ERROR', provider: whatsappService.getProvider(), configured: true, reason: String(err.message || err).slice(0, 300) };
            }
        }
        const bridges = getConnectedBridges();
        let printing: HealthStatus['services']['printing'] = {
            status: bridges.length ? 'READY' : 'NO_BRIDGE',
            connectedBridges: bridges.length,
            bridges,
        };
        try {
            printing.queue = await getPrintQueueStats();
        } catch (err: any) {
            printing = { ...printing, status: 'DEGRADED', reason: String(err.message || err).slice(0, 300) };
        }

        return {
            status: dbStatus === 'CONNECTED' && memUsage < 98 ? 'HEALTHY' : 'DEGRADED',
            timestamp: new Date().toISOString(),
            services: {
                database: { status: dbStatus, latencyMs: dbLatency },
                whatsapp,
                printing,
                memory: {
                    totalGb: Math.round(totalMem / (1024 ** 3) * 100) / 100,
                    freeGb: Math.round(freeMem / (1024 ** 3) * 100) / 100,
                    usagePercent: Math.round(memUsage * 100) / 100,
                },
                cpu: {
                    loadAvg: os.loadavg(),
                    cores: os.cpus().length,
                },
                uptime: os.uptime(),
            }
        };
    }
};
