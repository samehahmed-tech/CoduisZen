/**
 * Route Auth Guard Smoke Tests
 * Verifies that critical mutation endpoints reject unauthenticated and unauthorized requests.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';

let app: any;

beforeAll(async () => {
    const appModule = await import('../server/app');
    app = appModule.default;
});

describe('unauthenticated access — critical routes reject 401', () => {
    // ── Orders ──
    it('POST /api/orders → 401', async () => {
        const res = await request(app).post('/api/orders').send({ items: [] });
        expect(res.status).toBe(401);
    });

    it('GET /api/refunds requires auth', async () => {
        const res = await request(app).get('/api/refunds');
        expect(res.status).toBe(401);
    });

    it('GET /api/refunds/stats requires auth', async () => {
        const res = await request(app).get('/api/refunds/stats');
        expect(res.status).toBe(401);
    });

    it('GET /api/refunds/policy requires auth', async () => {
        const res = await request(app).get('/api/refunds/policy');
        expect(res.status).toBe(401);
    });

    it('GET /api/refunds/fake-id requires auth', async () => {
        const res = await request(app).get('/api/refunds/fake-id');
        expect(res.status).toBe(401);
    });

    it('POST /api/payments/sessions/initiate requires auth', async () => {
        const res = await request(app).post('/api/payments/sessions/initiate').send({});
        expect(res.status).toBe(401);
    });

    it('POST /api/payments/sessions/fake-id/confirm requires auth', async () => {
        const res = await request(app).post('/api/payments/sessions/fake-id/confirm').send({});
        expect(res.status).toBe(401);
    });

    it('POST /api/payments/sessions/fake-id/reverse requires auth', async () => {
        const res = await request(app).post('/api/payments/sessions/fake-id/reverse').send({});
        expect(res.status).toBe(401);
    });

    // ── Users ──
    it('POST /api/users → 401', async () => {
        const res = await request(app).post('/api/users').send({ name: 'test', email: 'test@test.com' });
        expect(res.status).toBe(401);
    });

    it('GET /api/users requires auth', async () => {
        const res = await request(app).get('/api/users');
        expect(res.status).toBe(401);
    });

    it('GET /api/users/fake-id requires auth', async () => {
        const res = await request(app).get('/api/users/fake-id');
        expect(res.status).toBe(401);
    });

    it('DELETE /api/users/fake-id → 401', async () => {
        const res = await request(app).delete('/api/users/fake-id');
        expect(res.status).toBe(401);
    });

    // ── Settings ──
    it('PUT /api/settings → 401', async () => {
        const res = await request(app).put('/api/settings').send({ key: 'value' });
        expect(res.status).toBe(401);
    });

    // ── Printers ──
    it('POST /api/printers → 401', async () => {
        const res = await request(app).post('/api/printers').send({ name: 'Test' });
        expect(res.status).toBe(401);
    });

    it('DELETE /api/printers/fake-id → 401', async () => {
        const res = await request(app).delete('/api/printers/fake-id');
        expect(res.status).toBe(401);
    });

    // ── Suppliers ──
    it('POST /api/suppliers → 401', async () => {
        const res = await request(app).post('/api/suppliers').send({ name: 'Test' });
        expect(res.status).toBe(401);
    });

    // ── AI ──
    it('POST /api/ai/chat → 401', async () => {
        const res = await request(app).post('/api/ai/chat').send({ message: 'hello' });
        expect(res.status).toBe(401);
    });

    it('POST /api/ai/action-execute → 401', async () => {
        const res = await request(app).post('/api/ai/action-execute').send({ action: {} });
        expect(res.status).toBe(401);
    });

    it('GET /api/ai/insights → 401', async () => {
        const res = await request(app).get('/api/ai/insights');
        expect(res.status).toBe(401);
    });

    // ── Refunds ──
    it('POST /api/refunds → 401', async () => {
        const res = await request(app).post('/api/refunds').send({ orderId: 'fake' });
        expect(res.status).toBe(401);
    });

    // ── Inventory ──
    it('POST /api/inventory/adjust → 401', async () => {
        const res = await request(app).post('/api/inventory/adjust').send({});
        expect(res.status).toBe(401);
    });

    // ── Finance ──
    it('GET /api/finance/journal-entries → 401', async () => {
        const res = await request(app).get('/api/finance/journal-entries');
        expect(res.status).toBe(401);
    });

    // ── Reports ──
    it('GET /api/reports/daily-sales → 401', async () => {
        const res = await request(app).get('/api/reports/daily-sales');
        expect(res.status).toBe(401);
    });

    // ── Day Close ──
    it('POST /api/day-close/test-branch/2026-05-04/close → 401', async () => {
        const res = await request(app).post('/api/day-close/test-branch/2026-05-04/close');
        expect(res.status).toBe(401);
    });

    it('POST /api/day-close/test-branch/2026-05-04/send-email → 401', async () => {
        const res = await request(app).post('/api/day-close/test-branch/2026-05-04/send-email');
        expect(res.status).toBe(401);
    });

    // ── Refund mutations ──
    it('PUT /api/refunds/fake/approve → 401', async () => {
        const res = await request(app).put('/api/refunds/fake/approve');
        expect(res.status).toBe(401);
    });

    it('PUT /api/refunds/policy → 401', async () => {
        const res = await request(app).put('/api/refunds/policy').send({});
        expect(res.status).toBe(401);
    });

    // ── Ops (Admin only) ──
    it('GET /api/ops/errors → 401', async () => {
        const res = await request(app).get('/api/ops/errors');
        expect(res.status).toBe(401);
    });

    it('GET /api/ops/queue-health → 401', async () => {
        const res = await request(app).get('/api/ops/queue-health');
        expect(res.status).toBe(401);
    });

    // ── HR (module-level requireRoles) ──
    it('GET /api/hr/employees → 401', async () => {
        const res = await request(app).get('/api/hr/employees');
        expect(res.status).toBe(401);
    });

    // ── Webhooks (module-level requireRoles) ──
    it('GET /api/webhooks → 401', async () => {
        const res = await request(app).get('/api/webhooks');
        expect(res.status).toBe(401);
    });

    it('GET /api/whatsapp/campaigns requires auth', async () => {
        const res = await request(app).get('/api/whatsapp/campaigns');
        expect(res.status).toBe(401);
    });

    it('PUT /api/delivery/drivers/fake-id/status requires auth', async () => {
        const res = await request(app).put('/api/delivery/drivers/fake-id/status').send({ status: 'AVAILABLE' });
        expect(res.status).toBe(401);
    });

    it('PUT /api/delivery/drivers/fake-id/location requires auth', async () => {
        const res = await request(app).put('/api/delivery/drivers/fake-id/location').send({ lat: 30.0444, lng: 31.2357 });
        expect(res.status).toBe(401);
    });

    it('GET /api/hr-extended/payroll-cycles requires auth', async () => {
        const res = await request(app).get('/api/hr-extended/payroll-cycles');
        expect(res.status).toBe(401);
    });

    it('POST /api/hr-extended/bonus-penalties requires auth', async () => {
        const res = await request(app).post('/api/hr-extended/bonus-penalties').send({});
        expect(res.status).toBe(401);
    });

    it('GET /api/core/settings requires auth', async () => {
        const res = await request(app).get('/api/core/settings');
        expect(res.status).toBe(401);
    });

    it('GET /api/core/branches requires auth', async () => {
        const res = await request(app).get('/api/core/branches');
        expect(res.status).toBe(401);
    });

    it('GET /api/core/setup/status requires auth', async () => {
        const res = await request(app).get('/api/core/setup/status');
        expect(res.status).toBe(401);
    });
});

describe('public endpoints — accessible without auth', () => {
    it('GET /api/health → 200', async () => {
        const res = await request(app).get('/api/health');
        expect([200, 503]).toContain(res.status); // 503 if DB not ready, still responds
        expect(res.body).toHaveProperty('status');
    });

    it('GET /api/setup/status → 200', async () => {
        const res = await request(app).get('/api/setup/status');
        expect(res.status).toBe(200);
    });

    it('POST /api/auth/login → not 401 (returns 400 for bad input)', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'x', password: 'x' });
        // Should NOT be 401 since login is public — it should return a domain error
        expect(res.status).not.toBe(401);
    });

    it('POST /api/whatsapp/webhook remains public', async () => {
        const res = await request(app).post('/api/whatsapp/webhook').send({});
        expect(res.status).not.toBe(401);
    });

    it('POST /api/attendance-bridge/ingest uses bridge-token auth, not user login auth', async () => {
        const res = await request(app).post('/api/attendance-bridge/ingest').send({});
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('INVALID_ATTENDANCE_BRIDGE_TOKEN');
    });
});
