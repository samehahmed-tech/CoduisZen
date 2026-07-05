import { describe, expect, it } from 'vitest';
import { enqueueJob } from '../server/controllers/printGatewayController';

const makeRes = () => {
    const res: any = {};
    res.statusCode = 200;
    res.status = (code: number) => {
        res.statusCode = code;
        return res;
    };
    res.json = (body: unknown) => {
        res.body = body;
        return res;
    };
    return res;
};

describe('print gateway validation', () => {
    it('rejects unsupported print content types before queueing', async () => {
        const req: any = {
            body: {
                branchId: 'b1',
                type: 'RECEIPT',
                content: 'test',
                contentType: 'escpos-json',
            },
            query: {},
            user: { id: 'u1', role: 'SUPER_ADMIN', branchId: 'b1' },
        };
        const res = makeRes();

        await enqueueJob(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'INVALID_PRINT_CONTENT_TYPE' });
    });
});
