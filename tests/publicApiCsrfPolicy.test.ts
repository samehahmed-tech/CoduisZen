import { describe, expect, it } from 'vitest';
import { csrfProtection } from '../server/middleware/security';

describe('public API CSRF policy', () => {
    it('allows machine-to-machine OAuth/API-key POSTs without a browser Origin', () => {
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        let nextCalled = false;
        const req: any = { method: 'POST', originalUrl: '/api/v1/oauth/token', headers: {} };
        const res: any = { status: () => res, json: () => res };
        csrfProtection(req, res, () => { nextCalled = true; });
        process.env.NODE_ENV = previous;
        expect(nextCalled).toBe(true);
    });
});
