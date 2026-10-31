import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('print gateway branch authority contract', () => {
    it('resolves protected print management to the server branch scope', () => {
        const routes = fs.readFileSync('server/routes/printGatewayRoutes.ts', 'utf8');
        const controller = fs.readFileSync('server/controllers/printGatewayController.ts', 'utf8');
        const service = fs.readFileSync('server/services/printerBridgeService.ts', 'utf8');
        expect(routes).toContain("router.use('/jobs', authenticateToken, scopeBranchQuery);");
        expect(routes).toContain('scopeBranchQuery, getBridges');
        expect(controller).toContain('if (req.effectiveBranchId) return req.effectiveBranchId;');
        expect(controller).toContain('const registry = await getBridgeRegistry(branchId);');
        expect(service).toContain('AND ($1 IS NULL OR branch_id = $1)');
    });
});
