import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import {
    customers,
    customerAddresses,
    orders,
    giftCards,
    loyaltyLedger,
    customerWallets,
    walletTransactions,
} from '../../src/db/schema';

const tierForPoints = (points: number) => {
    if (points >= 5000) return 'Platinum';
    if (points >= 2000) return 'Gold';
    if (points >= 1000) return 'Silver';
    return 'Bronze';
};

export type CustomerMergeResult = {
    mergeId: string;
    sourceCustomerId: string;
    targetCustomerId: string;
    moved: {
        orders: number;
        addresses: number;
        giftCards: number;
        loyaltyEntries: number;
        walletBalance: number;
    };
};

/**
 * Merge a duplicate customer into a canonical target without hard-deleting
 * anything. All foreign-key ownership changes and balance transfers are one
 * transaction so a failure cannot leave a half-merged customer.
 */
export const mergeCustomers = async (sourceCustomerId: string, targetCustomerId: string): Promise<CustomerMergeResult> => {
    if (!sourceCustomerId || !targetCustomerId || sourceCustomerId === targetCustomerId) {
        throw Object.assign(new Error('INVALID_CUSTOMER_MERGE'), { code: 'INVALID_CUSTOMER_MERGE', status: 400 });
    }

    return db.transaction(async (tx) => {
        const [source] = await tx.select().top(1).from(customers).where(and(
            eq(customers.id, sourceCustomerId),
            isNull(customers.deletedAt),
        ));
        const [target] = await tx.select().top(1).from(customers).where(and(
            eq(customers.id, targetCustomerId),
            isNull(customers.deletedAt),
        ));
        if (!source || !target) {
            throw Object.assign(new Error('CUSTOMER_MERGE_CUSTOMER_NOT_FOUND'), { code: 'CUSTOMER_MERGE_CUSTOMER_NOT_FOUND', status: 404 });
        }

        const [sourceWallet] = await tx.select().top(1).from(customerWallets).where(eq(customerWallets.customerId, sourceCustomerId));
        const [targetWallet] = await tx.select().top(1).from(customerWallets).where(eq(customerWallets.customerId, targetCustomerId));
        const sourceWalletBalance = Number(sourceWallet?.balance || 0);
        const mergeId = `CUST-MERGE-${Date.now()}-${sourceCustomerId}-${targetCustomerId}`;

        const sourceOrders = await tx.select({ id: orders.id }).from(orders).where(eq(orders.customerId, sourceCustomerId));
        const sourceAddresses = await tx.select({ id: customerAddresses.id }).from(customerAddresses).where(eq(customerAddresses.customerId, sourceCustomerId));
        const sourceGiftCards = await tx.select({ id: giftCards.id }).from(giftCards).where(eq(giftCards.customerId, sourceCustomerId));
        const sourceLoyalty = await tx.select({ id: loyaltyLedger.id }).from(loyaltyLedger).where(eq(loyaltyLedger.customerId, sourceCustomerId));

        if (sourceWallet && targetWallet) {
            await tx.update(customerWallets)
                .set({ balance: sql`balance + ${sourceWalletBalance}`, lastUpdated: new Date() })
                .where(eq(customerWallets.id, targetWallet.id));
            await tx.update(customerWallets)
                .set({ balance: 0, lastUpdated: new Date() })
                .where(eq(customerWallets.id, sourceWallet.id));
            if (sourceWalletBalance !== 0) {
                await tx.insert(walletTransactions).values({
                    walletId: targetWallet.id,
                    amount: sourceWalletBalance,
                    type: 'ADJUSTMENT',
                    referenceId: mergeId,
                    notes: `Wallet balance transferred from merged customer ${sourceCustomerId}`,
                    createdAt: new Date(),
                });
                await tx.insert(walletTransactions).values({
                    walletId: sourceWallet.id,
                    amount: -sourceWalletBalance,
                    type: 'ADJUSTMENT',
                    referenceId: mergeId,
                    notes: `Wallet balance transferred to customer ${targetCustomerId}`,
                    createdAt: new Date(),
                });
            }
        } else if (sourceWallet && !targetWallet) {
            await tx.update(customerWallets)
                .set({ customerId: targetCustomerId, lastUpdated: new Date() })
                .where(eq(customerWallets.id, sourceWallet.id));
        }

        await tx.update(orders).set({ customerId: targetCustomerId }).where(eq(orders.customerId, sourceCustomerId));
        await tx.update(customerAddresses).set({ customerId: targetCustomerId }).where(eq(customerAddresses.customerId, sourceCustomerId));
        await tx.update(giftCards).set({ customerId: targetCustomerId, updatedAt: new Date() }).where(eq(giftCards.customerId, sourceCustomerId));
        await tx.update(loyaltyLedger).set({ customerId: targetCustomerId }).where(eq(loyaltyLedger.customerId, sourceCustomerId));

        const targetPoints = Number(target.loyaltyPoints || 0) + Number(source.loyaltyPoints || 0);
        await tx.update(customers).set({
            visits: Number(target.visits || 0) + Number(source.visits || 0),
            totalSpent: Number(target.totalSpent || 0) + Number(source.totalSpent || 0),
            loyaltyPoints: targetPoints,
            loyaltyTier: tierForPoints(targetPoints),
            email: target.email || source.email,
            address: target.address || source.address,
            notes: target.notes || source.notes,
            updatedAt: new Date(),
        }).where(eq(customers.id, targetCustomerId));

        await tx.update(customers).set({
            deletedAt: new Date(),
            updatedAt: new Date(),
        }).where(eq(customers.id, sourceCustomerId));

        return {
            mergeId,
            sourceCustomerId,
            targetCustomerId,
            moved: {
                orders: sourceOrders.length,
                addresses: sourceAddresses.length,
                giftCards: sourceGiftCards.length,
                loyaltyEntries: sourceLoyalty.length,
                walletBalance: sourceWalletBalance,
            },
        };
    });
};
