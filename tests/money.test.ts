import { describe, expect, it } from 'vitest';
import { fromMinorUnits, sameMoney, toMinorUnits } from '../server/utils/money';

describe('money minor-unit arithmetic', () => {
    it('rounds decimal strings deterministically', () => {
        expect(toMinorUnits('10.005')).toBe(1001);
        expect(toMinorUnits('10.004')).toBe(1000);
        expect(toMinorUnits('-0.505')).toBe(-51);
        expect(fromMinorUnits(12345)).toBe(123.45);
    });

    it('treats equivalent decimal representations as equal', () => {
        expect(sameMoney('100.00', 100)).toBe(true);
        expect(sameMoney('0.1', 0.10000000000000001)).toBe(true);
        expect(sameMoney('100.01', '100.02')).toBe(false);
    });
});
