ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "branch_pricing" jsonb;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "platform_pricing" jsonb;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "sizes_jsonb_tmp" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
UPDATE "menu_items" SET "sizes_jsonb_tmp" = COALESCE("sizes"::jsonb, '[]'::jsonb) WHERE "sizes" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" DROP COLUMN IF EXISTS "sizes";--> statement-breakpoint
ALTER TABLE "menu_items" RENAME COLUMN "sizes_jsonb_tmp" TO "sizes";--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "is_tax_exempt" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "tax" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "size_id" text;
