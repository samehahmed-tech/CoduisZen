SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.kds_tickets', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.kds_tickets', 'routing_station') IS NULL
    BEGIN
        ALTER TABLE dbo.kds_tickets ADD routing_station nvarchar(255) NULL;
        IF COL_LENGTH('dbo.kds_tickets', 'station_id') IS NOT NULL
            EXEC(N'UPDATE dbo.kds_tickets SET routing_station = COALESCE(CONVERT(nvarchar(255), station_id), ''KITCHEN'') WHERE routing_station IS NULL');
        ELSE
            UPDATE dbo.kds_tickets SET routing_station = 'KITCHEN' WHERE routing_station IS NULL;
    END;
    IF COL_LENGTH('dbo.kds_tickets', 'target_time') IS NULL ALTER TABLE dbo.kds_tickets ADD target_time datetime2 NULL;
    IF COL_LENGTH('dbo.kds_tickets', 'bumped_at') IS NULL ALTER TABLE dbo.kds_tickets ADD bumped_at datetime2 NULL;
    IF EXISTS (
        SELECT 1
        FROM sys.columns c
        JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('dbo.kds_tickets')
          AND c.name = 'priority'
          AND t.name <> 'nvarchar'
    )
    BEGIN
        DECLARE @kdsPriorityDefault sysname;
        SELECT @kdsPriorityDefault = dc.name
        FROM sys.default_constraints dc
        JOIN sys.columns c ON c.default_object_id = dc.object_id
        WHERE c.object_id = OBJECT_ID('dbo.kds_tickets') AND c.name = 'priority';
        IF @kdsPriorityDefault IS NOT NULL
        BEGIN
            DECLARE @dropKdsPriorityDefault nvarchar(max);
            SET @dropKdsPriorityDefault = N'ALTER TABLE dbo.kds_tickets DROP CONSTRAINT ' + QUOTENAME(@kdsPriorityDefault);
            EXEC sys.sp_executesql @dropKdsPriorityDefault;
        END;
        ALTER TABLE dbo.kds_tickets ALTER COLUMN priority nvarchar(255) NULL;
        UPDATE dbo.kds_tickets
        SET priority = CASE priority WHEN '1' THEN 'RUSH' WHEN '2' THEN 'REMAKE' ELSE 'NORMAL' END;
        ALTER TABLE dbo.kds_tickets ADD CONSTRAINT df_kds_tickets_priority DEFAULT 'NORMAL' FOR priority;
    END;
END;

IF OBJECT_ID(N'dbo.kds_ticket_items', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.kds_ticket_items', 'kds_ticket_id') IS NULL
    BEGIN
        ALTER TABLE dbo.kds_ticket_items ADD kds_ticket_id nvarchar(255) NULL;
        IF COL_LENGTH('dbo.kds_ticket_items', 'ticket_id') IS NOT NULL
            EXEC(N'UPDATE dbo.kds_ticket_items SET kds_ticket_id = ticket_id WHERE kds_ticket_id IS NULL');
    END;
    IF COL_LENGTH('dbo.kds_ticket_items', 'menu_item_id') IS NULL ALTER TABLE dbo.kds_ticket_items ADD menu_item_id nvarchar(255) NULL;
    IF COL_LENGTH('dbo.kds_ticket_items', 'item_name') IS NULL ALTER TABLE dbo.kds_ticket_items ADD item_name nvarchar(max) NULL;
    IF COL_LENGTH('dbo.kds_ticket_items', 'quantity') IS NULL ALTER TABLE dbo.kds_ticket_items ADD quantity int NULL;
    IF COL_LENGTH('dbo.kds_ticket_items', 'modifiers_text') IS NULL ALTER TABLE dbo.kds_ticket_items ADD modifiers_text nvarchar(max) NULL;
    IF COL_LENGTH('dbo.kds_ticket_items', 'is_bumped') IS NULL ALTER TABLE dbo.kds_ticket_items ADD is_bumped bit NOT NULL CONSTRAINT df_kds_ticket_items_is_bumped DEFAULT 0;
    IF COL_LENGTH('dbo.kds_ticket_items', 'ticket_id') IS NOT NULL
       AND COLUMNPROPERTY(OBJECT_ID('dbo.kds_ticket_items'), 'ticket_id', 'AllowsNull') = 0
        ALTER TABLE dbo.kds_ticket_items ALTER COLUMN ticket_id nvarchar(255) NULL;
    IF COL_LENGTH('dbo.kds_ticket_items', 'order_item_id') IS NOT NULL
       AND COLUMNPROPERTY(OBJECT_ID('dbo.kds_ticket_items'), 'order_item_id', 'AllowsNull') = 0
        ALTER TABLE dbo.kds_ticket_items ALTER COLUMN order_item_id int NULL;
END;

IF OBJECT_ID(N'dbo.day_close_reports', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.day_close_reports', 'shift_id') IS NULL ALTER TABLE dbo.day_close_reports ADD shift_id nvarchar(255) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'closed_by') IS NULL ALTER TABLE dbo.day_close_reports ADD closed_by nvarchar(255) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'date') IS NULL ALTER TABLE dbo.day_close_reports ADD [date] date NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'variance') IS NULL ALTER TABLE dbo.day_close_reports ADD variance real NOT NULL CONSTRAINT df_day_close_variance DEFAULT 0;
    IF COL_LENGTH('dbo.day_close_reports', 'payment_breakdown') IS NULL ALTER TABLE dbo.day_close_reports ADD payment_breakdown nvarchar(max) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'total_orders') IS NULL ALTER TABLE dbo.day_close_reports ADD total_orders int NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'total_revenue') IS NULL ALTER TABLE dbo.day_close_reports ADD total_revenue real NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'total_refunds') IS NULL ALTER TABLE dbo.day_close_reports ADD total_refunds real NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'total_discounts') IS NULL ALTER TABLE dbo.day_close_reports ADD total_discounts real NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'sales_snapshot') IS NULL ALTER TABLE dbo.day_close_reports ADD sales_snapshot nvarchar(max) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'orders_snapshot') IS NULL ALTER TABLE dbo.day_close_reports ADD orders_snapshot nvarchar(max) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'payments_snapshot') IS NULL ALTER TABLE dbo.day_close_reports ADD payments_snapshot nvarchar(max) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'inventory_snapshot') IS NULL ALTER TABLE dbo.day_close_reports ADD inventory_snapshot nvarchar(max) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'shifts_snapshot') IS NULL ALTER TABLE dbo.day_close_reports ADD shifts_snapshot nvarchar(max) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'fiscal_snapshot') IS NULL ALTER TABLE dbo.day_close_reports ADD fiscal_snapshot nvarchar(max) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'finance_snapshot') IS NULL ALTER TABLE dbo.day_close_reports ADD finance_snapshot nvarchar(max) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'side_effect_snapshot') IS NULL ALTER TABLE dbo.day_close_reports ADD side_effect_snapshot nvarchar(max) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'audit_snapshot') IS NULL ALTER TABLE dbo.day_close_reports ADD audit_snapshot nvarchar(max) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'approved_by') IS NULL ALTER TABLE dbo.day_close_reports ADD approved_by nvarchar(255) NULL;
    IF COL_LENGTH('dbo.day_close_reports', 'approved_at') IS NULL ALTER TABLE dbo.day_close_reports ADD approved_at datetime2 NULL;

    EXEC(N'UPDATE dbo.day_close_reports
        SET closed_by = COALESCE(closed_by, created_by),
            [date] = COALESCE([date], business_date),
            variance = COALESCE(variance, cash_difference, 0),
            total_orders = COALESCE(total_orders, total_transactions, 0),
            total_revenue = COALESCE(total_revenue, net_sales, 0),
            total_refunds = COALESCE(total_refunds, refund_amount, 0),
            total_discounts = COALESCE(total_discounts, discounts, 0)');

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.day_close_reports') AND name = 'day_close_branch_date_unique_idx')
        EXEC(N'CREATE UNIQUE INDEX day_close_branch_date_unique_idx ON dbo.day_close_reports(branch_id, [date]) WHERE [date] IS NOT NULL');
END;

IF OBJECT_ID(N'dbo.whatsapp_messages', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_messages (
        id nvarchar(255) NOT NULL CONSTRAINT pk_whatsapp_messages PRIMARY KEY,
        customer_id nvarchar(255) NULL,
        customer_phone nvarchar(max) NOT NULL,
        direction nvarchar(max) NOT NULL,
        content nvarchar(max) NOT NULL,
        message_type nvarchar(max) NULL CONSTRAINT df_whatsapp_messages_type DEFAULT 'TEXT',
        template_id nvarchar(max) NULL,
        status nvarchar(max) NOT NULL CONSTRAINT df_whatsapp_messages_status DEFAULT 'SENT',
        external_id nvarchar(max) NULL,
        failure_reason nvarchar(max) NULL,
        campaign_id nvarchar(255) NULL,
        order_id nvarchar(255) NULL,
        sent_at datetime2 NULL CONSTRAINT df_whatsapp_messages_sent_at DEFAULT GETDATE(),
        delivered_at datetime2 NULL,
        read_at datetime2 NULL,
        created_at datetime2 NULL CONSTRAINT df_whatsapp_messages_created_at DEFAULT GETDATE()
    );

    IF OBJECT_ID(N'dbo.customers', N'U') IS NOT NULL
        ALTER TABLE dbo.whatsapp_messages ADD CONSTRAINT fk_whatsapp_messages_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id);
    IF OBJECT_ID(N'dbo.campaigns', N'U') IS NOT NULL
        ALTER TABLE dbo.whatsapp_messages ADD CONSTRAINT fk_whatsapp_messages_campaign FOREIGN KEY (campaign_id) REFERENCES dbo.campaigns(id);
    IF OBJECT_ID(N'dbo.orders', N'U') IS NOT NULL
        ALTER TABLE dbo.whatsapp_messages ADD CONSTRAINT fk_whatsapp_messages_order FOREIGN KEY (order_id) REFERENCES dbo.orders(id);
END;

IF OBJECT_ID(N'dbo.domain_events', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.domain_events (
        id nvarchar(255) NOT NULL CONSTRAINT pk_domain_events PRIMARY KEY,
        [type] nvarchar(max) NULL,
        entity_type nvarchar(max) NULL,
        entity_id nvarchar(max) NULL,
        branch_id nvarchar(max) NULL,
        status nvarchar(max) NULL CONSTRAINT df_domain_events_status DEFAULT 'PENDING',
        payload nvarchar(max) NULL,
        processed_at datetime2 NULL,
        created_at datetime2 NULL CONSTRAINT df_domain_events_created_at DEFAULT GETDATE()
    );
END;

IF OBJECT_ID(N'dbo.payroll', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.payroll (
        id int IDENTITY(1,1) NOT NULL CONSTRAINT pk_payroll PRIMARY KEY,
        user_id nvarchar(255) NOT NULL,
        [month] nvarchar(255) NOT NULL,
        base_salary real NOT NULL,
        overtime_pay real NULL CONSTRAINT df_payroll_overtime DEFAULT 0,
        bonuses real NULL CONSTRAINT df_payroll_bonuses DEFAULT 0,
        deductions real NULL CONSTRAINT df_payroll_deductions DEFAULT 0,
        net_salary real NOT NULL,
        status nvarchar(max) NULL CONSTRAINT df_payroll_status DEFAULT 'DRAFT',
        paid_at datetime2 NULL,
        processed_by nvarchar(max) NULL,
        created_at datetime2 NULL CONSTRAINT df_payroll_created_at DEFAULT GETDATE(),
        updated_at datetime2 NULL CONSTRAINT df_payroll_updated_at DEFAULT GETDATE(),
        CONSTRAINT fk_payroll_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
    );
    CREATE UNIQUE INDEX idx_payroll_user_month ON dbo.payroll(user_id, [month]);
END;

IF OBJECT_ID(N'dbo.payroll_profiles', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.payroll_profiles', 'code') IS NULL ALTER TABLE dbo.payroll_profiles ADD code nvarchar(max) NULL;
    IF COL_LENGTH('dbo.payroll_profiles', 'pay_frequency') IS NULL ALTER TABLE dbo.payroll_profiles ADD pay_frequency nvarchar(max) NOT NULL CONSTRAINT df_payroll_profiles_frequency DEFAULT 'MONTHLY';
    IF COL_LENGTH('dbo.payroll_profiles', 'salary_mode') IS NULL ALTER TABLE dbo.payroll_profiles ADD salary_mode nvarchar(max) NOT NULL CONSTRAINT df_payroll_profiles_salary_mode DEFAULT 'MONTHLY';
    IF COL_LENGTH('dbo.payroll_profiles', 'currency') IS NULL ALTER TABLE dbo.payroll_profiles ADD currency nvarchar(max) NOT NULL CONSTRAINT df_payroll_profiles_currency DEFAULT 'EGP';
    IF COL_LENGTH('dbo.payroll_profiles', 'default_attendance_policy_id') IS NULL ALTER TABLE dbo.payroll_profiles ADD default_attendance_policy_id nvarchar(255) NULL;
    IF COL_LENGTH('dbo.payroll_profiles', 'default_overtime_rate') IS NULL ALTER TABLE dbo.payroll_profiles ADD default_overtime_rate real NOT NULL CONSTRAINT df_payroll_profiles_overtime DEFAULT 1.5;
    IF COL_LENGTH('dbo.payroll_profiles', 'late_deduction_mode') IS NULL ALTER TABLE dbo.payroll_profiles ADD late_deduction_mode nvarchar(max) NOT NULL CONSTRAINT df_payroll_profiles_late DEFAULT 'NONE';
    IF COL_LENGTH('dbo.payroll_profiles', 'absence_deduction_mode') IS NULL ALTER TABLE dbo.payroll_profiles ADD absence_deduction_mode nvarchar(max) NOT NULL CONSTRAINT df_payroll_profiles_absence DEFAULT 'DAILY_RATE';
    IF COL_LENGTH('dbo.payroll_profiles', 'auto_post_to_gl') IS NULL ALTER TABLE dbo.payroll_profiles ADD auto_post_to_gl bit NULL CONSTRAINT df_payroll_profiles_auto_gl DEFAULT 1;
    IF COL_LENGTH('dbo.payroll_profiles', 'is_default') IS NULL ALTER TABLE dbo.payroll_profiles ADD is_default bit NULL CONSTRAINT df_payroll_profiles_default DEFAULT 0;
END;

IF OBJECT_ID(N'dbo.payroll_components', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.payroll_components', 'branch_id') IS NULL ALTER TABLE dbo.payroll_components ADD branch_id nvarchar(255) NULL;
    IF COL_LENGTH('dbo.payroll_components', 'code') IS NULL ALTER TABLE dbo.payroll_components ADD code nvarchar(max) NULL;
    IF COL_LENGTH('dbo.payroll_components', 'amount_type') IS NULL ALTER TABLE dbo.payroll_components ADD amount_type nvarchar(max) NOT NULL CONSTRAINT df_payroll_components_amount_type DEFAULT 'FIXED';
    IF COL_LENGTH('dbo.payroll_components', 'calculation_basis') IS NULL ALTER TABLE dbo.payroll_components ADD calculation_basis nvarchar(max) NOT NULL CONSTRAINT df_payroll_components_basis DEFAULT 'BASE_SALARY';
    IF COL_LENGTH('dbo.payroll_components', 'default_value') IS NULL ALTER TABLE dbo.payroll_components ADD default_value real NOT NULL CONSTRAINT df_payroll_components_value DEFAULT 0;
    IF COL_LENGTH('dbo.payroll_components', 'taxable') IS NULL ALTER TABLE dbo.payroll_components ADD taxable bit NULL CONSTRAINT df_payroll_components_taxable DEFAULT 0;
    IF COL_LENGTH('dbo.payroll_components', 'pensionable') IS NULL ALTER TABLE dbo.payroll_components ADD pensionable bit NULL CONSTRAINT df_payroll_components_pensionable DEFAULT 0;
    IF COL_LENGTH('dbo.payroll_components', 'affects_net_pay') IS NULL ALTER TABLE dbo.payroll_components ADD affects_net_pay bit NULL CONSTRAINT df_payroll_components_net DEFAULT 1;
    IF COL_LENGTH('dbo.payroll_components', 'sort_order') IS NULL ALTER TABLE dbo.payroll_components ADD sort_order int NOT NULL CONSTRAINT df_payroll_components_sort DEFAULT 0;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.payroll_components') AND name = N'calculation_method' AND is_nullable = 0)
        ALTER TABLE dbo.payroll_components ALTER COLUMN calculation_method nvarchar(max) NULL;
END;

IF OBJECT_ID(N'dbo.employee_shift_assignments', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.employee_shift_assignments', 'branch_id') IS NULL ALTER TABLE dbo.employee_shift_assignments ADD branch_id nvarchar(255) NULL;
    IF COL_LENGTH('dbo.employee_shift_assignments', 'is_primary') IS NULL ALTER TABLE dbo.employee_shift_assignments ADD is_primary bit NULL CONSTRAINT df_employee_shift_primary DEFAULT 1;
    IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.employee_shift_assignments') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.employee_shift_assignments'), 'id', 'ColumnId'))
        ALTER TABLE dbo.employee_shift_assignments ADD CONSTRAINT df_employee_shift_id DEFAULT CONVERT(nvarchar(255), NEWID()) FOR id;
END;

IF OBJECT_ID(N'dbo.leave_types', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.leave_types', 'days_per_year') IS NULL ALTER TABLE dbo.leave_types ADD days_per_year real NULL;
    IF COL_LENGTH('dbo.leave_types', 'requires_approval') IS NULL ALTER TABLE dbo.leave_types ADD requires_approval bit NULL CONSTRAINT df_leave_types_approval DEFAULT 1;
END;

IF OBJECT_ID(N'dbo.bonus_penalty_records', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.bonus_penalty_records', 'category') IS NULL ALTER TABLE dbo.bonus_penalty_records ADD category nvarchar(max) NULL;
    IF COL_LENGTH('dbo.bonus_penalty_records', 'effective_date') IS NULL ALTER TABLE dbo.bonus_penalty_records ADD effective_date date NULL;
    IF COL_LENGTH('dbo.bonus_penalty_records', 'payroll_cycle_id') IS NULL ALTER TABLE dbo.bonus_penalty_records ADD payroll_cycle_id nvarchar(255) NULL;
    IF COL_LENGTH('dbo.bonus_penalty_records', 'notes') IS NULL ALTER TABLE dbo.bonus_penalty_records ADD notes nvarchar(max) NULL;
    IF COL_LENGTH('dbo.bonus_penalty_records', 'requested_by') IS NULL ALTER TABLE dbo.bonus_penalty_records ADD requested_by nvarchar(255) NULL;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.bonus_penalty_records') AND name = N'date' AND is_nullable = 0)
        ALTER TABLE dbo.bonus_penalty_records ALTER COLUMN [date] date NULL;
END;

IF OBJECT_ID(N'dbo.employee_loans', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.employee_loans', 'type') IS NULL ALTER TABLE dbo.employee_loans ADD [type] nvarchar(max) NOT NULL CONSTRAINT df_employee_loans_type DEFAULT 'ADVANCE';
    IF COL_LENGTH('dbo.employee_loans', 'principal_amount') IS NULL ALTER TABLE dbo.employee_loans ADD principal_amount real NULL;
    IF COL_LENGTH('dbo.employee_loans', 'installment_amount') IS NULL ALTER TABLE dbo.employee_loans ADD installment_amount real NOT NULL CONSTRAINT df_employee_loans_installment DEFAULT 0;
    IF COL_LENGTH('dbo.employee_loans', 'installments_count') IS NULL ALTER TABLE dbo.employee_loans ADD installments_count int NOT NULL CONSTRAINT df_employee_loans_count DEFAULT 1;
    IF COL_LENGTH('dbo.employee_loans', 'outstanding_amount') IS NULL ALTER TABLE dbo.employee_loans ADD outstanding_amount real NULL;
    IF COL_LENGTH('dbo.employee_loans', 'requested_at') IS NULL ALTER TABLE dbo.employee_loans ADD requested_at datetime2 NOT NULL CONSTRAINT df_employee_loans_requested_at DEFAULT GETDATE();
    IF COL_LENGTH('dbo.employee_loans', 'disbursed_at') IS NULL ALTER TABLE dbo.employee_loans ADD disbursed_at datetime2 NULL;
    IF COL_LENGTH('dbo.employee_loans', 'effective_from') IS NULL ALTER TABLE dbo.employee_loans ADD effective_from date NULL;
    IF COL_LENGTH('dbo.employee_loans', 'notes') IS NULL ALTER TABLE dbo.employee_loans ADD notes nvarchar(max) NULL;
    IF COL_LENGTH('dbo.employee_loans', 'requested_by') IS NULL ALTER TABLE dbo.employee_loans ADD requested_by nvarchar(255) NULL;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.employee_loans') AND name = N'amount' AND is_nullable = 0)
        ALTER TABLE dbo.employee_loans ALTER COLUMN amount real NULL;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.employee_loans') AND name = N'total_installments' AND is_nullable = 0)
        ALTER TABLE dbo.employee_loans ALTER COLUMN total_installments int NULL;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.employee_loans') AND name = N'remaining_amount' AND is_nullable = 0)
        ALTER TABLE dbo.employee_loans ALTER COLUMN remaining_amount real NULL;
END;

IF OBJECT_ID(N'dbo.payroll_rules', N'U') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.payroll_rules') AND name = N'type' AND is_nullable = 0)
        ALTER TABLE dbo.payroll_rules ALTER COLUMN [type] nvarchar(max) NULL;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.payroll_rules') AND name = N'action' AND is_nullable = 0)
        ALTER TABLE dbo.payroll_rules ALTER COLUMN [action] nvarchar(max) NULL;
END;

IF OBJECT_ID(N'dbo.payroll_payouts', N'U') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.payroll_payouts') AND name = N'run_id' AND is_nullable = 0)
        ALTER TABLE dbo.payroll_payouts ALTER COLUMN run_id nvarchar(255) NULL;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.payroll_payouts') AND name = N'amount' AND is_nullable = 0)
        ALTER TABLE dbo.payroll_payouts ALTER COLUMN amount real NULL;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.payroll_payouts') AND name = N'payment_method' AND is_nullable = 0)
        ALTER TABLE dbo.payroll_payouts ALTER COLUMN payment_method nvarchar(max) NULL;
END;

IF OBJECT_ID(N'dbo.loan_installments', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.loan_installments', 'updated_at') IS NULL
        ALTER TABLE dbo.loan_installments ADD updated_at datetime2 NULL CONSTRAINT df_loan_installments_updated DEFAULT GETDATE();
    IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.loan_installments') AND parent_column_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.loan_installments'), 'id', 'ColumnId'))
        ALTER TABLE dbo.loan_installments ADD CONSTRAINT df_loan_installments_id DEFAULT CONVERT(nvarchar(255), NEWID()) FOR id;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.loan_installments') AND name = N'installment_number' AND is_nullable = 0)
        ALTER TABLE dbo.loan_installments ALTER COLUMN installment_number int NULL;
END;

IF OBJECT_ID(N'dbo.payroll_locks', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.payroll_locks', 'locked_through') IS NULL
        ALTER TABLE dbo.payroll_locks ADD locked_through datetime2 NULL;
    IF COL_LENGTH('dbo.payroll_locks', 'created_at') IS NULL
        ALTER TABLE dbo.payroll_locks ADD created_at datetime2 NULL CONSTRAINT df_payroll_locks_created DEFAULT GETDATE();
    IF COL_LENGTH('dbo.payroll_locks', 'updated_at') IS NULL
        ALTER TABLE dbo.payroll_locks ADD updated_at datetime2 NULL CONSTRAINT df_payroll_locks_updated DEFAULT GETDATE();
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.payroll_locks') AND name = N'employee_id' AND is_nullable = 0)
        ALTER TABLE dbo.payroll_locks ALTER COLUMN employee_id nvarchar(255) NULL;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.payroll_locks') AND name = N'period_start' AND is_nullable = 0)
        ALTER TABLE dbo.payroll_locks ALTER COLUMN period_start date NULL;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.payroll_locks') AND name = N'period_end' AND is_nullable = 0)
        ALTER TABLE dbo.payroll_locks ALTER COLUMN period_end date NULL;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.payroll_locks') AND name = N'locked_by' AND is_nullable = 0)
        ALTER TABLE dbo.payroll_locks ALTER COLUMN locked_by nvarchar(255) NULL;
END;

IF OBJECT_ID(N'dbo.employees', N'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.employees') AND name = N'employees_active_created_idx')
        CREATE INDEX employees_active_created_idx ON dbo.employees(is_active, created_at DESC);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.employees') AND name = N'employees_branch_active_created_idx')
        CREATE INDEX employees_branch_active_created_idx ON dbo.employees(branch_id, is_active, created_at DESC);
END;

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.attendance_raw_logs') AND name = N'uq_attendance_raw_logs_dedupe')
    ALTER TABLE dbo.attendance_raw_logs DROP CONSTRAINT uq_attendance_raw_logs_dedupe;
ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.attendance_raw_logs') AND name = N'uq_attendance_raw_logs_dedupe')
    DROP INDEX uq_attendance_raw_logs_dedupe ON dbo.attendance_raw_logs;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.attendance_raw_logs') AND name = N'attendance_raw_logs_dedupe_idx')
    DROP INDEX attendance_raw_logs_dedupe_idx ON dbo.attendance_raw_logs;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.attendance_raw_logs') AND name = N'idx_attendance_raw_logs_dedupe')
    DROP INDEX idx_attendance_raw_logs_dedupe ON dbo.attendance_raw_logs;
IF OBJECT_ID(N'dbo.attendance_raw_logs', N'U') IS NOT NULL
    CREATE UNIQUE INDEX attendance_raw_logs_dedupe_idx ON dbo.attendance_raw_logs(dedupe_hash) WHERE dedupe_hash IS NOT NULL;

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.orders')
      AND name = N'created_at'
      AND scale <> 3
)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.orders') AND name = N'idx_orders_branch_date')
        DROP INDEX idx_orders_branch_date ON dbo.orders;
    ALTER TABLE dbo.orders ALTER COLUMN created_at datetime2(3) NULL;
    CREATE INDEX idx_orders_branch_date ON dbo.orders(branch_id, created_at);
END;

IF OBJECT_ID(N'dbo.tables', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.tables', 'discount_percent') IS NULL ALTER TABLE dbo.tables ADD discount_percent real NULL CONSTRAINT df_tables_discount_percent DEFAULT (0);
    IF COL_LENGTH('dbo.tables', 'default_coupon_code') IS NULL ALTER TABLE dbo.tables ADD default_coupon_code nvarchar(255) NULL;
    IF COL_LENGTH('dbo.tables', 'min_spend') IS NULL ALTER TABLE dbo.tables ADD min_spend real NULL CONSTRAINT df_tables_min_spend DEFAULT (0);
    IF COL_LENGTH('dbo.tables', 'is_vip') IS NULL ALTER TABLE dbo.tables ADD is_vip bit NULL CONSTRAINT df_tables_is_vip DEFAULT (0);
    IF COL_LENGTH('dbo.tables', 'notes') IS NULL ALTER TABLE dbo.tables ADD notes nvarchar(max) NULL;
END;

IF OBJECT_ID(N'dbo.purchase_orders', N'U') IS NOT NULL
   AND COL_LENGTH('dbo.purchase_orders', 'target_warehouse_id') IS NULL
    ALTER TABLE dbo.purchase_orders ADD target_warehouse_id nvarchar(255) NULL;

IF OBJECT_ID(N'dbo.leave_balances', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.leave_balances', N'entitled_days') IS NULL
        ALTER TABLE dbo.leave_balances ADD entitled_days real NULL;
    IF COL_LENGTH(N'dbo.leave_balances', N'carried_forward_days') IS NULL
        ALTER TABLE dbo.leave_balances ADD carried_forward_days real NULL;
    IF COL_LENGTH(N'dbo.leave_balances', N'adjustment_days') IS NULL
        ALTER TABLE dbo.leave_balances ADD adjustment_days real NULL;
END;

IF OBJECT_ID(N'dbo.payroll_runs', N'U') IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM sys.indexes
       WHERE object_id = OBJECT_ID(N'dbo.payroll_runs')
         AND name = N'payroll_runs_closed_cycle_unique_idx'
   )
    CREATE UNIQUE INDEX payroll_runs_closed_cycle_unique_idx
        ON dbo.payroll_runs(cycle_id)
        WHERE status = N'CLOSED';

COMMIT TRANSACTION;
GO
