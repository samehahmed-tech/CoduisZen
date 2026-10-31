import { db } from '../db';
import { customers, idempotencyKeys, orders } from '../../src/db/schema';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { whatsappService } from './whatsappService';


class RetentionService {
    private intervalId?: NodeJS.Timeout;
    private readonly runScope = 'RETENTION_WINBACK';

    public startCron() {
        console.log('Retention Service CRON started.');
        // Run once daily at 10 AM (local checking)
        this.intervalId = setInterval(() => {
            const hour = new Date().getHours();
            if (hour === 10) {
                this.executeWinBackCampaign();
            }
        }, 1000 * 60 * 60);

        // Optional: Run immediately for testing if needed
        // setTimeout(() => this.executeWinBackCampaign(), 10000);
    }

    public stopCron() {
        if (this.intervalId) clearInterval(this.intervalId);
    }

    public async executeWinBackCampaign(): Promise<{ alreadyRun?: boolean; targeted: number; failed?: boolean }> {
        const runKey = new Date().toISOString().slice(0, 10);
        try {
            const [existing] = await db.select({ id: idempotencyKeys.id }).top(1).from(idempotencyKeys).where(and(
                eq(idempotencyKeys.key, runKey),
                eq(idempotencyKeys.scope, this.runScope),
            ));
            if (existing) return { alreadyRun: true, targeted: 0 };
            try {
                await db.insert(idempotencyKeys).values({
                    key: runKey,
                    scope: this.runScope,
                    requestHash: runKey,
                    resourceId: runKey,
                    status: 'IN_PROGRESS',
                    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                    updatedAt: new Date(),
                });
            } catch {
                return { alreadyRun: true, targeted: 0 };
            }
            console.log('Executing automated win-back campaign...');
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            // Group orders by customer and find those whose latest order is > 30 days old
            // For simplicity in a multi-dialect setup, we cast through explicit querying
            
            const latestOrders = await db.select({
                customerId: customers.id,
                customerPhone: customers.phone,
                customerName: customers.name,
                latestDate: sql<Date>`MAX(${orders.createdAt})`,
            })
            .from(orders)
            .innerJoin(customers, eq(orders.customerId, customers.id))
            .where(and(
                inArray(orders.status, ['COMPLETED', 'DELIVERED']),
                isNull(customers.deletedAt),
                or(eq(customers.marketingOptIn, true), isNull(customers.marketingOptIn)),
                or(eq(customers.marketingWhatsappOptIn, true), isNull(customers.marketingWhatsappOptIn)),
                sql`${customers.phone} IS NOT NULL`,
            ))
            .groupBy(customers.id, customers.phone, customers.name)
            
            let targetedCount = 0;

            for (const record of latestOrders) {
                if (!record.customerPhone) continue;
                
                const lastDate = new Date(record.latestDate);
                // If the latest order was strictly before thirtyDaysAgo
                if (lastDate < thirtyDaysAgo) {
                    targetedCount++;
                    // Dispatch win-back message
                    whatsappService.enqueueMessage({
                        to: record.customerPhone,
                        text: `{أهلاً بك|مرحباً|يا هلا} ${record.customerName || 'صديقنا'}!\n\nمر وقت طويل على آخر طلب لك من مطعمنا! اشتقنالك وحابين نعزمك بخصم 15% على طلبك القادم.\n\nاستخدم كود خصم: (COMEBACK) عند الطلب عبر الموقع أو عبر الواتساب الآن.`,
                        isMarketing: true
                    });
                }
            }

            const result = { targeted: targetedCount };
            await db.update(idempotencyKeys).set({
                status: 'COMPLETED', responseCode: 200, responseBody: JSON.stringify(result), updatedAt: new Date(),
            }).where(and(eq(idempotencyKeys.key, runKey), eq(idempotencyKeys.scope, this.runScope)));
            console.log(`Win-back campaign executed. Targeted ${targetedCount} inactive customers.`);
            return result;
        } catch (e) {
            console.error('Win-back campaign error:', e);
            try {
                await db.update(idempotencyKeys).set({
                    status: 'COMPLETED', responseCode: 500, responseBody: JSON.stringify({ error: 'RETENTION_WINBACK_FAILED' }), updatedAt: new Date(),
                }).where(and(eq(idempotencyKeys.key, runKey), eq(idempotencyKeys.scope, this.runScope)));
            } catch { /* best effort state update */ }
            return { targeted: 0, failed: true };
        }
    }
}

export const retentionService = new RetentionService();
