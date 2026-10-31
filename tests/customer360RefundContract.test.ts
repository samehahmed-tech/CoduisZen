import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/controllers/customerController.ts', import.meta.url)), 'utf8');

describe('customer 360 refund contract', () => {
    it('projects refunds from the existing refund service and keeps branch scope', () => {
        expect(source).toContain("import { refundService } from '../services/refundService'");
        expect(source).toContain('orderIds: [...customerOrderIds]');
        expect(source).toContain('refundService.getRefunds({');
        expect(source).toContain('refundsPagination');
        expect(source).toContain('refundCount: refundTotal');
        expect(source).toContain('allRefunds.filter');
        expect(source).toContain('eq(loyaltyLedger.branchId, branchId)');
        expect(source).toContain('eq(walletTransactions.branchId, branchId)');
        expect(source).toContain('refundedValue');
    });
});
