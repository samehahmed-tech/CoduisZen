import { describe, it, afterEach, beforeEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { journalEntries, journalLines, costCenters, chartOfAccounts } from '../src/db/schema';
import { dayCloseService } from '../server/services/dayCloseService';
import { GLService } from '../server/services/glService';
import { branches, users } from '../src/db/schema';

const suffix = `probe-${Date.now()}`;
const fixtures = {
    branchId: `probe-dc-branch-${suffix}`,
    userId: `probe-dc-user-${suffix}`,
};
const localDateKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const cleanup = async () => {
    const entryIds = (await db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.reference, `EXPENSE-${suffix}`))).map(r => r.id);
    if (entryIds.length > 0) await db.delete(journalLines).where(inArray(journalLines.journalEntryId, entryIds));
    await db.delete(journalEntries).where(eq(journalEntries.reference, `EXPENSE-${suffix}`));
    await db.delete(costCenters).where(eq(costCenters.branchId, fixtures.branchId));
    await db.delete(users).where(eq(users.id, fixtures.userId));
    await db.delete(branches).where(eq(branches.id, fixtures.branchId));
};

describe('dayClose expense probe', () => {
    beforeEach(async () => {
        await cleanup();
        await db.insert(branches).values({ id: fixtures.branchId, name: 'probe', isActive: true, timezone: 'Africa/Cairo' });
        await db.insert(users).values({ id: fixtures.userId, name: 'probe', email: `${fixtures.userId}@x.local`, role: 'SUPER_ADMIN', permissions: ['*'], assignedBranchId: fixtures.branchId, isActive: true });
        await GLService.postJournalEntry({
            reference: `EXPENSE-${suffix}`,
            referenceType: 'EXPENSE',
            description: 'probe expense',
            branchId: fixtures.branchId,
            createdBy: fixtures.userId,
            status: 'POSTED',
            lines: [
                { accountCode: '6200', debit: 25, credit: 0 },
                { accountCode: '1110', debit: 0, credit: 25 },
            ],
        });
    });
    afterEach(cleanup);

    it('probes', async () => {
        const today = localDateKey();
        const { startOfDay, endOfDay } = await dayCloseService.getBranchDayBounds(fixtures.branchId, today);
        console.log('BOUNDS:', startOfDay.toISOString(), endOfDay.toISOString());
        try {
            const allEntries = await db.select({ id: journalEntries.id, date: journalEntries.date, status: journalEntries.status, refType: journalEntries.referenceType }).from(journalEntries);
            console.log('ALL_ENTRIES:', JSON.stringify(allEntries.filter(e => String(e.id).includes('probe-dc'))));
        } catch (e: any) { console.log('ENTRIES_ERR:', e.message); }
        const ccs = await db.select().from(costCenters).where(eq(costCenters.branchId, fixtures.branchId));
        console.log('CCS:', JSON.stringify(ccs));
        const coa = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, '6200'));
        console.log('COA_6200:', JSON.stringify(coa));
        try {
            const report = await dayCloseService.generateReport(fixtures.branchId, today);
            console.log('FINANCE_SUMMARY:', JSON.stringify(report.financeSummary));
        } catch (e: any) {
            console.log('GENERATE_ERROR_STACK:', (e.stack || String(e)).split('\n').slice(0, 8).join(' | '));
            console.log('GENERATE_ERROR:', e.message || e);
        }
    });
});
