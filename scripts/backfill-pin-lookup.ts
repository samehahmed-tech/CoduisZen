import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { closeDatabase, pool } from '../server/db';

dotenv.config({ path: ['.env.local', '.env'] as any });

const secret = process.env.PIN_LOOKUP_SECRET || process.env.JWT_SECRET;
if (!secret) throw new Error('PIN_LOOKUP_SECRET or JWT_SECRET is required');

const buildPinLookupHash = (pin: string) => crypto
    .createHmac('sha256', secret)
    .update(pin, 'utf8')
    .digest('hex');

async function main() {
    const schemaSql = "IF COL_LENGTH('users', 'pin_lookup_hash') IS NULL ALTER TABLE users ADD pin_lookup_hash nvarchar(64) NULL; IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'users_pin_lookup_idx' AND object_id = OBJECT_ID('users')) CREATE INDEX users_pin_lookup_idx ON users(pin_lookup_hash);";
    await pool.query(schemaSql);
    const result = await pool.query("SELECT id, pin_code, pin_code_hash FROM users WHERE pin_code IS NOT NULL AND pin_lookup_hash IS NULL;");
    let migrated = 0;
    for (const row of result.rows || []) {
        const pin = String(row.pin_code || '');
        if (!/^\d{6}$/.test(pin)) continue;
        const pinHash = row.pin_code_hash || await bcrypt.hash(pin, 10);
        await pool.query('UPDATE users SET pin_lookup_hash = $1, pin_code_hash = $2, pin_login_enabled = 1, pin_code = NULL WHERE id = $3', [buildPinLookupHash(pin), pinHash, row.id]);
        migrated++;
    }
    console.log(`[pin-lookup] schema ready; migrated ${migrated} legacy users`);
}

main().catch((error) => {
    console.error('[pin-lookup] migration failed', error);
    process.exitCode = 1;
}).finally(() => closeDatabase());
