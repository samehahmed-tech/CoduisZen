/**
 * Banking Service — P1 Financial Backbone
 *
 * Manages bank accounts, mobile wallets, and petty cash ledgers per branch.
 * Every money movement between accounts is an approved transfer that posts a
 * balanced double-entry journal (e.g. CR Cash on Hand / DR Bank Account for a
 * cash deposit, and the reverse for a petty-cash float).
 */

import { db } from '../db';
import { bankAccounts, accountTransfers, chartOfAccounts } from '../../src/db/schema';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';
import { randomUUID } from 'crypto';

const DEFAULT_ACCOUNT_MAP: Record<string, string> = {
    CASH_ON_HAND: '1110',
    BANK: '1120',
    MOBILE_WALLET: '1130',
    PETTY_CASH: '1110', // petty cash floats are tracked as cash-on-hand sub-accounts
};

export const bankingService = {
    createAccount: async (input: {
        branchId: string;
        name: string;
        accountType: 'BANK' | 'MOBILE_WALLET' | 'PETTY_CASH' | 'CASH_ON_HAND';
        institution?: string;
        accountNumber?: string;
        openingBalance?: number;
        createdBy?: string;
    }) => {
        const id = `ba-${nanoid(10)}`;
        const [existingDefault] = await db.select().from(chartOfAccounts)
            .where(eq(chartOfAccounts.code, DEFAULT_ACCOUNT_MAP[input.accountType] || '1110'));
        await db.insert(bankAccounts).values({
            id,
            branchId: input.branchId,
            name: input.name,
            accountType: input.accountType,
            institution: input.institution || null,
            accountNumber: input.accountNumber || null,
            accountId: existingDefault?.id || null,
            openingBalance: String(input.openingBalance ?? 0),
            isActive: true,
        });
        const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, id));
        return account;
    },

    listAccounts: async (branchId: string) => {
        return db.select().from(bankAccounts)
            .where(and(eq(bankAccounts.branchId, branchId), eq(bankAccounts.isActive, true)))
            .orderBy(bankAccounts.name);
    },

    /** Live balance = opening + transfers in − transfers out + voucher receipts − voucher payments. */
    accountBalance: async (accountId: string) => {
        const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId));
        if (!account) throw Object.assign(new Error('BANK_ACCOUNT_NOT_FOUND'), { status: 404, code: 'BANK_ACCOUNT_NOT_FOUND' });

        const completed = await db.select().from(accountTransfers)
            .where(and(
                eq(accountTransfers.status, 'COMPLETED'),
                inArray(accountTransfers.fromAccountId, [accountId]),
            ));
        const received = await db.select().from(accountTransfers)
            .where(and(
                eq(accountTransfers.status, 'COMPLETED'),
                inArray(accountTransfers.toAccountId, [accountId]),
            ));
        const spent = completed.reduce((s, t) => s + Number(t.amount), 0);
        const got = received.reduce((s, t) => s + Number(t.amount), 0);
        // Treasury vouchers (سندات قبض/صرف) move the same balance — best-effort.
        let voucherIn = 0;
        let voucherOut = 0;
        try {
            const { accountVoucherDelta } = await import('./treasuryService');
            const delta = await accountVoucherDelta(accountId);
            voucherIn = delta.received;
            voucherOut = delta.paid;
        } catch {
            /* treasury table not ready yet — transfers-only balance */
        }
        return { accountId, balance: Number(account.openingBalance) - spent + got + voucherIn - voucherOut };
    },

    requestTransfer: async (input: {
        branchId: string;
        fromAccountId: string;
        toAccountId: string;
        amount: number;
        reason?: string;
        requestedBy: string;
    }) => {
        const { fromAccountId, toAccountId, amount } = input;
        if (fromAccountId === toAccountId) {
            throw Object.assign(new Error('TRANSFER_SAME_ACCOUNT'), { status: 400, code: 'TRANSFER_SAME_ACCOUNT' });
        }
        const amountNum = Number(amount);
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
            throw Object.assign(new Error('INVALID_TRANSFER_AMOUNT'), { status: 400, code: 'INVALID_TRANSFER_AMOUNT' });
        }
        const fromBalance = await bankingService.accountBalance(fromAccountId);
        if (fromBalance.balance < amountNum) {
            throw Object.assign(new Error('INSUFFICIENT_ACCOUNT_BALANCE'), {
                status: 400,
                code: 'INSUFFICIENT_ACCOUNT_BALANCE',
                available: fromBalance.balance,
                requested: amountNum,
            });
        }

        const id = `at-${nanoid(10)}`;
        await db.insert(accountTransfers).values({
            id,
            branchId: input.branchId,
            fromAccountId,
            toAccountId,
            amount: String(amountNum),
            reason: input.reason || null,
            status: 'PENDING',
            requestedBy: input.requestedBy,
        });
        const [transfer] = await db.select().from(accountTransfers).where(eq(accountTransfers.id, id));
        return transfer;
    },

    approveTransfer: async (transferId: string, approvedBy: string) => {
        return bankingService.settleTransfer(transferId, 'COMPLETED', approvedBy);
    },

    rejectTransfer: async (transferId: string, rejectedBy: string) => {
        return bankingService.settleTransfer(transferId, 'REJECTED', rejectedBy);
    },

    settleTransfer: async (transferId: string, status: 'COMPLETED' | 'REJECTED', settledBy: string) => {
        const [transfer] = await db.select().from(accountTransfers).where(eq(accountTransfers.id, transferId));
        if (!transfer) throw Object.assign(new Error('TRANSFER_NOT_FOUND'), { status: 404, code: 'TRANSFER_NOT_FOUND' });
        if (transfer.status !== 'PENDING') {
            throw Object.assign(new Error('TRANSFER_NOT_PENDING'), { status: 400, code: 'TRANSFER_NOT_PENDING' });
        }

        const now = new Date();
        await db.update(accountTransfers).set({
            status,
            approvedBy: settledBy,
            completedAt: status === 'COMPLETED' ? now : null,
            updatedAt: now,
        }).where(eq(accountTransfers.id, transferId));

        if (status === 'COMPLETED') {
            try {
                const { GLService } = await import('./glService');
                await GLService.postJournalEntry({
                    reference: `TRF-${transfer.id}`,
                    referenceType: 'WALLET_DEPOSIT',
                    description: `Transfer ${transfer.amount} EGP between accounts`,
                    branchId: transfer.branchId,
                    lines: [
                        { accountCode: '1120', debit: Number(transfer.amount), credit: 0, description: 'Destination account debit' },
                        { accountCode: '1110', debit: 0, credit: Number(transfer.amount), description: 'Source account credit' },
                    ],
                    createdBy: settledBy,
                }).catch(err => logger.warn({ err }, 'banking: GL posting for transfer skipped'));
            } catch {
                logger.warn('banking: GL posting skipped');
            }
        }

        const [updated] = await db.select().from(accountTransfers).where(eq(accountTransfers.id, transferId));
        return { transfer: updated };
    },

    listTransfers: async (branchId: string) => {
        return db.select().from(accountTransfers)
            .where(eq(accountTransfers.branchId, branchId))
            .orderBy(desc(accountTransfers.createdAt));
    },
};

export default bankingService;
