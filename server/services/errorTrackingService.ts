/**
 * Error Tracking Service
 * Captures and logs unhandled errors with context for monitoring.
 * In production, this can be replaced with Sentry SDK or similar.
 * For now, it logs to the structured logger + a local error store.
 */

import logger from '../utils/logger';
import { alertService } from './alertService';

interface ErrorEvent {

    id: string;
    timestamp: Date;
    level: 'error' | 'warning' | 'fatal';
    message: string;
    stack?: string;
    context: Record<string, any>;
    userId?: string;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    requestId?: string;
}

// In-memory ring buffer of recent errors (keeps last 500)
const MAX_BUFFER = 500;
const errorBuffer: ErrorEvent[] = [];

let errorCounter = 0;

function generateId(): string {
    errorCounter++;
    return `err-${Date.now()}-${errorCounter}`;
}

/**
 * Capture an error with context.
 */
export function captureError(error: Error | string, context: Record<string, any> = {}): string {
    const err = typeof error === 'string' ? new Error(error) : error;
    const id = generateId();

    const event: ErrorEvent = {
        id,
        timestamp: new Date(),
        level: context.level || 'error',
        message: err.message,
        stack: err.stack,
        context,
        userId: context.userId,
        endpoint: context.endpoint,
        method: context.method,
        statusCode: context.statusCode,
        requestId: context.requestId,
    };

    // Log to structured logger
    logger.error({
        errorTrackingId: id,
        msg: err.message,
        stack: err.stack,
        ...context,
    }, `[ErrorTracking] ${err.message}`);

    // Proactively dispatch alert if fatal
    if (event.level === 'fatal') {
        alertService.dispatch('FATAL', 'UNHANDLED_EXCEPTION', err.message, { ...context, stack: err.stack, errorId: id });
    }

    // Add to ring buffer
    errorBuffer.push(event);
    if (errorBuffer.length > MAX_BUFFER) {
        errorBuffer.shift();
    }

    return id;
}

/**
 * Capture a warning (non-fatal).
 */
export function captureWarning(message: string, context: Record<string, any> = {}): string {
    return captureError(message, { ...context, level: 'warning' });
}

/**
 * Get recent errors for the ops dashboard.
 */
export function getRecentErrors(limit = 50): ErrorEvent[] {
    return errorBuffer.slice(-limit).reverse();
}

/**
 * Get error stats summary.
 */
export function getErrorStats() {
    const now = Date.now();
    const last1h = errorBuffer.filter(e => now - e.timestamp.getTime() < 60 * 60 * 1000);
    const last24h = errorBuffer.filter(e => now - e.timestamp.getTime() < 24 * 60 * 60 * 1000);

    return {
        total: errorBuffer.length,
        last1h: last1h.length,
        last24h: last24h.length,
        byLevel: {
            error: errorBuffer.filter(e => e.level === 'error').length,
            warning: errorBuffer.filter(e => e.level === 'warning').length,
            fatal: errorBuffer.filter(e => e.level === 'fatal').length,
        },
        topEndpoints: getTopEndpoints(),
    };
}

function getTopEndpoints(): Array<{ endpoint: string; count: number }> {
    const counts: Record<string, number> = {};
    for (const e of errorBuffer) {
        if (e.endpoint) {
            counts[e.endpoint] = (counts[e.endpoint] || 0) + 1;
        }
    }
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([endpoint, count]) => ({ endpoint, count }));
}

/**
 * Express middleware that captures unhandled errors.
 * Place BEFORE the global error handler.
 */
import { Request, Response, NextFunction } from 'express';

export function errorTrackingMiddleware(err: any, req: Request, res: Response, next: NextFunction) {
    captureError(err instanceof Error ? err : new Error(String(err.message || err)), {
        endpoint: req.originalUrl || req.url,
        method: req.method,
        statusCode: err.status || err.statusCode || 500,
        userId: (req as any).user?.id,
        requestId: (res as any).requestId,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
    });
    next(err);
}
