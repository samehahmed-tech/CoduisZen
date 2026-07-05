ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

CREATE INDEX IF NOT EXISTS "menu_items_deleted_at_idx"
ON "menu_items" ("deleted_at");
