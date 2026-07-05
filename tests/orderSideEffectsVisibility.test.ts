import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { branches, financeExceptions, orders } from '../src/db/schema';
import { postPosOrderEntry } from '../server/services/financePostingService';
import { PostingRuleEngine } from '../server/services/postingRuleEngine';

let db: typeof import('../server/db')['db'];

describe('order side effect visibility', () => {
    beforeEach(async () => {
        const dbModule = await import('../server/db');
        db = dbModule.db;

        await PostingRuleEngine.invalidateCache();
        await db.execute(sql`TRUNCATE TABLE finance_exceptions, journal_lines, journal_entries, posting_rules, payment_method_accounts, tax_accounts, chart_of_accounts CASCADE;`);

        await db.insert(branches).values({
            id: 'test-side-effect-branch',
            name: 'Side Effect Branch',
            isActive: true,
        });
    });

    it('records a finance exception when POS posting rules are not configured', async () => {
        await db.insert(orders).values({
            id: 'test-side-effect-order',
            type: 'TAKEAWAY',
            branchId: 'test-side-effect-branch',
            status: 'COMPLETED',
            subtotal: 100,
            tax: 14,
            total: 114,
            isPaid: true,
            paymentMethod: 'CASH',
        });

        const result = await postPosOrderEntry({
            orderId: 'test-side-effect-order',
            amount: 114,
            branchId: 'test-side-effect-branch',
            userId: 'test-user',
        });

        expect(result?.status).toBe('failed');
        expect(result && 'exceptionId' in result ? result.exceptionId : '').toBeTruthy();

        const exceptions = await db.select()
            .from(financeExceptions)
            .where(eq(financeExceptions.reference, 'test-side-effect-order'));

        expect(exceptions).toHaveLength(1);
        expect(exceptions[0].status).toBe('PENDING');
        expect(exceptions[0].reason).toBe('POSTING_RULES_NOT_CONFIGURED|POS_SALE');
    });
});
