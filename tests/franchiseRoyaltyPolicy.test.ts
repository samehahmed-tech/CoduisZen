import { describe, expect, it } from 'vitest';
import { calculateRoyalty, isEligibleRoyaltyOrder } from '../server/utils/royaltyPolicy';

describe('franchise royalty policy', () => {
    it('calculates royalty and marketing fees in cents from net sales', () => {
        expect(calculateRoyalty({ subtotal: 100.005, discount: 10, royaltyPercentage: 5, marketingFeePercentage: 2 })).toEqual({
            netSales: 90.01,
            royaltyAmount: 4.5,
            marketingFeeAmount: 1.8,
            totalDue: 6.3,
        });
    });

    it('rejects invalid percentages and excludes non-final orders', () => {
        expect(() => calculateRoyalty({ subtotal: 100, royaltyPercentage: 101 })).toThrow('ROYALTY_PERCENTAGE_OUT_OF_RANGE');
        expect(isEligibleRoyaltyOrder('COMPLETED')).toBe(true);
        expect(isEligibleRoyaltyOrder('CANCELLED')).toBe(false);
        expect(isEligibleRoyaltyOrder('PENDING')).toBe(false);
    });
});

