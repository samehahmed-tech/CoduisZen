/**
 * Loyalty & Rewards Service
 * Implements: Phase 2.8 (Loyalty System)
 * 
 * Manages points accumulation, tier upgrades, and reward redemption.
 */

import { db } from '../db';
import { customers, auditLogs, loyaltyLedger } from '../../src/db/schema';
import { eq, sql } from 'drizzle-orm';
import logger from '../utils/logger';

const log = logger.child({ service: 'loyalty' });

// Default config (could be moved to settings table)
const POINTS_PER_EGP = 0.1; // 1 point for every 10 EGP
const TIER_TRESHOLDS = {
    PLATINUM: 5000,
    GOLD: 2000,
    SILVER: 1000,
    BRONZE: 0
};

export const loyaltyService = {

    /**
     * Award points to a customer based on order total.
     */
    async awardPoints(customerId: string, orderTotal: number, branchId?: string) {
        try {
            const pointsToAdd = Math.floor(orderTotal * POINTS_PER_EGP);
            if (pointsToAdd <= 0) return;

            const [customer] = await db.select().top(1).from(customers).where(eq(customers.id, customerId));
            if (!customer) return;

            const newTotalPoints = Number(customer.loyaltyPoints || 0) + pointsToAdd;
            const newTotalSpent = Number(customer.totalSpent || 0) + orderTotal;
            const newVisits = Number(customer.visits || 0) + 1;

            // Determine new tier
            let newTier = 'Bronze';
            if (newTotalPoints >= TIER_TRESHOLDS.PLATINUM) newTier = 'Platinum';
            else if (newTotalPoints >= TIER_TRESHOLDS.GOLD) newTier = 'Gold';
            else if (newTotalPoints >= TIER_TRESHOLDS.SILVER) newTier = 'Silver';

            await db.transaction(async (tx) => {
                await tx.update(customers)
                    .set({
                        loyaltyPoints: newTotalPoints,
                        loyaltyTier: newTier,
                        totalSpent: newTotalSpent,
                        visits: newVisits,
                        updatedAt: new Date(),
                    })
                    .where(eq(customers.id, customerId));

                // 2. Strict Loyalty Ledger Log
                await tx.insert(loyaltyLedger).values({
                    customerId: customerId,
                    points: pointsToAdd,
                    type: 'EARNED',
                    referenceId: `ORD-AWD-${Date.now()}`,
                    notes: `Points awarded for spending ${orderTotal}`,
                    createdAt: new Date(),
                });

                // Audit Log
                await tx.insert(auditLogs).values({
                    eventType: 'LOYALTY_POINTS_AWARDED',
                    userId: 'system',
                    branchId,
                    payload: {
                        customerId,
                        pointsAwarded: pointsToAdd,
                        newTotalPoints,
                        orderTotal,
                        newTier
                    },
                    createdAt: new Date(),
                });
            });

            log.info({ customerId, pointsAwarded: pointsToAdd, newTier }, 'Loyalty points awarded');
        } catch (error: any) {
            log.error({ err: error.message, customerId }, 'Failed to award loyalty points');
        }
    },

    /**
     * Claw back points awarded for an order that was later cancelled or
     * refunded. Floor at zero; tier recomputed down. Best-effort, logged.
     */
    async clawbackPoints(customerId: string, orderTotal: number, orderId: string, branchId?: string) {
        try {
            const pointsToRemove = Math.floor(Number(orderTotal || 0) * POINTS_PER_EGP);
            if (pointsToRemove <= 0) return;

            const [customer] = await db.select().top(1).from(customers).where(eq(customers.id, customerId));
            if (!customer) return;

            const currentPoints = Number(customer.loyaltyPoints || 0);
            const removed = Math.min(currentPoints, pointsToRemove);
            const newTotalPoints = currentPoints - removed;
            const newTotalSpent = Math.max(0, Number(customer.totalSpent || 0) - Number(orderTotal || 0));

            let newTier = 'Bronze';
            if (newTotalPoints >= TIER_TRESHOLDS.PLATINUM) newTier = 'Platinum';
            else if (newTotalPoints >= TIER_TRESHOLDS.GOLD) newTier = 'Gold';
            else if (newTotalPoints >= TIER_TRESHOLDS.SILVER) newTier = 'Silver';

            await db.transaction(async (tx) => {
                await tx.update(customers)
                    .set({
                        loyaltyPoints: newTotalPoints,
                        loyaltyTier: newTier,
                        totalSpent: newTotalSpent,
                        updatedAt: new Date(),
                    })
                    .where(eq(customers.id, customerId));

                await tx.insert(loyaltyLedger).values({
                    customerId: customerId,
                    points: -removed,
                    type: 'CLAWBACK',
                    referenceId: `ORD-CLB-${orderId}`,
                    notes: `Points clawed back for cancelled/refunded order ${orderId}`,
                    createdAt: new Date(),
                });

                await tx.insert(auditLogs).values({
                    eventType: 'LOYALTY_POINTS_CLAWBACK',
                    userId: 'system',
                    branchId,
                    payload: { customerId, pointsRemoved: removed, newTotalPoints, orderId, newTier },
                    createdAt: new Date(),
                });
            });

            log.info({ customerId, pointsRemoved: removed, orderId }, 'Loyalty points clawed back');
        } catch (error: any) {
            log.error({ err: error.message, customerId, orderId }, 'Failed to claw back loyalty points');
        }
    },

    /**
     * Redeem points for a discount.
     */
    async redeemPoints(customerId: string, points: number, branchId?: string) {
        try {
            const [customer] = await db.select().top(1).from(customers).where(eq(customers.id, customerId));
            if (!customer) throw new Error('Customer not found');

            const currentPoints = Number(customer.loyaltyPoints || 0);
            if (currentPoints < points) throw new Error(`Insufficient points. Balance: ${currentPoints}`);

            await db.transaction(async (tx) => {
                await tx.update(customers)
                    .set({
                        loyaltyPoints: currentPoints - points,
                        updatedAt: new Date(),
                    })
                    .where(eq(customers.id, customerId));

                // Strict Loyalty Ledger log
                await tx.insert(loyaltyLedger).values({
                    customerId: customerId,
                    points: -points,
                    type: 'REDEEMED',
                    referenceId: `ORD-RDM-${Date.now()}`,
                    notes: `Points redeemed`,
                    createdAt: new Date(),
                });

                // Audit
                await tx.insert(auditLogs).values({
                    eventType: 'LOYALTY_POINTS_REDEEMED',
                    userId: 'system',
                    branchId,
                    payload: { customerId, pointsRedeemed: points, remaining: currentPoints - points },
                    createdAt: new Date(),
                });
            });

            log.info({ customerId, pointsRedeemed: points }, 'Loyalty points redeemed');
            return true;
        } catch (error: any) {
            log.error({ err: error.message, customerId }, 'Failed to redeem points');
            throw error;
        }
    }
};
