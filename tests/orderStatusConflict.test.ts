import { describe, it, expect } from 'vitest';
import { evaluateOrderStatusUpdate } from '../server/services/orderStatusPolicy';
import { updateOrderStatusSchema } from '../server/middleware/validation';

describe('order status policy', () => {
    it('rejects stale branch scope for non-super admin', () => {
        const result = evaluateOrderStatusUpdate({
            currentStatus: 'PENDING',
            nextStatus: 'PREPARING',
            userRole: 'MANAGER',
            userBranchId: 'b1',
            orderBranchId: 'b2',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe('FORBIDDEN_BRANCH_SCOPE');
    });

    it('rejects invalid status transition', () => {
        const result = evaluateOrderStatusUpdate({
            currentStatus: 'PENDING',
            nextStatus: 'DELIVERED',
            userRole: 'BRANCH_MANAGER',
            userBranchId: 'b1',
            orderBranchId: 'b1',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('allows valid transition with authorized role', () => {
        const result = evaluateOrderStatusUpdate({
            currentStatus: 'PREPARING',
            nextStatus: 'READY',
            userRole: 'KITCHEN_STAFF',
            userBranchId: 'b1',
            orderBranchId: 'b1',
        });
        expect(result.ok).toBe(true);
    });

    it('keeps validation aligned with policy for completed orders', () => {
        const policyResult = evaluateOrderStatusUpdate({
            currentStatus: 'OUT_FOR_DELIVERY',
            nextStatus: 'COMPLETED',
            userRole: 'BRANCH_MANAGER',
            userBranchId: 'b1',
            orderBranchId: 'b1',
        });

        expect(policyResult.ok).toBe(true);
        expect(() => updateOrderStatusSchema.parse({ status: 'COMPLETED' })).not.toThrow();
    });
});
