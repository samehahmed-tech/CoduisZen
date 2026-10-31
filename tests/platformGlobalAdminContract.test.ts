import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    fileURLToPath(new URL('../server/routes/platformsRoutes.ts', import.meta.url)),
    'utf8',
);

describe('global delivery platform authorization contract', () => {
    it('restricts global platform configuration writes to top-level administrators', () => {
        expect(source).toContain("const platformAdmin = requireRoleOrPermission(\n    ['SUPER_ADMIN', 'OWNER']");
        expect(source).not.toContain("['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER']");
    });
});
