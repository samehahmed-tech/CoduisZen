import mssql from 'mssql/msnodesqlv8';
import { validateTestDatabaseTarget } from '../server/db/testDatabaseGuard';

const verdict = validateTestDatabaseTarget({
    nodeEnv: process.env.NODE_ENV || 'test',
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    runtimeDatabaseUrl: process.env.DATABASE_URL,
    allowExplicit: process.env.ALLOW_TEST_DATABASE,
});

if ('reason' in verdict) {
    console.error(`UNSAFE_TEST_DATABASE|${verdict.reason}`);
    process.exit(1);
}

const pool = new mssql.ConnectionPool({
    connectionString: process.env.TEST_DATABASE_URL!,
    connectionTimeout: 15_000,
    requestTimeout: 15_000,
});

try {
    await pool.connect();
    const result = await pool.request().query('SELECT DB_NAME() AS databaseName');
    const databaseName = String(result.recordset?.[0]?.databaseName || '').trim();
    if (!databaseName || databaseName.toLowerCase() !== verdict.databaseName.toLowerCase()) {
        throw new Error('TEST_DATABASE_NAME_MISMATCH');
    }
    console.log(JSON.stringify({ ok: true, databaseName: verdict.databaseName }));
} catch (error: any) {
    console.error(`TEST_DATABASE_UNAVAILABLE|${String(error?.code || error?.message || error)}`);
    process.exitCode = 1;
} finally {
    await pool.close().catch(() => undefined);
}
