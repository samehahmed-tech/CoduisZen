import { db, pool } from '../db';
import { customerWallets, walletTransactions, loyaltyLedger, customers, auditLogs } from '../../src/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { GLService } from './glService';

let walletSchemaPromise: Promise<void> | undefined;

const ensureWalletSchema = async () => {
    if (!walletSchemaPromise) {
        walletSchemaPromise = pool.query(`
            IF OBJECT_ID(N'dbo.wallet_transactions', N'U') IS NOT NULL
               AND COL_LENGTH(N'dbo.wallet_transactions', N'branch_id') IS NULL
                ALTER TABLE dbo.wallet_transactions ADD branch_id nvarchar(255) NULL;

            IF OBJECT_ID(N'dbo.customer_wallets', N'U') IS NOT NULL
               AND COL_LENGTH(N'dbo.customer_wallets', N'branch_id') IS NULL
                ALTER TABLE dbo.customer_wallets ADD branch_id nvarchar(255) NULL;

            IF OBJECT_ID(N'dbo.customer_wallets', N'U') IS NOT NULL
               AND COL_LENGTH(N'dbo.customer_wallets', N'branch_id') IS NOT NULL
                EXEC(N'IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N''customer_wallets_customer_branch_uq'' AND object_id = OBJECT_ID(N''dbo.customer_wallets''))
                      AND NOT EXISTS (SELECT customer_id, branch_id FROM dbo.customer_wallets WHERE branch_id IS NOT NULL GROUP BY customer_id, branch_id HAVING COUNT(*) > 1)
                    CREATE UNIQUE INDEX customer_wallets_customer_branch_uq ON dbo.customer_wallets(customer_id, branch_id) WHERE branch_id IS NOT NULL');
        `).then(() => undefined).catch((error) => {
            walletSchemaPromise = undefined;
            throw error;
        });
    }
    await walletSchemaPromise;
};

export const walletService = {

    async ensureWalletSchema() {
        await ensureWalletSchema();
    },

    async getOrCreateWallet(customerId: string, branchId?: string, executor: any = db) {
        let [wallet] = await executor.select().from(customerWallets).where(and(
            eq(customerWallets.customerId, customerId),
            ...(branchId ? [eq(customerWallets.branchId, branchId)] : []),
        ));
        if (!wallet) {
            const walletId = `WLT-${customerId}-${branchId || 'GLOBAL'}-${Date.now()}`;
            [wallet] = await executor.insert(customerWallets).output().values({
                id: walletId,
                customerId,
                branchId,
                balance: 0,
            });
        }
        return wallet;
    },

    async depositCredit(customerId: string, amount: number, referenceId: string, branchId?: string, paymentMethod?: string) {
        if (amount <= 0) throw new Error("Deposit amount must be positive");
        if (!branchId) throw new Error('WALLET_BRANCH_REQUIRED');
        await this.ensureWalletSchema();
        
        return await db.transaction(async (tx) => {
            const wallet = await this.getOrCreateWallet(customerId, branchId, tx);
            
            // 1. Update Balance
            const [updatedWallet] = await tx.update(customerWallets)
                .set({
                    balance: sql`balance + ${amount}`,
                    lastUpdated: new Date()
                })
                .output()
                .where(eq(customerWallets.id, wallet.id));
            
            // 2. Log Wallet Transaction
            await tx.insert(walletTransactions).values({
                walletId: wallet.id,
                branchId,
                amount: amount,
                type: 'DEPOSIT',
                referenceId,
                notes: `Deposit via ${paymentMethod || 'Manual'}`,
                createdAt: new Date(),
            });
            
            // 3. Update GL Liability: We collected Cash, so Debit Cash, Credit Unearned Revenue
            const posting = await GLService.postJournalEntry({
                reference: referenceId,
                referenceType: 'WALLET_DEPOSIT',
                description: `Customer Wallet Deposit for ${customerId}`,
                branchId,
                createdBy: 'system',
                actorId: 'system',
                source: 'WALLET_DEPOSIT',
                correlationId: `WALLET_DEPOSIT:${referenceId}`,
                lines: [
                    { accountCode: '1110', debit: amount, credit: 0, description: 'Cash Received to Wallet' },
                    { accountCode: '2410', debit: 0, credit: amount, description: 'Customer Wallet Liability' }
                ]
            });
            if (!posting || typeof posting === 'string') throw new Error('WALLET_GL_POSTING_FAILED');
            
            return updatedWallet;
        });
    },

    /**
     * Executes the Hybrid Option:
     * Withdraws wallet balance, creates an Unearned Revenue GL clearing entry, 
     * but returns the amount to be used as a 100% UI Discount on the actual Order invoice.
     */
    async pullForPayment(customerId: string, amountToPull: number, orderId: string, branchId?: string) {
        if (amountToPull <= 0) return 0;
        if (!branchId) throw new Error('WALLET_BRANCH_REQUIRED');
        await this.ensureWalletSchema();

        return await db.transaction(async (tx) => {
            const [wallet] = await tx.select().from(customerWallets).where(and(
                eq(customerWallets.customerId, customerId),
                eq(customerWallets.branchId, branchId),
            ));
            if (!wallet) return 0;
            
            const available = wallet.balance;
            if (available <= 0) return 0;
            
            const deduction = Math.min(available, amountToPull);
            
            // 1. Deduct Balance
            await tx.update(customerWallets)
                .set({ balance: sql`balance - ${deduction}`, lastUpdated: new Date() })
                .where(eq(customerWallets.id, wallet.id));
                
            // 2. Log Transaction
            await tx.insert(walletTransactions).values({
                walletId: wallet.id,
                branchId,
                amount: -deduction,
                type: 'PAYMENT',
                referenceId: orderId,
                notes: 'Payment towards order',
                createdAt: new Date(),
            });
            
            // 3. GL Entry (Hybrid Mode): We clear the Liability in GL to offset the fact that the POS 
            // will just record it as a "discount" or bypass cash collection.
            // Debit Wallet Liability (2410), Credit Revenue/Sales or offset the discount.
            // Actually, if it's treated as a discount on the invoice entirely, Sales won't match cost!
            // Best standard: Refund the Liability to Cash (internal abstraction), or directly map to Sales so the discount is neutralized.
            const posting = await GLService.postJournalEntry({
                reference: orderId,
                referenceType: 'WALLET_PAYMENT',
                description: `Wallet Payment applied to Order`,
                branchId,
                createdBy: 'system',
                actorId: 'system',
                source: 'WALLET_PAYMENT',
                correlationId: `WALLET_PAYMENT:${orderId}`,
                lines: [
                    { accountCode: '2410', debit: deduction, credit: 0, description: 'Wallet Liability Cleared' },
                    { accountCode: '4110', debit: 0, credit: deduction, description: 'Revenue Offset from Wallet' } // Credit sales since we discounted the invoice directly
                ]
            });
            if (!posting || typeof posting === 'string') throw new Error('WALLET_GL_POSTING_FAILED');
            
            return deduction; // This is returned to POS to act as a discount line!
        });
    }
};
