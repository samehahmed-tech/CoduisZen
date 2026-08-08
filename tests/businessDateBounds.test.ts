import { describe, expect, it } from 'vitest';
import { getBusinessDateBounds } from '../server/utils/businessDate';

describe('business date timezone bounds', () => {
    it('uses branch timezone instead of server timezone', () => {
        const cairo = getBusinessDateBounds('2026-01-15', 'Africa/Cairo');
        const newYork = getBusinessDateBounds('2026-01-15', 'America/New_York');

        expect(cairo.startOfDay.toISOString()).toBe('2026-01-14T22:00:00.000Z');
        expect(newYork.startOfDay.toISOString()).toBe('2026-01-15T05:00:00.000Z');
    });

    it('supports daylight-saving days that are not 24 hours', () => {
        const springForward = getBusinessDateBounds('2026-03-08', 'America/New_York');
        const fallBack = getBusinessDateBounds('2026-11-01', 'America/New_York');

        expect(springForward.endOfDay.getTime() - springForward.startOfDay.getTime() + 1).toBe(23 * 60 * 60 * 1000);
        expect(fallBack.endOfDay.getTime() - fallBack.startOfDay.getTime() + 1).toBe(25 * 60 * 60 * 1000);
    });
});
