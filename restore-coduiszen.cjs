'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createRequire } = require('module');

const args = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const value = args.find((entry) => entry.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3).replace(/^"|"$/g, '') : fallback;
};
const installDir = path.resolve(arg('install-dir', path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Sameh', 'RestoFlow ERP')));
const sourceDir = path.resolve(arg('source-dir', __dirname));
const mdfPath = path.resolve(arg('mdf', path.join(sourceDir, 'CoduisZen.mdf')));
const ldfPath = path.resolve(arg('ldf', path.join(sourceDir, 'CoduisZen_log.ldf')));
const appRequire = createRequire(path.join(installDir, 'package.json'));
const dotenv = appRequire('dotenv');
const sql = appRequire('mssql/msnodesqlv8');

const fail = (message) => { throw new Error(message); };
const cleanIdent = (value) => String(value).replace(/]/g, ']]');
const cleanString = (value) => String(value).replace(/'/g, "''");
const sqlIdent = (value) => `[${cleanIdent(value)}]`;
const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const databaseName = 'CoduisZen';
const candidateName = `CoduisZen_RestoreCandidate_${timestamp}`;

function masterConnection(connectionString) {
  return /(?:^|;)Database=[^;]*/i.test(connectionString)
    ? connectionString.replace(/Database=[^;]*/i, 'Database=master')
    : `${connectionString};Database=master`;
}

async function query(pool, text, params = {}) {
  const request = pool.request();
  for (const [key, value] of Object.entries(params)) request.input(key, value);
  return request.query(text);
}

const managedTasks = [
  'Sameh RestoFlow Supervisor',
  'Sameh System Monitor',
  'Sameh Installer Watchdog',
  'Sameh Print Bridge',
  'RestoFlow Supervisor',
  'RestoFlow Supervisor Logon',
  'RestoflowPrintBridge',
];

function stopRestoFlow() {
  console.log('Stopping RestoFlow tasks and processes...');
  for (const task of managedTasks) spawnSync('schtasks.exe', ['/End', '/TN', task], { windowsHide: true, stdio: 'ignore' });
  const root = installDir.replace(/'/g, "''");
  const command = `$root='${root}'; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like ('*' + $root + '*') -and $_.CommandLine -notlike '*restore-coduiszen.cjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) fail(`Could not stop the installed RestoFlow processes. ${result.stderr || ''}`);
}

function startRestoFlow() {
  console.log('Starting RestoFlow tasks...');
  for (const task of ['Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Print Bridge', 'Sameh Installer Watchdog']) {
    spawnSync('schtasks.exe', ['/Run', '/TN', task], { windowsHide: true, stdio: 'ignore' });
  }
}

async function main() {
  if (!fs.existsSync(mdfPath)) fail(`Missing MDF file: ${mdfPath}`);
  if (!fs.existsSync(ldfPath)) fail(`Missing LDF file: ${ldfPath}`);
  if (path.resolve(mdfPath) === path.resolve(ldfPath)) fail('MDF and LDF must be two different files.');

  dotenv.config({ path: path.join(installDir, '.env') });
  dotenv.config({ path: path.join(installDir, '.env.local'), override: true });
  if (!process.env.DATABASE_URL) fail(`DATABASE_URL was not found in ${path.join(installDir, '.env')}`);

  stopRestoFlow();
  let master;
  let candidateAttached = false;
  let databaseSwapped = false;
  let safeToRestart = true;
  let dataTarget;
  try {
    master = await new sql.ConnectionPool({ connectionString: masterConnection(process.env.DATABASE_URL), requestTimeout: 600000 }).connect();
    const paths = await query(master, `
      SELECT COALESCE(CONVERT(nvarchar(260), SERVERPROPERTY('InstanceDefaultDataPath')), N'C:\\Program Files\\Microsoft SQL Server\\MSSQL\\DATA') AS data_path
    `);
    dataTarget = String(paths.recordset?.[0]?.data_path || '').trim().replace(/[\\/]$/, '');
    if (!dataTarget) fail('Could not determine SQL Server data folder.');
    fs.mkdirSync(dataTarget, { recursive: true });

    const targetMdf = path.join(dataTarget, `${candidateName}.mdf`);
    const targetLdf = path.join(dataTarget, `${candidateName}_log.ldf`);
    fs.copyFileSync(path.resolve(mdfPath), targetMdf);
    fs.copyFileSync(path.resolve(ldfPath), targetLdf);

    const current = await query(master, `SELECT DB_ID(@name) AS id`, { name: databaseName });
    const existingDatabase = Boolean(current.recordset?.[0]?.id);
    const backupDir = path.join(installDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const safetyBackup = path.join(backupDir, `before-restore-${timestamp}.bak`);
    if (existingDatabase) {
      await query(master, `BACKUP DATABASE ${sqlIdent(databaseName)} TO DISK = N'${cleanString(safetyBackup)}' WITH INIT, CHECKSUM`);
    }

    await query(master, `
      IF DB_ID(N'${cleanString(candidateName)}') IS NOT NULL
      BEGIN
        ALTER DATABASE ${sqlIdent(candidateName)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
        DROP DATABASE ${sqlIdent(candidateName)};
      END;
      CREATE DATABASE ${sqlIdent(candidateName)}
      ON (FILENAME = N'${cleanString(targetMdf)}'), (FILENAME = N'${cleanString(targetLdf)}')
      FOR ATTACH;
    `);
    candidateAttached = true;

    const candidateConnection = process.env.DATABASE_URL.replace(/Database=[^;]*/i, `Database=${candidateName}`);
    const candidate = await new sql.ConnectionPool({ connectionString: candidateConnection, requestTimeout: 600000 }).connect();
    try {
      const check = await query(candidate, `
        SELECT DB_NAME() AS database_name,
          CASE WHEN OBJECT_ID(N'dbo.menu_items', N'U') IS NULL THEN 0 ELSE 1 END AS has_menu,
          CASE WHEN OBJECT_ID(N'dbo.inventory_items', N'U') IS NULL THEN 0 ELSE 1 END AS has_inventory,
          CASE WHEN OBJECT_ID(N'dbo.recipes', N'U') IS NULL THEN 0 ELSE 1 END AS has_recipes,
          (SELECT COUNT(*) FROM dbo.menu_items) AS menu_count,
          (SELECT COUNT(*) FROM dbo.inventory_items) AS inventory_count,
          (SELECT COUNT(*) FROM dbo.recipes) AS recipe_count
      `);
      const row = check.recordset?.[0] || {};
      if (Number(row.has_menu) !== 1 || Number(row.has_inventory) !== 1 || Number(row.has_recipes) !== 1) {
        fail('The restored database does not contain the expected RestoFlow tables.');
      }
      console.log(`Candidate database verified: menu=${row.menu_count}, inventory=${row.inventory_count}, recipes=${row.recipe_count}`);
    } finally {
      await candidate.close();
    }

    if (existingDatabase) {
      safeToRestart = false;
      await query(master, `ALTER DATABASE ${sqlIdent(databaseName)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${sqlIdent(databaseName)};`);
    }
    await query(master, `ALTER DATABASE ${sqlIdent(candidateName)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;`);
    await query(master, `ALTER DATABASE ${sqlIdent(candidateName)} MODIFY NAME = ${sqlIdent(databaseName)};`);
    await query(master, `ALTER DATABASE ${sqlIdent(databaseName)} SET MULTI_USER;`);
    databaseSwapped = true;
    await query(master, `
      IF SUSER_ID(N'NT AUTHORITY\\SYSTEM') IS NULL CREATE LOGIN [NT AUTHORITY\\SYSTEM] FROM WINDOWS;
      USE ${sqlIdent(databaseName)};
      IF USER_ID(N'NT AUTHORITY\\SYSTEM') IS NULL CREATE USER [NT AUTHORITY\\SYSTEM] FOR LOGIN [NT AUTHORITY\\SYSTEM];
      IF IS_ROLEMEMBER(N'db_owner', N'NT AUTHORITY\\SYSTEM') = 0 ALTER ROLE [db_owner] ADD MEMBER [NT AUTHORITY\\SYSTEM];
    `);
    candidateAttached = false;
    console.log('Restore completed successfully.');
    if (existingDatabase) console.log(`Safety backup of the new database: ${safetyBackup}`);
    console.log(`Restored files copied to: ${dataTarget}`);
  } catch (error) {
    if (candidateAttached) {
      try { await query(master, `ALTER DATABASE ${sqlIdent(candidateName)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${sqlIdent(candidateName)};`); } catch {}
    }
    throw error;
  } finally {
    if (master) await master.close();
    if (safeToRestart || databaseSwapped) startRestoFlow();
  }
}

main().catch((error) => {
  console.error(`RESTORE FAILED: ${error.stack || error.message || error}`);
  process.exitCode = 1;
});
