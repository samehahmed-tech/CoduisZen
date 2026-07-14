const mssql = require('mssql');

const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;',
    server: '(localdb)\\CoduisZen'
};

async function test() {
    const pool = new mssql.ConnectionPool(config);
    await pool.connect();
    const result = await pool.request().query("SELECT id, email, role, is_active FROM users");
    console.log('Users:', JSON.stringify(result.recordset, null, 2));
    await pool.close();
}
test().catch(console.error);
