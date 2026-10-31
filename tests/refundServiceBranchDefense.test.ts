import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const service = readFileSync(fileURLToPath(new URL('../server/services/refundService.ts', import.meta.url)), 'utf8');
const controller = readFileSync(fileURLToPath(new URL('../server/controllers/refundController.ts', import.meta.url)), 'utf8');
const gateway = readFileSync(fileURLToPath(new URL('../server/services/paymentGatewayService.ts', import.meta.url)), 'utf8');

describe('refund service branch defense contract', () => {
    it('rechecks branch ownership inside service mutations, not only in HTTP middleware', () => {
        expect(service).toContain("const assertRefundBranch = (refund: RefundRequest, expectedBranchId?: string)");
        expect(service).toContain("throw new Error('REFUND_BRANCH_MISMATCH')");
        expect(service).toContain('assertRefundBranch(refund, expectedBranchId);');
        expect(controller).toContain('req.effectiveBranchId');
        expect(gateway).toContain('processRefund(refundId, input.processedBy, input.branchId)');
    });
});
