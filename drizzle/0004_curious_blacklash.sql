ALTER TABLE "menu_items" ADD COLUMN "is_tax_exempt" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "tax" real DEFAULT 0;