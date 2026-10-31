import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import app from '../server/app';
import { db } from '../server/db';
import { branches } from '../src/db/schema';

describe('attendance bridge runtime authentication', () => {
    const branchId = 'test-attendance-bridge-e2e-branch';
    const token = 'attendance-bridge-e2e-secret';

    beforeEach(async () => {
        process.env.ATTENDANCE_BRIDGE_TOKEN = token;
        await db.insert(branches).values({ id: branchId, name: 'Attendance Bridge E2E Branch' }).onConflictDoNothing();
    });

    afterEach(async () => {
        delete process.env.ATTENDANCE_BRIDGE_TOKEN;
        await db.delete(branches).where(eq(branches.id, branchId));
    });

    it('accepts a valid bridge token and returns a branch-scoped empty ingest', async () => {
        const response = await request(app)
            .post('/api/attendance-bridge/ingest')
            .set('Authorization', `Bearer ${token}`)
            .send({ branchId, gatewayId: 'gateway-e2e', logs: [] });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ ok: true, branchId, received: 0, accepted: 0, rejected: 0 });
    });

    it('rejects a bridge token on a valid branch', async () => {
        const response = await request(app)
            .post('/api/attendance-bridge/ingest')
            .set('x-bridge-token', 'wrong-token')
            .send({ branchId, logs: [] });

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('INVALID_ATTENDANCE_BRIDGE_TOKEN');
    });
});
