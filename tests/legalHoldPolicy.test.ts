import { describe, expect, it } from 'vitest';
import { isLegalHoldActive, normalizeLegalHoldInput } from '../server/utils/legalHoldPolicy';

describe('legal hold policy', () => {
    it('normalizes a valid hold and evaluates active windows', () => {
        const hold = normalizeLegalHoldInput({ caseReference: 'CASE-1', reason: 'Audit', startsAt: '2026-01-01T00:00:00Z' });
        expect(hold.endsAt).toBeNull();
        expect(isLegalHoldActive({ ...hold, active: true }, new Date('2026-06-01T00:00:00Z'))).toBe(true);
    });

    it('rejects invalid or reversed ranges and released holds', () => {
        expect(() => normalizeLegalHoldInput({ caseReference: '', reason: 'x', startsAt: '2026-01-01' })).toThrow('LEGAL_HOLD_CASE_REFERENCE_REQUIRED');
        expect(() => normalizeLegalHoldInput({ caseReference: 'x', reason: 'x', startsAt: '2026-02-01', endsAt: '2026-01-01' })).toThrow('LEGAL_HOLD_RANGE_INVALID');
        expect(isLegalHoldActive({ active: false, startsAt: '2020-01-01', endsAt: null })).toBe(false);
    });
});

