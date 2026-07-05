import { db } from '../db';
import { orders, menuItems, branches } from '../../src/db/schema';
import { eq, sql, and, gte } from 'drizzle-orm';
import { aiService } from './aiService';
import auditService from './auditService';
import logger from '../utils/logger';

const log = logger.child({ service: 'dynamicPricing' });

class DynamicPricingService {
    private intervalId?: NodeJS.Timeout;

    public startCron(intervalMinutes = 60) {
        log.info({ intervalMinutes }, 'AI Dynamic Pricing Generator started.');
        this.intervalId = setInterval(() => {
            this.analyzeAndSuggestPrices();
        }, 1000 * 60 * intervalMinutes);
    }

    public stopCron() {
        if (this.intervalId) clearInterval(this.intervalId);
    }

    /**
     * Logic:
     * 1. Get all active branches.
     * 2. For each branch, get order count in the last hour.
     * 3. Calculate "Demand Index" (current vs average).
     * 4. If index > 1.2 (20% above avg), suggest price increase.
     * 5. If index < 0.6 (40% below avg), suggest price decrease (Happy Hour).
     */
    public async analyzeAndSuggestPrices() {
        try {
            log.info('Starting Dynamic Pricing Analysis...');
            const allBranches = await db.select().from(branches).where(eq(branches.isActive, true));
            
            for (const branch of allBranches) {
                const oneHourAgo = new Date();
                oneHourAgo.setHours(oneHourAgo.getHours() - 1);

                // Count orders in last hour
                const [orderCountRes] = await db.select({
                    count: sql<number>`count(*)`
                })
                .from(orders)
                .where(and(
                    eq(orders.branchId, branch.id),
                    gte(orders.createdAt, oneHourAgo)
                ));

                const currentVolume = Number(orderCountRes?.count || 0);
                
                // Heuristic: Average hour volume (should be calculated from historical data, using 15 as placeholder)
                const STABLE_AVG_VOLUME = 15; 
                const demandIndex = currentVolume / STABLE_AVG_VOLUME;

                log.debug({ branchId: branch.id, currentVolume, demandIndex }, 'Branch demand analyzed');

                if (demandIndex > 1.4) {
                    await this.applyStrategy(branch.id, 'SURGE', 1.10); // 10% Increase
                } else if (demandIndex < 0.4 && currentVolume > 0) {
                    await this.applyStrategy(branch.id, 'HAPPY_HOUR', 0.85); // 15% Discount
                } else if (demandIndex > 1.0 && demandIndex <= 1.4) {
                    // Slight increase for popular items only
                    await this.applyStrategy(branch.id, 'MODERATE_SURGE', 1.05);
                }
            }
        } catch (error: any) {
            log.error({ err: error.message }, 'Dynamic pricing calculation failed');
        }
    }

    private async applyStrategy(branchId: string, strategy: string, multiplier: number) {
        log.info({ branchId, strategy, multiplier }, 'Applying dynamic pricing strategy');

        // Target popular items first
        const items = await db.select().from(menuItems).where(and(
            eq(menuItems.isAvailable, true),
            eq(menuItems.isPopular, true)
        ));

        for (const item of items) {
            const newPrice = Math.round(Number(item.price) * multiplier);
            
            // Only suggest if change is significant (> 2 EGP)
            if (Math.abs(newPrice - Number(item.price)) < 2) continue;

            // Use AI to generate a reason for the log/manager
            const prompt = `Explain why we are ${multiplier > 1 ? 'increasing' : 'decreasing'} the price of "${item.name}" from ${item.price} to ${newPrice} due to ${strategy} demand. Be professional and data-driven.`;
            const reason = await aiService.queryAI(prompt, "You are a revenue management AI.").catch(() => `Auto-pricing: ${strategy} detected.`);

            await db.update(menuItems)
                .set({
                    pendingPrice: newPrice,
                    priceChangeReason: reason,
                    updatedAt: new Date()
                })
                .where(eq(menuItems.id, item.id));

            log.info({ itemId: item.id, old: item.price, new: newPrice }, 'Suggested new dynamic price');
        }

        await auditService.createSignedAuditLog({
            eventType: 'AI_DYNAMIC_PRICING_SUGGESTION',
            branchId,
            payload: { strategy, multiplier, itemCount: items.length }
        });
    }
}

export const dynamicPricingService = new DynamicPricingService();
