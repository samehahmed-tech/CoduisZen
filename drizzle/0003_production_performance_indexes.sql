CREATE INDEX IF NOT EXISTS "idx_orders_branch_business_date_created" ON "orders" USING btree ("branch_id","business_date","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_branch_status_created" ON "orders" USING btree ("branch_id","status","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_created_at_desc" ON "orders" USING btree ("created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_created_at_desc" ON "payments" USING btree ("created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_stock_item_warehouse_lookup" ON "inventory_stock" USING btree ("item_id","warehouse_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_reference_type" ON "stock_movements" USING btree ("reference_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_created_at_desc" ON "stock_movements" USING btree ("created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fiscal_logs_branch_status_created" ON "fiscal_logs" USING btree ("branch_id","status","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_branch_created" ON "audit_logs" USING btree ("branch_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_idempotency_keys_expires_at" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_sessions_active_expires" ON "user_sessions" USING btree ("is_active","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_customers_total_spent_desc" ON "customers" USING btree ("total_spent" DESC);
