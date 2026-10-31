import { describe, expect, it } from 'vitest';
import { normalizeBusinessDate, resolveBusinessDateRange } from '../server/utils/businessDateRange';

describe('business date range policy', () => {
    it('accepts real ISO business dates and rejects invalid calendar dates', () => {
        expect(normalizeBusinessDate('2026-02-28')).toBe('2026-02-28');
        expect(normalizeBusinessDate('2026-02-30')).toBeNull();
        expect(normalizeBusinessDate('28-02-2026')).toBeNull();
    });

    it('defaults to a 30-day inclusive range and rejects inverted ranges', () => {
        expect(resolveBusinessDateRange(undefined, undefined, new Date('2026-10-27T12:00:00Z')))
            .toEqual({ from: '2026-09-28', to: '2026-10-27' });
        expect(() => resolveBusinessDateRange('2026-10-28', '2026-10-27')).toThrow('INVALID_BUSINESS_DATE_RANGE');
    });
});
