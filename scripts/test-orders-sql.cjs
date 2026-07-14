const mssql = require('mssql');
const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;',
};

async function test() {
    // Replicate the exact SQL that drizzle-orm would generate for getAllOrders
    const pool = new mssql.ConnectionPool(config);
    await pool.connect();
    
    try {
        // Test 1: Simple SELECT with LIMIT (TOP in SQL Server)
        const r1 = await pool.request()
            .query('SELECT TOP 5 id, order_number, status, created_at FROM orders ORDER BY created_at DESC');
        console.log('Test 1 (simple TOP):', r1.recordset.length, 'rows');
        
        // Test 2: SELECT with specific columns (simulating orderSelect)
        const r2 = await pool.request()
            .query('SELECT TOP 5 id, status, subtotal, discount, tax, delivery_fee, service_charge, total, created_at FROM orders ORDER BY created_at DESC');
        console.log('Test 2 (select columns):', r2.recordset.length, 'rows');
        
        // Test 3: SELECT all columns
        const r3 = await pool.request()
            .query('SELECT TOP 1 * FROM orders');
        console.log('Test 3 (select all):', r3.recordset.length, 'rows');
        const colNames = Object.keys(r3.recordset.columns || {}).join(', ');
        console.log('  Columns:', colNames.substring(0, 200));
        
        console.log('All queries successful!');
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
