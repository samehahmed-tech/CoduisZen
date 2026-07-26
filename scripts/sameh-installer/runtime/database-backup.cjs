const fs = require('fs');
const path = require('path');
const sql = require('mssql/msnodesqlv8');

const installedRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const root = fs.existsSync(path.join(installedRoot, '.env')) ? installedRoot : repositoryRoot;
const readEnv = file => Object.fromEntries((fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')
  .split(/\r?\n/)
  .filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const escapeIdentifier = value => String(value).replace(/]/g, ']]');
const escapeLiteral = value => String(value).replace(/'/g, "''");

async function main() {
  const env = readEnv(path.join(root, '.env'));
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is missing');

  const database = connectionString.match(/(?:^|;)Database=([^;]+)/i)?.[1]?.trim();
  if (!database) throw new Error('Database name is missing from DATABASE_URL');

  const backupDir = path.join(root, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `${database}-${timestamp}.bak`);
  const masterConnection = connectionString.replace(/Database=[^;]*/i, 'Database=master');
  const pool = await new sql.ConnectionPool({ connectionString: masterConnection }).connect();

  try {
    const databaseName = escapeIdentifier(database);
    const backupPath = escapeLiteral(backupFile);
    await pool.request().batch(`BACKUP DATABASE [${databaseName}] TO DISK = N'${backupPath}' WITH COPY_ONLY, CHECKSUM, INIT`);
    await pool.request().batch(`RESTORE VERIFYONLY FROM DISK = N'${backupPath}' WITH CHECKSUM`);
  } finally {
    await pool.close();
  }

  const bytes = fs.statSync(backupFile).size;
  const programData = process.env.ProgramData || process.env.PROGRAMDATA;
  const uploadsDir = programData && path.join(programData, 'Sameh', 'RestoFlow ERP', 'uploads');
  let uploadsBackup;
  if (uploadsDir && fs.existsSync(uploadsDir)) {
    uploadsBackup = `${backupFile}.uploads`;
    fs.cpSync(uploadsDir, uploadsBackup, { recursive: true, force: true });
  }

  process.stdout.write(JSON.stringify({ ok: true, verified: true, database, backupFile, bytes, uploadsBackup }));
}

main().catch(error => {
  const details = Array.isArray(error?.precedingErrors)
    ? error.precedingErrors.map(item => item?.message).filter(Boolean)
    : [];
  process.stderr.write(JSON.stringify({ ok: false, error: String(error?.message || error), details }));
  process.exitCode = 1;
});
