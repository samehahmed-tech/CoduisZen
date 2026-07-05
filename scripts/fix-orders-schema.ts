import { getPool } from '../src/db/index';

async function fixOrdersTable() {
    try {
        console.log('Fixing orders table schema...');
        const pool = getPool();
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id text;`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_call_center_order boolean DEFAULT false;`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_center_agent_id text;`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_urgent boolean DEFAULT false;`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount real DEFAULT 0;`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_amount real;`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_reason text;`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_notes text;`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_notes text;`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id text;`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_time timestamp;`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_delivery_time timestamp;`);
        
        console.log('Success!');
        process.exit(0);
    } catch (error) {
        console.error('Error adding columns:', error);
        process.exit(1);
    }
}

fixOrdersTable();
