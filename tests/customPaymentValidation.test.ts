import { describe, expect, it } from 'vitest';
import { createOrderSchema } from '../server/middleware/validation';

const baseOrder = {
    type: 'TAKEAWAY',
    branchId: 'branch-1',
    items: [{ menu_item_id: 'item-1', quantity: 1 }],
};

describe('custom payment validation', () => {
    it('accepts safe configured payment codes', () => {
        expect(createOrderSchema.safeParse({
            ...baseOrder,
            paymentMethod: 'TALABAT_PAY',
            payments: [{ method: 'TALABAT_PAY', amount: 75 }],
        }).success).toBe(true);
    });

    it('rejects arbitrary payment text', () => {
        expect(createOrderSchema.safeParse({
            ...baseOrder,
            paymentMethod: 'invalid payment!',
        }).success).toBe(false);
    });
});
