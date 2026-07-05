import type { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';

const auditLogger = logger.child({ domain: 'audit' });

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const auditMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    if (!SAFE_METHODS.has(req.method)) {
        const path = req.originalUrl || req.url;
        if (!path.includes('/claim')) {
            auditLogger.debug({
                method: req.method,
                path: path,
                userId: req.user?.id,
                branchId: req.user?.branchId,
                requestId: req.requestId,
            }, 'Mutable API request received');
        }
    }

    next();
};

