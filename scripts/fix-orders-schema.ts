import { getPool } from '../src/db/index';

async function fixOrdersTable() {
    try {
        console.log('Fixing orders table schema...');
        const pool = getPool();
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'parent_order_id') ALTER TABLE orders ADD parent_order_id nvarchar(100);`);
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'is_call_center_order') ALTER TABLE orders ADD is_call_center_order bit DEFAULT 0;`);
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'call_center_agent_id') ALTER TABLE orders ADD call_center_agent_id nvarchar(100);`);
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'is_urgent') ALTER TABLE orders ADD is_urgent bit DEFAULT 0;`);
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'tip_amount') ALTER TABLE orders ADD tip_amount float DEFAULT 0;`);
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'change_amount') ALTER TABLE orders ADD change_amount float;`);
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'discount_reason') ALTER TABLE orders ADD discount_reason nvarchar(max);`);
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'kitchen_notes') ALTER TABLE orders ADD kitchen_notes nvarchar(max);`);
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'delivery_notes') ALTER TABLE orders ADD delivery_notes nvarchar(max);`);
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'shift_id') ALTER TABLE orders ADD shift_id nvarchar(100);`);
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'estimated_delivery_time') ALTER TABLE orders ADD estimated_delivery_time datetime2;`);
        await pool.query(`IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'actual_delivery_time') ALTER TABLE orders ADD actual_delivery_time datetime2;`);

        console.log('Success!');
        process.exit(0);
    } catch (error) {
        console.error('Error adding columns:', error);
        process.exit(1);
    }
}

fixOrdersTable();
