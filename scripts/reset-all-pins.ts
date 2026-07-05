import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://restoflow_user:Coduis@$321@localhost:5432/restoflow_erp';

async function resetAllPins() {
    const pool = new Pool({ connectionString: DATABASE_URL });

    try {
        const newPin = '202626';
        console.log(`Setting PIN to ${newPin} for all users...`);
        const pinHash = await bcrypt.hash(newPin, 10);

        const res = await pool.query(
            `UPDATE users
             SET pin_code_hash = $1,
                 pin_login_enabled = true,
                 updated_at = NOW()`
             , [pinHash]
        );

        console.log(`✅ Successfully updated ${res.rowCount} users with new PIN.`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

resetAllPins();
