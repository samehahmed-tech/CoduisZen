import { describe, expect, it } from 'vitest';
import { getPublicBusinessHours, isBranchOpenAt } from '../server/utils/branchHoursPolicy';

const hours = {
    Sunday: { open: '09:00', close: '23:00', enabled: true },
    Monday: { open: '09:00', close: '23:00', enabled: true },
    Tuesday: { open: '09:00', close: '23:00', enabled: true },
    Wednesday: { open: '09:00', close: '23:00', enabled: true },
    Thursday: { open: '09:00', close: '23:00', enabled: true },
    Friday: { open: '16:00', close: '02:00', enabled: true },
    Saturday: { open: '09:00', close: '23:00', enabled: true },
};

describe('branch hours policy', () => {
    it('uses the branch timezone and supports overnight windows', () => {
        expect(isBranchOpenAt(hours, new Date('2026-10-23T18:00:00.000Z'), 'Africa/Cairo')).toBe(true);
        expect(isBranchOpenAt(hours, new Date('2026-10-23T22:30:00.000Z'), 'Africa/Cairo')).toBe(true);
        expect(isBranchOpenAt(hours, new Date('2026-10-24T01:00:00.000Z'), 'Africa/Cairo')).toBe(false);
    });

    it('reports disabled days and preserves compatibility when unset', () => {
        expect(isBranchOpenAt({ ...hours, Sunday: { ...hours.Sunday, enabled: false } }, new Date('2026-10-25T12:00:00.000Z'), 'Africa/Cairo')).toBe(false);
        expect(isBranchOpenAt({ Sunday: { open: '09:00', close: '23:00', enabled: true } }, new Date('2026-10-26T12:00:00.000Z'), 'Africa/Cairo')).toBe(false);
        expect(isBranchOpenAt({}, new Date('2026-10-25T03:00:00.000Z'), 'Africa/Cairo')).toBe(true);
        expect(getPublicBusinessHours({}, new Date('2026-10-25T03:00:00.000Z'), 'Africa/Cairo').configured).toBe(false);
    });
});
