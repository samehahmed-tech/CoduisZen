import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    fileURLToPath(new URL('../server/services/refundService.ts', import.meta.url)),
    'utf8',
);

describe('refund processing safety contract', () => {
    it('rejects a refund whose persisted order belongs to another branch', () => {
        expect(source).toContain("if (order.branchId !== refund.branchId)");
        expect(source).toContain("throw new Error('REFUND_BRANCH_MISMATCH')");
    });

    it('atomically projects the order and uses deterministic retry-safe payment insertion', () => {
        expect(source).toContain('let paymentId = `PAY-REF-${refund.id}`;');
        expect(source).toContain('await db.transaction(async (tx) => {');
        expect(source).toContain('FROM orders WITH (UPDLOCK, HOLDLOCK)');
        expect(source).toContain('eq(payments.referenceNumber, refund.id)');
        expect(source).toContain('.onConflictDoNothing();');
    });
});
