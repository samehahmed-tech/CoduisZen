/**
 * CRM Service - Customer Segmentation and Loyalty Auto-Promotion
 */

import { db } from '../db';
import { customers, auditLogs } from '../../src/db/schema';
import { eq, gte, lte, and, sql, desc } from 'drizzle-orm';

// Loyalty tier thresholds
const LOYALTY_TIERS = {
    Bronze: { minSpent: 0, minVisits: 0, multiplier: 1 },
    Silver: { minSpent: 1000, minVisits: 5, multiplier: 1.25 },
    Gold: { minSpent: 5000, minVisits: 20, multiplier: 1.5 },
    Platinum: { minSpent: 15000, minVisits: 50, multiplier: 2 },
};

// Segment definitions
type SegmentType = 'VIP' | 'AT_RISK' | 'DORMANT' | 'NEW' | 'REGULAR' | 'HIGH_VALUE' | 'FREQUENT';

interface SegmentRule {
    name: SegmentType;
    nameAr: string;
    check: (customer: any) => boolean;
}

const SEGMENT_RULES: SegmentRule[] = [
    {
        name: 'VIP',
        nameAr: 'عميل مميز',
        check: (c) => c.loyaltyTier === 'Platinum' || (c.totalSpent >= 10000 && c.visits >= 30),
    },
    {
        name: 'HIGH_VALUE',
        nameAr: 'عميل عالي القيمة',
        check: (c) => c.totalSpent >= 5000 && c.visits >= 10,
    },
    {
        name: 'FREQUENT',
        nameAr: 'عميل متكرر',
        check: (c) => c.visits >= 15,
    },
    {
        name: 'AT_RISK',
        nameAr: 'عميل معرض للخطر',
        check: (c) => {
            const daysSinceLastVisit = c.lastVisit
                ? Math.floor((Date.now() - new Date(c.lastVisit).getTime()) / (1000 * 60 * 60 * 24))
                : 999;
            return c.visits >= 5 && daysSinceLastVisit > 30;
        },
    },
    {
        name: 'DORMANT',
        nameAr: 'عميل خامل',
        check: (c) => {
            const daysSinceLastVisit = c.lastVisit
                ? Math.floor((Date.now() - new Date(c.lastVisit).getTime()) / (1000 * 60 * 60 * 24))
                : 999;
            return daysSinceLastVisit > 60;
        },
    },
    {
        name: 'NEW',
        nameAr: 'عميل جديد',
        check: (c) => c.visits <= 2,
    },
    {
        name: 'REGULAR',
        nameAr: 'عميل منتظم',
        check: (c) => c.visits >= 3 && c.visits < 15,
    },
];

export const crmService = {
    /**
     * Get customer segments for a customer
     */
    getCustomerSegments(customer: any): SegmentType[] {
        return SEGMENT_RULES.filter(rule => rule.check(customer)).map(r => r.name);
    },

    /**
     * Segment all customers and return counts
     */
    async getSegmentationReport() {
        const allCustomers = await db.select().from(customers);

        const segments: Record<SegmentType, number> = {
            VIP: 0,
            AT_RISK: 0,
            DORMANT: 0,
            NEW: 0,
            REGULAR: 0,
            HIGH_VALUE: 0,
            FREQUENT: 0,
        };

        const segmentedCustomers: Record<SegmentType, any[]> = {
            VIP: [],
            AT_RISK: [],
            DORMANT: [],
            NEW: [],
            REGULAR: [],
            HIGH_VALUE: [],
            FREQUENT: [],
        };

        for (const customer of allCustomers) {
            const customerSegments = this.getCustomerSegments(customer);
            for (const seg of customerSegments) {
                segments[seg]++;
                if (segmentedCustomers[seg].length < 10) {
                    segmentedCustomers[seg].push({
                        id: customer.id,
                        name: customer.name,
                        phone: customer.phone,
                        visits: customer.visits,
                        totalSpent: customer.totalSpent,
                        loyaltyTier: customer.loyaltyTier,
                    });
                }
            }
        }

        return {
            total: allCustomers.length,
            segments,
            samples: segmentedCustomers,
            rules: SEGMENT_RULES.map(r => ({ name: r.name, nameAr: r.nameAr })),
        };
    },

    /**
     * Calculate the appropriate loyalty tier for a customer
     */
    calculateTier(customer: any): string {
        const tiers = Object.entries(LOYALTY_TIERS).reverse(); // Start from highest
        for (const [tierName, tier] of tiers) {
            if (customer.totalSpent >= tier.minSpent && customer.visits >= tier.minVisits) {
                return tierName;
            }
        }
        return 'Bronze';
    },

    /**
     * Auto-promote eligible customers to higher tiers
     */
    async autoPromoteTiers(): Promise<{ promoted: number; details: any[] }> {
        const allCustomers = await db.select().from(customers);
        const promotions: any[] = [];

        for (const customer of allCustomers) {
            const newTier = this.calculateTier(customer);
            if (newTier !== customer.loyaltyTier) {
                // Check if it's a promotion (not a demotion)
                const tierOrder = ['Bronze', 'Silver', 'Gold', 'Platinum'];
                const oldIndex = tierOrder.indexOf(customer.loyaltyTier || 'Bronze');
                const newIndex = tierOrder.indexOf(newTier);

                if (newIndex > oldIndex) {
                    await db.update(customers)
                        .set({
                            loyaltyTier: newTier,
                            updatedAt: new Date(),
                        })
                        .where(eq(customers.id, customer.id));

                    promotions.push({
                        customerId: customer.id,
                        name: customer.name,
                        phone: customer.phone,
                        previousTier: customer.loyaltyTier,
                        newTier,
                        totalSpent: customer.totalSpent,
                        visits: customer.visits,
                    });
                }
            }
        }

        return { promoted: promotions.length, details: promotions };
    },

    /**
     * Get loyalty tier multiplier for points
     */
    getTierMultiplier(tier: string): number {
        return LOYALTY_TIERS[tier as keyof typeof LOYALTY_TIERS]?.multiplier || 1;
    },

    /**
     * Add loyalty points when an order is completed
     */
    async addLoyaltyPoints(customerId: string, orderTotal: number): Promise<{ pointsAdded: number; newTotal: number }> {
        const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
        if (!customer) throw new Error('Customer not found');

        const multiplier = this.getTierMultiplier(customer.loyaltyTier || 'Bronze');
        // 1 point per 10 EGP spent, multiplied by tier
        const basePoints = Math.floor(orderTotal / 10);
        const pointsAdded = Math.floor(basePoints * multiplier);

        const newTotal = (customer.loyaltyPoints || 0) + pointsAdded;

        await db.update(customers)
            .set({
                loyaltyPoints: newTotal,
                visits: (customer.visits || 0) + 1,
                totalSpent: (customer.totalSpent || 0) + orderTotal,
                updatedAt: new Date(),
            })
            .where(eq(customers.id, customerId));

        // Check for tier promotion after purchase
        const updatedCustomer = {
            ...customer,
            visits: (customer.visits || 0) + 1,
            totalSpent: (customer.totalSpent || 0) + orderTotal,
        };

        const newTier = this.calculateTier(updatedCustomer);
        if (newTier !== customer.loyaltyTier) {
            await db.update(customers)
                .set({ loyaltyTier: newTier })
                .where(eq(customers.id, customerId));
        }

        return { pointsAdded, newTotal };
    },

    /**
     * Get customers in a specific segment
     */
    async getCustomersBySegment(segment: SegmentType, limit = 50) {
        const allCustomers = await db.select().from(customers);
        const rule = SEGMENT_RULES.find(r => r.name === segment);
        if (!rule) throw new Error('Invalid segment');

        return allCustomers.filter(c => rule.check(c)).slice(0, limit);
    },

    /**
     * Trigger a campaign for a segment
     * Logs 'CAMPAIGN_SENT' event for each customer in segment
     */
    async triggerCampaign(segment: SegmentType, campaignName: string, channel: 'SMS' | 'EMAIL' | 'PUSH') {
        const customersToTarget = await this.getCustomersBySegment(segment);
        const results: any[] = [];

        for (const customer of customersToTarget) {
            // Log interaction
            await this.logInteraction(customer.id, 'CAMPAIGN_SENT', {
                campaignName,
                channel,
                segment,
            });

            results.push({
                customerId: customer.id,
                name: customer.name,
                status: 'SENT',
            });
        }

        return {
            campaignName,
            segment,
            channel,
            targetedCount: customersToTarget.length,
            results,
        };
    },

    /**
     * Log a customer interaction / event
     */
    async logInteraction(customerId: string, eventType: string, payload: any = {}) {
        const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
        if (!customer) throw new Error('Customer not found');

        // Use auditLogs for event history as it supports signatures and forensics
        await db.insert(auditLogs).values({
            eventType: `CRM_${eventType}`,
            userId: customerId, // Using userId field for customer identity context
            userName: customer.name,
            payload: {
                ...payload,
                customerId,
                customerPhone: customer.phone,
            },
            createdAt: new Date(),
        });
    },

    /**
     * Get interaction history for a customer
     */
    async getInteractionHistory(customerId: string, limit = 50) {
        // Find logs where payload has customerId
        const logs = await db.select()
            .from(auditLogs)
            .where(and(
                sql`${auditLogs.eventType} LIKE 'CRM_%'`,
                // Drizzle-orm doesn't support jsonb access easily in where without sql template
                sql`${auditLogs.payload}->>'customerId' = ${customerId}`
            ))
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit);

        return logs;
    },
};

export default crmService;
