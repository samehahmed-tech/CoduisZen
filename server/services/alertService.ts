import logger from '../utils/logger';
import { whatsappService } from './whatsappService';

export type AlertSeverity = 'INFO' | 'WARNING' | 'FATAL';

interface AlertConfig {
    enabled: boolean;
    whatsappAdminNumber?: string;
    rateLimitMs: number; // Prevent spam per alert key
}

const config: AlertConfig = {
    enabled: true,
    whatsappAdminNumber: process.env.ADMIN_WHATSAPP_NUMBER || '201000000000', // Example fallback
    rateLimitMs: 15 * 60 * 1000, // 15 mins default
};

// In-memory rate limiting map: string (alertKey) -> timestamp
const lastAlertFired = new Map<string, number>();

export const alertService = {
    /**
     * Dispatch an operational system alert to administrators.
     */
    async dispatch(severity: AlertSeverity, category: string, message: string, context: Record<string, any> = {}) {
        if (!config.enabled) return;

        const alertKey = `${severity}:${category}`;
        const now = Date.now();
        const lastFired = lastAlertFired.get(alertKey);

        // Rate limiting logic
        if (lastFired && now - lastFired < config.rateLimitMs) {
            logger.debug({ alertKey }, 'Alert suppressed due to rate limiting');
            return;
        }

        lastAlertFired.set(alertKey, now);

        // Primary Logging
        logger[severity === 'FATAL' ? 'fatal' : severity === 'WARNING' ? 'warn' : 'info']({ category, ...context }, `[ALERT: ${severity}] ${message}`);

        // Notification routing
        if (severity === 'FATAL' && config.whatsappAdminNumber) {
            try {
                const text = `🚨 *FATAL SYSTEM ALERT* 🚨\n\n*Category:* ${category}\n*Message:* ${message}\n\n*Details:* \`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`\n\n*Action Required Immediately.*`;
                whatsappService.enqueueMessage({ to: config.whatsappAdminNumber, text });
            } catch (err) {
                logger.error({ err }, 'Failed to dispatch fatal alert via WhatsApp');
            }
        }
    },
    
    resetRateLimits() {
        lastAlertFired.clear();
    },

    /**
     * Start periodic background health checks for system metrics (Item 40).
     * Dispatches alerts automatically if thresholds are exceeded.
     */
    startHealthMonitor(intervalMs = 60000 * 2) { // 2 minutes default
        if (!config.enabled) return;

        setInterval(async () => {
            try {
                // 1. Database Pool Stats
                const { dbMaintenanceService } = await import('./dbMaintenanceService');
                const poolStats = dbMaintenanceService.getPoolStats();
                if (poolStats.waitingClients > 10) {
                    await this.dispatch('FATAL', 'DB_POOL', 'Database connection pool is saturated and clients are waiting.', poolStats);
                }

                // 2. Redis / Socket Realtime Check
                const { getSocketRuntimeStatus } = await import('../socket');
                const socketStatus = getSocketRuntimeStatus();
                if (socketStatus.adapter === 'redis' && !socketStatus.redisConnected) {
                    await this.dispatch('FATAL', 'REALTIME', 'Redis adapter disconnected in production. Socket broadcasting may fail.', socketStatus);
                }

                // 3. Finance Exceptions
                const { financeRetryService } = await import('./financeRetryService');
                const financeQueue = await financeRetryService.getRetryQueueStatus();
                if (financeQueue.pendingCount > 15) {
                    await this.dispatch('WARNING', 'FINANCE', 'High number of unresolved finance ledger exceptions.', financeQueue);
                }

                // 4. Fiscal Failures
                const { fiscalRetryService } = await import('./fiscalRetryService');
                const fiscalQueue = await fiscalRetryService.getRetryQueueStatus();
                if (fiscalQueue.failedCount > 20) {
                    await this.dispatch('FATAL', 'FISCAL', 'High number of failed ETA fiscal submissions.', fiscalQueue);
                }

            } catch (err) {
                logger.error({ err }, 'Failed to run background health monitor loop');
            }
        }, intervalMs);

        logger.info('System health monitor started for alerting');
    }
};
