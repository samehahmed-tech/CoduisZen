import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    fileURLToPath(new URL('../server/services/paymobSettlementService.ts', import.meta.url)),
    'utf8',
);

describe('Paymob settlement transaction contract', () => {
    it('keeps payment, session, and order projections in one transaction', () => {
        expect(source).toContain('return db.transaction(async (tx) => {');
        expect(source).toContain('await tx.update(paymentSessions)');
        expect(source).toContain('await tx.update(orders)');
        expect(source).not.toContain('await db.update(paymentSessions)');
        expect(source).not.toContain('await db.update(orders)');
    });

    it('makes deterministic callback inserts safe to retry', () => {
        expect(source).toContain('.onConflictDoNothing();');
    });
});
