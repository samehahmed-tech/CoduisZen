CREATE TABLE IF NOT EXISTS "stock_counts" (
    "id" text PRIMARY KEY NOT NULL,
    "branch_id" text NOT NULL,
    "warehouse_id" text,
    "count_date" date,
    "status" text DEFAULT 'DRAFT',
    "type" text DEFAULT 'FULL',
    "remarks" text,
    "created_by" text,
    "approved_by" text,
    "scheduled_date" timestamp,
    "frozen_at" timestamp,
    "posted_at" timestamp,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "stock_count_lines" (
    "id" serial PRIMARY KEY NOT NULL,
    "count_id" text NOT NULL,
    "item_id" text NOT NULL,
    "expected_qty" real DEFAULT 0,
    "counted_qty" real,
    "variance_qty" real,
    "cost" real DEFAULT 0,
    "notes" text
);

ALTER TABLE "stock_counts" ADD COLUMN IF NOT EXISTS "warehouse_id" text;
ALTER TABLE "stock_counts" ADD COLUMN IF NOT EXISTS "count_date" date;
ALTER TABLE "stock_count_lines" ADD COLUMN IF NOT EXISTS "notes" text;

DO $$
BEGIN
    IF to_regclass('public.branches') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'stock_counts_branch_id_branches_id_fk'
       ) THEN
        ALTER TABLE "stock_counts"
        ADD CONSTRAINT "stock_counts_branch_id_branches_id_fk"
        FOREIGN KEY ("branch_id") REFERENCES "branches"("id");
    END IF;

    IF to_regclass('public.warehouses') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'stock_counts_warehouse_id_warehouses_id_fk'
       ) THEN
        ALTER TABLE "stock_counts"
        ADD CONSTRAINT "stock_counts_warehouse_id_warehouses_id_fk"
        FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id");
    END IF;

    IF to_regclass('public.users') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'stock_counts_created_by_users_id_fk'
       ) THEN
        ALTER TABLE "stock_counts"
        ADD CONSTRAINT "stock_counts_created_by_users_id_fk"
        FOREIGN KEY ("created_by") REFERENCES "users"("id");
    END IF;

    IF to_regclass('public.users') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'stock_counts_approved_by_users_id_fk'
       ) THEN
        ALTER TABLE "stock_counts"
        ADD CONSTRAINT "stock_counts_approved_by_users_id_fk"
        FOREIGN KEY ("approved_by") REFERENCES "users"("id");
    END IF;

    IF to_regclass('public.inventory_items') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'stock_count_lines_item_id_inventory_items_id_fk'
       ) THEN
        ALTER TABLE "stock_count_lines"
        ADD CONSTRAINT "stock_count_lines_item_id_inventory_items_id_fk"
        FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id");
    END IF;

    IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'stock_count_lines_count_id_stock_counts_id_fk'
    ) THEN
        ALTER TABLE "stock_count_lines"
        ADD CONSTRAINT "stock_count_lines_count_id_stock_counts_id_fk"
        FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id");
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "stock_counts_branch_date_idx"
ON "stock_counts" ("branch_id", "count_date");

CREATE INDEX IF NOT EXISTS "stock_counts_warehouse_date_idx"
ON "stock_counts" ("warehouse_id", "count_date");

CREATE INDEX IF NOT EXISTS "stock_count_lines_count_item_idx"
ON "stock_count_lines" ("count_id", "item_id");
