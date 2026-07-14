import { getPool } from '../src/db/index';

async function fixOrdersTable() {
    try {
        console.log('Adding shift_id to orders table...');
        const pool = getPool();
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'shift_id') ALTER TABLE orders ADD shift_id nvarchar(100);`);

        console.log('Success!');
        process.exit(0);
    } catch (error) {
        console.error('Error adding column:', error);
        process.exit(1);
    }
}

fixOrdersTable();
