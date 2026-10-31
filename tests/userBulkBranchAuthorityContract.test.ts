import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('user bulk branch authority contract', () => {
    it('scopes bulk user mutations in the controller, not only the route', () => {
        const source = fs.readFileSync('server/controllers/userController.ts', 'utf8');
        expect(source).toContain('const scopedBulkUserIds');
        expect(source).toContain('req.effectiveBranchId');
        expect(source).toContain("BRANCH_SCOPE_REQUIRED");
        expect(source).toContain('assignedBranchId === branchId');
        expect(source).toContain('const scopedIds = await scopedBulkUserIds(req, userIds);');
    });

    it('rejects assigning a non-super-admin outside the effective branch', () => {
        const source = fs.readFileSync('server/controllers/userController.ts', 'utf8');
        expect(source).toContain("BRANCH_SCOPE_VIOLATION");
        expect(source).toContain("String(req.user?.role || '').toUpperCase() !== 'SUPER_ADMIN'");
    });
});
