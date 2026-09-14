import { drizzle } from 'drizzle-orm/node-mssql';
import { and, asc, desc, eq, gte, gt, lte, lt, ne, or, sql } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import * as dotenv from 'dotenv';
import logger from '../utils/logger';
import mssql from 'mssql/msnodesqlv8';

dotenv.config({ path: ['.env.local', '.env'] as any });

const dbLogger = logger.child({ domain: 'database' });

const connectionString = process.env.DATABASE_URL ||
    'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;';

dbLogger.info({ url: connectionString.replace(/Password=[^;]+/, 'Password=***') }, 'Connecting to SQL Server');

const sqlPool = new mssql.ConnectionPool({ connectionString });
let databaseConnectPromise: Promise<void> | null = null;

const connectDatabase = async () => {
    if (sqlPool.connected) return;
    if (!databaseConnectPromise) {
        const attempt = async (triesLeft: number): Promise<void> => {
            try {
                await sqlPool.connect();
                dbLogger.info('SQL Server connection ready');
            } catch (err: any) {
                if (triesLeft > 0) {
                    const backoffMs = 1500 * (3 - triesLeft);
                    dbLogger.warn({ err: err?.message, backoffMs }, 'SQL Server connect failed; retrying with backoff');
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                    return attempt(triesLeft - 1);
                }
                dbLogger.warn({ err: err?.message }, 'SQL Server unavailable; API remains online');
            }
        };
        databaseConnectPromise = attempt(2)
            .finally(() => { databaseConnectPromise = null; });
    }
    await databaseConnectPromise;
};

const isConnectionError = (error: any) => {
    const text = [error?.message, error?.code, error?.originalError?.message, String(error || '')].filter(Boolean).join(' ');
    return /SQL_SERVER_UNAVAILABLE|Connection is closed|Connection lost|ECONNRESET|ECONNREFUSED|ETIMEDOUT|Login timeout|Failed to connect/i.test(text);
};

void connectDatabase();
setInterval(connectDatabase, 10_000).unref();
export const waitForDatabase = async () => {
    await connectDatabase();
    if (!sqlPool.connected) throw new Error('SQL_SERVER_UNAVAILABLE');
};

const createQueryCompat = (baseDb: any) => {
    const operators = { and, asc, desc, eq, gt, gte, lt, lte, ne, or, sql };
    return new Proxy({}, {
        get(_target, tableName: string) {
            const table = (schema as any)[tableName];
            if (!table) return undefined;
            const buildWhere = (where: any) => {
                if (!where) return undefined;
                if (typeof where === 'function') return where(table, operators);
                return where;
            };
            const buildOrderBy = (orderBy: any) => {
                if (!orderBy) return [];
                const value = typeof orderBy === 'function' ? orderBy(table, operators) : orderBy;
                return Array.isArray(value) ? value : [value];
            };
            return {
                findMany: async (config: any = {}) => {
                    let query = baseDb.select();
                    if (config.limit) query = query.top(Number(config.limit));
                    query = query.from(table);
                    const where = buildWhere(config.where);
                    if (where) query = query.where(where);
                    const orderBy = buildOrderBy(config.orderBy);
                    if (orderBy.length) query = query.orderBy(...orderBy);
                    return query;
                },
                findFirst: async (config: any = {}) => {
                    const rows = await (baseDb as any).query[tableName].findMany({ ...config, limit: 1 });
                    return rows[0];
                },
            };
        },
    });
};

const dbInstance = drizzle({ client: sqlPool } as any, { schema });
(dbInstance as any).query = createQueryCompat(dbInstance);

const tableColumnsSymbol = Symbol.for('drizzle:Columns');
const orderSelectedFieldsCompat = (fields: Record<string, any>) =>
    Object.entries(fields).map(([name, field]) => ({ path: [name], field }));

const isSqlServerUniqueViolation = (error: any) => {
    const errorNumber = Number(error?.number ?? error?.originalError?.info?.number);
    return errorNumber === 2601 || errorNumber === 2627;
};

const installLimitCompat = (baseDb: any) => {
    const sample = baseDb.select().from((schema as any).users);
    const prototype = Object.getPrototypeOf(sample);
    const applyTop = function applyTop(this: any, top: number) {
        this.config.top = Number(top);
        return this;
    };
    if (typeof prototype.limit !== 'function') {
        prototype.limit = function limit(top: number) {
            this.config.top = Number(top);
            return this;
        };
    }
    if (typeof prototype.top !== 'function') {
        prototype.top = applyTop;
    }
};

const installReturningCompat = (baseDb: any) => {
    const users = (schema as any).users;
    const insertBuilder = baseDb.insert(users);
    const insertBase = insertBuilder.values({ id: '__compat__', name: '__compat__', email: '__compat__', role: 'USER' });
    const insertBasePrototype = Object.getPrototypeOf(insertBase);
    if (typeof insertBasePrototype.output !== 'function') {
        insertBasePrototype.output = function output(fields?: any) {
            this.config.output = orderSelectedFieldsCompat(fields || this.config.table[tableColumnsSymbol]);
            return this;
        };
    }
    if (typeof insertBasePrototype.onConflictDoNothing !== 'function') {
        insertBasePrototype.onConflictDoNothing = function onConflictDoNothing() {
            const executeInsert = this.execute.bind(this);
            this.execute = async () => {
                try {
                    return await executeInsert();
                } catch (error) {
                    if (isSqlServerUniqueViolation(error)) return [];
                    throw error;
                }
            };
            return this;
        };
    }

    const samples = [
        insertBuilder,
        insertBase,
        baseDb.update(users).set({ updatedAt: new Date() }),
        baseDb.delete(users),
    ];
    for (const sample of samples) {
        const prototype = Object.getPrototypeOf(sample);
        if (typeof prototype.returning !== 'function') {
            prototype.returning = function returning(fields?: any) {
                return fields === undefined ? this.output() : this.output(fields);
            };
        }
    }
};

installLimitCompat(dbInstance);
installReturningCompat(dbInstance);

export const db = dbInstance as typeof dbInstance & { query: any };

export const pool = {
    query: async (text: string, params?: any[]) => {
        const runQuery = async () => {
            await waitForDatabase();
            const rawDb = (db as any).$client;
            const conn = typeof rawDb.$instance === 'function' ? await rawDb.$instance() : rawDb;
            const request = conn.request();
            if (params) {
                params.forEach((parameterValue, index) => {
                    const name = `rf_param_${index}`;
                    if (typeof parameterValue === 'string') {
                        // Explicit Unicode type: without it the native driver can
                        // bind long/odd payloads as VARCHAR, permanently storing
                        // Arabic as ???? in nvarchar columns.
                        const length = parameterValue.length > 4000 ? (mssql as any).MAX : Math.max(parameterValue.length, 1);
                        request.input(name, (mssql as any).NVarChar(length), parameterValue);
                    } else {
                        request.input(name, parameterValue ?? null);
                    }
                });
                const parameterizedText = text.replace(/\$(\d+)/g, (_match, index) => `@rf_param_${Number(index) - 1}`);
                const result = await request.query(parameterizedText);
                return { rows: result.recordset, rowCount: result.rowsAffected?.[0] ?? 0 };
            }
            const result = await request.query(text);
            return { rows: result.recordset, rowCount: result.rowsAffected?.[0] ?? 0 };
        };
        try {
            return await runQuery();
        } catch (error: any) {
            // The pool can go stale mid-flight (SQL Server restart, idle
            // timeout). Reconnect once and retry instead of 500ing the
            // request — this closes most of the transient-error window.
            if (!isConnectionError(error)) throw error;
            dbLogger.warn({ err: error?.message }, 'Query hit a dead connection; reconnecting and retrying once');
            await connectDatabase();
            return await runQuery();
        }
    }
};

export const closeDatabase = async () => {
    try {
        const rawDb = (db as any).$client;
        if (rawDb && typeof rawDb.close === 'function') {
            await rawDb.close();
        }
    } catch (err: any) {
        dbLogger.error({ err: err.message }, 'Error closing database');
    }
};

export { db as default };
