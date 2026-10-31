import { afterEach, describe, expect, it, vi } from 'vitest';

const { createSignedAuditLog } = vi.hoisted(() => ({
    createSignedAuditLog: vi.fn().mockResolvedValue({ id: 1 }),
}));
vi.mock('../server/services/auditService', () => ({ createSignedAuditLog }));

import { mutationAuditMiddleware } from '../server/middleware/mutationAudit';

describe('mutation audit baseline', () => {
    afterEach(() => createSignedAuditLog.mockClear());

    it('records signed request and result metadata for authenticated mutations', async () => {
        const finishHandlers: Array<() => void> = [];
        const req: any = {
            method: 'POST',
            originalUrl: '/api/orders',
            url: '/api/orders',
            body: { total: 10, password: 'never-persist-value' },
            requestId: 'req-1',
            effectiveBranchId: 'branch-1',
            user: { id: 'user-1', name: 'Cashier', role: 'CASHIER', branchId: 'branch-1' },
            headers: { 'user-agent': 'test-agent' },
        };
        const res: any = {
            statusCode: 201,
            once: (_event: string, handler: () => void) => finishHandlers.push(handler),
        };
        const next = vi.fn();

        mutationAuditMiddleware(req, res, next);
        expect(next).toHaveBeenCalledOnce();
        await Promise.resolve();
        finishHandlers.forEach((handler) => handler());
        await Promise.resolve();

        expect(createSignedAuditLog).toHaveBeenCalledTimes(2);
        expect(createSignedAuditLog.mock.calls[0][0]).toMatchObject({
            eventType: 'API_MUTATION_REQUEST',
            userId: 'user-1',
            branchId: 'branch-1',
            requestId: 'req-1',
        });
        expect(createSignedAuditLog.mock.calls[0][0].payload).toEqual({
            method: 'POST',
            path: '/api/orders',
            bodyKeys: ['password', 'total'],
        });
        expect(createSignedAuditLog.mock.calls[1][0].payload.statusCode).toBe(201);
    });

    it('does not add a second baseline for safe or audit endpoints', () => {
        const next = vi.fn();
        const res: any = { once: vi.fn() };
        mutationAuditMiddleware({ method: 'GET', originalUrl: '/api/orders', headers: {} } as any, res, next);
        mutationAuditMiddleware({ method: 'POST', originalUrl: '/api/audit-logs', headers: {} } as any, res, next);
        expect(createSignedAuditLog).not.toHaveBeenCalled();
        expect(res.once).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(2);
    });
});
