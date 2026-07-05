import { alertService } from './alertService';
import logger from '../utils/logger';

export type CriticalFlow = 'PAYROLL_COMPUTE' | 'ATTENDANCE_SYNC' | 'DAY_CLOSE' | 'PAYMENT_GATEWAY';

interface SloMetrics {
    totalAttempts: number;
    failures: number;
    startDate: number; // For rolling windows
}

// In-memory SLO tracker. In production, this would be Redis-backed.
const sloTrackers = new Map<CriticalFlow, SloMetrics>();

const SLO_TARGETS: Record<CriticalFlow, number> = {
    PAYROLL_COMPUTE: 0.999, // 99.9% success
    ATTENDANCE_SYNC: 0.99,  // 99% success
    DAY_CLOSE: 0.999,
    PAYMENT_GATEWAY: 0.9999
};

const RESET_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export const sloService = {
    _getTracker(flow: CriticalFlow): SloMetrics {
        const now = Date.now();
        let tracker = sloTrackers.get(flow);

        // Reset if rolling window expired
        if (!tracker || (now - tracker.startDate) > RESET_WINDOW_MS) {
            tracker = { totalAttempts: 0, failures: 0, startDate: now };
            sloTrackers.set(flow, tracker);
        }

        return tracker;
    },

    /**
     * Record a success in a critical flow
     */
    recordSuccess(flow: CriticalFlow) {
        const tracker = this._getTracker(flow);
        tracker.totalAttempts++;
    },

    /**
     * Record a failure and evaluate SLO degradation 
     */
    recordFailure(flow: CriticalFlow, errorContext: Record<string, any> = {}) {
        const tracker = this._getTracker(flow);
        tracker.totalAttempts++;
        tracker.failures++;

        this.evaluateSLO(flow, tracker, errorContext);
    },

    /**
     * Check if SLO has degraded below threshold and alert
     */
    evaluateSLO(flow: CriticalFlow, tracker: SloMetrics, context: Record<string, any>) {
        if (tracker.totalAttempts < 10) return; // Need minimum baseline data

        const successRate = (tracker.totalAttempts - tracker.failures) / tracker.totalAttempts;
        const targetRate = SLO_TARGETS[flow];

        if (successRate < targetRate) {
            alertService.dispatch(
                'FATAL',
                `SLO_DEGRADATION_${flow}`,
                `SLO dropped below target for ${flow}. Current: ${(successRate * 100).toFixed(2)}%, Target: ${(targetRate * 100).toFixed(2)}%.`,
                { ...context, total: tracker.totalAttempts, failures: tracker.failures }
            );
        }
    },
    
    getMetrics() {
        return Object.fromEntries(sloTrackers);
    }
};
