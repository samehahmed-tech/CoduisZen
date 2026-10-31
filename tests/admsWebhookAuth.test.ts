import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireAdmsWebhookAuth } from '../server/middleware/admsWebhookAuth';

const run = (headers: Record<string, string> = {}) => {
    const req = { headers } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    const next = vi.fn();
    requireAdmsWebhookAuth(req, res, next);
    return { res, next };
};

describe('ADMS webhook authentication', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSecret = process.env.ADMS_WEBHOOK_SECRET;

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        if (originalSecret === undefined) delete process.env.ADMS_WEBHOOK_SECRET;
        else process.env.ADMS_WEBHOOK_SECRET = originalSecret;
    });

    it('accepts the configured shared secret', () => {
        process.env.NODE_ENV = 'production';
        process.env.ADMS_WEBHOOK_SECRET = 'adms-test-secret';
        const { next, res } = run({ 'x-adms-secret': 'adms-test-secret' });
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects a missing or incorrect secret', () => {
        process.env.NODE_ENV = 'production';
        process.env.ADMS_WEBHOOK_SECRET = 'adms-test-secret';
        const { next, res } = run({ 'x-adms-secret': 'wrong' });
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('fails closed in production when the secret is missing', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.ADMS_WEBHOOK_SECRET;
        const { next, res } = run();
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
    });
});
