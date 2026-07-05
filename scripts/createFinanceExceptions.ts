import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS finance_exceptions (
        id TEXT PRIMARY KEY,
        reference TEXT,
        reference_type TEXT,
        payload JSONB,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        resolved_by TEXT,
        resolved_at TIMESTAMP,
        resolution_notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Finance exceptions table created recursively/successfully');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    process.exit(0);
  }
}

main();
