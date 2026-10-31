import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql/msnodesqlv8';
import { assertSafeBackupDrill } from '../server/utils/backupDrillPolicy';

const escapeIdentifier = (value: string) => value.replace(/]/g, ']]');
const escapeLiteral = (value: string) => value.replace(/'/g, "''");
const readDatabaseName = (connectionString: string) =>
    connectionString.match(/(?:^|;)(?:Database|Initial Catalog)=([^;]+)/i)?.[1]?.trim() || '';

const targetDatabase = process.env.DRILL_DATABASE_NAME || `RestoFlow_DR_${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
const testConnectionString = process.env.TEST_DATABASE_URL || '';
const sourceDatabase = readDatabaseName(testConnectionString);
const drillStartedAt = Date.now();

assertSafeBackupDrill({ sourceDatabase, targetDatabase });
if (process.env.ALLOW_TEST_DATABASE !== '1') throw new Error('BACKUP_DRILL_REQUIRES_ALLOW_TEST_DATABASE');

const masterConnection = testConnectionString.replace(/(?:Database|Initial Catalog)=[^;]*/i, 'Database=master');
const quote = (value: string) => `N'${escapeLiteral(value)}'`;
const identifier = (value: string) => `[${escapeIdentifier(value)}]`;

const queryScalar = async (pool: any, statement: string) => {
    const result = await pool.request().query(statement);
    return result.recordset?.[0]?.value;
};

const resolveServerDirectory = async (pool: any, property: string, fallbackType: number) => {
    const value = await queryScalar(pool, `SELECT CAST(SERVERPROPERTY('${property}') AS nvarchar(4000)) AS value`);
    if (value) return String(value);
    const fallback = await queryScalar(pool, `SELECT TOP 1 physical_name AS value FROM sys.master_files WHERE database_id = DB_ID('tempdb') AND type = ${fallbackType}`);
    if (!fallback) throw new Error(`BACKUP_DRILL_SERVER_PATH_UNAVAILABLE:${property}`);
    return path.dirname(String(fallback));
};

let pool: any;
let backupFile = '';
let restored = false;
let cleanedUp = false;
let restoreStartedAt = 0;

try {
    pool = await new sql.ConnectionPool({ connectionString: masterConnection, requestTimeout: 600_000 }).connect();
    const backupDirectory = await resolveServerDirectory(pool, 'InstanceDefaultBackupPath', 0);
    backupFile = path.join(backupDirectory, `${sourceDatabase}-${targetDatabase}.bak`);
    const source = identifier(sourceDatabase);
    const target = identifier(targetDatabase);
    const backup = quote(backupFile);

    await pool.request().batch(`BACKUP DATABASE ${source} TO DISK = ${backup} WITH COPY_ONLY, CHECKSUM, INIT`);
    await pool.request().batch(`RESTORE VERIFYONLY FROM DISK = ${backup} WITH CHECKSUM`);
    const fileList = await pool.request().query(`RESTORE FILELISTONLY FROM DISK = ${backup}`);
    const dataDirectory = await resolveServerDirectory(pool, 'InstanceDefaultDataPath', 0);
    const logDirectory = await resolveServerDirectory(pool, 'InstanceDefaultLogPath', 1);
    const moveClauses = (fileList.recordset || []).map((file: any, index: number) => {
        const isLog = String(file.Type || '').toUpperCase() === 'L';
        const extension = isLog ? '.ldf' : (index === 0 ? '.mdf' : `_${index}.ndf`);
        const targetPath = path.join(isLog ? logDirectory : dataDirectory, `${targetDatabase}${extension}`);
        return `MOVE ${quote(String(file.LogicalName))} TO ${quote(targetPath)}`;
    });
    if (moveClauses.length === 0) throw new Error('BACKUP_DRILL_FILELIST_EMPTY');

    restoreStartedAt = Date.now();
    await pool.request().batch(`RESTORE DATABASE ${target} FROM DISK = ${backup} WITH ${moveClauses.join(', ')}, RECOVERY, STATS = 5`);
    restored = true;
    const validation = await pool.request().query(`
        USE ${target};
        SELECT DB_ID() AS database_id, COUNT(*) AS table_count FROM sys.tables;
        SELECT name FROM sys.tables WHERE name IN ('branches', 'users', 'menu_items', 'orders', 'payments', 'audit_logs');
    `);
    const expectedTables = ['branches', 'users', 'menu_items', 'orders', 'payments', 'audit_logs'];
    const restoredTables = new Set((validation.recordsets?.[1] || []).map((row: any) => String(row.name).toLowerCase()));
    const missingTables = expectedTables.filter((table) => !restoredTables.has(table));
    if (!validation.recordset?.[0]?.database_id || Number(validation.recordset[0].table_count) < 1 || missingTables.length > 0) {
        const error: any = new Error('BACKUP_DRILL_RESTORE_VALIDATION_FAILED');
        error.missingTables = missingTables;
        throw error;
    }

    const restoreDurationMs = Date.now() - restoreStartedAt;
    const tableCount = Number(validation.recordset[0].table_count);
    if (tableCount < expectedTables.length) {
        throw new Error('BACKUP_DRILL_RESTORE_VALIDATION_FAILED');
    }

    await pool.request().batch(`USE master; ALTER DATABASE ${target} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${target}`);
    cleanedUp = true;
    process.stdout.write(JSON.stringify({ ok: true, sourceDatabase, targetDatabase, verified: true, restored, cleanedUp, backupFile, tableCount, restoreDurationMs, totalDurationMs: Date.now() - drillStartedAt }));
} catch (error: any) {
    if (restored && pool) {
        try {
            await pool.request().batch(`USE master; IF DB_ID(${quote(targetDatabase)}) IS NOT NULL BEGIN ALTER DATABASE ${identifier(targetDatabase)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${identifier(targetDatabase)}; END`);
        } catch { /* preserve the original drill failure */ }
    }
    process.stderr.write(JSON.stringify({ ok: false, sourceDatabase, targetDatabase, restored, cleanedUp, backupFile, error: String(error?.message || error) }));
    process.exitCode = 1;
} finally {
    await pool?.close().catch(() => undefined);
}
