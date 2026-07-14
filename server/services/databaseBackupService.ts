import fs from 'fs';
import path from 'path';
import sql from 'mssql/msnodesqlv8';

const escapeIdentifier = (value: string) => value.replace(/]/g, ']]');
const escapeLiteral = (value: string) => value.replace(/'/g, "''");

export type DatabaseBackupResult = {
    filename: string;
    filePath: string;
    bytes: number;
    verified: true;
    timestamp: string;
};

export async function createVerifiedDatabaseBackup(): Promise<DatabaseBackupResult> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL not configured');

    const database = connectionString.match(/(?:^|;)Database=([^;]+)/i)?.[1]?.trim();
    if (!database) throw new Error('Database name is missing from DATABASE_URL');

    const backupDir = process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString();
    const filename = `${database}-${timestamp.replace(/[:.]/g, '-')}.bak`;
    const filePath = path.join(backupDir, filename);
    const masterConnection = connectionString.replace(/Database=[^;]*/i, 'Database=master');
    const pool = await new sql.ConnectionPool({ connectionString: masterConnection }).connect();

    try {
        const databaseName = escapeIdentifier(database);
        const backupPath = escapeLiteral(filePath);
        await pool.request().batch(
            `BACKUP DATABASE [${databaseName}] TO DISK = N'${backupPath}' WITH COPY_ONLY, CHECKSUM, INIT`,
        );
        await pool.request().batch(`RESTORE VERIFYONLY FROM DISK = N'${backupPath}' WITH CHECKSUM`);
    } catch (error) {
        fs.rmSync(filePath, { force: true });
        throw error;
    } finally {
        await pool.close();
    }

    return {
        filename,
        filePath,
        bytes: fs.statSync(filePath).size,
        verified: true,
        timestamp,
    };
}

export function getDatabaseBackupDirectory() {
    return process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');
}
