import { NextFunction, Request, Response } from 'express';
import { isDatabaseUnavailableError } from '../utils/dbErrors';

type ErrorPayload = {
    code: string;
    message: string;
    details?: any;
    requestId: string;
};

const toCode = (payload: any, statusCode: number): string => {
    if (typeof payload?.code === 'string' && payload.code.trim()) return payload.code.trim();
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error.trim();
    if (statusCode === 404) return 'NOT_FOUND';
    if (statusCode === 401) return 'AUTH_REQUIRED';
    if (statusCode === 403) return 'FORBIDDEN';
    return 'INTERNAL_ERROR';
};

const toMessage = (payload: any, code: string): string => {
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error.trim();
    return code;
};

const toDetails = (payload: any): any => {
    if (!payload || typeof payload !== 'object') return undefined;
    if (payload.details !== undefined) return payload.details;
    const clone: Record<string, any> = { ...payload };
    delete clone.code;
    delete clone.error;
    delete clone.message;
    delete clone.requestId;
    return Object.keys(clone).length > 0 ? clone : undefined;
};

export const normalizeErrorPayload = (payload: any, statusCode: number, requestId: string): ErrorPayload => {
    const code = toCode(payload, statusCode);
    const message = toMessage(payload, code);
    const details = toDetails(payload);
    if (details === undefined) return { code, message, requestId };
    return { code, message, details, requestId };
};

export const errorContractMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = ((body?: any) => {
        if (res.statusCode < 400) {
            return originalJson(body);
        }
        // ── Restart/update safety net ──
        // Controllers answer 500 with the raw driver error when the DB pool is
        // down or draining (hotfix apply, watchdog restart, SQL reconnect).
        // Surface those as 503 DATABASE_UNAVAILABLE (retryable) instead of 500,
        // so the frontend retries with backoff instead of failing every widget
        // at once — and never treats them as session-invalid. Only upgrades
        // already-failing 500 responses whose error text matches transient DB
        // signatures; success paths and real 500s are untouched.
        if (res.statusCode === 500 && isDatabaseUnavailableError({ message: toMessage(body, toCode(body, 500)) })) {
            res.statusCode = 503;
            res.setHeader('Retry-After', '5');
            return originalJson({
                code: 'DATABASE_UNAVAILABLE',
                error: 'DATABASE_UNAVAILABLE',
                message: 'Database is reconnecting. Please retry in a few seconds.',
                messageAr: 'قاعدة البيانات بتعيد الاتصال. حاول مرة أخرى بعد ثوانٍ.',
                retryable: true,
                requestId: req.requestId || 'unknown',
            });
        }
        const normalized = normalizeErrorPayload(body, res.statusCode, req.requestId || 'unknown');
        return originalJson(normalized);
    }) as Response['json'];

    next();
};
