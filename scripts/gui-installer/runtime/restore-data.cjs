const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const sqlPath = path.join(root, 'db', 'seed', 'current-data.sql');

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

async function main() {
  if (!fs.existsSync(sqlPath)) {
    console.log('No included data dump found. Skipping data restore.');
    return;
  }
  const env = { ...readEnv(path.join(root, '.env')), ...process.env };
  if (!env.DATABASE_URL || env.DATABASE_URL.includes('CHANGE_ME')) {
    throw new Error('DATABASE_URL missing. Cannot restore included data.');
  }
  const sql = fs.readFileSync(sqlPath, 'utf8').trim();
  if (!sql) {
    console.log('Included data dump is empty. Skipping data restore.');
    return;
  }
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Included data restored.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
