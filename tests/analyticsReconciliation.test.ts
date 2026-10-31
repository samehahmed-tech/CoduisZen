import { describe, expect, it } from 'vitest';
import { reconcileDailyBranchSnapshots } from '../server/utils/analyticsReconciliation';

describe('analytics reconciliation', () => {
    it('detects missing and divergent daily snapshots', () => {
        const mismatches = reconcileDailyBranchSnapshots(
            [{ date: '2026-10-26', revenue: 100, netRevenue: 90, orders: 2, tax: 10, discounts: 0 }],
            [{ date: '2026-10-26', revenue: 95, netRevenue: 90, orders: 1, tax: 10, discounts: 0 }],
        );
        expect(mismatches).toEqual([{
            date: '2026-10-26',
            fields: {
                revenue: { expected: 100, actual: 95, difference: 5 },
                orders: { expected: 2, actual: 1, difference: 1 },
            },
        }]);
    });

    it('ignores differences within the configured tolerance', () => {
        expect(reconcileDailyBranchSnapshots(
            [{ date: '2026-10-26', revenue: 100, netRevenue: 100, orders: 1, tax: 0, discounts: 0 }],
            [{ date: '2026-10-26', revenue: 100.005, netRevenue: 100, orders: 1, tax: 0, discounts: 0 }],
        )).toEqual([]);
    });
});
