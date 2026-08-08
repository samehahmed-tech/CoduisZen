import { describe, expect, it } from 'vitest';
import { isBelowTableMinimumSpend } from '../src/utils/tableMinimumSpend';

describe('table minimum spend', () => {
    it('blocks only finite subtotals below a positive minimum', () => {
        expect(isBelowTableMinimumSpend(99.99, 100)).toBe(true);
        expect(isBelowTableMinimumSpend(100, 100)).toBe(false);
        expect(isBelowTableMinimumSpend(0, 0)).toBe(false);
        expect(isBelowTableMinimumSpend('not-a-number', 100)).toBe(false);
    });
});
