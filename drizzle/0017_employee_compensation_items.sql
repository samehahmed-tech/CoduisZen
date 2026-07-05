CREATE TABLE IF NOT EXISTS "employee_compensation_items" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"name_ar" text,
	"category" text DEFAULT 'GENERAL' NOT NULL,
	"type" text DEFAULT 'ALLOWANCE' NOT NULL,
	"amount" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"is_recurring" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

DO $$ BEGIN
 ALTER TABLE "employee_compensation_items" ADD CONSTRAINT "employee_compensation_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "employee_compensation_items" ADD CONSTRAINT "employee_compensation_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "employee_comp_items_branch_active_idx" ON "employee_compensation_items" USING btree ("branch_id","is_active");
CREATE INDEX IF NOT EXISTS "employee_comp_items_employee_effective_idx" ON "employee_compensation_items" USING btree ("employee_id","effective_from","effective_to");
