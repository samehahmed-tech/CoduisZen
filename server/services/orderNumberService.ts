import { and, eq, sql } from 'drizzle-orm';
import { orders } from '../../src/db/schema';

export const allocateDailyOrderNumber = async (transaction: any, branchId: string, businessDate: string) => {
    const lockName = `restoflow:order-number:${branchId}:${businessDate}`;
    await transaction.execute(sql`
        DECLARE @lockResult int;
        EXEC @lockResult = sys.sp_getapplock
            @Resource = ${lockName}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
        IF @lockResult < 0 THROW 51000, 'ORDER_NUMBER_LOCK_FAILED', 1;
    `);
    const [sequence] = await transaction.select({
        next: sql<number>`coalesce(max(${orders.orderNumber}), 0) + 1`,
    }).from(orders).where(and(eq(orders.branchId, branchId), eq(orders.businessDate, businessDate)));
    return Number(sequence?.next || 1);
};
