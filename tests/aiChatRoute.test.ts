import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { users, userSessions } from '../src/db/schema';

let app: any;
let db: typeof import('../server/db')['db'];
const suffix = Date.now();
const userId = `test-ai-cashier-${suffix}`;
const sessionId = `test-ai-session-${suffix}`;
const tokenId = `test-ai-token-${suffix}`;

describe('AI chat route', () => {
  beforeAll(async () => {
    app = (await import('../server/app')).default;
    db = (await import('../server/db')).db;
    await db.insert(users).values({ id: userId, name: 'AI Cashier', email: `${userId}@test.local`, role: 'CASHIER', permissions: ['NAV_AI_ASSISTANT'], isActive: true });
    await db.insert(userSessions).values({ id: sessionId, userId, tokenId, isActive: true, expiresAt: new Date(Date.now() + 60_000) });
  });

  afterAll(async () => {
    await db.delete(userSessions).where(eq(userSessions.id, sessionId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('allows an authenticated cashier to use the built-in copilot', async () => {
    const token = jwt.sign({ sub: userId, role: 'CASHIER', permissions: ['NAV_AI_ASSISTANT'], sid: sessionId, jti: tokenId }, process.env.JWT_SECRET!);
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'sales summary', lang: 'en', context: { orders: [{ total: 25, status: 'COMPLETED' }] } });
    expect(res.status).toBe(200);
    expect(res.body.text).toContain('25.00');
    expect(res.body.actions).toEqual([]);
  });
});
