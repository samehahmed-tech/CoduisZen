import { describe, expect, it } from 'vitest';
import { validateTestDatabaseTarget } from '../server/db/testDatabaseGuard';

describe('validateTestDatabaseTarget', () => {
    it('rejects use outside NODE_ENV=test', () => {
        expect(validateTestDatabaseTarget({
            nodeEnv: 'production',
            testDatabaseUrl: 'Server=localhost;Database=restoflow_test;',
        })).toEqual({ ok: false, reason: 'NODE_ENV_MUST_BE_TEST' });
    });

    it('rejects a missing explicit test URL', () => {
        expect(validateTestDatabaseTarget({ nodeEnv: 'test' }))
            .toEqual({ ok: false, reason: 'TEST_DATABASE_URL_REQUIRED' });
    });

    it('rejects the operational database even with an override', () => {
        expect(validateTestDatabaseTarget({
            nodeEnv: 'test',
            testDatabaseUrl: 'Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=CoduisZen;',
            allowExplicit: '1',
        })).toEqual({ ok: false, reason: 'OPERATIONAL_DATABASE_FORBIDDEN' });
    });

    it('rejects a target equal to the runtime database URL', () => {
        const url = 'Server=localhost;Initial Catalog=restoflow_test;Trusted_Connection=Yes;';
        expect(validateTestDatabaseTarget({
            nodeEnv: 'test',
            testDatabaseUrl: url,
            runtimeDatabaseUrl: url,
        })).toEqual({ ok: false, reason: 'MATCHES_RUNTIME_DATABASE_URL' });
    });

    it('accepts marked ODBC and URL database names', () => {
        expect(validateTestDatabaseTarget({
            nodeEnv: 'test',
            testDatabaseUrl: 'Server=localhost;Database=restoflow_ci;Trusted_Connection=Yes;',
        })).toMatchObject({ ok: true, databaseName: 'restoflow_ci' });

        expect(validateTestDatabaseTarget({
            nodeEnv: 'test',
            testDatabaseUrl: 'mssql://tester:password@localhost:1433/restoflow-test',
        })).toMatchObject({ ok: true, databaseName: 'restoflow-test' });
    });

    it('requires a marker unless the disposable-database override is explicit', () => {
        const input = {
            nodeEnv: 'test',
            testDatabaseUrl: 'Server=localhost;Database=disposable_4821;',
        };
        expect(validateTestDatabaseTarget(input))
            .toEqual({ ok: false, reason: 'TEST_DATABASE_NAME_NOT_MARKED' });
        expect(validateTestDatabaseTarget({ ...input, allowExplicit: '1' }))
            .toMatchObject({ ok: true, databaseName: 'disposable_4821' });
    });
});
