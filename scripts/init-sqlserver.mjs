import sql from 'mssql';

const config = {
  server: '(localdb)',
  options: {
    instanceName: 'CoduisZen',
    trustedConnection: true,
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function main() {
  try {
    const pool = new sql.ConnectionPool({ ...config, database: 'master' });
    await pool.connect();
    console.log('Connected to SQL Server LocalDB');

    const result = await pool
      .request()
      .query(`IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'CoduisZen') CREATE DATABASE CoduisZen`);
    console.log('Database result:', result.rowsAffected);
    await pool.close();

    const pool2 = new sql.ConnectionPool({ ...config, database: 'CoduisZen' });
    await pool2.connect();
    const verify = await pool2.request().query('SELECT DB_NAME() AS db');
    console.log('Connected to:', verify.recordset[0].db);
    await pool2.close();

    console.log('SUCCESS: CoduisZen database is ready!');
  } catch (err) {
    console.error('ERROR:', err);
  }
}
main();
