import { Request } from 'express';
import { sql } from 'drizzle-orm';
import { orders } from '../../../src/db/schema';

export type ReportGranularity = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type DashboardScope = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL';

export const DELIVERED_STATUSES = ['DELIVERED', 'COMPLETED'];

export const parseLocalDateRange = (startDate: string, endDate: string) => {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error('INVALID_DATE_RANGE');
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

export const orderBusinessDayExpression = () =>
    sql<string>`coalesce(${orders.businessDate}, FORMAT(${orders.createdAt}, 'yyyy-MM-dd'))`;

export const orderBusinessDateFilter = (startDate: string, endDate: string, start: Date, end: Date) =>
    sql`(
        (${orders.businessDate} IS NOT NULL AND ${orders.businessDate} >= ${startDate} AND ${orders.businessDate} <= ${endDate})
        OR (${orders.businessDate} IS NULL AND ${orders.createdAt} >= ${start} AND ${orders.createdAt} <= ${end})
    )`;

export const parseReportFilters = (req: Request) => {
    const { branchId, startDate, endDate, reportType, granularity } = req.query;
    if (!startDate || !endDate) {
        throw new Error('Start date and end date are required');
    }

    const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
    return {
        branchId: branchId ? String(branchId) : undefined,
        start,
        end,
        reportType: String(reportType || 'overview').toUpperCase(),
        granularity: String(granularity || 'DAILY').toUpperCase() as ReportGranularity,
    };
};

export const resolveScopedBranchId = (req: Request, requestedBranchId?: string) => {
    const user = req.user;
    if (!user) {
        throw new Error('AUTH_REQUIRED');
    }

    const effectiveRequestedId =
        requestedBranchId && requestedBranchId !== 'undefined' && requestedBranchId !== 'null'
            ? requestedBranchId
            : undefined;

    if (user.role === 'SUPER_ADMIN') {
        return effectiveRequestedId;
    }

    if (!user.branchId) {
        throw new Error('BRANCH_SCOPE_REQUIRED');
    }

    if (effectiveRequestedId && effectiveRequestedId !== user.branchId) {
        throw new Error('FORBIDDEN_BRANCH_SCOPE');
    }

    return user.branchId;
};
