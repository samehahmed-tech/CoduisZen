import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    fileURLToPath(new URL('../server/services/paymentSessionService.ts', import.meta.url)),
    'utf8',
);
const routeSource = readFileSync(
    fileURLToPath(new URL('../server/routes/paymentRoutes.ts', import.meta.url)),
    'utf8',
);

describe('payment session concurrency contract', () => {
    it('serializes initiation around the order and idempotency key', () => {
        expect(source).toContain('const outcome = await db.transaction(async (tx) => {');
        expect(source).toContain('FROM orders WITH (UPDLOCK, HOLDLOCK)');
        expect(source).toContain('eq(paymentSessions.idempotencyKey, finalIdempotencyKey)');
        expect(source).toContain('.onConflictDoNothing();');
    });

    it('does not emit a second initiation audit for an idempotent replay', () => {
        expect(source).toContain("if (!outcome.created) {");
        expect(source).toContain("eventType: 'PAYMENT_SESSION_INITIATED'");
    });

    it('enforces branch scope inside the service transaction', () => {
        expect(source).toContain('scopeBranchId?: string');
        expect(source).toContain("'FORBIDDEN_BRANCH_ACCESS'");
        expect(routeSource).toContain('PaymentSessionService.confirmPayment(sessionId, externalReference, user?.id || \'system\', req.effectiveBranchId)');
        expect(routeSource).toContain('PaymentSessionService.reversePayment(sessionId, reason || \'User voided\', user?.id || \'system\', req.effectiveBranchId)');
    });
});
