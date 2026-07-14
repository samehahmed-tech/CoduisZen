import { pool } from '../server/db';
import * as dotenv from 'dotenv';

dotenv.config();

const SQL = `
IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('customers') AND name = 'lat')
    alter table customers add lat float;
IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('customers') AND name = 'lng')
    alter table customers add lng float;
IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('customers') AND name = 'address_label')
    alter table customers add address_label nvarchar(500);

IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('customer_addresses') AND name = 'lat')
    alter table customer_addresses add lat float;
IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('customer_addresses') AND name = 'lng')
    alter table customer_addresses add lng float;
IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('customer_addresses') AND name = 'zone_id')
    alter table customer_addresses add zone_id nvarchar(100);

IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'delivery_lat')
    alter table orders add delivery_lat float;
IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'delivery_lng')
    alter table orders add delivery_lng float;
IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'delivery_address_label')
    alter table orders add delivery_address_label nvarchar(500);
IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'platform_order_id')
    alter table orders add platform_order_id nvarchar(200);
IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('orders') AND name = 'delivery_source')
    alter table orders add delivery_source nvarchar(50) default 'restaurant';

IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('delivery_platforms') AND name = 'apply_fees_to_menu_price')
    alter table delivery_platforms add apply_fees_to_menu_price bit not null default 0;
IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('delivery_platforms') AND name = 'price_markup_percentage')
    alter table delivery_platforms add price_markup_percentage float default 0;
IF NOT EXISTS (SELECT * FROM syscolumns WHERE id = object_id('delivery_platforms') AND name = 'price_markup_fixed')
    alter table delivery_platforms add price_markup_fixed float default 0;
`;

async function main() {
    try {
        console.log('[delivery-map-columns] Ensuring map columns exist...');
        const statements = SQL.split(';').filter(s => s.trim());
        for (const stmt of statements) {
            try { await pool.query(stmt); } catch { }
        }
        console.log('[delivery-map-columns] Ready.');
    } catch (error: any) {
        console.error('[delivery-map-columns] Failed:', error);
        process.exit(1);
    }
}

main();
