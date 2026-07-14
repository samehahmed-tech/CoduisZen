const mssql = require('mssql');
const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;',
    server: '(localdb)\\CoduisZen'
};

async function test() {
    const pool = new mssql.ConnectionPool(config);
    await pool.connect();
    
    const result = await pool.request().query(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME LIKE '%driver%' OR TABLE_NAME LIKE '%telemetry%'
    `);
    console.log('Tables:', JSON.stringify(result.recordset));
    
    await pool.close();
}
test().catch(console.error);
