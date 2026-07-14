import { db } from '../db';
import { orders, menuItems, branches } from '../../src/db/schema';
import { eq, sql, and, gte, inArray, lt } from 'drizzle-orm';
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
     * 2. Compare global order count in the last hour with the same-hour 28-day average.
     * 3. Calculate a global demand index for the shared menu.
     * 4. If index > 1.2 (20% above avg), suggest price increase.
     * 5. If index < 0.6 (40% below avg), suggest price decrease (Happy Hour).
     */
    public async analyzeAndSuggestPrices() {
        try {
            log.info('Starting Dynamic Pricing Analysis...');
            const allBranches = await db.select().from(branches).where(eq(branches.isActive, true));
            
            const branchIds = allBranches.map((branch) => branch.id);
            if (branchIds.length === 0) return;

            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const baselineStart = new Date(oneHourAgo);
            baselineStart.setDate(baselineStart.getDate() - 28);

            const [currentResult] = await db.select({ count: sql<number>`count(*)` })
                .from(orders)
                .where(and(
                    inArray(orders.branchId, branchIds),
                    gte(orders.createdAt, oneHourAgo)
                ));
            const [historyResult] = await db.select({ count: sql<number>`count(*)` })
                .from(orders)
                .where(and(
                    inArray(orders.branchId, branchIds),
                    gte(orders.createdAt, baselineStart),
                    lt(orders.createdAt, oneHourAgo),
                    sql`DATEPART(HOUR, ${orders.createdAt}) = ${now.getHours()}`
                ));

            const currentVolume = Number(currentResult?.count || 0);
            const historicalVolume = Number(historyResult?.count || 0);
            if (historicalVolume < 7) {
                log.info({ historicalVolume }, 'Dynamic pricing skipped: insufficient same-hour history');
                return;
            }

            const averageHourlyVolume = historicalVolume / 28;
            const demandIndex = currentVolume / averageHourlyVolume;
            log.debug({ currentVolume, averageHourlyVolume, demandIndex }, 'Global demand analyzed');

            if (demandIndex > 1.4) {
                await this.applyStrategy(null, 'SURGE', 1.10);
            } else if (demandIndex < 0.4 && currentVolume > 0) {
                await this.applyStrategy(null, 'HAPPY_HOUR', 0.85);
            } else if (demandIndex > 1.0) {
                await this.applyStrategy(null, 'MODERATE_SURGE', 1.05);
            }
        } catch (error: any) {
            log.error({ err: error.message }, 'Dynamic pricing calculation failed');
        }
    }

    private async applyStrategy(branchId: string | null, strategy: string, multiplier: number) {
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
