ALTER TABLE "employee_shift_assignments"
ADD COLUMN IF NOT EXISTS "is_primary" boolean DEFAULT true;
