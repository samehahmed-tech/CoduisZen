const mssql = require('mssql');

const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;',
    server: '(localdb)\\CoduisZen'
};

async function test() {
    const pool = new mssql.ConnectionPool(config);
    await pool.connect();
    
    try {
        const result = await pool.request().query(`
            SELECT FORMAT(created_at, 'HH') + ':00' AS name,
                   COALESCE(SUM(total), 0) AS revenue
            FROM orders
            WHERE created_at >= '2026-07-01' AND created_at <= '2026-07-09'
            GROUP BY FORMAT(created_at, 'HH') + ':00'
            ORDER BY FORMAT(created_at, 'HH') + ':00' ASC
        `);
        console.log('Query succeeded, rows:', result.recordset.length);
        console.log('Sample:', JSON.stringify(result.recordset.slice(0, 3)));
    } catch (err) {
        console.error('Query error:', err.message);
    }
    
    await pool.close();
}
test().catch(console.error);
