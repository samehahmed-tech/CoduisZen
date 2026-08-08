import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import { refundService } from '../server/services/refundService';
import { branches, orders, payments, settings, users } from '../src/db/schema';

const orderId = `TST-REFUND-${Date.now()}`;
let branchId = '';
let userId = '';

beforeAll(async () => {
  const [branch] = await db.select({ id: branches.id }).top(1).from(branches);
  const [user] = await db.select({ id: users.id }).top(1).from(users);
  if (!branch || !user) throw new Error('REFUND_FIXTURE_MISSING');
  branchId = branch.id;
  userId = user.id;

  const policy = await refundService.getPolicy();
  const total = Number(policy.maxRefundWithoutApproval || 0) + 10;
  await db.insert(orders).values({
    id: orderId,
    type: 'TAKEAWAY',
    branchId,
    status: 'COMPLETED',
    subtotal: total,
    tax: 0,
    total,
  });
});

afterAll(async () => {
  const [refundSetting] = await db.select().from(settings).where(eq(settings.key, 'pos_refunds_v1'));
  if (refundSetting) {
    const refunds = Array.isArray(refundSetting.value) ? refundSetting.value : [];
    await db.update(settings)
      .set({ value: refunds.filter((refund: any) => refund.orderId !== orderId) })
      .where(eq(settings.key, 'pos_refunds_v1'));
  }
  await db.delete(payments).where(eq(payments.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
});

describe('refund approval workflow', () => {
  it('keeps a high-value full refund pending and blocks processing before approval', async () => {
    const refund = await refundService.requestRefund({
      orderId,
      branchId,
      type: 'FULL',
      reason: 'Customer complaint',
      reasonCategory: 'CUSTOMER_REQUEST',
      refundMethod: 'ORIGINAL_PAYMENT',
      requestedBy: userId,
      requestedByName: 'Test operator',
    });

    expect(refund.status).toBe('PENDING');
    expect(refund.reason).toBe('Customer complaint');
    expect(refund.refundMethod).toBe('ORIGINAL_PAYMENT');
    await expect(refundService.processRefund(refund.id, userId)).rejects.toThrow('Refund is not approved');
    expect(await db.select().from(payments).where(eq(payments.orderId, orderId))).toHaveLength(0);

    const approved = await refundService.approveRefund(refund.id, userId, 'Test manager');
    expect(approved.status).toBe('APPROVED');
  });
});
