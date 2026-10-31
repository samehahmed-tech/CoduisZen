import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
    fileURLToPath(new URL('../server/routes/talabatAdminRoutes.ts', import.meta.url)),
    'utf8',
);
const controllerSource = readFileSync(
    fileURLToPath(new URL('../server/controllers/talabatAdminController.ts', import.meta.url)),
    'utf8',
);

describe('Talabat branch scope contract', () => {
    it('applies centralized branch scope to the complete admin surface', () => {
        expect(routeSource).toContain('router.use(talabatAdmin, scopeBranchQuery);');
        expect(routeSource).toContain("const talabatConfigAdmin = requireRoles('SUPER_ADMIN', 'OWNER');");
        expect(routeSource).toContain("router.put('/config', talabatConfigAdmin, admin.updateConfig);");
    });

    it('filters order reads and syncs by effective branch', () => {
        expect(controllerSource).toContain('req.effectiveBranchId ? eq(orders.branchId, req.effectiveBranchId) : undefined');
        expect(controllerSource).toContain('const assertVendorBranchScope = async');
    });

    it('requires mapped vendors for branch-scoped operations', () => {
        expect(controllerSource).toContain("VENDOR_BRANCH_MAPPING_REQUIRED");
        expect(controllerSource).toContain('for (const vendor of vendors) await assertVendorBranchScope(req, String(vendor));');
    });
});
