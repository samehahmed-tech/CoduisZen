/**
 * Security Middleware — Helmet, Rate Limiting, Input Sanitization
 * Implements: API Protection section of the security checklist
 */

import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

// =============================================================================
// Helmet — Security Headers
// =============================================================================

export const helmetMiddleware = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            mediaSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "wss:", "ws:", "http://localhost:3002", "http://127.0.0.1:3002"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            upgradeInsecureRequests: null,
        },
    },
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false, // Allow external images
    originAgentCluster: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: false,
});

// =============================================================================
// Input Sanitization
// =============================================================================

const DANGEROUS_PATTERNS = [
    /<script[\s>]/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /eval\s*\(/i,
    /expression\s*\(/i,
];

function sanitizeValue(value: any): any {
    if (typeof value === 'string') {
        // Check for XSS patterns
        for (const pattern of DANGEROUS_PATTERNS) {
            if (pattern.test(value)) {
                return value.replace(/<[^>]*>/g, ''); // Strip HTML tags
            }
        }
        // Trim whitespace
        return value.trim();
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (value && typeof value === 'object') {
        const cleaned: any = {};
        for (const [k, v] of Object.entries(value)) {
            cleaned[k] = sanitizeValue(v);
        }
        return cleaned;
    }
    return value;
}

export const inputSanitizer = (req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeValue(req.body);
    }
    if (req.query && typeof req.query === 'object') {
        for (const [key, val] of Object.entries(req.query)) {
            if (typeof val === 'string') {
                (req.query as any)[key] = val.trim();
            }
        }
    }
    next();
};

// =============================================================================
// CSRF Protection
// =============================================================================

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const CSRF_BYPASS_PREFIXES = [
    '/api/auth/login',
    '/api/auth/mfa',
    '/api/auth/pin-login',
    '/api/auth/refresh',
    // Initial bootstrap is intentionally unauthenticated and the controller
    // permanently closes it as soon as the first user exists.
    '/api/setup/bootstrap',
    '/api/print-gateway/gateway',
    '/api/print-gateway/bridge',
    '/api/attendance-bridge',
    '/api/whatsapp',
    '/api/public-screens',
    '/iclock',
];

const isLocalHost = (host?: string) => {
    const cleanHost = String(host || '').split(':')[0].replace(/^\[|\]$/g, '').toLowerCase();
    return cleanHost === 'localhost' || cleanHost === '127.0.0.1' || cleanHost === '::1';
};

const shouldBypassCsrf = (req: Request) => {
    const path = req.originalUrl || req.path || '';
    return CSRF_BYPASS_PREFIXES.some((prefix) => (
        path === prefix
        || path.startsWith(`${prefix}/`)
        || path.startsWith(`${prefix}?`)
    ));
};

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== 'production') {
        return next();
    }

    if (SAFE_METHODS.has(req.method)) {
        return next();
    }

    if (shouldBypassCsrf(req)) {
        return next();
    }

    // Bearer-token API requests are not vulnerable to classic browser CSRF in the
    // same way as cookie-auth flows, so we let them through.
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return next();
    }

    const origin = req.headers.origin;
    const host = req.headers.host;

    if (!origin || !host) {
        return res.status(403).json({
            code: 'CSRF_ORIGIN_REQUIRED',
            message: 'Origin header is required for state-changing requests.',
        });
    }

    try {
        const parsedOrigin = new URL(origin);
        if (parsedOrigin.host === host) {
            return next();
        }
        if (isLocalHost(parsedOrigin.host) && isLocalHost(host)) {
            return next();
        }
    } catch {
        return res.status(403).json({
            code: 'CSRF_INVALID_ORIGIN',
            message: 'Origin header is invalid.',
        });
    }

    return res.status(403).json({
        code: 'CSRF_BLOCKED',
        message: 'Cross-site request blocked.',
    });
};

// =============================================================================
// Disable Stack Traces in Production
// =============================================================================

export const hideErrorDetails = (err: any, _req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'production' && err) {
        // Never expose stack traces in production
        const safeError = {
            code: err.code || 'INTERNAL_ERROR',
            message: err.expose ? err.message : 'An internal error occurred',
            requestId: (res as any).requestId || undefined,
        };
        const status = err.status || err.statusCode || 500;
        return res.status(status).json(safeError);
    }
    next(err);
};
