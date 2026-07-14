const sql = require('mssql');

const config = {
  connectionString: process.env.SQLSERVER_URL
    || 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;',
};

const quote = (name) => `[${String(name).replace(/]/g, ']]')}]`;

async function main() {
  const pool = await sql.connect(config);
  const fks = (await pool.request().query(`
    SELECT
      fk.name AS fk_name,
      OBJECT_SCHEMA_NAME(fk.parent_object_id) AS child_schema,
      OBJECT_NAME(fk.parent_object_id) AS child_table,
      pc.name AS child_column,
      OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS parent_schema,
      OBJECT_NAME(fk.referenced_object_id) AS parent_table,
      rc.name AS parent_column,
      fk.delete_referential_action_desc AS delete_action
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
    JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
    ORDER BY parent_table, child_table, fk.name
  `)).recordset;

  const blockers = [];
  const orphans = [];

  for (const fk of fks) {
    const child = `${quote(fk.child_schema)}.${quote(fk.child_table)}`;
    const parent = `${quote(fk.parent_schema)}.${quote(fk.parent_table)}`;
    const childCol = quote(fk.child_column);
    const parentCol = quote(fk.parent_column);

    const childRows = (await pool.request().query(
      `SELECT COUNT_BIG(*) AS count FROM ${child} WHERE ${childCol} IS NOT NULL`,
    )).recordset[0].count;

    if (fk.delete_action === 'NO_ACTION' && Number(childRows) > 0) {
      blockers.push({ ...fk, child_rows: Number(childRows) });
    }

    const orphanCount = (await pool.request().query(`
      SELECT COUNT_BIG(*) AS count
      FROM ${child} c
      LEFT JOIN ${parent} p ON c.${childCol} = p.${parentCol}
      WHERE c.${childCol} IS NOT NULL AND p.${parentCol} IS NULL
    `)).recordset[0].count;

    if (Number(orphanCount) > 0) {
      orphans.push({ ...fk, orphan_rows: Number(orphanCount) });
    }
  }

  console.log(JSON.stringify({
    checkedForeignKeys: fks.length,
    noActionDeleteBlockers: blockers,
    orphanViolations: orphans,
  }, null, 2));

  await pool.close();
  if (orphans.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
