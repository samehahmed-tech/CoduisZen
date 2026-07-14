const mssql = require('mssql');
const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;',
};

async function test() {
    const pool = new mssql.ConnectionPool(config);
    await pool.connect();
    
    // Test various drizzle query patterns by looking at what methods are
    // available on the drizzle query builder
    
    // Since we can't import the drizzle schema directly, let's use the built
    // server to inspect the drizzle query builder chain
    
    try {
        // Test simple SQL
        const r = await pool.request()
            .query('SELECT TOP 1 id FROM orders');
        console.log('Simple SQL works:', r.recordset.length > 0);
        
        // Now test raw LIMIT with ORDER BY
        const r2 = await pool.request()
            .query('SELECT TOP 5 * FROM orders ORDER BY created_at DESC');
        console.log('SELECT TOP 5 with ORDER BY:', r2.recordset.length, 'rows');
        
        // Test SELECT with WHERE, TOP, ORDER BY
        const r3 = await pool.request()
            .query(`SELECT TOP 5 * FROM orders WHERE status = 'ACTIVE' ORDER BY created_at DESC`);
        console.log('SELECT TOP 5 WHERE...ORDER BY:', r3.recordset.length, 'rows');
        
        console.log('\nAll SQL patterns work fine!');
        console.log('\nThe issue must be in how drizzle-orm mssql-core');
        console.log('builds the query chain at runtime.');
    } catch (err) {
        console.error('Error:', err.message);
    }
    
    await pool.close();
    process.exit(0);
}

test().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
