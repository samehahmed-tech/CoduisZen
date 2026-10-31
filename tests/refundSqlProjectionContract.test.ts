import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/services/refundService.ts', import.meta.url)), 'utf8');

describe('refund SQL projection contract', () => {
    it('dual-writes lifecycle states to refund_records', () => {
        expect(source).toContain('refundRecords');
        expect(source).toContain('syncRefundRecordBestEffort(refund)');
        expect(source).toContain('const sqlRefunds = await readSqlRefundProjection(filters)');
        expect(source).toContain('SQL owns financial state');
        expect(source).toContain('await db.insert(refundRecords).values(values)');
        expect(source).toContain('refund.updatedAt = new Date().toISOString()');
    });

    it('provides an explicit idempotent insert-only legacy repair path', () => {
        expect(source).toContain('async repairProjection(options?');
        expect(source).toContain('existingIds.has(String(refund.id))');
        expect(source).toContain('const dryRun = options?.dryRun !== false');
        expect(source).toContain('skippedMissingBranch');
    });
});
