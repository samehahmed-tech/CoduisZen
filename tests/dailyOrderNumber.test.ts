import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { branches, orders } from '../src/db/schema';
import { allocateDailyOrderNumber } from '../server/services/orderNumberService';

let db: typeof import('../server/db')['db'];

describe('daily order number', () => {
    beforeAll(async () => {
        db = (await import('../server/db')).db;
        const migration = readFileSync(resolve('scripts/sameh-installer/daily-order-number-fix/migrate-daily-order-number.sql'), 'utf8');
        await db.execute(sql.raw(migration));
    });

    it('restarts from one on the next branch business date', async () => {
        const branchId = `test-daily-order-number-${Date.now()}`;
        await db.insert(branches).values({ id: branchId, name: 'Daily Number Branch', businessDate: '2026-07-18', isActive: true });

        await db.transaction(async (transaction) => {
            const firstDayNumber = await allocateDailyOrderNumber(transaction, branchId, '2026-07-18');
            await transaction.insert(orders).values({
                id: `${branchId}-order`, orderNumber: firstDayNumber, type: 'TAKEAWAY', branchId,
                status: 'COMPLETED', subtotal: 10, tax: 0, total: 10, businessDate: '2026-07-18',
            });
            expect(await allocateDailyOrderNumber(transaction, branchId, '2026-07-19')).toBe(1);
        });
    });
});
