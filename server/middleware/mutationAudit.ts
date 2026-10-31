import type { NextFunction, Request, Response } from 'express';
import { createSignedAuditLog } from '../services/auditService';
import logger from '../utils/logger';

const log = logger.child({ middleware: 'mutation-audit' });
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXCLUDED_PREFIXES = ['/api/audit-logs', '/api/auth'];

const isExcluded = (req: Request) => {
    const path = req.originalUrl || req.url || '';
    return EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix));
};

const auditRequest = (req: Request, phase: 'REQUEST' | 'RESULT', statusCode?: number) => {
    const user = req.user as any;
    return createSignedAuditLog({
        eventType: `API_MUTATION_${phase}`,
        userId: user?.id || 'system',
        userName: user?.name,
        userRole: user?.role,
        branchId: req.effectiveBranchId || user?.branchId || null,
        sourceDevice: req.headers['user-agent'] || 'unknown',
        requestId: req.requestId,
        payload: {
            method: req.method,
            path: req.originalUrl || req.url,
            bodyKeys: Object.keys(req.body || {}).sort(),
            ...(statusCode === undefined ? {} : { statusCode }),
        },
        reason: phase === 'REQUEST' ? 'Mutable API request received' : 'Mutable API request completed',
    });
};

/**
 * Baseline signed audit for every authenticated mutation. Domain controllers
 * still add before/after details for sensitive state changes; this layer makes
 * omissions measurable instead of leaving an invisible mutation.
 */
export const mutationAuditMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method) || isExcluded(req)) return next();

    void auditRequest(req, 'REQUEST').catch((error: any) => {
        log.warn({ err: error?.message, path: req.originalUrl }, 'Mutation request audit failed');
    });

    res.once('finish', () => {
        void auditRequest(req, 'RESULT', res.statusCode).catch((error: any) => {
            log.warn({ err: error?.message, path: req.originalUrl, statusCode: res.statusCode }, 'Mutation result audit failed');
        });
    });
    next();
};

export default mutationAuditMiddleware;
