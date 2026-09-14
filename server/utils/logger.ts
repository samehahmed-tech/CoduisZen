/**
 * Structured Logger for Coduis Zen
 * Uses Pino for JSON-structured, production-grade logging
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    ...(isProduction
        ? {
            // Production: JSON output for log aggregation
            formatters: {
                level: (label: string) => ({ level: label }),
                bindings: (bindings: Record<string, any>) => ({
                    pid: bindings.pid,
                    hostname: bindings.hostname,
                    service: 'coduiszen',
                }),
            },
            timestamp: pino.stdTimeFunctions.isoTime,
        }
        : {
            // Development: pretty-printed
            transport: {
                target: 'pino/file',
                options: { destination: 1 }, // stdout
            },
            timestamp: pino.stdTimeFunctions.isoTime,
        }),
    redact: {
        paths: [
            'password',
            'passwordHash',
            'pinCode',
            'token',
            'authorization',
            'cookie',
            'req.headers.authorization',
            'req.headers.cookie',
            '*.password',
            '*.passwordHash',
            '*.secret',
            '*.apiKey',
        ],
        censor: '[REDACTED]',
    },
});

// Named child loggers for different domains
export const dbLogger = logger.child({ domain: 'database' });
export const authLogger = logger.child({ domain: 'auth' });
export const orderLogger = logger.child({ domain: 'orders' });
export const fiscalLogger = logger.child({ domain: 'fiscal' });
export const socketLogger = logger.child({ domain: 'socket' });
export const aiLogger = logger.child({ domain: 'ai' });
export const inventoryLogger = logger.child({ domain: 'inventory' });
export const printLogger = logger.child({ domain: 'print' });

export default logger;
