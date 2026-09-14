/**
 * Treasury Service — محاسب الخزينة
 *
 * First-class cash/treasury vouchers (سندات قبض وصرف) that move real
 * account balances with maker/checker approval:
 * - RECEIPT (قبض): COLLECTION تحصيل, CUSTODY_SETTLEMENT تسوية عهدة, OTHER
 * - PAYMENT (صرف): SUPPLIER_PAYMENT سداد مورد, SUPPLIER_ADVANCE دفعة مقدمة,
 *   EXPENSE مصروف, CUSTODY_ISSUE صرف عهدة, SALARY راتب/سلفة, OTHER
 *
 * COMPLETED vouchers feed bankingService.accountBalance, supplier invoice
 * balances (amountPaid/status), and per-holder custody outstanding.
 */

import { db, pool } from '../db';
import {
    treasuryVouchers,
    bankAccounts,
    supplierInvoices,
    supplierPayments,
} from '../../src/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';
import { bankingService } from './bankingService';

export type VoucherKind = 'RECEIPT' | 'PAYMENT';
export type VoucherCategory =
    | 'SUPPLIER_PAYMENT' | 'SUPPLIER_ADVANCE' | 'EXPENSE'
    | 'CUSTODY_ISSUE' | 'CUSTODY_SETTLEMENT'
    | 'COLLECTION' | 'SALARY' | 'OTHER';
export type VoucherStatus = 'PENDING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

const CASH_CODE_BY_TYPE: Record<string, string> = {
    CASH_ON_HAND: '1110',
    PETTY_CASH: '1110',
    BANK: '1120',
    MOBILE_WALLET: '1130',
};

let schemaReady = false;

export const ensureTreasurySchema = async () => {
    if (schemaReady) return;
    await pool.query(`
        IF OBJECT_ID('dbo.treasury_vouchers', 'U') IS NULL
        CREATE TABLE dbo.treasury_vouchers (
            id nvarchar(255) NOT NULL PRIMARY KEY,
            branch_id nvarchar(255) NULL,
            voucher_no int IDENTITY(1,1) NOT NULL,
            kind nvarchar(50) NULL,
            category nvarchar(50) NULL,
            account_id nvarchar(255) NULL,
            amount real NULL,
            supplier_id nvarchar(255) NULL,
            invoice_id nvarchar(255) NULL,
            holder_user_id nvarchar(255) NULL,
            holder_name nvarchar(max) NULL,
            expense_account_code nvarchar(50) NULL,
            description nvarchar(max) NULL,
            payment_method nvarchar(50) NULL,
            reference nvarchar(max) NULL,
            status nvarchar(50) NULL DEFAULT 'PENDING',
            requested_by nvarchar(255) NULL,
            approved_by nvarchar(255) NULL,
            completed_at datetime2 NULL,
            created_at datetime2 NOT NULL DEFAULT GETDATE(),
            updated_at datetime2 NOT NULL DEFAULT GETDATE()
        );
    `);
    await pool.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'treasury_vouchers_branch_idx' AND object_id = OBJECT_ID('dbo.treasury_vouchers'))
            CREATE INDEX treasury_vouchers_branch_idx ON dbo.treasury_vouchers(branch_id, status);
    `);
    await pool.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'treasury_vouchers_account_idx' AND object_id = OBJECT_ID('dbo.treasury_vouchers'))
            CREATE INDEX treasury_vouchers_account_idx ON dbo.treasury_vouchers(account_id);
    `);
    schemaReady = true;
};

const fail = (code: string, message: string, status = 400, extra: Record<string, any> = {}) => {
    throw Object.assign(new Error(message), { status, code, ...extra });
};

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Net voucher delta for one account (COMPLETED only). Best-effort: 0 when table missing. */
export const accountVoucherDelta = async (accountId: string): Promise<{ received: number; paid: number }> => {
    try {
        await ensureTreasurySchema();
        const rows = await db.select({
            kind: treasuryVouchers.kind,
            amount: treasuryVouchers.amount,
        }).from(treasuryVouchers).where(and(
            eq(treasuryVouchers.accountId, accountId),
            eq(treasuryVouchers.status, 'COMPLETED'),
        ));
        let received = 0;
        let paid = 0;
        for (const r of rows) {
            if (String(r.kind) === 'RECEIPT') received += num(r.amount);
            else paid += num(r.amount);
        }
        return { received, paid };
    } catch {
        return { received: 0, paid: 0 };
    }
};

export const treasuryService = {
    ensure: ensureTreasurySchema,

    createVoucher: async (input: {
        branchId: string;
        kind: VoucherKind;
        category: VoucherCategory;
        accountId: string;
        amount: number;
        supplierId?: string;
        invoiceId?: string;
        holderUserId?: string;
        holderName?: string;
        expenseAccountCode?: string;
        description?: string;
        paymentMethod?: string;
        reference?: string;
        requestedBy?: string;
    }) => {
        await ensureTreasurySchema();
        const amount = Number(input.amount);
        if (!Number.isFinite(amount) || amount <= 0) fail('INVALID_AMOUNT', 'Amount must be positive');
        if (!input.accountId) fail('ACCOUNT_REQUIRED', 'Treasury account is required');

        const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, input.accountId));
        if (!account || account.isActive === false) fail('ACCOUNT_NOT_FOUND', 'Treasury account not found', 404);
        if (input.branchId && account.branchId && account.branchId !== input.branchId) {
            fail('BRANCH_MISMATCH', 'Account belongs to another branch', 403);
        }

        if ((input.category === 'SUPPLIER_PAYMENT' || input.category === 'SUPPLIER_ADVANCE') && !input.supplierId) {
            fail('SUPPLIER_REQUIRED', 'Supplier is required for supplier vouchers');
        }
        if (input.category === 'SUPPLIER_PAYMENT' && !input.invoiceId) {
            fail('INVOICE_REQUIRED', 'Invoice is required for supplier payments (use advance without invoice)');
        }
        if (input.category === 'CUSTODY_ISSUE' && !input.holderUserId && !input.holderName) {
            fail('HOLDER_REQUIRED', 'Custody holder is required');
        }
        if (input.kind !== 'RECEIPT' && input.kind !== 'PAYMENT') {
            fail('INVALID_KIND', 'Kind must be RECEIPT or PAYMENT');
        }

        // Invoice guard for direct payments
        if (input.invoiceId) {
            const [inv] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, input.invoiceId));
            if (!inv) fail('INVOICE_NOT_FOUND', 'Supplier invoice not found', 404);
            if (input.supplierId && inv.supplierId !== input.supplierId) {
                fail('SUPPLIER_MISMATCH', 'Invoice belongs to another supplier', 400);
            }
            const remaining = num(inv.total) - num(inv.amountPaid);
            if (remaining <= 0) fail('INVOICE_ALREADY_PAID', 'Invoice is already fully paid', 400);
            if (amount - remaining > 0.009) {
                fail('AMOUNT_EXCEEDS_REMAINING', `Amount exceeds remaining balance (${remaining.toFixed(2)})`, 400, { remaining });
            }
        }

        const id = `tv-${nanoid(10)}`;
        await db.insert(treasuryVouchers).values({
            id,
            branchId: input.branchId,
            kind: input.kind,
            category: input.category,
            accountId: input.accountId,
            amount: String(amount),
            supplierId: input.supplierId || null,
            invoiceId: input.invoiceId || null,
            holderUserId: input.holderUserId || null,
            holderName: input.holderName || null,
            expenseAccountCode: input.expenseAccountCode || null,
            description: input.description || null,
            paymentMethod: input.paymentMethod || 'CASH',
            reference: input.reference || null,
            status: 'PENDING',
            requestedBy: input.requestedBy || null,
        });
        const [row] = await db.select().from(treasuryVouchers).where(eq(treasuryVouchers.id, id));
        return row;
    },

    approveVoucher: async (id: string, approvedBy?: string) => {
        await ensureTreasurySchema();
        const [v] = await db.select().from(treasuryVouchers).where(eq(treasuryVouchers.id, id));
        if (!v) fail('VOUCHER_NOT_FOUND', 'Voucher not found', 404);
        if (v.status !== 'PENDING') fail('VOUCHER_NOT_PENDING', 'Only pending vouchers can be approved', 400);

        // Balance guard for payments (live balance incl. vouchers + transfers)
        if (v.kind === 'PAYMENT') {
            const bal = await bankingService.accountBalance(String(v.accountId));
            if (bal.balance < num(v.amount) - 0.009) {
                fail('INSUFFICIENT_ACCOUNT_BALANCE', 'Insufficient treasury balance', 400, {
                    available: bal.balance, requested: num(v.amount),
                });
            }
        }

        const now = new Date();
        await db.update(treasuryVouchers).set({
            status: 'COMPLETED', approvedBy: approvedBy || null, completedAt: now, updatedAt: now,
        }).where(eq(treasuryVouchers.id, id));

        // Side effects (best-effort, never roll back the approval itself)
        try {
            if ((v.category === 'SUPPLIER_PAYMENT' || v.category === 'SUPPLIER_ADVANCE') && v.supplierId) {
                await db.insert(supplierPayments).values({
                    id: `sp-${nanoid(10)}`,
                    supplierId: String(v.supplierId),
                    invoiceId: v.invoiceId ? String(v.invoiceId) : null,
                    amount: num(v.amount),
                    paymentMethod: String(v.paymentMethod || 'CASH'),
                    reference: v.reference ? String(v.reference) : `TV-${id}`,
                    status: 'COMPLETED',
                    createdBy: approvedBy || null,
                    createdAt: now,
                });
                if (v.invoiceId) {
                    const [inv] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, String(v.invoiceId)));
                    if (inv) {
                        const paid = num(inv.amountPaid) + num(v.amount);
                        const total = num(inv.total);
                        await db.update(supplierInvoices).set({
                            amountPaid: paid,
                            status: paid >= total - 0.009 ? 'PAID' : 'PARTIAL',
                            updatedAt: now,
                        }).where(eq(supplierInvoices.id, String(v.invoiceId)));
                    }
                }
            }
        } catch (err) {
            logger.warn({ err, voucherId: id }, 'treasury: supplier linkage skipped');
        }

        // GL posting (best-effort — failures land in the finance exception queue)
        try {
            const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, String(v.accountId)));
            const cashCode = CASH_CODE_BY_TYPE[String(account?.accountType)] || '1110';
            const amountNum = num(v.amount);
            const isPayment = v.kind === 'PAYMENT';
            let debitCode = '5200';
            if (v.category === 'EXPENSE' && v.expenseAccountCode) debitCode = String(v.expenseAccountCode);
            else if (v.category === 'SUPPLIER_PAYMENT' || v.category === 'SUPPLIER_ADVANCE') debitCode = '2110';
            else if (v.category === 'CUSTODY_ISSUE') debitCode = '1140';
            else if (v.category === 'CUSTODY_SETTLEMENT' || v.category === 'COLLECTION') debitCode = cashCode;

            const { GLService } = await import('./glService');
            const { chartOfAccounts } = await import('../../src/db/schema');
            const codes = await db.select({ code: chartOfAccounts.code }).from(chartOfAccounts)
                .where(sql`${chartOfAccounts.code} IN (${debitCode}, ${cashCode})`);
            const found = new Set(codes.map((c: any) => String(c.code)));
            if (found.has(debitCode) && found.has(cashCode) && debitCode !== cashCode) {
                const ref = `TV-${String((v as any).voucherNo || id)}`;
                await GLService.postJournalEntry({
                    reference: ref,
                    referenceType: 'TREASURY_VOUCHER',
                    description: `${isPayment ? 'صرف' : 'قبض'} ${amountNum} — ${String(v.description || v.category)}`,
                    branchId: v.branchId ? String(v.branchId) : undefined,
                    lines: isPayment
                        ? [
                            { accountCode: debitCode, debit: amountNum, credit: 0, description: String(v.category) },
                            { accountCode: cashCode, debit: 0, credit: amountNum, description: 'Treasury cash' },
                        ]
                        : [
                            { accountCode: cashCode, debit: amountNum, credit: 0, description: 'Treasury cash' },
                            { accountCode: debitCode, debit: 0, credit: amountNum, description: String(v.category) },
                        ],
                    createdBy: approvedBy,
                }).catch((err: any) => logger.warn({ err }, 'treasury: GL posting skipped'));
            }
        } catch {
            logger.warn('treasury: GL posting skipped');
        }

        const [updated] = await db.select().from(treasuryVouchers).where(eq(treasuryVouchers.id, id));
        return updated;
    },

    rejectVoucher: async (id: string, rejectedBy?: string) => {
        await ensureTreasurySchema();
        const [v] = await db.select().from(treasuryVouchers).where(eq(treasuryVouchers.id, id));
        if (!v) fail('VOUCHER_NOT_FOUND', 'Voucher not found', 404);
        if (v.status !== 'PENDING') fail('VOUCHER_NOT_PENDING', 'Only pending vouchers can be rejected', 400);
        const now = new Date();
        await db.update(treasuryVouchers).set({
            status: 'REJECTED', approvedBy: rejectedBy || null, updatedAt: now,
        }).where(eq(treasuryVouchers.id, id));
        const [updated] = await db.select().from(treasuryVouchers).where(eq(treasuryVouchers.id, id));
        return updated;
    },

    cancelVoucher: async (id: string) => {
        await ensureTreasurySchema();
        const [v] = await db.select().from(treasuryVouchers).where(eq(treasuryVouchers.id, id));
        if (!v) fail('VOUCHER_NOT_FOUND', 'Voucher not found', 404);
        if (v.status !== 'PENDING') fail('VOUCHER_NOT_PENDING', 'Only pending vouchers can be cancelled', 400);
        await db.update(treasuryVouchers).set({ status: 'CANCELLED', updatedAt: new Date() })
            .where(eq(treasuryVouchers.id, id));
        const [updated] = await db.select().from(treasuryVouchers).where(eq(treasuryVouchers.id, id));
        return updated;
    },

    listVouchers: async (branchId: string, filters: { kind?: string; category?: string; status?: string; accountId?: string; limit?: number } = {}) => {
        await ensureTreasurySchema();
        const conds = [eq(treasuryVouchers.branchId, branchId)];
        if (filters.kind) conds.push(eq(treasuryVouchers.kind, filters.kind));
        if (filters.category) conds.push(eq(treasuryVouchers.category, filters.category));
        if (filters.status) conds.push(eq(treasuryVouchers.status, filters.status));
        if (filters.accountId) conds.push(eq(treasuryVouchers.accountId, filters.accountId));
        const rows = await db.select().from(treasuryVouchers)
            .where(and(...conds))
            .orderBy(desc(treasuryVouchers.createdAt))
            .limit(Math.min(Number(filters.limit) || 100, 500));
        return rows;
    },

    /** Outstanding custody per holder: issues − settlements (COMPLETED only). */
    custodyOutstanding: async (branchId: string) => {
        await ensureTreasurySchema();
        const rows = await db.select().from(treasuryVouchers).where(and(
            eq(treasuryVouchers.branchId, branchId),
            eq(treasuryVouchers.status, 'COMPLETED'),
            sql`${treasuryVouchers.category} IN ('CUSTODY_ISSUE', 'CUSTODY_SETTLEMENT')`,
        ));
        const map = new Map<string, { holderUserId: string | null; holderName: string; issued: number; settled: number }>();
        for (const r of rows) {
            const key = String(r.holderUserId || r.holderName || 'unknown');
            const cur = map.get(key) || { holderUserId: r.holderUserId as any, holderName: String(r.holderName || r.holderUserId || '—'), issued: 0, settled: 0 };
            if (r.category === 'CUSTODY_ISSUE') cur.issued += num(r.amount);
            else cur.settled += num(r.amount);
            map.set(key, cur);
        }
        return Array.from(map.values())
            .map((c) => ({ ...c, outstanding: c.issued - c.settled }))
            .filter((c) => Math.abs(c.outstanding) > 0.009)
            .sort((a, b) => b.outstanding - a.outstanding);
    },

    /** Supplier statement: invoices with remaining + payments + unapplied advances. */
    supplierStatement: async (supplierId: string) => {
        const [invoices, payments] = await Promise.all([
            db.select().from(supplierInvoices).where(eq(supplierInvoices.supplierId, supplierId)).orderBy(desc(supplierInvoices.createdAt)),
            db.select().from(supplierPayments).where(eq(supplierPayments.supplierId, supplierId)).orderBy(desc(supplierPayments.createdAt)),
        ]);
        const billed = invoices.reduce((s, i: any) => s + num(i.total), 0);
        const paidOnInvoices = invoices.reduce((s, i: any) => s + num(i.amountPaid), 0);
        const advancePayments = payments.filter((p: any) => !p.invoiceId);
        const unappliedAdvances = advancePayments.reduce((s, p: any) => s + num(p.amount), 0);
        return {
            invoices: invoices.map((i: any) => ({ ...i, remaining: num(i.total) - num(i.amountPaid) })),
            payments: payments.slice(0, 100),
            totals: {
                billed,
                paid: paidOnInvoices,
                unappliedAdvances,
                balanceDue: billed - paidOnInvoices,
            },
        };
    },

    overview: async (branchId: string) => {
        await ensureTreasurySchema();
        const accounts = await bankingService.listAccounts(branchId);
        const withBalances = await Promise.all(accounts.map(async (a: any) => {
            try {
                const b = await bankingService.accountBalance(a.id);
                return { ...a, balance: b.balance };
            } catch {
                return { ...a, balance: num(a.openingBalance) };
            }
        }));
        const [pendingTransfers, pendingVouchers, custody] = await Promise.all([
            bankingService.listTransfers(branchId).then((t) => t.filter((x: any) => x.status === 'PENDING')).catch(() => []),
            treasuryService.listVouchers(branchId, { status: 'PENDING', limit: 100 }).catch(() => []),
            treasuryService.custodyOutstanding(branchId).catch(() => []),
        ]);
        const today = new Date().toISOString().slice(0, 10);
        const todays = await treasuryService.listVouchers(branchId, { status: 'COMPLETED', limit: 500 }).catch(() => []);
        let todayIn = 0;
        let todayOut = 0;
        for (const v of todays as any[]) {
            const day = String(v.completedAt || v.createdAt || '').slice(0, 10);
            if (day !== today) continue;
            if (v.kind === 'RECEIPT') todayIn += num(v.amount);
            else todayOut += num(v.amount);
        }
        const totalBalance = withBalances.reduce((s, a: any) => s + num(a.balance), 0);
        return {
            accounts: withBalances,
            totalBalance,
            pendingTransfers,
            pendingVouchers,
            custodyOutstanding: custody,
            custodyTotal: custody.reduce((s, c) => s + c.outstanding, 0),
            todayIn,
            todayOut,
        };
    },
};

export default treasuryService;
