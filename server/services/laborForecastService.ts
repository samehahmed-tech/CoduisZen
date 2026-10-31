import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { attendanceSessions, orders } from '../../src/db/schema';
import revenueForecastService from './revenueForecastService';
import { resolveBusinessDateRange } from '../utils/businessDateRange';
import { calculateLaborForecast } from '../utils/laborForecast';

const daysAgo = (days: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
};

export const laborForecastService = {
    async getLaborForecast(branchId?: string) {
        const today = new Date().toISOString().slice(0, 10);
        const dateRange = resolveBusinessDateRange(daysAgo(29), today);
        const [salesRows, hoursRows, revenueForecast] = await Promise.all([
            db.select({
                date: orders.businessDate,
                revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            }).from(orders).where(and(
                gte(orders.businessDate, dateRange.from),
                lte(orders.businessDate, dateRange.to),
                sql`${orders.status} NOT IN ('CANCELLED')`,
                branchId ? eq(orders.branchId, branchId) : undefined,
            )).groupBy(orders.businessDate).orderBy(asc(orders.businessDate)),
            db.select({
                date: sql<string>`FORMAT(${attendanceSessions.clockInAt}, 'yyyy-MM-dd')`,
                laborHours: sql<number>`coalesce(sum(${attendanceSessions.totalHours}), 0)`,
            }).from(attendanceSessions).where(and(
                gte(attendanceSessions.clockInAt, new Date(`${dateRange.from}T00:00:00.000Z`)),
                lte(attendanceSessions.clockInAt, new Date(`${dateRange.to}T23:59:59.999Z`)),
                branchId ? eq(attendanceSessions.branchId, branchId) : undefined,
            )).groupBy(sql`FORMAT(${attendanceSessions.clockInAt}, 'yyyy-MM-dd')`).orderBy(sql`FORMAT(${attendanceSessions.clockInAt}, 'yyyy-MM-dd')`),
            revenueForecastService.getRevenueForecast(branchId),
        ]);

        const hoursByDate = new Map(hoursRows.map(row => [String(row.date), Number(row.laborHours || 0)]));
        const historical = salesRows.map(row => ({
            date: String(row.date),
            revenue: Number(row.revenue || 0),
            laborHours: hoursByDate.get(String(row.date)) || 0,
        }));
        return {
            branchId: branchId || null,
            businessDateFrom: dateRange.from,
            businessDateTo: dateRange.to,
            revenueForecast: revenueForecast,
            ...calculateLaborForecast(historical, revenueForecast.forecast),
        };
    },
};

export default laborForecastService;
