import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const readGatewayTokenMap = (): Record<string, string> => {
    const raw = String(process.env.PRINT_GATEWAY_TOKENS || '').trim();
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return Object.fromEntries(Object.entries(parsed).map(([id, token]) => [String(id).trim(), String(token || '').trim()]).filter(([id, token]) => id && token));
        }
    } catch {
        // Also accept gatewayId=token,gatewayId2=token2 for simple installs.
    }
    return Object.fromEntries(raw.split(',').map((entry) => {
        const separator = entry.indexOf('=');
        return separator > 0 ? [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()] : ['', ''];
    }).filter(([id, token]) => id && token));
};

const tokensEqual = (actual: string, expected: string) => {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

export const requirePrintGatewayToken = (req: Request, res: Response, next: NextFunction) => {
    const tokenMap = readGatewayTokenMap();
    const gatewayId = String(req.headers['x-gateway-id'] || req.query.gatewayId || '').trim();
    const requirePerGateway = String(process.env.PRINT_GATEWAY_REQUIRE_PER_GATEWAY_TOKENS || '').toLowerCase() === 'true';
    const expected = Object.keys(tokenMap).length > 0
        ? tokenMap[gatewayId]
        : (requirePerGateway ? '' : String(process.env.PRINT_GATEWAY_TOKEN || '').trim());
    if (!expected) return res.status(requirePerGateway || Object.keys(tokenMap).length > 0 ? 401 : 503).json({ error: requirePerGateway || Object.keys(tokenMap).length > 0 ? 'UNKNOWN_PRINT_GATEWAY' : 'PRINT_GATEWAY_NOT_CONFIGURED' });

    // Tokens in URLs are intentionally unsupported: URLs leak through proxy,
    // browser and access logs. The bridge sends x-gateway-token instead.
    const actual = String(req.headers['x-gateway-token'] || '').trim();
    if (!tokensEqual(actual, expected)) return res.status(401).json({ error: 'INVALID_PRINT_GATEWAY_TOKEN' });
    return next();
};
