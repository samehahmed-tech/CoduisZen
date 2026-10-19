import type { NextFunction, Request, Response } from 'express';
import { getAggregatorsConfigRaw } from './aggregatorConfig';
import { isKnownProvider, verifyProviderAuth } from './aggregatorTypes';

/** Public aggregator webhook guard: per-provider shared secret or Basic. */
export const requireAggregatorWebhookAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const providerId = String(req.params.providerId || '').trim().toLowerCase();
        if (!isKnownProvider(providerId)) return res.status(404).json({ error: 'UNKNOWN_PROVIDER' });
        const configs = await getAggregatorsConfigRaw();
        const config = configs[providerId];
        const secret = String(config?.webhookSecret || '').trim();
        const basic = config?.basicUsername && (config as any).basicPassword
            ? { username: String(config.basicUsername), password: String((config as any).basicPassword) }
            : undefined;
        if (!secret && !basic) return res.status(503).json({ error: 'AGGREGATOR_SECRET_NOT_SET' });
        const ok = verifyProviderAuth(
            { authorization: String(req.headers.authorization || req.headers['x-webhook-secret'] || '') },
            secret,
            basic,
        );
        if (!ok) return res.status(401).json({ error: 'INVALID_AGGREGATOR_AUTH' });
        (req as any).aggregatorProviderId = providerId;
        return next();
    } catch {
        return res.status(503).json({ error: 'AGGREGATOR_CONFIG_UNAVAILABLE' });
    }
};
