import { describe, expect, it } from 'vitest';
import {
    branchEntityCacheKey,
    fromBranchEntityCache,
    toBranchEntityCache,
} from '../src/utils/branchEntityCache';

describe('branch-scoped entity cache', () => {
    it('keeps identical table ids isolated by branch and restores the server id', () => {
        const table = { id: 'T1', name: 'Window' };
        const branchA = toBranchEntityCache(table, 'A');
        const branchB = toBranchEntityCache(table, 'B');

        expect(branchA.id).toBe(branchEntityCacheKey('A', 'T1'));
        expect(branchB.id).toBe(branchEntityCacheKey('B', 'T1'));
        expect(branchA.id).not.toBe(branchB.id);
        expect(fromBranchEntityCache(branchA).id).toBe('T1');
    });
});
