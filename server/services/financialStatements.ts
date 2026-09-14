/**
 * Financial Statements Service - Ledger Based
 * Generates: P&L (Income Statement), Balance Sheet, Cash Flow Statement
 * Implements: Section 4 of the ERP Launch Readiness Checklist
 */

import { db } from '../db';
import { chartOfAccounts, journalEntries, journalLines, costCenters, postingRules } from '../../src/db/schema';
import { eq, and, lte, gte, sql, inArray } from 'drizzle-orm';

// =============================================================================
// Types
// =============================================================================

export interface ProfitAndLossReport {
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    revenue: { items: AccountLineItem[]; total: number; };
    costOfGoodsSold: { items: AccountLineItem[]; total: number; };
    grossProfit: number;
    grossMargin: number; // percentage
    operatingExpenses: { items: AccountLineItem[]; total: number; };
    operatingIncome: number;
    otherIncome: { items: AccountLineItem[]; total: number; };
    otherExpenses: { items: AccountLineItem[]; total: number; };
    netIncome: number;
    netMargin: number; // percentage
}

export interface BalanceSheetReport {
    asOfDate: string;
    generatedAt: string;
    assets: {
        current: { items: AccountLineItem[]; total: number };
        nonCurrent: { items: AccountLineItem[]; total: number };
        total: number;
    };
    liabilities: {
        current: { items: AccountLineItem[]; total: number };
        nonCurrent: { items: AccountLineItem[]; total: number };
        total: number;
    };
    equity: {
        items: AccountLineItem[];
        retainedEarnings: number;
        total: number;
    };
    totalLiabilitiesAndEquity: number;
    balanced: boolean;
}

export interface CashFlowReport {
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    operating: { items: CashFlowLineItem[]; total: number; };
    investing: { items: CashFlowLineItem[]; total: number; };
    financing: { items: CashFlowLineItem[]; total: number; };
    netCashFlow: number;
    openingCashBalance: number;
    closingCashBalance: number;
}

export interface AccountLineItem {
    code: string;
    name: string;
    amount: number;
}

export interface CashFlowLineItem {
    description: string;
    amount: number;
    source?: string;
}

export interface AccountsReceivableSummary {
    totalOutstanding: number;
    current: number;      // 0-30 days
    days30_60: number;
    days60_90: number;
    over90: number;
    customers: ARAPEntry[];
}

export interface AccountsPayableSummary {
    totalOutstanding: number;
    current: number;
    days30_60: number;
    days60_90: number;
    over90: number;
    vendors: ARAPEntry[];
}

export interface ARAPEntry {
    id: string;
    name: string;
    amount: number;
    dueDate?: string;
    agingBucket: 'CURRENT' | '30-60' | '60-90' | 'OVER_90';
    referenceId?: string;
}

// =============================================================================
// Constants & Helpers
// =============================================================================

const ACCOUNT_CODES = {
    REVENUE_PREFIX: '4',
    OTHER_REVENUE: '4200',
    COGS_PREFIX: '51',
    OPEX_PREFIX_START: '52',
    OPEX_PREFIX_END: '59',
    CASH_PREFIX: '111',
    INVENTORY_PREFIX: '12',
    ACCOUNTS_RECEIVABLE: '1300',
    ACCOUNTS_PAYABLE: '2100',
    CURRENT_ASSET_MAX: '1399',
    NON_CURRENT_ASSET_MIN: '1400',
    CURRENT_LIABILITY_MAX: '2399',
};

async function getAccountBalances(startDate?: string, endDate?: string, branchId?: string) {
    let dateFilter = sql`${journalEntries.status} = 'POSTED'`;
    if (startDate) {
        dateFilter = and(dateFilter, gte(journalEntries.date, new Date(startDate)));
    }
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter = and(dateFilter, lte(journalEntries.date, end));
    }

    const balances = await db.select({
        accountId: chartOfAccounts.id,
        code: chartOfAccounts.code,
        name: chartOfAccounts.name,
        type: chartOfAccounts.type,
        normalBalance: chartOfAccounts.normalBalance,
        parentId: chartOfAccounts.parentId,
        totalDebit: sql<number>`SUM(${journalLines.debit})`,
        totalCredit: sql<number>`SUM(${journalLines.credit})`
    })
    .from(chartOfAccounts)
    .leftJoin(journalLines, eq(chartOfAccounts.id, journalLines.accountId))
    .leftJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
    .where(and(dateFilter, branchId ? eq(costCenters.branchId, branchId) : undefined))
    .groupBy(chartOfAccounts.id, chartOfAccounts.code, chartOfAccounts.name, chartOfAccounts.type, chartOfAccounts.normalBalance, chartOfAccounts.parentId);

    const balanceByAccount = new Map(balances.map(row => [row.accountId, row]));

    return balances.map(acc => {
        const b = balanceByAccount.get(acc.accountId);
        const debit = Number(b?.totalDebit || 0);
        const credit = Number(b?.totalCredit || 0);
        const balance = acc.normalBalance === 'DEBIT' ? debit - credit : credit - debit;
            
        return {
            id: acc.accountId,
            code: acc.code,
            name: acc.name,
            nameAr: null,
            type: acc.type,
            normalBalance: acc.normalBalance,
            parentId: acc.parentId,
            debit,
            credit,
            balance
        };
    });
}

function getHierarchyBalances(balances: any[], prefix: string) {
    return balances.filter(a => a.code.startsWith(prefix));
}

const leafAccounts = (balances: any[]) => balances.filter(a => !balances.some(x => x.parentId === a.id));

const getAncestors = (account: any, byId: Map<string, any>) => {
    const ancestors: any[] = [];
    let cursor = account?.parentId ? byId.get(account.parentId) : undefined;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
        ancestors.push(cursor);
        seen.add(cursor.id);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return ancestors;
};

const isNonCurrentAccount = (account: any, byId: Map<string, any>) => {
    const chain = [account, ...getAncestors(account, byId)];
    return chain.some(a => {
        const code = String(a.code || '');
        const name = `${a.name || ''} ${a.nameAr || ''}`.toLowerCase();
        return code.startsWith('14') || code.startsWith('15') || /fixed|non[- ]current|long[- ]term|ثابت|غير متداول|طويل/.test(name);
    });
};

const getCogsAccountIds = async (balances: any[]) => {
    const [rule] = await db.select({ accountCode: postingRules.accountCode })
        .from(postingRules)
        .where(and(eq(postingRules.documentType, 'COGS'), eq(postingRules.amountSource, 'SYSTEM'), eq(postingRules.direction, 'DEBIT'), eq(postingRules.isActive, true)))
        .top(1);
    if (!rule?.accountCode) return new Set<string>();
    const byId = new Map(balances.map(a => [a.id, a]));
    const root = balances.find(a => a.code === rule.accountCode);
    if (!root) return new Set<string>();
    const ids = new Set<string>([root.id]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const account of balances) {
            if (account.parentId && ids.has(account.parentId) && !ids.has(account.id)) { ids.add(account.id); changed = true; }
        }
    }
    // If the mapping points at a leaf, it remains a valid one-account COGS tree.
    return ids;
};

const getConfiguredAccountCode = async (documentType: string, direction: 'DEBIT' | 'CREDIT', fallback: string) => {
    const [rule] = await db.select({ accountCode: postingRules.accountCode })
        .from(postingRules)
        .where(and(eq(postingRules.documentType, documentType), eq(postingRules.amountSource, 'SYSTEM'), eq(postingRules.direction, direction), eq(postingRules.isActive, true)))
        .top(1);
    return rule?.accountCode || fallback;
};

// =============================================================================
// Service Methods
// =============================================================================

export const financialStatements = {

    async profitAndLoss(periodStart: string, periodEnd: string, branchId?: string): Promise<ProfitAndLossReport> {
        const balances = await getAccountBalances(periodStart, periodEnd, branchId);
        const leaves = leafAccounts(balances);
        const cogsIds = await getCogsAccountIds(balances);
        
        // Revenue is classified by account type, so a customer can use any
        // valid code structure in their own chart.
        const revenueItems = leaves
            .filter(a => a.type === 'REVENUE' && Math.abs(a.balance) > 0.001)
            .map(a => ({ code: a.code, name: a.name, amount: a.balance }));
        const totalRevenue = revenueItems.reduce((acc, val) => acc + val.amount, 0);

        const cogsItems = leaves
            .filter(a => a.type === 'EXPENSE' && cogsIds.has(a.id) && Math.abs(a.balance) > 0.001)
            .map(a => ({ code: a.code, name: a.name, amount: a.balance }));
        const totalCOGS = cogsItems.reduce((acc, val) => acc + val.amount, 0);
        
        const grossProfit = totalRevenue - totalCOGS;

        const opexItems = leaves
            .filter(a => a.type === 'EXPENSE' && !cogsIds.has(a.id) && Math.abs(a.balance) > 0.001)
            .map(a => ({ code: a.code, name: a.name, amount: a.balance }));
        const totalOpex = opexItems.reduce((acc, val) => acc + val.amount, 0);

        const operatingIncome = grossProfit - totalOpex;

        const netIncome = operatingIncome;

        return {
            periodStart,
            periodEnd,
            generatedAt: new Date().toISOString(),
            revenue: { items: revenueItems, total: totalRevenue },
            costOfGoodsSold: { items: cogsItems, total: totalCOGS },
            grossProfit,
            grossMargin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
            operatingExpenses: { items: opexItems, total: totalOpex },
            operatingIncome,
            otherIncome: { items: [], total: 0 },
            otherExpenses: { items: [], total: 0 },
            netIncome,
            netMargin: totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0,
        };
    },

    async balanceSheet(asOfDate?: string, branchId?: string): Promise<BalanceSheetReport> {
        // Balance sheet requires cumulative balances, so no start date
        const balances = await getAccountBalances(undefined, asOfDate || new Date().toISOString(), branchId);

        const byId = new Map(balances.map(a => [a.id, a]));
        const leaves = leafAccounts(balances);
        const currentAssets = leaves
            .filter(a => a.type === 'ASSET' && !isNonCurrentAccount(a, byId) && Math.abs(a.balance) > 0.001)
            .map(a => ({ code: a.code, name: a.name, amount: a.balance }));
        const currentAssetsTotal = currentAssets.reduce((s, i) => s + i.amount, 0);

        const nonCurrentAssets = leaves
            .filter(a => a.type === 'ASSET' && isNonCurrentAccount(a, byId) && Math.abs(a.balance) > 0.001)
            .map(a => ({ code: a.code, name: a.name, amount: a.balance }));
        const nonCurrentAssetsTotal = nonCurrentAssets.reduce((s, i) => s + i.amount, 0);

        const currentLiabilities = leaves
            .filter(a => a.type === 'LIABILITY' && !isNonCurrentAccount(a, byId) && Math.abs(a.balance) > 0.001)
            .map(a => ({ code: a.code, name: a.name, amount: a.balance }));
        const currentLiabilitiesTotal = currentLiabilities.reduce((s, i) => s + i.amount, 0);

        const nonCurrentLiabilities = leaves
            .filter(a => a.type === 'LIABILITY' && isNonCurrentAccount(a, byId) && Math.abs(a.balance) > 0.001)
            .map(a => ({ code: a.code, name: a.name, amount: a.balance }));
        const nonCurrentLiabilitiesTotal = nonCurrentLiabilities.reduce((s, i) => s + i.amount, 0);

        const equityItems = balances
            .filter(a => a.type === 'EQUITY')
            .filter(a => !balances.some(x => x.parentId === a.id) && Math.abs(a.balance) > 0.001)
            .map(a => ({ code: a.code, name: a.name, amount: a.balance }));

        // Retained Earnings (Cumulative Revenue - Cumulative Expenses)
        const revenueSum = balances.filter(a => a.type === 'REVENUE').reduce((s, a) => s + a.balance, 0);
        const expenseSum = balances.filter(a => a.type === 'EXPENSE').reduce((s, a) => s + a.balance, 0);
        const retainedEarnings = revenueSum - expenseSum;
        const totalEquityItems = equityItems.reduce((s, i) => s + i.amount, 0);
        const totalEquity = totalEquityItems + retainedEarnings;

        const totalAssets = currentAssetsTotal + nonCurrentAssetsTotal;
        const totalLiabilities = currentLiabilitiesTotal + nonCurrentLiabilitiesTotal;

        return {
            asOfDate: asOfDate || new Date().toISOString().split('T')[0],
            generatedAt: new Date().toISOString(),
            assets: {
                current: { items: currentAssets, total: currentAssetsTotal },
                nonCurrent: { items: nonCurrentAssets, total: nonCurrentAssetsTotal },
                total: totalAssets,
            },
            liabilities: {
                current: { items: currentLiabilities, total: currentLiabilitiesTotal },
                nonCurrent: { items: nonCurrentLiabilities, total: nonCurrentLiabilitiesTotal },
                total: totalLiabilities,
            },
            equity: {
                items: equityItems,
                retainedEarnings,
                total: totalEquity,
            },
            totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
            balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
        };
    },

    async cashFlowStatement(periodStart: string, periodEnd: string, branchId?: string): Promise<CashFlowReport> {
        const periodBalances = await getAccountBalances(periodStart, periodEnd, branchId);
        const pnl = await this.profitAndLoss(periodStart, periodEnd, branchId);

        const operatingItems: CashFlowLineItem[] = [];
        operatingItems.push({ description: 'Net Income', amount: pnl.netIncome, source: 'P&L' });

        // Working Capital changes
        const inventoryChange = getHierarchyBalances(periodBalances, ACCOUNT_CODES.INVENTORY_PREFIX)
            .reduce((s, a) => s + a.balance, 0); 
        if (Math.abs(inventoryChange) > 0.01) {
            operatingItems.push({
                description: inventoryChange > 0 ? 'Increase in Inventory' : 'Decrease in Inventory',
                amount: -inventoryChange, // Cash outflow
            });
        }

        const arAccount = periodBalances.find(a => a.code === ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
        if (arAccount && Math.abs(arAccount.balance) > 0.01) {
            operatingItems.push({
                description: arAccount.balance > 0 ? 'Increase in AR' : 'Decrease in AR',
                amount: -arAccount.balance,
            });
        }

        const apAccount = periodBalances.find(a => a.code === ACCOUNT_CODES.ACCOUNTS_PAYABLE);
        if (apAccount && Math.abs(apAccount.balance) > 0.01) {
            operatingItems.push({
                description: apAccount.balance > 0 ? 'Increase in AP' : 'Decrease in AP',
                amount: apAccount.balance, // Liability increase = cash inflow
            });
        }
        
        const totalOperating = operatingItems.reduce((s, i) => s + i.amount, 0);

        const investingItems: CashFlowLineItem[] = [];
        const fixedAssetsChange = periodBalances
            .filter(a => a.code >= '1400' && a.code < '2000')
            .reduce((s, a) => s + a.balance, 0);
        if (Math.abs(fixedAssetsChange) > 0.01) {
            investingItems.push({
                description: 'Fixed Asset Changes',
                amount: -fixedAssetsChange,
            });
        }
        const totalInvesting = investingItems.reduce((s, i) => s + i.amount, 0);

        const financingItems: CashFlowLineItem[] = [];
        const equityChange = periodBalances
            .filter(a => a.type === 'EQUITY')
            .reduce((s, a) => s + a.balance, 0);
        if (Math.abs(equityChange) > 0.01) {
            financingItems.push({
                description: 'Equity Changes',
                amount: equityChange,
            });
        }
        const totalFinancing = financingItems.reduce((s, i) => s + i.amount, 0);

        const priorBalances = await getAccountBalances(undefined, new Date(new Date(periodStart).getTime() - 1).toISOString(), branchId);
        const openingCashBalance = getHierarchyBalances(priorBalances, ACCOUNT_CODES.CASH_PREFIX)
            .reduce((s, a) => s + a.balance, 0);

        const netCashFlow = totalOperating + totalInvesting + totalFinancing;

        return {
            periodStart,
            periodEnd,
            generatedAt: new Date().toISOString(),
            operating: { items: operatingItems, total: totalOperating },
            investing: { items: investingItems, total: totalInvesting },
            financing: { items: financingItems, total: totalFinancing },
            netCashFlow,
            openingCashBalance,
            closingCashBalance: openingCashBalance + netCashFlow,
        };
    },

    async accountsReceivable(branchId?: string): Promise<AccountsReceivableSummary> {
        const receivableCode = await getConfiguredAccountCode('RECEIVABLE', 'DEBIT', ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
        // Query journal lines directly for AR aging
        const rows = await db.select({
            date: journalEntries.date,
            reference: journalEntries.reference,
            amount: sql<number>`${journalLines.debit} - ${journalLines.credit}`
        })
        .from(journalLines)
        .leftJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
        .leftJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
        .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
        .where(and(eq(chartOfAccounts.code, receivableCode), branchId ? eq(costCenters.branchId, branchId) : undefined));

        const byRef: Record<string, { amount: number, date: Date }> = {};
        for(const row of rows) {
            const ref = row.reference || 'UNKNOWN';
            if(!byRef[ref]) byRef[ref] = { amount: 0, date: row.date! };
            byRef[ref].amount += Number(row.amount);
            // keep oldest date
            if (row.date && new Date(row.date) < new Date(byRef[ref].date)) {
                byRef[ref].date = row.date;
            }
        }

        const now = new Date();
        let current = 0, days30_60 = 0, days60_90 = 0, over90 = 0;
        const customers: ARAPEntry[] = [];

        for(const [ref, data] of Object.entries(byRef)) {
            if(data.amount <= 0.01) continue;
            const daysSince = Math.floor((now.getTime() - new Date(data.date).getTime()) / 86400000);
            let bucket: ARAPEntry['agingBucket'] = 'CURRENT';
            if (daysSince <= 30) { current += data.amount; bucket = 'CURRENT'; }
            else if (daysSince <= 60) { days30_60 += data.amount; bucket = '30-60'; }
            else if (daysSince <= 90) { days60_90 += data.amount; bucket = '60-90'; }
            else { over90 += data.amount; bucket = 'OVER_90'; }

            customers.push({
                id: ref, name: ref, amount: data.amount, agingBucket: bucket, referenceId: ref
            });
        }

        return {
            totalOutstanding: current + days30_60 + days60_90 + over90,
            current, days30_60, days60_90, over90,
            customers: customers.sort((a,b) => b.amount - a.amount)
        };
    },

    async accountsPayable(branchId?: string): Promise<AccountsPayableSummary> {
        const payableCode = await getConfiguredAccountCode('PAYABLE', 'CREDIT', ACCOUNT_CODES.ACCOUNTS_PAYABLE);
        // Query journal lines directly for AP aging
        const rows = await db.select({
            date: journalEntries.date,
            reference: journalEntries.reference,
            amount: sql<number>`${journalLines.credit} - ${journalLines.debit}`
        })
        .from(journalLines)
        .leftJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
        .leftJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
        .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
        .where(and(eq(chartOfAccounts.code, payableCode), branchId ? eq(costCenters.branchId, branchId) : undefined));

        const byRef: Record<string, { amount: number, date: Date }> = {};
        for(const row of rows) {
            const ref = row.reference || 'UNKNOWN';
            if(!byRef[ref]) byRef[ref] = { amount: 0, date: row.date! };
            byRef[ref].amount += Number(row.amount);
            if (row.date && new Date(row.date) < new Date(byRef[ref].date)) {
                byRef[ref].date = row.date;
            }
        }

        const now = new Date();
        let current = 0, days30_60 = 0, days60_90 = 0, over90 = 0;
        const vendors: ARAPEntry[] = [];

        for(const [ref, data] of Object.entries(byRef)) {
            if(data.amount <= 0.01) continue;
            const daysSince = Math.floor((now.getTime() - new Date(data.date).getTime()) / 86400000);
            let bucket: ARAPEntry['agingBucket'] = 'CURRENT';
            if (daysSince <= 30) { current += data.amount; bucket = 'CURRENT'; }
            else if (daysSince <= 60) { days30_60 += data.amount; bucket = '30-60'; }
            else if (daysSince <= 90) { days60_90 += data.amount; bucket = '60-90'; }
            else { over90 += data.amount; bucket = 'OVER_90'; }

            vendors.push({
                id: ref, name: ref, amount: data.amount, agingBucket: bucket, referenceId: ref
            });
        }

        return {
            totalOutstanding: current + days30_60 + days60_90 + over90,
            current, days30_60, days60_90, over90,
            vendors: vendors.sort((a,b) => b.amount - a.amount)
        };
    }
};

export default financialStatements;
