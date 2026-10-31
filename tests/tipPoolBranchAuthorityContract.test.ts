import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('tip pool branch authority contract', () => {
    it('checks pool and employee branch ownership before allocation and payout', () => {
        const source = read('server/services/tipPoolService.ts');
        const controller = read('server/controllers/p1FinanceController.ts');

        expect(source).toContain('TIP_ALLOCATION_EMPLOYEE_BRANCH_MISMATCH');
        expect(source).toContain('FORBIDDEN_BRANCH_ACCESS');
        expect(source).toContain('await db.transaction');
        expect(controller).toContain('tipPoolService.allocatePool(poolId');
        expect(controller).toContain('getBranchId(req));');
    });
});
