import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    fileURLToPath(new URL('../server/routes/branchRoutes.ts', import.meta.url)),
    'utf8',
);

describe('branch topology authorization contract', () => {
    it('restricts branch creation and deletion to top-level administrators', () => {
        expect(source).toContain("const branchTopologyAdmin = requireRoleOrPermission(\n    ['SUPER_ADMIN', 'OWNER']");
        expect(source).toContain("router.post('/', branchTopologyAdmin");
        expect(source).toContain("router.delete('/:id', branchTopologyAdmin");
        expect(source).not.toContain("['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER']");
    });

    it('branch-binds branch manager updates', () => {
        expect(source).toContain("router.put('/:id', branchUpdateAuth, enforceBranch");
    });
});
