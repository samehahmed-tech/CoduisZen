const mssql = require('mssql');
const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;',
    server: '(localdb)\\CoduisZen'
};

async function test() {
    const pool = new mssql.ConnectionPool(config);
    await pool.connect();

    try {
        // Test a simple select with all columns from orders
        const result = await pool.request().query('SELECT * FROM orders WHERE 1=0');
        console.log('Query OK, columns:', result.recordset.columns ? Object.keys(result.recordset.columns).length : 'unknown');
        console.log('Row count:', result.recordset.length);

        // Test a simple select with order by and limit
        const result2 = await pool.request().query('SELECT TOP 5 id, order_number, status, created_at FROM orders ORDER BY created_at DESC');
        console.log('Orders query OK, rows:', result2.recordset.length);
        if (result2.recordset.length > 0) {
            console.log('First order:', JSON.stringify(result2.recordset[0]));
        }
    } catch (err) {
        console.error('Query error:', err.message);
    }

    await pool.close();
}
test().catch(console.error);
