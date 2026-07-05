import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { sql } from 'drizzle-orm';
import { branches, fiscalLogs, payments, users, userSessions } from '../src/db/schema';

let app: any;
let db: typeof import('../server/db')['db'];

const jwtSecret = () => process.env.JWT_SECRET || 'test-jwt-secret-for-business-date-reports';

const authHeader = (userId: string, sessionId: string, tokenId: string) => {
    const token = jwt.sign({
        sub: userId,
        id: userId,
        role: 'SUPER_ADMIN',
        permissions: ['*'],
        sid: sessionId,
        jti: tokenId,
    }, jwtSecret());
    return `Bearer ${token}`;
};

describe('business-date reporting', () => {
    beforeEach(async () => {
        if (!app || !db) {
            const appModule = await import('../server/app');
            app = appModule.default;
            const dbModule = await import('../server/db');
            db = dbModule.db;
        }
    });

    it('uses order businessDate instead of calendar createdAt for core sales reports', async () => {
        const suffix = Date.now();
        const branchId = `test-business-date-branch-${suffix}`;
        const userId = `test-business-date-user-${suffix}`;
        const sessionId = `test-business-date-session-${suffix}`;
        const tokenId = `test-business-date-token-${suffix}`;
        const businessDate = '2026-06-11';
        const nextBusinessDate = '2026-06-12';

        await db.insert(branches).values({
            id: branchId,
            name: 'Business Date Reports Branch',
            businessDate,
            isActive: true,
        });

        await db.insert(users).values({
            id: userId,
            name: 'Business Date Reporter',
            email: `${userId}@restoflow.local`,
            role: 'SUPER_ADMIN',
            permissions: ['*'],
            assignedBranchId: branchId,
            isActive: true,
        });

        await db.insert(userSessions).values({
            id: sessionId,
            userId,
            tokenId,
            isActive: true,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        });

        const lateNightOrderId = `test-business-date-order-${suffix}`;
        const nextDayOrderId = `test-business-date-next-order-${suffix}`;

        await db.execute(sql`
            insert into orders (
                id, type, branch_id, status, subtotal, discount, tax, total,
                is_paid, business_date, created_at
            )
            values
                (
                    ${lateNightOrderId}, 'TAKEAWAY', ${branchId}, 'COMPLETED', 100, 0, 14, 114,
                    true, ${businessDate}, ${new Date('2026-06-12T02:15:00.000Z')}
                ),
                (
                    ${nextDayOrderId}, 'TAKEAWAY', ${branchId}, 'COMPLETED', 900, 0, 126, 1026,
                    true, ${nextBusinessDate}, ${new Date('2026-06-12T03:00:00.000Z')}
                )
        `);

        await db.insert(payments).values([
            {
                id: `test-business-date-payment-${suffix}`,
                orderId: lateNightOrderId,
                method: 'CASH',
                amount: 114,
                status: 'COMPLETED',
                createdAt: new Date('2026-06-12T02:16:00.000Z'),
            },
            {
                id: `test-business-date-next-payment-${suffix}`,
                orderId: nextDayOrderId,
                method: 'CASH',
                amount: 1026,
                status: 'COMPLETED',
                createdAt: new Date('2026-06-12T03:01:00.000Z'),
            },
        ]);

        await db.insert(fiscalLogs).values([
            {
                orderId: lateNightOrderId,
                branchId,
                status: 'PENDING',
                createdAt: new Date('2026-06-12T02:17:00.000Z'),
            },
            {
                orderId: nextDayOrderId,
                branchId,
                status: 'PENDING',
                createdAt: new Date('2026-06-12T03:02:00.000Z'),
            },
        ]);

        const auth = authHeader(userId, sessionId, tokenId);
        const query = `branchId=${branchId}&startDate=${businessDate}&endDate=${businessDate}`;

        const dailySales = await request(app)
            .get(`/api/reports/daily-sales?${query}`)
            .set('Authorization', auth);

        expect(dailySales.status).toBe(200);
        expect(dailySales.body).toHaveLength(1);
        expect(dailySales.body[0].day).toBe(businessDate);
        expect(Number(dailySales.body[0].revenue)).toBe(114);

        const overview = await request(app)
            .get(`/api/reports/overview?${query}`)
            .set('Authorization', auth);

        expect(overview.status).toBe(200);
        expect(Number(overview.body.grossSales)).toBe(114);
        expect(Number(overview.body.orderCount)).toBe(1);

        const paymentSummary = await request(app)
            .get(`/api/reports/payments?${query}`)
            .set('Authorization', auth);

        expect(paymentSummary.status).toBe(200);
        expect(Number(paymentSummary.body[0]?.total || 0)).toBe(114);

        const dayClose = await request(app)
            .get(`/api/day-close/${branchId}/${businessDate}`)
            .set('Authorization', auth);

        expect(dayClose.status).toBe(200);
        expect(Number(dayClose.body.fiscalHealth?.pending || 0)).toBe(1);
    });
});
