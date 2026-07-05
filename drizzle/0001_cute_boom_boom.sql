CREATE TABLE "attendance_corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"approved_by" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requested_clock_in_at" timestamp,
	"requested_clock_out_at" timestamp,
	"reason" text NOT NULL,
	"approver_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_device_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"device_user_id" text NOT NULL,
	"employee_code_snapshot" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"vendor" text DEFAULT 'ZKTeco' NOT NULL,
	"model" text,
	"source_type" text DEFAULT 'BIOMETRIC_ZK' NOT NULL,
	"ip_address" text,
	"port" integer,
	"serial_number" text,
	"communication_mode" text DEFAULT 'LAN',
	"branch_gateway_id" text,
	"is_active" boolean DEFAULT true,
	"last_seen_at" timestamp,
	"last_sync_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text,
	"branch_id" text NOT NULL,
	"raw_log_id" text,
	"session_id" text,
	"type" text NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"title" text NOT NULL,
	"details" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"assigned_to" text,
	"sla_due_at" timestamp,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"last_escalated_at" timestamp,
	"resolved_by" text,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_geofences" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"radius_meters" real DEFAULT 150 NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"grace_late_minutes" integer DEFAULT 15 NOT NULL,
	"early_leave_tolerance_minutes" integer DEFAULT 10 NOT NULL,
	"overtime_threshold_minutes" integer DEFAULT 30 NOT NULL,
	"min_hours_for_present" real DEFAULT 4 NOT NULL,
	"geofence_strict" boolean DEFAULT false,
	"face_recognition_required" boolean DEFAULT false,
	"auto_close_open_sessions" boolean DEFAULT false,
	"auto_resolve_missing_out" boolean DEFAULT false,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_raw_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"sync_run_id" text,
	"device_id" text,
	"employee_id" text,
	"branch_id" text NOT NULL,
	"source_type" text NOT NULL,
	"event_type" text NOT NULL,
	"employee_identifier" text,
	"device_user_id" text,
	"occurred_at" timestamp NOT NULL,
	"device_occurred_at" timestamp,
	"geo_lat" real,
	"geo_lng" real,
	"geo_accuracy_meters" real,
	"confidence_score" real,
	"image_url" text,
	"dedupe_hash" text NOT NULL,
	"processing_status" text DEFAULT 'PENDING' NOT NULL,
	"processing_notes" text,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"source_type" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"check_in_raw_log_id" text,
	"check_out_raw_log_id" text,
	"clock_in_at" timestamp NOT NULL,
	"clock_out_at" timestamp,
	"total_hours" real DEFAULT 0 NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"early_leave_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_minutes" integer DEFAULT 0 NOT NULL,
	"risk_flags" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text,
	"branch_id" text,
	"source_type" text NOT NULL,
	"status" text DEFAULT 'STARTED' NOT NULL,
	"logs_received" integer DEFAULT 0 NOT NULL,
	"logs_accepted" integer DEFAULT 0 NOT NULL,
	"logs_rejected" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "bonus_penalty_records" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"type" text NOT NULL,
	"category" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"amount" real NOT NULL,
	"effective_date" date NOT NULL,
	"payroll_cycle_id" text,
	"reason" text NOT NULL,
	"notes" text,
	"requested_by" text,
	"approved_by" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"branch_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "employee_loans" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"type" text DEFAULT 'ADVANCE' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"principal_amount" real NOT NULL,
	"installment_amount" real DEFAULT 0 NOT NULL,
	"installments_count" integer DEFAULT 1 NOT NULL,
	"outstanding_amount" real NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"disbursed_at" timestamp,
	"effective_from" date,
	"notes" text,
	"requested_by" text,
	"approved_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_payroll_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"payroll_profile_id" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_primary" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_shift_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"shift_template_id" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_primary" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"leave_type_id" text NOT NULL,
	"year" integer NOT NULL,
	"entitled_days" real DEFAULT 0 NOT NULL,
	"carried_forward_days" real DEFAULT 0 NOT NULL,
	"used_days" real DEFAULT 0 NOT NULL,
	"pending_days" real DEFAULT 0 NOT NULL,
	"adjustment_days" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loan_installments" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"due_date" date NOT NULL,
	"amount" real NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"payroll_cycle_id" text,
	"paid_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_records" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_branch_id" text NOT NULL,
	"setup_branch_completed" boolean DEFAULT false,
	"setup_menu_completed" boolean DEFAULT false,
	"setup_staff_completed" boolean DEFAULT false,
	"setup_printers_completed" boolean DEFAULT false,
	"setup_hardware_completed" boolean DEFAULT false,
	"is_fully_onboarded" boolean DEFAULT false,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_components" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"type" text NOT NULL,
	"amount_type" text DEFAULT 'FIXED' NOT NULL,
	"calculation_basis" text DEFAULT 'BASE_SALARY' NOT NULL,
	"default_value" real DEFAULT 0 NOT NULL,
	"taxable" boolean DEFAULT false,
	"pensionable" boolean DEFAULT false,
	"affects_net_pay" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"locked_through" timestamp NOT NULL,
	"locked_by" text,
	"reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"pay_frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"salary_mode" text DEFAULT 'MONTHLY' NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"default_attendance_policy_id" text,
	"default_overtime_rate" real DEFAULT 1.5 NOT NULL,
	"late_deduction_mode" text DEFAULT 'NONE' NOT NULL,
	"absence_deduction_mode" text DEFAULT 'DAILY_RATE' NOT NULL,
	"auto_post_to_gl" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"payroll_profile_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"trigger_type" text NOT NULL,
	"operation" text NOT NULL,
	"component_id" text,
	"threshold_value" real DEFAULT 0 NOT NULL,
	"rate_value" real DEFAULT 0 NOT NULL,
	"cap_value" real DEFAULT 0,
	"formula" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_run_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"base_salary" real DEFAULT 0 NOT NULL,
	"overtime" real DEFAULT 0 NOT NULL,
	"bonuses" real DEFAULT 0 NOT NULL,
	"penalties" real DEFAULT 0 NOT NULL,
	"loan_deductions" real DEFAULT 0 NOT NULL,
	"other_deductions" real DEFAULT 0 NOT NULL,
	"gross_pay" real DEFAULT 0 NOT NULL,
	"net_pay" real DEFAULT 0 NOT NULL,
	"components" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"total_employees" integer DEFAULT 0 NOT NULL,
	"gross_total" real DEFAULT 0 NOT NULL,
	"deductions_total" real DEFAULT 0 NOT NULL,
	"net_total" real DEFAULT 0 NOT NULL,
	"created_by" text,
	"closed_by" text,
	"closed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"cycle_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"pdf_url" text,
	"pdf_hash" text,
	"generated_at" timestamp,
	"generated_by" text
);
--> statement-breakpoint
CREATE TABLE "shift_plan_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"shift_template_id" text,
	"date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shift_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"frozen_at" timestamp,
	"posted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shift_task_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"shift_id" text NOT NULL,
	"task_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"completed_by" text,
	"completed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shift_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'DAILY' NOT NULL,
	"description" text,
	"requires_verification" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"attendance_policy_id" text,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"grace_late_minutes" integer,
	"early_leave_tolerance_minutes" integer,
	"overtime_threshold_minutes" integer,
	"work_days" jsonb DEFAULT '["sun","mon","tue","wed","thu"]'::jsonb,
	"is_overnight" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"description" text,
	"price" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"currency" text DEFAULT 'EGP',
	"billing_cycle" text DEFAULT 'MONTHLY',
	"features" json DEFAULT '[]'::json,
	"max_branches" integer DEFAULT 1,
	"max_users" integer DEFAULT 10,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_branch_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text DEFAULT 'TRIALING',
	"trial_ends_at" timestamp,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"payment_method_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "server_ip" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "day_close_emails" json DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "employee_code" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "attendance_code" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "national_id" text;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "print_roles" json DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "printers" ADD COLUMN "roles" json DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_device_mappings" ADD CONSTRAINT "attendance_device_mappings_device_id_attendance_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_device_mappings" ADD CONSTRAINT "attendance_device_mappings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_raw_log_id_attendance_raw_logs_id_fk" FOREIGN KEY ("raw_log_id") REFERENCES "public"."attendance_raw_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_geofences" ADD CONSTRAINT "attendance_geofences_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ADD CONSTRAINT "attendance_raw_logs_sync_run_id_attendance_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."attendance_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ADD CONSTRAINT "attendance_raw_logs_device_id_attendance_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ADD CONSTRAINT "attendance_raw_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_raw_logs" ADD CONSTRAINT "attendance_raw_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_check_in_raw_log_id_attendance_raw_logs_id_fk" FOREIGN KEY ("check_in_raw_log_id") REFERENCES "public"."attendance_raw_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_check_out_raw_log_id_attendance_raw_logs_id_fk" FOREIGN KEY ("check_out_raw_log_id") REFERENCES "public"."attendance_raw_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sync_runs" ADD CONSTRAINT "attendance_sync_runs_device_id_attendance_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sync_runs" ADD CONSTRAINT "attendance_sync_runs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_penalty_records" ADD CONSTRAINT "bonus_penalty_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_penalty_records" ADD CONSTRAINT "bonus_penalty_records_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_penalty_records" ADD CONSTRAINT "bonus_penalty_records_payroll_cycle_id_payroll_cycles_id_fk" FOREIGN KEY ("payroll_cycle_id") REFERENCES "public"."payroll_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_penalty_records" ADD CONSTRAINT "bonus_penalty_records_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonus_penalty_records" ADD CONSTRAINT "bonus_penalty_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payroll_assignments" ADD CONSTRAINT "employee_payroll_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payroll_assignments" ADD CONSTRAINT "employee_payroll_assignments_payroll_profile_id_payroll_profiles_id_fk" FOREIGN KEY ("payroll_profile_id") REFERENCES "public"."payroll_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_loan_id_employee_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."employee_loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_payroll_cycle_id_payroll_cycles_id_fk" FOREIGN KEY ("payroll_cycle_id") REFERENCES "public"."payroll_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_records" ADD CONSTRAINT "onboarding_records_tenant_branch_id_branches_id_fk" FOREIGN KEY ("tenant_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_components" ADD CONSTRAINT "payroll_components_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_locks" ADD CONSTRAINT "payroll_locks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_locks" ADD CONSTRAINT "payroll_locks_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_profiles" ADD CONSTRAINT "payroll_profiles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_profiles" ADD CONSTRAINT "payroll_profiles_default_attendance_policy_id_attendance_policies_id_fk" FOREIGN KEY ("default_attendance_policy_id") REFERENCES "public"."attendance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_rules" ADD CONSTRAINT "payroll_rules_payroll_profile_id_payroll_profiles_id_fk" FOREIGN KEY ("payroll_profile_id") REFERENCES "public"."payroll_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_rules" ADD CONSTRAINT "payroll_rules_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_rules" ADD CONSTRAINT "payroll_rules_component_id_payroll_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."payroll_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_lines" ADD CONSTRAINT "payroll_run_lines_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_lines" ADD CONSTRAINT "payroll_run_lines_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_cycle_id_payroll_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."payroll_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_cycle_id_payroll_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."payroll_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plan_entries" ADD CONSTRAINT "shift_plan_entries_plan_id_shift_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."shift_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plan_entries" ADD CONSTRAINT "shift_plan_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plan_entries" ADD CONSTRAINT "shift_plan_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plan_entries" ADD CONSTRAINT "shift_plan_entries_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plans" ADD CONSTRAINT "shift_plans_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plans" ADD CONSTRAINT "shift_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plans" ADD CONSTRAINT "shift_plans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_task_runs" ADD CONSTRAINT "shift_task_runs_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_task_runs" ADD CONSTRAINT "shift_task_runs_task_id_shift_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."shift_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_task_runs" ADD CONSTRAINT "shift_task_runs_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_tasks" ADD CONSTRAINT "shift_tasks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_attendance_policy_id_attendance_policies_id_fk" FOREIGN KEY ("attendance_policy_id") REFERENCES "public"."attendance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_branch_id_branches_id_fk" FOREIGN KEY ("tenant_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_device_mappings_device_user_idx" ON "attendance_device_mappings" USING btree ("device_id","device_user_id");--> statement-breakpoint
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
CREATE INDEX "domain_events_type_idx" ON "domain_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "domain_events_status_idx" ON "domain_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "domain_events_branch_idx" ON "domain_events" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "employee_loans_employee_status_idx" ON "employee_loans" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "employee_loans_branch_status_idx" ON "employee_loans" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "employee_payroll_assignments_employee_effective_idx" ON "employee_payroll_assignments" USING btree ("employee_id","effective_from");--> statement-breakpoint
CREATE INDEX "employee_shift_assignments_employee_effective_idx" ON "employee_shift_assignments" USING btree ("employee_id","effective_from");--> statement-breakpoint
CREATE INDEX "employee_shift_assignments_branch_shift_idx" ON "employee_shift_assignments" USING btree ("branch_id","shift_template_id");--> statement-breakpoint
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
CREATE UNIQUE INDEX "subscriptions_tenant_branch_idx" ON "subscriptions" USING btree ("tenant_branch_id");