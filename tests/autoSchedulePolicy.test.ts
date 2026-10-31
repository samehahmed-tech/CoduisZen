import { describe, expect, it } from 'vitest';
import { buildAutoSchedulePreview } from '../server/utils/autoSchedulePolicy';

describe('auto schedule policy', () => {
    it('assigns forecast demand round-robin without exceeding active employees', () => {
        const result = buildAutoSchedulePreview({
            days: [{ date: '2026-01-04', requiredHeadcount: 2 }],
            employees: [{ id: 'e1', name: 'A' }, { id: 'e2', name: 'B' }],
            template: { id: 't1', startTime: '09:00', endTime: '17:00', workDays: ['sun'] },
        });
        expect(result.readyToPublish).toBe(true);
        expect(result.entries).toHaveLength(2);
        expect(result.blockers).toEqual([]);
    });

    it('blocks publication when demand exceeds available employees', () => {
        const result = buildAutoSchedulePreview({
            days: [{ date: '2026-01-04', requiredHeadcount: 3 }],
            employees: [{ id: 'e1' }],
            template: { id: 't1', startTime: '09:00', endTime: '17:00', workDays: ['sun'] },
        });
        expect(result.readyToPublish).toBe(false);
        expect(result.blockers[0].reason).toBe('INSUFFICIENT_ACTIVE_EMPLOYEES');
    });
});
