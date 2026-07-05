ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "platform_order_id" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_source" text DEFAULT 'restaurant';
