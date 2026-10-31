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
import { paymentGatewayService } from './paymentGatewayService';
import { getAggregatorsConfigRaw } from '../modules/aggregators/aggregatorConfig';
import { summarizeAggregatorProviderHealth, summarizePaymentProviderHealth, IntegrationProviderHealth } from './integrationHealth';
import { getPaymobConfigRaw } from '../modules/payments/paymobService';
import { probePaymobConnectivity } from '../utils/paymobHealthProbe';

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
        integrations: {
            status: 'HEALTHY' | 'DEGRADED' | 'NOT_CONFIGURED';
            mode: 'CONFIGURATION_ONLY' | 'LIVE_PROBE';
            payments: IntegrationProviderHealth[];
            aggregators: IntegrationProviderHealth[];
        };
        uptime: number; // seconds
    };
}

// Health is polled by the public status page and by operator dashboards. Keep
// one short-lived snapshot and one in-flight computation so concurrent polls
// do not stampede SQL/configuration checks or serialize on the same connection.
const HEALTH_CACHE_MS = Math.max(1000, Number(process.env.HEALTH_CACHE_MS || 5000));
let cachedHealth: { value: HealthStatus; expiresAt: number } | null = null;
let healthInFlight: Promise<HealthStatus> | null = null;

/** Comprehensive health check implementation. */
const computeHealthStatus = async (): Promise<HealthStatus> => {
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
        const waProvider = String(process.env.WHATSAPP_PROVIDER ?? 'whatsapp-web.js').toLowerCase().trim();
        const waEnabled = String(process.env.ENABLE_WHATSAPP_WEB || '').toLowerCase() === 'true'
            || waProvider === 'openwa' || waProvider === 'web' || waProvider === 'whatsapp-web' || waProvider === 'whatsapp-web.js';
        if (waEnabled) {
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

        let integrations: HealthStatus['services']['integrations'] = {
            status: 'NOT_CONFIGURED',
            mode: 'CONFIGURATION_ONLY',
            payments: [],
            aggregators: [],
        };
        if (dbStatus === 'CONNECTED') {
            try {
                const [paymentProviders, aggregatorConfigs] = await Promise.all([
                    paymentGatewayService.listProviders(''),
                    getAggregatorsConfigRaw(),
                ]);
                const payments = summarizePaymentProviderHealth(paymentProviders);
                const aggregators = summarizeAggregatorProviderHealth(aggregatorConfigs);
                const probesEnabled = String(process.env.ENABLE_INTEGRATION_HEALTH_PROBES || '').toLowerCase() === 'true';
                if (probesEnabled) {
                    const paymob = payments.find(provider => provider.provider === 'PAYMOB');
                    if (paymob?.configured) {
                        const probe = await probePaymobConnectivity(await getPaymobConfigRaw());
                        paymob.connectivity = probe.connectivity;
                        paymob.latencyMs = probe.latencyMs;
                        if (probe.reason) paymob.probeReason = probe.reason;
                    }
                }
                const configuredCount = [...payments, ...aggregators].filter(provider => provider.configured).length;
                const pendingCount = [...payments, ...aggregators].filter(provider => provider.status === 'ADAPTER_PENDING').length;
                const probeErrors = [...payments, ...aggregators].filter(provider => provider.configured && provider.connectivity === 'ERROR').length;
                integrations = {
                    status: configuredCount > 0 ? (pendingCount > 0 || probeErrors > 0 ? 'DEGRADED' : 'HEALTHY') : 'NOT_CONFIGURED',
                    mode: probesEnabled ? 'LIVE_PROBE' : 'CONFIGURATION_ONLY',
                    payments,
                    aggregators,
                };
            } catch (err: any) {
                integrations = {
                    ...integrations,
                    status: 'DEGRADED',
                };
                log.warn({ err: String(err?.message || err).slice(0, 200) }, 'Integration configuration health check failed');
            }
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
                integrations,
                uptime: os.uptime(),
            }
        };
};

export const healthService = {
    async getStatus(): Promise<HealthStatus> {
        const now = Date.now();
        if (cachedHealth && cachedHealth.expiresAt > now) return cachedHealth.value;
        if (healthInFlight) return healthInFlight;

        healthInFlight = computeHealthStatus()
            .then((value) => {
                cachedHealth = { value, expiresAt: Date.now() + HEALTH_CACHE_MS };
                return value;
            })
            .finally(() => {
                healthInFlight = null;
            });
        return healthInFlight;
    },
};
