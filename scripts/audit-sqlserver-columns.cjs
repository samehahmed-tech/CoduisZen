const fs = require('fs');
const mssql = require('mssql');

const connectionString = process.env.SQLSERVER_URL
    || 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;';

const schemaSource = fs.readFileSync('src/db/schema.ts', 'utf8');
const toSnakeCase = (name) => name.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

const parseExpectedColumns = () => {
    const expected = new Map();
    const tables = schemaSource.matchAll(
        /mssqlTable\((?:'|")([^'"]+)(?:'|")\s*,\s*\{([\s\S]*?)\n\s*\}(?:\s*,|\s*\))/g,
    );

    for (const [, table, body] of tables) {
        const columns = new Set();
        for (const line of body.split(/\r?\n/)) {
            const property = line.match(/^\s*([A-Za-z_$][\w$]*):\s*(?:nvarchar|int|real|bit|date|datetime2|jsonText)\s*\((.*)$/);
            if (!property) continue;
            const explicitName = property[2].match(/^\s*(?:'|")([^'"]+)(?:'|")/);
            columns.add(explicitName?.[1] || toSnakeCase(property[1]));
        }
        expected.set(table, columns);
    }
    return expected;
};

const main = async () => {
    const expected = parseExpectedColumns();
    const pool = await mssql.connect({ connectionString });
    try {
        const query = await pool.request().query(`
            SELECT TABLE_NAME, COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo'
        `);
        const actual = new Map();
        for (const row of query.recordset) {
            if (!actual.has(row.TABLE_NAME)) actual.set(row.TABLE_NAME, new Set());
            actual.get(row.TABLE_NAME).add(row.COLUMN_NAME);
        }

        const missing = [];
        const extra = [];
        for (const [table, columns] of expected) {
            const actualColumns = actual.get(table) || new Set();
            for (const column of columns) if (!actualColumns.has(column)) missing.push(`${table}.${column}`);
            for (const column of actualColumns) if (!columns.has(column)) extra.push(`${table}.${column}`);
        }

        console.log(JSON.stringify({
            expectedTables: expected.size,
            actualTables: actual.size,
            missing,
            extra,
        }, null, 2));
        if (missing.length) process.exitCode = 1;
    } finally {
        await pool.close();
    }
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
