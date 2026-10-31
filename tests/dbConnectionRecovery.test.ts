import { describe, expect, it, vi } from 'vitest';
import { isDatabaseConnectionError, isReadOnlyQuery, runWithDatabaseRecovery } from '../server/utils/dbConnectionRecovery';

describe('database connection recovery', () => {
    it('recognizes restart and transport failures as recoverable', () => {
        expect(isDatabaseConnectionError(new Error('Connection is closed'))).toBe(true);
        expect(isDatabaseConnectionError({ code: 'ECONNRESET' })).toBe(true);
        expect(isDatabaseConnectionError({ message: 'validation failed', status: 422 })).toBe(false);
    });

    it('reconnects once and retries the query after a transient connection failure', async () => {
        const run = vi.fn()
            .mockRejectedValueOnce(new Error('SQL_SERVER_UNAVAILABLE'))
            .mockResolvedValueOnce('recovered');
        const reconnect = vi.fn().mockResolvedValue(undefined);

        await expect(runWithDatabaseRecovery(run, reconnect, { retryOnConnectionError: true })).resolves.toBe('recovered');
        expect(reconnect).toHaveBeenCalledTimes(1);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('classifies only SELECT statements as safe for automatic retry', () => {
        expect(isReadOnlyQuery('SELECT 1')).toBe(true);
        expect(isReadOnlyQuery('  select TOP 1 id from users')).toBe(true);
        expect(isReadOnlyQuery('UPDATE users SET is_active = 0')).toBe(false);
        expect(isReadOnlyQuery('WITH candidate AS (SELECT 1) UPDATE users SET is_active = 0')).toBe(false);
    });

    it('does not retry an ambiguous mutation when retry is disabled', async () => {
        const run = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
        const reconnect = vi.fn();

        await expect(runWithDatabaseRecovery(run, reconnect, { retryOnConnectionError: false })).rejects.toThrow('ECONNRESET');
        expect(reconnect).not.toHaveBeenCalled();
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('does not retry business failures', async () => {
        const run = vi.fn().mockRejectedValue(new Error('VALIDATION_FAILED'));
        const reconnect = vi.fn();

        await expect(runWithDatabaseRecovery(run, reconnect)).rejects.toThrow('VALIDATION_FAILED');
        expect(reconnect).not.toHaveBeenCalled();
        expect(run).toHaveBeenCalledTimes(1);
    });
});
