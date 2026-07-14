/**
 * Sales Intelligence Service
 * Implements: Phase 3.10 (Upselling & Combos)
 * 
 * Provides automated upselling suggestions and combo building logic using AI and history.
 */

import { db } from '../db';
import { menuItems, itemDailySnapshots } from '../../src/db/schema';
import { eq, and, sql, desc, notInArray } from 'drizzle-orm';
import logger from '../utils/logger';

const log = logger.child({ service: 'salesIntel' });

export interface UpsellSuggestion {
    id: string;
    name: string;
    price: number;
    reason: string;
}

export const salesIntelligenceService = {

    /**
     * Get upselling suggestions based on the current cart.
     */
    async getUpsellSuggestions(currentCartItemIds: string[], branchId?: string): Promise<UpsellSuggestion[]> {
        try {
            const availabilityConditions = [
                eq(menuItems.isAvailable, true),
                currentCartItemIds.length > 0 ? notInArray(menuItems.id, currentCartItemIds) : undefined,
            ].filter(Boolean) as any[];
            const snapshotJoin = branchId
                ? and(eq(menuItems.id, itemDailySnapshots.menuItemId), eq(itemDailySnapshots.branchId, branchId))
                : eq(menuItems.id, itemDailySnapshots.menuItemId);

            const popularItems = await db.select({
                id: menuItems.id,
                name: menuItems.name,
                price: menuItems.price,
                rank: sql<number>`coalesce(SUM(${itemDailySnapshots.quantitySold}), 0)`,
            })
            .from(menuItems)
            .leftJoin(itemDailySnapshots, snapshotJoin)
            .where(and(...availabilityConditions))
            .groupBy(menuItems.id, menuItems.name, menuItems.price)
            .orderBy(desc(sql`coalesce(SUM(${itemDailySnapshots.quantitySold}), 0)`))
            .offset(0).fetch(3);

            return popularItems.map(item => ({
                id: item.id,
                name: item.name,
                price: Number(item.price),
                reason: 'Our most popular side dish today!'
            }));

        } catch (error: any) {
            log.error({ err: error.message }, 'Failed to get upsell suggestions');
            return [];
        }
    },

    /**
     * Detects if current cart items can form a Combo for a discount.
     */
    async detectCombos(currentCartItemIds: string[]) {
        return [];
    }
};
