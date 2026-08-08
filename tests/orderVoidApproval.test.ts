import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import {
  branches,
  managerApprovals,
  orders,
  orderStatusHistory,
  tables,
  users,
} from '../src/db/schema';
import { transitionOrderStatus } from '../server/services/orderLifecycleService';
import { getDateKeyInTimeZone } from '../server/utils/businessDate';

const orderId = `TST-VOID-${Date.now()}`;
const dineInOrderId = `TST-DINE-VOID-${Date.now()}`;
const tableId = `TST-TABLE-VOID-${Date.now()}`;
let branchId = '';
let branchBusinessDate = '';
let managerId = '';
const approvalIds: number[] = [];

beforeAll(async () => {
  const [branch] = await db.select({
    id: branches.id,
    businessDate: branches.businessDate,
    timezone: branches.timezone,
  }).top(1).from(branches);
  const [manager] = await db.select({ id: users.id }).top(1).from(users);
  if (!branch || !manager) throw new Error('VOID_APPROVAL_FIXTURE_MISSING');
  branchId = branch.id;
  branchBusinessDate = branch.businessDate || getDateKeyInTimeZone(new Date(), branch.timezone || 'Africa/Cairo');
  managerId = manager.id;
  await db.insert(orders).values({
    id: orderId,
    type: 'TAKEAWAY',
    branchId,
    businessDate: branchBusinessDate,
    status: 'PENDING',
    subtotal: 100,
    tax: 0,
    total: 100,
  });
});

afterAll(async () => {
  await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, dineInOrderId));
  await db.delete(orders).where(eq(orders.id, dineInOrderId));
  await db.delete(tables).where(eq(tables.id, tableId));
  await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId));
  for (const approvalId of approvalIds) {
    await db.delete(managerApprovals).where(eq(managerApprovals.id, approvalId));
  }
  await db.delete(orders).where(eq(orders.id, orderId));
});

describe('cashier void approval', () => {
  it('rejects an approval for a different order and accepts the matching approval', async () => {
    const [wrongApproval] = await db.insert(managerApprovals).values({
      managerId,
      branchId,
      actionType: 'VOID_ORDER',
      relatedId: 'OTHER-ORDER',
      reason: 'PIN Verified',
      details: { status: 'APPROVED' },
    }).output();
    approvalIds.push(wrongApproval.id);

    await expect(transitionOrderStatus({
      orderId,
      nextStatus: 'CANCELLED',
      notes: 'Guest cancelled',
      approvalId: wrongApproval.id,
      user: { role: 'CASHIER', branchId },
    })).rejects.toThrow('MANAGER_APPROVAL_INVALID');

    const [validApproval] = await db.insert(managerApprovals).values({
      managerId,
      branchId,
      actionType: 'VOID_ORDER',
      relatedId: orderId,
      reason: 'PIN Verified',
      details: { status: 'APPROVED' },
    }).output();
    approvalIds.push(validApproval.id);

    const cancelled = await transitionOrderStatus({
      orderId,
      nextStatus: 'CANCELLED',
      notes: 'Guest cancelled',
      approvalId: validApproval.id,
      user: { role: 'CASHIER', branchId },
    });

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelReason).toBe('Guest cancelled');
  });

  it('cancels a saved dine-in order and releases its table', async () => {
    await db.insert(tables).values({
      id: tableId,
      branchId,
      name: 'Void Table',
      status: 'OCCUPIED',
    });
    await db.insert(orders).values({
      id: dineInOrderId,
      type: 'DINE_IN',
      branchId,
      businessDate: branchBusinessDate,
      tableId,
      status: 'PREPARING',
      subtotal: 100,
      tax: 0,
      total: 100,
    });
    await db.update(tables).set({ currentOrderId: dineInOrderId }).where(eq(tables.id, tableId));

    const cancelled = await transitionOrderStatus({
      orderId: dineInOrderId,
      nextStatus: 'CANCELLED',
      notes: 'Dine-in cancelled from POS',
      user: { role: 'CASHIER', branchId, permissions: ['OP_VOID_ORDER'] },
    });
    const [releasedTable] = await db.select().from(tables).where(eq(tables.id, tableId));

    expect(cancelled.status).toBe('CANCELLED');
    expect(releasedTable.status).toBe('AVAILABLE');
    expect(releasedTable.currentOrderId).toBeNull();
  });
});
