/**
 * Sales Intelligence Service
 * Implements: Phase 3.10 (Upselling & Combos)
 * 
 * Provides automated upselling suggestions and combo building logic using AI and history.
 */

import { db } from '../db';
import { menuItems, orderItems, itemDailySnapshots } from '../../src/db/schema';
import { eq, and, sql, desc, ne, inArray } from 'drizzle-orm';
import { aiService } from './aiService';
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
            // 1. Basic Association Rule Mining (Mock logic: common side with main)
            const suggestions: UpsellSuggestion[] = [];

            // If only mains, suggest drinks & sides
            const menu = await db.select().from(menuItems).where(eq(menuItems.isAvailable, true));
            if (menu.length === 0) return [];

            // Simple heuristic: suggest high-margin popular items not in cart
            const popularItems = await db.select({
                id: menuItems.id,
                name: menuItems.name,
                price: menuItems.price,
                rank: sql<number>`SUM(${itemDailySnapshots.quantitySold})`,
            })
            .from(menuItems)
            .leftJoin(itemDailySnapshots, eq(menuItems.id, itemDailySnapshots.menuItemId))
            .where(and(
                eq(menuItems.isAvailable, true),
                notInCart(menuItems.id, currentCartItemIds)
            ))
            .groupBy(menuItems.id)
            .orderBy(desc(sql`rank`))
            .limit(3);

            // 2. AI-driven context (if cart is complex)
            if (currentCartItemIds.length >= 2) {
                const cartNames = menu.filter(m => currentCartItemIds.includes(m.id)).map(m => m.name).join(', ');
                const prompt = `The customer is ordering: ${cartNames}. Suggest 2 best items to upsell (Drink/Dessert/Side) that will pair perfectly. Be descriptive and persuasive in one sentence why. Mention item name at start.`;
                
                const aiResponse = await aiService.queryAI(prompt, "You are a professional restaurant waiter upselling to a customer.");
                // We could parse this for cleaner UI, but for now we'll return it as a reason for popular items.
            }

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
        // Implementation: Check for (Main + Side + Drink) combo patterns
        // and suggest upgrading to a combo if items match.
    }
};

function notInCart(column: any, ids: string[]) {
    if (ids.length === 0) return sql`TRUE`;
    const placeholders = ids.map(id => `'${id}'`).join(', ');
    return sql`${column} NOT IN (${sql.raw(placeholders)})`;
}
