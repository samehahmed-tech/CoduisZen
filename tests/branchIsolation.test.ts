import { describe, expect, it, vi } from 'vitest';
import { enforceBranch, scopeBranchQuery } from '../server/middleware/branchIsolation';

const runMiddleware = (input: {
    role?: string;
    branchId?: string | null;
    allowedBranches?: string[] | null;
    query?: Record<string, any>;
    body?: Record<string, any>;
    headers?: Record<string, any>;
    params?: Record<string, any>;
    middleware?: typeof enforceBranch;
}) => {
    const req: any = {
        user: {
            id: 'test-user',
            role: input.role || 'MANAGER',
            permissions: [],
            branchId: input.branchId,
            allowedBranches: input.allowedBranches,
        },
        query: input.query || {},
        body: input.body || {},
        headers: input.headers || {},
        params: input.params || {},
    };
    const res: any = {
        statusCode: 200,
        body: undefined,
        status: vi.fn((code: number) => {
            res.statusCode = code;
            return res;
        }),
        json: vi.fn((body: any) => {
            res.body = body;
            return res;
        }),
    };
    const next = vi.fn();

    (input.middleware || enforceBranch)(req, res, next);
    return { req, res, next };
};

describe('branch isolation middleware', () => {
    it('rejects snake_case branch_id outside user branch scope', () => {
        const { res, next } = runMiddleware({
            branchId: 'branch-a',
            body: { branch_id: 'branch-b' },
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.body.error).toBe('BRANCH_MISMATCH');
    });

    it('allows explicit branch_id when it is in allowedBranches', () => {
        const { req, next } = runMiddleware({
            branchId: 'branch-a',
            allowedBranches: ['branch-b'],
            query: { branch_id: 'branch-b' },
        });

        expect(next).toHaveBeenCalledOnce();
        expect(req.effectiveBranchId).toBe('branch-b');
    });

    it('falls back to assigned branch when no branch is requested', () => {
        const { req, next } = runMiddleware({
            branchId: 'branch-a',
            allowedBranches: ['branch-b'],
        });

        expect(next).toHaveBeenCalledOnce();
        expect(req.effectiveBranchId).toBe('branch-a');
    });

    it('rejects route param branchId outside user branch scope', () => {
        const { res, next } = runMiddleware({
            branchId: 'branch-a',
            params: { branchId: 'branch-b' },
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.body.error).toBe('BRANCH_MISMATCH');
    });

    it('injects scoped branchId into query for report-style reads', () => {
        const { req, next } = runMiddleware({
            branchId: 'branch-a',
            query: {},
            middleware: scopeBranchQuery,
        });

        expect(next).toHaveBeenCalledOnce();
        expect(req.query.branchId).toBe('branch-a');
    });
});
