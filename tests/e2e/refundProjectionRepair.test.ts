import { describe, expect, it } from 'vitest';
import { refundService } from '../../server/services/refundService';

describe('refund projection repair', () => {
    it('runs a safe SQL-backed preview without mutating the legacy mirror', async () => {
        const result = await refundService.repairProjection({ dryRun: true });

        expect(result.dryRun).toBe(true);
        expect(result.branchId).toBeNull();
        expect(result.scanned).toBeGreaterThanOrEqual(0);
        expect(result.eligible).toBeGreaterThanOrEqual(result.inserted);
        expect(result.failed).toEqual([]);
    });
});
