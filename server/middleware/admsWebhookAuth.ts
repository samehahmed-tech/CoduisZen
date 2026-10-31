import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';

const safeEqual = (actual: string, expected: string): boolean => {
    const a = Buffer.from(actual);
    const e = Buffer.from(expected);
    return a.length > 0 && a.length === e.length && crypto.timingSafeEqual(a, e);
};

/**
 * ADMS devices do not have a user session. Their push endpoint therefore
 * requires a deployment-level shared secret. Development keeps the legacy
 * simulator flow only when explicitly not running in production.
 */
export const requireAdmsWebhookAuth = (req: Request, res: Response, next: NextFunction) => {
    const expected = String(process.env.ADMS_WEBHOOK_SECRET || '').trim();
    if (!expected) {
        if (process.env.NODE_ENV !== 'production') return next();
        return res.status(503).json({ error: 'ADMS_WEBHOOK_SECRET_NOT_SET' });
    }

    const authorization = String(req.headers.authorization || '');
    const bearer = authorization.toLowerCase().startsWith('bearer ')
        ? authorization.slice(7)
        : '';
    const actual = String(req.headers['x-adms-secret'] || bearer || '').trim();
    if (!safeEqual(actual, expected)) {
        return res.status(401).json({ error: 'INVALID_ADMS_WEBHOOK_AUTH' });
    }
    return next();
};
