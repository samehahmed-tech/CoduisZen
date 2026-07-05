import { db } from '../db';
import { orders } from '../../src/db/schema';
import { eq, and, sql, gte, asc } from 'drizzle-orm';
import { aiService } from './aiService';
import logger from '../utils/logger';

const log = logger.child({ service: 'revenueForecast' });

export interface DailyRevenue {
    date: string;
    revenue: number;
}

export interface ForecastResult {
    historical: DailyRevenue[];
    forecast: DailyRevenue[];
    confidence: number;
    insight: string;
}

export const revenueForecastService = {
    /**
     * Generate revenue forecast for the next 7 days based on last 30 days.
     */
    async getRevenueForecast(branchId?: string): Promise<ForecastResult> {
        try {
            // 1. Fetch last 30 days of revenue
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const query = db.select({
                date: sql<string>`DATE(${orders.createdAt})`,
                revenue: sql<number>`SUM(${orders.total})`,
            })
            .from(orders)
            .where(and(
                gte(orders.createdAt, thirtyDaysAgo),
                branchId ? eq(orders.branchId, branchId) : sql`TRUE`
            ))
            .groupBy(sql`DATE(${orders.createdAt})`)
            .orderBy(asc(sql`DATE(${orders.createdAt})`));

            const historicalData = await query;
            const historical = historicalData.map(d => ({
                date: d.date,
                revenue: Number(d.revenue || 0)
            }));

            if (historical.length < 5) {
                return {
                    historical,
                    forecast: [],
                    confidence: 0,
                    insight: "Insufficient data for forecasting. Need at least 5 days of history."
                };
            }

            // 2. Simple Linear Regression for forecasting
            // y = mx + b
            const n = historical.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            historical.forEach((d, i) => {
                sumX += i;
                sumY += d.revenue;
                sumXY += i * d.revenue;
                sumX2 += i * i;
            });

            const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            const b = (sumY - m * sumX) / n;

            const forecast: DailyRevenue[] = [];
            const lastDate = new Date(historical[historical.length - 1].date);

            for (let i = 1; i <= 7; i++) {
                const nextDate = new Date(lastDate);
                nextDate.setDate(lastDate.getDate() + i);
                const projectedX = n + i - 1;
                const projectedY = Math.max(0, m * projectedX + b);

                forecast.push({
                    date: nextDate.toISOString().split('T')[0],
                    revenue: Math.round(projectedY * 100) / 100
                });
            }

            // 3. AI Insight (Optional)
            let insight = "Revenue trend is stable.";
            if (m > 100) insight = "Revenue shows a strong upward trend!";
            else if (m < -100) insight = "Revenue shows a declining trend. Consider promotional actions.";

            try {
                const aiInsight = await aiService.getCachedInsight(
                    `rev_forecast_${branchId || 'global'}`,
                    async () => {
                        const dataStr = historical.map(d => `${d.date}: ${d.revenue}`).join('\n');
                        const prompt = `Analyze this 30-day revenue data and provide a 1-sentence strategic insight for the owner:\n${dataStr}`;
                        return await aiService.queryAI(prompt, "You are a senior business analyst.");
                    },
                    1440 // 24 hour cache
                );
                if (aiInsight) insight = aiInsight;
            } catch (e) {
                log.warn({ err: e }, 'AI insight failed, using fallback');
            }

            return {
                historical,
                forecast,
                confidence: 0.85, // Static for now, could be r-squared
                insight
            };

        } catch (error: any) {
            log.error({ err: error.message }, 'Failed to generate revenue forecast');
            throw error;
        }
    }
};

export default revenueForecastService;
