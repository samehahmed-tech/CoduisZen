import { db } from '../db';
import { customerWallets, walletTransactions, loyaltyLedger, customers, auditLogs } from '../../src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { GLService } from './glService';
import logger from '../utils/logger';

const log = logger.child({ service: 'wallet' });

export const walletService = {

    async getOrCreateWallet(customerId: string) {
        let [wallet] = await db.select().from(customerWallets).where(eq(customerWallets.customerId, customerId));
        if (!wallet) {
            const walletId = `WLT-${customerId}-${Date.now()}`;
            [wallet] = await db.insert(customerWallets).output().values({
                id: walletId,
                customerId,
                balance: 0,
            });
        }
        return wallet;
    },

    async depositCredit(customerId: string, amount: number, referenceId: string, branchId?: string, paymentMethod?: string) {
        if (amount <= 0) throw new Error("Deposit amount must be positive");
        
        return await db.transaction(async (tx) => {
            const wallet = await this.getOrCreateWallet(customerId);
            
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
                amount: amount,
                type: 'DEPOSIT',
                referenceId,
                notes: `Deposit via ${paymentMethod || 'Manual'}`,
                createdAt: new Date(),
            });
            
            // 3. Update GL Liability: We collected Cash, so Debit Cash, Credit Unearned Revenue
            try {
                // Determine cash account based on payment method (assuming config handles this)
                // For simplicity, let's debit Main Cash (1110) or Bank (1130) and credit Wallet Liability (2410)
                await GLService.postJournalEntry({
                    reference: referenceId,
                    referenceType: 'WALLET_DEPOSIT',
                    description: `Customer Wallet Deposit for ${customerId}`,
                    branchId,
                    createdBy: 'system',
                    lines: [
                        { accountCode: '1110', debit: amount, credit: 0, description: 'Cash Received to Wallet' },
                        { accountCode: '2410', debit: 0, credit: amount, description: 'Customer Wallet Liability' }
                    ]
                });
            } catch (err) {
                log.warn({ err }, "Could not post GL for wallet deposit");
            }
            
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

        return await db.transaction(async (tx) => {
            const [wallet] = await tx.select().from(customerWallets).where(eq(customerWallets.customerId, customerId));
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
            try {
                await GLService.postJournalEntry({
                    reference: orderId,
                    referenceType: 'WALLET_PAYMENT',
                    description: `Wallet Payment applied to Order`,
                    branchId,
                    createdBy: 'system',
                    lines: [
                        { accountCode: '2410', debit: deduction, credit: 0, description: 'Wallet Liability Cleared' },
                        { accountCode: '4110', debit: 0, credit: deduction, description: 'Revenue Offset from Wallet' } // Credit sales since we discounted the invoice directly
                    ]
                });
            } catch (err) {
                log.warn({ err }, "Could not post GL for wallet payment");
            }
            
            return deduction; // This is returned to POS to act as a discount line!
        });
    }
};
