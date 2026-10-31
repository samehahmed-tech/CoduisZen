import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('report utility contract', () => {
    it('uses centralized date validation and effective branch authority', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/report/reportUtils.ts'), 'utf8');
        expect(source).toContain('normalizeBusinessDate');
        expect(source).toContain('req.effectiveBranchId');
        expect(source).toContain('canAccessBranch(user, effectiveRequestedId)');
    });
});
