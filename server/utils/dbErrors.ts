import { Response } from 'express';

const getErrorText = (error: any) => [
    error?.message,
    error?.originalError?.message,
    error?.precedingErrors?.map((e: any) => e?.message).join(' '),
    error?.cause?.message,
].filter(Boolean).join(' ');

export const isForeignKeyDeleteError = (error: any) => {
    const text = getErrorText(error);
    return error?.code === '23503'
        || error?.number === 547
        || error?.originalError?.number === 547
        || /REFERENCE constraint|foreign key constraint|violates foreign key constraint/i.test(text);
};

export const writeForeignKeyDeleteConflict = (
    res: Response,
    noun = 'record',
    linkedTables?: string[],
) => res.status(409).json({
    code: 'RECORD_HAS_LINKED_DATA',
    error: 'RECORD_HAS_LINKED_DATA',
    message: `Cannot delete this ${noun} because it is linked to operational data. Archive/deactivate it instead.`,
    messageAr: `لا يمكن حذف هذا السجل لأنه مرتبط ببيانات تشغيل. استخدم الأرشفة أو التعطيل بدل الحذف.`,
    linkedTables,
});

/**
 * Detects "database is down / reconnecting" failures (SQL Server offline,
 * closed pool, login timeout, ECONNRESET/ECONNREFUSED from tedious).
 * These must surface as 503 (retryable) — never 500 — so the frontend
 * retries with backoff instead of blanking screens with error toasts.
 */
export const isDatabaseUnavailableError = (error: any): boolean => {
    const text = getErrorText(error).toLowerCase();
    if (!text && error?.message !== 'SQL_SERVER_UNAVAILABLE') return false;
    if (error?.message === 'SQL_SERVER_UNAVAILABLE') return true;
    return /sql_server_unavailable|connection is closed|connection lost|connection reset|connection refused|login timeout|timeout.*connection|econnreset|econnrefused|etimedout|enotfound|getaddrinfo|failed to connect|unable to connect|database .* (unavailable|offline|not reachable)|sql server unavailable|request timeout|cannot open database|database .* does not exist/i.test(getErrorText(error));
};

/** 503 with a stable code the frontend maps + retries (see apiRequest). */
export const writeDatabaseUnavailable = (res: Response, error?: any) => res.status(503).json({
    code: 'DATABASE_UNAVAILABLE',
    error: 'DATABASE_UNAVAILABLE',
    message: 'Database is reconnecting. Please retry in a few seconds.',
    messageAr: 'قاعدة البيانات بتعيد الاتصال. حاول مرة أخرى بعد ثوانٍ.',
    retryable: true,
    detail: process.env.NODE_ENV === 'production' ? undefined : String(error?.message || error || ''),
});

/**
 * Drop-in for read-endpoint catch blocks:
 * `catch (error) { return writeDbError(res, error); }`
 * → 503 when the DB is down, 500 otherwise.
 */
export const writeDbError = (res: Response, error: any) => {
    if (isDatabaseUnavailableError(error)) return writeDatabaseUnavailable(res, error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', error: error?.message || 'Request failed' });
};
