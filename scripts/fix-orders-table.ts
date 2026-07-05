import { getPool } from '../src/db/index';

async function fixOrdersTable() {
    try {
        console.log('Adding shift_id to orders table...');
        const pool = getPool();
        await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id text;');
        
        console.log('Success!');
        process.exit(0);
    } catch (error) {
        console.error('Error adding column:', error);
        process.exit(1);
    }
}

fixOrdersTable();
