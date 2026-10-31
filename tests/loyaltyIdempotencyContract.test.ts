import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const loyalty = readFileSync(fileURLToPath(new URL('../server/services/loyaltyService.ts', import.meta.url)), 'utf8');
const lifecycle = readFileSync(fileURLToPath(new URL('../server/services/orderLifecycleService.ts', import.meta.url)), 'utf8');
const orderController = readFileSync(fileURLToPath(new URL('../server/controllers/orderController.ts', import.meta.url)), 'utf8');
const schema = readFileSync(fileURLToPath(new URL('../src/db/schema.ts', import.meta.url)), 'utf8');
const customerController = readFileSync(fileURLToPath(new URL('../server/controllers/customerController.ts', import.meta.url)), 'utf8');

describe('loyalty replay safety contract', () => {
    it('uses stable order references for award and clawback', () => {
        expect(loyalty).toContain('referenceId = orderId ? `ORD-AWD-${orderId}`');
        expect(loyalty).toContain('`ORD-CLB-${orderId}`');
        expect(loyalty).toContain("eq(loyaltyLedger.type, 'EARNED')");
        expect(loyalty).toContain("eq(loyaltyLedger.type, 'CLAWBACK')");
    });

    it('passes the canonical order id from completion paths', () => {
        expect(lifecycle).toContain('order.branchId || undefined, String(order.id)');
        expect(orderController).toContain('savedOrder.branchId || undefined, String(savedOrder.id)');
    });

    it('has a database-enforced operation key for new replayable entries', () => {
        expect(schema).toContain("operationKey: nvarchar('operation_key')");
        expect(loyalty).toContain('loyalty_ledger_operation_key_uq');
        expect(loyalty).toContain('CREATE UNIQUE INDEX loyalty_ledger_operation_key_uq');
        expect(loyalty).toContain("COL_LENGTH(N'dbo.loyalty_ledger', N'branch_id') IS NULL");
        expect(loyalty).toContain('branchId,');
        expect(loyalty).toContain('operationKey: orderId ? referenceId : undefined');
    });

    it('keeps loyalty balance reads inside transactions and makes redemption atomic', () => {
        expect(loyalty).toContain('const [customer] = await tx.select().top(1).from(customers)');
        expect(loyalty).toContain('gte(customers.loyaltyPoints, normalizedPoints)');
        expect(loyalty).toContain('LOYALTY_BALANCE_CHANGED_RETRY');
        expect(loyalty).toContain('LOYALTY-REDEEM:${normalizedOperationKey}');
    });

    it('passes the request idempotency key to redemption', () => {
        expect(customerController).toContain("req.get('Idempotency-Key')");
        expect(customerController).toContain('redeemPoints(customerId, Number(points), branchId, operationKey)');
    });
});
