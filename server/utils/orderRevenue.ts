import { sql } from 'drizzle-orm';
import { orders, payments } from '../../src/db/schema';

export const revenueEligibleOrder = () =>
    sql`${orders.status} not in ('CANCELLED', 'REFUNDED', 'VOID')`;

export const revenueRecognizedOrder = () =>
    sql`(
        ${revenueEligibleOrder()}
        and (
            ${orders.status} in ('DELIVERED', 'COMPLETED')
            or exists (
                select 1 from ${payments} p
                where p.order_id = ${orders.id}
                  and p.status = 'COMPLETED'
            )
        )
    )`;
