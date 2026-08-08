import { drizzle } from 'drizzle-orm/node-mssql';
import mssql from 'mssql/msnodesqlv8.js';
import * as schema from './src/db/schema.js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local','.env'] });

// use compiled schema to avoid ts-node issues
const conn = new mssql.ConnectionPool({ connectionString: process.env.DATABASE_URL });
await conn.connect();
const db = drizzle({ client: conn }, { schema, logger: true });
try {
  const rows = await db.insert(schema.jobTitles).values({
    id: 'JOB-TEST123',
    title: 'TEST TITLE',
    name: 'TEST TITLE',
    nameAr: 'اسم اختبار',
    departmentId: null,
    isActive: true,
  }).output();
  console.log('INSERT OK', rows);
} catch(e) {
  console.log('INSERT FAIL', e.originalError?.message || e.message);
}
await conn.close();
