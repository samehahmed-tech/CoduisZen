// Database Connection Manager
// Supports PostgreSQL (production) and SQLite (local/offline)

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ============================================================================
// Database Configuration Types
// ============================================================================

export interface DBConfig {
    type: 'sqlite' | 'postgresql';
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    connectionString?: string;
}

// ============================================================================
// Configuration from Environment
// ============================================================================

export const getDBConfig = (): DBConfig => {
    return {
        type: (process.env.DB_TYPE as 'sqlite' | 'postgresql') || 'postgresql',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'restoflow_erp',
        user: process.env.DB_USER || 'restoflow_user',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true',
        connectionString: process.env.DATABASE_URL,
    };
};

// ============================================================================
// PostgreSQL Connection Pool
// ============================================================================

let pool: Pool | null = null;

export const createPool = (config?: Partial<DBConfig>): Pool => {
    const dbConfig = { ...getDBConfig(), ...config };

    const poolConfig: PoolConfig = dbConfig.connectionString
        ? { connectionString: dbConfig.connectionString }
        : {
            host: dbConfig.host,
            port: dbConfig.port,
            database: dbConfig.database,
            user: dbConfig.user,
            password: dbConfig.password,
            ssl: dbConfig.ssl ? { rejectUnauthorized: false } : undefined,
            // Connection pool settings
            max: 20, // Maximum number of clients
            idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
            connectionTimeoutMillis: 5000, // Return error after 5 seconds if can't connect
        };

    pool = new Pool(poolConfig);

    // Error handling
    pool.on('error', () => undefined);

    return pool;
};

export const getPool = (): Pool => {
    if (!pool) {
        pool = createPool();
    }
    return pool;
};

// ============================================================================
// Drizzle ORM Instance
// ============================================================================

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export const getDB = () => {
    if (!db) {
        db = drizzle(getPool(), { schema });
    }
    return db;
};

// ============================================================================
// Connection Testing
// ============================================================================

export const testConnection = async (config?: Partial<DBConfig>): Promise<{
    success: boolean;
    message: string;
    version?: string;
}> => {
    try {
        const testPool = config ? createPool(config) : getPool();
        const result = await testPool.query('SELECT version()');
        const version = result.rows[0]?.version;

        return {
            success: true,
            message: 'Connection successful',
            version: version?.split(' ').slice(0, 2).join(' '),
        };
    } catch (error: any) {
        return {
            success: false,
            message: error.message || 'Connection failed',
        };
    }
};

// ============================================================================
// Graceful Shutdown
// ============================================================================

export const closeConnection = async (): Promise<void> => {
    if (pool) {
        await pool.end();
        pool = null;
        db = null;
    }
};

// Handle process termination
process.on('SIGINT', async () => {
    await closeConnection();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closeConnection();
    process.exit(0);
});

// ============================================================================
// Export Default
// ============================================================================

export { schema };
export default getDB;
