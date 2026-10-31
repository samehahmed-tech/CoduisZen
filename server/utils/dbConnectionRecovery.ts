export const isDatabaseConnectionError = (error: any) => {
    const text = [
        error?.message,
        error?.code,
        error?.originalError?.message,
        String(error || ''),
    ].filter(Boolean).join(' ');
    return /SQL_SERVER_UNAVAILABLE|Connection is closed|Connection lost|ECONNRESET|ECONNREFUSED|ETIMEDOUT|Login timeout|Failed to connect/i.test(text);
};

/**
 * A lost response is ambiguous for a mutation: SQL Server may have committed
 * it before the socket died. Only retry statements whose first token is
 * SELECT; writes must be retried by their domain transaction/idempotency flow.
 */
export const isReadOnlyQuery = (query: string) => /^\s*SELECT\b/i.test(query);

export type DatabaseRecoveryOptions = {
    retryOnConnectionError?: boolean;
};

/** Retry exactly once after a transport/database restart when explicitly enabled. */
export const runWithDatabaseRecovery = async <T>(
    run: () => Promise<T>,
    reconnect: () => Promise<void>,
    options: DatabaseRecoveryOptions = {},
) => {
    try {
        return await run();
    } catch (error) {
        if (!options.retryOnConnectionError || !isDatabaseConnectionError(error)) throw error;
        await reconnect();
        return run();
    }
};
