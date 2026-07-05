import { pgTable, text, boolean, integer, timestamp, jsonb, foreignKey, serial, real, json, index, uniqueIndex, unique, numeric, varchar, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const postingRules = pgTable("posting_rules", {
	id: text().primaryKey().notNull(),
	documentType: text("document_type").notNull(),
	amountSource: text("amount_source").notNull(),
	direction: text().notNull(),
	accountCode: text("account_code").notNull(),
	conditionField: text("condition_field"),
	conditionValue: text("condition_value"),
	isActive: boolean("is_active").default(true),
	isSystem: boolean("is_system").default(false),
	version: integer().default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const financeExceptions = pgTable("finance_exceptions", {
	id: text().primaryKey().notNull(),
	reference: text(),
	referenceType: text("reference_type"),
	payload: jsonb(),
	reason: text().notNull(),
	status: text().default('PENDING'),
	resolvedBy: text("resolved_by"),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
	resolutionNotes: text("resolution_notes"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const goodsReceiptNotes = pgTable("goods_receipt_notes", {
	id: text().primaryKey().notNull(),
	poId: text("po_id"),
	supplierId: text("supplier_id").notNull(),
	branchId: text("branch_id").notNull(),
	status: text().default('RECEIVED'),
	receivedBy: text("received_by"),
	referenceNumber: text("reference_number"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "goods_receipt_notes_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.poId],
			foreignColumns: [purchaseOrders.id],
			name: "goods_receipt_notes_po_id_fkey"
		}),
	foreignKey({
			columns: [table.receivedBy],
			foreignColumns: [users.id],
			name: "goods_receipt_notes_received_by_fkey"
		}),
	foreignKey({
			columns: [table.supplierId],
			foreignColumns: [suppliers.id],
			name: "goods_receipt_notes_supplier_id_fkey"
		}),
]);

export const grnItems = pgTable("grn_items", {
	id: serial().primaryKey().notNull(),
	grnId: text("grn_id").notNull(),
	itemId: text("item_id").notNull(),
	poItemId: integer("po_item_id"),
	receivedQty: real("received_qty").notNull(),
	rejectedQty: real("rejected_qty").default(0),
	unitPrice: real("unit_price").notNull(),
	expiryDate: timestamp("expiry_date", { mode: 'string' }),
	batchNumber: text("batch_number"),
}, (table) => [
	foreignKey({
			columns: [table.grnId],
			foreignColumns: [goodsReceiptNotes.id],
			name: "grn_items_grn_id_fkey"
		}),
	foreignKey({
			columns: [table.itemId],
			foreignColumns: [inventoryItems.id],
			name: "grn_items_item_id_fkey"
		}),
	foreignKey({
			columns: [table.poItemId],
			foreignColumns: [purchaseOrderItems.id],
			name: "grn_items_po_item_id_fkey"
		}),
]);

export const recurringJournals = pgTable("recurring_journals", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	frequency: text().notNull(),
	nextRunDate: timestamp("next_run_date", { mode: 'string' }).notNull(),
	status: text().default('ACTIVE'),
	payload: jsonb().notNull(),
	lastRunDate: timestamp("last_run_date", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const supplierInvoices = pgTable("supplier_invoices", {
	id: text().primaryKey().notNull(),
	supplierId: text("supplier_id").notNull(),
	grnId: text("grn_id"),
	status: text().default('DRAFT'),
	invoiceNumber: text("invoice_number"),
	date: timestamp({ mode: 'string' }).defaultNow().notNull(),
	dueDate: timestamp("due_date", { mode: 'string' }),
	subtotal: real().default(0),
	tax: real().default(0),
	discount: real().default(0),
	total: real().default(0),
	amountPaid: real("amount_paid").default(0),
	notes: text(),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "supplier_invoices_created_by_fkey"
		}),
	foreignKey({
			columns: [table.grnId],
			foreignColumns: [goodsReceiptNotes.id],
			name: "supplier_invoices_grn_id_fkey"
		}),
	foreignKey({
			columns: [table.supplierId],
			foreignColumns: [suppliers.id],
			name: "supplier_invoices_supplier_id_fkey"
		}),
]);

export const orderItems = pgTable("order_items", {
	id: serial().primaryKey().notNull(),
	orderId: text("order_id").notNull(),
	menuItemId: text("menu_item_id"),
	name: text().notNull(),
	nameAr: text("name_ar"),
	price: real().notNull(),
	quantity: integer().notNull(),
	notes: text(),
	modifiers: json(),
	status: text().default('PENDING'),
	preparedAt: timestamp("prepared_at", { mode: 'string' }),
	servedAt: timestamp("served_at", { mode: 'string' }),
	seatNumber: integer("seat_number"),
	course: text(),
	cost: real().default(0),
}, (table) => [
	foreignKey({
			columns: [table.menuItemId],
			foreignColumns: [menuItems.id],
			name: "order_items_menu_item_id_menu_items_id_fk"
		}),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "order_items_order_id_orders_id_fk"
		}),
]);

export const supplierInvoiceItems = pgTable("supplier_invoice_items", {
	id: serial().primaryKey().notNull(),
	invoiceId: text("invoice_id").notNull(),
	itemId: text("item_id").notNull(),
	qty: real().notNull(),
	unitPrice: real("unit_price").notNull(),
	total: real().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.invoiceId],
			foreignColumns: [supplierInvoices.id],
			name: "supplier_invoice_items_invoice_id_fkey"
		}),
	foreignKey({
			columns: [table.itemId],
			foreignColumns: [inventoryItems.id],
			name: "supplier_invoice_items_item_id_fkey"
		}),
]);

export const modifierOptions = pgTable("modifier_options", {
	id: text().primaryKey().notNull(),
	groupId: text("group_id").notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	price: real().default(0),
	sortOrder: integer("sort_order").default(0),
	isAvailable: boolean("is_available").default(true),
}, (table) => [
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [modifierGroups.id],
			name: "modifier_options_group_id_modifier_groups_id_fk"
		}),
]);

export const recipeVersions = pgTable("recipe_versions", {
	id: text().primaryKey().notNull(),
	recipeId: text("recipe_id").notNull(),
	version: integer().notNull(),
	yield: real().default(1),
	sizeId: text("size_id"),
	instructions: text(),
	ingredientsSnapshot: json("ingredients_snapshot"),
	calculatedCost: real("calculated_cost"),
	changedBy: text("changed_by"),
	changeReason: text("change_reason"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.changedBy],
			foreignColumns: [users.id],
			name: "recipe_versions_changed_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [recipes.id],
			name: "recipe_versions_recipe_id_recipes_id_fk"
		}),
]);

export const journalLines = pgTable("journal_lines", {
	id: serial().primaryKey().notNull(),
	journalEntryId: text("journal_entry_id").notNull(),
	accountId: text("account_id").notNull(),
	costCenterId: text("cost_center_id"),
	debit: real().default(0).notNull(),
	credit: real().default(0).notNull(),
	description: text(),
}, (table) => [
	index("jl_acc_cc_idx").using("btree", table.accountId.asc().nullsLast().op("text_ops"), table.costCenterId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [chartOfAccounts.id],
			name: "journal_lines_account_id_chart_of_accounts_id_fk"
		}),
	foreignKey({
			columns: [table.costCenterId],
			foreignColumns: [costCenters.id],
			name: "journal_lines_cost_center_id_cost_centers_id_fk"
		}),
	foreignKey({
			columns: [table.journalEntryId],
			foreignColumns: [journalEntries.id],
			name: "journal_lines_journal_entry_id_journal_entries_id_fk"
		}),
]);

export const attendanceDeviceMappings = pgTable("attendance_device_mappings", {
	id: serial().primaryKey().notNull(),
	deviceId: text("device_id").notNull(),
	employeeId: text("employee_id").notNull(),
	deviceUserId: text("device_user_id").notNull(),
	employeeCodeSnapshot: text("employee_code_snapshot"),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("attendance_device_mappings_device_user_idx").using("btree", table.deviceId.asc().nullsLast().op("text_ops"), table.deviceUserId.asc().nullsLast().op("text_ops")).where(sql`(is_active = true)`),
	index("attendance_device_mappings_employee_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [attendanceDevices.id],
			name: "attendance_device_mappings_device_id_attendance_devices_id_fk"
		}),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [attendanceDevices.id],
			name: "attendance_device_mappings_device_id_fkey"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_device_mappings_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_device_mappings_employee_id_fkey"
		}),
]);

export const branches = pgTable("branches", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	location: text(),
	address: text(),
	phone: text(),
	email: text(),
	isActive: boolean("is_active").default(true),
	timezone: text().default('Africa/Cairo'),
	currency: text().default('EGP'),
	taxRate: real("tax_rate").default(14),
	serviceCharge: real("service_charge").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	serverIp: text("server_ip"),
	dayCloseEmails: json("day_close_emails").default([]),
});

export const menuCategories = pgTable("menu_categories", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	description: text(),
	icon: text(),
	image: text(),
	color: text(),
	sortOrder: integer("sort_order").default(0),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	targetOrderTypes: json("target_order_types").default([]),
	menuIds: json("menu_ids").default(["menu-1"]),
	printerIds: json("printer_ids").default([]),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
});

export const printers = pgTable("printers", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	type: text().notNull(),
	address: text(),
	location: text(),
	branchId: text("branch_id"),
	isActive: boolean("is_active").default(true),
	paperWidth: integer("paper_width").default(80),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	code: text(),
	role: text().default('OTHER'),
	isPrimaryCashier: boolean("is_primary_cashier").default(false),
	lastHeartbeatAt: timestamp("last_heartbeat_at", { mode: 'string' }),
	heartbeatStatus: text("heartbeat_status").default('UNKNOWN'),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	roles: json().default([]),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "printers_branch_id_branches_id_fk"
		}),
]);

export const menuItems = pgTable("menu_items", {
	id: text().primaryKey().notNull(),
	categoryId: text("category_id"),
	name: text().notNull(),
	nameAr: text("name_ar"),
	description: text(),
	descriptionAr: text("description_ar"),
	price: real().notNull(),
	cost: real().default(0),
	image: text(),
	isAvailable: boolean("is_available").default(true),
	availableFrom: text("available_from"),
	availableTo: text("available_to"),
	availableDays: json("available_days"),
	preparationTime: integer("preparation_time").default(15),
	printerIds: json("printer_ids"),
	isPopular: boolean("is_popular").default(false),
	isFeatured: boolean("is_featured").default(false),
	sortOrder: integer("sort_order").default(0),
	layoutType: text("layout_type").default('standard'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	modifierGroups: json("modifier_groups"),
	status: text().default('published'),
	approvedBy: text("approved_by"),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	publishedAt: timestamp("published_at", { mode: 'string' }),
	previousPrice: real("previous_price"),
	pendingPrice: real("pending_price"),
	priceChangeReason: text("price_change_reason"),
	priceApprovedBy: text("price_approved_by"),
	priceApprovedAt: timestamp("price_approved_at", { mode: 'string' }),
	barcode: text(),
	sku: text(),
	printRoles: json("print_roles").default([]),
	branchPricing: jsonb("branch_pricing"),
	platformPricing: jsonb("platform_pricing"),
	sizes: jsonb().default([]),
	isTaxExempt: boolean("is_tax_exempt").default(false),
}, (table) => [
	index("idx_menu_items_barcode").using("btree", table.barcode.asc().nullsLast().op("text_ops")).where(sql`(barcode IS NOT NULL)`),
	index("idx_menu_items_sku").using("btree", table.sku.asc().nullsLast().op("text_ops")).where(sql`(sku IS NOT NULL)`),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "menu_items_approved_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [menuCategories.id],
			name: "menu_items_category_id_menu_categories_id_fk"
		}),
	foreignKey({
			columns: [table.priceApprovedBy],
			foreignColumns: [users.id],
			name: "menu_items_price_approved_by_users_id_fk"
		}),
]);

export const attendanceDevices = pgTable("attendance_devices", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	code: text(),
	vendor: text().default('ZKTeco').notNull(),
	model: text(),
	sourceType: text("source_type").default('BIOMETRIC_ZK').notNull(),
	ipAddress: text("ip_address"),
	port: integer(),
	serialNumber: text("serial_number"),
	communicationMode: text("communication_mode").default('LAN'),
	branchGatewayId: text("branch_gateway_id"),
	isActive: boolean("is_active").default(true),
	lastSeenAt: timestamp("last_seen_at", { mode: 'string' }),
	lastSyncAt: timestamp("last_sync_at", { mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("attendance_devices_branch_source_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.sourceType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_devices_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_devices_branch_id_fkey"
		}),
]);

export const attendanceRawLogs = pgTable("attendance_raw_logs", {
	id: text().primaryKey().notNull(),
	syncRunId: text("sync_run_id"),
	deviceId: text("device_id"),
	employeeId: text("employee_id"),
	branchId: text("branch_id").notNull(),
	sourceType: text("source_type").default('BIOMETRIC_ZK').notNull(),
	eventType: text("event_type").default('UNKNOWN').notNull(),
	employeeIdentifier: text("employee_identifier"),
	deviceUserId: text("device_user_id"),
	occurredAt: timestamp("occurred_at", { mode: 'string' }).notNull(),
	deviceOccurredAt: timestamp("device_occurred_at", { mode: 'string' }),
	geoLat: numeric("geo_lat"),
	geoLng: numeric("geo_lng"),
	geoAccuracyMeters: numeric("geo_accuracy_meters"),
	confidenceScore: numeric("confidence_score"),
	imageUrl: text("image_url"),
	dedupeHash: text("dedupe_hash"),
	processingStatus: text("processing_status").default('PENDING'),
	processingNotes: text("processing_notes"),
	rawPayload: jsonb("raw_payload").default({}),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("attendance_raw_logs_branch_occurred_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.occurredAt.asc().nullsLast().op("timestamp_ops")),
	uniqueIndex("attendance_raw_logs_dedupe_idx").using("btree", table.dedupeHash.asc().nullsLast().op("text_ops")),
	index("attendance_raw_logs_employee_occurred_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.occurredAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_raw_logs_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_raw_logs_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [attendanceDevices.id],
			name: "attendance_raw_logs_device_id_attendance_devices_id_fk"
		}),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [attendanceDevices.id],
			name: "attendance_raw_logs_device_id_fkey"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_raw_logs_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_raw_logs_employee_id_fkey"
		}),
	foreignKey({
			columns: [table.syncRunId],
			foreignColumns: [attendanceSyncRuns.id],
			name: "attendance_raw_logs_sync_run_id_attendance_sync_runs_id_fk"
		}),
	unique("attendance_raw_logs_dedupe_hash_key").on(table.dedupeHash),
]);

export const users = pgTable("users", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text(),
	passwordHash: text("password_hash"),
	role: text().notNull(),
	permissions: json().default([]),
	assignedBranchId: text("assigned_branch_id"),
	isActive: boolean("is_active").default(true),
	lastLoginAt: timestamp("last_login_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	managerPin: text("manager_pin"),
	mfaEnabled: boolean("mfa_enabled").default(false),
	mfaSecret: text("mfa_secret"),
	pinCode: text("pin_code"),
	pinCodeHash: text("pin_code_hash"),
	roleId: text("role_id"),
	customPermissions: json("custom_permissions").default({}),
	allowedBranches: json("allowed_branches").default([]),
	pinLoginEnabled: boolean("pin_login_enabled").default(false),
}, (table) => [
	unique("users_email_unique").on(table.email),
]);

export const inventoryItems = pgTable("inventory_items", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	sku: text(),
	barcode: text(),
	unit: text().notNull(),
	category: text(),
	threshold: real().default(0),
	costPrice: real("cost_price").default(0),
	supplierId: text("supplier_id"),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	purchasePrice: real("purchase_price").default(0),
	isAudited: boolean("is_audited").default(true),
	auditFrequency: text("audit_frequency").default('DAILY'),
	isComposite: boolean("is_composite").default(false),
	bom: json().default([]),
}, (table) => [
	index("idx_inventory_items_barcode").using("btree", table.barcode.asc().nullsLast().op("text_ops")).where(sql`(barcode IS NOT NULL)`),
	index("idx_inventory_items_sku").using("btree", table.sku.asc().nullsLast().op("text_ops")).where(sql`(sku IS NOT NULL)`),
	unique("inventory_items_sku_unique").on(table.sku),
]);

export const suppliers = pgTable("suppliers", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	contactPerson: text("contact_person"),
	phone: text(),
	email: text(),
	address: text(),
	category: text(),
	paymentTerms: text("payment_terms"),
	notes: text(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const customers = pgTable("customers", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	phone: varchar({ length: 20 }).notNull(),
	email: text(),
	address: text(),
	lat: real(),
	lng: real(),
	addressLabel: text("address_label"),
	area: text(),
	building: text(),
	floor: text(),
	apartment: text(),
	landmark: text(),
	notes: text(),
	visits: integer().default(0),
	totalSpent: real("total_spent").default(0),
	loyaltyTier: text("loyalty_tier").default('Bronze'),
	loyaltyPoints: integer("loyalty_points").default(0),
	source: text().default('call_center'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	zoneId: integer("zone_id"),
}, (table) => [
	unique("customers_phone_unique").on(table.phone),
]);

export const customerAddresses = pgTable("customer_addresses", {
	id: serial().primaryKey().notNull(),
	customerId: text("customer_id").notNull(),
	label: text().notNull(),
	address: text().notNull(),
	lat: real(),
	lng: real(),
	area: text(),
	building: text(),
	floor: text(),
	apartment: text(),
	landmark: text(),
	isDefault: boolean("is_default").default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "customer_addresses_customer_id_customers_id_fk"
		}),
]);

export const attendanceSyncRuns = pgTable("attendance_sync_runs", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id"),
	deviceId: text("device_id"),
	sourceType: text("source_type").notNull(),
	status: text().default('IN_PROGRESS'),
	logsReceived: integer("logs_received").default(0),
	logsAccepted: integer("logs_accepted").default(0),
	logsRejected: integer("logs_rejected").default(0),
	errorMessage: text("error_message"),
	metadata: jsonb().default({}),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_sync_runs_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_sync_runs_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [attendanceDevices.id],
			name: "attendance_sync_runs_device_id_attendance_devices_id_fk"
		}),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [attendanceDevices.id],
			name: "attendance_sync_runs_device_id_fkey"
		}),
]);

export const systemSettings = pgTable("system_settings", {
	id: serial().primaryKey().notNull(),
	key: text().notNull(),
	value: json(),
	category: text(),
	updatedBy: text("updated_by"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("system_settings_key_unique").on(table.key),
]);

export const settings = pgTable("settings", {
	key: text().primaryKey().notNull(),
	value: json().notNull(),
	category: text().default('general'),
	updatedBy: text("updated_by"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const deliveryZones = pgTable("delivery_zones", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	branchId: text("branch_id").notNull(),
	deliveryFee: real("delivery_fee").default(0),
	minOrderAmount: real("min_order_amount").default(0),
	estimatedTime: integer("estimated_time").default(45),
	isActive: boolean("is_active").default(true),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "delivery_zones_branch_id_branches_id_fk"
		}),
]);

export const floorZones = pgTable("floor_zones", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	branchId: text("branch_id").notNull(),
	width: integer().default(800),
	height: integer().default(600),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "floor_zones_branch_id_branches_id_fk"
		}),
]);

export const warehouses = pgTable("warehouses", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	branchId: text("branch_id"),
	type: text().default('MAIN'),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	nameAr: text("name_ar"),
	parentId: text("parent_id"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "warehouses_branch_id_branches_id_fk"
		}),
]);

export const drivers = pgTable("drivers", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	phone: text().notNull(),
	branchId: text("branch_id"),
	status: text().default('AVAILABLE'),
	currentCashBalance: real("current_cash_balance").default(0),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "drivers_branch_id_branches_id_fk"
		}),
]);

export const payrollCycles = pgTable("payroll_cycles", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	periodStart: timestamp("period_start", { mode: 'string' }).notNull(),
	periodEnd: timestamp("period_end", { mode: 'string' }).notNull(),
	status: text().default('DRAFT').notNull(),
	totalAmount: real("total_amount").default(0),
	executedBy: text("executed_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payroll_cycles_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.executedBy],
			foreignColumns: [users.id],
			name: "payroll_cycles_executed_by_users_id_fk"
		}),
]);

export const managerApprovals = pgTable("manager_approvals", {
	id: serial().primaryKey().notNull(),
	managerId: text("manager_id").notNull(),
	branchId: text("branch_id").notNull(),
	actionType: text("action_type").notNull(),
	relatedId: text("related_id"),
	reason: text().notNull(),
	details: json(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "manager_approvals_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.managerId],
			foreignColumns: [users.id],
			name: "manager_approvals_manager_id_users_id_fk"
		}),
]);

export const attendanceGeofences = pgTable("attendance_geofences", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	latitude: real().notNull(),
	longitude: real().notNull(),
	radiusMeters: real("radius_meters").default(150).notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("attendance_geofences_branch_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.isActive.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_geofences_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_geofences_branch_id_fkey"
		}),
]);

export const attendanceSessions = pgTable("attendance_sessions", {
	id: text().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	branchId: text("branch_id").notNull(),
	sourceType: text("source_type").notNull(),
	status: text().default('OPEN').notNull(),
	checkInRawLogId: text("check_in_raw_log_id"),
	checkOutRawLogId: text("check_out_raw_log_id"),
	clockInAt: timestamp("clock_in_at", { mode: 'string' }).notNull(),
	clockOutAt: timestamp("clock_out_at", { mode: 'string' }),
	totalHours: real("total_hours").default(0).notNull(),
	lateMinutes: integer("late_minutes").default(0).notNull(),
	earlyLeaveMinutes: integer("early_leave_minutes").default(0).notNull(),
	overtimeMinutes: integer("overtime_minutes").default(0).notNull(),
	riskFlags: jsonb("risk_flags").default([]),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("attendance_sessions_branch_status_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("attendance_sessions_employee_clock_in_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.clockInAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_sessions_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_sessions_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.checkInRawLogId],
			foreignColumns: [attendanceRawLogs.id],
			name: "attendance_sessions_check_in_raw_log_id_attendance_raw_logs_id_"
		}),
	foreignKey({
			columns: [table.checkInRawLogId],
			foreignColumns: [attendanceRawLogs.id],
			name: "attendance_sessions_check_in_raw_log_id_fkey"
		}),
	foreignKey({
			columns: [table.checkOutRawLogId],
			foreignColumns: [attendanceRawLogs.id],
			name: "attendance_sessions_check_out_raw_log_id_attendance_raw_logs_id"
		}),
	foreignKey({
			columns: [table.checkOutRawLogId],
			foreignColumns: [attendanceRawLogs.id],
			name: "attendance_sessions_check_out_raw_log_id_fkey"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_sessions_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_sessions_employee_id_fkey"
		}),
]);

export const tables = pgTable("tables", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	zoneId: text("zone_id"),
	branchId: text("branch_id").notNull(),
	x: integer().default(0),
	y: integer().default(0),
	width: integer().default(100),
	height: integer().default(100),
	shape: text().default('rectangle'),
	seats: integer().default(4),
	status: text().default('AVAILABLE').notNull(),
	currentOrderId: text("current_order_id"),
	lockedByUserId: text("locked_by_user_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "tables_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.zoneId],
			foreignColumns: [floorZones.id],
			name: "tables_zone_id_floor_zones_id_fk"
		}),
]);

export const userSessions = pgTable("user_sessions", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	tokenId: text("token_id").notNull(),
	deviceName: text("device_name"),
	userAgent: text("user_agent"),
	ipAddress: text("ip_address"),
	isActive: boolean("is_active").default(true),
	revokedAt: timestamp("revoked_at", { mode: 'string' }),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	lastSeenAt: timestamp("last_seen_at", { mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_sessions_user_id_users_id_fk"
		}),
	unique("user_sessions_token_id_unique").on(table.tokenId),
]);

export const fiscalLogs = pgTable("fiscal_logs", {
	id: serial().primaryKey().notNull(),
	orderId: text("order_id"),
	branchId: text("branch_id"),
	status: text().notNull(),
	attempt: integer().default(0),
	lastError: text("last_error"),
	payload: json(),
	response: json(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const permissionDefinitions = pgTable("permission_definitions", {
	id: text().primaryKey().notNull(),
	key: text().notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	description: text(),
	descriptionAr: text("description_ar"),
	category: text().notNull(),
	categoryAr: text("category_ar"),
	subCategory: text("sub_category"),
	isActive: boolean("is_active").default(true),
	sortOrder: integer("sort_order").default(0),
	dependsOn: json("depends_on").default([]),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("permission_definitions_key_unique").on(table.key),
]);

export const images = pgTable("images", {
	id: text().primaryKey().notNull(),
	key: text().notNull(),
	url: text().notNull(),
	filename: text(),
	contentType: text("content_type"),
	width: integer(),
	height: integer(),
	size: integer(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const roles = pgTable("roles", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	description: text(),
	descriptionAr: text("description_ar"),
	permissions: json().default([]),
	isSystem: boolean("is_system").default(false),
	isActive: boolean("is_active").default(true),
	priority: integer().default(0),
	color: text().default('#6366f1'),
	icon: text().default('user'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("roles_name_unique").on(table.name),
]);

export const attendanceExceptions = pgTable("attendance_exceptions", {
	id: text().primaryKey().notNull(),
	employeeId: text("employee_id"),
	branchId: text("branch_id").notNull(),
	rawLogId: text("raw_log_id"),
	sessionId: text("session_id"),
	type: text().notNull(),
	severity: text().default('MEDIUM').notNull(),
	status: text().default('OPEN').notNull(),
	title: text().notNull(),
	details: text(),
	metadata: jsonb().default({}),
	assignedTo: text("assigned_to"),
	slaDueAt: timestamp("sla_due_at", { mode: 'string' }),
	escalationLevel: integer("escalation_level").default(0).notNull(),
	lastEscalatedAt: timestamp("last_escalated_at", { mode: 'string' }),
	resolvedBy: text("resolved_by"),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
	resolutionNotes: text("resolution_notes"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("attendance_exceptions_assigned_idx").using("btree", table.assignedTo.asc().nullsLast().op("text_ops")),
	index("attendance_exceptions_branch_status_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops"), table.severity.asc().nullsLast().op("text_ops")),
	index("attendance_exceptions_employee_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops")),
	index("attendance_exceptions_sla_idx").using("btree", table.slaDueAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [users.id],
			name: "attendance_exceptions_assigned_to_fkey"
		}),
	foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [users.id],
			name: "attendance_exceptions_assigned_to_users_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_exceptions_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_exceptions_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_exceptions_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_exceptions_employee_id_fkey"
		}),
	foreignKey({
			columns: [table.rawLogId],
			foreignColumns: [attendanceRawLogs.id],
			name: "attendance_exceptions_raw_log_id_attendance_raw_logs_id_fk"
		}),
	foreignKey({
			columns: [table.rawLogId],
			foreignColumns: [attendanceRawLogs.id],
			name: "attendance_exceptions_raw_log_id_fkey"
		}),
	foreignKey({
			columns: [table.resolvedBy],
			foreignColumns: [users.id],
			name: "attendance_exceptions_resolved_by_fkey"
		}),
	foreignKey({
			columns: [table.resolvedBy],
			foreignColumns: [users.id],
			name: "attendance_exceptions_resolved_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [attendanceSessions.id],
			name: "attendance_exceptions_session_id_attendance_sessions_id_fk"
		}),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [attendanceSessions.id],
			name: "attendance_exceptions_session_id_fkey"
		}),
]);

export const costCenters = pgTable("cost_centers", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	code: text().notNull(),
	name: text().notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "cost_centers_branch_id_branches_id_fk"
		}),
	unique("cost_centers_code_unique").on(table.code),
]);

export const attendanceCorrections = pgTable("attendance_corrections", {
	id: text().primaryKey().notNull(),
	sessionId: text("session_id").notNull(),
	employeeId: text("employee_id").notNull(),
	requestedBy: text("requested_by").notNull(),
	approvedBy: text("approved_by"),
	status: text().default('PENDING').notNull(),
	requestedClockInAt: timestamp("requested_clock_in_at", { mode: 'string' }),
	requestedClockOutAt: timestamp("requested_clock_out_at", { mode: 'string' }),
	reason: text().notNull(),
	approverNotes: text("approver_notes"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "attendance_corrections_approved_by_fkey"
		}),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "attendance_corrections_approved_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_corrections_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_corrections_employee_id_fkey"
		}),
	foreignKey({
			columns: [table.requestedBy],
			foreignColumns: [users.id],
			name: "attendance_corrections_requested_by_fkey"
		}),
	foreignKey({
			columns: [table.requestedBy],
			foreignColumns: [users.id],
			name: "attendance_corrections_requested_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [attendanceSessions.id],
			name: "attendance_corrections_session_id_attendance_sessions_id_fk"
		}),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [attendanceSessions.id],
			name: "attendance_corrections_session_id_fkey"
		}),
]);

export const fiscalPeriods = pgTable("fiscal_periods", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	startDate: timestamp("start_date", { mode: 'string' }).notNull(),
	endDate: timestamp("end_date", { mode: 'string' }).notNull(),
	status: text().default('OPEN').notNull(),
	closedBy: text("closed_by"),
	closedAt: timestamp("closed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.closedBy],
			foreignColumns: [users.id],
			name: "fiscal_periods_closed_by_users_id_fk"
		}),
]);

export const chartOfAccounts = pgTable("chart_of_accounts", {
	id: text().primaryKey().notNull(),
	code: text().notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	type: text().notNull(),
	normalBalance: text("normal_balance").notNull(),
	parentId: text("parent_id"),
	isActive: boolean("is_active").default(true),
	isControlAccount: boolean("is_control_account").default(false),
	allowManualJournals: boolean("allow_manual_journals").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("chart_of_accounts_code_unique").on(table.code),
]);

export const idempotencyKeys = pgTable("idempotency_keys", {
	id: serial().primaryKey().notNull(),
	key: text().notNull(),
	scope: text().default('ORDER_CREATE').notNull(),
	requestHash: text("request_hash").notNull(),
	resourceId: text("resource_id"),
	responseCode: integer("response_code"),
	responseBody: json("response_body"),
	status: text().default('IN_PROGRESS').notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("idempotency_keys_key_scope_idx").using("btree", table.key.asc().nullsLast().op("text_ops"), table.scope.asc().nullsLast().op("text_ops")),
]);

export const inventoryBatches = pgTable("inventory_batches", {
	id: text().primaryKey().notNull(),
	itemId: text("item_id").notNull(),
	warehouseId: text("warehouse_id").notNull(),
	batchNumber: text("batch_number").notNull(),
	receivedDate: timestamp("received_date", { mode: 'string' }).defaultNow().notNull(),
	expiryDate: timestamp("expiry_date", { mode: 'string' }).notNull(),
	initialQty: real("initial_qty").notNull(),
	currentQty: real("current_qty").notNull(),
	unitCost: real("unit_cost").notNull(),
	supplierId: text("supplier_id"),
	status: text().default('ACTIVE').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("fefo_idx").using("btree", table.itemId.asc().nullsLast().op("text_ops"), table.warehouseId.asc().nullsLast().op("text_ops"), table.expiryDate.asc().nullsLast().op("timestamp_ops"), table.status.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.itemId],
			foreignColumns: [inventoryItems.id],
			name: "inventory_batches_item_id_inventory_items_id_fk"
		}),
	foreignKey({
			columns: [table.warehouseId],
			foreignColumns: [warehouses.id],
			name: "inventory_batches_warehouse_id_warehouses_id_fk"
		}),
]);

export const journalEntries = pgTable("journal_entries", {
	id: text().primaryKey().notNull(),
	entryNumber: serial("entry_number").notNull(),
	date: timestamp({ mode: 'string' }).defaultNow().notNull(),
	reference: text(),
	referenceType: text("reference_type").notNull(),
	description: text().notNull(),
	status: text().default('POSTED').notNull(),
	fiscalPeriodId: text("fiscal_period_id"),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("je_ref_idx").using("btree", table.reference.asc().nullsLast().op("text_ops"), table.referenceType.asc().nullsLast().op("text_ops")),
]);

export const auditLogs = pgTable("audit_logs", {
	id: serial().primaryKey().notNull(),
	eventType: text("event_type").notNull(),
	userId: text("user_id"),
	userName: text("user_name"),
	userRole: text("user_role"),
	branchId: text("branch_id"),
	deviceId: text("device_id"),
	ipAddress: text("ip_address"),
	payload: json(),
	before: json(),
	after: json(),
	reason: text(),
	signature: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	signatureVersion: integer("signature_version").default(1),
	isVerified: boolean("is_verified"),
	lastVerifiedAt: timestamp("last_verified_at", { mode: 'string' }),
});

export const employees = pgTable("employees", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	userId: text("user_id"),
	name: text().notNull(),
	nameAr: text("name_ar"),
	phone: text(),
	email: text(),
	role: text().notNull(),
	departmentId: text("department_id"),
	jobTitleId: text("job_title_id"),
	basicSalary: real("basic_salary").default(0).notNull(),
	hourlyRate: real("hourly_rate").default(0),
	emergencyContact: text("emergency_contact"),
	bankAccount: text("bank_account"),
	joinedAt: timestamp("joined_at", { mode: 'string' }).defaultNow().notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	nationalId: text("national_id"),
	employeeCode: text("employee_code"),
	attendanceCode: text("attendance_code"),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "employees_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.departmentId],
			foreignColumns: [departments.id],
			name: "employees_department_id_departments_id_fk"
		}),
	foreignKey({
			columns: [table.jobTitleId],
			foreignColumns: [jobTitles.id],
			name: "employees_job_title_id_job_titles_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "employees_user_id_users_id_fk"
	}),
]);

export const employeeDocuments = pgTable("employee_documents", {
	id: text().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	branchId: text("branch_id").notNull(),
	documentType: text("document_type").notNull(),
	title: text().notNull(),
	documentNumber: text("document_number"),
	issueDate: timestamp("issue_date", { mode: 'string' }),
	expiryDate: timestamp("expiry_date", { mode: 'string' }),
	fileUrl: text("file_url"),
	status: text().default('ACTIVE').notNull(),
	notes: text(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("employee_documents_branch_expiry_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.expiryDate.asc().nullsLast().op("timestamp_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("employee_documents_employee_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "employee_documents_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_documents_employee_id_employees_id_fk"
		}),
]);

export const attendancePolicies = pgTable("attendance_policies", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	code: text(),
	graceLateMinutes: integer("grace_late_minutes").default(15).notNull(),
	earlyLeaveToleranceMinutes: integer("early_leave_tolerance_minutes").default(10).notNull(),
	overtimeThresholdMinutes: integer("overtime_threshold_minutes").default(30).notNull(),
	minHoursForPresent: real("min_hours_for_present").default(4).notNull(),
	attendanceProcessingMode: text("attendance_processing_mode").default('AUTO').notNull(),
	operationalDayStartHour: integer("operational_day_start_hour").default(8).notNull(),
	operationalDayEndHour: integer("operational_day_end_hour").default(5).notNull(),
	maxSmartSessionHours: real("max_smart_session_hours").default(22).notNull(),
	geofenceStrict: boolean("geofence_strict").default(false),
	faceRecognitionRequired: boolean("face_recognition_required").default(false),
	autoCloseOpenSessions: boolean("auto_close_open_sessions").default(false),
	autoResolveMissingOut: boolean("auto_resolve_missing_out").default(false),
	isDefault: boolean("is_default").default(false),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("attendance_policies_branch_default_idx").using("btree", table.branchId.asc().nullsLast().op("bool_ops"), table.isDefault.asc().nullsLast().op("text_ops"), table.isActive.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_policies_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_policies_branch_id_fkey"
		}),
]);

export const shiftTemplates = pgTable("shift_templates", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	code: text(),
	attendancePolicyId: text("attendance_policy_id"),
	startTime: text("start_time").notNull(),
	endTime: text("end_time").notNull(),
	breakMinutes: integer("break_minutes").default(0).notNull(),
	graceLateMinutes: integer("grace_late_minutes"),
	earlyLeaveToleranceMinutes: integer("early_leave_tolerance_minutes"),
	overtimeThresholdMinutes: integer("overtime_threshold_minutes"),
	workDays: jsonb("work_days").default(["sun","mon","tue","wed","thu"]),
	isOvernight: boolean("is_overnight").default(false),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("shift_templates_branch_active_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.isActive.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.attendancePolicyId],
			foreignColumns: [attendancePolicies.id],
			name: "shift_templates_attendance_policy_id_attendance_policies_id_fk"
		}),
	foreignKey({
			columns: [table.attendancePolicyId],
			foreignColumns: [attendancePolicies.id],
			name: "shift_templates_attendance_policy_id_fkey"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "shift_templates_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "shift_templates_branch_id_fkey"
		}),
]);

export const paymentMethodAccounts = pgTable("payment_method_accounts", {
	id: serial().primaryKey().notNull(),
	paymentMethod: text("payment_method").notNull(),
	accountId: text("account_id").notNull(),
	branchId: text("branch_id"),
}, (table) => [
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [chartOfAccounts.id],
			name: "payment_method_accounts_account_id_chart_of_accounts_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payment_method_accounts_branch_id_branches_id_fk"
		}),
	unique("payment_method_accounts_payment_method_unique").on(table.paymentMethod),
]);

export const taxAccounts = pgTable("tax_accounts", {
	id: serial().primaryKey().notNull(),
	taxType: text("tax_type").notNull(),
	accountId: text("account_id").notNull(),
	rate: real().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [chartOfAccounts.id],
			name: "tax_accounts_account_id_chart_of_accounts_id_fk"
		}),
]);

export const deliveryPlatforms = pgTable("delivery_platforms", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	feePercentage: real("fee_percentage").default(0),
	applyFeesToMenuPrice: boolean("apply_fees_to_menu_price").default(false).notNull(),
	priceMarkupPercentage: real("price_markup_percentage").default(0),
	priceMarkupFixed: real("price_markup_fixed").default(0),
	integrationType: text("integration_type").default('MANUAL'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const inventoryStock = pgTable("inventory_stock", {
	id: serial().primaryKey().notNull(),
	itemId: text("item_id").notNull(),
	warehouseId: text("warehouse_id").notNull(),
	quantity: real().default(0),
	lastUpdated: timestamp("last_updated", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.itemId],
			foreignColumns: [inventoryItems.id],
			name: "inventory_stock_item_id_inventory_items_id_fk"
		}),
	foreignKey({
			columns: [table.warehouseId],
			foreignColumns: [warehouses.id],
			name: "inventory_stock_warehouse_id_warehouses_id_fk"
		}),
]);

export const campaigns = pgTable("campaigns", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	type: text().notNull(),
	status: text().default('DRAFT').notNull(),
	targetAudience: text("target_audience"),
	content: text().notNull(),
	scheduledAt: timestamp("scheduled_at", { mode: 'string' }),
	reach: integer().default(0),
	conversions: integer().default(0),
	revenue: real().default(0),
	budget: real().default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const employeeShiftAssignments = pgTable("employee_shift_assignments", {
	id: serial().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	branchId: text("branch_id").notNull(),
	shiftTemplateId: text("shift_template_id").notNull(),
	effectiveFrom: date("effective_from").notNull(),
	effectiveTo: date("effective_to"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("employee_shift_assignments_branch_shift_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.shiftTemplateId.asc().nullsLast().op("text_ops")),
	index("employee_shift_assignments_employee_effective_idx").using("btree", table.employeeId.asc().nullsLast().op("date_ops"), table.effectiveFrom.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "employee_shift_assignments_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "employee_shift_assignments_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_shift_assignments_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_shift_assignments_employee_id_fkey"
		}),
	foreignKey({
			columns: [table.shiftTemplateId],
			foreignColumns: [shiftTemplates.id],
			name: "employee_shift_assignments_shift_template_id_fkey"
		}),
	foreignKey({
			columns: [table.shiftTemplateId],
			foreignColumns: [shiftTemplates.id],
			name: "employee_shift_assignments_shift_template_id_shift_templates_id"
		}),
]);

export const printJobs = pgTable("print_jobs", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	type: text().notNull(),
	content: text().notNull(),
	printerId: text("printer_id"),
	printerAddress: text("printer_address"),
	printerType: text("printer_type").default('LOCAL'),
	status: text().default('QUEUED').notNull(),
	attempts: integer().default(0).notNull(),
	maxAttempts: integer("max_attempts").default(3).notNull(),
	createdBy: text("created_by"),
	claimedBy: text("claimed_by"),
	claimedAt: timestamp("claimed_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	contentType: text("content_type").default('text').notNull(),
}, (table) => [
	index("print_jobs_branch_status_created_idx").using("btree", table.branchId.asc().nullsLast().op("timestamp_ops"), table.status.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
]);

export const orders = pgTable("orders", {
	id: text().primaryKey().notNull(),
	orderNumber: serial("order_number").notNull(),
	type: text().notNull(),
	source: text().default('pos'),
	branchId: text("branch_id").notNull(),
	tableId: text("table_id"),
	customerId: text("customer_id"),
	customerName: text("customer_name"),
	customerPhone: text("customer_phone"),
	deliveryAddress: text("delivery_address"),
	deliveryAddressId: integer("delivery_address_id"),
	deliveryLat: real("delivery_lat"),
	deliveryLng: real("delivery_lng"),
	deliveryAddressLabel: text("delivery_address_label"),
	isCallCenterOrder: boolean("is_call_center_order").default(false),
	callCenterAgentId: text("call_center_agent_id"),
	status: text().default('PENDING').notNull(),
	subtotal: real().notNull(),
	discount: real().default(0),
	discountType: text("discount_type"),
	discountReason: text("discount_reason"),
	tax: real().notNull(),
	deliveryFee: real("delivery_fee").default(0),
	serviceCharge: real("service_charge").default(0),
	total: real().notNull(),
	freeDelivery: boolean("free_delivery").default(false),
	isUrgent: boolean("is_urgent").default(false),
	isPaid: boolean("is_paid").default(false),
	paymentMethod: text("payment_method"),
	paidAmount: real("paid_amount"),
	changeAmount: real("change_amount"),
	notes: text(),
	kitchenNotes: text("kitchen_notes"),
	deliveryNotes: text("delivery_notes"),
	driverId: text("driver_id"),
	estimatedDeliveryTime: timestamp("estimated_delivery_time", { mode: 'string' }),
	actualDeliveryTime: timestamp("actual_delivery_time", { mode: 'string' }),
	syncStatus: text("sync_status").default('SYNCED'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	cancelledAt: timestamp("cancelled_at", { mode: 'string' }),
	cancelReason: text("cancel_reason"),
	shiftId: text("shift_id"),
	tipAmount: real("tip_amount").default(0),
	parentOrderId: text("parent_order_id"),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "orders_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "orders_customer_id_customers_id_fk"
		}),
]);

export const domainEvents = pgTable("domain_events", {
	id: text().primaryKey().notNull(),
	type: text().notNull(),
	entityType: text("entity_type"),
	entityId: text("entity_id"),
	branchId: text("branch_id"),
	status: text().default('PENDING').notNull(),
	payload: jsonb().default({}),
	retryCount: integer("retry_count").default(0).notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	processedAt: timestamp("processed_at", { mode: 'string' }),
}, (table) => [
	index("domain_events_branch_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops")),
	index("domain_events_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("domain_events_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "domain_events_branch_id_branches_id_fk"
		}),
]);

export const employeeLoans = pgTable("employee_loans", {
	id: text().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	branchId: text("branch_id").notNull(),
	type: text().default('ADVANCE').notNull(),
	status: text().default('PENDING').notNull(),
	principalAmount: real("principal_amount").notNull(),
	installmentAmount: real("installment_amount").default(0).notNull(),
	installmentsCount: integer("installments_count").default(1).notNull(),
	outstandingAmount: real("outstanding_amount").notNull(),
	requestedAt: timestamp("requested_at", { mode: 'string' }).defaultNow().notNull(),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	disbursedAt: timestamp("disbursed_at", { mode: 'string' }),
	effectiveFrom: date("effective_from"),
	notes: text(),
	requestedBy: text("requested_by"),
	approvedBy: text("approved_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("employee_loans_branch_status_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("employee_loans_employee_status_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "employee_loans_approved_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "employee_loans_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_loans_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.requestedBy],
			foreignColumns: [users.id],
			name: "employee_loans_requested_by_users_id_fk"
		}),
]);

export const employeePayrollAssignments = pgTable("employee_payroll_assignments", {
	id: serial().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	payrollProfileId: text("payroll_profile_id").notNull(),
	effectiveFrom: date("effective_from").notNull(),
	effectiveTo: date("effective_to"),
	isPrimary: boolean("is_primary").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("employee_payroll_assignments_employee_effective_idx").using("btree", table.employeeId.asc().nullsLast().op("date_ops"), table.effectiveFrom.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_payroll_assignments_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.payrollProfileId],
			foreignColumns: [payrollProfiles.id],
			name: "employee_payroll_assignments_payroll_profile_id_payroll_profile"
		}),
]);

export const leaveBalances = pgTable("leave_balances", {
	id: serial().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	leaveTypeId: text("leave_type_id").notNull(),
	year: integer().notNull(),
	entitledDays: real("entitled_days").default(0).notNull(),
	carriedForwardDays: real("carried_forward_days").default(0).notNull(),
	usedDays: real("used_days").default(0).notNull(),
	pendingDays: real("pending_days").default(0).notNull(),
	adjustmentDays: real("adjustment_days").default(0).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("leave_balances_employee_leave_year_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.leaveTypeId.asc().nullsLast().op("int4_ops"), table.year.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "leave_balances_employee_id_employees_id_fk"
		}),
]);

export const loanInstallments = pgTable("loan_installments", {
	id: serial().primaryKey().notNull(),
	loanId: text("loan_id").notNull(),
	dueDate: date("due_date").notNull(),
	amount: real().notNull(),
	status: text().default('PENDING').notNull(),
	payrollCycleId: text("payroll_cycle_id"),
	paidAt: timestamp("paid_at", { mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("loan_installments_loan_due_idx").using("btree", table.loanId.asc().nullsLast().op("date_ops"), table.dueDate.asc().nullsLast().op("date_ops")),
	index("loan_installments_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.loanId],
			foreignColumns: [employeeLoans.id],
			name: "loan_installments_loan_id_employee_loans_id_fk"
		}),
	foreignKey({
			columns: [table.payrollCycleId],
			foreignColumns: [payrollCycles.id],
			name: "loan_installments_payroll_cycle_id_payroll_cycles_id_fk"
		}),
]);

export const bonusPenaltyRecords = pgTable("bonus_penalty_records", {
	id: text().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	branchId: text("branch_id").notNull(),
	type: text().notNull(),
	category: text(),
	status: text().default('PENDING').notNull(),
	amount: real().notNull(),
	effectiveDate: date("effective_date").notNull(),
	payrollCycleId: text("payroll_cycle_id"),
	reason: text().notNull(),
	notes: text(),
	requestedBy: text("requested_by"),
	approvedBy: text("approved_by"),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("bonus_penalty_branch_effective_idx").using("btree", table.branchId.asc().nullsLast().op("date_ops"), table.effectiveDate.asc().nullsLast().op("text_ops")),
	index("bonus_penalty_employee_type_status_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "bonus_penalty_records_approved_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "bonus_penalty_records_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "bonus_penalty_records_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.payrollCycleId],
			foreignColumns: [payrollCycles.id],
			name: "bonus_penalty_records_payroll_cycle_id_payroll_cycles_id_fk"
		}),
	foreignKey({
			columns: [table.requestedBy],
			foreignColumns: [users.id],
			name: "bonus_penalty_records_requested_by_users_id_fk"
		}),
]);

export const shifts = pgTable("shifts", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	userId: text("user_id").notNull(),
	openingTime: timestamp("opening_time", { mode: 'string' }).defaultNow().notNull(),
	closingTime: timestamp("closing_time", { mode: 'string' }),
	openingBalance: real("opening_balance").default(0).notNull(),
	expectedBalance: real("expected_balance").default(0),
	actualBalance: real("actual_balance").default(0),
	status: text().default('OPEN').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "shifts_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "shifts_user_id_users_id_fk"
		}),
]);

export const payrollPayouts = pgTable("payroll_payouts", {
	id: text().primaryKey().notNull(),
	cycleId: text("cycle_id").notNull(),
	employeeId: text("employee_id").notNull(),
	basicSalary: real("basic_salary").notNull(),
	deductions: real().default(0),
	overtime: real().default(0),
	netPay: real("net_pay").notNull(),
	status: text().default('PENDING'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.cycleId],
			foreignColumns: [payrollCycles.id],
			name: "payroll_payouts_cycle_id_payroll_cycles_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "payroll_payouts_employee_id_employees_id_fk"
		}),
]);

export const payrollComponents = pgTable("payroll_components", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	code: text().notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	type: text().notNull(),
	amountType: text("amount_type").default('FIXED').notNull(),
	calculationBasis: text("calculation_basis").default('BASE_SALARY').notNull(),
	defaultValue: real("default_value").default(0).notNull(),
	taxable: boolean().default(false),
	pensionable: boolean().default(false),
	affectsNetPay: boolean("affects_net_pay").default(true),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("payroll_components_branch_code_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.code.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payroll_components_branch_id_branches_id_fk"
		}),
]);

export const payrollLocks = pgTable("payroll_locks", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	lockedThrough: timestamp("locked_through", { mode: 'string' }).notNull(),
	lockedBy: text("locked_by"),
	reason: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("payroll_locks_branch_idx").using("btree", table.branchId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payroll_locks_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.lockedBy],
			foreignColumns: [users.id],
			name: "payroll_locks_locked_by_users_id_fk"
		}),
]);

export const payrollRules = pgTable("payroll_rules", {
	id: text().primaryKey().notNull(),
	payrollProfileId: text("payroll_profile_id").notNull(),
	branchId: text("branch_id").notNull(),
	code: text().notNull(),
	name: text().notNull(),
	triggerType: text("trigger_type").notNull(),
	operation: text().notNull(),
	componentId: text("component_id"),
	thresholdValue: real("threshold_value").default(0).notNull(),
	rateValue: real("rate_value").default(0).notNull(),
	capValue: real("cap_value").default(0),
	formula: text(),
	priority: integer().default(0).notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("payroll_rules_profile_priority_idx").using("btree", table.payrollProfileId.asc().nullsLast().op("int4_ops"), table.priority.asc().nullsLast().op("int4_ops"), table.isActive.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payroll_rules_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.componentId],
			foreignColumns: [payrollComponents.id],
			name: "payroll_rules_component_id_payroll_components_id_fk"
		}),
	foreignKey({
			columns: [table.payrollProfileId],
			foreignColumns: [payrollProfiles.id],
			name: "payroll_rules_payroll_profile_id_payroll_profiles_id_fk"
		}),
]);

export const onboardingRecords = pgTable("onboarding_records", {
	id: text().primaryKey().notNull(),
	tenantBranchId: text("tenant_branch_id").notNull(),
	setupBranchCompleted: boolean("setup_branch_completed").default(false),
	setupMenuCompleted: boolean("setup_menu_completed").default(false),
	setupStaffCompleted: boolean("setup_staff_completed").default(false),
	setupPrintersCompleted: boolean("setup_printers_completed").default(false),
	setupHardwareCompleted: boolean("setup_hardware_completed").default(false),
	isFullyOnboarded: boolean("is_fully_onboarded").default(false),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("onboarding_records_tenant_idx").using("btree", table.tenantBranchId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantBranchId],
			foreignColumns: [branches.id],
			name: "onboarding_records_tenant_branch_id_branches_id_fk"
		}),
]);

export const payrollRuns = pgTable("payroll_runs", {
	id: text().primaryKey().notNull(),
	cycleId: text("cycle_id").notNull(),
	branchId: text("branch_id").notNull(),
	status: text().default('DRAFT').notNull(),
	totalEmployees: integer("total_employees").default(0).notNull(),
	grossTotal: real("gross_total").default(0).notNull(),
	deductionsTotal: real("deductions_total").default(0).notNull(),
	netTotal: real("net_total").default(0).notNull(),
	createdBy: text("created_by"),
	closedBy: text("closed_by"),
	closedAt: timestamp("closed_at", { mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("payroll_runs_cycle_idx").using("btree", table.cycleId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payroll_runs_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.closedBy],
			foreignColumns: [users.id],
			name: "payroll_runs_closed_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "payroll_runs_created_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.cycleId],
			foreignColumns: [payrollCycles.id],
			name: "payroll_runs_cycle_id_payroll_cycles_id_fk"
		}),
]);

export const payslips = pgTable("payslips", {
	id: text().primaryKey().notNull(),
	runId: text("run_id").notNull(),
	cycleId: text("cycle_id").notNull(),
	employeeId: text("employee_id").notNull(),
	issuedAt: timestamp("issued_at", { mode: 'string' }).defaultNow().notNull(),
	payload: jsonb().default({}),
	version: integer().default(1).notNull(),
	pdfUrl: text("pdf_url"),
	pdfHash: text("pdf_hash"),
	generatedAt: timestamp("generated_at", { mode: 'string' }),
	generatedBy: text("generated_by"),
}, (table) => [
	index("payslips_cycle_employee_idx").using("btree", table.cycleId.asc().nullsLast().op("text_ops"), table.employeeId.asc().nullsLast().op("text_ops")),
	index("payslips_version_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops"), table.cycleId.asc().nullsLast().op("int4_ops"), table.version.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.cycleId],
			foreignColumns: [payrollCycles.id],
			name: "payslips_cycle_id_payroll_cycles_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "payslips_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.generatedBy],
			foreignColumns: [users.id],
			name: "payslips_generated_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [payrollRuns.id],
			name: "payslips_run_id_payroll_runs_id_fk"
		}),
]);

export const payrollProfiles = pgTable("payroll_profiles", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	code: text(),
	payFrequency: text("pay_frequency").default('MONTHLY').notNull(),
	salaryMode: text("salary_mode").default('MONTHLY').notNull(),
	currency: text().default('EGP').notNull(),
	defaultAttendancePolicyId: text("default_attendance_policy_id"),
	defaultOvertimeRate: real("default_overtime_rate").default(1.5).notNull(),
	lateDeductionMode: text("late_deduction_mode").default('NONE').notNull(),
	absenceDeductionMode: text("absence_deduction_mode").default('DAILY_RATE').notNull(),
	autoPostToGl: boolean("auto_post_to_gl").default(true),
	isDefault: boolean("is_default").default(false),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("payroll_profiles_branch_default_idx").using("btree", table.branchId.asc().nullsLast().op("bool_ops"), table.isDefault.asc().nullsLast().op("text_ops"), table.isActive.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payroll_profiles_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.defaultAttendancePolicyId],
			foreignColumns: [attendancePolicies.id],
			name: "payroll_profiles_default_attendance_policy_id_attendance_polici"
		}),
]);

export const purchaseOrders = pgTable("purchase_orders", {
	id: text().primaryKey().notNull(),
	supplierId: text("supplier_id").notNull(),
	branchId: text("branch_id").notNull(),
	status: text().default('DRAFT'),
	expectedDate: timestamp("expected_date", { mode: 'string' }),
	subtotal: real().default(0),
	notes: text(),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "purchase_orders_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.supplierId],
			foreignColumns: [suppliers.id],
			name: "purchase_orders_supplier_id_suppliers_id_fk"
		}),
]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
	id: serial().primaryKey().notNull(),
	poId: text("po_id").notNull(),
	itemId: text("item_id").notNull(),
	orderedQty: real("ordered_qty").notNull(),
	receivedQty: real("received_qty").default(0),
	unitPrice: real("unit_price").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.itemId],
			foreignColumns: [inventoryItems.id],
			name: "purchase_order_items_item_id_inventory_items_id_fk"
		}),
	foreignKey({
			columns: [table.poId],
			foreignColumns: [purchaseOrders.id],
			name: "purchase_order_items_po_id_purchase_orders_id_fk"
		}),
]);

export const shiftTaskRuns = pgTable("shift_task_runs", {
	id: serial().primaryKey().notNull(),
	shiftId: text("shift_id").notNull(),
	taskId: text("task_id").notNull(),
	status: text().default('PENDING').notNull(),
	completedBy: text("completed_by"),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("shift_task_runs_shift_idx").using("btree", table.shiftId.asc().nullsLast().op("text_ops")),
	index("shift_task_runs_task_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.completedBy],
			foreignColumns: [users.id],
			name: "shift_task_runs_completed_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.shiftId],
			foreignColumns: [shifts.id],
			name: "shift_task_runs_shift_id_shifts_id_fk"
		}),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [shiftTasks.id],
			name: "shift_task_runs_task_id_shift_tasks_id_fk"
		}),
]);

export const shiftTasks = pgTable("shift_tasks", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	type: text().default('DAILY').notNull(),
	description: text(),
	requiresVerification: boolean("requires_verification").default(false),
	sortOrder: integer("sort_order").default(0),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "shift_tasks_branch_id_branches_id_fk"
		}),
]);

export const subscriptionPlans = pgTable("subscription_plans", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	description: text(),
	price: numeric({ precision: 10, scale:  2 }).default('0.00').notNull(),
	currency: text().default('EGP'),
	billingCycle: text("billing_cycle").default('MONTHLY'),
	features: json().default([]),
	maxBranches: integer("max_branches").default(1),
	maxUsers: integer("max_users").default(10),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("subscription_plans_name_unique").on(table.name),
]);

export const shiftPlans = pgTable("shift_plans", {
	id: text().primaryKey().notNull(),
	branchId: text("branch_id").notNull(),
	name: text().notNull(),
	weekStart: date("week_start").notNull(),
	weekEnd: date("week_end").notNull(),
	status: text().default('DRAFT').notNull(),
	createdBy: text("created_by"),
	approvedBy: text("approved_by"),
	frozenAt: timestamp("frozen_at", { mode: 'string' }),
	postedAt: timestamp("posted_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("shift_plans_branch_week_idx").using("btree", table.branchId.asc().nullsLast().op("date_ops"), table.weekStart.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "shift_plans_approved_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "shift_plans_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "shift_plans_created_by_users_id_fk"
		}),
]);

export const modifierGroups = pgTable("modifier_groups", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	nameAr: text("name_ar"),
	minSelection: integer("min_selection").default(0),
	maxSelection: integer("max_selection").default(1),
	isRequired: boolean("is_required").default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const menuItemModifiers = pgTable("menu_item_modifiers", {
	id: serial().primaryKey().notNull(),
	menuItemId: text("menu_item_id").notNull(),
	modifierGroupId: text("modifier_group_id").notNull(),
	sortOrder: integer("sort_order").default(0),
}, (table) => [
	foreignKey({
			columns: [table.menuItemId],
			foreignColumns: [menuItems.id],
			name: "menu_item_modifiers_menu_item_id_menu_items_id_fk"
		}),
	foreignKey({
			columns: [table.modifierGroupId],
			foreignColumns: [modifierGroups.id],
			name: "menu_item_modifiers_modifier_group_id_modifier_groups_id_fk"
		}),
]);

export const recipes = pgTable("recipes", {
	id: text().primaryKey().notNull(),
	menuItemId: text("menu_item_id").notNull(),
	yield: real().default(1),
	instructions: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	version: integer().default(1),
	currentVersionId: text("current_version_id"),
	calculatedCost: real("calculated_cost"),
	lastCostCalculation: timestamp("last_cost_calculation", { mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.menuItemId],
			foreignColumns: [menuItems.id],
			name: "recipes_menu_item_id_menu_items_id_fk"
		}),
]);

export const orderStatusHistory = pgTable("order_status_history", {
	id: serial().primaryKey().notNull(),
	orderId: text("order_id").notNull(),
	status: text().notNull(),
	changedBy: text("changed_by"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "order_status_history_order_id_orders_id_fk"
		}),
]);

export const payments = pgTable("payments", {
	id: text().primaryKey().notNull(),
	orderId: text("order_id").notNull(),
	method: text().notNull(),
	amount: real().notNull(),
	referenceNumber: text("reference_number"),
	status: text().default('COMPLETED'),
	processedBy: text("processed_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "payments_order_id_orders_id_fk"
		}),
]);

export const payrollRunLines = pgTable("payroll_run_lines", {
	id: text().primaryKey().notNull(),
	runId: text("run_id").notNull(),
	employeeId: text("employee_id").notNull(),
	baseSalary: real("base_salary").default(0).notNull(),
	overtime: real().default(0).notNull(),
	bonuses: real().default(0).notNull(),
	penalties: real().default(0).notNull(),
	loanDeductions: real("loan_deductions").default(0).notNull(),
	otherDeductions: real("other_deductions").default(0).notNull(),
	grossPay: real("gross_pay").default(0).notNull(),
	netPay: real("net_pay").default(0).notNull(),
	components: jsonb().default({}),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("payroll_run_lines_run_employee_idx").using("btree", table.runId.asc().nullsLast().op("text_ops"), table.employeeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "payroll_run_lines_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [payrollRuns.id],
			name: "payroll_run_lines_run_id_payroll_runs_id_fk"
		}),
]);

export const shiftPlanEntries = pgTable("shift_plan_entries", {
	id: serial().primaryKey().notNull(),
	planId: text("plan_id").notNull(),
	branchId: text("branch_id").notNull(),
	employeeId: text("employee_id").notNull(),
	shiftTemplateId: text("shift_template_id"),
	date: date().notNull(),
	startTime: text("start_time"),
	endTime: text("end_time"),
	status: text().default('PLANNED').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("shift_plan_entries_employee_date_idx").using("btree", table.employeeId.asc().nullsLast().op("date_ops"), table.date.asc().nullsLast().op("date_ops")),
	index("shift_plan_entries_plan_idx").using("btree", table.planId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "shift_plan_entries_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "shift_plan_entries_employee_id_employees_id_fk"
		}),
	foreignKey({
			columns: [table.planId],
			foreignColumns: [shiftPlans.id],
			name: "shift_plan_entries_plan_id_shift_plans_id_fk"
		}),
	foreignKey({
			columns: [table.shiftTemplateId],
			foreignColumns: [shiftTemplates.id],
			name: "shift_plan_entries_shift_template_id_shift_templates_id_fk"
		}),
]);

export const subscriptions = pgTable("subscriptions", {
	id: text().primaryKey().notNull(),
	tenantBranchId: text("tenant_branch_id").notNull(),
	planId: text("plan_id").notNull(),
	status: text().default('TRIALING'),
	trialEndsAt: timestamp("trial_ends_at", { mode: 'string' }),
	currentPeriodStart: timestamp("current_period_start", { mode: 'string' }),
	currentPeriodEnd: timestamp("current_period_end", { mode: 'string' }),
	cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
	paymentMethodId: text("payment_method_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("subscriptions_tenant_branch_idx").using("btree", table.tenantBranchId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.planId],
			foreignColumns: [subscriptionPlans.id],
			name: "subscriptions_plan_id_subscription_plans_id_fk"
		}),
	foreignKey({
			columns: [table.tenantBranchId],
			foreignColumns: [branches.id],
			name: "subscriptions_tenant_branch_id_branches_id_fk"
		}),
]);

export const recipeIngredients = pgTable("recipe_ingredients", {
	id: serial().primaryKey().notNull(),
	recipeId: text("recipe_id").notNull(),
	inventoryItemId: text("inventory_item_id").notNull(),
	quantity: real().notNull(),
	unit: text().notNull(),
	notes: text(),
	lastKnownCost: real("last_known_cost"),
	lastCostUpdate: timestamp("last_cost_update", { mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.inventoryItemId],
			foreignColumns: [inventoryItems.id],
			name: "recipe_ingredients_inventory_item_id_inventory_items_id_fk"
		}),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [recipes.id],
			name: "recipe_ingredients_recipe_id_recipes_id_fk"
		}),
]);

export const stockMovements = pgTable("stock_movements", {
	id: serial().primaryKey().notNull(),
	itemId: text("item_id").notNull(),
	fromWarehouseId: text("from_warehouse_id"),
	toWarehouseId: text("to_warehouse_id"),
	quantity: real().notNull(),
	type: text().notNull(),
	referenceId: text("reference_id"),
	reason: text(),
	performedBy: text("performed_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	unitCost: real("unit_cost").default(0),
	totalCost: real("total_cost").default(0),
}, (table) => [
	foreignKey({
			columns: [table.fromWarehouseId],
			foreignColumns: [warehouses.id],
			name: "stock_movements_from_warehouse_id_warehouses_id_fk"
		}),
	foreignKey({
			columns: [table.itemId],
			foreignColumns: [inventoryItems.id],
			name: "stock_movements_item_id_inventory_items_id_fk"
		}),
	foreignKey({
			columns: [table.toWarehouseId],
			foreignColumns: [warehouses.id],
			name: "stock_movements_to_warehouse_id_warehouses_id_fk"
		}),
]);

export const batchTransactions = pgTable("batch_transactions", {
	id: serial().primaryKey().notNull(),
	batchId: text("batch_id").notNull(),
	stockMovementId: integer("stock_movement_id").notNull(),
	quantityUsed: real("quantity_used").notNull(),
	costAtTime: real("cost_at_time").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [inventoryBatches.id],
			name: "batch_transactions_batch_id_inventory_batches_id_fk"
		}),
	foreignKey({
			columns: [table.stockMovementId],
			foreignColumns: [stockMovements.id],
			name: "batch_transactions_stock_movement_id_stock_movements_id_fk"
		}),
]);

export const attendance = pgTable("attendance", {
	id: text().primaryKey().notNull(),
	employeeId: text("employee_id").notNull(),
	branchId: text("branch_id").notNull(),
	date: timestamp({ mode: 'string' }).defaultNow().notNull(),
	clockIn: timestamp("clock_in", { mode: 'string' }).notNull(),
	clockOut: timestamp("clock_out", { mode: 'string' }),
	deviceId: text("device_id"),
	status: text().default('PRESENT'),
	totalHours: real("total_hours").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	clockInLat: real("clock_in_lat"),
	clockInLng: real("clock_in_lng"),
	clockOutLat: real("clock_out_lat"),
	clockOutLng: real("clock_out_lng"),
	notes: text(),
	updatedAt: timestamp("updated_at", { mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "attendance_branch_id_branches_id_fk"
		}),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_employee_id_employees_id_fk"
		}),
]);

export const etaDeadLetters = pgTable("eta_dead_letters", {
	id: serial().primaryKey().notNull(),
	orderId: text("order_id"),
	branchId: text("branch_id"),
	payload: json().notNull(),
	attempts: integer().default(0),
	lastError: text("last_error"),
	status: text().default('PENDING'),
	dismissedBy: text("dismissed_by"),
	dismissedAt: timestamp("dismissed_at", { mode: 'string' }),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});
