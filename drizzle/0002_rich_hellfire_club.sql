CREATE TABLE "inventory_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"change" real NOT NULL,
	"unit_cost" real NOT NULL,
	"reason" text NOT NULL,
	"reference_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"payment_session_id" text,
	"account" text NOT NULL,
	"direction" text NOT NULL,
	"amount" real NOT NULL,
	"currency" text DEFAULT 'EGP',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"provider_type" text,
	"status" text DEFAULT 'initiated',
	"amount" real NOT NULL,
	"currency" text DEFAULT 'EGP',
	"verified" boolean DEFAULT false,
	"external_reference" text,
	"idempotency_key" text,
	"device_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "payment_sessions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "user_daily_performance" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"date" text NOT NULL,
	"order_count" integer DEFAULT 0,
	"total_sales" real DEFAULT 0,
	"total_points" integer DEFAULT 0,
	"avg_processing_time" real DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "attendance_policies" DROP CONSTRAINT "attendance_policies_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_sessions" DROP CONSTRAINT "attendance_sessions_check_in_raw_log_id_attendance_raw_logs_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_sessions" DROP CONSTRAINT "attendance_sessions_check_out_raw_log_id_attendance_raw_logs_id_fk";
--> statement-breakpoint
ALTER TABLE "domain_events" DROP CONSTRAINT "domain_events_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "employee_payroll_assignments" DROP CONSTRAINT "employee_payroll_assignments_payroll_profile_id_payroll_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" DROP CONSTRAINT "employee_shift_assignments_employee_id_employees_id_fk";
--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" DROP CONSTRAINT "employee_shift_assignments_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" DROP CONSTRAINT "employee_shift_assignments_shift_template_id_shift_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "leave_balances" DROP CONSTRAINT "leave_balances_leave_type_id_leave_types_id_fk";
--> statement-breakpoint
ALTER TABLE "payroll_profiles" DROP CONSTRAINT "payroll_profiles_default_attendance_policy_id_attendance_policies_id_fk";
--> statement-breakpoint
ALTER TABLE "shift_templates" DROP CONSTRAINT "shift_templates_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "shift_templates" DROP CONSTRAINT "shift_templates_attendance_policy_id_attendance_policies_id_fk";
--> statement-breakpoint
DROP INDEX "domain_events_type_idx";--> statement-breakpoint
DROP INDEX "domain_events_status_idx";--> statement-breakpoint
DROP INDEX "domain_events_branch_idx";--> statement-breakpoint
DROP INDEX "employee_shift_assignments_employee_effective_idx";--> statement-breakpoint
DROP INDEX "employee_shift_assignments_branch_shift_idx";--> statement-breakpoint
DROP INDEX "attendance_device_mappings_device_user_idx";--> statement-breakpoint
DROP INDEX "attendance_device_mappings_employee_idx";--> statement-breakpoint
DROP INDEX "attendance_devices_branch_source_idx";--> statement-breakpoint
DROP INDEX "attendance_exceptions_branch_status_idx";--> statement-breakpoint
DROP INDEX "attendance_exceptions_employee_idx";--> statement-breakpoint
DROP INDEX "attendance_exceptions_assigned_idx";--> statement-breakpoint
DROP INDEX "attendance_exceptions_sla_idx";--> statement-breakpoint
DROP INDEX "attendance_geofences_branch_idx";--> statement-breakpoint
DROP INDEX "attendance_policies_branch_default_idx";--> statement-breakpoint
DROP INDEX "attendance_raw_logs_dedupe_idx";--> statement-breakpoint
DROP INDEX "attendance_raw_logs_branch_occurred_idx";--> statement-breakpoint
DROP INDEX "attendance_raw_logs_employee_occurred_idx";--> statement-breakpoint
DROP INDEX "attendance_sessions_employee_clock_in_idx";--> statement-breakpoint
DROP INDEX "attendance_sessions_branch_status_idx";--> statement-breakpoint
DROP INDEX "bonus_penalty_employee_type_status_idx";--> statement-breakpoint
DROP INDEX "bonus_penalty_branch_effective_idx";--> statement-breakpoint
DROP INDEX "employee_loans_employee_status_idx";--> statement-breakpoint
DROP INDEX "employee_loans_branch_status_idx";--> statement-breakpoint
DROP INDEX "employee_payroll_assignments_employee_effective_idx";--> statement-breakpoint
DROP INDEX "leave_balances_employee_leave_year_idx";--> statement-breakpoint
DROP INDEX "loan_installments_loan_due_idx";--> statement-breakpoint
DROP INDEX "loan_installments_status_idx";--> statement-breakpoint
DROP INDEX "onboarding_records_tenant_idx";--> statement-breakpoint
DROP INDEX "payroll_components_branch_code_idx";--> statement-breakpoint
DROP INDEX "payroll_locks_branch_idx";--> statement-breakpoint
DROP INDEX "payroll_profiles_branch_default_idx";--> statement-breakpoint
DROP INDEX "payroll_rules_profile_priority_idx";--> statement-breakpoint
DROP INDEX "payroll_run_lines_run_employee_idx";--> statement-breakpoint
DROP INDEX "payroll_runs_cycle_idx";--> statement-breakpoint
DROP INDEX "payslips_cycle_employee_idx";--> statement-breakpoint
DROP INDEX "payslips_version_idx";--> statement-breakpoint
DROP INDEX "shift_plan_entries_plan_idx";--> statement-breakpoint
DROP INDEX "shift_plan_entries_employee_date_idx";--> statement-breakpoint
DROP INDEX "shift_plans_branch_week_idx";--> statement-breakpoint
DROP INDEX "shift_task_runs_shift_idx";--> statement-breakpoint
DROP INDEX "shift_task_runs_task_idx";--> statement-breakpoint
DROP INDEX "shift_templates_branch_active_idx";--> statement-breakpoint
DROP INDEX "subscriptions_tenant_branch_idx";--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ALTER COLUMN "source_type" SET DEFAULT 'BIOMETRIC_ZK';--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ALTER COLUMN "event_type" SET DEFAULT 'UNKNOWN';--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ALTER COLUMN "geo_lat" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ALTER COLUMN "geo_lng" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ALTER COLUMN "geo_accuracy_meters" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ALTER COLUMN "confidence_score" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ALTER COLUMN "dedupe_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ALTER COLUMN "processing_status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_sync_runs" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';--> statement-breakpoint
ALTER TABLE "attendance_sync_runs" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_sync_runs" ALTER COLUMN "logs_received" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_sync_runs" ALTER COLUMN "logs_accepted" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_sync_runs" ALTER COLUMN "logs_rejected" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_sync_runs" ALTER COLUMN "started_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_sync_runs" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "business_date" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "trace_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "eta_receipt_uuid" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "eta_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "business_date" text;--> statement-breakpoint
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_product_id_inventory_items_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_session_id_payment_sessions_id_fk" FOREIGN KEY ("payment_session_id") REFERENCES "public"."payment_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_performance" ADD CONSTRAINT "user_daily_performance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_performance" ADD CONSTRAINT "user_daily_performance_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_ledger_product_branch_idx" ON "inventory_ledger" USING btree ("product_id","branch_id");--> statement-breakpoint
CREATE INDEX "inventory_ledger_reference_idx" ON "inventory_ledger" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_order_idx" ON "ledger_entries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account");--> statement-breakpoint
CREATE INDEX "payment_sessions_order_idx" ON "payment_sessions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_sessions_idempotency_idx" ON "payment_sessions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_daily_perf_unique" ON "user_daily_performance" USING btree ("user_id","branch_id","date");--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_device_mappings" ADD CONSTRAINT "attendance_device_mappings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_device_mappings" ADD CONSTRAINT "attendance_device_mappings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_raw_log_id_fkey" FOREIGN KEY ("raw_log_id") REFERENCES "public"."attendance_raw_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_geofences" ADD CONSTRAINT "attendance_geofences_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ADD CONSTRAINT "attendance_raw_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ADD CONSTRAINT "attendance_raw_logs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ADD CONSTRAINT "attendance_raw_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_check_in_raw_log_id_attendance_raw_logs_id_" FOREIGN KEY ("check_in_raw_log_id") REFERENCES "public"."attendance_raw_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_check_in_raw_log_id_fkey" FOREIGN KEY ("check_in_raw_log_id") REFERENCES "public"."attendance_raw_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_check_out_raw_log_id_attendance_raw_logs_id" FOREIGN KEY ("check_out_raw_log_id") REFERENCES "public"."attendance_raw_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_check_out_raw_log_id_fkey" FOREIGN KEY ("check_out_raw_log_id") REFERENCES "public"."attendance_raw_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sync_runs" ADD CONSTRAINT "attendance_sync_runs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sync_runs" ADD CONSTRAINT "attendance_sync_runs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payroll_assignments" ADD CONSTRAINT "employee_payroll_assignments_payroll_profile_id_payroll_profile" FOREIGN KEY ("payroll_profile_id") REFERENCES "public"."payroll_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_shift_template_id_fkey" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_profiles" ADD CONSTRAINT "payroll_profiles_default_attendance_policy_id_attendance_polici" FOREIGN KEY ("default_attendance_policy_id") REFERENCES "public"."attendance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_attendance_policy_id_fkey" FOREIGN KEY ("attendance_policy_id") REFERENCES "public"."attendance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_device_mappings_device_user_idx" ON "attendance_device_mappings" USING btree ("device_id","device_user_id") WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "attendance_device_mappings_employee_idx" ON "attendance_device_mappings" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "attendance_devices_branch_source_idx" ON "attendance_devices" USING btree ("branch_id","source_type");--> statement-breakpoint
CREATE INDEX "attendance_exceptions_branch_status_idx" ON "attendance_exceptions" USING btree ("branch_id","status","severity");--> statement-breakpoint
CREATE INDEX "attendance_exceptions_employee_idx" ON "attendance_exceptions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "attendance_exceptions_assigned_idx" ON "attendance_exceptions" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "attendance_exceptions_sla_idx" ON "attendance_exceptions" USING btree ("sla_due_at");--> statement-breakpoint
CREATE INDEX "attendance_geofences_branch_idx" ON "attendance_geofences" USING btree ("branch_id","is_active");--> statement-breakpoint
CREATE INDEX "attendance_policies_branch_default_idx" ON "attendance_policies" USING btree ("branch_id","is_default","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_raw_logs_dedupe_idx" ON "attendance_raw_logs" USING btree ("dedupe_hash");--> statement-breakpoint
CREATE INDEX "attendance_raw_logs_branch_occurred_idx" ON "attendance_raw_logs" USING btree ("branch_id","occurred_at");--> statement-breakpoint
CREATE INDEX "attendance_raw_logs_employee_occurred_idx" ON "attendance_raw_logs" USING btree ("employee_id","occurred_at");--> statement-breakpoint
CREATE INDEX "attendance_sessions_employee_clock_in_idx" ON "attendance_sessions" USING btree ("employee_id","clock_in_at");--> statement-breakpoint
CREATE INDEX "attendance_sessions_branch_status_idx" ON "attendance_sessions" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "bonus_penalty_employee_type_status_idx" ON "bonus_penalty_records" USING btree ("employee_id","type","status");--> statement-breakpoint
CREATE INDEX "bonus_penalty_branch_effective_idx" ON "bonus_penalty_records" USING btree ("branch_id","effective_date");--> statement-breakpoint
CREATE INDEX "employee_loans_employee_status_idx" ON "employee_loans" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "employee_loans_branch_status_idx" ON "employee_loans" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "employee_payroll_assignments_employee_effective_idx" ON "employee_payroll_assignments" USING btree ("employee_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_balances_employee_leave_year_idx" ON "leave_balances" USING btree ("employee_id","leave_type_id","year");--> statement-breakpoint
CREATE INDEX "loan_installments_loan_due_idx" ON "loan_installments" USING btree ("loan_id","due_date");--> statement-breakpoint
CREATE INDEX "loan_installments_status_idx" ON "loan_installments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_records_tenant_idx" ON "onboarding_records" USING btree ("tenant_branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_components_branch_code_idx" ON "payroll_components" USING btree ("branch_id","code");--> statement-breakpoint
CREATE INDEX "payroll_locks_branch_idx" ON "payroll_locks" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "payroll_profiles_branch_default_idx" ON "payroll_profiles" USING btree ("branch_id","is_default","is_active");--> statement-breakpoint
CREATE INDEX "payroll_rules_profile_priority_idx" ON "payroll_rules" USING btree ("payroll_profile_id","priority","is_active");--> statement-breakpoint
CREATE INDEX "payroll_run_lines_run_employee_idx" ON "payroll_run_lines" USING btree ("run_id","employee_id");--> statement-breakpoint
CREATE INDEX "payroll_runs_cycle_idx" ON "payroll_runs" USING btree ("cycle_id","status");--> statement-breakpoint
CREATE INDEX "payslips_cycle_employee_idx" ON "payslips" USING btree ("cycle_id","employee_id");--> statement-breakpoint
CREATE INDEX "payslips_version_idx" ON "payslips" USING btree ("employee_id","cycle_id","version");--> statement-breakpoint
CREATE INDEX "shift_plan_entries_plan_idx" ON "shift_plan_entries" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "shift_plan_entries_employee_date_idx" ON "shift_plan_entries" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX "shift_plans_branch_week_idx" ON "shift_plans" USING btree ("branch_id","week_start");--> statement-breakpoint
CREATE INDEX "shift_task_runs_shift_idx" ON "shift_task_runs" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "shift_task_runs_task_idx" ON "shift_task_runs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "shift_templates_branch_active_idx" ON "shift_templates" USING btree ("branch_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tenant_branch_idx" ON "subscriptions" USING btree ("tenant_branch_id");--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "server_ip" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "day_close_emails" json DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "domain_events" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'UNKNOWN';--> statement-breakpoint
ALTER TABLE "domain_events" ADD COLUMN IF NOT EXISTS "entity_type" text;--> statement-breakpoint
ALTER TABLE "domain_events" ADD COLUMN IF NOT EXISTS "entity_id" text;--> statement-breakpoint
ALTER TABLE "domain_events" ADD COLUMN IF NOT EXISTS "branch_id" text;--> statement-breakpoint
ALTER TABLE "domain_events" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "domain_events" ADD COLUMN IF NOT EXISTS "payload" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "domain_events" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "domain_events" ADD COLUMN IF NOT EXISTS "processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD COLUMN IF NOT EXISTS "is_primary" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "employee_code" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "attendance_code" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "national_id" text;--> statement-breakpoint
ALTER TABLE "menu_items" DROP COLUMN "print_roles";--> statement-breakpoint
ALTER TABLE "printers" ADD COLUMN IF NOT EXISTS "roles" json DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ADD CONSTRAINT "attendance_raw_logs_dedupe_hash_key" UNIQUE("dedupe_hash");
