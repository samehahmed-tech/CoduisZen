import { drizzle } from 'drizzle-orm/node-mssql';
import * as schema from './schema';
import * as dotenv from 'dotenv';
import mssql from 'mssql';

dotenv.config();

const connectionString = process.env.DATABASE_URL ||
    'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;';

const mssqlConfig = {
    connectionString,
    server: '(localdb)\\CoduisZen'
};

export const db = drizzle({ connection: mssqlConfig } as any, { schema });

export const pool = {
    query: async (text: string, params?: any[]) => {
        const conn = await mssql.connect(connectionString);
        const request = conn.request();
        if (params) {
            params.forEach((p, i) => {
                request.input(`p${i}`, p);
            });
            text = text.replace(/\$(\d+)/g, (_, num: string) => `@p${parseInt(num) - 1}`);
        }
        const result = await request.query(text);
        return { rows: result.recordset, rowCount: result.rowsAffected?.[0] ?? 0 } as any;
    }
};

export const getPool = () => pool;

export const getDB = () => db;

export const testConnection = async () => {
    try {
        const result = await pool.query('SELECT 1 AS ok');
        return { success: true, message: 'Connection successful' };
    } catch (error: any) {
        return { success: false, message: error.message || 'Connection failed' };
    }
};

export const closeConnection = async () => {
    try {
        await mssql.close();
    } catch { }
};

export { schema };
export default getDB;
