import { describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION_POLICY, normalizeRetentionPolicy, retentionCutoff } from '../server/utils/retentionPolicy';

describe('data retention policy', () => {
    it('defaults to dry-run and preserves safe defaults', () => {
        expect(normalizeRetentionPolicy({})).toEqual(DEFAULT_RETENTION_POLICY);
        expect(normalizeRetentionPolicy({ ordersDays: 3650 }).executionMode).toBe('DRY_RUN');
    });

    it('rejects unsafe or invalid retention values', () => {
        expect(() => normalizeRetentionPolicy({ auditLogsDays: 29 })).toThrow('RETENTION_AUDITLOGSDAYS_OUT_OF_RANGE');
        expect(() => normalizeRetentionPolicy({ ordersDays: 3651 })).toThrow('RETENTION_ORDERSDAYS_OUT_OF_RANGE');
        expect(() => normalizeRetentionPolicy({ executionMode: 'AUTO_DELETE' })).toThrow('RETENTION_EXECUTION_MODE_INVALID');
    });

    it('calculates UTC cutoffs deterministically', () => {
        const now = new Date('2026-10-27T00:00:00.000Z');
        expect(retentionCutoff(30, now).toISOString()).toBe('2026-09-27T00:00:00.000Z');
    });
});

