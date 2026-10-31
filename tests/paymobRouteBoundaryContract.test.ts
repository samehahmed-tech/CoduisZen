import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
    fileURLToPath(new URL('../server/routes/paymobRoutes.ts', import.meta.url)),
    'utf8',
);
const controllerSource = readFileSync(
    fileURLToPath(new URL('../server/controllers/paymobController.ts', import.meta.url)),
    'utf8',
);
const gatewaySource = readFileSync(
    fileURLToPath(new URL('../server/services/paymentGatewayService.ts', import.meta.url)),
    'utf8',
);

describe('Paymob route boundary contract', () => {
    it('enforces branch scope on checkout and refund', () => {
        expect(routeSource).toContain("router.post('/intention', posAccess, enforceBranch, paymob.createCheckout);");
        expect(routeSource).toContain("router.post('/refund', financeAdmin, enforceBranch, paymob.refund);");
    });

    it('binds checkout to a scoped order and remaining amount', () => {
        expect(controllerSource).toContain('eq(orders.branchId, String(req.effectiveBranchId || \'\'))');
        expect(controllerSource).toContain('PAYMENT_AMOUNT_EXCEEDS_REMAINING');
        expect(controllerSource).toContain('branchId: order.branchId');
    });

    it('routes refunds through the internal approval workflow', () => {
        expect(controllerSource).toContain('paymentGatewayService.refund(String(session.id)');
        expect(controllerSource).not.toContain('await refundTransaction(transactionId, amountCents)');
        expect(gatewaySource).toContain("providerType.includes('PAYMOB') || providerType.includes('CARD')");
    });
});
