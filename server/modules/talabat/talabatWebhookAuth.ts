import type { NextFunction, Request, Response } from 'express';
import { getTalabatConfigRaw } from './talabatConfig';
import { verifyTalabatWebhookAuth } from './talabatMapper';

/** Public Talabat webhook guard: secret (Bearer/raw) or Basic. 401 on mismatch, 503 when unconfigured. */
export const requireTalabatWebhookAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const config = await getTalabatConfigRaw();
        const secret = String(config.webhookSecret || '').trim();
        const basic = config.basicUsername && (config as any).basicPassword
            ? { username: String(config.basicUsername), password: String((config as any).basicPassword) }
            : undefined;
        if (!secret && !basic) return res.status(503).json({ error: 'TALABAT_WEBHOOK_SECRET_NOT_SET' });
        const ok = verifyTalabatWebhookAuth(
            { authorization: String(req.headers.authorization || req.headers['x-webhook-secret'] || '') },
            secret,
            basic,
        );
        if (!ok) return res.status(401).json({ error: 'INVALID_TALABAT_WEBHOOK_AUTH' });
        return next();
    } catch (err: any) {
        return res.status(503).json({ error: 'TALABAT_CONFIG_UNAVAILABLE' });
    }
};
