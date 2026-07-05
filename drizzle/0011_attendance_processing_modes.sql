ALTER TABLE "attendance_policies" ADD COLUMN IF NOT EXISTS "attendance_processing_mode" text DEFAULT 'AUTO' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD COLUMN IF NOT EXISTS "operational_day_start_hour" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD COLUMN IF NOT EXISTS "operational_day_end_hour" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD COLUMN IF NOT EXISTS "max_smart_session_hours" real DEFAULT 22 NOT NULL;
