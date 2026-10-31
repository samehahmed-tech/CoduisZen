import { describe, expect, it } from 'vitest';
import { resolveJournalProvenance } from '../server/utils/financeProvenance';

describe('journal provenance', () => {
    it('keeps explicit source, actor, and correlation for traceable retries', () => {
        expect(resolveJournalProvenance({
            referenceType: 'ORDER',
            reference: 'order-1',
            source: 'POS_ORDER',
            actorId: 'cashier-1',
            correlationId: 'request-1',
        })).toEqual({
            source: 'POS_ORDER',
            actorId: 'cashier-1',
            correlationId: 'request-1',
        });
    });

    it('provides safe defaults and bounds untrusted metadata', () => {
        const result = resolveJournalProvenance({
            referenceType: 'MANUAL',
            createdBy: '',
            source: 'x'.repeat(140),
        });

        expect(result.source).toHaveLength(100);
        expect(result.actorId).toBe('system');
        expect(result.correlationId.startsWith('MANUAL:manual:')).toBe(true);
        expect(result.correlationId.length).toBeLessThanOrEqual(255);
    });
});
