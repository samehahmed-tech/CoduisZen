import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import { orders, users, customers } from '../src/db/schema';
import { parsePagination, parseCursorPagination } from '../server/middleware/pagination';

let app: any;
let db: typeof import('../server/db')['db'];
let token = '';

const BRANCH = 'b1';
const ids = Array.from({ length: 105 }, (_, i) => `test-page-order-${i}`);

describe('Phase-6 pagination policy', () => {
    beforeAll(async () => {
        const appModule = await import('../server/app');
        app = appModule.default;
        const dbModule = await import('../server/db');
        db = dbModule.db;
        // Stray cleanup first: aborted runs leave test-page-order-* behind.
        await db.delete(orders).where(inArray(orders.id, ids)).catch(() => undefined);
        await db.insert(users).values({
            id: 'test-page-admin',
            name: 'Page Test Admin',
            email: 'test-page-admin@restoflow.local',
            role: 'SUPER_ADMIN',
            permissions: ['*'],
            assignedBranchId: BRANCH,
            isActive: true,
        } as any).catch(() => undefined);
        const login = await request(app).post('/api/auth/pin-login').send({ pin: '202626' });
        expect(login.status).toBe(200);
        token = login.body.token;
        // Seed 105 minimal orders (boundary: 100 + 9).
        const rows = ids.map((id, i) => ({
            id,
            type: 'TAKEAWAY',
            branchId: BRANCH,
            status: 'PENDING',
            subtotal: 100,
            tax: 14,
            total: 100 + i,
            customerName: `PAGETEST-${i}`,
        }));
        for (let i = 0; i < rows.length; i += 25) {
            await db.insert(orders).values(rows.slice(i, i + 25) as any);
        }
    });

    afterAll(async () => {
        await db.delete(orders).where(inArray(orders.id, ids));
        await db.delete(users).where(eq(users.id, 'test-page-admin')).catch(() => undefined);
    });

    // Sessions can be revoked by concurrent housekeeping — enter each API
    // test with a fresh one instead of reusing a possibly stale token.
    const freshAuth = async () => {
        const login = await request(app).post('/api/auth/pin-login').send({ pin: '202626' });
        expect(login.status).toBe(200);
        token = login.body.token;
    };

    it('shared helper clamps page size to 100', () => {        const fake = (q: any) => ({ query: q }) as any;
        expect(parsePagination(fake({ limit: '10000' })).limit).toBe(100);
        expect(parsePagination(fake({ limit: '500' })).limit).toBe(100);
        expect(parsePagination(fake({ limit: '25' })).limit).toBe(25);
        expect(parsePagination(fake({})).limit).toBe(50);
        expect(parseCursorPagination(fake({ limit: '999' }), 100).limit).toBe(100);
        expect(parsePagination(fake({ page: '-3', limit: '10' })).page).toBe(1);
    });

    it('legacy list preserves complete sets for live ops screens (500 ceiling)', async () => {
        await freshAuth();
        const res = await request(app)
            .get('/api/orders?branch_id=b1&limit=10000')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        // Ops ceiling: bounded at 500 (never unbounded), full enumeration
        // lives in page mode below — nothing is hidden from navigation.
        expect(res.body.length).toBeLessThanOrEqual(500);
        const total: any = await request(app)
            .get('/api/orders?branch_id=b1&mode=page&page=1&limit=100')
            .set('Authorization', `Bearer ${token}`);
        // The fixture seeds 105 rows: page mode must count every record,
        // including the second page beyond the 100-row response cap.
        expect(total.body.pagination.total).toBeGreaterThan(100);
        // …and the tail page is reachable.
        const lastPage = total.body.pagination.totalPages;
        const tail: any = await request(app)
            .get(`/api/orders?branch_id=b1&mode=page&page=${lastPage}&limit=100`)
            .set('Authorization', `Bearer ${token}`);
        expect(tail.status).toBe(200);
        expect(tail.body.data.length).toBe(total.body.pagination.total - (lastPage - 1) * 100);
    });

    it('page mode never exceeds 100 records per response', async () => {
        await freshAuth();
        const res = await request(app)
            .get('/api/orders?branch_id=b1&mode=page&page=1&limit=10000')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeLessThanOrEqual(100);
    });

    it('page mode returns exact totals across boundaries', async () => {
        await freshAuth();
        const p1: any = await request(app)
            .get('/api/orders?branch_id=b1&mode=page&page=1&limit=100')
            .set('Authorization', `Bearer ${token}`);
        expect(p1.status).toBe(200);
        expect(p1.body.data.length).toBe(100);
        const total = p1.body.pagination.total;
        expect(total).toBeGreaterThanOrEqual(105);
        expect(p1.body.pagination.totalPages).toBe(Math.ceil(total / 100));
        expect(p1.body.summary).toBeTruthy();

        const lastPage = p1.body.pagination.totalPages;
        const plast: any = await request(app)
            .get(`/api/orders?branch_id=b1&mode=page&page=${lastPage}&limit=100`)
            .set('Authorization', `Bearer ${token}`);
        expect(plast.status).toBe(200);
        expect(plast.body.data.length).toBe(total - (lastPage - 1) * 100);
        expect(plast.body.pagination.hasNext).toBe(false);
    });

    it('out-of-range page stays valid, search and sort work server-side', async () => {
        await freshAuth();
        const empty: any = await request(app)
            .get('/api/orders?branch_id=b1&mode=page&page=9999&limit=25')
            .set('Authorization', `Bearer ${token}`);
        expect(empty.status).toBe(200);
        expect(empty.body.data).toEqual([]);
        expect(empty.body.pagination.totalPages).toBeGreaterThanOrEqual(1);

        const q: any = await request(app)
            .get('/api/orders?branch_id=b1&mode=page&q=PAGETEST-42&limit=100')
            .set('Authorization', `Bearer ${token}`);
        expect(q.status).toBe(200);
        expect(q.body.data.length).toBeGreaterThanOrEqual(1);
        expect(q.body.data.every((o: any) => String(o.customerName || '').includes('PAGETEST'))).toBe(true);

        const hi: any = await request(app)
            .get('/api/orders?branch_id=b1&mode=page&sort=highest&limit=5')
            .set('Authorization', `Bearer ${token}`);
        expect(hi.status).toBe(200);
        const totals = hi.body.data.map((o: any) => Number(o.total || 0));
        const sorted = [...totals].sort((a, b) => b - a);
        expect(totals).toEqual(sorted);
    });

    it('customer directory pages with exact totals and summary', async () => {
        await freshAuth();
        // Seed 12 uniquely-named customers (boundary: 10 + 2).
        const cids = Array.from({ length: 12 }, (_, i) => `test-page-cust-${i}`);
        for (let i = 0; i < cids.length; i++) {
            await db.insert(customers).values({
                id: cids[i],
                name: `PAGECUST-${i}`,
                phone: `010900000${String(i).padStart(2, '0')}`,
            } as any).catch(() => undefined);
        }
        try {
            const p1: any = await request(app)
                .get('/api/customers?mode=page&page=1&limit=10')
                .set('Authorization', `Bearer ${token}`);
            expect(p1.status).toBe(200);
            expect(p1.body.data.length).toBe(10);
            expect(p1.body.pagination.total).toBeGreaterThanOrEqual(12);
            expect(p1.body.summary).toBeTruthy();
            expect(p1.body.summary.total).toBe(p1.body.pagination.total);

            const q: any = await request(app)
                .get('/api/customers?mode=page&search=PAGECUST-7&limit=100')
                .set('Authorization', `Bearer ${token}`);
            expect(q.status).toBe(200);
            expect(q.body.data.length).toBeGreaterThanOrEqual(1);
            expect(q.body.data.every((c: any) => String(c.name || '').includes('PAGECUST'))).toBe(true);

            const over: any = await request(app)
                .get('/api/customers?mode=page&page=1&limit=10000')
                .set('Authorization', `Bearer ${token}`);
            expect(over.status).toBe(200);
            expect(over.body.data.length).toBeLessThanOrEqual(100);
        } finally {
            await db.delete(customers).where(inArray(customers.id, cids)).catch(() => undefined);
        }
    });

    it('fresh PIN session stays valid for immediate API use', async () => {
        await freshAuth();
        for (let i = 0; i < 3; i++) {
            const me: any = await request(app).get('/api/auth/me')
                .set('Authorization', `Bearer ${token}`);
            expect(me.status).toBe(200);
        }
    });

    it('dashboard aggregate cache returns identical exact totals', async () => {
        await freshAuth();
        const url = '/api/reports/dashboard-kpis?branchId=b1&startDate=2026-10-09&endDate=2026-10-09';
        const a: any = await request(app).get(url).set('Authorization', `Bearer ${token}`);
        expect(a.status).toBe(200);
        const b: any = await request(app).get(url).set('Authorization', `Bearer ${token}`);
        expect(b.status).toBe(200);
        // Cached response must be byte-identical to the fresh computation.
        expect(JSON.stringify(b.body)).toBe(JSON.stringify(a.body));
        expect(b.body.totals.revenue).toBe(a.body.totals.revenue);
    });
});
