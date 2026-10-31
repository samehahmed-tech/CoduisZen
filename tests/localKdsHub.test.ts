import { describe, expect, it } from 'vitest';
import { createLocalKdsEvent, isLocalKdsEventForBranch } from '../src/services/localKdsHub';

describe('local KDS hub contract', () => {
    it('creates branch-bound events with stable order identity', () => {
        const event = createLocalKdsEvent('ORDER_UPSERTED', 'branch-a', 'order-1');
        expect(event).toMatchObject({ kind: 'ORDER_UPSERTED', branchId: 'branch-a', orderId: 'order-1' });
        expect(event.id).toMatch(/^LOCAL-KDS-EVENT-/);
        expect(isLocalKdsEventForBranch(event, 'branch-a')).toBe(true);
        expect(isLocalKdsEventForBranch(event, 'branch-b')).toBe(false);
    });

    it('rejects incomplete or cross-branch events', () => {
        expect(isLocalKdsEventForBranch({ id: 'x', orderId: 'o', branchId: 'branch-a', kind: 'ORDER_UPSERTED', occurredAt: Date.now() }, 'branch-b')).toBe(false);
        expect(isLocalKdsEventForBranch({ id: 'x', orderId: '', branchId: 'branch-a', kind: 'ORDER_UPSERTED', occurredAt: Date.now() }, 'branch-a')).toBe(false);
        expect(isLocalKdsEventForBranch({ id: 'x', orderId: 'o', branchId: 'branch-a', kind: 'UNKNOWN' as any, occurredAt: Date.now() }, 'branch-a')).toBe(false);
        expect(isLocalKdsEventForBranch({ id: 'x', orderId: 'o', branchId: 'branch-a', kind: 'ORDER_UPSERTED', occurredAt: Date.now() - 25 * 60 * 60 * 1000 }, 'branch-a')).toBe(false);
    });
});
