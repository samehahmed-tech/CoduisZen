import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const requirePrintGatewayToken = (req: Request, res: Response, next: NextFunction) => {
    const expected = String(process.env.PRINT_GATEWAY_TOKEN || '').trim();
    if (!expected) return res.status(503).json({ error: 'PRINT_GATEWAY_NOT_CONFIGURED' });

    const actual = String(req.headers['x-gateway-token'] || req.query.token || '').trim();
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    const valid = actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
    if (!valid) return res.status(401).json({ error: 'INVALID_PRINT_GATEWAY_TOKEN' });
    return next();
};
