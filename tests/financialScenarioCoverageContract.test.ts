import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateJournalLines } from '../server/utils/ledgerInvariant';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('financial scenario coverage contract', () => {
    it('routes sale accounting through sales and COGS posting', () => {
        const source = read('server/controllers/orderController.ts');
        expect(source).toContain('postPosOrderEntry');
        expect(source).toContain('postCogsForOrderEntry');
        expect(source).toContain('await postPosOrderEntry');
        expect(source).toContain('await postCogsForOrderEntry');
    });

    it('routes purchase receipt accounting through the finance posting service', () => {
        const source = read('server/controllers/purchaseOrderController.ts');
        expect(source).toContain('postPurchaseReceiptEntry');
        expect(source).toContain('const financeResult = await postPurchaseReceiptEntry');
        expect(source).toContain('PURCHASE_ORDER_RECEIPT');
    });

    it('posts refunds with an explicit branch-scoped provenance contract', () => {
        const source = read('server/services/refundService.ts');
        expect(source).toContain('referenceType: \'REFUND\'');
        expect(source).toContain("source: 'REFUND'");
        expect(source).toContain('correlationId: `REFUND:${refund.id}`');
        expect(source).toContain('REFUND_BRANCH_MISMATCH');
    });

    it('posts expenses through GL and preserves source/correlation metadata', () => {
        const source = read('server/controllers/financeController.ts');
        expect(source).toContain('GLService.postJournalEntry');
        expect(source).toContain('referenceType: body.source || \'MANUAL\'');
        expect(source).toContain('correlationId: `FINANCE_MANUAL:');
        expect(source).toContain("source: body.source || 'MANUAL'");
    });

    it('keeps day-close as a gated, auditable operation', () => {
        const source = read('server/services/dayCloseService.ts');
        expect(source).toContain('DAY_CLOSE_BLOCKED');
        expect(source).toContain("eventType: 'DAY_CLOSED'");
        expect(source).toContain('createSignedAuditLog');
    });

    it('requires every representative posting shape to balance in minor units', () => {
        const scenarios = [
            [{ accountCode: 'cash', debit: 120.25, credit: 0 }, { accountCode: 'sales', debit: 0, credit: 120.25 }],
            [{ accountCode: 'inventory', debit: 80.1, credit: 0 }, { accountCode: 'payable', debit: 0, credit: 80.1 }],
            [{ accountCode: 'refund', debit: 30, credit: 0 }, { accountCode: 'cash', debit: 0, credit: 30 }],
            [{ accountCode: 'expense', debit: 15.75, credit: 0 }, { accountCode: 'cash', debit: 0, credit: 15.75 }],
            [{ accountCode: 'close', debit: 44.44, credit: 0 }, { accountCode: 'clearing', debit: 0, credit: 44.44 }],
        ];

        for (const lines of scenarios) {
            expect(validateJournalLines(lines)).toMatchObject({ ok: true });
        }
    });
});
