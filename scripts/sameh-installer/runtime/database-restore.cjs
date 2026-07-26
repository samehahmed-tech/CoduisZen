const fs = require('fs');
const path = require('path');
const sql = require('mssql/msnodesqlv8');

const installedRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const root = fs.existsSync(path.join(installedRoot, '.env')) ? installedRoot : repositoryRoot;
const args = process.argv.slice(2);
const value = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || '';
const readEnv = file => Object.fromEntries((fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')
  .split(/\r?\n/)
  .filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const escapeIdentifier = input => String(input).replace(/]/g, ']]');
const escapeLiteral = input => String(input).replace(/'/g, "''");

async function main() {
  const backupFile = path.resolve(value('file'));
  if (!value('file') || !fs.existsSync(backupFile)) throw new Error('A valid --file=<backup.bak> is required');
  if (value('confirm') !== 'RESTORE') throw new Error('Restore refused. Add --confirm=RESTORE after verifying the target and backup file.');

  const env = readEnv(path.join(root, '.env'));
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is missing');
  const database = connectionString.match(/(?:^|;)Database=([^;]+)/i)?.[1]?.trim();
  if (!database) throw new Error('Database name is missing from DATABASE_URL');

  const databaseName = escapeIdentifier(database);
  const backupPath = escapeLiteral(backupFile);
  const masterConnection = connectionString.replace(/Database=[^;]*/i, 'Database=master');
  const pool = await new sql.ConnectionPool({ connectionString: masterConnection }).connect();

  try {
    await pool.request().batch(`RESTORE VERIFYONLY FROM DISK = N'${backupPath}' WITH CHECKSUM`);
    await pool.request().batch(`ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE`);
    try {
      await pool.request().batch(`RESTORE DATABASE [${databaseName}] FROM DISK = N'${backupPath}' WITH REPLACE, RECOVERY`);
    } finally {
      await pool.request().batch(`ALTER DATABASE [${databaseName}] SET MULTI_USER`).catch(() => undefined);
    }
  } finally {
    await pool.close();
  }

  const uploadsBackup = `${backupFile}.uploads`;
  const programData = process.env.ProgramData || process.env.PROGRAMDATA;
  const uploadsDir = programData && path.join(programData, 'Sameh', 'RestoFlow ERP', 'uploads');
  if (uploadsDir && fs.existsSync(uploadsBackup)) {
    const previousUploads = `${uploadsDir}.restore-old-${Date.now()}`;
    fs.mkdirSync(path.dirname(uploadsDir), { recursive: true });
    if (fs.existsSync(uploadsDir)) fs.renameSync(uploadsDir, previousUploads);
    try {
      fs.cpSync(uploadsBackup, uploadsDir, { recursive: true, force: true });
      fs.rmSync(previousUploads, { recursive: true, force: true });
    } catch (error) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
      if (fs.existsSync(previousUploads)) fs.renameSync(previousUploads, uploadsDir);
      throw error;
    }
  }

  process.stdout.write(JSON.stringify({ ok: true, restored: true, database, backupFile, uploadsRestored: fs.existsSync(uploadsBackup) }));
}

main().catch(error => {
  const details = Array.isArray(error?.precedingErrors)
    ? error.precedingErrors.map(item => item?.message).filter(Boolean)
    : [];
  process.stderr.write(JSON.stringify({ ok: false, error: String(error?.message || error), details }));
  process.exitCode = 1;
});
