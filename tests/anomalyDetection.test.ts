import { describe, expect, it } from 'vitest';
import { detectLatestAnomaly } from '../server/utils/anomalyDetection';

describe('operational anomaly detection', () => {
    it('flags an explainable latest spike', () => {
        const result = detectLatestAnomaly({ key: 'VOID_SPIKE', label: 'Voids', date: '2026-10-27', value: 10, baseline: [1, 1, 2, 1, 1], source: 'audit_logs.event_type' });
        expect(result).toMatchObject({ key: 'VOID_SPIKE', severity: 'HIGH', source: 'audit_logs.event_type' });
        expect(result?.explanation).toContain('standard deviations');
    });

    it('does not flag normal observations or empty baselines', () => {
        expect(detectLatestAnomaly({ key: 'REFUND_SPIKE', label: 'Refunds', date: '2026-10-27', value: 2, baseline: [1, 2, 3], source: 'refund_records.amount' })).toBeNull();
        expect(detectLatestAnomaly({ key: 'REFUND_SPIKE', label: 'Refunds', date: '2026-10-27', value: 20, baseline: [], source: 'refund_records.amount' })).toBeNull();
    });
});
