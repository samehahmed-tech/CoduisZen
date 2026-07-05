import { db } from '../db';
import { orders } from '../../src/db/schema';
import { eq, lte, desc, sql } from 'drizzle-orm';
import { whatsappService } from './whatsappService';
import { analyticsService } from './analyticsService';


class RetentionService {
    private intervalId?: NodeJS.Timeout;

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

    public async executeWinBackCampaign() {
        try {
            console.log('Executing automated win-back campaign...');
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            // Group orders by customer and find those whose latest order is > 30 days old
            // For simplicity in a multi-dialect setup, we cast through explicit querying
            
            const latestOrders = await db.select({
                customerId: orders.customerId,
                customerPhone: orders.customerPhone,
                customerName: orders.customerName,
                latestDate: sql<Date>`MAX(${orders.createdAt})`,
            })
            .from(orders)
            .where(sql`${orders.customerPhone} IS NOT NULL`)
            .groupBy(orders.customerId, orders.customerPhone, orders.customerName)
            
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

            console.log(`Win-back campaign executed. Targeted ${targetedCount} inactive customers.`);
        } catch (e) {
            console.error('Win-back campaign error:', e);
        }
    }
}

export const retentionService = new RetentionService();
