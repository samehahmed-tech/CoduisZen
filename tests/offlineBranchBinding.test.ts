import { describe, expect, it } from 'vitest';
import { assertQueueBranch, isQueueItemForBranch, resolveQueueBranchId } from '../src/services/syncQueueUtils';

describe('offline branch binding', () => {
    it('captures the active branch when payload has no branch field', () => {
        expect(resolveQueueBranchId({ id: 'order-1' }, 'branch-a')).toBe('branch-a');
    });

    it('rejects a payload from a different active branch', () => {
        expect(() => resolveQueueBranchId({ branchId: 'branch-b' }, 'branch-a')).toThrow('OFFLINE_BRANCH_MISMATCH');
    });

    it('does not allow a queued item to process outside its captured branch', () => {
        expect(() => assertQueueBranch('branch-a', 'branch-b')).toThrow('OFFLINE_BRANCH_MISMATCH');
        expect(assertQueueBranch('branch-a', 'branch-a')).toBe(true);
    });

    it('only exposes queue items for the active branch', () => {
        expect(isQueueItemForBranch('branch-a', 'branch-a')).toBe(true);
        expect(isQueueItemForBranch('branch-b', 'branch-a')).toBe(false);
        expect(isQueueItemForBranch(undefined, 'branch-a')).toBe(false);
    });
});
