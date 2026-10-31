/**
 * Loyalty & Rewards Service
 * Implements: Phase 2.8 (Loyalty System)
 * 
 * Manages points accumulation, tier upgrades, and reward redemption.
 */

import { db, pool } from '../db';
import { customers, auditLogs, loyaltyLedger } from '../../src/db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
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

let loyaltySchemaReady = false;

export const ensureLoyaltySchema = async () => {
    if (loyaltySchemaReady) return;
    await pool.query(`
        IF OBJECT_ID(N'dbo.loyalty_ledger', N'U') IS NOT NULL
           AND COL_LENGTH(N'dbo.loyalty_ledger', N'operation_key') IS NULL
            ALTER TABLE dbo.loyalty_ledger ADD operation_key nvarchar(255) NULL;

        IF OBJECT_ID(N'dbo.loyalty_ledger', N'U') IS NOT NULL
           AND COL_LENGTH(N'dbo.loyalty_ledger', N'branch_id') IS NULL
            ALTER TABLE dbo.loyalty_ledger ADD branch_id nvarchar(255) NULL;

        IF OBJECT_ID(N'dbo.loyalty_ledger', N'U') IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM sys.indexes
               WHERE name = N'loyalty_ledger_operation_key_uq'
                 AND object_id = OBJECT_ID(N'dbo.loyalty_ledger')
           )
            EXEC(N'CREATE UNIQUE INDEX loyalty_ledger_operation_key_uq
                ON dbo.loyalty_ledger(operation_key)
                WHERE operation_key IS NOT NULL');
    `);
    loyaltySchemaReady = true;
};

export const loyaltyService = {

    /**
     * Award points to a customer based on order total.
     */
    async awardPoints(customerId: string, orderTotal: number, branchId?: string, orderId?: string) {
        try {
            await ensureLoyaltySchema();
            const pointsToAdd = Math.floor(orderTotal * POINTS_PER_EGP);
            if (pointsToAdd <= 0) return;

            const referenceId = orderId ? `ORD-AWD-${orderId}` : `ORD-AWD-${Date.now()}`;
            await db.transaction(async (tx) => {
                // Completion events can be replayed by POS, offline sync, or
                // a status webhook. A stable order reference makes awarding
                // points idempotent for all canonical order flows.
                if (orderId) {
                    const [alreadyAwarded] = await tx.select({ id: loyaltyLedger.id })
                        .top(1)
                        .from(loyaltyLedger)
                        .where(and(
                            eq(loyaltyLedger.customerId, customerId),
                            eq(loyaltyLedger.referenceId, referenceId),
                            eq(loyaltyLedger.type, 'EARNED'),
                        ));
                    if (alreadyAwarded) return;
                }
                const [customer] = await tx.select().top(1).from(customers).where(eq(customers.id, customerId));
                if (!customer) return;
                const newTotalPoints = Number(customer.loyaltyPoints || 0) + pointsToAdd;
                const newTotalSpent = Number(customer.totalSpent || 0) + orderTotal;
                const newVisits = Number(customer.visits || 0) + 1;

                let newTier = 'Bronze';
                if (newTotalPoints >= TIER_TRESHOLDS.PLATINUM) newTier = 'Platinum';
                else if (newTotalPoints >= TIER_TRESHOLDS.GOLD) newTier = 'Gold';
                else if (newTotalPoints >= TIER_TRESHOLDS.SILVER) newTier = 'Silver';
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
                    branchId,
                    points: pointsToAdd,
                    type: 'EARNED',
                    referenceId,
                    operationKey: orderId ? referenceId : undefined,
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

            log.info({ customerId, pointsAwarded: pointsToAdd }, 'Loyalty points awarded');
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
            await ensureLoyaltySchema();
            const pointsToRemove = Math.floor(Number(orderTotal || 0) * POINTS_PER_EGP);
            if (pointsToRemove <= 0) return;

            await db.transaction(async (tx) => {
                // Cancellation/refund callbacks are also replayable. Do not
                // apply the same clawback reference twice.
                const [alreadyClawedBack] = await tx.select({ id: loyaltyLedger.id })
                    .top(1)
                    .from(loyaltyLedger)
                    .where(and(
                        eq(loyaltyLedger.customerId, customerId),
                        eq(loyaltyLedger.referenceId, `ORD-CLB-${orderId}`),
                        eq(loyaltyLedger.type, 'CLAWBACK'),
                    ));
                if (alreadyClawedBack) return;
                const [customer] = await tx.select().top(1).from(customers).where(eq(customers.id, customerId));
                if (!customer) return;
                const currentPoints = Number(customer.loyaltyPoints || 0);
                const removed = Math.min(currentPoints, pointsToRemove);
                const newTotalPoints = currentPoints - removed;
                const newTotalSpent = Math.max(0, Number(customer.totalSpent || 0) - Number(orderTotal || 0));

                let newTier = 'Bronze';
                if (newTotalPoints >= TIER_TRESHOLDS.PLATINUM) newTier = 'Platinum';
                else if (newTotalPoints >= TIER_TRESHOLDS.GOLD) newTier = 'Gold';
                else if (newTotalPoints >= TIER_TRESHOLDS.SILVER) newTier = 'Silver';
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
                    branchId,
                    points: -removed,
                    type: 'CLAWBACK',
                    referenceId: `ORD-CLB-${orderId}`,
                    operationKey: `ORD-CLB-${orderId}`,
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

            log.info({ customerId, pointsRemoved: pointsToRemove, orderId }, 'Loyalty points clawed back');
        } catch (error: any) {
            log.error({ err: error.message, customerId, orderId }, 'Failed to claw back loyalty points');
        }
    },

    /**
     * Redeem points for a discount.
     */
    async redeemPoints(customerId: string, points: number, branchId?: string, operationKey?: string) {
        try {
            const normalizedPoints = Math.floor(Number(points));
            if (!Number.isFinite(normalizedPoints) || normalizedPoints <= 0) throw new Error('Points must be a positive integer');
            const normalizedOperationKey = operationKey ? String(operationKey).trim().slice(0, 200) : undefined;
            const referenceId = `ORD-RDM-${normalizedOperationKey || randomUUID()}`;
            const ledgerOperationKey = normalizedOperationKey ? `LOYALTY-REDEEM:${normalizedOperationKey}` : undefined;

            await db.transaction(async (tx) => {
                if (ledgerOperationKey) {
                    const [existing] = await tx.select({ id: loyaltyLedger.id })
                        .top(1)
                        .from(loyaltyLedger)
                        .where(and(eq(loyaltyLedger.operationKey, ledgerOperationKey), eq(loyaltyLedger.type, 'REDEEMED')));
                    if (existing) return;
                }
                const [customer] = await tx.select().top(1).from(customers).where(eq(customers.id, customerId));
                if (!customer) throw new Error('Customer not found');
                const currentPoints = Number(customer.loyaltyPoints || 0);
                if (currentPoints < normalizedPoints) throw new Error(`Insufficient points. Balance: ${currentPoints}`);

                const updated = await tx.update(customers)
                    .set({
                        loyaltyPoints: sql`${customers.loyaltyPoints} - ${normalizedPoints}`,
                        updatedAt: new Date(),
                    })
                    .output()
                    .where(and(eq(customers.id, customerId), gte(customers.loyaltyPoints, normalizedPoints)));
                if (!updated.length) throw new Error('LOYALTY_BALANCE_CHANGED_RETRY');

                // Strict Loyalty Ledger log
                await tx.insert(loyaltyLedger).values({
                    customerId: customerId,
                    branchId,
                    points: -normalizedPoints,
                    type: 'REDEEMED',
                    referenceId,
                    operationKey: ledgerOperationKey,
                    notes: 'Points redeemed',
                    createdAt: new Date(),
                });

                // Audit
                await tx.insert(auditLogs).values({
                    eventType: 'LOYALTY_POINTS_REDEEMED',
                    userId: 'system',
                    branchId,
                    payload: { customerId, pointsRedeemed: normalizedPoints, remaining: currentPoints - normalizedPoints, operationKey: normalizedOperationKey || null },
                    createdAt: new Date(),
                });
            });

            log.info({ customerId, pointsRedeemed: normalizedPoints }, 'Loyalty points redeemed');
            return true;
        } catch (error: any) {
            log.error({ err: error.message, customerId }, 'Failed to redeem points');
            throw error;
        }
    }
};
