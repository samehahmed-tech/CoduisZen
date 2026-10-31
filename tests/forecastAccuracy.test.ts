import { describe, expect, it } from 'vitest';
import { calculateWalkForwardMape } from '../server/utils/forecastAccuracy';

describe('forecast accuracy measurement', () => {
    it('measures holdout error without leaking the holdout into training', () => {
        const result = calculateWalkForwardMape([10, 20, 30, 40, 50, 60, 70, 80], 2);
        expect(result.method).toBe('WALK_FORWARD_LINEAR_REGRESSION_MAPE');
        expect(result.holdoutDays).toBe(2);
        expect(result.mapePercent).toBe(0);
    });

    it('returns an explicit unavailable accuracy for insufficient history', () => {
        expect(calculateWalkForwardMape([10, 20, 30], 2)).toEqual({
            method: 'WALK_FORWARD_LINEAR_REGRESSION_MAPE',
            holdoutDays: 0,
            mapePercent: null,
        });
    });
});
