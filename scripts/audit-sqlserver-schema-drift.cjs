const fs = require('fs');
const sql = require('mssql');

const config = {
  connectionString: process.env.SQLSERVER_URL
    || 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;',
};

const schemaText = fs.readFileSync('src/db/schema.ts', 'utf8');

const parseSchemaIdentities = () => {
  const identities = new Set();
  const tableBlocks = schemaText.matchAll(/export const \w+ = mssqlTable\(['"]([^'"]+)['"],\s*\{([\s\S]*?)\n\s*\}(?:,|\))/g);
  for (const [, table, body] of tableBlocks) {
    for (const match of body.matchAll(/\n\s*(\w+):\s*int\((?:['"]([^'"]+)['"])?\)([^,\n]*)/g)) {
      const prop = match[1];
      const column = match[2] || prop.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
      if ((match[3] || '').includes('.identity()')) identities.add(`${table}.${column}`);
    }
  }
  return identities;
};

async function main() {
  const pool = await sql.connect(config);
  const actualRows = (await pool.request().query(`
    SELECT OBJECT_NAME(c.object_id) AS table_name, c.name AS column_name
    FROM sys.columns c
    WHERE OBJECT_SCHEMA_NAME(c.object_id) = 'dbo'
      AND OBJECTPROPERTY(c.object_id, 'IsUserTable') = 1
      AND c.is_identity = 1
    ORDER BY table_name, column_name
  `)).recordset;
  await pool.close();

  const actual = new Set(actualRows.map((row) => `${row.table_name}.${row.column_name}`));
  const schema = parseSchemaIdentities();
  const missingInSchema = [...actual].filter((key) => !schema.has(key)).sort();
  const extraInSchema = [...schema].filter((key) => !actual.has(key)).sort();

  console.log(JSON.stringify({
    actualIdentityColumns: actual.size,
    schemaIdentityColumns: schema.size,
    missingInSchema,
    extraInSchema,
  }, null, 2));

  if (missingInSchema.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
