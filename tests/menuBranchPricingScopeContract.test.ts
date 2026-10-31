import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scopeMenuItemsToBranch } from '../server/utils/menuPricingScope';

const source = readFileSync(fileURLToPath(new URL('../server/controllers/menuController.ts', import.meta.url)), 'utf8');
const routes = readFileSync(fileURLToPath(new URL('../server/routes/menuRoutes.ts', import.meta.url)), 'utf8');

describe('menu branch pricing scope contract', () => {
    it('checks access to both source and destination branches before copying prices', () => {
        expect(source).toContain("import { canAccessBranch } from '../middleware/branchIsolation';");
        expect(source).toContain('!canAccessBranch(req.user, fromBranchId) || !canAccessBranch(req.user, toBranchId)');
        expect(source).toContain("error: 'BRANCH_MISMATCH'");
    });

    it('scopes menu read cache keys and branch pricing projections', () => {
        expect(source).toContain("import { scopeMenuItemsToBranch } from '../utils/menuPricingScope';");
        expect(source).toContain('menu:items:${branchId || \'ALL\'}');
        expect(source).toContain('menu:full:${branchId || \'ALL\'}');
        expect(routes).toContain("router.get('/items', scopeBranchQuery, menuController.getMenuItems);");
        expect(routes).toContain("router.get('/full', scopeBranchQuery, menuController.getFullMenu);");
    });

    it('returns only the requested branch pricing entries', () => {
        const [item] = scopeMenuItemsToBranch([
            {
                id: 'item-1',
                branchPricing: [
                    { branchId: 'branch-a', price: 100 },
                    { branchId: 'branch-b', price: 120 },
                ],
            },
        ], 'branch-a');

        expect(item.branchPricing).toEqual([{ branchId: 'branch-a', price: 100 }]);
    });
});
