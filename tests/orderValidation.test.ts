import { describe, expect, it } from 'vitest';
import { createOrderSchema } from '../server/middleware/validation';

const baseOrder = {
    branch_id: 'b1',
    items: [{ menu_item_id: 'item-1', quantity: 1 }],
};

describe('order validation', () => {
    it('normalizes legacy POS order type labels before create validation', () => {
        expect(createOrderSchema.parse({ ...baseOrder, type: 'تيك اواي' }).type).toBe('TAKEAWAY');
        expect(createOrderSchema.parse({ ...baseOrder, type: 'TAKE_AWAY' }).type).toBe('TAKEAWAY');
    });
});
