import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { branches, franchiseConfigurations, orders } from '../../src/db/schema';
import { db } from '../db';
import { calculateRoyalty, isEligibleRoyaltyOrder, ROYALTY_ELIGIBLE_STATUSES } from '../utils/royaltyPolicy';
import { GLService } from './glService';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const assertDateRange = (from: string, to: string) => {
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) throw new Error('INVALID_ROYALTY_DATE_RANGE');
    const fromMs = Date.parse(`${from}T00:00:00Z`);
    const toMs = Date.parse(`${to}T00:00:00Z`);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || (toMs - fromMs) / 86400000 > 366) {
        throw new Error('ROYALTY_DATE_RANGE_TOO_LARGE');
    }
};

export type FranchiseRoyaltyPreviewInput = {
    from: string;
    to: string;
    branchIds?: string[];
};

export const previewFranchiseRoyalties = async (input: FranchiseRoyaltyPreviewInput) => {
    assertDateRange(input.from, input.to);
    const requestedBranchIds = [...new Set((input.branchIds || []).map(String).map((id) => id.trim()).filter(Boolean))].slice(0, 100);
    const branchRows = requestedBranchIds.length > 0
        ? await db.select({ id: branches.id, name: branches.name }).from(branches).where(inArray(branches.id, requestedBranchIds))
        : await db.select({ id: branches.id, name: branches.name }).from(branches);
    const branchIds = branchRows.map((branch) => String(branch.id));
    if (requestedBranchIds.some((branchId) => !branchIds.includes(branchId))) {
        throw new Error('ROYALTY_BRANCH_NOT_FOUND');
    }
    const configRows = branchIds.length > 0
        ? await db.select().from(franchiseConfigurations).where(and(
            inArray(franchiseConfigurations.branchId, branchIds),
            eq(franchiseConfigurations.isActive, true),
        ))
        : [];
    const configByBranch = new Map<string, typeof configRows[number]>();
    for (const config of configRows) {
        if (!configByBranch.has(String(config.branchId))) configByBranch.set(String(config.branchId), config);
    }
    const orderRows = branchIds.length > 0
        ? await db.select({
            branchId: orders.branchId,
            status: orders.status,
            subtotal: orders.subtotal,
            discount: orders.discount,
            businessDate: orders.businessDate,
        }).from(orders).where(and(
            inArray(orders.branchId, branchIds),
            gte(orders.businessDate, input.from),
            lte(orders.businessDate, input.to),
            inArray(orders.status, [...ROYALTY_ELIGIBLE_STATUSES]),
        ))
        : [];

    const summaries = branchRows.map((branch) => {
        const branchId = String(branch.id);
        const config = configByBranch.get(branchId);
        const branchOrders = orderRows.filter((order) => String(order.branchId) === branchId && isEligibleRoyaltyOrder(order.status));
        const totals = branchOrders.reduce((acc, order) => {
            const result = calculateRoyalty({
                subtotal: Number(order.subtotal || 0),
                discount: Number(order.discount || 0),
                royaltyPercentage: Number(config?.royaltyPercentage || 0),
                marketingFeePercentage: Number(config?.marketingFeePercentage || 0),
            });
            acc.netSales += result.netSales;
            acc.royaltyAmount += result.royaltyAmount;
            acc.marketingFeeAmount += result.marketingFeeAmount;
            acc.totalDue += result.totalDue;
            return acc;
        }, { netSales: 0, royaltyAmount: 0, marketingFeeAmount: 0, totalDue: 0 });
        const roundedTotals = {
            netSales: Number(totals.netSales.toFixed(2)),
            royaltyAmount: Number(totals.royaltyAmount.toFixed(2)),
            marketingFeeAmount: Number(totals.marketingFeeAmount.toFixed(2)),
            totalDue: Number(totals.totalDue.toFixed(2)),
        };
        return {
            branchId,
            branchName: branch.name,
            configured: Boolean(config),
            contractType: config?.contractType || null,
            royaltyPercentage: Number(config?.royaltyPercentage || 0),
            marketingFeePercentage: Number(config?.marketingFeePercentage || 0),
            eligibleOrderCount: branchOrders.length,
            ...roundedTotals,
        };
    });
    return {
        period: { from: input.from, to: input.to },
        source: { entity: 'orders', dateField: 'businessDate', basis: 'subtotal-minus-discount', statuses: [...ROYALTY_ELIGIBLE_STATUSES] },
        totals: summaries.reduce((acc, row) => {
            acc.eligibleOrderCount += row.eligibleOrderCount;
            acc.netSales += row.netSales;
            acc.royaltyAmount += row.royaltyAmount;
            acc.marketingFeeAmount += row.marketingFeeAmount;
            acc.totalDue += row.totalDue;
            return acc;
        }, { eligibleOrderCount: 0, netSales: 0, royaltyAmount: 0, marketingFeeAmount: 0, totalDue: 0 }),
        branches: summaries,
    };
};

type RoyaltyAccountSettings = {
    royaltyExpenseAccountCode?: string;
    royaltyPayableAccountCode?: string;
    marketingFeeExpenseAccountCode?: string;
    marketingFeePayableAccountCode?: string;
};

const readAccountSettings = (value: unknown): RoyaltyAccountSettings => {
    if (value && typeof value === 'object') return value as RoyaltyAccountSettings;
    if (typeof value !== 'string' || !value.trim()) return {};
    try { return JSON.parse(value) as RoyaltyAccountSettings; } catch { return {}; }
};

export const postFranchiseRoyalties = async (input: FranchiseRoyaltyPreviewInput & { actorId: string }) => {
    const preview = await previewFranchiseRoyalties(input);
    if (preview.totals.totalDue <= 0) return { posted: true, entries: [], preview };

    const branchIds = preview.branches.filter((branch) => branch.totalDue > 0).map((branch) => branch.branchId);
    const configs = await db.select().from(franchiseConfigurations).where(inArray(franchiseConfigurations.branchId, branchIds));
    const configByBranch = new Map(configs.map((config) => [String(config.branchId), config]));
    const entries: Array<{ branchId: string; entryId: string; duplicate?: boolean }> = [];

    const result = await db.transaction(async (tx) => {
        for (const branch of preview.branches.filter((row) => row.totalDue > 0)) {
            const config = configByBranch.get(branch.branchId);
            const settings = readAccountSettings(config?.settings);
            const royaltyAmount = Number(branch.royaltyAmount || 0);
            const marketingAmount = Number(branch.marketingFeeAmount || 0);
            const lines = [] as Array<{ accountCode: string; debit: number; credit: number; description: string }>;
            if (royaltyAmount > 0) {
                if (!settings.royaltyExpenseAccountCode || !settings.royaltyPayableAccountCode) throw new Error('ROYALTY_ACCOUNT_MAPPING_REQUIRED');
                lines.push({ accountCode: settings.royaltyExpenseAccountCode, debit: royaltyAmount, credit: 0, description: `Royalty expense ${input.from}..${input.to}` });
                lines.push({ accountCode: settings.royaltyPayableAccountCode, debit: 0, credit: royaltyAmount, description: `Royalty payable ${input.from}..${input.to}` });
            }
            if (marketingAmount > 0) {
                if (!settings.marketingFeeExpenseAccountCode || !settings.marketingFeePayableAccountCode) throw new Error('MARKETING_FEE_ACCOUNT_MAPPING_REQUIRED');
                lines.push({ accountCode: settings.marketingFeeExpenseAccountCode, debit: marketingAmount, credit: 0, description: `Marketing fee expense ${input.from}..${input.to}` });
                lines.push({ accountCode: settings.marketingFeePayableAccountCode, debit: 0, credit: marketingAmount, description: `Marketing fee payable ${input.from}..${input.to}` });
            }
            const posted = await GLService.postJournalEntry({
                reference: `ROYALTY:${branch.branchId}:${input.from}:${input.to}`,
                referenceType: 'ROYALTY',
                description: `Franchise royalty settlement ${input.from}..${input.to}`,
                date: new Date(`${input.to}T23:59:59.999Z`),
                lines,
                createdBy: input.actorId,
                actorId: input.actorId,
                branchId: branch.branchId,
                source: 'FRANCHISE_ROYALTY',
                correlationId: `ROYALTY:${branch.branchId}:${input.from}:${input.to}`,
            }, tx);
            if (!posted || typeof posted !== 'object' || !('entryId' in posted) || !posted.entryId) {
                throw new Error('ROYALTY_POSTING_FAILED');
            }
            entries.push({
                branchId: branch.branchId,
                entryId: String(posted.entryId),
                duplicate: 'duplicate' in posted ? Boolean(posted.duplicate) : undefined,
            });
        }
        return entries;
    });
    return { posted: true, entries: result, preview };
};
