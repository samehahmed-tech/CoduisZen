/**
 * Database Maintenance Service (Sprint 4 - Item 54)
 * 
 * Provides:
 * - Connection pool stats (total, idle, waiting)
 * - Table bloat estimates
 * - Slow query detection (> 500ms)
 * - Manual VACUUM ANALYZE trigger
 * - Index usage stats
 */

import { pool } from '../db';
import logger from '../utils/logger';

const log = logger.child({ service: 'db-maintenance' });

export interface PoolStats {
    totalConnections: number;
    idleConnections: number;
    waitingClients: number;
}

export interface TableBloat {
    tableName: string;
    estimatedRows: number;
    deadTuples: number;
    lastVacuum: string | null;
    lastAnalyze: string | null;
}

export interface SlowQuery {
    query: string;
    calls: number;
    meanTimeMs: number;
    totalTimeMs: number;
}

export interface IndexUsage {
    indexName: string;
    tableName: string;
    indexScans: number;
    indexSize: string;
}

export const dbMaintenanceService = {
    /**
     * Get connection pool statistics.
     */
    getPoolStats(): PoolStats {
        return {
            totalConnections: pool.totalCount,
            idleConnections: pool.idleCount,
            waitingClients: pool.waitingCount,
        };
    },

    /**
     * Get table bloat estimates from pg_stat_user_tables.
     */
    async getTableBloat(): Promise<TableBloat[]> {
        try {
            const result = await pool.query(`
                SELECT 
                    relname as table_name,
                    n_live_tup as estimated_rows,
                    n_dead_tup as dead_tuples,
                    last_vacuum::text,
                    last_analyze::text
                FROM pg_stat_user_tables
                WHERE schemaname = 'public'
                ORDER BY n_dead_tup DESC
                LIMIT 30
            `);

            return result.rows.map((r: any) => ({
                tableName: r.table_name,
                estimatedRows: Number(r.estimated_rows || 0),
                deadTuples: Number(r.dead_tuples || 0),
                lastVacuum: r.last_vacuum || null,
                lastAnalyze: r.last_analyze || null,
            }));
        } catch (err: any) {
            log.error({ err: err.message }, 'Failed to get table bloat');
            return [];
        }
    },

    /**
     * Get slow queries from pg_stat_statements (requires extension).
     * Falls back gracefully if the extension is not installed.
     */
    async getSlowQueries(thresholdMs = 500): Promise<SlowQuery[]> {
        try {
            const result = await pool.query(`
                SELECT 
                    query,
                    calls,
                    ROUND(mean_exec_time::numeric, 2) as mean_time_ms,
                    ROUND(total_exec_time::numeric, 2) as total_time_ms
                FROM pg_stat_statements
                WHERE mean_exec_time > $1
                  AND query NOT LIKE '%pg_stat%'
                ORDER BY mean_exec_time DESC
                LIMIT 20
            `, [thresholdMs]);

            return result.rows.map((r: any) => ({
                query: r.query?.substring(0, 200),
                calls: Number(r.calls),
                meanTimeMs: Number(r.mean_time_ms),
                totalTimeMs: Number(r.total_time_ms),
            }));
        } catch (err: any) {
            // pg_stat_statements extension may not be installed
            if (err.message?.includes('does not exist')) {
                log.info('pg_stat_statements extension not available — slow query tracking disabled');
                return [];
            }
            log.error({ err: err.message }, 'Failed to get slow queries');
            return [];
        }
    },

    /**
     * Get unused or rarely used indexes.
     */
    async getIndexUsage(): Promise<IndexUsage[]> {
        try {
            const result = await pool.query(`
                SELECT 
                    indexrelname as index_name,
                    relname as table_name,
                    idx_scan as index_scans,
                    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
                FROM pg_stat_user_indexes
                WHERE schemaname = 'public'
                ORDER BY idx_scan ASC
                LIMIT 30
            `);

            return result.rows.map((r: any) => ({
                indexName: r.index_name,
                tableName: r.table_name,
                indexScans: Number(r.index_scans),
                indexSize: r.index_size,
            }));
        } catch (err: any) {
            log.error({ err: err.message }, 'Failed to get index usage');
            return [];
        }
    },

    /**
     * Run VACUUM ANALYZE on a specific table or all tables.
     * NOTE: Requires appropriate DB permissions.
     */
    async vacuumAnalyze(tableName?: string): Promise<{ success: boolean; error?: string }> {
        try {
            const target = tableName ? `"${tableName.replace(/"/g, '')}"` : '';
            await pool.query(`VACUUM ANALYZE ${target}`);
            log.info({ tableName: tableName || 'ALL' }, 'VACUUM ANALYZE completed');
            return { success: true };
        } catch (err: any) {
            log.error({ err: err.message, tableName }, 'VACUUM ANALYZE failed');
            return { success: false, error: err.message };
        }
    },

    /**
     * Get a comprehensive DB health report.
     */
    async getHealthReport() {
        const [poolStats, tableBloat, slowQueries, indexUsage] = await Promise.all([
            this.getPoolStats(),
            this.getTableBloat(),
            this.getSlowQueries(),
            this.getIndexUsage(),
        ]);

        const highBloatTables = tableBloat.filter(t => t.deadTuples > 1000);
        const unusedIndexes = indexUsage.filter(i => i.indexScans === 0);

        return {
            timestamp: new Date().toISOString(),
            pool: poolStats,
            alerts: {
                highBloat: highBloatTables.length > 0,
                highBloatTables: highBloatTables.map(t => t.tableName),
                slowQueriesDetected: slowQueries.length > 0,
                unusedIndexes: unusedIndexes.length > 0,
                unusedIndexCount: unusedIndexes.length,
                poolExhausted: poolStats.waitingClients > 0,
            },
            tableBloat,
            slowQueries,
            indexUsage,
        };
    },
};

export default dbMaintenanceService;
