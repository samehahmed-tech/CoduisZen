import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../src/db/schema';
import * as dotenv from 'dotenv';
import logger from '../utils/logger';

dotenv.config({ path: ['.env.local', '.env'] as any });

const { Pool } = pg;
const dbLogger = logger.child({ domain: 'database' });

// Production-tuned connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Pool sizing
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // Statement timeout (prevent runaway queries)
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
    // Keep-alive
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
});

// Pool event logging
pool.on('error', (err) => {
    dbLogger.error({ err: err.message }, 'Database pool error (idle client)');
});

pool.on('connect', () => {
    dbLogger.debug('New database connection established');
});

// Monitor pool health
let lastHealthLog = 0;
const HEALTH_INTERVAL = 60000; // 1 minute

export const getPoolStats = () => ({
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
});

const poolHealthInterval = setInterval(() => {
    const stats = getPoolStats();
    if (Date.now() - lastHealthLog > HEALTH_INTERVAL) {
        dbLogger.info(stats, 'Database pool health');
        lastHealthLog = Date.now();
    }
    // Alert if pool is under pressure
    if (stats.waitingCount > 5) {
        dbLogger.warn(stats, 'Database pool under pressure — queries are waiting');
    }
}, 15000);

if (typeof poolHealthInterval.unref === 'function') {
    poolHealthInterval.unref();
}

export const closeDatabase = async () => {
    clearInterval(poolHealthInterval);
    await pool.end();
};

export const db = drizzle(pool, { schema });
export { pool };
