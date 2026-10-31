import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('SQL Server repair contract', () => {
    it('repairs columns introduced by current financial, CRM, attendance, and payroll flows', () => {
        const repair = fs.readFileSync('scripts/sqlserver-schema-repair.sql', 'utf8');
        expect(repair).toContain("COL_LENGTH(N'dbo.orders', N'coupon_usage_released_at') IS NULL");
        expect(repair).toContain("COL_LENGTH(N'dbo.customers', N'marketing_push_opt_in') IS NULL");
        expect(repair).toContain("COL_LENGTH('dbo.attendance_policies', 'minimum_rest_minutes') IS NULL");
        expect(repair).toContain("COL_LENGTH(N'dbo.overtime_entries', N'overtime_amount') IS NULL");
        expect(repair).toContain("COL_LENGTH(N'dbo.overtime_entries', N'overtime_rate') IS NULL");
        expect(repair).toContain("COL_LENGTH(N'dbo.payroll_run_lines', N'overtime_amount') IS NULL");
        expect(repair).toContain("COL_LENGTH(N'dbo.refund_records', N'rejection_reason') IS NULL");
        expect(repair).toContain("COL_LENGTH(N'dbo.refund_records', N'refund_method') IS NULL");
        expect(repair).toContain("COL_LENGTH(N'dbo.refund_records', N'approved_at') IS NULL");
        expect(repair).toContain("COL_LENGTH(N'dbo.refund_records', N'processed_at') IS NULL");
        expect(repair).toContain("COL_LENGTH(N'dbo.loyalty_ledger', N'branch_id') IS NULL");
        expect(repair).toContain("COL_LENGTH(N'dbo.wallet_transactions', N'branch_id') IS NULL");
        expect(repair).toContain("COL_LENGTH(N'dbo.customer_wallets', N'branch_id') IS NULL");
        expect(repair).toContain('customer_wallets_customer_branch_uq');
        expect(repair).toContain("COL_LENGTH('dbo.coupons', 'branch_id') IS NULL");
    });

    it('uses compatibility guards for legacy defaults and unsupported max-length index keys', () => {
        const repair = fs.readFileSync('scripts/sqlserver-schema-repair.sql', 'utf8');
        expect(repair).toContain('is_identity = 0');
        expect(repair).toContain('max_length BETWEEN 1 AND 900');
        expect(repair).toContain("EXEC(N'UPDATE dbo.attendance_policies");
    });
});
