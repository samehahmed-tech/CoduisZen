import { describe, expect, it } from 'vitest';
import { convertQuantity } from '../server/services/unitConversion';
describe('inventory unit conversion', () => {
    it('converts grams to kilograms', () => expect(convertQuantity(200, 'g', 'kg')).toBeCloseTo(0.2));
    it('rejects incompatible dimensions', () => expect(() => convertQuantity(1, 'kg', 'piece')).toThrow('INCOMPATIBLE_UNITS'));
});
