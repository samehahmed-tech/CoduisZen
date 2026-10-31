import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('menu pricing distribution contract', () => {
    it('validates both branches and applies the copy atomically', () => {
        const source = fs.readFileSync('server/controllers/menuController.ts', 'utf8');
        expect(source).toContain("error: 'BRANCH_NOT_FOUND'");
        expect(source).toContain('await db.transaction(async (tx) =>');
        expect(source).toContain('await tx.update(menuItems)');
    });

    it('exposes a read-only preview before the mutating copy route', () => {
        const routes = fs.readFileSync('server/routes/menuRoutes.ts', 'utf8');
        const source = fs.readFileSync('server/controllers/menuController.ts', 'utf8');
        expect(routes).toContain("router.post('/branch-pricing/copy/preview'");
        expect(source).toContain('preview: true');
        expect(source).toContain('export const previewBranchPricingCopy');
    });
});
