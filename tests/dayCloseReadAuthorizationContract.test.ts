import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('day close read authorization contract', () => {
    it('protects reports and exports with an API-level finance/close permission', () => {
        const source = fs.readFileSync('server/routes/dayCloseRoutes.ts', 'utf8');
        expect(source).toContain('const dayCloseReadAuth = requireRoleOrPermission');
        expect(source).toContain("['OP_CLOSE_DAY']");
        expect(source).toContain("router.get('/:branchId/:date/pdf', dayCloseReadAuth, enforceBranch");
        expect(source).toContain("router.get('/:branchId/:date/xlsx', dayCloseReadAuth, enforceBranch");
        expect(source).toContain("router.get('/:branchId/:date', dayCloseReadAuth, enforceBranch");
        expect(source).not.toContain("router.get('/:branchId/:date', enforceBranch, getDayCloseReport)");
    });
});
