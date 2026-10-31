import { describe, expect, it } from 'vitest';
import { findShiftConflict } from '../server/utils/schedulingPolicy';

describe('configurable rest policy', () => {
    it('supports a branch policy longer than the safe default', () => {
        const conflict = findShiftConflict(
            { date: '2026-01-02', startTime: '08:00', endTime: '16:00' },
            [{ id: 'previous', date: '2026-01-01', startTime: '20:00', endTime: '23:00' }],
            12 * 60,
        );
        expect(conflict?.kind).toBe('MIN_REST');
    });

    it('keeps the default safety floor when a lower value is requested', () => {
        const safeFloor = Math.max(660, Math.min(1440, 30));
        expect(safeFloor).toBe(660);
    });
});
