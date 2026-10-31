/**
 * Payment gateway reconciliation.
 *
 * A gateway refund can succeed remotely while the local process is interrupted
 * before it records the result. These sessions are intentionally not retried
 * automatically: the safe action is to reconcile the provider transaction first.
 */
import { db } from '../db';
import { orders, paymentSessions } from '../../src/db/schema';
import { and, eq, lt } from 'drizzle-orm';
import logger from '../utils/logger';

const log = logger.child({ service: 'gateway-reconciliation' });

export const gatewayReconciliationService = {
    async listStaleProcessing(branchId?: string, olderThanMinutes = 15) {
        const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
        const filters = [
            eq(paymentSessions.status, 'refund_processing'),
            lt(paymentSessions.updatedAt, cutoff),
        ];
        if (branchId) filters.push(eq(orders.branchId, branchId));

        return db.select({
            sessionId: paymentSessions.id,
            orderId: paymentSessions.orderId,
            providerType: paymentSessions.providerType,
            amount: paymentSessions.amount,
            branchId: orders.branchId,
            updatedAt: paymentSessions.updatedAt,
        }).from(paymentSessions)
            .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
            .where(and(...filters));
    },

    async getStatus(branchId?: string, olderThanMinutes = 15) {
        const stale = await this.listStaleProcessing(branchId, olderThanMinutes);
        return {
            staleCount: stale.length,
            requiresManualReconciliation: stale.length > 0,
            sessions: stale,
            olderThanMinutes,
        };
    },

    async alertIfNeeded() {
        const stale = await this.listStaleProcessing(undefined, 15);
        if (stale.length > 0) {
            log.error({ count: stale.length, sessionIds: stale.map(item => item.sessionId) }, 'Gateway refunds require manual reconciliation');
            return stale.length;
        }
        return 0;
    },
};

export default gatewayReconciliationService;
