import { describe, expect, it } from 'vitest';
import { buildLedgerCorrelationId } from '../server/utils/ledgerCorrelation';

describe('ledger correlation idempotency key', () => {
    it('prefers an explicit correlation id for safe retries', () => {
        expect(buildLedgerCorrelationId('order-1', 'session-1', 'PAYMENT', 'retry-123')).toBe('retry-123');
    });

    it('derives a stable key from the transaction reference', () => {
        expect(buildLedgerCorrelationId('order-1', null, 'PAYMENT')).toBe('PAYMENT:order-1:-');
        expect(buildLedgerCorrelationId(null, 'session-1')).toBe('LEGACY_LEDGER:-:session-1');
    });

    it('bounds the key to the database column size', () => {
        expect(buildLedgerCorrelationId('x'.repeat(400), null)).toHaveLength(255);
    });
});
