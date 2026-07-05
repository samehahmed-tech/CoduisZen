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

const log = logger.child({ service: 'health' });

export interface HealthStatus {
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    timestamp: string;
    services: {
        database: { status: string; latencyMs: number };
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

        return {
            status: dbStatus === 'CONNECTED' && memUsage < 98 ? 'HEALTHY' : 'DEGRADED',
            timestamp: new Date().toISOString(),
            services: {
                database: { status: dbStatus, latencyMs: dbLatency },
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
