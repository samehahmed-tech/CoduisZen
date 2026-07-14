import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const safeEqual = (actual: string, expected: string) => {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

export const requireWhatsAppWebhookAuth = (req: Request, res: Response, next: NextFunction) => {
    const isMeta = req.body?.object === 'whatsapp_business_account' || Array.isArray(req.body?.entry);
    if (isMeta) {
        const secret = String(process.env.WHATSAPP_META_APP_SECRET || '').trim();
        if (!secret) return res.status(503).json({ error: 'WHATSAPP_META_APP_SECRET_NOT_SET' });
        const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
        const signature = String(req.headers['x-hub-signature-256'] || '').trim();
        if (!rawBody || !signature.startsWith('sha256=')) {
            return res.status(401).json({ error: 'INVALID_WHATSAPP_WEBHOOK_SIGNATURE' });
        }
        const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
        if (!safeEqual(signature, expected)) {
            return res.status(401).json({ error: 'INVALID_WHATSAPP_WEBHOOK_SIGNATURE' });
        }
        return next();
    }

    const expected = String(process.env.WHATSAPP_WEBHOOK_SECRET || '').trim();
    if (!expected) return res.status(503).json({ error: 'WHATSAPP_WEBHOOK_SECRET_NOT_SET' });
    const authorization = String(req.headers.authorization || '');
    const actual = String(req.headers['x-webhook-token'] || (authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7) : '')).trim();
    if (!safeEqual(actual, expected)) return res.status(401).json({ error: 'INVALID_WHATSAPP_WEBHOOK_TOKEN' });
    return next();
};
