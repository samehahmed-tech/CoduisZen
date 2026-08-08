-- ============================================================================
-- Coduis Zen Database Schema for Microsoft SQL Server
-- Generated from the Drizzle ORM application schema for SQL Server
-- Database: CoduisZen
-- ============================================================================

-- ============================================================================
-- 1. USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE users (
    id              nvarchar(255)   NOT NULL,
    name            nvarchar(max)   NOT NULL,
    email           nvarchar(255)   NOT NULL,
    password_hash   nvarchar(max),
    pin_code        nvarchar(max),
    pin_code_hash   nvarchar(max),
    role            nvarchar(50)   NOT NULL,
    role_id         nvarchar(255),
    permissions     nvarchar(max)   DEFAULT '[]',
    custom_permissions nvarchar(max) DEFAULT '{}',
    assigned_branch_id nvarchar(255),
    allowed_branches nvarchar(max)  DEFAULT '[]',
    is_active       bit             DEFAULT 1,
    manager_pin     nvarchar(max),
    mfa_enabled     bit             DEFAULT 0,
    mfa_secret      nvarchar(max),
    pin_login_enabled bit           DEFAULT 0,
    last_login_at   datetime2,
    created_at      datetime2       DEFAULT GETDATE(),
    updated_at      datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role ON users (role);

CREATE TABLE payroll (
    id              int             IDENTITY(1,1) NOT NULL,
    user_id         nvarchar(255)   NOT NULL,
    month           nvarchar(255)   NOT NULL,
    base_salary     real            NOT NULL,
    overtime_pay    real            DEFAULT 0,
    bonuses         real            DEFAULT 0,
    deductions      real            DEFAULT 0,
    net_salary      real            NOT NULL,
    status          nvarchar(255)   DEFAULT 'DRAFT',
    paid_at         datetime2,
    processed_by    nvarchar(255),
    created_at      datetime2       DEFAULT GETDATE(),
    updated_at      datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_payroll PRIMARY KEY (id),
    CONSTRAINT fk_payroll_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX idx_payroll_user_month ON payroll (user_id, month);

CREATE TABLE user_sessions (
    id              nvarchar(255)   NOT NULL,
    user_id         nvarchar(255)   NOT NULL,
    token_id        nvarchar(500)   NOT NULL,
    device_name     nvarchar(max),
    user_agent      nvarchar(max),
    ip_address      nvarchar(max),
    is_active       bit             DEFAULT 1,
    revoked_at      datetime2,
    expires_at      datetime2       NOT NULL,
    last_seen_at    datetime2       DEFAULT GETDATE(),
    created_at      datetime2       DEFAULT GETDATE(),
    updated_at      datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_user_sessions PRIMARY KEY (id),
    CONSTRAINT uq_user_sessions_token_id UNIQUE (token_id),
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_user_sessions_user_active ON user_sessions (user_id, is_active);
CREATE INDEX idx_user_sessions_last_seen ON user_sessions (last_seen_at);
CREATE INDEX idx_user_sessions_expires ON user_sessions (expires_at);

-- ============================================================================
-- 2. ROLES & PERMISSIONS
-- ============================================================================

CREATE TABLE roles (
    id              nvarchar(255)   NOT NULL,
    name            nvarchar(255)   NOT NULL,
    name_ar         nvarchar(max),
    description     nvarchar(max),
    description_ar  nvarchar(max),
    permissions     nvarchar(max)   DEFAULT '[]',
    is_system       bit             DEFAULT 0,
    is_active       bit             DEFAULT 1,
    priority        int             DEFAULT 0,
    color           nvarchar(max)   DEFAULT '#6366f1',
    icon            nvarchar(max)   DEFAULT 'user',
    created_at      datetime2       DEFAULT GETDATE(),
    updated_at      datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_roles PRIMARY KEY (id),
    CONSTRAINT uq_roles_name UNIQUE (name)
);

CREATE TABLE permission_definitions (
    id              nvarchar(255)   NOT NULL,
    [key]           nvarchar(500)   NOT NULL,
    name            nvarchar(max)   NOT NULL,
    name_ar         nvarchar(max),
    description     nvarchar(max),
    description_ar  nvarchar(max),
    category        nvarchar(max)   NOT NULL,
    category_ar     nvarchar(max),
    sub_category    nvarchar(max),
    is_active       bit             DEFAULT 1,
    sort_order      int             DEFAULT 0,
    depends_on      nvarchar(max)   DEFAULT '[]',
    created_at      datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_permission_definitions PRIMARY KEY (id),
    CONSTRAINT uq_permission_definitions_key UNIQUE ([key])
);

-- ============================================================================
-- 3. BRANCHES
-- ============================================================================

CREATE TABLE branches (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    location            nvarchar(max),
    address             nvarchar(max),
    server_ip           nvarchar(max),
    day_close_emails    nvarchar(max)   DEFAULT '[]',
    phone               nvarchar(max),
    email               nvarchar(max),
    is_active           bit             DEFAULT 1,
    timezone            nvarchar(max)   DEFAULT 'Africa/Cairo',
    currency            nvarchar(max)   DEFAULT 'EGP',
    tax_rate            real            DEFAULT 14,
    service_charge      real            DEFAULT 0,
    business_date       nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_branches PRIMARY KEY (id)
);

-- ============================================================================
-- 4. CUSTOMERS
-- ============================================================================

CREATE TABLE delivery_zones (
    id                  int             IDENTITY(1,1) NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    branch_id           nvarchar(255)   NOT NULL,
    delivery_fee        real            DEFAULT 0,
    min_order_amount    real            DEFAULT 0,
    estimated_time      int             DEFAULT 45,
    is_active           bit             DEFAULT 1,
    CONSTRAINT pk_delivery_zones PRIMARY KEY (id),
    CONSTRAINT fk_delivery_zones_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE customers (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(255)   NOT NULL,
    phone               nvarchar(20)    NOT NULL,
    email               nvarchar(max),
    address             nvarchar(max),
    lat                 real,
    lng                 real,
    address_label       nvarchar(max),
    zone_id             int,
    area                nvarchar(max),
    building            nvarchar(max),
    floor               nvarchar(max),
    apartment           nvarchar(max),
    landmark            nvarchar(max),
    notes               nvarchar(max),
    visits              int             DEFAULT 0,
    total_spent         real            DEFAULT 0,
    loyalty_tier        nvarchar(max)   DEFAULT 'Bronze',
    loyalty_points      int             DEFAULT 0,
    source              nvarchar(max)   DEFAULT 'call_center',
    deleted_at          datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_customers PRIMARY KEY (id),
    CONSTRAINT uq_customers_phone UNIQUE (phone),
    CONSTRAINT fk_customers_zone FOREIGN KEY (zone_id) REFERENCES delivery_zones(id)
);

CREATE INDEX idx_customers_name ON customers (name);

CREATE TABLE customer_addresses (
    id                  int             IDENTITY(1,1) NOT NULL,
    customer_id         nvarchar(255)   NOT NULL,
    label               nvarchar(max)   NOT NULL,
    address             nvarchar(max)   NOT NULL,
    lat                 real,
    lng                 real,
    zone_id             int,
    area                nvarchar(max),
    building            nvarchar(max),
    floor               nvarchar(max),
    apartment           nvarchar(max),
    landmark            nvarchar(max),
    is_default          bit             DEFAULT 0,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_customer_addresses PRIMARY KEY (id),
    CONSTRAINT fk_customer_addresses_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_customer_addresses_zone FOREIGN KEY (zone_id) REFERENCES delivery_zones(id)
);

-- ============================================================================
-- 5. MENU MANAGEMENT
-- ============================================================================

CREATE TABLE menu_categories (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    description         nvarchar(max),
    icon                nvarchar(max),
    image               nvarchar(max),
    color               nvarchar(max),
    sort_order          int             DEFAULT 0,
    is_active           bit             DEFAULT 1,
    target_order_types  nvarchar(max)   DEFAULT '[]',
    menu_ids            nvarchar(max)   DEFAULT '["menu-1"]',
    printer_ids         nvarchar(max)   DEFAULT '[]',
    deleted_at          datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_menu_categories PRIMARY KEY (id)
);

CREATE TABLE menu_items (
    id                  nvarchar(255)   NOT NULL,
    category_id         nvarchar(255),
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    description         nvarchar(max),
    description_ar      nvarchar(max),
    price               real            NOT NULL,
    cost                real            DEFAULT 0,
    image               nvarchar(max),
    status              nvarchar(max)   DEFAULT 'published',
    approved_by         nvarchar(255),
    approved_at         datetime2,
    published_at        datetime2,
    previous_price      real,
    pending_price       real,
    price_change_reason nvarchar(max),
    price_approved_by   nvarchar(255),
    price_approved_at   datetime2,
    is_available        bit             DEFAULT 1,
    available_from      nvarchar(max),
    available_to        nvarchar(max),
    available_days      nvarchar(max),
    modifier_groups     nvarchar(max),
    sizes               nvarchar(max)   DEFAULT '[]',
    branch_pricing      nvarchar(max),
    platform_pricing    nvarchar(max),
    preparation_time    int             DEFAULT 15,
    printer_ids         nvarchar(max),
    is_popular          bit             DEFAULT 0,
    is_featured         bit             DEFAULT 0,
    sort_order          int             DEFAULT 0,
    layout_type         nvarchar(50)   DEFAULT 'standard',
    barcode             nvarchar(255),
    sku                 nvarchar(100),
    is_tax_exempt       bit             DEFAULT 0,
    deleted_at          datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_menu_items PRIMARY KEY (id),
    CONSTRAINT fk_menu_items_category FOREIGN KEY (category_id) REFERENCES menu_categories(id),
    CONSTRAINT fk_menu_items_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
    CONSTRAINT fk_menu_items_price_approved_by FOREIGN KEY (price_approved_by) REFERENCES users(id)
);

CREATE INDEX idx_menu_items_category ON menu_items (category_id, is_available);
CREATE INDEX idx_menu_items_barcode ON menu_items (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_menu_items_sku ON menu_items (sku) WHERE sku IS NOT NULL;

CREATE TABLE modifier_groups (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    min_selection       int             DEFAULT 0,
    max_selection       int             DEFAULT 1,
    is_required         bit             DEFAULT 0,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_modifier_groups PRIMARY KEY (id)
);

CREATE TABLE modifier_options (
    id                  nvarchar(255)   NOT NULL,
    group_id            nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    price               real            DEFAULT 0,
    sort_order          int             DEFAULT 0,
    is_available        bit             DEFAULT 1,
    CONSTRAINT pk_modifier_options PRIMARY KEY (id),
    CONSTRAINT fk_modifier_options_group FOREIGN KEY (group_id) REFERENCES modifier_groups(id)
);

CREATE TABLE menu_item_modifiers (
    id                  int             IDENTITY(1,1) NOT NULL,
    menu_item_id        nvarchar(255)   NOT NULL,
    modifier_group_id   nvarchar(255)   NOT NULL,
    sort_order          int             DEFAULT 0,
    CONSTRAINT pk_menu_item_modifiers PRIMARY KEY (id),
    CONSTRAINT fk_menu_item_modifiers_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
    CONSTRAINT fk_menu_item_modifiers_group FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id)
);

-- ============================================================================
-- 6. FLOOR PLAN / TABLES
-- ============================================================================

CREATE TABLE floor_zones (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    width               int             DEFAULT 800,
    height              int             DEFAULT 600,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_floor_zones PRIMARY KEY (id),
    CONSTRAINT fk_floor_zones_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE tables (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    zone_id             nvarchar(255),
    branch_id           nvarchar(255)   NOT NULL,
    x                   int             DEFAULT 0,
    y                   int             DEFAULT 0,
    width               int             DEFAULT 100,
    height              int             DEFAULT 100,
    shape               nvarchar(max)   DEFAULT 'rectangle',
    seats               int             DEFAULT 4,
    discount_percent    real            DEFAULT 0,
    default_coupon_code nvarchar(255),
    min_spend           real            DEFAULT 0,
    is_vip              bit             DEFAULT 0,
    notes               nvarchar(max),
    status              nvarchar(max)   NOT NULL DEFAULT 'AVAILABLE',
    current_order_id    nvarchar(255),
    locked_by_user_id   nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_tables PRIMARY KEY (id),
    CONSTRAINT fk_tables_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_tables_zone FOREIGN KEY (zone_id) REFERENCES floor_zones(id)
);

-- ============================================================================
-- 7. ORDERS
-- ============================================================================

CREATE TABLE orders (
    id                      nvarchar(255)   NOT NULL,
    trace_id                nvarchar(max),
    parent_order_id         nvarchar(255),
    order_number            int             IDENTITY(1,1),
    daily_order_number      int,
    type                    nvarchar(max)   NOT NULL,
    source                  nvarchar(max)   DEFAULT 'pos',
    branch_id               nvarchar(255)   NOT NULL,
    table_id                nvarchar(255),
    customer_id             nvarchar(255),
    customer_name           nvarchar(max),
    customer_phone          nvarchar(max),
    delivery_address        nvarchar(max),
    delivery_address_id     int,
    delivery_lat            real,
    delivery_lng            real,
    delivery_address_label  nvarchar(max),
    is_call_center_order    bit             DEFAULT 0,
    call_center_agent_id    nvarchar(255),
    status                  nvarchar(50)   NOT NULL DEFAULT 'PENDING',
    subtotal                real            NOT NULL,
    discount                real            DEFAULT 0,
    discount_type           nvarchar(max),
    discount_reason         nvarchar(max),
    tax                     real            NOT NULL,
    delivery_fee            real            DEFAULT 0,
    service_charge          real            DEFAULT 0,
    total                   real            NOT NULL,
    tip_amount              real            DEFAULT 0,
    free_delivery           bit             DEFAULT 0,
    is_urgent               bit             DEFAULT 0,
    is_paid                 bit             DEFAULT 0,
    payment_method          nvarchar(max),
    paid_amount             real,
    change_amount           real,
    platform_order_id       nvarchar(max),
    delivery_source         nvarchar(max)   DEFAULT 'restaurant',
    notes                   nvarchar(max),
    kitchen_notes           nvarchar(max),
    delivery_notes          nvarchar(max),
    driver_id               nvarchar(255),
    estimated_delivery_time datetime2,
    actual_delivery_time    datetime2,
    sync_status             nvarchar(max)   DEFAULT 'SYNCED',
    eta_receipt_uuid        nvarchar(max),
    eta_status              nvarchar(max)   DEFAULT 'pending',
    business_date           nvarchar(max),
    created_at              datetime2       DEFAULT GETDATE(),
    updated_at              datetime2       DEFAULT GETDATE(),
    completed_at            datetime2,
    cancelled_at            datetime2,
    cancel_reason           nvarchar(max),
    shift_id                nvarchar(255),
    deleted_at              datetime2,
    CONSTRAINT pk_orders PRIMARY KEY (id),
    CONSTRAINT fk_orders_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_orders_parent FOREIGN KEY (parent_order_id) REFERENCES orders(id)
);

CREATE INDEX idx_orders_branch_date ON orders (branch_id, created_at);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_customer ON orders (customer_id);
CREATE INDEX idx_orders_shift ON orders (shift_id);

CREATE TABLE idempotency_keys (
    id                  int             IDENTITY(1,1) NOT NULL,
    [key]               nvarchar(500)   NOT NULL,
    scope               nvarchar(100)   NOT NULL DEFAULT 'ORDER_CREATE',
    request_hash        nvarchar(max)   NOT NULL,
    resource_id         nvarchar(max),
    response_code       int,
    response_body       nvarchar(max),
    status              nvarchar(max)   NOT NULL DEFAULT 'IN_PROGRESS',
    expires_at          datetime2       NOT NULL,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_idempotency_keys PRIMARY KEY (id)
);

CREATE UNIQUE INDEX idx_idempotency_keys_key_scope ON idempotency_keys ([key], scope);

CREATE TABLE order_items (
    id                  int             IDENTITY(1,1) NOT NULL,
    order_id            nvarchar(255)   NOT NULL,
    menu_item_id        nvarchar(255),
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    price               real            NOT NULL,
    cost                real            DEFAULT 0,
    quantity            int             NOT NULL,
    notes               nvarchar(max),
    modifiers           nvarchar(max),
    status              nvarchar(max)   DEFAULT 'PENDING',
    prepared_at         datetime2,
    served_at           datetime2,
    tax                 real            DEFAULT 0,
    seat_number         int,
    course              nvarchar(max),
    CONSTRAINT pk_order_items PRIMARY KEY (id),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_items_menu_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_order_items_menu_item ON order_items (menu_item_id);

CREATE TABLE order_status_history (
    id                  int             IDENTITY(1,1) NOT NULL,
    order_id            nvarchar(255)   NOT NULL,
    status              nvarchar(max)   NOT NULL,
    changed_by          nvarchar(max),
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_order_status_history PRIMARY KEY (id),
    CONSTRAINT fk_order_status_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ============================================================================
-- 8. PAYMENTS
-- ============================================================================

CREATE TABLE payments (
    id                  nvarchar(255)   NOT NULL,
    order_id            nvarchar(255)   NOT NULL,
    method              nvarchar(max)   NOT NULL,
    amount              real            NOT NULL,
    reference_number    nvarchar(max),
    status              nvarchar(max)   DEFAULT 'COMPLETED',
    processed_by        nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_payments PRIMARY KEY (id),
    CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX idx_payments_order ON payments (order_id);

CREATE TABLE payment_sessions (
    id                  nvarchar(255)   NOT NULL,
    order_id            nvarchar(255)   NOT NULL,
    provider_type       nvarchar(max),
    status              nvarchar(max)   DEFAULT 'initiated',
    amount              real            NOT NULL,
    currency            nvarchar(max)   DEFAULT 'EGP',
    verified            bit             DEFAULT 0,
    external_reference  nvarchar(max),
    idempotency_key     nvarchar(500),
    device_id           nvarchar(max),
    created_by          nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_payment_sessions PRIMARY KEY (id),
    CONSTRAINT fk_payment_sessions_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT uq_payment_sessions_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX idx_payment_sessions_order ON payment_sessions (order_id);
CREATE INDEX idx_payment_sessions_idempotency ON payment_sessions (idempotency_key);

CREATE TABLE ledger_entries (
    id                  nvarchar(255)   NOT NULL,
    order_id            nvarchar(255),
    payment_session_id  nvarchar(255),
    account             nvarchar(255)   NOT NULL,
    direction           nvarchar(max)   NOT NULL,
    amount              real            NOT NULL,
    currency            nvarchar(max)   DEFAULT 'EGP',
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_ledger_entries PRIMARY KEY (id),
    CONSTRAINT fk_ledger_entries_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_ledger_entries_payment_session FOREIGN KEY (payment_session_id) REFERENCES payment_sessions(id)
);

CREATE INDEX idx_ledger_entries_order ON ledger_entries (order_id);
CREATE INDEX idx_ledger_entries_account ON ledger_entries (account);

-- ============================================================================
-- 9. SHIFTS
-- ============================================================================

CREATE TABLE shifts (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    user_id             nvarchar(255)   NOT NULL,
    opening_time        datetime2       NOT NULL DEFAULT GETDATE(),
    closing_time        datetime2,
    opening_balance     real            NOT NULL DEFAULT 0,
    expected_balance    real            DEFAULT 0,
    actual_balance      real            DEFAULT 0,
    status              nvarchar(50)   NOT NULL DEFAULT 'OPEN',
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_shifts PRIMARY KEY (id),
    CONSTRAINT fk_shifts_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_shifts_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_shifts_branch_status ON shifts (branch_id, status);

-- ============================================================================
-- 10. INVENTORY
-- ============================================================================

CREATE TABLE warehouses (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    branch_id           nvarchar(255),
    type                nvarchar(max)   DEFAULT 'MAIN',
    parent_id           nvarchar(255),
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_warehouses PRIMARY KEY (id),
    CONSTRAINT fk_warehouses_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE inventory_items (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    sku                 nvarchar(100),
    barcode             nvarchar(255),
    unit                nvarchar(max)   NOT NULL,
    category            nvarchar(max),
    threshold           real            DEFAULT 0,
    cost_price          real            DEFAULT 0,
    purchase_price      real            DEFAULT 0,
    supplier_id         nvarchar(255),
    is_audited          bit             DEFAULT 1,
    audit_frequency     nvarchar(max)   DEFAULT 'DAILY',
    is_composite        bit             DEFAULT 0,
    bom                 nvarchar(max)   DEFAULT '[]',
    is_active           bit             DEFAULT 1,
    deleted_at          datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_inventory_items PRIMARY KEY (id)
);

CREATE INDEX idx_inventory_items_barcode ON inventory_items (barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX idx_inventory_items_sku_not_null ON inventory_items (sku) WHERE sku IS NOT NULL;

CREATE TABLE inventory_ledger (
    id                  nvarchar(255)   NOT NULL,
    product_id          nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    change              real            NOT NULL,
    unit_cost           real            NOT NULL,
    reason              nvarchar(max)   NOT NULL,
    reference_id        nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_inventory_ledger PRIMARY KEY (id),
    CONSTRAINT fk_inventory_ledger_item FOREIGN KEY (product_id) REFERENCES inventory_items(id),
    CONSTRAINT fk_inventory_ledger_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX idx_inventory_ledger_product_branch ON inventory_ledger (product_id, branch_id);
CREATE INDEX idx_inventory_ledger_reference ON inventory_ledger (reference_id);

CREATE TABLE inventory_stock (
    id                  int             IDENTITY(1,1) NOT NULL,
    item_id             nvarchar(255)   NOT NULL,
    warehouse_id        nvarchar(255)   NOT NULL,
    quantity            real            DEFAULT 0,
    last_updated        datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_inventory_stock PRIMARY KEY (id),
    CONSTRAINT fk_inventory_stock_item FOREIGN KEY (item_id) REFERENCES inventory_items(id),
    CONSTRAINT fk_inventory_stock_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

CREATE INDEX idx_inv_stock_item_wh ON inventory_stock (item_id, warehouse_id);

CREATE TABLE stock_movements (
    id                  int             IDENTITY(1,1) NOT NULL,
    item_id             nvarchar(255)   NOT NULL,
    from_warehouse_id   nvarchar(255),
    to_warehouse_id     nvarchar(255),
    quantity            real            NOT NULL,
    unit_cost           real            DEFAULT 0,
    total_cost          real            DEFAULT 0,
    type                nvarchar(max)   NOT NULL,
    reference_id        nvarchar(max),
    reason              nvarchar(max),
    performed_by        nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_stock_movements PRIMARY KEY (id),
    CONSTRAINT fk_stock_movements_item FOREIGN KEY (item_id) REFERENCES inventory_items(id),
    CONSTRAINT fk_stock_movements_from_wh FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
    CONSTRAINT fk_stock_movements_to_wh FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id)
);

CREATE INDEX idx_stock_mov_item_date ON stock_movements (item_id, created_at);

CREATE TABLE inventory_batches (
    id                  nvarchar(255)   NOT NULL,
    item_id             nvarchar(255)   NOT NULL,
    warehouse_id        nvarchar(255)   NOT NULL,
    batch_number        nvarchar(max)   NOT NULL,
    received_date       datetime2       NOT NULL DEFAULT GETDATE(),
    expiry_date         datetime2       NOT NULL,
    initial_qty         real            NOT NULL,
    current_qty         real            NOT NULL,
    unit_cost           real            NOT NULL,
    supplier_id         nvarchar(255),
    status              nvarchar(50)   NOT NULL DEFAULT 'ACTIVE',
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_inventory_batches PRIMARY KEY (id),
    CONSTRAINT fk_inventory_batches_item FOREIGN KEY (item_id) REFERENCES inventory_items(id),
    CONSTRAINT fk_inventory_batches_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

CREATE INDEX idx_fefo ON inventory_batches (item_id, warehouse_id, expiry_date, status);
CREATE INDEX idx_inv_batches_item_expiry ON inventory_batches (item_id, expiry_date);

CREATE TABLE batch_transactions (
    id                  int             IDENTITY(1,1) NOT NULL,
    batch_id            nvarchar(255)   NOT NULL,
    stock_movement_id   int             NOT NULL,
    quantity_used       real            NOT NULL,
    cost_at_time        real            NOT NULL,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_batch_transactions PRIMARY KEY (id),
    CONSTRAINT fk_batch_transactions_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
    CONSTRAINT fk_batch_transactions_movement FOREIGN KEY (stock_movement_id) REFERENCES stock_movements(id)
);

CREATE TABLE stock_counts (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    warehouse_id        nvarchar(255),
    count_date          date,
    status              nvarchar(max)   DEFAULT 'DRAFT',
    type                nvarchar(max)   DEFAULT 'FULL',
    remarks             nvarchar(max),
    created_by          nvarchar(255),
    approved_by         nvarchar(255),
    scheduled_date      datetime2,
    frozen_at           datetime2,
    posted_at           datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_stock_counts PRIMARY KEY (id),
    CONSTRAINT fk_stock_counts_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_stock_counts_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    CONSTRAINT fk_stock_counts_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_stock_counts_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE stock_count_lines (
    id                  int             IDENTITY(1,1) NOT NULL,
    count_id            nvarchar(255)   NOT NULL,
    item_id             nvarchar(255)   NOT NULL,
    expected_qty        real            DEFAULT 0,
    counted_qty         real,
    variance_qty        real,
    cost                real            DEFAULT 0,
    notes               nvarchar(max),
    CONSTRAINT pk_stock_count_lines PRIMARY KEY (id),
    CONSTRAINT fk_stock_count_lines_count FOREIGN KEY (count_id) REFERENCES stock_counts(id),
    CONSTRAINT fk_stock_count_lines_item FOREIGN KEY (item_id) REFERENCES inventory_items(id)
);

-- ============================================================================
-- 11. RECIPES
-- ============================================================================

CREATE TABLE recipes (
    id                  nvarchar(255)   NOT NULL,
    menu_item_id        nvarchar(255),
    inventory_item_id   nvarchar(255),
    yield               real            DEFAULT 1,
    size_id             nvarchar(max),
    instructions        nvarchar(max),
    version             int             DEFAULT 1,
    current_version_id  nvarchar(255),
    calculated_cost     real,
    last_cost_calculation datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_recipes PRIMARY KEY (id),
    CONSTRAINT fk_recipes_menu_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
    CONSTRAINT fk_recipes_inventory_item FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id)
);

CREATE TABLE recipe_versions (
    id                  nvarchar(255)   NOT NULL,
    recipe_id           nvarchar(255)   NOT NULL,
    version             int             NOT NULL,
    yield               real            DEFAULT 1,
    size_id             nvarchar(max),
    instructions        nvarchar(max),
    ingredients_snapshot nvarchar(max),
    calculated_cost     real,
    changed_by          nvarchar(255),
    change_reason       nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_recipe_versions PRIMARY KEY (id),
    CONSTRAINT fk_recipe_versions_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id),
    CONSTRAINT fk_recipe_versions_changed_by FOREIGN KEY (changed_by) REFERENCES users(id)
);

CREATE TABLE recipe_ingredients (
    id                  int             IDENTITY(1,1) NOT NULL,
    recipe_id           nvarchar(255)   NOT NULL,
    inventory_item_id   nvarchar(255)   NOT NULL,
    quantity            real            NOT NULL,
    unit                nvarchar(max)   NOT NULL,
    notes               nvarchar(max),
    last_known_cost     real,
    last_cost_update    datetime2,
    CONSTRAINT pk_recipe_ingredients PRIMARY KEY (id),
    CONSTRAINT fk_recipe_ingredients_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id),
    CONSTRAINT fk_recipe_ingredients_inventory FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id)
);

-- ============================================================================
-- 12. SUPPLIERS & PURCHASING
-- ============================================================================

CREATE TABLE suppliers (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    contact_person      nvarchar(max),
    phone               nvarchar(max),
    email               nvarchar(max),
    address             nvarchar(max),
    category            nvarchar(max),
    payment_terms       nvarchar(max),
    notes               nvarchar(max),
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_suppliers PRIMARY KEY (id)
);

CREATE TABLE purchase_orders (
    id                  nvarchar(255)   NOT NULL,
    supplier_id         nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    target_warehouse_id nvarchar(255),
    status              nvarchar(max)   DEFAULT 'DRAFT',
    expected_date       datetime2,
    subtotal            real            DEFAULT 0,
    notes               nvarchar(max),
    created_by          nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_purchase_orders PRIMARY KEY (id),
    CONSTRAINT fk_purchase_orders_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    CONSTRAINT fk_purchase_orders_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_purchase_orders_target_warehouse FOREIGN KEY (target_warehouse_id) REFERENCES warehouses(id)
);

CREATE TABLE purchase_order_items (
    id                  int             IDENTITY(1,1) NOT NULL,
    po_id               nvarchar(255)   NOT NULL,
    item_id             nvarchar(255)   NOT NULL,
    ordered_qty         real            NOT NULL,
    received_qty        real            DEFAULT 0,
    unit_price          real            NOT NULL,
    CONSTRAINT pk_purchase_order_items PRIMARY KEY (id),
    CONSTRAINT fk_purchase_order_items_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
    CONSTRAINT fk_purchase_order_items_item FOREIGN KEY (item_id) REFERENCES inventory_items(id)
);

CREATE TABLE purchase_requests (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    department          nvarchar(max),
    status              nvarchar(max)   DEFAULT 'PENDING',
    requested_by        nvarchar(255),
    approved_by         nvarchar(255),
    expected_date       datetime2,
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_purchase_requests PRIMARY KEY (id),
    CONSTRAINT fk_purchase_requests_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_purchase_requests_requested_by FOREIGN KEY (requested_by) REFERENCES users(id),
    CONSTRAINT fk_purchase_requests_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE purchase_request_items (
    id                  int             IDENTITY(1,1) NOT NULL,
    pr_id               nvarchar(255)   NOT NULL,
    item_id             nvarchar(255)   NOT NULL,
    requested_qty       real            NOT NULL,
    approved_qty        real,
    CONSTRAINT pk_purchase_request_items PRIMARY KEY (id),
    CONSTRAINT fk_purchase_request_items_pr FOREIGN KEY (pr_id) REFERENCES purchase_requests(id),
    CONSTRAINT fk_purchase_request_items_item FOREIGN KEY (item_id) REFERENCES inventory_items(id)
);

CREATE TABLE goods_receipt_notes (
    id                  nvarchar(255)   NOT NULL,
    po_id               nvarchar(255),
    supplier_id         nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    status              nvarchar(max)   DEFAULT 'RECEIVED',
    received_by         nvarchar(255),
    reference_number    nvarchar(max),
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_goods_receipt_notes PRIMARY KEY (id),
    CONSTRAINT fk_grn_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
    CONSTRAINT fk_grn_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    CONSTRAINT fk_grn_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_grn_received_by FOREIGN KEY (received_by) REFERENCES users(id)
);

CREATE TABLE grn_items (
    id                  int             IDENTITY(1,1) NOT NULL,
    grn_id              nvarchar(255)   NOT NULL,
    item_id             nvarchar(255)   NOT NULL,
    po_item_id          int,
    received_qty        real            NOT NULL,
    rejected_qty        real            DEFAULT 0,
    unit_price          real            NOT NULL,
    expiry_date         datetime2,
    batch_number        nvarchar(max),
    CONSTRAINT pk_grn_items PRIMARY KEY (id),
    CONSTRAINT fk_grn_items_grn FOREIGN KEY (grn_id) REFERENCES goods_receipt_notes(id),
    CONSTRAINT fk_grn_items_item FOREIGN KEY (item_id) REFERENCES inventory_items(id),
    CONSTRAINT fk_grn_items_po_item FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id)
);

CREATE TABLE supplier_invoices (
    id                  nvarchar(255)   NOT NULL,
    supplier_id         nvarchar(255)   NOT NULL,
    grn_id              nvarchar(255),
    status              nvarchar(max)   DEFAULT 'DRAFT',
    invoice_number      nvarchar(max),
    date                datetime2       NOT NULL DEFAULT GETDATE(),
    due_date            datetime2,
    subtotal            real            DEFAULT 0,
    tax                 real            DEFAULT 0,
    discount            real            DEFAULT 0,
    total               real            DEFAULT 0,
    amount_paid         real            DEFAULT 0,
    notes               nvarchar(max),
    created_by          nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_supplier_invoices PRIMARY KEY (id),
    CONSTRAINT fk_supplier_invoices_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    CONSTRAINT fk_supplier_invoices_grn FOREIGN KEY (grn_id) REFERENCES goods_receipt_notes(id),
    CONSTRAINT fk_supplier_invoices_created_by FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE supplier_invoice_items (
    id                  int             IDENTITY(1,1) NOT NULL,
    invoice_id          nvarchar(255)   NOT NULL,
    item_id             nvarchar(255)   NOT NULL,
    qty                 real            NOT NULL,
    unit_price          real            NOT NULL,
    total               real            NOT NULL,
    CONSTRAINT pk_supplier_invoice_items PRIMARY KEY (id),
    CONSTRAINT fk_supplier_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id),
    CONSTRAINT fk_supplier_invoice_items_item FOREIGN KEY (item_id) REFERENCES inventory_items(id)
);

CREATE TABLE supplier_payments (
    id                  nvarchar(255)   NOT NULL,
    supplier_id         nvarchar(255)   NOT NULL,
    invoice_id          nvarchar(255),
    amount              real            NOT NULL,
    payment_method      nvarchar(max)   NOT NULL,
    reference           nvarchar(max),
    status              nvarchar(max)   DEFAULT 'COMPLETED',
    created_by          nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_supplier_payments PRIMARY KEY (id),
    CONSTRAINT fk_supplier_payments_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    CONSTRAINT fk_supplier_payments_invoice FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id),
    CONSTRAINT fk_supplier_payments_created_by FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ============================================================================
-- 13. PRODUCTION
-- ============================================================================

CREATE TABLE production_orders (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    recipe_id           nvarchar(255),
    menu_item_id        nvarchar(255),
    quantity            real            NOT NULL,
    status              nvarchar(max)   DEFAULT 'PLANNED',
    notes               nvarchar(max),
    created_by          nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_production_orders PRIMARY KEY (id),
    CONSTRAINT fk_production_orders_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE production_order_items (
    id                  int             IDENTITY(1,1) NOT NULL,
    production_order_id nvarchar(255)   NOT NULL,
    inventory_item_id   nvarchar(255)   NOT NULL,
    quantity_planned    real            NOT NULL,
    quantity_used       real            DEFAULT 0,
    CONSTRAINT pk_production_order_items PRIMARY KEY (id),
    CONSTRAINT fk_production_order_items_po FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    CONSTRAINT fk_production_order_items_item FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id)
);

-- ============================================================================
-- 14. PRINTERS
-- ============================================================================

CREATE TABLE printers (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    code                nvarchar(max),
    type                nvarchar(max)   NOT NULL,
    address             nvarchar(max),
    location            nvarchar(max),
    role                nvarchar(max)   DEFAULT 'OTHER',
    roles               nvarchar(max)   DEFAULT '[]',
    station_id          nvarchar(max),
    gateway_id          nvarchar(max),
    is_primary_cashier  bit             DEFAULT 0,
    last_heartbeat_at   datetime2,
    heartbeat_status    nvarchar(max)   DEFAULT 'UNKNOWN',
    branch_id           nvarchar(255),
    is_active           bit             DEFAULT 1,
    paper_width         int             DEFAULT 80,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_printers PRIMARY KEY (id),
    CONSTRAINT fk_printers_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================================================
-- 15. PRINT JOBS
-- ============================================================================

CREATE TABLE print_jobs (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    gateway_id          nvarchar(255),
    type                nvarchar(max)   NOT NULL,
    content             nvarchar(max)   NOT NULL,
    content_type        nvarchar(max)   DEFAULT 'text',
status                  nvarchar(50)   NOT NULL DEFAULT 'PENDING',
    claimed_by          nvarchar(255),
    claimed_at          datetime2,
    completed_at        datetime2,
    failed_at           datetime2,
    error_message       nvarchar(max),
    attempts            int             DEFAULT 0,
    max_attempts        int             DEFAULT 3,
    printer_id          nvarchar(255),
    printer_address     nvarchar(max),
    printer_type        nvarchar(max),
    target_gateway_id   nvarchar(max),
    created_by          nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_print_jobs PRIMARY KEY (id),
    CONSTRAINT fk_print_jobs_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX idx_print_jobs_status_branch ON print_jobs (status, branch_id);
CREATE INDEX idx_print_jobs_gateway ON print_jobs (gateway_id, status);

-- ============================================================================
-- 16. DELIVERY
-- ============================================================================

CREATE TABLE delivery_platforms (
    id                      nvarchar(255)   NOT NULL,
    name                    nvarchar(max)   NOT NULL,
    is_active               bit             NOT NULL DEFAULT 1,
    fee_percentage          real            DEFAULT 0,
    apply_fees_to_menu_price bit            NOT NULL DEFAULT 0,
    price_markup_percentage real            DEFAULT 0,
    price_markup_fixed      real            DEFAULT 0,
    integration_type        nvarchar(max)   DEFAULT 'MANUAL',
    created_at              datetime2       DEFAULT GETDATE(),
    updated_at              datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_delivery_platforms PRIMARY KEY (id)
);

CREATE TABLE drivers (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    phone               nvarchar(max)   NOT NULL,
    branch_id           nvarchar(255),
    status              nvarchar(max)   DEFAULT 'AVAILABLE',
    current_cash_balance real           DEFAULT 0,
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_drivers PRIMARY KEY (id),
    CONSTRAINT fk_drivers_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE driver_telemetry (
    id                  int             IDENTITY(1,1) NOT NULL,
    driver_id           nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255),
    lat                 real            NOT NULL,
    lng                 real            NOT NULL,
    speed_kmh           real,
    accuracy            real,
    heading             real,
    altitude            real,
    battery_level       int,
    is_charging         bit,
    order_id            nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_driver_telemetry PRIMARY KEY (id),
    CONSTRAINT fk_driver_telemetry_driver FOREIGN KEY (driver_id) REFERENCES drivers(id),
    CONSTRAINT fk_driver_telemetry_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX idx_telemetry_driver ON driver_telemetry (driver_id);
CREATE INDEX idx_telemetry_branch ON driver_telemetry (branch_id);
CREATE INDEX idx_telemetry_created ON driver_telemetry (created_at);

CREATE TABLE driver_telemetry_latest (
    driver_id           nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255),
    lat                 real            NOT NULL,
    lng                 real            NOT NULL,
    speed_kmh           real,
    accuracy            real,
    heading             real,
    battery_level       int,
    order_id            nvarchar(255),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_driver_telemetry_latest PRIMARY KEY (driver_id),
    CONSTRAINT fk_driver_telemetry_latest_driver FOREIGN KEY (driver_id) REFERENCES drivers(id),
    CONSTRAINT fk_driver_telemetry_latest_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE delivery_assignments (
    id                  nvarchar(255)   NOT NULL,
    order_id            nvarchar(255)   NOT NULL,
    driver_id           nvarchar(255)   NOT NULL,
    status              nvarchar(max)   DEFAULT 'ASSIGNED',
    assigned_at         datetime2       DEFAULT GETDATE(),
    picked_up_at        datetime2,
    delivered_at        datetime2,
    notes               nvarchar(max),
    CONSTRAINT pk_delivery_assignments PRIMARY KEY (id),
    CONSTRAINT fk_delivery_assignments_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_delivery_assignments_driver FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

-- ============================================================================
-- 17. FINANCE & ACCOUNTING
-- ============================================================================

CREATE TABLE cost_centers (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    code                nvarchar(100)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_cost_centers PRIMARY KEY (id),
    CONSTRAINT uq_cost_centers_code UNIQUE (code),
    CONSTRAINT fk_cost_centers_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE fiscal_periods (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    start_date          datetime2       NOT NULL,
    end_date            datetime2       NOT NULL,
    status              nvarchar(max)   NOT NULL DEFAULT 'OPEN',
    closed_by           nvarchar(255),
    closed_at           datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_fiscal_periods PRIMARY KEY (id),
    CONSTRAINT fk_fiscal_periods_closed_by FOREIGN KEY (closed_by) REFERENCES users(id)
);

CREATE TABLE chart_of_accounts (
    id                  nvarchar(255)   NOT NULL,
    code                nvarchar(100)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    type                nvarchar(50)   NOT NULL,
    normal_balance      nvarchar(max)   NOT NULL,
    parent_id           nvarchar(255),
    is_active           bit             DEFAULT 1,
    is_control_account  bit             DEFAULT 0,
    allow_manual_journals bit           DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_chart_of_accounts PRIMARY KEY (id),
    CONSTRAINT uq_chart_of_accounts_code UNIQUE (code)
);

CREATE INDEX idx_coa_type ON chart_of_accounts (type);
CREATE INDEX idx_coa_code ON chart_of_accounts (code);

CREATE TABLE payment_method_accounts (
    id                  int             IDENTITY(1,1) NOT NULL,
    payment_method      nvarchar(100)   NOT NULL,
    account_id          nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255),
    CONSTRAINT pk_payment_method_accounts PRIMARY KEY (id),
    CONSTRAINT uq_payment_method_accounts_method UNIQUE (payment_method),
    CONSTRAINT fk_payment_method_accounts_account FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
    CONSTRAINT fk_payment_method_accounts_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE tax_accounts (
    id                  int             IDENTITY(1,1) NOT NULL,
    tax_type            nvarchar(max)   NOT NULL,
    account_id          nvarchar(255)   NOT NULL,
    rate                real            NOT NULL,
    CONSTRAINT pk_tax_accounts PRIMARY KEY (id),
    CONSTRAINT fk_tax_accounts_account FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
);

CREATE TABLE journal_entries (
    id                  nvarchar(255)   NOT NULL,
    entry_number        int             IDENTITY(1,1),
    date                datetime2       NOT NULL DEFAULT GETDATE(),
    reference           nvarchar(500),
    reference_type      nvarchar(100)   NOT NULL,
    description         nvarchar(max)   NOT NULL,
    status              nvarchar(50)   NOT NULL DEFAULT 'POSTED',
    fiscal_period_id    nvarchar(255),
    created_by          nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_journal_entries PRIMARY KEY (id)
);

CREATE INDEX idx_je_ref ON journal_entries (reference, reference_type);
CREATE INDEX idx_je_date_status ON journal_entries (date, status);
CREATE INDEX idx_je_source ON journal_entries (reference_type);

CREATE TABLE journal_lines (
    id                  int             IDENTITY(1,1) NOT NULL,
    journal_entry_id    nvarchar(255)   NOT NULL,
    account_id          nvarchar(255)   NOT NULL,
    cost_center_id      nvarchar(255),
    debit               real            NOT NULL DEFAULT 0,
    credit              real            NOT NULL DEFAULT 0,
    description         nvarchar(max),
    CONSTRAINT pk_journal_lines PRIMARY KEY (id),
    CONSTRAINT fk_journal_lines_entry FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
    CONSTRAINT fk_journal_lines_account FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
    CONSTRAINT fk_journal_lines_cost_center FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id)
);

CREATE INDEX idx_jl_entry ON journal_lines (journal_entry_id);
CREATE INDEX idx_jl_account ON journal_lines (account_id);
CREATE INDEX idx_jl_acc_cc ON journal_lines (account_id, cost_center_id);

CREATE TABLE posting_rules (
    id                  nvarchar(255)   NOT NULL,
    document_type       nvarchar(max)   NOT NULL,
    amount_source       nvarchar(max)   NOT NULL,
    direction           nvarchar(max)   NOT NULL,
    account_code        nvarchar(max)   NOT NULL,
    condition_field     nvarchar(max),
    condition_value     nvarchar(max),
    is_active           bit             DEFAULT 1,
    is_system           bit             DEFAULT 0,
    version             int             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_posting_rules PRIMARY KEY (id)
);

CREATE TABLE recurring_journals (
    id                  nvarchar(255)   NOT NULL,
    title               nvarchar(max)   NOT NULL,
    frequency           nvarchar(max)   NOT NULL,
    next_run_date       datetime2       NOT NULL,
    status              nvarchar(max)   DEFAULT 'ACTIVE',
    payload             nvarchar(max)   NOT NULL,
    last_run_date       datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_recurring_journals PRIMARY KEY (id)
);

CREATE TABLE budgets (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    branch_id           nvarchar(255),
    period_start        datetime2       NOT NULL,
    period_end          datetime2       NOT NULL,
    status              nvarchar(max)   NOT NULL DEFAULT 'DRAFT',
    notes               nvarchar(max),
    created_by          nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_budgets PRIMARY KEY (id),
    CONSTRAINT fk_budgets_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_budgets_created_by FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE budget_lines (
    id                  int             IDENTITY(1,1) NOT NULL,
    budget_id           nvarchar(255)   NOT NULL,
    account_id          nvarchar(255)   NOT NULL,
    planned_amount      decimal(14,2)   NOT NULL DEFAULT 0,
    description         nvarchar(max),
    CONSTRAINT pk_budget_lines PRIMARY KEY (id),
    CONSTRAINT fk_budget_lines_budget FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
    CONSTRAINT fk_budget_lines_account FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
);

CREATE INDEX idx_budget_lines_budget ON budget_lines (budget_id);
CREATE INDEX idx_budget_lines_account ON budget_lines (account_id);

CREATE TABLE finance_exceptions (
    id                  nvarchar(255)   NOT NULL,
    reference           nvarchar(max),
    reference_type      nvarchar(max),
    payload             nvarchar(max),
    reason              nvarchar(max)   NOT NULL,
    status              nvarchar(max)   DEFAULT 'PENDING',
    resolved_by         nvarchar(max),
    resolved_at         datetime2,
    resolution_notes    nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_finance_exceptions PRIMARY KEY (id)
);

-- ============================================================================
-- 18. FISCAL / ETA
-- ============================================================================

CREATE TABLE fiscal_logs (
    id                  int             IDENTITY(1,1) NOT NULL,
    order_id            nvarchar(max),
    branch_id           nvarchar(max),
    status              nvarchar(max)   NOT NULL,
    attempt             int             DEFAULT 0,
    last_error          nvarchar(max),
    payload             nvarchar(max),
    response            nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_fiscal_logs PRIMARY KEY (id)
);

CREATE TABLE eta_dead_letters (
    id                  int             IDENTITY(1,1) NOT NULL,
    order_id            nvarchar(max),
    branch_id           nvarchar(max),
    payload             nvarchar(max)   NOT NULL,
    attempts            int             DEFAULT 0,
    last_error          nvarchar(max),
    status              nvarchar(max)   DEFAULT 'PENDING',
    dismissed_by        nvarchar(max),
    dismissed_at        datetime2,
    resolved_at         datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_eta_dead_letters PRIMARY KEY (id)
);

-- ============================================================================
-- 19. AUDIT
-- ============================================================================

CREATE TABLE audit_logs (
    id                  int             IDENTITY(1,1) NOT NULL,
    event_type          nvarchar(max)   NOT NULL,
    user_id             nvarchar(max),
    user_name           nvarchar(max),
    user_role           nvarchar(max),
    branch_id           nvarchar(max),
    device_id           nvarchar(max),
    ip_address          nvarchar(max),
    payload             nvarchar(max),
    before              nvarchar(max),
    after               nvarchar(max),
    reason              nvarchar(max),
    signature           nvarchar(max),
    signature_version   int             DEFAULT 1,
    is_verified         bit,
    last_verified_at    datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_audit_logs PRIMARY KEY (id)
);

-- ============================================================================
-- 20. SETTINGS
-- ============================================================================

CREATE TABLE system_settings (
    id                  int             IDENTITY(1,1) NOT NULL,
    [key]               nvarchar(500)   NOT NULL,
    value               nvarchar(max),
    category            nvarchar(max),
    updated_by          nvarchar(max),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_system_settings PRIMARY KEY (id),
    CONSTRAINT uq_system_settings_key UNIQUE ([key])
);

CREATE TABLE settings (
    [key]               nvarchar(255)   NOT NULL,
    value               nvarchar(max)   NOT NULL,
    category            nvarchar(max)   DEFAULT 'general',
    updated_by          nvarchar(max),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_settings PRIMARY KEY ([key])
);

-- ============================================================================
-- 21. IMAGES
-- ============================================================================

CREATE TABLE images (
    id                  nvarchar(255)   NOT NULL,
    [key]               nvarchar(max)   NOT NULL,
    url                 nvarchar(max)   NOT NULL,
    filename            nvarchar(max),
    content_type        nvarchar(max),
    width               int,
    height              int,
    size                int,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_images PRIMARY KEY (id)
);

-- ============================================================================
-- 22. MANAGER APPROVALS
-- ============================================================================

CREATE TABLE manager_approvals (
    id                  int             IDENTITY(1,1) NOT NULL,
    manager_id          nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    action_type         nvarchar(max)   NOT NULL,
    related_id          nvarchar(max),
    reason              nvarchar(max)   NOT NULL,
    details             nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_manager_approvals PRIMARY KEY (id),
    CONSTRAINT fk_manager_approvals_manager FOREIGN KEY (manager_id) REFERENCES users(id),
    CONSTRAINT fk_manager_approvals_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================================================
-- 23. WEBHOOKS
-- ============================================================================

CREATE TABLE webhook_endpoints (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    url                 nvarchar(max)   NOT NULL,
    secret              nvarchar(max),
    events              nvarchar(max)   DEFAULT '[]',
    is_active           bit             DEFAULT 1,
    branch_id           nvarchar(255),
    headers             nvarchar(max)   DEFAULT '{}',
    retry_count         int             DEFAULT 3,
    timeout_ms          int             DEFAULT 10000,
    created_by          nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_webhook_endpoints PRIMARY KEY (id)
);

CREATE TABLE webhook_deliveries (
    id                  int             IDENTITY(1,1) NOT NULL,
    endpoint_id         nvarchar(255)   NOT NULL,
    event               nvarchar(max)   NOT NULL,
    payload             nvarchar(max),
    status              nvarchar(max)   DEFAULT 'PENDING',
    http_status         int,
    response_body       nvarchar(max),
    attempt             int             DEFAULT 0,
    duration_ms         int,
    next_retry_at       datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_webhook_deliveries PRIMARY KEY (id),
    CONSTRAINT fk_webhook_deliveries_endpoint FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id)
);

-- ============================================================================
-- 24. DAY CLOSE
-- ============================================================================

CREATE TABLE day_close_reports (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    business_date       date            NOT NULL,
    status              nvarchar(max)   DEFAULT 'DRAFT',
    opened_at           datetime2,
    closed_at           datetime2,
    gross_sales         real            DEFAULT 0,
    net_sales           real            DEFAULT 0,
    discounts           real            DEFAULT 0,
    void_amount         real            DEFAULT 0,
    refund_amount       real            DEFAULT 0,
    taxes               real            DEFAULT 0,
    tips                real            DEFAULT 0,
    delivery_fees       real            DEFAULT 0,
    service_charges     real            DEFAULT 0,
    cash_sales          real            DEFAULT 0,
    card_sales          real            DEFAULT 0,
    expected_cash       real            DEFAULT 0,
    actual_cash         real            DEFAULT 0,
    cash_difference     real            DEFAULT 0,
    total_transactions  int             DEFAULT 0,
    operational_snapshot nvarchar(max),
    notes               nvarchar(max),
    created_by          nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_day_close_reports PRIMARY KEY (id),
    CONSTRAINT fk_day_close_reports_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_day_close_reports_created_by FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ============================================================================
-- 25. DAILY BRANCH SUMMARIES
-- ============================================================================

CREATE TABLE daily_branch_summaries (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    business_date       date            NOT NULL,
    total_orders        int             DEFAULT 0,
    total_revenue       real            DEFAULT 0,
    total_cost          real            DEFAULT 0,
    total_profit        real            DEFAULT 0,
    total_discounts     real            DEFAULT 0,
    total_taxes         real            DEFAULT 0,
    total_tips          real            DEFAULT 0,
    avg_order_value     real            DEFAULT 0,
    items_sold_count    int             DEFAULT 0,
    top_items           nvarchar(max)   DEFAULT '[]',
    summary_metrics     nvarchar(max)   DEFAULT '{}',
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_daily_branch_summaries PRIMARY KEY (id),
    CONSTRAINT fk_daily_branch_summaries_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE item_daily_snapshots (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    menu_item_id        nvarchar(255),
    business_date       date            NOT NULL,
    total_qty           int             DEFAULT 0,
    total_revenue       real            DEFAULT 0,
    total_cost          real            DEFAULT 0,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_item_daily_snapshots PRIMARY KEY (id),
    CONSTRAINT fk_item_daily_snapshots_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================================================
-- 26. HR / EMPLOYEES
-- ============================================================================

CREATE TABLE departments (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    branch_id           nvarchar(255),
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_departments PRIMARY KEY (id),
    CONSTRAINT fk_departments_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE job_titles (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    department_id       nvarchar(255),
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_job_titles PRIMARY KEY (id),
    CONSTRAINT fk_job_titles_department FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE employees (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    user_id             nvarchar(255),
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    phone               nvarchar(max),
    email               nvarchar(max),
    role                nvarchar(max)   NOT NULL,
    department_id       nvarchar(255),
    job_title_id        nvarchar(255),
    basic_salary        real            NOT NULL DEFAULT 0,
    hourly_rate         real            DEFAULT 0,
    emergency_contact   nvarchar(max),
    bank_account        nvarchar(max),
    national_id         nvarchar(max),
    employee_code       nvarchar(max),
    attendance_code     nvarchar(max),
    joined_at           datetime2       NOT NULL DEFAULT GETDATE(),
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_employees PRIMARY KEY (id),
    CONSTRAINT fk_employees_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_employees_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_employees_department FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT fk_employees_job_title FOREIGN KEY (job_title_id) REFERENCES job_titles(id)
);

CREATE TABLE employee_documents (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    document_type       nvarchar(max)   NOT NULL,
    title               nvarchar(max)   NOT NULL,
    document_number     nvarchar(max),
    issue_date          datetime2,
    expiry_date         datetime2,
    file_url            nvarchar(max),
    status              nvarchar(50)   NOT NULL DEFAULT 'ACTIVE',
    notes               nvarchar(max),
    metadata            nvarchar(max)   DEFAULT '{}',
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_employee_documents PRIMARY KEY (id),
    CONSTRAINT fk_employee_documents_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_employee_documents_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX idx_employee_documents_employee ON employee_documents (employee_id);
CREATE INDEX idx_employee_documents_branch_expiry ON employee_documents (branch_id, expiry_date, status);

CREATE TABLE employee_compensation_items (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    type                nvarchar(max)   NOT NULL,
    label               nvarchar(max)   NOT NULL,
    label_ar            nvarchar(max),
    amount              real            NOT NULL DEFAULT 0,
    frequency           nvarchar(max)   NOT NULL DEFAULT 'MONTHLY',
    is_active           bit             DEFAULT 1,
    effective_from      date,
    effective_to        date,
    metadata            nvarchar(max)   DEFAULT '{}',
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_employee_compensation_items PRIMARY KEY (id),
    CONSTRAINT fk_employee_compensation_items_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- ============================================================================
-- 27. TIME OFF & LEAVE
-- ============================================================================

CREATE TABLE leave_types (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    default_days        int             DEFAULT 0,
    is_paid             bit             DEFAULT 1,
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_leave_types PRIMARY KEY (id)
);

CREATE TABLE leave_requests (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    leave_type_id       nvarchar(255)   NOT NULL,
    start_date          date            NOT NULL,
    end_date            date            NOT NULL,
    total_days          int             NOT NULL,
    reason              nvarchar(max),
    status              nvarchar(max)   DEFAULT 'PENDING',
    approved_by         nvarchar(255),
    approved_at         datetime2,
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_leave_requests PRIMARY KEY (id),
    CONSTRAINT fk_leave_requests_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_leave_requests_leave_type FOREIGN KEY (leave_type_id) REFERENCES leave_types(id),
    CONSTRAINT fk_leave_requests_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE leave_balances (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    leave_type_id       nvarchar(255)   NOT NULL,
    year                int             NOT NULL,
    total_days          real            NOT NULL DEFAULT 0,
    used_days           real            NOT NULL DEFAULT 0,
    pending_days        real            NOT NULL DEFAULT 0,
    remaining_days      real            NOT NULL DEFAULT 0,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_leave_balances PRIMARY KEY (id),
    CONSTRAINT fk_leave_balances_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_leave_balances_leave_type FOREIGN KEY (leave_type_id) REFERENCES leave_types(id)
);

-- ============================================================================
-- 28. OVERTIME
-- ============================================================================

CREATE TABLE overtime_entries (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    date                date            NOT NULL,
    hours               real            NOT NULL,
    rate_multiplier     real            DEFAULT 1.5,
    amount              real            DEFAULT 0,
    reason              nvarchar(max),
    status              nvarchar(max)   DEFAULT 'PENDING',
    approved_by         nvarchar(255),
    approved_at         datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_overtime_entries PRIMARY KEY (id),
    CONSTRAINT fk_overtime_entries_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- ============================================================================
-- 29. ATTENDANCE
-- ============================================================================

CREATE TABLE attendance_policies (
    id                              nvarchar(255)   NOT NULL,
    branch_id                       nvarchar(255)   NOT NULL,
    name                            nvarchar(max)   NOT NULL,
    code                            nvarchar(max),
    grace_late_minutes              int             NOT NULL DEFAULT 15,
    early_leave_tolerance_minutes   int             NOT NULL DEFAULT 10,
    overtime_threshold_minutes      int             NOT NULL DEFAULT 30,
    min_hours_for_present           real            NOT NULL DEFAULT 4,
    attendance_processing_mode      nvarchar(max)   NOT NULL DEFAULT 'AUTO',
    operational_day_start_hour      int             NOT NULL DEFAULT 8,
    operational_day_end_hour        int             NOT NULL DEFAULT 5,
    max_smart_session_hours         real            NOT NULL DEFAULT 22,
    geofence_strict                 bit             DEFAULT 0,
    face_recognition_required       bit             DEFAULT 0,
    auto_close_open_sessions        bit             DEFAULT 0,
    auto_resolve_missing_out        bit             DEFAULT 0,
    is_default                      bit             DEFAULT 0,
    is_active                       bit             DEFAULT 1,
    created_at                      datetime2       DEFAULT GETDATE(),
    updated_at                      datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_attendance_policies PRIMARY KEY (id),
    CONSTRAINT fk_attendance_policies_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX idx_attendance_policies_branch_default ON attendance_policies (branch_id, is_default, is_active);

CREATE TABLE attendance_devices (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    code                nvarchar(max),
    vendor              nvarchar(max)   NOT NULL DEFAULT 'ZKTeco',
    model               nvarchar(max),
    source_type         nvarchar(50)   NOT NULL DEFAULT 'BIOMETRIC_ZK',
    ip_address          nvarchar(max),
    port                int,
    serial_number       nvarchar(max),
    communication_mode  nvarchar(max)   DEFAULT 'LAN',
    branch_gateway_id   nvarchar(max),
    is_active           bit             DEFAULT 1,
    last_seen_at        datetime2,
    last_sync_at        datetime2,
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_attendance_devices PRIMARY KEY (id),
    CONSTRAINT fk_attendance_devices_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX idx_attendance_devices_branch_source ON attendance_devices (branch_id, source_type);

CREATE TABLE attendance_device_mappings (
    id                  int             IDENTITY(1,1) NOT NULL,
    device_id           nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    device_user_id      nvarchar(255)   NOT NULL,
    employee_code_snapshot nvarchar(max),
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_attendance_device_mappings PRIMARY KEY (id),
    CONSTRAINT fk_attendance_device_mappings_device FOREIGN KEY (device_id) REFERENCES attendance_devices(id),
    CONSTRAINT fk_attendance_device_mappings_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE UNIQUE INDEX idx_attendance_device_mappings_device_user ON attendance_device_mappings (device_id, device_user_id) WHERE is_active = 1;
CREATE INDEX idx_attendance_device_mappings_employee ON attendance_device_mappings (employee_id);

CREATE TABLE attendance_sync_runs (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255),
    device_id           nvarchar(255),
    source_type         nvarchar(max)   NOT NULL,
    status              nvarchar(max)   DEFAULT 'IN_PROGRESS',
    logs_received       int             DEFAULT 0,
    logs_accepted       int             DEFAULT 0,
    logs_rejected       int             DEFAULT 0,
    error_message       nvarchar(max),
    metadata            nvarchar(max)   DEFAULT '{}',
    started_at          datetime2       DEFAULT GETDATE(),
    completed_at        datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_attendance_sync_runs PRIMARY KEY (id),
    CONSTRAINT fk_attendance_sync_runs_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_attendance_sync_runs_device FOREIGN KEY (device_id) REFERENCES attendance_devices(id)
);

CREATE TABLE attendance_raw_logs (
    id                  nvarchar(255)   NOT NULL,
    sync_run_id         nvarchar(255),
    device_id           nvarchar(255),
    employee_id         nvarchar(255),
    branch_id           nvarchar(255)   NOT NULL,
    source_type         nvarchar(max)   NOT NULL DEFAULT 'BIOMETRIC_ZK',
    event_type          nvarchar(max)   NOT NULL DEFAULT 'UNKNOWN',
    employee_identifier nvarchar(max),
    device_user_id      nvarchar(max),
    occurred_at         datetime2       NOT NULL,
    device_occurred_at  datetime2,
    geo_lat             decimal(18,6),
    geo_lng             decimal(18,6),
    geo_accuracy_meters decimal(18,6),
    confidence_score    decimal(18,6),
    image_url           nvarchar(max),
    dedupe_hash         nvarchar(255),
    processing_status   nvarchar(max)   DEFAULT 'PENDING',
    processing_notes    nvarchar(max),
    raw_payload         nvarchar(max)   DEFAULT '{}',
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_attendance_raw_logs PRIMARY KEY (id),
    CONSTRAINT fk_attendance_raw_logs_sync_run FOREIGN KEY (sync_run_id) REFERENCES attendance_sync_runs(id),
    CONSTRAINT fk_attendance_raw_logs_device FOREIGN KEY (device_id) REFERENCES attendance_devices(id),
    CONSTRAINT fk_attendance_raw_logs_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_attendance_raw_logs_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT uq_attendance_raw_logs_dedupe UNIQUE (dedupe_hash)
);

CREATE INDEX idx_attendance_raw_logs_branch_occurred ON attendance_raw_logs (branch_id, occurred_at);
CREATE INDEX idx_attendance_raw_logs_employee_occurred ON attendance_raw_logs (employee_id, occurred_at);
CREATE UNIQUE INDEX idx_attendance_raw_logs_dedupe ON attendance_raw_logs (dedupe_hash);

CREATE TABLE attendance_geofences (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    latitude            real            NOT NULL,
    longitude           real            NOT NULL,
    radius_meters       real            NOT NULL DEFAULT 150,
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_attendance_geofences PRIMARY KEY (id),
    CONSTRAINT fk_attendance_geofences_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX idx_attendance_geofences_branch ON attendance_geofences (branch_id, is_active);

CREATE TABLE attendance_sessions (
    id                      nvarchar(255)   NOT NULL,
    employee_id             nvarchar(255)   NOT NULL,
    branch_id               nvarchar(255)   NOT NULL,
    source_type             nvarchar(max)   NOT NULL,
    status                  nvarchar(50)    NOT NULL DEFAULT 'OPEN',
    check_in_raw_log_id     nvarchar(255),
    check_out_raw_log_id    nvarchar(255),
    clock_in_at             datetime2       NOT NULL,
    clock_out_at            datetime2,
    total_hours             real            NOT NULL DEFAULT 0,
    late_minutes            int             NOT NULL DEFAULT 0,
    early_leave_minutes     int             NOT NULL DEFAULT 0,
    overtime_minutes        int             NOT NULL DEFAULT 0,
    risk_flags              nvarchar(max)   DEFAULT '[]',
    notes                   nvarchar(max),
    created_at              datetime2       DEFAULT GETDATE(),
    updated_at              datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_attendance_sessions PRIMARY KEY (id),
    CONSTRAINT fk_attendance_sessions_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_attendance_sessions_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_attendance_sessions_check_in FOREIGN KEY (check_in_raw_log_id) REFERENCES attendance_raw_logs(id),
    CONSTRAINT fk_attendance_sessions_check_out FOREIGN KEY (check_out_raw_log_id) REFERENCES attendance_raw_logs(id)
);

CREATE INDEX idx_attendance_sessions_branch_status ON attendance_sessions (branch_id, status);
CREATE INDEX idx_attendance_sessions_employee_clock_in ON attendance_sessions (employee_id, clock_in_at);

CREATE TABLE attendance_corrections (
    id                      nvarchar(255)   NOT NULL,
    session_id              nvarchar(255)   NOT NULL,
    employee_id             nvarchar(255)   NOT NULL,
    requested_by            nvarchar(255)   NOT NULL,
    approved_by             nvarchar(255),
    status                  nvarchar(max)   NOT NULL DEFAULT 'PENDING',
    requested_clock_in_at   datetime2,
    requested_clock_out_at  datetime2,
    reason                  nvarchar(max)   NOT NULL,
    approver_notes          nvarchar(max),
    created_at              datetime2       DEFAULT GETDATE(),
    updated_at              datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_attendance_corrections PRIMARY KEY (id),
    CONSTRAINT fk_attendance_corrections_session FOREIGN KEY (session_id) REFERENCES attendance_sessions(id),
    CONSTRAINT fk_attendance_corrections_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_attendance_corrections_requested_by FOREIGN KEY (requested_by) REFERENCES users(id),
    CONSTRAINT fk_attendance_corrections_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE attendance_exceptions (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255),
    branch_id           nvarchar(255)   NOT NULL,
    raw_log_id          nvarchar(255),
    session_id          nvarchar(255),
    type                nvarchar(max)   NOT NULL,
    severity            nvarchar(50)    NOT NULL DEFAULT 'MEDIUM',
    status              nvarchar(50)    NOT NULL DEFAULT 'OPEN',
    title               nvarchar(max)   NOT NULL,
    details             nvarchar(max),
    metadata            nvarchar(max)   DEFAULT '{}',
    assigned_to         nvarchar(255),
    sla_due_at          datetime2,
    escalation_level    int             NOT NULL DEFAULT 0,
    last_escalated_at   datetime2,
    resolved_by         nvarchar(255),
    resolved_at         datetime2,
    resolution_notes    nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_attendance_exceptions PRIMARY KEY (id),
    CONSTRAINT fk_attendance_exceptions_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_attendance_exceptions_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_attendance_exceptions_raw_log FOREIGN KEY (raw_log_id) REFERENCES attendance_raw_logs(id),
    CONSTRAINT fk_attendance_exceptions_session FOREIGN KEY (session_id) REFERENCES attendance_sessions(id),
    CONSTRAINT fk_attendance_exceptions_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id),
    CONSTRAINT fk_attendance_exceptions_resolved_by FOREIGN KEY (resolved_by) REFERENCES users(id)
);

CREATE INDEX idx_attendance_exceptions_branch_status ON attendance_exceptions (branch_id, status, severity);
CREATE INDEX idx_attendance_exceptions_employee ON attendance_exceptions (employee_id);
CREATE INDEX idx_attendance_exceptions_assigned ON attendance_exceptions (assigned_to);
CREATE INDEX idx_attendance_exceptions_sla ON attendance_exceptions (sla_due_at);

-- ============================================================================
-- 30. SHIFT TEMPLATES & PLANS
-- ============================================================================

CREATE TABLE shift_templates (
    id                              nvarchar(255)   NOT NULL,
    branch_id                       nvarchar(255)   NOT NULL,
    name                            nvarchar(max)   NOT NULL,
    code                            nvarchar(max),
    attendance_policy_id            nvarchar(255),
    start_time                      nvarchar(max)   NOT NULL,
    end_time                        nvarchar(max)   NOT NULL,
    break_minutes                   int             NOT NULL DEFAULT 0,
    grace_late_minutes              int,
    early_leave_tolerance_minutes   int,
    overtime_threshold_minutes      int,
    work_days                       nvarchar(max)   DEFAULT '["sun","mon","tue","wed","thu"]',
    is_overnight                    bit             DEFAULT 0,
    is_active                       bit             DEFAULT 1,
    created_at                      datetime2       DEFAULT GETDATE(),
    updated_at                      datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_shift_templates PRIMARY KEY (id),
    CONSTRAINT fk_shift_templates_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_shift_templates_policy FOREIGN KEY (attendance_policy_id) REFERENCES attendance_policies(id)
);

CREATE INDEX idx_shift_templates_branch_active ON shift_templates (branch_id, is_active);

CREATE TABLE employee_shift_assignments (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    shift_template_id   nvarchar(255)   NOT NULL,
    effective_from      date            NOT NULL,
    effective_to        date,
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_employee_shift_assignments PRIMARY KEY (id),
    CONSTRAINT fk_employee_shift_assignments_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_employee_shift_assignments_template FOREIGN KEY (shift_template_id) REFERENCES shift_templates(id)
);

CREATE TABLE shift_plans (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    plan_date           date            NOT NULL,
    status              nvarchar(max)   DEFAULT 'DRAFT',
    notes               nvarchar(max),
    created_by          nvarchar(255),
    approved_by         nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_shift_plans PRIMARY KEY (id),
    CONSTRAINT fk_shift_plans_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE shift_plan_entries (
    id                  nvarchar(255)   NOT NULL,
    shift_plan_id       nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    shift_template_id   nvarchar(255),
    start_time          datetime2,
    end_time            datetime2,
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_shift_plan_entries PRIMARY KEY (id),
    CONSTRAINT fk_shift_plan_entries_plan FOREIGN KEY (shift_plan_id) REFERENCES shift_plans(id),
    CONSTRAINT fk_shift_plan_entries_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE shift_tasks (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    description         nvarchar(max),
    frequency           nvarchar(max)   DEFAULT 'DAILY',
    assigned_role       nvarchar(max),
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_shift_tasks PRIMARY KEY (id),
    CONSTRAINT fk_shift_tasks_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE shift_task_runs (
    id                  nvarchar(255)   NOT NULL,
    task_id             nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    assigned_to         nvarchar(255),
    status              nvarchar(max)   DEFAULT 'PENDING',
    completed_at        datetime2,
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_shift_task_runs PRIMARY KEY (id),
    CONSTRAINT fk_shift_task_runs_task FOREIGN KEY (task_id) REFERENCES shift_tasks(id),
    CONSTRAINT fk_shift_task_runs_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================================================
-- 31. PAYROLL
-- ============================================================================

CREATE TABLE payroll_profiles (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    branch_id           nvarchar(255),
    description         nvarchar(max),
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_payroll_profiles PRIMARY KEY (id),
    CONSTRAINT fk_payroll_profiles_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE payroll_components (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    type                nvarchar(max)   NOT NULL,
    calculation_method  nvarchar(max)   NOT NULL,
    amount              real            DEFAULT 0,
    rate                real            DEFAULT 0,
    is_taxable          bit             DEFAULT 0,
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_payroll_components PRIMARY KEY (id)
);

CREATE TABLE payroll_rules (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    type                nvarchar(max)   NOT NULL,
    conditions          nvarchar(max)   DEFAULT '{}',
    action              nvarchar(max)   NOT NULL,
    value               nvarchar(max),
    priority            int             DEFAULT 0,
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_payroll_rules PRIMARY KEY (id)
);

CREATE TABLE employee_payroll_assignments (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    profile_id          nvarchar(255),
    basic_salary        real            DEFAULT 0,
    hourly_rate         real            DEFAULT 0,
    effective_from      date            NOT NULL,
    effective_to        date,
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_employee_payroll_assignments PRIMARY KEY (id),
    CONSTRAINT fk_employee_payroll_assignments_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_employee_payroll_assignments_profile FOREIGN KEY (profile_id) REFERENCES payroll_profiles(id)
);

CREATE TABLE payroll_cycles (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    period_start        datetime2       NOT NULL,
    period_end          datetime2       NOT NULL,
    status              nvarchar(max)   NOT NULL DEFAULT 'DRAFT',
    total_amount        real            DEFAULT 0,
    executed_by         nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_payroll_cycles PRIMARY KEY (id),
    CONSTRAINT fk_payroll_cycles_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_payroll_cycles_executed_by FOREIGN KEY (executed_by) REFERENCES users(id)
);

CREATE TABLE payroll_runs (
    id                  nvarchar(255)   NOT NULL,
    cycle_id            nvarchar(255)   NOT NULL,
    status              nvarchar(max)   DEFAULT 'DRAFT',
    total_gross         real            DEFAULT 0,
    total_deductions    real            DEFAULT 0,
    total_net           real            DEFAULT 0,
    notes               nvarchar(max),
    processed_by        nvarchar(255),
    processed_at        datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_payroll_runs PRIMARY KEY (id),
    CONSTRAINT fk_payroll_runs_cycle FOREIGN KEY (cycle_id) REFERENCES payroll_cycles(id)
);

CREATE TABLE payroll_run_lines (
    id                  nvarchar(255)   NOT NULL,
    run_id              nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    basic_salary        real            DEFAULT 0,
    total_earnings      real            DEFAULT 0,
    total_deductions    real            DEFAULT 0,
    net_pay             real            DEFAULT 0,
    overtime_amount     real            DEFAULT 0,
    bonus_amount        real            DEFAULT 0,
    loan_deduction      real            DEFAULT 0,
    tax_amount          real            DEFAULT 0,
    breakdown           nvarchar(max)   DEFAULT '{}',
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_payroll_run_lines PRIMARY KEY (id),
    CONSTRAINT fk_payroll_run_lines_run FOREIGN KEY (run_id) REFERENCES payroll_runs(id),
    CONSTRAINT fk_payroll_run_lines_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE payroll_locks (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    period_start        date            NOT NULL,
    period_end          date            NOT NULL,
    locked_by           nvarchar(255)   NOT NULL,
    locked_at           datetime2       DEFAULT GETDATE(),
    reason              nvarchar(max),
    CONSTRAINT pk_payroll_locks PRIMARY KEY (id),
    CONSTRAINT fk_payroll_locks_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_payroll_locks_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE payslips (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    run_id              nvarchar(255),
    period_start        date            NOT NULL,
    period_end          date            NOT NULL,
    gross_pay           real            DEFAULT 0,
    total_deductions    real            DEFAULT 0,
    net_pay             real            DEFAULT 0,
    breakdown           nvarchar(max)   DEFAULT '{}',
    status              nvarchar(max)   DEFAULT 'DRAFT',
    issued_at           datetime2,
    paid_at             datetime2,
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_payslips PRIMARY KEY (id),
    CONSTRAINT fk_payslips_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_payslips_run FOREIGN KEY (run_id) REFERENCES payroll_runs(id)
);

CREATE TABLE bonus_penalty_records (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    type                nvarchar(max)   NOT NULL,
    amount              real            NOT NULL,
    reason              nvarchar(max)   NOT NULL,
    date                date            NOT NULL,
    status              nvarchar(max)   DEFAULT 'PENDING',
    approved_by         nvarchar(255),
    approved_at         datetime2,
    created_by          nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_bonus_penalty_records PRIMARY KEY (id),
    CONSTRAINT fk_bonus_penalty_records_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_bonus_penalty_records_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_bonus_penalty_records_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE employee_loans (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    amount              real            NOT NULL,
    total_installments  int             NOT NULL,
    remaining_amount    real            NOT NULL,
    reason              nvarchar(max),
    status              nvarchar(max)   DEFAULT 'ACTIVE',
    approved_by         nvarchar(255),
    approved_at         datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_employee_loans PRIMARY KEY (id),
    CONSTRAINT fk_employee_loans_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_employee_loans_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_employee_loans_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE loan_installments (
    id                  nvarchar(255)   NOT NULL,
    loan_id             nvarchar(255)   NOT NULL,
    installment_number  int             NOT NULL,
    amount              real            NOT NULL,
    due_date            date            NOT NULL,
    paid_date           date,
    status              nvarchar(max)   DEFAULT 'PENDING',
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_loan_installments PRIMARY KEY (id),
    CONSTRAINT fk_loan_installments_loan FOREIGN KEY (loan_id) REFERENCES employee_loans(id)
);

CREATE TABLE payroll_payouts (
    id                  nvarchar(255)   NOT NULL,
    run_id              nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    amount              real            NOT NULL,
    payment_method      nvarchar(max),
    reference           nvarchar(max),
    status              nvarchar(max)   DEFAULT 'PENDING',
    paid_at             datetime2,
    processed_by        nvarchar(255),
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_payroll_payouts PRIMARY KEY (id),
    CONSTRAINT fk_payroll_payouts_run FOREIGN KEY (run_id) REFERENCES payroll_runs(id),
    CONSTRAINT fk_payroll_payouts_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- ============================================================================
-- 32. CRM & LOYALTY
-- ============================================================================

CREATE TABLE customer_rfm_metrics (
    id                  nvarchar(255)   NOT NULL,
    customer_id         nvarchar(255)   NOT NULL,
    recency_days        int,
    frequency           int,
    monetary_value      real,
    rfm_score           nvarchar(max),
    segment             nvarchar(max),
    calculated_at       datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_customer_rfm_metrics PRIMARY KEY (id),
    CONSTRAINT fk_customer_rfm_metrics_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE customer_wallets (
    id                  nvarchar(255)   NOT NULL,
    customer_id         nvarchar(255)   NOT NULL,
    balance             real            DEFAULT 0,
    currency            nvarchar(max)   DEFAULT 'EGP',
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_customer_wallets PRIMARY KEY (id),
    CONSTRAINT fk_customer_wallets_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE wallet_transactions (
    id                  nvarchar(255)   NOT NULL,
    wallet_id           nvarchar(255)   NOT NULL,
    amount              real            NOT NULL,
    type                nvarchar(max)   NOT NULL,
    reference           nvarchar(max),
    description         nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_wallet_transactions PRIMARY KEY (id),
    CONSTRAINT fk_wallet_transactions_wallet FOREIGN KEY (wallet_id) REFERENCES customer_wallets(id)
);

CREATE TABLE loyalty_rewards (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    name_ar             nvarchar(max),
    points_required     int             NOT NULL,
    reward_type         nvarchar(max)   NOT NULL,
    value               real            NOT NULL,
    description         nvarchar(max),
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_loyalty_rewards PRIMARY KEY (id)
);

CREATE TABLE loyalty_ledger (
    id                  nvarchar(255)   NOT NULL,
    customer_id         nvarchar(255)   NOT NULL,
    points              int             NOT NULL,
    type                nvarchar(max)   NOT NULL,
    reference           nvarchar(max),
    description         nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_loyalty_ledger PRIMARY KEY (id),
    CONSTRAINT fk_loyalty_ledger_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE coupons (
    id                  nvarchar(255)   NOT NULL,
    code                nvarchar(max)   NOT NULL,
    type                nvarchar(max)   NOT NULL,
    value               real            NOT NULL,
    min_order           real            DEFAULT 0,
    max_uses            int             DEFAULT 0,
    current_uses        int             DEFAULT 0,
    valid_from          datetime2,
    valid_to            datetime2,
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_coupons PRIMARY KEY (id)
);

CREATE TABLE customer_complaints (
    id                  nvarchar(255)   NOT NULL,
    customer_id         nvarchar(255),
    order_id            nvarchar(255),
    branch_id           nvarchar(255),
    type                nvarchar(max)   NOT NULL,
    subject             nvarchar(max)   NOT NULL,
    description         nvarchar(max)   NOT NULL,
    status              nvarchar(max)   DEFAULT 'OPEN',
    priority            nvarchar(max)   DEFAULT 'MEDIUM',
    assigned_to         nvarchar(255),
    resolved_at         datetime2,
    resolution          nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_customer_complaints PRIMARY KEY (id),
    CONSTRAINT fk_customer_complaints_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_customer_complaints_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_customer_complaints_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================================================
-- 33. MARKETING
-- ============================================================================

CREATE TABLE campaigns (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    type                nvarchar(max)   NOT NULL,
    branch_id           nvarchar(255),
    start_date          datetime2,
    end_date            datetime2,
    budget              real            DEFAULT 0,
    status              nvarchar(max)   DEFAULT 'DRAFT',
    target_audience     nvarchar(max)   DEFAULT '{}',
    channels            nvarchar(max)   DEFAULT '[]',
    metrics             nvarchar(max)   DEFAULT '{}',
    created_by          nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_campaigns PRIMARY KEY (id)
);

CREATE TABLE campaign_logs (
    id                  int             IDENTITY(1,1) NOT NULL,
    campaign_id         nvarchar(255)   NOT NULL,
    event               nvarchar(max)   NOT NULL,
    payload             nvarchar(max)   DEFAULT '{}',
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_campaign_logs PRIMARY KEY (id),
    CONSTRAINT fk_campaign_logs_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- ============================================================================
-- 34. COMMUNICATIONS
-- ============================================================================

CREATE TABLE whatsapp_messages (
    id                  nvarchar(255)   NOT NULL,
    customer_id         nvarchar(255),
    order_id            nvarchar(255),
    direction           nvarchar(max)   NOT NULL,
    message_type        nvarchar(max)   NOT NULL,
    content             nvarchar(max),
    media_url           nvarchar(max),
    status              nvarchar(max)   DEFAULT 'PENDING',
    provider_message_id nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_whatsapp_messages PRIMARY KEY (id)
);

CREATE TABLE notifications (
    id                  nvarchar(255)   NOT NULL,
    user_id             nvarchar(255),
    type                nvarchar(max)   NOT NULL,
    title               nvarchar(max)   NOT NULL,
    body                nvarchar(max),
    data                nvarchar(max)   DEFAULT '{}',
    is_read             bit             DEFAULT 0,
    read_at             datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_notifications PRIMARY KEY (id),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE internal_messages (
    id                  nvarchar(255)   NOT NULL,
    sender_id           nvarchar(255)   NOT NULL,
    recipient_id         nvarchar(255)  NOT NULL,
    subject             nvarchar(max),
    body                nvarchar(max)   NOT NULL,
    is_read             bit             DEFAULT 0,
    read_at             datetime2,
    parent_id           nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_internal_messages PRIMARY KEY (id),
    CONSTRAINT fk_internal_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id),
    CONSTRAINT fk_internal_messages_recipient FOREIGN KEY (recipient_id) REFERENCES users(id)
);

-- ============================================================================
-- 35. RESERVATIONS
-- ============================================================================

CREATE TABLE reservations (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    customer_id         nvarchar(255),
    customer_name       nvarchar(max)   NOT NULL,
    customer_phone      nvarchar(max)   NOT NULL,
    table_id            nvarchar(255),
    guests              int             NOT NULL,
    reservation_time    datetime2       NOT NULL,
    status              nvarchar(max)   DEFAULT 'PENDING',
    notes               nvarchar(max),
    created_by          nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_reservations PRIMARY KEY (id),
    CONSTRAINT fk_reservations_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_reservations_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_reservations_table FOREIGN KEY (table_id) REFERENCES tables(id)
);

-- ============================================================================
-- 36. WAITLIST
-- ============================================================================

CREATE TABLE waitlists (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    customer_id         nvarchar(255),
    customer_name       nvarchar(max)   NOT NULL,
    customer_phone      nvarchar(max)   NOT NULL,
    guests              int             NOT NULL,
    status              nvarchar(max)   DEFAULT 'WAITING',
    position            int,
    estimated_wait_minutes int,
    table_id            nvarchar(255),
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_waitlists PRIMARY KEY (id),
    CONSTRAINT fk_waitlists_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================================================
-- 37. KDS (Kitchen Display System)
-- ============================================================================

CREATE TABLE kds_tickets (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    order_id            nvarchar(255)   NOT NULL,
    routing_station     nvarchar(255)   NOT NULL,
    target_time         datetime2,
    status              nvarchar(255)   DEFAULT 'PENDING',
    priority            nvarchar(255)   DEFAULT 'NORMAL',
    printed_at          datetime2,
    bumped_at           datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_kds_tickets PRIMARY KEY (id),
    CONSTRAINT fk_kds_tickets_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_kds_tickets_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE kds_ticket_items (
    id                  int             IDENTITY(1,1) NOT NULL,
    kds_ticket_id       nvarchar(255)   NOT NULL,
    order_item_id       int,
    menu_item_id        nvarchar(255)   NOT NULL,
    item_name           nvarchar(max)   NOT NULL,
    quantity            int             NOT NULL,
    modifiers_text      nvarchar(max),
    is_bumped           bit             DEFAULT 0,
    CONSTRAINT pk_kds_ticket_items PRIMARY KEY (id),
    CONSTRAINT fk_kds_ticket_items_ticket FOREIGN KEY (kds_ticket_id) REFERENCES kds_tickets(id) ON DELETE CASCADE
);

-- ============================================================================
-- 38. USER DAILY PERFORMANCE
-- ============================================================================

CREATE TABLE user_daily_performance (
    id                  nvarchar(255)   NOT NULL,
    user_id             nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255),
    business_date       date            NOT NULL,
    orders_processed    int             DEFAULT 0,
    total_sales         real            DEFAULT 0,
    avg_order_time      real            DEFAULT 0,
    void_count          int             DEFAULT 0,
    refund_count        int             DEFAULT 0,
    metrics             nvarchar(max)   DEFAULT '{}',
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_user_daily_performance PRIMARY KEY (id),
    CONSTRAINT fk_user_daily_performance_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_user_daily_performance_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================================================
-- 39. REFUNDS
-- ============================================================================

CREATE TABLE refund_records (
    id                  nvarchar(255)   NOT NULL,
    order_id            nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    amount              real            NOT NULL,
    reason              nvarchar(max)   NOT NULL,
    method              nvarchar(max),
    status              nvarchar(max)   DEFAULT 'PENDING',
    processed_by        nvarchar(255),
    approved_by         nvarchar(255),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_refund_records PRIMARY KEY (id),
    CONSTRAINT fk_refund_records_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_refund_records_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================================================
-- 40. DOMAIN EVENTS (Outbox Pattern)
-- ============================================================================

CREATE TABLE domain_events (
    id                  nvarchar(255)   NOT NULL,
    type                nvarchar(max)   NOT NULL,
    aggregate_type      nvarchar(max)   NOT NULL,
    aggregate_id        nvarchar(max)   NOT NULL,
    payload             nvarchar(max)   NOT NULL,
    status              nvarchar(max)   DEFAULT 'PENDING',
    published_at        datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_domain_events PRIMARY KEY (id)
);

-- ============================================================================
-- 41. OLD ATTENDANCE TABLE (Legacy)
-- ============================================================================

CREATE TABLE attendance (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    date                date            NOT NULL,
    clock_in            datetime2,
    clock_out           datetime2,
    status              nvarchar(max)   DEFAULT 'PRESENT',
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_attendance PRIMARY KEY (id),
    CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_attendance_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE onboarding_records (
    id                  nvarchar(255)   NOT NULL,
    employee_id         nvarchar(255)   NOT NULL,
    step                nvarchar(max)   NOT NULL,
    status              nvarchar(max)   DEFAULT 'PENDING',
    completed_by        nvarchar(255),
    completed_at        datetime2,
    notes               nvarchar(max),
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_onboarding_records PRIMARY KEY (id),
    CONSTRAINT fk_onboarding_records_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- ============================================================================
-- 42. SUBSCRIPTIONS
-- ============================================================================

CREATE TABLE subscription_plans (
    id                  nvarchar(255)   NOT NULL,
    name                nvarchar(max)   NOT NULL,
    code                nvarchar(max)   NOT NULL,
    description         nvarchar(max),
    price_monthly       real            DEFAULT 0,
    price_yearly        real            DEFAULT 0,
    max_branches        int             DEFAULT 1,
    max_users           int             DEFAULT 5,
    features            nvarchar(max)   DEFAULT '[]',
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_subscription_plans PRIMARY KEY (id)
);

CREATE TABLE subscriptions (
    id                  nvarchar(255)   NOT NULL,
    tenant_id           nvarchar(max)   NOT NULL,
    plan_id             nvarchar(255)   NOT NULL,
    status              nvarchar(max)   DEFAULT 'ACTIVE',
    billing_cycle       nvarchar(max)   DEFAULT 'MONTHLY',
    current_period_start datetime2,
    current_period_end  datetime2,
    cancelled_at        datetime2,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_subscriptions PRIMARY KEY (id),
    CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

-- ============================================================================
-- 43. FRANCHISE
-- ============================================================================

CREATE TABLE franchise_configurations (
    id                  nvarchar(255)   NOT NULL,
    branch_id           nvarchar(255)   NOT NULL,
    franchise_fee_percent real          DEFAULT 0,
    royalty_fee_percent real            DEFAULT 0,
    marketing_fee_percent real          DEFAULT 0,
    contract_start      date,
    contract_end        date,
    is_active           bit             DEFAULT 1,
    created_at          datetime2       DEFAULT GETDATE(),
    updated_at          datetime2       DEFAULT GETDATE(),
    CONSTRAINT pk_franchise_configurations PRIMARY KEY (id),
    CONSTRAINT fk_franchise_configurations_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);
GO

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- ============================================================================
-- 1. SYSTEM ROLES
-- ============================================================================
INSERT INTO roles (id, name, name_ar, description, permissions, is_system, is_active, priority, color, icon)
VALUES
('role-super-admin', N'SUPER_ADMIN', N'مشرف عام', N'Full system access', '["*"]', 1, 1, 100, N'#ef4444', N'shield'),
('role-owner', N'OWNER', N'مالك', N'Owner level access', '["*"]', 1, 1, 90, N'#f59e0b', N'crown'),
('role-manager', N'MANAGER', N'مدير', N'Branch management access', N'["orders.*","menu.*","inventory.*","reports.*","customers.*"]', 1, 1, 70, N'#3b82f6', N'user-tie'),
('role-accountant', N'ACCOUNTANT', N'محاسب', N'Financial reports and journal access', N'["reports.*","finance.*","audit.read"]', 1, 1, 60, N'#10b981', N'calculator'),
('role-cashier', N'CASHIER', N'كاشير', N'POS and order management', N'["orders.create","orders.read","payments.*","customers.read","shifts.*"]', 1, 1, 40, N'#8b5cf6', N'cash-register'),
('role-waiter', N'WAITER', N'ويتر', N'Order taking and table management', N'["orders.create","orders.read","tables.*"]', 1, 1, 30, N'#ec4899', N'concierge-bell'),
('role-call-center', N'CALL_CENTER_AGENT', N'موزع', N'Call center order management', N'["orders.create","orders.read","customers.*","delivery.*"]', 1, 1, 35, N'#14b8a6', N'headset'),
('role-kitchen', N'KITCHEN', N'مطبخ', N'Kitchen display system access', N'["orders.read","kds.*"]', 1, 1, 20, N'#f97316', N'utensils'),
('role-driver', N'DRIVER', N'سائق', N'Delivery driver mobile access', N'["delivery.read","delivery.update"]', 1, 1, 15, N'#6366f1', N'truck'),
('role-it', N'IT', N'تقنية', N'System administration and settings', N'["settings.*","users.*","audit.*","system.*"]', 1, 1, 85, N'#1e293b', N'terminal');
GO

-- ============================================================================
-- 2. PERMISSION DEFINITIONS (category-based)
-- ============================================================================
INSERT INTO permission_definitions (id, [key], name, name_ar, category, category_ar, sort_order, is_active)
VALUES
-- Orders
('perm-orders-create', 'orders.create', N'Create Orders', N'إنشاء طلبات', 'orders', N'الطلبات', 1, 1),
('perm-orders-read', 'orders.read', N'View Orders', N'عرض الطلبات', 'orders', N'الطلبات', 2, 1),
('perm-orders-update', 'orders.update', N'Update Orders', N'تعديل الطلبات', 'orders', N'الطلبات', 3, 1),
('perm-orders-delete', 'orders.delete', N'Delete Orders', N'حذف الطلبات', 'orders', N'الطلبات', 4, 1),
('perm-orders-void', 'orders.void', N'Void Orders', N'إلغاء الطلبات', 'orders', N'الطلبات', 5, 1),
('perm-orders-discount', 'orders.discount', N'Apply Discounts', N'خصم على الطلبات', 'orders', N'الطلبات', 6, 1),
-- Menu
('perm-menu-create', 'menu.create', N'Create Menu Items', N'إضافة أصناف', 'menu', N'القائمة', 1, 1),
('perm-menu-read', 'menu.read', N'View Menu', N'عرض القائمة', 'menu', N'القائمة', 2, 1),
('perm-menu-edit', 'menu.edit', N'Edit Menu', N'تعديل القائمة', 'menu', N'القائمة', 3, 1),
('perm-menu-delete', 'menu.delete', N'Delete Menu Items', N'حذف أصناف', 'menu', N'القائمة', 4, 1),
('perm-menu-price', 'menu.price', N'Change Prices', N'تغيير الأسعار', 'menu', N'القائمة', 5, 1),
-- Inventory
('perm-inventory-create', 'inventory.create', N'Create Items', N'إضافة خامات', 'inventory', N'المخزون', 1, 1),
('perm-inventory-read', 'inventory.read', N'View Inventory', N'عرض المخزون', 'inventory', N'المخزون', 2, 1),
('perm-inventory-update', 'inventory.update', N'Update Inventory', N'تعديل المخزون', 'inventory', N'المخزون', 3, 1),
('perm-inventory-adjust', 'inventory.adjust', N'Adjust Stock', N'تسوية المخزون', 'inventory', N'المخزون', 4, 1),
('perm-inventory-transfer', 'inventory.transfer', N'Transfer Stock', N'تحويل مخزون', 'inventory', N'المخزون', 5, 1),
-- Customers
('perm-customers-create', 'customers.create', N'Add Customers', N'إضافة عملاء', 'customers', N'العملاء', 1, 1),
('perm-customers-read', 'customers.read', N'View Customers', N'عرض العملاء', 'customers', N'العملاء', 2, 1),
('perm-customers-update', 'customers.update', N'Update Customers', N'تعديل العملاء', 'customers', N'العملاء', 3, 1),
('perm-customers-delete', 'customers.delete', N'Delete Customers', N'حذف العملاء', 'customers', N'العملاء', 4, 1),
-- Payments
('perm-payments-create', 'payments.create', N'Process Payments', N'معالجة المدفوعات', 'payments', N'المدفوعات', 1, 1),
('perm-payments-read', 'payments.read', N'View Payments', N'عرض المدفوعات', 'payments', N'المدفوعات', 2, 1),
('perm-payments-refund', 'payments.refund', N'Process Refunds', N'معالجة المرتجعات', 'payments', N'المدفوعات', 3, 1),
-- Reports
('perm-reports-view', 'reports.view', N'View Reports', N'عرض التقارير', 'reports', N'التقارير', 1, 1),
('perm-reports-export', 'reports.export', N'Export Reports', N'تصدير التقارير', 'reports', N'التقارير', 2, 1),
('perm-reports-finance', 'reports.finance', N'Financial Reports', N'التقارير المالية', 'reports', N'التقارير', 3, 1),
-- Finance
('perm-finance-read', 'finance.read', N'View Finance', N'عرض المالية', 'finance', N'المالية', 1, 1),
('perm-finance-create', 'finance.create', N'Create Journal Entries', N'إنشاء قيود يومية', 'finance', N'المالية', 2, 1),
('perm-finance-approve', 'finance.approve', N'Approve Transactions', N'اعتماد المعاملات', 'finance', N'المالية', 3, 1),
-- Users
('perm-users-create', 'users.create', N'Create Users', N'إضافة مستخدمين', 'users', N'المستخدمين', 1, 1),
('perm-users-read', 'users.read', N'View Users', N'عرض المستخدمين', 'users', N'المستخدمين', 2, 1),
('perm-users-update', 'users.update', N'Update Users', N'تعديل المستخدمين', 'users', N'المستخدمين', 3, 1),
('perm-users-delete', 'users.delete', N'Delete Users', N'حذف المستخدمين', 'users', N'المستخدمين', 4, 1),
-- Settings
('perm-settings-read', 'settings.read', N'View Settings', N'عرض الإعدادات', 'settings', N'الإعدادات', 1, 1),
('perm-settings-update', 'settings.update', N'Update Settings', N'تعديل الإعدادات', 'settings', N'الإعدادات', 2, 1),
-- Audit
('perm-audit-read', 'audit.read', N'View Audit Logs', N'عرض سجل التدقيق', 'audit', N'التدقيق', 1, 1),
('perm-audit-export', 'audit.export', N'Export Audit Logs', N'تصدير سجل التدقيق', 'audit', N'التدقيق', 2, 1),
-- Delivery
('perm-delivery-read', 'delivery.read', N'View Deliveries', N'عرض التوصيل', 'delivery', N'التوصيل', 1, 1),
('perm-delivery-assign', 'delivery.assign', N'Assign Drivers', N'تعيين سائقين', 'delivery', N'التوصيل', 2, 1),
('perm-delivery-update', 'delivery.update', N'Update Delivery Status', N'تحديث حالة التوصيل', 'delivery', N'التوصيل', 3, 1),
-- HR
('perm-hr-read', 'hr.read', N'View HR', N'عرض الموارد البشرية', 'hr', N'الموارد البشرية', 1, 1),
('perm-hr-create', 'hr.create', N'Manage Employees', N'إدارة الموظفين', 'hr', N'الموارد البشرية', 2, 1),
('perm-hr-payroll', 'hr.payroll', N'Manage Payroll', N'إدارة الرواتب', 'hr', N'الموارد البشرية', 3, 1),
-- KDS
('perm-kds-read', 'kds.read', N'View KDS', N'عرض شاشة المطبخ', 'kds', N'شاشة المطبخ', 1, 1),
('perm-kds-update', 'kds.update', N'Update KDS Status', N'تحديث حالة المطبخ', 'kds', N'شاشة المطبخ', 2, 1),
-- Tables
('perm-tables-read', 'tables.read', N'View Tables', N'عرض الطاولات', 'tables', N'الطاولات', 1, 1),
('perm-tables-update', 'tables.update', N'Manage Tables', N'إدارة الطاولات', 'tables', N'الطاولات', 2, 1),
-- Shifts
('perm-shifts-create', 'shifts.create', N'Open Shift', N'فتح وردية', 'shifts', N'الورديات', 1, 1),
('perm-shifts-close', 'shifts.close', N'Close Shift', N'إغلاق وردية', 'shifts', N'الورديات', 2, 1),
('perm-shifts-read', 'shifts.read', N'View Shifts', N'عرض الورديات', 'shifts', N'الورديات', 3, 1),
-- System
('perm-system-read', 'system.read', N'View System Info', N'معلومات النظام', 'system', N'النظام', 1, 1),
('perm-system-update', 'system.update', N'Update System', N'تحديث النظام', 'system', N'النظام', 2, 1);
GO

-- ============================================================================
-- 3. DEFAULT CHART OF ACCOUNTS
-- ============================================================================
INSERT INTO chart_of_accounts (id, code, name, name_ar, type, normal_balance, parent_id, is_active, is_control_account, allow_manual_journals)
VALUES
-- ASSETS (1000-1999)
('coa-1000', '1000', N'Current Assets', N'الأصول المتداولة', 'ASSET', 'DEBIT', NULL, 1, 1, 0),
('coa-1100', '1100', N'Cash on Hand', N'النقدية بالصندوق', 'ASSET', 'DEBIT', 'coa-1000', 1, 0, 1),
('coa-1101', '1101', N'Cash - Main Drawer', N'الدرج الرئيسي', 'ASSET', 'DEBIT', 'coa-1100', 1, 0, 1),
('coa-1102', '1102', N'Petty Cash', N'النقدية المصروفات', 'ASSET', 'DEBIT', 'coa-1100', 1, 0, 1),
('coa-1200', '1200', N'Bank Accounts', N'الحسابات البنكية', 'ASSET', 'DEBIT', 'coa-1000', 1, 0, 1),
('coa-1201', '1201', N'CIB Bank Account', N'حساب بنك CIB', 'ASSET', 'DEBIT', 'coa-1200', 1, 0, 1),
('coa-1300', '1300', N'Accounts Receivable', N'حسابات مدينة', 'ASSET', 'DEBIT', 'coa-1000', 1, 1, 0),
('coa-1301', '1301', N'Delivery Platform Receivables', N'مستحقات منصات التوصيل', 'ASSET', 'DEBIT', 'coa-1300', 1, 0, 1),
('coa-1400', '1400', N'Inventory', N'المخزون', 'ASSET', 'DEBIT', 'coa-1000', 1, 0, 0),
('coa-1500', '1500', N'Prepaid Expenses', N'مصاريف مدفوعة مقدماً', 'ASSET', 'DEBIT', 'coa-1000', 1, 0, 1),
-- LIABILITIES (2000-2999)
('coa-2000', '2000', N'Current Liabilities', N'الخصوم المتداولة', 'LIABILITY', 'CREDIT', NULL, 1, 1, 0),
('coa-2100', '2100', N'Accounts Payable', N'حسابات دائنة', 'LIABILITY', 'CREDIT', 'coa-2000', 1, 1, 0),
('coa-2101', '2101', N'Supplier Payables', N'دائنون موردون', 'LIABILITY', 'CREDIT', 'coa-2100', 1, 0, 1),
('coa-2200', '2200', N'Tax Payable', N'الضرائب المستحقة', 'LIABILITY', 'CREDIT', 'coa-2000', 1, 0, 1),
('coa-2201', '2201', N'VAT Output', N'ضريبة المبيعات', 'LIABILITY', 'CREDIT', 'coa-2200', 1, 0, 1),
('coa-2202', '2202', N'VAT Input', N'ضريبة المشتريات', 'LIABILITY', 'CREDIT', 'coa-2200', 1, 0, 1),
('coa-2300', '2300', N'Employee Payables', N'مستحقات الموظفين', 'LIABILITY', 'CREDIT', 'coa-2000', 1, 0, 1),
-- EQUITY (3000-3999)
('coa-3000', '3000', N'Equity', N'حقوق الملكية', 'EQUITY', 'CREDIT', NULL, 1, 1, 0),
('coa-3100', '3100', N'Owner Capital', N'رأس المال', 'EQUITY', 'CREDIT', 'coa-3000', 1, 0, 1),
('coa-3200', '3200', N'Retained Earnings', N'الأرباح المحتجزة', 'EQUITY', 'CREDIT', 'coa-3000', 1, 0, 1),
-- REVENUE (4000-4999)
('coa-4000', '4000', N'Revenue', N'الإيرادات', 'REVENUE', 'CREDIT', NULL, 1, 1, 0),
('coa-4100', '4100', N'Food Sales', N'مبيعات الأكل', 'REVENUE', 'CREDIT', 'coa-4000', 1, 0, 0),
('coa-4101', '4101', N'Dine-In Sales', N'مبيعات dine-in', 'REVENUE', 'CREDIT', 'coa-4100', 1, 0, 0),
('coa-4102', '4102', N'Takeaway Sales', N'مبيعات takeaway', 'REVENUE', 'CREDIT', 'coa-4100', 1, 0, 0),
('coa-4103', '4103', N'Delivery Sales', N'مبيعات توصيل', 'REVENUE', 'CREDIT', 'coa-4100', 1, 0, 0),
('coa-4200', '4200', N'Service Charges', N'خدمة', 'REVENUE', 'CREDIT', 'coa-4000', 1, 0, 1),
('coa-4300', '4300', N'Delivery Fees', N'رسوم توصيل', 'REVENUE', 'CREDIT', 'coa-4000', 1, 0, 1),
-- COST OF GOODS SOLD (5000-5999)
('coa-5000', '5000', N'Cost of Goods Sold', N'تكلفة البضاعة المباعة', 'EXPENSE', 'DEBIT', NULL, 1, 1, 0),
('coa-5100', '5100', N'Food Cost', N'تكلفة الأكل', 'EXPENSE', 'DEBIT', 'coa-5000', 1, 0, 0),
('coa-5200', '5200', N'Beverage Cost', N'تكلفة المشروبات', 'EXPENSE', 'DEBIT', 'coa-5000', 1, 0, 0),
-- EXPENSES (6000-6999)
('coa-6000', '6000', N'Operating Expenses', N'المصروفات التشغيلية', 'EXPENSE', 'DEBIT', NULL, 1, 1, 0),
('coa-6100', '6100', N'Salaries & Wages', N'الرواتب والأجور', 'EXPENSE', 'DEBIT', 'coa-6000', 1, 0, 1),
('coa-6200', '6200', N'Rent', N'الإيجار', 'EXPENSE', 'DEBIT', 'coa-6000', 1, 0, 1),
('coa-6300', '6300', N'Utilities', N'المرافق', 'EXPENSE', 'DEBIT', 'coa-6000', 1, 0, 1),
('coa-6400', '6400', N'Marketing & Advertising', N'التسويق والإعلان', 'EXPENSE', 'DEBIT', 'coa-6000', 1, 0, 1),
('coa-6500', '6500', N'Commission & Fees', N'العمولات والرسوم', 'EXPENSE', 'DEBIT', 'coa-6000', 1, 0, 1),
('coa-6600', '6600', N'Maintenance', N'الصيانة', 'EXPENSE', 'DEBIT', 'coa-6000', 1, 0, 1),
('coa-6700', '6700', N'Depreciation', N'الإهلاك', 'EXPENSE', 'DEBIT', 'coa-6000', 1, 0, 1),
('coa-6800', '6800', N'Other Expenses', N'مصروفات أخرى', 'EXPENSE', 'DEBIT', 'coa-6000', 1, 0, 1);
GO

-- ============================================================================
-- 4. PAYMENT METHOD ACCOUNTS
-- ============================================================================
INSERT INTO payment_method_accounts (payment_method, account_id, branch_id)
VALUES
('CASH', 'coa-1101', NULL),
('VISA', 'coa-1201', NULL),
('VODAFONE_CASH', 'coa-1201', NULL),
('INSTAPAY', 'coa-1201', NULL),
('TALABAT', 'coa-1301', NULL),
('ELMENUS', 'coa-1301', NULL);
GO

-- ============================================================================
-- 5. TAX ACCOUNTS
-- ============================================================================
INSERT INTO tax_accounts (tax_type, account_id, rate)
VALUES
('OUTPUT_VAT', 'coa-2201', 14),
('INPUT_VAT', 'coa-2202', 14);
GO

-- ============================================================================
-- 6. DEFAULT BRANCH
-- ============================================================================
INSERT INTO branches (id, name, name_ar, location, address, is_active, timezone, currency, tax_rate, service_charge, business_date)
VALUES
('b1', N'Main Branch', N'الفرع الرئيسي', N'Main Location', N'Main Street', 1, 'Africa/Cairo', 'EGP', 14, 0, FORMAT(GETDATE(), 'yyyy-MM-dd'));
GO

-- ============================================================================
-- 8. DELIVERY PLATFORMS
-- ============================================================================
INSERT INTO delivery_platforms (id, name, is_active, fee_percentage, apply_fees_to_menu_price, integration_type)
VALUES
('dp-dine-in', N'Dine-In', 1, 0, 0, 'MANUAL'),
('dp-takeaway', N'Takeaway', 1, 0, 0, 'MANUAL'),
('dp-talabat', N'Talabat', 1, 15, 1, 'MANUAL'),
('dp-elmenus', N'Elmenus', 1, 12, 1, 'MANUAL'),
('dp-jahez', N'Jahez', 1, 15, 1, 'MANUAL'),
('dp-whatsapp', N'WhatsApp', 1, 0, 0, 'MANUAL');
GO

-- ============================================================================
-- 9. SYSTEM SETTINGS
-- ============================================================================
INSERT INTO system_settings ([key], value, category)
VALUES
('app.name', N'"Coduis Zen"', 'general'),
('app.timezone', N'"Africa/Cairo"', 'general'),
('app.currency', N'"EGP"', 'general'),
('app.default_language', N'"ar"', 'general'),
('app.date_format', N'"YYYY-MM-DD"', 'general'),
('app.time_format', N'"HH:mm"', 'general'),
('pos.default_order_type', N'"DINE_IN"', 'pos'),
('pos.tax_rate', N'14', 'pos'),
('pos.service_charge', N'0', 'pos'),
('pos.cashier_mode', N'"simple"', 'pos'),
('orders.auto_print', N'false', 'orders'),
('orders.default_status', N'"PENDING"', 'orders'),
('inventory.low_stock_threshold', N'10', 'inventory'),
('inventory.audit_frequency', N'"DAILY"', 'inventory'),
('finance.fiscal_year_start', N'"2026-01-01"', 'finance'),
('finance.auto_post_journals', N'true', 'finance'),
('delivery.default_fee', N'0', 'delivery'),
('delivery.estimated_time', N'45', 'delivery'),
('loyalty.enabled', N'true', 'loyalty'),
('loyalty.points_per_currency', N'1', 'loyalty'),
('loyalty.currency_per_point', N'0.1', 'loyalty'),
('whatsapp.enabled', N'false', 'whatsapp'),
('whatsapp.provider', N'"disabled"', 'whatsapp'),
('eta.enabled', N'false', 'eta'),
('eta.country', N'"EG"', 'eta');
GO

-- ============================================================================
-- 10. DEFAULT FISCAL PERIOD
-- ============================================================================
INSERT INTO fiscal_periods (id, name, start_date, end_date, status)
VALUES
('fp-2026-01', N'January 2026', '2026-01-01', '2026-01-31', 'OPEN'),
('fp-2026-02', N'February 2026', '2026-02-01', '2026-02-28', 'OPEN'),
('fp-2026-03', N'March 2026', '2026-03-01', '2026-03-31', 'OPEN'),
('fp-2026-04', N'April 2026', '2026-04-01', '2026-04-30', 'OPEN'),
('fp-2026-05', N'May 2026', '2026-05-01', '2026-05-31', 'OPEN'),
('fp-2026-06', N'June 2026', '2026-06-01', '2026-06-30', 'OPEN'),
('fp-2026-07', N'July 2026', '2026-07-01', '2026-07-31', 'OPEN'),
('fp-2026-08', N'August 2026', '2026-08-01', '2026-08-31', 'OPEN'),
('fp-2026-09', N'September 2026', '2026-09-01', '2026-09-30', 'OPEN'),
('fp-2026-10', N'October 2026', '2026-10-01', '2026-10-31', 'OPEN'),
('fp-2026-11', N'November 2026', '2026-11-01', '2026-11-30', 'OPEN'),
('fp-2026-12', N'December 2026', '2026-12-01', '2026-12-31', 'OPEN');
GO

-- ============================================================================
-- 11. DEFAULT WAREHOUSE
-- ============================================================================
INSERT INTO warehouses (id, name, name_ar, branch_id, type, is_active)
VALUES
('wh-main', N'Main Warehouse', N'المخزن الرئيسي', 'b1', 'MAIN', 1),
('wh-kitchen', N'Kitchen Store', N'مخزن المطبخ', 'b1', 'KITCHEN', 1),
('wh-bar', N'Bar Store', N'مخزن البار', 'b1', 'POINT_OF_SALE', 1);
GO

-- ============================================================================
-- 12. DEFAULT MENU CATEGORIES
-- ============================================================================
INSERT INTO menu_categories (id, name, name_ar, sort_order, is_active)
VALUES
('cat-appetizer', N'Appetizers', N'مقبلات', 1, 1),
('cat-main', N'Main Course', N'أطباق رئيسية', 2, 1),
('cat-dessert', N'Desserts', N'حلويات', 3, 1),
('cat-beverage', N'Beverages', N'مشروبات', 4, 1),
('cat-hot-drink', N'Hot Drinks', N'مشروبات ساخنة', 5, 1),
('cat-cold-drink', N'Cold Drinks', N'مشروبات باردة', 6, 1),
('cat-sandwich', N'Sandwiches', N'ساندوتشات', 7, 1),
('cat-salad', N'Salads', N'سلطات', 8, 1),
('cat-soup', N'Soups', N'شوربة', 9, 1),
('cat-extra', N'Extras', N'إضافات', 10, 1);
GO

-- ============================================================================
-- 13. DEFAULT DELIVERY ZONE
-- ============================================================================
INSERT INTO delivery_zones (name, name_ar, branch_id, delivery_fee, min_order_amount, estimated_time, is_active)
VALUES
(N'Local', N'محلي', 'b1', 0, 0, 30, 1),
(N'Zone 1', N'المنطقة 1', 'b1', 15, 50, 45, 1),
(N'Zone 2', N'المنطقة 2', 'b1', 25, 80, 60, 1),
(N'Zone 3', N'المنطقة 3', 'b1', 35, 100, 75, 1);
GO

-- ============================================================================
-- 14. DEFAULT PRINTER CONFIG
-- ============================================================================
INSERT INTO printers (id, name, type, address, location, branch_id, is_active, role, paper_width)
VALUES
('pr-intercom', N'Intercom Printer', N'NETWORK', N'192.168.1.100:9100', N'Kitchen', 'b1', 1, 'KITCHEN', 80),
('pr-receipt', N'Cashier Receipt', N'USB', NULL, N'POS Counter', 'b1', 1, 'RECEIPT', 80);
GO

-- ============================================================================
-- 15. POSTING RULES (GL Auto-posting)
-- ============================================================================
INSERT INTO posting_rules (id, document_type, amount_source, direction, account_code, condition_field, condition_value, is_active, is_system)
VALUES
('pr-sale-debit-cash', 'POS_SALE', 'TOTAL', 'DEBIT', '1101', 'paymentMethod', 'CASH', 1, 1),
('pr-sale-credit-revenue', 'POS_SALE', 'SUBTOTAL', 'CREDIT', '4100', NULL, NULL, 1, 1),
('pr-sale-credit-vat', 'POS_SALE', 'TAX', 'CREDIT', '2201', NULL, NULL, 1, 1),
('pr-sale-credit-service', 'POS_SALE', 'SERVICE_CHARGE', 'CREDIT', '4200', NULL, NULL, 1, 1),
('pr-sale-debit-visa', 'POS_SALE', 'TOTAL', 'DEBIT', '1201', 'paymentMethod', 'VISA', 1, 1),
('pr-grn-debit-inventory', 'GRN', 'TOTAL', 'DEBIT', '1400', NULL, NULL, 1, 1),
('pr-grn-credit-payable', 'GRN', 'TOTAL', 'CREDIT', '2101', NULL, NULL, 1, 1),
('pr-cogs-debit', 'POS_SALE', 'SUBTOTAL', 'DEBIT', '5100', NULL, NULL, 1, 1),
('pr-cogs-credit', 'POS_SALE', 'SUBTOTAL', 'CREDIT', '1400', NULL, NULL, 1, 1);
GO

PRINT N'Coduis Zen database created successfully.';
PRINT N'139 tables created.';
PRINT N'Create the first administrator through the secure setup wizard.';
PRINT N'Default branch: b1 - Main Branch';
GO
