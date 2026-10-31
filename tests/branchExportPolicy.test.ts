import { describe, expect, it } from 'vitest';
import { assertBranchExportRange, MAX_BRANCH_EXPORT_DAYS } from '../server/utils/branchExportPolicy';

describe('branch export policy', () => {
    it('accepts bounded ISO date ranges', () => {
        expect(() => assertBranchExportRange('2026-01-01', '2026-12-31')).not.toThrow();
    });

    it('rejects reversed or oversized ranges', () => {
        expect(() => assertBranchExportRange('2026-02-01', '2026-01-01')).toThrow('INVALID_BRANCH_EXPORT_DATE_RANGE');
        expect(() => assertBranchExportRange('2025-01-01', '2026-01-03')).toThrow('BRANCH_EXPORT_DATE_RANGE_TOO_LARGE');
        expect(MAX_BRANCH_EXPORT_DAYS).toBe(366);
    });
});
