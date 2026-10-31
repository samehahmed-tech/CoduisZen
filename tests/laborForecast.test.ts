import { describe, expect, it } from 'vitest';
import { calculateLaborForecast } from '../server/utils/laborForecast';

describe('labor forecast calculation', () => {
    it('translates forecast revenue into required hours and headcount', () => {
        const history = Array.from({ length: 14 }, (_, index) => ({
            date: `2026-01-${String(index + 1).padStart(2, '0')}`,
            revenue: 800,
            laborHours: 10,
        }));
        const result = calculateLaborForecast(history, [{ date: '2026-01-15', revenue: 1600 }]);
        expect(result.salesPerLaborHour).toBe(80);
        expect(result.forecast[0]).toMatchObject({ requiredLaborHours: 20, requiredHeadcount: 3 });
        expect(result.dataQuality).toBe('HIGH');
        expect(result.source).toBe('ORDERS_TOTAL_AND_ATTENDANCE_SESSION_HOURS');
    });

    it('does not invent staffing when history is insufficient', () => {
        const result = calculateLaborForecast([
            { date: '2026-01-01', revenue: 1000, laborHours: 0 },
            { date: '2026-01-02', revenue: 0, laborHours: 8 },
        ], [{ date: '2026-01-03', revenue: 1200 }]);
        expect(result.dataQuality).toBe('INSUFFICIENT');
        expect(result.forecast).toEqual([]);
        expect(result.confidence).toBe(0);
    });
});
