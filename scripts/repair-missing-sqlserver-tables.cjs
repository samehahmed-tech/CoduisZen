const fs = require('fs');

const connectionString = process.env.SQLSERVER_URL
    || 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;';
const mssql = connectionString.includes('Driver=')
    ? require('mssql/msnodesqlv8')
    : require('mssql');

const schemaSource = fs.readFileSync('src/db/schema.ts', 'utf8');
const sqlSource = fs.readFileSync('scripts/sql-server-schema.sql', 'utf8');

const expectedTables = new Set(
    [...schemaSource.matchAll(/mssqlTable\((?:'|")([^'"]+)/g)].map((match) => match[1]),
);

const createStatements = new Map(
    [...sqlSource.matchAll(/CREATE TABLE\s+\[?([\w]+)\]?\s*\([\s\S]*?\n\);/gi)]
        .map((match) => [match[1], match[0]]),
);

const loadActualTables = async (pool) => {
    const rows = await pool.request().query(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE'
    `);
    return new Set(rows.recordset.map((row) => row.TABLE_NAME));
};

const createMissingTables = async (pool, missingTables) => {
    const pending = new Set(missingTables);
    const failures = new Map();

    while (pending.size) {
        let createdThisPass = 0;
        for (const table of [...pending]) {
            const statement = createStatements.get(table);
            if (!statement) continue;
            try {
                await pool.request().batch(statement);
                pending.delete(table);
                failures.delete(table);
                createdThisPass += 1;
            } catch (error) {
                failures.set(table, error.message);
            }
        }
        if (!createdThisPass) break;
    }

    return { pending, failures };
};

const main = async () => {
    const pool = await mssql.connect({ connectionString });
    try {
        const actualTables = await loadActualTables(pool);
        const missingTables = [...expectedTables].filter((table) => !actualTables.has(table));
        const { pending, failures } = await createMissingTables(pool, missingTables);
        const missingDefinitions = [...pending].filter((table) => !createStatements.has(table));
        const blockedTables = [...pending]
            .filter((table) => createStatements.has(table))
            .map((table) => ({ table, error: failures.get(table) }));

        console.log(JSON.stringify({
            expected: expectedTables.size,
            existed: actualTables.size,
            created: missingTables.length - pending.size,
            missingDefinitions,
            blockedTables,
        }, null, 2));

        if (pending.size) process.exitCode = 1;
    } finally {
        await pool.close();
    }
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
