import { describe, expect, it } from 'vitest';
import { buildShiftWindow, findShiftConflict, hasPartialShiftTime } from '../server/utils/schedulingPolicy';

describe('scheduling policy', () => {
    it('supports overnight windows and rejects invalid partial times', () => {
        const window = buildShiftWindow({ date: '2026-10-27', startTime: '22:00', endTime: '06:00' });
        expect(window).not.toBeNull();
        expect((window!.end - window!.start) / 3_600_000).toBe(8);
        expect(hasPartialShiftTime({ startTime: '09:00', endTime: undefined })).toBe(true);
    });

    it('rejects overlaps and shifts that violate the eleven-hour rest rule', () => {
        const existing = [{ id: 'night', date: '2026-10-27', startTime: '22:00', endTime: '06:00' }];
        expect(findShiftConflict({ date: '2026-10-28', startTime: '05:00', endTime: '10:00' }, existing)?.kind).toBe('OVERLAP');
        expect(findShiftConflict({ date: '2026-10-28', startTime: '14:00', endTime: '20:00' }, existing)?.kind).toBe('MIN_REST');
        expect(findShiftConflict({ date: '2026-10-28', startTime: '18:00', endTime: '22:00' }, existing)).toBeNull();
    });
});
