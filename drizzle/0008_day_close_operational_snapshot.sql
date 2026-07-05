ALTER TABLE "day_close_reports" ADD COLUMN IF NOT EXISTS "sales_snapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "day_close_reports" ADD COLUMN IF NOT EXISTS "orders_snapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "day_close_reports" ADD COLUMN IF NOT EXISTS "payments_snapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "day_close_reports" ADD COLUMN IF NOT EXISTS "inventory_snapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "day_close_reports" ADD COLUMN IF NOT EXISTS "shifts_snapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "day_close_reports" ADD COLUMN IF NOT EXISTS "fiscal_snapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "day_close_reports" ADD COLUMN IF NOT EXISTS "finance_snapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "day_close_reports" ADD COLUMN IF NOT EXISTS "side_effect_snapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "day_close_reports" ADD COLUMN IF NOT EXISTS "audit_snapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "day_close_reports" ADD COLUMN IF NOT EXISTS "operational_snapshot" jsonb DEFAULT '{}'::jsonb;

DELETE FROM "day_close_reports" d
USING (
    SELECT ctid
    FROM (
        SELECT ctid,
               ROW_NUMBER() OVER (
                   PARTITION BY "branch_id", "date"
                   ORDER BY "created_at" DESC NULLS LAST, "id" DESC
               ) AS rn
        FROM "day_close_reports"
    ) ranked
    WHERE ranked.rn > 1
) duplicates
WHERE d.ctid = duplicates.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS "day_close_branch_date_unique_idx"
ON "day_close_reports" ("branch_id", "date");
