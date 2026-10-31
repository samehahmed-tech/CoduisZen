import { describe, expect, it } from 'vitest';
import { calculateFoodCostVariance } from '../server/utils/foodCost';

describe('calculateFoodCostVariance', () => {
    it('calculates cost variance and food cost percentages', () => {
        expect(calculateFoodCostVariance({ theoreticalCost: 100, actualCost: 115, revenue: 500 })).toEqual({
            theoreticalCost: 100,
            actualCost: 115,
            variance: 15,
            variancePercent: 15,
            theoreticalFoodCostPercent: 20,
            actualFoodCostPercent: 23,
        });
    });

    it('handles zero theoretical cost and invalid inputs safely', () => {
        expect(calculateFoodCostVariance({ theoreticalCost: 0, actualCost: 10, revenue: 0 })).toMatchObject({ theoreticalCost: 0, actualCost: 10, variance: 10, variancePercent: 0 });
        expect(calculateFoodCostVariance({ theoreticalCost: Number.NaN, actualCost: -2, revenue: -1 })).toEqual({
            theoreticalCost: 0, actualCost: 0, variance: 0, variancePercent: 0, theoreticalFoodCostPercent: 0, actualFoodCostPercent: 0,
        });
    });
});
