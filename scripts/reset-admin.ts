/**
 * Admin Password Reset + PIN Setup Script
 * Run with: npx tsx scripts/reset-admin.ts
 */

import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restoflow';

async function resetAdmin() {
    const pool = new Pool({ connectionString: DATABASE_URL });

    try {
        // New password that meets complexity: Admin@2026
        const newPassword = 'Admin@2026';
        const newPin = '202626';

        const passwordHash = await bcrypt.hash(newPassword, 10);
        const pinHash = await bcrypt.hash(newPin, 10);

        // Find SUPER_ADMIN users
        const { rows: admins } = await pool.query(
            `SELECT id, name, email, role FROM users WHERE role = 'SUPER_ADMIN' LIMIT 5`
        );

        if (admins.length === 0) {
            console.log('❌ No SUPER_ADMIN users found');
            return;
        }

        console.log(`Found ${admins.length} admin(s):`);
        for (const admin of admins) {
            console.log(`  → ${admin.name} (${admin.email})`);

            await pool.query(
                `UPDATE users
                 SET password_hash = $1,
                     pin_code_hash = $2,
                     pin_login_enabled = true,
                     updated_at = NOW()
                 WHERE id = $3`,
                [passwordHash, pinHash, admin.id]
            );

            console.log(`  ✅ Password reset to: ${newPassword}`);
            console.log(`  ✅ PIN set to: ${newPin}`);
        }

        console.log('\n✅ Done! You can now login with:');
        console.log(`   Email + Password: (your email) / ${newPassword}`);
        console.log(`   PIN Code: ${newPin}`);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

resetAdmin();
