const fs = require('fs');
const mssql = require('mssql');

const connectionString = process.env.SQLSERVER_URL
    || 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;';

const schemaSource = fs.readFileSync('src/db/schema.ts', 'utf8');
const toSnakeCase = (name) => name.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
const sqlTypes = {
    nvarchar: 'nvarchar(max)',
    jsonText: 'nvarchar(max)',
    int: 'int',
    real: 'real',
    bit: 'bit',
    date: 'date',
    datetime2: 'datetime2',
};

const parseExpectedColumns = () => {
    const expected = new Map();
    const tables = schemaSource.matchAll(
        /mssqlTable\((?:'|")([^'"]+)(?:'|")\s*,\s*\{([\s\S]*?)\n\s*\}(?:\s*,|\s*\))/g,
    );

    for (const [, table, body] of tables) {
        const columns = new Map();
        for (const line of body.split(/\r?\n/)) {
            const property = line.match(/^\s*([A-Za-z_$][\w$]*):\s*(nvarchar|int|real|bit|date|datetime2|jsonText)\s*\((.*)$/);
            if (!property) continue;
            const explicitName = property[3].match(/^\s*(?:'|")([^'"]+)(?:'|")/);
            columns.set(explicitName?.[1] || toSnakeCase(property[1]), sqlTypes[property[2]]);
        }
        expected.set(table, columns);
    }
    return expected;
};

const quoteIdentifier = (identifier) => `[${identifier.replace(/]/g, ']]')}]`;

const main = async () => {
    const expected = parseExpectedColumns();
    const pool = await mssql.connect({ connectionString });
    const transaction = new mssql.Transaction(pool);
    await transaction.begin();
    try {
        const query = await new mssql.Request(transaction).query(`
            SELECT TABLE_NAME, COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo'
        `);
        const actual = new Map();
        for (const row of query.recordset) {
            if (!actual.has(row.TABLE_NAME)) actual.set(row.TABLE_NAME, new Set());
            actual.get(row.TABLE_NAME).add(row.COLUMN_NAME);
        }

        const added = [];
        for (const [table, columns] of expected) {
            const actualColumns = actual.get(table);
            if (!actualColumns) continue;
            for (const [column, type] of columns) {
                if (actualColumns.has(column)) continue;
                await new mssql.Request(transaction).batch(
                    `ALTER TABLE ${quoteIdentifier(table)} ADD ${quoteIdentifier(column)} ${type} NULL`,
                );
                added.push(`${table}.${column}`);
            }
        }

        await transaction.commit();
        console.log(JSON.stringify({ addedCount: added.length, added }, null, 2));
    } catch (error) {
        await transaction.rollback();
        throw error;
    } finally {
        await pool.close();
    }
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
