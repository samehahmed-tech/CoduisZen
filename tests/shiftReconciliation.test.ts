import { describe, expect, it } from 'vitest';
import {
    parseNonNegativeShiftAmount,
    requireShiftVarianceReason,
} from '../server/services/shiftReconciliation';

describe('shift cash reconciliation', () => {
    it('accepts zero and rejects missing, negative, or non-numeric drawer counts', () => {
        expect(parseNonNegativeShiftAmount(0, 'BALANCE_REQUIRED')).toBe(0);
        expect(() => parseNonNegativeShiftAmount('', 'BALANCE_REQUIRED')).toThrow('BALANCE_REQUIRED');
        expect(() => parseNonNegativeShiftAmount(-1, 'BALANCE_REQUIRED')).toThrow('INVALID_CASH_BALANCE');
        expect(() => parseNonNegativeShiftAmount('not-a-number', 'BALANCE_REQUIRED')).toThrow('INVALID_CASH_BALANCE');
    });

    it('requires an operator reason only for a material variance', () => {
        expect(requireShiftVarianceReason(100.5, 100, '')).toBe(0.5);
        expect(() => requireShiftVarianceReason(90, 100, '')).toThrow('VARIANCE_REASON_REQUIRED');
        expect(requireShiftVarianceReason(90, 100, 'Cash paid to supplier')).toBe(-10);
    });
});
