import { beforeEach, describe, expect, it, vi } from 'vitest';

const settle = vi.hoisted(() => vi.fn());
const recordFailure = vi.hoisted(() => vi.fn());

vi.mock('../server/db', () => ({ db: {} }));
vi.mock('../server/services/paymobSettlementService', () => ({ settlePaymobCallback: settle }));
vi.mock('../server/services/paymentWebhookRetryService', () => ({ paymentWebhookRetryService: { recordFailure } }));
vi.mock('../server/services/auditService', () => ({ createSignedAuditLog: vi.fn() }));
vi.mock('../server/modules/payments/paymobService', () => ({
    createIntention: vi.fn(),
    getPaymobConfig: vi.fn(),
    refundTransaction: vi.fn(),
    savePaymobConfig: vi.fn(),
}));

import { handleWebhook } from '../server/controllers/paymobController';

const response = () => {
    const res: any = { statusCode: 200, body: undefined };
    res.status = vi.fn((status: number) => { res.statusCode = status; return res; });
    res.json = vi.fn((body: unknown) => { res.body = body; return res; });
    return res;
};

describe('Paymob webhook controller authority', () => {
    beforeEach(() => {
        settle.mockReset();
        recordFailure.mockReset();
    });

    it('rejects bad HMAC without retrying it', async () => {
        settle.mockRejectedValueOnce(Object.assign(new Error('BAD_HMAC'), { code: 'BAD_HMAC' }));
        const res = response();
        await handleWebhook({ body: { obj: { id: 1 } } } as any, res);
        expect(res.statusCode).toBe(401);
        expect(res.body).toMatchObject({ error: 'BAD_HMAC' });
        expect(recordFailure).not.toHaveBeenCalled();
    });

    it('rejects stale callbacks without putting permanent failures in retry', async () => {
        settle.mockRejectedValueOnce(Object.assign(new Error('STALE_CALLBACK'), { code: 'STALE_CALLBACK' }));
        const res = response();
        await handleWebhook({ body: { obj: { id: 2 } } } as any, res);
        expect(res.statusCode).toBe(409);
        expect(res.body).toMatchObject({ error: 'STALE_CALLBACK' });
        expect(recordFailure).not.toHaveBeenCalled();
    });

    it('queues only transient settlement failures', async () => {
        settle.mockRejectedValueOnce(new Error('DB_TIMEOUT'));
        const res = response();
        await handleWebhook({ body: { obj: { id: 3 } } } as any, res);
        expect(res.statusCode).toBe(202);
        expect(res.body).toMatchObject({ accepted: true, retryQueued: true });
        expect(recordFailure).toHaveBeenCalledWith(expect.objectContaining({ provider: 'paymob' }));
    });

    it('does not retry permanent settlement failures', async () => {
        settle.mockRejectedValueOnce(Object.assign(new Error('ORDER_NOT_FOUND'), { code: 'ORDER_NOT_FOUND', status: 404 }));
        const res = response();
        await handleWebhook({ body: { obj: { id: 4 } } } as any, res);
        expect(res.statusCode).toBe(422);
        expect(res.body).toMatchObject({ error: 'PAYMOB_WEBHOOK_NOT_RETRYABLE' });
        expect(recordFailure).not.toHaveBeenCalled();
    });
});
