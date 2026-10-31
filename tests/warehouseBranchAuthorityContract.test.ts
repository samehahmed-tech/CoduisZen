import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('warehouse branch authority contract', () => {
    it('derives create branch from the server scope for non-super-admin users', () => {
        const source = read('server/controllers/warehouseController.ts');
        expect(source).toContain("req.user?.role === 'SUPER_ADMIN'");
        expect(source).toContain(': req.effectiveBranchId;');
    });

    it('rejects branch reassignment of an existing warehouse outside super-admin topology control', () => {
        const source = read('server/controllers/warehouseController.ts');
        expect(source).toContain('WAREHOUSE_BRANCH_REASSIGNMENT_FORBIDDEN');
        expect(source).toContain("req.user?.role !== 'SUPER_ADMIN'");
        expect(source).toContain(': current.branchId,');
    });
});
