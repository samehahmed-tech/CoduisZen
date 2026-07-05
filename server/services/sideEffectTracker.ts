/**
 * Side Effect Tracker Service
 * Sprint 2 - Item 6: No silent failures for Finance/Fiscal/Print
 * 
 * Records the status of every critical side effect per order in domain_events.
 * This ensures failures are traceable and visible in the ops dashboard.
 */

import { eventBusService } from './eventBusService';
import logger from '../utils/logger';

const log = logger.child({ service: 'side-effect-tracker' });

export type SideEffectType = 'finance' | 'fiscal' | 'print' | 'webhook' | 'loyalty' | 'analytics' | 'kds';
export type SideEffectStatus = 'pending' | 'success' | 'failed' | 'skipped';

interface TrackInput {
    orderId: string;
    branchId?: string;
    effectType: SideEffectType;
    status: SideEffectStatus;
    error?: string;
    metadata?: Record<string, any>;
}

export const sideEffectTracker = {
    /**
     * Record a side effect outcome for an order.
     * Non-blocking — failures here should not affect the main flow.
     */
    async track(input: TrackInput): Promise<void> {
        try {
            await eventBusService.emitEvent({
                type: `side_effect.${input.effectType}.${input.status}`,
                entityType: 'order',
                entityId: input.orderId,
                branchId: input.branchId,
                payload: {
                    effectType: input.effectType,
                    status: input.status,
                    error: input.error,
                    ...input.metadata,
                    trackedAt: new Date().toISOString(),
                },
            });

            if (input.status === 'failed') {
                log.warn(
                    { orderId: input.orderId, effectType: input.effectType, error: input.error },
                    `Side effect failed: ${input.effectType}`
                );
            }
        } catch (err: any) {
            // Side effect tracking itself must never throw
            log.error(
                { err: err.message, orderId: input.orderId, effectType: input.effectType },
                'Failed to track side effect (non-critical)'
            );
        }
    },

    /** Convenience: track a successful side effect */
    async success(orderId: string, effectType: SideEffectType, branchId?: string, metadata?: Record<string, any>) {
        return this.track({ orderId, branchId, effectType, status: 'success', metadata });
    },

    /** Convenience: track a failed side effect */
    async failed(orderId: string, effectType: SideEffectType, error: string, branchId?: string, metadata?: Record<string, any>) {
        return this.track({ orderId, branchId, effectType, status: 'failed', error, metadata });
    },

    /** Convenience: track a skipped side effect */
    async skipped(orderId: string, effectType: SideEffectType, reason: string, branchId?: string) {
        return this.track({ orderId, branchId, effectType, status: 'skipped', metadata: { reason } });
    },
};

export default sideEffectTracker;
