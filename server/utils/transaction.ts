// Transaction helper using Drizzle ORM
import { db } from '../db';

/**
 * Executes a callback within a database transaction.
 * The callback receives the transaction object to perform queries.
 * If the callback throws, the transaction is rolled back.
 */
export async function runInTransaction<T>(callback: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => callback(tx));
}
