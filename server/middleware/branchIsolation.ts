/**
 * Branch Isolation Middleware (Sprint 4 - Item 49)
 * 
 * Ensures that non-SUPER_ADMIN users can only access data for their assigned branch.
 * Attaches the effective branchId to `req.effectiveBranchId` for use by controllers.
 * 
 * Usage:
 *   router.get('/orders', authenticateToken, enforceBranch, listOrders);
 *   router.post('/orders', authenticateToken, enforceBranch, createOrder);
 */

import { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
    interface Request {
        /** The branch this request is scoped to (enforced or explicit). */
        effectiveBranchId?: string;
    }
}

/**
 * Enforces branch isolation. 
 * - SUPER_ADMIN can specify any branchId via query/body/header.
 * - Other roles are locked to their JWT branchId/allowedBranches.
 * - If no branchId is available, the request is rejected.
 */
export const enforceBranch = (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ error: 'AUTH_REQUIRED' });
    }

    // SUPER_ADMIN can operate on any branch via explicit parameter
    if (user.role === 'SUPER_ADMIN') {
        const explicitBranch =
            (req.params?.branchId as string) ||
            (req.query.branchId as string) ||
            (req.query.branch_id as string) ||
            (req.body?.branchId as string) ||
            (req.body?.branch_id as string) ||
            (req.headers['x-branch-id'] as string) ||
            user.branchId;

        if (explicitBranch) {
            req.effectiveBranchId = explicitBranch;
        }
        // SUPER_ADMIN can also access cross-branch (no filter) — allowed
        return next();
    }

    const allowedBranches = new Set<string>();
    if (user.branchId) allowedBranches.add(user.branchId);
    for (const branchId of user.allowedBranches || []) {
        if (branchId) allowedBranches.add(branchId);
    }

    if (allowedBranches.size === 0) {
        return res.status(403).json({
            error: 'BRANCH_NOT_ASSIGNED',
            message: 'Your account is not assigned to any branch.',
        });
    }

    // Prevent cross-branch access: if request specifies a different branchId, reject
    const requestedBranch =
        (req.params?.branchId as string) ||
        (req.query.branchId as string) ||
        (req.query.branch_id as string) ||
        (req.body?.branchId as string) ||
        (req.body?.branch_id as string) ||
        (req.headers['x-branch-id'] as string);

    if (requestedBranch && !allowedBranches.has(requestedBranch)) {
        return res.status(403).json({
            error: 'BRANCH_MISMATCH',
            message: 'You cannot access data from another branch.',
        });
    }

    req.effectiveBranchId = requestedBranch || user.branchId || Array.from(allowedBranches)[0];
    return next();
};

/**
 * Enforces branch isolation and injects the resolved branch into req.query.
 * Useful for read/report controllers that already consume req.query.branchId.
 */
export const scopeBranchQuery = (req: Request, res: Response, next: NextFunction) => {
    enforceBranch(req, res, () => {
        if (req.effectiveBranchId) {
            req.query.branchId = req.effectiveBranchId;
        } else if (req.user?.role !== 'SUPER_ADMIN') {
            return res.status(403).json({
                error: 'BRANCH_SCOPE_REQUIRED',
                message: 'A branch scope is required for this request.',
            });
        }
        return next();
    });
};

/**
 * Soft branch extraction (no enforcement).
 * Useful for read-only endpoints where cross-branch access is allowed with filtering.
 */
export const extractBranch = (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    const explicitBranch =
        (req.query.branchId as string) ||
        (req.query.branch_id as string) ||
        (req.body?.branchId as string) ||
        (req.body?.branch_id as string) ||
        (req.headers['x-branch-id'] as string);

    req.effectiveBranchId = explicitBranch || user?.branchId || undefined;
    return next();
};
