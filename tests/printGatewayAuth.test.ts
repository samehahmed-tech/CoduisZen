import { afterEach, describe, expect, it, vi } from 'vitest';
import { requirePrintGatewayToken } from '../server/middleware/printGatewayAuth';
import { csrfProtection } from '../server/middleware/security';

const originalToken = process.env.PRINT_GATEWAY_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;

const invoke = (token?: string) => {
    const req: any = { headers: token ? { 'x-gateway-token': token } : {}, query: {} };
    const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(body: unknown) { this.body = body; return this; },
    };
    const next = vi.fn();
    requirePrintGatewayToken(req, res, next);
    return { res, next };
};

describe('print gateway authentication', () => {
    afterEach(() => {
        if (originalToken === undefined) delete process.env.PRINT_GATEWAY_TOKEN;
        else process.env.PRINT_GATEWAY_TOKEN = originalToken;
        process.env.NODE_ENV = originalNodeEnv;
    });

    it('fails closed when the gateway token is not configured', () => {
        delete process.env.PRINT_GATEWAY_TOKEN;
        const { res, next } = invoke();
        expect(res.statusCode).toBe(503);
        expect(res.body.error).toBe('PRINT_GATEWAY_NOT_CONFIGURED');
        expect(next).not.toHaveBeenCalled();
    });

    it('accepts only the exact configured token', () => {
        process.env.PRINT_GATEWAY_TOKEN = 'p'.repeat(64);
        expect(invoke('wrong').res.statusCode).toBe(401);
        expect(invoke('p'.repeat(64)).next).toHaveBeenCalledOnce();
    });

    it('allows token-authenticated bridge status reports without a browser Origin header', () => {
        process.env.NODE_ENV = 'production';
        const req: any = { method: 'POST', originalUrl: '/api/print-gateway/bridge/jobs/job-1/complete', headers: {} };
        const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        csrfProtection(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('allows the one-time setup bootstrap without an Origin header', () => {
        process.env.NODE_ENV = 'production';
        const req: any = { method: 'POST', originalUrl: '/api/setup/bootstrap', headers: {} };
        const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        csrfProtection(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });
});
