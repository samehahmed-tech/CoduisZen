import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { pool } from '../server/db';
import { validatePassword } from '../server/services/passwordPolicyService';

dotenv.config();

async function resetAdmin() {
    const email = String(process.env.ADMIN_RESET_EMAIL || '').trim().toLowerCase();
    const password = String(process.env.ADMIN_RESET_PASSWORD || '');
    const pin = String(process.env.ADMIN_RESET_PIN || '');

    if (process.env.ADMIN_RESET_CONFIRM !== 'RESET') {
        throw new Error('Set ADMIN_RESET_CONFIRM=RESET to authorize this operation.');
    }
    if (!email) throw new Error('ADMIN_RESET_EMAIL is required.');

    const passwordResult = validatePassword(password);
    if (!passwordResult.valid) throw new Error(`Password policy failed: ${passwordResult.errors.join('; ')}`);
    if (pin && !/^\d{6}$/.test(pin)) throw new Error('ADMIN_RESET_PIN must contain exactly 6 digits.');

    const passwordHash = await bcrypt.hash(password, 12);
    const pinHash = pin ? await bcrypt.hash(pin, 12) : null;
    const { rows } = await pool.query(
        `UPDATE users
         SET password_hash = $1,
             pin_code_hash = CASE WHEN $2 IS NULL THEN pin_code_hash ELSE $2 END,
             pin_login_enabled = CASE WHEN $2 IS NULL THEN pin_login_enabled ELSE 1 END,
             updated_at = GETDATE()
         OUTPUT inserted.id
         WHERE lower(email) = $3 AND role = 'SUPER_ADMIN'`,
        [passwordHash, pinHash, email],
    );

    if (rows.length !== 1) throw new Error('Exactly one SUPER_ADMIN with ADMIN_RESET_EMAIL was not found.');
    console.log('Administrator credentials reset successfully.');
}

resetAdmin().catch(error => {
    console.error(`Admin reset failed: ${error.message}`);
    process.exitCode = 1;
});
