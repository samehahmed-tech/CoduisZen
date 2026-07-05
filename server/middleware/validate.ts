/**
 * Zod Validation Middleware
 * Wraps a Zod schema to produce an Express middleware that validates req.body.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const fieldErrors = error.issues.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                }));
                return res.status(400).json({
                    code: 'VALIDATION_ERROR',
                    message: 'Request validation failed',
                    details: fieldErrors,
                });
            }
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                message: 'Invalid request body',
            });
        }
    };
}
