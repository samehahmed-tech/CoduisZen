import { describe, expect, it } from 'vitest';
import { buildDayCloseConfirmationMessage } from '../components/DayCloseHub';

describe('day close confirmation summary', () => {
    it('includes sales, cash reconciliation, variance, and blockers', () => {
        const message = buildDayCloseConfirmationMessage({
            salesSummary: { totalOrders: 12, totalRevenue: 3450 },
            shiftCashSummary: { expectedCash: 1000, actualCash: 990, variance: -10 },
            readiness: { checks: [{ passed: true }, { passed: false }] },
        }, 'en');

        expect(message).toContain('Orders: 12');
        expect(message).toContain('Revenue: 3,450');
        expect(message).toContain('Expected cash: 1,000');
        expect(message).toContain('Actual cash: 990');
        expect(message).toContain('Variance: -10');
        expect(message).toContain('Close blockers: 1');
    });
});
