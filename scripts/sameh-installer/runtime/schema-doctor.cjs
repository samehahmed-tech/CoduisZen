const fs = require('fs');
const path = require('path');
const mssql = require('mssql/msnodesqlv8');

const root = path.resolve(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)
  .filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const source = fs.readFileSync(path.join(root, 'database', 'schema.ts'), 'utf8');
const sqlTypes = { nvarchar: 'nvarchar(max)', jsonText: 'nvarchar(max)', int: 'int', real: 'real', bit: 'bit', date: 'date', datetime2: 'datetime2' };
const snake = name => name.replace(/[A-Z]/g, char => `_${char.toLowerCase()}`);
const quote = name => `[${name.replace(/]/g, ']]')}]`;

function expectedSchema() {
  const expected = new Map();
  for (const match of source.matchAll(/mssqlTable\((?:'|")([^'"]+)(?:'|")\s*,\s*\{([\s\S]*?)\n\s*\}(?:\s*,|\s*\))/g)) {
    const columns = new Map();
    for (const line of match[2].split(/\r?\n/)) {
      const property = line.match(/^\s*([A-Za-z_$][\w$]*):\s*(nvarchar|int|real|bit|date|datetime2|jsonText)\s*\((.*)$/);
      if (!property) continue;
      const explicit = property[3].match(/^\s*(?:'|")([^'"]+)(?:'|")/);
      columns.set(explicit?.[1] || snake(property[1]), sqlTypes[property[2]]);
    }
    expected.set(match[1], columns);
  }
  return expected;
}

async function repair() {
  const connection = await new mssql.ConnectionPool({ connectionString: env.DATABASE_URL }).connect();
  const transaction = new mssql.Transaction(connection);
  await transaction.begin();
  try {
    const rows = (await new mssql.Request(transaction).query("SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo'")).recordset;
    const actual = new Map();
    for (const row of rows) {
      if (!actual.has(row.TABLE_NAME)) actual.set(row.TABLE_NAME, new Set());
      actual.get(row.TABLE_NAME).add(row.COLUMN_NAME);
    }
    const added = [];
    const missingTables = [];
    for (const [table, columns] of expectedSchema()) {
      if (!actual.has(table)) { missingTables.push(table); continue; }
      for (const [column, type] of columns) {
        if (actual.get(table).has(column)) continue;
        await new mssql.Request(transaction).batch(`ALTER TABLE ${quote(table)} ADD ${quote(column)} ${type} NULL`);
        added.push(`${table}.${column}`);
      }
    }
    if (actual.has('orders')) {
      const dailyOrderNumberMigration = fs.readFileSync(path.join(root, 'database', 'daily-order-number.sql'), 'utf8');
      await new mssql.Request(transaction).batch(dailyOrderNumberMigration);
    }
    await transaction.commit();
    console.log(JSON.stringify({ ok: true, added, missingTables }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    await connection.close();
  }
}

repair().catch(error => { console.error(error.message || error); process.exit(1); });
