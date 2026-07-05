CREATE TABLE IF NOT EXISTS "departments" (
    "id" text PRIMARY KEY NOT NULL,
    "branch_id" text NOT NULL,
    "name" text NOT NULL,
    "name_ar" text,
    "manager_id" text,
    "parent_id" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "job_titles" (
    "id" text PRIMARY KEY NOT NULL,
    "department_id" text,
    "title" text NOT NULL,
    "name_ar" text,
    "is_active" boolean DEFAULT true
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'departments_branch_id_branches_id_fk'
    ) THEN
        ALTER TABLE "departments"
        ADD CONSTRAINT "departments_branch_id_branches_id_fk"
        FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id")
        ON DELETE no action ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'departments_manager_id_employees_id_fk'
    ) THEN
        ALTER TABLE "departments"
        ADD CONSTRAINT "departments_manager_id_employees_id_fk"
        FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("id")
        ON DELETE no action ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'job_titles_department_id_departments_id_fk'
    ) THEN
        ALTER TABLE "job_titles"
        ADD CONSTRAINT "job_titles_department_id_departments_id_fk"
        FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id")
        ON DELETE set null ON UPDATE no action;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "departments_branch_idx" ON "departments" ("branch_id");
CREATE UNIQUE INDEX IF NOT EXISTS "job_titles_department_title_unique_idx" ON "job_titles" ("department_id", "title");
