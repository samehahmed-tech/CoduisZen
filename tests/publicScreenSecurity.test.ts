import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import app from '../server/app';

const originalNodeEnv = process.env.NODE_ENV;
const originalScreenToken = process.env.PUBLIC_SCREEN_TOKEN;
const originalLanNoKey = process.env.PUBLIC_SCREEN_LAN_NO_KEY;

describe('public operator screen security', () => {
    beforeEach(() => {
        process.env.NODE_ENV = 'production';
        process.env.PUBLIC_SCREEN_TOKEN = 'test-public-screen-token-32-characters';
        delete process.env.PUBLIC_SCREEN_LAN_NO_KEY;
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        if (originalScreenToken === undefined) delete process.env.PUBLIC_SCREEN_TOKEN;
        else process.env.PUBLIC_SCREEN_TOKEN = originalScreenToken;
        if (originalLanNoKey === undefined) delete process.env.PUBLIC_SCREEN_LAN_NO_KEY;
        else process.env.PUBLIC_SCREEN_LAN_NO_KEY = originalLanNoKey;
    });

    it('does not trust a spoofed private forwarded IP without the screen token', async () => {
        const response = await request(app)
            .get('/api/public-screens/tickets?branchId=b1')
            .set('X-Forwarded-For', '192.168.1.25');

        expect(response.status).toBe(403);
        expect(response.body.code).toBe('PUBLIC_SCREEN_FORBIDDEN');
    });

    it('allows the production KDS on the restaurant LAN without a screen key when enabled', async () => {
        process.env.PUBLIC_SCREEN_LAN_NO_KEY = 'true';

        const response = await request(app)
            .get('/api/public-screens/tickets?branchId=b1');

        expect(response.status).not.toBe(403);
        expect(response.body.code).not.toBe('PUBLIC_SCREEN_FORBIDDEN');
    });
});
