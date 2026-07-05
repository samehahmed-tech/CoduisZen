ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "sizes" json DEFAULT '[]'::json;
