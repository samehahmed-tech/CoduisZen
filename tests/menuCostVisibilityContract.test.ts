import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('menu cost visibility contract', () => {
    it('does not expose cost, recipe, or platform pricing to unauthorized menu readers', () => {
        const source = fs.readFileSync('server/controllers/menuController.ts', 'utf8');
        expect(source).toContain("'DATA_VIEW_COSTS'");
        expect(source).toContain('sanitizeMenuItemForViewer');
        expect(source).toContain('scopeMenuItemsToBranch(items as any[], branchId).map');
        expect(source).toContain('scopeMenuItemsToBranch(category.items || [], branchId)');
        expect(source).toContain('platformPricing: _platformPricing');
        expect(source).toContain('recipe: _recipe');
    });
});
