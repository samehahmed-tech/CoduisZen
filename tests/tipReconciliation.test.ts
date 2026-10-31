import { describe, expect, it } from 'vitest';
import { assertTipAllocationBalanced, sumTipAllocations } from '../server/utils/tipReconciliation';

describe('tip reconciliation', () => {
    it('sums allocations at currency precision', () => {
        expect(sumTipAllocations(['10.10', 20.2, 0.005])).toBe(30.3);
    });

    it('accepts a balanced pool and rejects a short allocation', () => {
        expect(assertTipAllocationBalanced('30.30', ['10.10', '20.20'])).toEqual({ pooled: 30.3, allocated: 30.3 });
        expect(() => assertTipAllocationBalanced(30, [29.99])).toThrow('TIP_ALLOCATION_UNBALANCED');
    });
});
