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
                // 1. Redis / Socket Realtime Check
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

                // 5. Payment webhook dead letters
                const { paymentWebhookRetryService } = await import('./paymentWebhookRetryService');
                const paymentQueue = await paymentWebhookRetryService.getQueueStatus();
                if (paymentQueue.deadLetter > 0) {
                    await this.dispatch('FATAL', 'PAYMENT_WEBHOOK', 'Payment callbacks require manual reconciliation.', paymentQueue);
                } else if (paymentQueue.pending > 10) {
                    await this.dispatch('WARNING', 'PAYMENT_WEBHOOK', 'Payment callback retry queue is growing.', paymentQueue);
                }

                // A provider response may have arrived just before a process
                // crash. Never retry these blindly; surface them for manual
                // provider-side reconciliation to avoid double refunds.
                const { gatewayReconciliationService } = await import('./gatewayReconciliationService');
                const staleGatewayRefunds = await gatewayReconciliationService.alertIfNeeded();
                if (staleGatewayRefunds > 0) {
                    await this.dispatch('FATAL', 'PAYMENT_REFUND_RECONCILIATION', 'Gateway refunds require manual reconciliation before any retry.', { staleCount: staleGatewayRefunds });
                }

                // SLA monitoring uses the same bounded in-memory histograms as
                // the admin status endpoint. It never stores request payloads
                // and reuses alert rate limiting to avoid notification storms.
                const { getRequestTiming } = await import('../middleware/requestTiming');
                const { recordSlaSnapshot } = await import('./slaMetricsService');
                const p95TargetMs = Math.max(25, Number(process.env.SLA_P95_TARGET_MS || 1000));
                const routes = getRequestTiming();
                const totalRequests = routes.reduce((sum, route) => sum + route.n, 0);
                const totalErrors = routes.reduce((sum, route) => sum + route.errors, 0);
                const errorRate = totalRequests > 0 ? Number((totalErrors / totalRequests).toFixed(4)) : 0;
                const slaBreaches = routes
                    .filter((route) => route.n >= 5 && route.p95 > p95TargetMs)
                    .slice(0, 20);
                await recordSlaSnapshot({
                    p95TargetMs,
                    totalRequests,
                    totalErrors,
                    errorRate,
                    routesOverTarget: slaBreaches.map((route) => ({ route: route.route, n: route.n, p95: route.p95, errors: route.errors })),
                });
                if (slaBreaches.length > 0) {
                    await this.dispatch('WARNING', 'SLA', 'API routes exceeded the configured p95 latency target.', {
                        p95TargetMs,
                        routes: slaBreaches.map((route) => ({ route: route.route, n: route.n, p95: route.p95, errors: route.errors })),
                    });
                }

            } catch (err) {
                logger.error({ err }, 'Failed to run background health monitor loop');
            }
        }, intervalMs);

        logger.info('System health monitor started for alerting');
    }
};
