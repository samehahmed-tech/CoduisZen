import { afterEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../server/db';
import { analyticsService } from '../server/services/analyticsService';

describe('analytics user performance schema compatibility', () => {
    afterEach(async () => {
        await db.execute(sql.raw(`
            DELETE FROM user_daily_performance
            WHERE user_id = 'test-recovery-admin' AND branch_id = 'b1';
        `)).catch(() => undefined);
    });

    it('records performance on legacy business_date installations without a date-column failure', async () => {
        await analyticsService.recordUserPerformance(
            'test-recovery-admin',
            'b1',
            '2026-10-26',
            250,
            {},
        );

        const result = await db.execute(sql.raw(`
            SELECT TOP 1 [date], total_sales
            FROM user_daily_performance
            WHERE user_id = 'test-recovery-admin' AND branch_id = 'b1'
            ORDER BY id DESC;
        `));
        const row = Array.isArray(result)
            ? result[0]
            : ((result as any)?.recordset?.[0] ?? (result as any)?.rows?.[0]);

        expect(row?.date).toBe('2026-10-26');
        expect(Number(row?.total_sales)).toBe(250);
    });
});
