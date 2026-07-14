import { Request, Response, NextFunction } from 'express';

interface AppErrorLike extends Error {
    statusCode?: number;
    code?: string;
    number?: number;
    originalError?: { number?: number };
    isOperational?: boolean;
}

const maskSensitiveText = (value?: string) => {
    if (!value) return value;
    return value
        .replace(/(authorization|token|password|secret|api[_-]?key|client[_-]?secret)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
        .replace(/bearer\s+[a-z0-9\-_\.]+/gi, 'Bearer [REDACTED]');
};

/**
 * Error Dictionary for UX (Item 34)
 */
const UX_ERRORS: Record<string, { en: string; ar: string; action?: string }> = {
    '2601': { // SQL Server duplicate index key
        en: 'This record already exists. Please check your data.',
        ar: 'هذا السجل موجود مسبقاً. يرجى التحقق من البيانات.',
        action: 'refresh_or_modify'
    },
    '2627': { // SQL Server duplicate constraint key
        en: 'This record already exists. Please check your data.',
        ar: 'لا يمكن حذف هذا السجل لأنه مرتبط ببيانات أخرى نشطة.',
        action: 'refresh_or_modify'
    },
    '547': { // SQL Server FK Violation
        en: 'Cannot delete this record because it is linked to other active data.',
        ar: 'لا يمكن حذف هذا السجل لأنه مرتبط ببيانات أخرى نشطة.',
        action: 'check_dependencies'
    },
    '1205': { // SQL Server deadlock victim
        en: 'System is busy processing another request for this data. Please try again.',
        ar: 'النظام مشغول بمعالجة طلب آخر على نفس البيانات. يرجى المحاولة مرة أخرى.',
        action: 'retry'
    },
    'PERMISSION_DENIED': {
        en: 'You do not have the required permission for this action.',
        ar: 'ليس لديك الصلاحيات المطلوبة لهذا الإجراء.',
        action: 'contact_manager'
    },
    'FORBIDDEN': {
        en: 'Access forbidden to this resource.',
        ar: 'غير مصرح لك بالوصول لهذا المورد.',
        action: 'contact_manager'
    },
    'RESOURCE_NOT_FOUND': {
        en: 'The requested resource was not found or has been removed.',
        ar: 'لم يتم العثور على العنصر المطلوب أو تم حذفه.',
        action: 'refresh'
    }
};

/**
 * Global error handler middleware.
 * Sanitizes error responses in production to prevent stack trace leaks.
 */
export const errorHandler = (
    err: AppErrorLike & { code?: string },
    req: Request,
    res: Response,
    _next: NextFunction
) => {
    let statusCode = err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production';
    const requestId = req.requestId || 'unknown';

    // Extract DB code if available
    const sqlServerNumber = err.number ?? err.originalError?.number;
    const dbErrorCode = sqlServerNumber ? String(sqlServerNumber) : err.code;
    let errorCode = err.code || dbErrorCode || 'INTERNAL_ERROR';

    // Map DB errors to UX errors
    if (dbErrorCode && ['2601', '2627', '547', '1205'].includes(dbErrorCode)) {
        statusCode = ['2601', '2627', '1205'].includes(dbErrorCode) ? 409 : 400;
        errorCode = dbErrorCode;
        err.isOperational = true; // Safe to show mapped message
    }

    if (statusCode === 403) errorCode = 'FORBIDDEN';

    // Log error for debugging (always log full error server-side)
    console.error(`[ERROR] ${requestId} ${errorCode}:`, {
        message: maskSensitiveText(err.message),
        stack: maskSensitiveText(err.stack),
        statusCode,
    });

    // Lookup UX Dictionary
    const uxData = UX_ERRORS[errorCode];

    // Operational errors or mapped DB errors
    if (err.isOperational || uxData) {
        return res.status(statusCode).json({
            code: errorCode,
            message: uxData?.en || err.message,
            messageAr: uxData?.ar,
            action: uxData?.action,
            requestId,
        });
    }

    // For unexpected errors, hide details in production
    if (isProduction) {
        return res.status(500).json({
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred. Please try again later.',
            messageAr: 'حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.',
            requestId,
        });
    }

    // In development, show full error details
    return res.status(statusCode).json({
        code: errorCode,
        message: err.message,
        details: { stack: err.stack },
        requestId,
    });
};

/**
 * Custom error class for operational errors.
 */
export class AppError extends Error {
    statusCode: number;
    code: string;
    isOperational: boolean;

    constructor(message: string, statusCode = 400, code = 'ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Async wrapper to catch errors in async route handlers.
 */
export const asyncHandler = (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Not found handler for undefined routes.
 */
export const notFoundHandler = (_req: Request, res: Response) => {
    res.status(404).json({
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
        messageAr: 'الصفحة أو المورد المطلوب غير موجود.',
        action: 'home',
        requestId: _req.requestId || 'unknown',
    });
};
