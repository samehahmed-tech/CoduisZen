import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('financial provenance contract', () => {
    it('passes explicit provenance for non-controller GL posting sources', () => {
        const sources = [
            ['server/services/bankingService.ts', ['actorId: settledBy', "source: 'WALLET_TRANSFER'", 'correlationId: `WALLET_TRANSFER:${transfer.id}`']],
            ['server/services/financeEngine.ts', ["source: 'FINANCE_RECONCILIATION'", 'actorId: entry.updatedBy || \'system\'', 'correlationId: `FINANCE_RECONCILIATION:${entry.referenceId || \'manual\'}`']],
            ['server/services/giftCardService.ts', ['actorId: createdBy || \'system\'', 'source: `GIFT_CARD_${referenceType}`', 'correlationId: `GIFT_CARD:${reference}`']],
            ['server/services/financePostingService.ts', ["source: 'PURCHASE_RECEIPT'", "source: 'COGS'", "source: 'COGS_REVERSAL'", "source: 'INVENTORY_ADJUSTMENT'", "source: 'INVENTORY_ADJUSTMENT_REVERSAL'", "source: 'WASTAGE'", "source: 'PRODUCTION_COMPLETION'"]],
            ['server/services/payrollGlPostingService.ts', ["source: 'PAYROLL'", 'actorId: createdBy', 'correlationId: `PAYROLL:${run.id}`']],
            ['server/services/payrollReopenService.ts', ["source: 'PAYROLL_REVERSAL'", 'actorId: input.reopenedBy']],
            ['server/services/drawerReconciliationService.ts', ["source: 'DRAWER_DISCREPANCY'", 'actorId: approvedBy']],
            ['server/services/treasuryService.ts', ["source: 'TREASURY_VOUCHER'", 'actorId: approvedBy']],
            ['server/services/walletService.ts', ["source: 'WALLET_DEPOSIT'", "source: 'WALLET_PAYMENT'", 'actorId: \'system\'']],
            ['server/services/refundService.ts', ["source: 'REFUND'", 'actorId: processedBy', 'correlationId: `REFUND:${refund.id}`']],
        ] as const;

        for (const [file, markers] of sources) {
            const source = read(file);
            for (const marker of markers) expect(source).toContain(marker);
        }
    });

    it('keeps procurement and tip-payout postings attributable', () => {
        for (const [file, markers] of [
            ['server/controllers/procurementController.ts', ["source: 'PURCHASE_RETURN'", "source: 'SUPPLIER_INVOICE'", "source: 'SUPPLIER_INVOICE_APPROVAL'"]],
            ['server/services/tipPoolService.ts', ["source: 'TIP_PAYOUT'", 'actorId: paidOutBy || pool.allocatedBy || \'system\'']],
        ] as const) {
            const source = read(file);
            for (const marker of markers) expect(source).toContain(marker);
        }
    });

    it('keeps manual finance posting tied to the authenticated actor and request correlation', () => {
        const source = read('server/controllers/financeController.ts');
        expect(source).toContain("actorId: req.user?.id || 'system'");
        expect(source).toContain("source: body.source || 'MANUAL'");
        expect(source).toContain('correlationId: `FINANCE_MANUAL:${body.referenceId || req.requestId || Date.now()}`');
    });

    it('keeps POS order posting correlation stable across retries', () => {
        const source = read('server/services/financePostingService.ts');
        expect(source).toContain("correlationId: `POS_ORDER:${order.id}`");
    });

    it('does not mark an account transfer complete when its GL posting fails', () => {
        const source = read('server/services/bankingService.ts');
        expect(source).toContain('return db.transaction(async (tx) =>');
        expect(source).toContain("status: 'PROCESSING'");
        expect(source).toContain("status: 'COMPLETED'");
        expect(source).toContain("TRANSFER_GL_POSTING_FAILED");
        expect(source).toContain('}, tx);');
        expect(source).not.toContain('GL posting for transfer skipped');
    });

    it('does not resolve a drawer discrepancy before its financial GL posting succeeds', () => {
        const source = read('server/services/drawerReconciliationService.ts');
        expect(source).toContain('return db.transaction(async (tx) =>');
        expect(source).toContain("resolution: 'PROCESSING'");
        expect(source).toContain("DRAWER_GL_POSTING_FAILED");
        expect(source).toContain('}, tx);');
        expect(source).not.toContain('GL posting for discrepancy skipped');
    });

    it('does not mark tip allocations paid out before GL posting succeeds', () => {
        const source = read('server/services/tipPoolService.ts');
        expect(source).toContain('return db.transaction(async (tx) =>');
        expect(source).toContain("status: 'PROCESSING'");
        expect(source).toContain("TIP_GL_POSTING_FAILED");
        expect(source).toContain('}, tx);');
        expect(source).not.toContain('GL posting for payout skipped');
    });

    it('keeps tip rounding dust on the final allocation row', () => {
        const source = read('server/services/tipPoolService.ts');
        expect(source).toContain('i === allocationEmployees.length - 1');
    });
});
