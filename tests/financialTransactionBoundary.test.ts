import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const glSource = readFileSync(
    fileURLToPath(new URL('../server/services/glService.ts', import.meta.url)),
    'utf8',
);
const walletSource = readFileSync(
    fileURLToPath(new URL('../server/services/walletService.ts', import.meta.url)),
    'utf8',
);
const customerControllerSource = readFileSync(
    fileURLToPath(new URL('../server/controllers/customerController.ts', import.meta.url)),
    'utf8',
);

describe('financial transaction boundary contract', () => {
    it('allows journal posting to reuse an existing transaction', () => {
        expect(glSource).toContain('static async postJournalEntry(input: JournalEntryInput, existingTx?: any)');
        expect(glSource).toContain('return existingTx ? execute(existingTx) : db.transaction(execute);');
    });

    it('keeps reversal posting and original status update in one transaction', () => {
        expect(glSource).toContain('}, tx);');
        expect(glSource).toContain(".set({ status: 'REVERSED' })");
    });

    it('scopes operational journal idempotency by branch', () => {
        expect(glSource).toContain('journalEntries.branchId} = ${input.branchId}');
        expect(glSource).toContain('eq(journalEntries.branchId, input.branchId)');
        expect(glSource).toContain('isNull(journalEntries.branchId)');
    });

    it('fails closed when wallet or loyalty financial movements lack a branch', () => {
        expect(glSource).toContain("'WALLET_DEPOSIT'");
        expect(glSource).toContain("'WALLET_PAYMENT'");
        expect(glSource).toContain("'LOYALTY_REDEMPTION'");
        expect(glSource).toContain('BRANCH_REQUIRED_FOR_OPERATIONAL_ENTRY');
    });

    it('does not commit wallet mutations when GL posting fails', () => {
        expect(walletSource).toContain("if (!branchId) throw new Error('WALLET_BRANCH_REQUIRED')");
        expect(walletSource).toContain("throw new Error('WALLET_GL_POSTING_FAILED')");
        expect(walletSource).not.toContain('Could not post GL for wallet deposit');
        expect(walletSource).not.toContain('Could not post GL for wallet payment');
    });

    it('creates a wallet through the caller transaction during deposit', () => {
        expect(walletSource).toContain('async getOrCreateWallet(customerId: string, branchId?: string, executor: any = db)');
        expect(walletSource).toContain('this.getOrCreateWallet(customerId, branchId, tx)');
        expect(walletSource).toContain('executor.insert(customerWallets)');
    });

    it('does not guess a branch for legacy wallet balances', () => {
        expect(customerControllerSource).toContain("scope: branchId ? 'BRANCH' : (wallet.branchId ? 'BRANCH' : 'GLOBAL_LEGACY')");
        expect(walletSource).toContain('customer_wallets_customer_branch_uq');
    });
});
