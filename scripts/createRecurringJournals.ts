import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS recurring_journals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        frequency TEXT NOT NULL, /* DAILY, WEEKLY, MONTHLY, YEARLY */
        next_run_date TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'ACTIVE', /* ACTIVE, PAUSED */
        payload JSONB NOT NULL,
        last_run_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Recurring journals table created');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    process.exit(0);
  }
}

main();
