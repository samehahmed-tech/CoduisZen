import { describe, expect, it, afterEach, vi } from 'vitest';
import { requirePrintGatewayToken } from '../server/middleware/printGatewayAuth';

const run = (headers: Record<string, string> = {}, query: Record<string, string> = {}) => {
    const res: any = { status: vi.fn(() => res), json: vi.fn(() => res) };
    const next = vi.fn();
    requirePrintGatewayToken({ headers, query } as any, res, next);
    return { res, next };
};

afterEach(() => {
    delete process.env.PRINT_GATEWAY_TOKEN;
    delete process.env.PRINT_GATEWAY_TOKENS;
    delete process.env.PRINT_GATEWAY_REQUIRE_PER_GATEWAY_TOKENS;
});

describe('print gateway authentication', () => {
    it('authenticates a gateway using its mapped token', () => {
        process.env.PRINT_GATEWAY_TOKENS = JSON.stringify({ 'gateway-a': 'secret-a' });
        const { next } = run({ 'x-gateway-id': 'gateway-a', 'x-gateway-token': 'secret-a' });
        expect(next).toHaveBeenCalledOnce();
    });

    it('rejects a valid token used by an unknown gateway', () => {
        process.env.PRINT_GATEWAY_TOKENS = JSON.stringify({ 'gateway-a': 'secret-a' });
        const { res, next } = run({ 'x-gateway-id': 'gateway-b', 'x-gateway-token': 'secret-a' });
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'UNKNOWN_PRINT_GATEWAY' });
    });

    it('rejects URL tokens and supports legacy global token only when mapping is absent', () => {
        process.env.PRINT_GATEWAY_TOKEN = 'legacy-secret';
        expect(run({}, { token: 'legacy-secret' }).next).not.toHaveBeenCalled();
        expect(run({ 'x-gateway-token': 'legacy-secret' }).next).toHaveBeenCalledOnce();
    });
});
