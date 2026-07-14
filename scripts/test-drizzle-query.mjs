import { drizzle } from 'drizzle-orm/node-mssql';
import * as schema from '../src/db/schema.js';
import mssql from 'mssql';
import { desc } from 'drizzle-orm';

const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;',
};

async function test() {
    const pool = new mssql.ConnectionPool(config);
    await pool.connect();
    const db = drizzle(pool, { schema });
    
    try {
        const orderSelect = {
            id: schema.orders.id,
            status: schema.orders.status,
            createdAt: schema.orders.createdAt,
        };
        
        console.log('Running Drizzle query...');
        const result = await db.select(orderSelect)
            .from(schema.orders)
            .orderBy(desc(schema.orders.createdAt))
            .limit(5);
        console.log('Result:', JSON.stringify(result));
    } catch (err) {
        console.error('Error:', err.message);
        console.error('Stack:', err.stack?.substring(0, 300));
    }
    
    await pool.close();
    process.exit(0);
}
test().catch(console.error);
