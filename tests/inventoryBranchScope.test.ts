import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('inventory read and count branch-scope contract', () => {
    it('protects intelligence and wastage routes with server-side branch enforcement', () => {
        const intelligenceRoutes = read('server/routes/inventoryIntelligenceRoutes.ts');
        expect(intelligenceRoutes).toContain('router.use(inventoryIntelligenceAuth)');
        expect(intelligenceRoutes).toContain('router.use(enforceBranch)');
        expect(read('server/routes/wastageRoutes.ts')).toContain('router.use(enforceBranch)');
        expect(read('server/routes/wastageRoutes.ts')).toContain('wastageReadAuth');
    });

    it('passes effective branch scope through inventory intelligence resource operations', () => {
        const source = read('server/controllers/inventoryIntelligenceController.ts');
        expect(source).toContain('getReorderAlerts(warehouseId, req.effectiveBranchId)');
        expect(source).toContain('createStockCountSession(warehouseId, req.user?.id || \'system\', req.effectiveBranchId)');
        expect(source).toContain('updateStockCount(String(sessionId), counts, req.user?.id || \'system\', req.effectiveBranchId)');
        expect(source).toContain('req.effectiveBranchId);');
    });

    it('filters wastage reports by the server-derived warehouse branch', () => {
        const source = read('server/controllers/wastageController.ts');
        expect(source).toContain('eq(warehouses.branchId, req.effectiveBranchId)');
    });

    it('keeps the AI forecast cache isolated by branch', () => {
        const source = read('server/services/inventoryIntelligence.ts');
        expect(source).toContain("const forecastCacheKey = `forecast_${branchId || 'global'}_${itemId}_${dataAsOf || 'none'}`;");
        expect(source).toContain('getCachedInsight(forecastCacheKey');
    });
});
