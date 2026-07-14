import { drizzle } from 'drizzle-orm/node-mssql';
import * as schema from '../src/db/schema.ts';
import mssql from 'mssql';
import { and, eq, gt } from 'drizzle-orm';

const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;',
};

async function test() {
    const pool = new mssql.ConnectionPool(config);
    await pool.connect();
    const db = drizzle(pool, { schema });
    
    try {
        console.log('1. Fetching latest session directly using SQL:');
        const sqlRes = await pool.request().query('SELECT TOP 1 id, user_id, token_id, is_active, expires_at FROM user_sessions ORDER BY created_at DESC');
        if (!sqlRes.recordset.length) {
            console.log('No sessions found in database.');
            await pool.close();
            return;
        }
        const s = sqlRes.recordset[0];
        console.log('Session from raw SQL:', JSON.stringify(s));

        console.log('\n2. Querying the same session using Drizzle without expiry check:');
        const [drizzleSessionNoExpiry] = await db.select().from(schema.userSessions).where(and(
            eq(schema.userSessions.id, s.id),
            eq(schema.userSessions.userId, s.user_id),
            eq(schema.userSessions.tokenId, s.token_id),
            eq(schema.userSessions.isActive, true),
        ));
        console.log('Drizzle without expiry result:', JSON.stringify(drizzleSessionNoExpiry));

        console.log('\n3. Querying using Drizzle WITH gt(expiresAt, new Date()):');
        const now = new Date();
        console.log('JS Date object:', now.toISOString());
        
        const [drizzleSessionWithExpiry] = await db.select().from(schema.userSessions).where(and(
            eq(schema.userSessions.id, s.id),
            eq(schema.userSessions.userId, s.user_id),
            eq(schema.userSessions.tokenId, s.token_id),
            eq(schema.userSessions.isActive, true),
            gt(schema.userSessions.expiresAt, now),
        ));
        console.log('Drizzle WITH expiry result:', JSON.stringify(drizzleSessionWithExpiry));
        
        if (!drizzleSessionWithExpiry) {
            console.log('\n❌ EXPIRED! The session is considered expired by Drizzle query.');
            console.log('Reason: timezone/date comparison mismatch in SQL Server.');
            
            // Let's test with a direct date formatting or offset
            console.log('\n4. Testing with SQL Server GETUTCDATE() fallback:');
            // We can check if we can query using a raw SQL condition or check if the date conversion is causing it.
        } else {
            console.log('\n✅ Drizzle with expiry succeeded!');
        }

    } catch (err) {
        console.error('Error:', err.message);
    }
    
    await pool.close();
    process.exit(0);
}
test().catch(console.error);
