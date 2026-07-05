CREATE TABLE IF NOT EXISTS "attendance_device_log_backups" (
  "id" text PRIMARY KEY,
  "branch_id" text NOT NULL REFERENCES "branches"("id"),
  "device_id" text REFERENCES "attendance_devices"("id"),
  "gateway_id" text,
  "source_type" text DEFAULT 'BRANCH_BRIDGE' NOT NULL,
  "operation" text DEFAULT 'CLEAR_LOGS_BACKUP' NOT NULL,
  "record_count" integer DEFAULT 0 NOT NULL,
  "backup_format" text DEFAULT 'JSON' NOT NULL,
  "local_file_path" text,
  "raw_payload" jsonb,
  "created_by" text REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_device_log_backups_branch_created_idx"
  ON "attendance_device_log_backups" USING btree ("branch_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_device_log_backups_device_created_idx"
  ON "attendance_device_log_backups" USING btree ("device_id", "created_at");
