CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"clock_in" timestamp DEFAULT now() NOT NULL,
	"clock_out" timestamp,
	"clock_in_lat" real,
	"clock_in_lng" real,
	"clock_out_lat" real,
	"clock_out_lng" real,
	"status" text DEFAULT 'PRESENT',
	"total_hours" real DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"user_id" text,
	"user_name" text,
	"user_role" text,
	"branch_id" text,
	"device_id" text,
	"ip_address" text,
	"payload" json,
	"before" json,
	"after" json,
	"reason" text,
	"signature" text,
	"signature_version" integer DEFAULT 1,
	"is_verified" boolean,
	"last_verified_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "batch_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"stock_movement_id" integer NOT NULL,
	"quantity_used" real NOT NULL,
	"cost_at_time" real NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"location" text,
	"address" text,
	"phone" text,
	"email" text,
	"is_active" boolean DEFAULT true,
	"timezone" text DEFAULT 'Africa/Cairo',
	"currency" text DEFAULT 'EGP',
	"tax_rate" real DEFAULT 14,
	"service_charge" real DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"account_id" text NOT NULL,
	"planned_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"branch_id" text,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campaign_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"customer_id" text,
	"channel" text NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"delivered" boolean DEFAULT false,
	"opened" boolean DEFAULT false,
	"clicked" boolean DEFAULT false,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"target_audience" text,
	"content" text NOT NULL,
	"scheduled_at" timestamp,
	"reach" integer DEFAULT 0,
	"conversions" integer DEFAULT 0,
	"revenue" real DEFAULT 0,
	"budget" real DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"type" text NOT NULL,
	"normal_balance" text NOT NULL,
	"parent_id" text,
	"is_active" boolean DEFAULT true,
	"is_control_account" boolean DEFAULT false,
	"allow_manual_journals" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "chart_of_accounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "cost_centers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"value" real NOT NULL,
	"min_order_value" real DEFAULT 0,
	"max_discount" real,
	"start_date" timestamp DEFAULT now(),
	"end_date" timestamp,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"zone_id" integer,
	"area" text,
	"building" text,
	"floor" text,
	"apartment" text,
	"landmark" text,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_complaints" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"order_id" text,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'OPEN',
	"priority" text DEFAULT 'MEDIUM',
	"resolution_notes" text,
	"assigned_to" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_rfm_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"branch_id" text,
	"recency" integer,
	"frequency" integer,
	"monetary" real,
	"recency_score" integer,
	"frequency_score" integer,
	"monetary_score" integer,
	"rfm_segment" text,
	"last_order_date" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"balance" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" text,
	"address" text,
	"zone_id" integer,
	"area" text,
	"building" text,
	"floor" text,
	"apartment" text,
	"landmark" text,
	"notes" text,
	"visits" integer DEFAULT 0,
	"total_spent" real DEFAULT 0,
	"loyalty_tier" text DEFAULT 'Bronze',
	"loyalty_points" integer DEFAULT 0,
	"source" text DEFAULT 'call_center',
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "daily_branch_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"date" date NOT NULL,
	"total_revenue" real DEFAULT 0,
	"net_revenue" real DEFAULT 0,
	"total_orders" integer DEFAULT 0,
	"avg_order_value" real DEFAULT 0,
	"total_tax" real DEFAULT 0,
	"total_discounts" real DEFAULT 0,
	"dine_in_revenue" real DEFAULT 0,
	"takeaway_revenue" real DEFAULT 0,
	"delivery_revenue" real DEFAULT 0,
	"gross_profit" real DEFAULT 0,
	"unique_customers" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "day_close_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"shift_id" text,
	"closed_by" text NOT NULL,
	"date" date NOT NULL,
	"expected_cash" real DEFAULT 0 NOT NULL,
	"actual_cash" real DEFAULT 0 NOT NULL,
	"variance" real DEFAULT 0 NOT NULL,
	"payment_breakdown" json,
	"total_orders" integer DEFAULT 0,
	"total_revenue" real DEFAULT 0,
	"total_refunds" real DEFAULT 0,
	"total_discounts" real DEFAULT 0,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delivery_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"driver_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"status" text DEFAULT 'ASSIGNED' NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"picked_up_at" timestamp,
	"delivered_at" timestamp,
	"failure_reason" text,
	"proof_photo_url" text,
	"customer_rating" integer,
	"distance_km" real,
	"delivery_time_minutes" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delivery_platforms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"fee_percentage" real DEFAULT 0,
	"integration_type" text DEFAULT 'MANUAL',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"branch_id" text NOT NULL,
	"delivery_fee" real DEFAULT 0,
	"min_order_amount" real DEFAULT 0,
	"estimated_time" integer DEFAULT 45,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"manager_id" text,
	"parent_id" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "driver_telemetry" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"branch_id" text,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"speed_kmh" real,
	"accuracy" real,
	"heading" real,
	"altitude" real,
	"battery_level" integer,
	"is_charging" boolean,
	"order_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "driver_telemetry_latest" (
	"driver_id" text PRIMARY KEY NOT NULL,
	"branch_id" text,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"speed_kmh" real,
	"accuracy" real,
	"heading" real,
	"battery_level" integer,
	"order_id" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"branch_id" text,
	"status" text DEFAULT 'AVAILABLE',
	"current_cash_balance" real DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"name_ar" text,
	"phone" text,
	"email" text,
	"role" text NOT NULL,
	"basic_salary" real DEFAULT 0 NOT NULL,
	"hourly_rate" real DEFAULT 0,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "eta_dead_letters" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text,
	"branch_id" text,
	"payload" json NOT NULL,
	"attempts" integer DEFAULT 0,
	"last_error" text,
	"status" text DEFAULT 'PENDING',
	"dismissed_by" text,
	"dismissed_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "finance_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text,
	"reference_type" text,
	"payload" json,
	"reason" text NOT NULL,
	"status" text DEFAULT 'PENDING',
	"resolved_by" text,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fiscal_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text,
	"branch_id" text,
	"status" text NOT NULL,
	"attempt" integer DEFAULT 0,
	"last_error" text,
	"payload" json,
	"response" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fiscal_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"closed_by" text,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "floor_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"branch_id" text NOT NULL,
	"width" integer DEFAULT 800,
	"height" integer DEFAULT 600,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "franchise_configurations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"branch_id" text NOT NULL,
	"contract_type" text DEFAULT 'STANDARD',
	"royalty_percentage" real DEFAULT 0,
	"marketing_fee_percentage" real DEFAULT 0,
	"contract_start_date" date,
	"contract_end_date" date,
	"allow_menu_override" boolean DEFAULT false,
	"allow_pricing_override" boolean DEFAULT false,
	"settings" json DEFAULT '{}'::json,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text,
	"supplier_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"status" text DEFAULT 'RECEIVED',
	"received_by" text,
	"reference_number" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "grn_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"grn_id" text NOT NULL,
	"item_id" text NOT NULL,
	"po_item_id" integer,
	"received_qty" real NOT NULL,
	"rejected_qty" real DEFAULT 0,
	"unit_price" real NOT NULL,
	"expiry_date" timestamp,
	"batch_number" text
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"scope" text DEFAULT 'ORDER_CREATE' NOT NULL,
	"request_hash" text NOT NULL,
	"resource_id" text,
	"response_code" integer,
	"response_body" json,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"url" text NOT NULL,
	"filename" text,
	"content_type" text,
	"width" integer,
	"height" integer,
	"size" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "internal_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"is_read" boolean DEFAULT false,
	"is_archived" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"batch_number" text NOT NULL,
	"received_date" timestamp DEFAULT now() NOT NULL,
	"expiry_date" timestamp NOT NULL,
	"initial_qty" real NOT NULL,
	"current_qty" real NOT NULL,
	"unit_cost" real NOT NULL,
	"supplier_id" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"sku" text,
	"barcode" text,
	"unit" text NOT NULL,
	"category" text,
	"threshold" real DEFAULT 0,
	"cost_price" real DEFAULT 0,
	"purchase_price" real DEFAULT 0,
	"supplier_id" text,
	"is_audited" boolean DEFAULT true,
	"audit_frequency" text DEFAULT 'DAILY',
	"is_composite" boolean DEFAULT false,
	"bom" json DEFAULT '[]'::json,
	"is_active" boolean DEFAULT true,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "inventory_items_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "inventory_stock" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"quantity" real DEFAULT 0,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "item_daily_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"branch_id" text,
	"date" date NOT NULL,
	"quantity_sold" real DEFAULT 0,
	"total_sales" real DEFAULT 0,
	"total_cost" real DEFAULT 0,
	"gross_profit" real DEFAULT 0,
	"avg_price" real DEFAULT 0,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_titles" (
	"id" text PRIMARY KEY NOT NULL,
	"department_id" text,
	"title" text NOT NULL,
	"name_ar" text,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_number" serial NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"reference" text,
	"reference_type" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'POSTED' NOT NULL,
	"fiscal_period_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"journal_entry_id" text NOT NULL,
	"account_id" text NOT NULL,
	"cost_center_id" text,
	"debit" real DEFAULT 0 NOT NULL,
	"credit" real DEFAULT 0 NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "kds_ticket_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"kds_ticket_id" text NOT NULL,
	"order_item_id" serial NOT NULL,
	"menu_item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"modifiers_text" text,
	"is_bumped" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "kds_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"order_id" text NOT NULL,
	"routing_station" text NOT NULL,
	"target_time" timestamp,
	"status" text DEFAULT 'PENDING',
	"priority" text DEFAULT 'NORMAL',
	"printed_at" timestamp,
	"bumped_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"leave_type_id" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"total_days" real NOT NULL,
	"reason" text,
	"status" text DEFAULT 'PENDING',
	"approved_by" text,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"days_per_year" real NOT NULL,
	"is_paid" boolean DEFAULT true,
	"requires_approval" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "loyalty_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"points" integer NOT NULL,
	"type" text NOT NULL,
	"reference_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loyalty_rewards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"points_cost" integer NOT NULL,
	"type" text NOT NULL,
	"reward_value" real,
	"menu_item_id" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "manager_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"manager_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"action_type" text NOT NULL,
	"related_id" text,
	"reason" text NOT NULL,
	"details" json,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"description" text,
	"icon" text,
	"image" text,
	"color" text,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"target_order_types" json DEFAULT '[]'::json,
	"menu_ids" json DEFAULT '["menu-1"]'::json,
	"printer_ids" json DEFAULT '[]'::json,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "menu_item_modifiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"modifier_group_id" text NOT NULL,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text,
	"name" text NOT NULL,
	"name_ar" text,
	"description" text,
	"description_ar" text,
	"price" real NOT NULL,
	"cost" real DEFAULT 0,
	"image" text,
	"status" text DEFAULT 'published',
	"approved_by" text,
	"approved_at" timestamp,
	"published_at" timestamp,
	"previous_price" real,
	"pending_price" real,
	"price_change_reason" text,
	"price_approved_by" text,
	"price_approved_at" timestamp,
	"is_available" boolean DEFAULT true,
	"available_from" text,
	"available_to" text,
	"available_days" json,
	"modifier_groups" json,
	"preparation_time" integer DEFAULT 15,
	"printer_ids" json,
	"is_popular" boolean DEFAULT false,
	"is_featured" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"layout_type" text DEFAULT 'standard',
	"barcode" text,
	"sku" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"min_selection" integer DEFAULT 0,
	"max_selection" integer DEFAULT 1,
	"is_required" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "modifier_options" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"price" real DEFAULT 0,
	"sort_order" integer DEFAULT 0,
	"is_available" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'INFO',
	"is_read" boolean DEFAULT false,
	"action_url" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"menu_item_id" text,
	"name" text NOT NULL,
	"name_ar" text,
	"price" real NOT NULL,
	"cost" real DEFAULT 0,
	"quantity" integer NOT NULL,
	"notes" text,
	"modifiers" json,
	"status" text DEFAULT 'PENDING',
	"prepared_at" timestamp,
	"served_at" timestamp,
	"seat_number" integer,
	"course" text
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"status" text NOT NULL,
	"changed_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_order_id" text,
	"order_number" serial NOT NULL,
	"type" text NOT NULL,
	"source" text DEFAULT 'pos',
	"branch_id" text NOT NULL,
	"table_id" text,
	"customer_id" text,
	"customer_name" text,
	"customer_phone" text,
	"delivery_address" text,
	"delivery_address_id" integer,
	"is_call_center_order" boolean DEFAULT false,
	"call_center_agent_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"subtotal" real NOT NULL,
	"discount" real DEFAULT 0,
	"discount_type" text,
	"discount_reason" text,
	"tax" real NOT NULL,
	"delivery_fee" real DEFAULT 0,
	"service_charge" real DEFAULT 0,
	"total" real NOT NULL,
	"tip_amount" real DEFAULT 0,
	"free_delivery" boolean DEFAULT false,
	"is_urgent" boolean DEFAULT false,
	"is_paid" boolean DEFAULT false,
	"payment_method" text,
	"paid_amount" real,
	"change_amount" real,
	"notes" text,
	"kitchen_notes" text,
	"delivery_notes" text,
	"driver_id" text,
	"estimated_delivery_time" timestamp,
	"actual_delivery_time" timestamp,
	"sync_status" text DEFAULT 'SYNCED',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"shift_id" text,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "overtime_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"regular_hours" real DEFAULT 0,
	"overtime_hours" real NOT NULL,
	"overtime_rate" real DEFAULT 1.5,
	"overtime_amount" real NOT NULL,
	"status" text DEFAULT 'PENDING',
	"approved_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_method_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_method" text NOT NULL,
	"account_id" text NOT NULL,
	"branch_id" text,
	CONSTRAINT "payment_method_accounts_payment_method_unique" UNIQUE("payment_method")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"method" text NOT NULL,
	"amount" real NOT NULL,
	"reference_number" text,
	"status" text DEFAULT 'COMPLETED',
	"processed_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"base_salary" real NOT NULL,
	"overtime_pay" real DEFAULT 0,
	"bonuses" real DEFAULT 0,
	"deductions" real DEFAULT 0,
	"net_salary" real NOT NULL,
	"status" text DEFAULT 'DRAFT',
	"paid_at" timestamp,
	"processed_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_cycles" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"total_amount" real DEFAULT 0,
	"executed_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"basic_salary" real NOT NULL,
	"deductions" real DEFAULT 0,
	"overtime" real DEFAULT 0,
	"net_pay" real NOT NULL,
	"status" text DEFAULT 'PENDING',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "permission_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"description" text,
	"description_ar" text,
	"category" text NOT NULL,
	"category_ar" text,
	"sub_category" text,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"depends_on" json DEFAULT '[]'::json,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "permission_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "posting_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"document_type" text NOT NULL,
	"amount_source" text NOT NULL,
	"direction" text NOT NULL,
	"account_code" text NOT NULL,
	"condition_field" text,
	"condition_value" text,
	"is_active" boolean DEFAULT true,
	"is_system" boolean DEFAULT false,
	"version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "printers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"type" text NOT NULL,
	"address" text,
	"location" text,
	"role" text DEFAULT 'OTHER',
	"is_primary_cashier" boolean DEFAULT false,
	"last_heartbeat_at" timestamp,
	"heartbeat_status" text DEFAULT 'UNKNOWN',
	"branch_id" text,
	"is_active" boolean DEFAULT true,
	"paper_width" integer DEFAULT 80,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "production_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"production_order_id" text NOT NULL,
	"inventory_item_id" text NOT NULL,
	"required_qty" real NOT NULL,
	"actual_qty" real,
	"unit" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text,
	"target_item_id" text NOT NULL,
	"recipe_id" text,
	"batch_number" text NOT NULL,
	"batch_size" real DEFAULT 1 NOT NULL,
	"expected_yield" real NOT NULL,
	"actual_yield" real,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"warehouse_id" text NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"item_id" text NOT NULL,
	"ordered_qty" real NOT NULL,
	"received_qty" real DEFAULT 0,
	"unit_price" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"status" text DEFAULT 'DRAFT',
	"expected_date" timestamp,
	"subtotal" real DEFAULT 0,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "purchase_request_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"pr_id" text NOT NULL,
	"item_id" text NOT NULL,
	"requested_qty" real NOT NULL,
	"approved_qty" real
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"department" text,
	"status" text DEFAULT 'PENDING',
	"requested_by" text,
	"approved_by" text,
	"expected_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"inventory_item_id" text NOT NULL,
	"quantity" real NOT NULL,
	"unit" text NOT NULL,
	"notes" text,
	"last_known_cost" real,
	"last_cost_update" timestamp
);
--> statement-breakpoint
CREATE TABLE "recipe_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"version" integer NOT NULL,
	"yield" real DEFAULT 1,
	"instructions" text,
	"ingredients_snapshot" json,
	"calculated_cost" real,
	"changed_by" text,
	"change_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_item_id" text,
	"inventory_item_id" text,
	"yield" real DEFAULT 1,
	"instructions" text,
	"version" integer DEFAULT 1,
	"current_version_id" text,
	"calculated_cost" real,
	"last_cost_calculation" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recurring_journals" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"frequency" text NOT NULL,
	"next_run_date" timestamp NOT NULL,
	"status" text DEFAULT 'ACTIVE',
	"payload" jsonb NOT NULL,
	"last_run_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "refund_records" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"amount" real NOT NULL,
	"refund_method" text NOT NULL,
	"reason" text NOT NULL,
	"reason_category" text,
	"items" json,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requested_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"processed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"table_id" text,
	"customer_id" text,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"date" date NOT NULL,
	"time" text NOT NULL,
	"party_size" integer DEFAULT 2 NOT NULL,
	"duration" integer DEFAULT 90,
	"status" text DEFAULT 'CONFIRMED' NOT NULL,
	"special_requests" text,
	"notes" text,
	"source" text DEFAULT 'PHONE',
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"description" text,
	"description_ar" text,
	"permissions" json DEFAULT '[]'::json,
	"is_system" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 0,
	"color" text DEFAULT '#6366f1',
	"icon" text DEFAULT 'user',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" json NOT NULL,
	"category" text DEFAULT 'general',
	"updated_by" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"user_id" text NOT NULL,
	"opening_time" timestamp DEFAULT now() NOT NULL,
	"closing_time" timestamp,
	"opening_balance" real DEFAULT 0 NOT NULL,
	"expected_balance" real DEFAULT 0,
	"actual_balance" real DEFAULT 0,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_count_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"count_id" text NOT NULL,
	"item_id" text NOT NULL,
	"expected_qty" real DEFAULT 0,
	"counted_qty" real,
	"variance_qty" real,
	"cost" real DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"status" text DEFAULT 'DRAFT',
	"type" text DEFAULT 'FULL',
	"remarks" text,
	"created_by" text,
	"approved_by" text,
	"scheduled_date" timestamp,
	"frozen_at" timestamp,
	"posted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"from_warehouse_id" text,
	"to_warehouse_id" text,
	"quantity" real NOT NULL,
	"unit_cost" real DEFAULT 0,
	"total_cost" real DEFAULT 0,
	"type" text NOT NULL,
	"reference_id" text,
	"reason" text,
	"performed_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"item_id" text NOT NULL,
	"qty" real NOT NULL,
	"unit_price" real NOT NULL,
	"total" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"grn_id" text,
	"status" text DEFAULT 'DRAFT',
	"invoice_number" text,
	"date" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp,
	"subtotal" real DEFAULT 0,
	"tax" real DEFAULT 0,
	"discount" real DEFAULT 0,
	"total" real DEFAULT 0,
	"amount_paid" real DEFAULT 0,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"invoice_id" text,
	"amount" real NOT NULL,
	"payment_method" text NOT NULL,
	"reference" text,
	"status" text DEFAULT 'COMPLETED',
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"phone" text,
	"email" text,
	"address" text,
	"category" text,
	"payment_terms" text,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" json,
	"category" text,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"zone_id" text,
	"branch_id" text NOT NULL,
	"x" integer DEFAULT 0,
	"y" integer DEFAULT 0,
	"width" integer DEFAULT 100,
	"height" integer DEFAULT 100,
	"shape" text DEFAULT 'rectangle',
	"seats" integer DEFAULT 4,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"current_order_id" text,
	"locked_by_user_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tax_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_type" text NOT NULL,
	"account_id" text NOT NULL,
	"rate" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_id" text NOT NULL,
	"device_name" text,
	"user_agent" text,
	"ip_address" text,
	"is_active" boolean DEFAULT true,
	"revoked_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"last_seen_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_sessions_token_id_unique" UNIQUE("token_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"pin_code" text,
	"pin_code_hash" text,
	"role" text NOT NULL,
	"role_id" text,
	"permissions" json DEFAULT '[]'::json,
	"custom_permissions" json DEFAULT '{}'::json,
	"assigned_branch_id" text,
	"allowed_branches" json DEFAULT '[]'::json,
	"is_active" boolean DEFAULT true,
	"manager_pin" text,
	"mfa_enabled" boolean DEFAULT false,
	"mfa_secret" text,
	"pin_login_enabled" boolean DEFAULT false,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "waitlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"party_size" integer NOT NULL,
	"quoted_time_minutes" integer DEFAULT 0,
	"status" text DEFAULT 'WAITING',
	"table_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"seated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"amount" real NOT NULL,
	"type" text NOT NULL,
	"reference_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"branch_id" text,
	"type" text DEFAULT 'MAIN',
	"parent_id" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" json,
	"status" text DEFAULT 'PENDING',
	"http_status" integer,
	"response_body" text,
	"attempt" integer DEFAULT 1,
	"last_error" text,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"secret" text,
	"events" json DEFAULT '[]'::json,
	"is_active" boolean DEFAULT true,
	"branch_id" text,
	"headers" json DEFAULT '{}'::json,
	"retry_count" integer DEFAULT 3,
	"timeout_ms" integer DEFAULT 10000,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"customer_phone" text NOT NULL,
	"direction" text NOT NULL,
	"content" text NOT NULL,
	"message_type" text DEFAULT 'TEXT',
	"template_id" text,
	"status" text DEFAULT 'SENT' NOT NULL,
	"external_id" text,
	"failure_reason" text,
	"campaign_id" text,
	"order_id" text,
	"sent_at" timestamp DEFAULT now(),
	"delivered_at" timestamp,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_transactions" ADD CONSTRAINT "batch_transactions_batch_id_inventory_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."inventory_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_transactions" ADD CONSTRAINT "batch_transactions_stock_movement_id_stock_movements_id_fk" FOREIGN KEY ("stock_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_logs" ADD CONSTRAINT "campaign_logs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_logs" ADD CONSTRAINT "campaign_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_complaints" ADD CONSTRAINT "customer_complaints_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_complaints" ADD CONSTRAINT "customer_complaints_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_rfm_metrics" ADD CONSTRAINT "customer_rfm_metrics_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_wallets" ADD CONSTRAINT "customer_wallets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_branch_summaries" ADD CONSTRAINT "daily_branch_summaries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_close_reports" ADD CONSTRAINT "day_close_reports_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_close_reports" ADD CONSTRAINT "day_close_reports_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_close_reports" ADD CONSTRAINT "day_close_reports_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_close_reports" ADD CONSTRAINT "day_close_reports_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_manager_id_employees_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_telemetry" ADD CONSTRAINT "driver_telemetry_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_telemetry" ADD CONSTRAINT "driver_telemetry_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_telemetry_latest" ADD CONSTRAINT "driver_telemetry_latest_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_telemetry_latest" ADD CONSTRAINT "driver_telemetry_latest_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_zones" ADD CONSTRAINT "floor_zones_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_configurations" ADD CONSTRAINT "franchise_configurations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_grn_id_goods_receipt_notes_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."goods_receipt_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_po_item_id_purchase_order_items_id_fk" FOREIGN KEY ("po_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_messages" ADD CONSTRAINT "internal_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_messages" ADD CONSTRAINT "internal_messages_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_daily_snapshots" ADD CONSTRAINT "item_daily_snapshots_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_daily_snapshots" ADD CONSTRAINT "item_daily_snapshots_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_titles" ADD CONSTRAINT "job_titles_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kds_ticket_items" ADD CONSTRAINT "kds_ticket_items_kds_ticket_id_kds_tickets_id_fk" FOREIGN KEY ("kds_ticket_id") REFERENCES "public"."kds_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kds_tickets" ADD CONSTRAINT "kds_tickets_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kds_tickets" ADD CONSTRAINT "kds_tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_approvals" ADD CONSTRAINT "manager_approvals_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_approvals" ADD CONSTRAINT "manager_approvals_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_price_approved_by_users_id_fk" FOREIGN KEY ("price_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_entries" ADD CONSTRAINT "overtime_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_entries" ADD CONSTRAINT "overtime_entries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_accounts" ADD CONSTRAINT "payment_method_accounts_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_accounts" ADD CONSTRAINT "payment_method_accounts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll" ADD CONSTRAINT "payroll_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_cycles" ADD CONSTRAINT "payroll_cycles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_cycles" ADD CONSTRAINT "payroll_cycles_executed_by_users_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payouts" ADD CONSTRAINT "payroll_payouts_cycle_id_payroll_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."payroll_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payouts" ADD CONSTRAINT "payroll_payouts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_target_item_id_inventory_items_id_fk" FOREIGN KEY ("target_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_pr_id_purchase_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_stock_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_counts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_items" ADD CONSTRAINT "supplier_invoice_items_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_items" ADD CONSTRAINT "supplier_invoice_items_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_grn_id_goods_receipt_notes_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."goods_receipt_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_zone_id_floor_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."floor_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_accounts" ADD CONSTRAINT "tax_accounts_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlists" ADD CONSTRAINT "waitlists_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlists" ADD CONSTRAINT "waitlists_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_customer_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."customer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_employee_date_idx" ON "attendance" USING btree ("employee_id","clock_in");--> statement-breakpoint
CREATE INDEX "budget_lines_budget_idx" ON "budget_lines" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "budget_lines_account_idx" ON "budget_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "coa_type_idx" ON "chart_of_accounts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "coa_code_idx" ON "chart_of_accounts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_customer_rfm_unique" ON "customer_rfm_metrics" USING btree ("customer_id","branch_id");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_branch_summary_date" ON "daily_branch_summaries" USING btree ("branch_id","date");--> statement-breakpoint
CREATE INDEX "day_close_branch_date_idx" ON "day_close_reports" USING btree ("branch_id","date");--> statement-breakpoint
CREATE INDEX "delivery_assignments_order_idx" ON "delivery_assignments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_assignments_driver_idx" ON "delivery_assignments" USING btree ("driver_id","status");--> statement-breakpoint
CREATE INDEX "idx_telemetry_driver" ON "driver_telemetry" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_telemetry_branch" ON "driver_telemetry" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_telemetry_created" ON "driver_telemetry" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "employees_branch_idx" ON "employees" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_key_scope_idx" ON "idempotency_keys" USING btree ("key","scope");--> statement-breakpoint
CREATE INDEX "fefo_idx" ON "inventory_batches" USING btree ("item_id","warehouse_id","expiry_date","status");--> statement-breakpoint
CREATE INDEX "inv_batches_item_expiry_idx" ON "inventory_batches" USING btree ("item_id","expiry_date");--> statement-breakpoint
CREATE INDEX "idx_inventory_items_barcode" ON "inventory_items" USING btree ("barcode") WHERE barcode IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_inventory_items_sku" ON "inventory_items" USING btree ("sku") WHERE sku IS NOT NULL;--> statement-breakpoint
CREATE INDEX "inv_stock_item_wh_idx" ON "inventory_stock" USING btree ("item_id","warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_item_snapshot_date" ON "item_daily_snapshots" USING btree ("menu_item_id","branch_id","date");--> statement-breakpoint
CREATE INDEX "je_ref_idx" ON "journal_entries" USING btree ("reference","reference_type");--> statement-breakpoint
CREATE INDEX "je_date_status_idx" ON "journal_entries" USING btree ("date","status");--> statement-breakpoint
CREATE INDEX "je_source_idx" ON "journal_entries" USING btree ("reference_type");--> statement-breakpoint
CREATE INDEX "jl_acc_cc_idx" ON "journal_lines" USING btree ("account_id","cost_center_id");--> statement-breakpoint
CREATE INDEX "jl_entry_idx" ON "journal_lines" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "jl_account_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "menu_items_category_idx" ON "menu_items" USING btree ("category_id","is_available");--> statement-breakpoint
CREATE INDEX "idx_menu_items_barcode" ON "menu_items" USING btree ("barcode") WHERE barcode IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_menu_items_sku" ON "menu_items" USING btree ("sku") WHERE sku IS NOT NULL;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_menu_item_idx" ON "order_items" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "orders_branch_date_idx" ON "orders" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_shift_idx" ON "orders" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_payroll_user_month" ON "payroll" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX "reservations_branch_date_idx" ON "reservations" USING btree ("branch_id","date");--> statement-breakpoint
CREATE INDEX "shifts_branch_status_idx" ON "shifts" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "stock_mov_item_date_idx" ON "stock_movements" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "user_sessions_user_active_idx" ON "user_sessions" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "user_sessions_last_seen_idx" ON "user_sessions" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "user_sessions_expires_idx" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_webhook_delivery_endpoint" ON "webhook_deliveries" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_delivery_event" ON "webhook_deliveries" USING btree ("event");--> statement-breakpoint
CREATE INDEX "idx_webhook_delivery_status" ON "webhook_deliveries" USING btree ("status");