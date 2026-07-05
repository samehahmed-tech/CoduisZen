ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "lat" real;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "lng" real;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "address_label" text;

ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "lat" real;
ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "lng" real;
ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "zone_id" integer REFERENCES "delivery_zones"("id");

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_lat" real;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_lng" real;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_address_label" text;
