import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const SQL = `
alter table "customers" add column if not exists "lat" real;
alter table "customers" add column if not exists "lng" real;
alter table "customers" add column if not exists "address_label" text;

alter table "customer_addresses" add column if not exists "lat" real;
alter table "customer_addresses" add column if not exists "lng" real;
alter table "customer_addresses" add column if not exists "zone_id" integer references "delivery_zones"("id");

alter table "orders" add column if not exists "delivery_lat" real;
alter table "orders" add column if not exists "delivery_lng" real;
alter table "orders" add column if not exists "delivery_address_label" text;
alter table "orders" add column if not exists "platform_order_id" text;
alter table "orders" add column if not exists "delivery_source" text default 'restaurant';

alter table "delivery_platforms" add column if not exists "apply_fees_to_menu_price" boolean not null default false;
alter table "delivery_platforms" add column if not exists "price_markup_percentage" real default 0;
alter table "delivery_platforms" add column if not exists "price_markup_fixed" real default 0;
`;

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required.');

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
        console.log('[delivery-map-columns] Ensuring map columns exist...');
        await client.query(SQL);
        const result = await client.query(`
            select table_name, column_name
            from information_schema.columns
            where table_schema = 'public'
              and (
                (table_name = 'customers' and column_name in ('lat', 'lng', 'address_label'))
                or (table_name = 'customer_addresses' and column_name in ('lat', 'lng', 'zone_id'))
                or (table_name = 'orders' and column_name in ('delivery_lat', 'delivery_lng', 'delivery_address_label', 'platform_order_id', 'delivery_source'))
                or (table_name = 'delivery_platforms' and column_name in ('apply_fees_to_menu_price', 'price_markup_percentage', 'price_markup_fixed'))
              )
            order by table_name, column_name;
        `);
        console.table(result.rows);
        console.log('[delivery-map-columns] Ready.');
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error('[delivery-map-columns] Failed:', error);
    process.exit(1);
});
