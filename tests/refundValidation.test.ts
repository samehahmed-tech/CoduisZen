import { describe, expect, it } from 'vitest';
import { createRefundSchema } from '../server/middleware/validation';

describe('refund request validation', () => {
  it('requires a reason and preserves the service field names', () => {
    const parsed = createRefundSchema.parse({
      orderId: 'ORD-1',
      type: 'ITEM',
      reason: 'Wrong item',
      reasonCategory: 'WRONG_ORDER',
      refundMethod: 'ORIGINAL_PAYMENT',
      items: [{ orderItemId: 7, quantity: 1 }],
    });

    expect(parsed.items?.[0].orderItemId).toBe(7);
    expect(parsed.reasonCategory).toBe('WRONG_ORDER');
    expect(parsed.refundMethod).toBe('ORIGINAL_PAYMENT');
    expect(createRefundSchema.safeParse({ orderId: 'ORD-1', type: 'FULL', reason: ' ' }).success).toBe(false);
  });
});
