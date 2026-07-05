import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

declare module 'express-serve-static-core' {
    interface Request {
        requestId?: string;
        requestStartTime?: number;
    }
}

const HEADER_NAME = 'x-request-id';
const SENSITIVE_KEYS = ['token', 'authorization', 'password', 'secret', 'api_key', 'apikey', 'client_secret'];

const redactValue = (value: string) => (value ? '[REDACTED]' : value);

const sanitizePath = (inputPath: string): string => {
    try {
        const parsed = new URL(inputPath, 'http://localhost');
        for (const key of [...parsed.searchParams.keys()]) {
            if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
                parsed.searchParams.set(key, redactValue(parsed.searchParams.get(key) || ''));
            }
        }
        const query = parsed.searchParams.toString();
        return `${parsed.pathname}${query ? `?${query}` : ''}`;
    } catch {
        return inputPath;
    }
};

const normalizeRequestId = (value: unknown): string | undefined => {
    if (!value) return undefined;
    const id = String(value).trim();
    return id || undefined;
};

export const attachRequestId = (req: Request, res: Response, next: NextFunction) => {
    const incoming = normalizeRequestId(req.header(HEADER_NAME));
    const requestId = incoming || randomUUID();
    req.requestId = requestId;
    req.requestStartTime = Date.now();
    res.setHeader('X-Request-Id', requestId);
    next();
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const requestId = req.requestId || 'unknown';
    const method = req.method;
    const path = sanitizePath(req.originalUrl || req.url);

    const isSilent = path.includes('/claim') || path.includes('/status') || path.includes('/health') || path.includes('/whatsapp/inbox');

    if (!isSilent) console.log(`[REQ] ${requestId} ${method} ${path}`);

    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        if (!isSilent) console.log(`[RES] ${requestId} ${method} ${path} ${res.statusCode} ${durationMs}ms`);
    });

    next();
};
