CREATE INDEX IF NOT EXISTS "idx_orders_branch_shift_created" ON "orders" USING btree ("branch_id","shift_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_order_method_created" ON "payments" USING btree ("order_id","method","created_at" DESC);
