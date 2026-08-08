import { describe, expect, it } from 'vitest';
import { getCashToCollect } from '../src/features/driver/cashCollection';

describe('driver cash collection', () => {
    it('returns only the cash amount still assigned to the driver', () => {
        expect(getCashToCollect({ total: 425.5, paymentMethod: 'CASH' })).toBe(425.5);
        expect(getCashToCollect({ total: 190, paymentMethod: 'VISA' })).toBe(0);
        expect(getCashToCollect({
            total: 500,
            paymentMethod: 'SPLIT',
            payments: [
                { method: 'CASH', amount: 125 },
                { method: 'VISA', amount: 375 },
            ],
        })).toBe(125);
    });
});
