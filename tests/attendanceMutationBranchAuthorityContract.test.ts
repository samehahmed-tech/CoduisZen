import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('attendance mutation branch authority contract', () => {
    it('normalizes body branch claims for non-super-admin mutations', () => {
        const source = fs.readFileSync('server/routes/attendanceOpsRoutes.ts', 'utf8');
        expect(source).toContain('req.body.branchId = req.effectiveBranchId');
        expect(source).toContain('service layer still validates entity ownership');
    });
});
