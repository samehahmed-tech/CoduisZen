import { db } from '../db';
import { orders } from '../../src/db/schema';
import { eq, and, sql, gte, lte, asc } from 'drizzle-orm';
import { aiService } from './aiService';
import logger from '../utils/logger';
import { calculateWalkForwardMape, ForecastAccuracy } from '../utils/forecastAccuracy';
import { resolveBusinessDateRange } from '../utils/businessDateRange';

const log = logger.child({ service: 'revenueForecast' });

export interface DailyRevenue {
    date: string;
    revenue: number;
}

export interface ForecastResult {
    historical: DailyRevenue[];
    forecast: DailyRevenue[];
    confidence: number;
    confidenceMethod: 'R_SQUARED_WITH_COVERAGE_CAP';
    dataAsOf: string | null;
    dataFreshnessHours: number | null;
    businessDateFrom: string;
    businessDateTo: string;
    source: 'ORDERS_TOTAL_30_DAY_LINEAR_REGRESSION';
    accuracy: ForecastAccuracy;
    insight: string;
}

function calculateRegressionConfidence(historical: DailyRevenue[]): number {
    if (historical.length < 5) return 0;

    const mean = historical.reduce((sum, point) => sum + point.revenue, 0) / historical.length;
    const totalVariance = historical.reduce((sum, point) => sum + ((point.revenue - mean) ** 2), 0);
    if (totalVariance === 0) return 0.5;

    const n = historical.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    historical.forEach((point, index) => {
        sumX += index;
        sumY += point.revenue;
        sumXY += index * point.revenue;
        sumX2 += index * index;
    });
    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    const residualVariance = historical.reduce((sum, point, index) => {
        const predicted = slope * index + intercept;
        return sum + ((point.revenue - predicted) ** 2);
    }, 0);
    const rSquared = Math.max(0, Math.min(1, 1 - (residualVariance / totalVariance)));
    const coverageCap = Math.min(1, historical.length / 30);
    return Math.round(rSquared * coverageCap * 100) / 100;
}

function getDataFreshness(historical: DailyRevenue[], now: Date): { dataAsOf: string | null; dataFreshnessHours: number | null } {
    const dataAsOf = historical.length ? historical[historical.length - 1].date : null;
    if (!dataAsOf) return { dataAsOf: null, dataFreshnessHours: null };
    const asOf = new Date(`${dataAsOf}T23:59:59.999Z`);
    return {
        dataAsOf,
        dataFreshnessHours: Math.max(0, Math.round(((now.getTime() - asOf.getTime()) / 3600000) * 100) / 100),
    };
}

export const revenueForecastService = {
    /**
     * Generate revenue forecast for the next 7 days based on last 30 days.
     */
    async getRevenueForecast(branchId?: string): Promise<ForecastResult> {
        try {
            // 1. Fetch the same canonical business-date window used by BI.
            const now = new Date();
            const fromDate = new Date(now);
            fromDate.setUTCDate(fromDate.getUTCDate() - 29);
            const dateRange = resolveBusinessDateRange(fromDate.toISOString().slice(0, 10), now.toISOString().slice(0, 10));

            const query = db.select({
                date: orders.businessDate,
                revenue: sql<number>`SUM(${orders.total})`,
            })
            .from(orders)
            .where(and(
                gte(orders.businessDate, dateRange.from),
                lte(orders.businessDate, dateRange.to),
                sql`${orders.status} NOT IN ('CANCELLED')`,
                branchId ? eq(orders.branchId, branchId) : undefined,
            ))
            .groupBy(orders.businessDate)
            .orderBy(asc(orders.businessDate));

            const historicalData = await query;
            const historical = historicalData.map(d => ({
                date: d.date,
                revenue: Number(d.revenue || 0)
            }));

            if (historical.length < 5) {
                const freshness = getDataFreshness(historical, new Date());
                return {
                    historical,
                    forecast: [],
                    confidence: 0,
                    confidenceMethod: 'R_SQUARED_WITH_COVERAGE_CAP',
                    ...freshness,
                    businessDateFrom: dateRange.from,
                    businessDateTo: dateRange.to,
                source: 'ORDERS_TOTAL_30_DAY_LINEAR_REGRESSION',
                accuracy: calculateWalkForwardMape(historical.map(point => point.revenue)),
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

            const freshness = getDataFreshness(historical, new Date());
            return {
                historical,
                forecast,
                confidence: calculateRegressionConfidence(historical),
                confidenceMethod: 'R_SQUARED_WITH_COVERAGE_CAP',
                ...freshness,
                businessDateFrom: dateRange.from,
                businessDateTo: dateRange.to,
                source: 'ORDERS_TOTAL_30_DAY_LINEAR_REGRESSION',
                accuracy: calculateWalkForwardMape(historical.map(point => point.revenue)),
                insight
            };

        } catch (error: any) {
            log.error({ err: error.message }, 'Failed to generate revenue forecast');
            throw error;
        }
    }
};

export default revenueForecastService;
