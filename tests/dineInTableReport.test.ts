import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { getDineInTableAnalysis } from '../server/controllers/report/extendedSalesReports';
import { db } from '../server/db';
import { branches, floorZones, tables } from '../src/db/schema';

const ids = {
    branch: 'test-table-report-branch',
    zone: 'test-table-report-zone',
    table: 'test-table-report-table',
};

const cleanup = async () => {
    await db.execute(sql`DELETE FROM tables WHERE id = ${ids.table}`);
    await db.execute(sql`DELETE FROM floor_zones WHERE id = ${ids.zone}`);
    await db.execute(sql`DELETE FROM branches WHERE id = ${ids.branch}`);
};

describe('dine-in table report', () => {
    beforeEach(async () => {
        await cleanup();
        await db.insert(branches).values({ id: ids.branch, name: 'Report Branch', isActive: true });
        await db.insert(floorZones).values({ id: ids.zone, branchId: ids.branch, name: 'Patio' });
        await db.insert(tables).values({
            id: ids.table,
            branchId: ids.branch,
            zoneId: ids.zone,
            name: 'Owner Table',
            seats: 6,
            discount: 100,
            minSpend: 250,
            isVIP: true,
            notes: 'Window side',
            status: 'AVAILABLE',
        });
    });

    afterEach(cleanup);

    it('includes configured tables even when they have no sales in the period', async () => {
        const response: any = {
            statusCode: 200,
            body: null,
            status(code: number) {
                this.statusCode = code;
                return this;
            },
            json(body: unknown) {
                this.body = body;
                return this;
            },
        };

        await getDineInTableAnalysis({
            query: {
                branchId: ids.branch,
                startDate: '2026-07-01',
                endDate: '2026-07-31',
            },
        } as any, response);

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual([expect.objectContaining({
            tableId: ids.table,
            tableName: 'Owner Table',
            zoneName: 'Patio',
            configuredDiscountPercent: 100,
            minSpend: 250,
            isVIP: true,
            notes: 'Window side',
            orderCount: 0,
            revenue: 0,
        })]);
    });
});
