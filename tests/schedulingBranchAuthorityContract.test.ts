import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('scheduling branch authority contract', () => {
    it('validates plan, employee, and entry ownership inside the scheduling service', () => {
        const source = read('server/services/schedulingService.ts');

        expect(source).toContain('SHIFT_PLAN_BRANCH_MISMATCH');
        expect(source).toContain('SHIFT_EMPLOYEE_BRANCH_MISMATCH');
        expect(source).toContain('SHIFT_ENTRY_BRANCH_MISMATCH');
        expect(source).toContain('employees.branchId');
    });
});
