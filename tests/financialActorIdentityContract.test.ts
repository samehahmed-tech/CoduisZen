import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('financial actor identity contract', () => {
    it('does not trust client-supplied actor fields in sensitive mutations', () => {
        const sources = [
            read('../server/controllers/budgetController.ts'),
            read('../server/controllers/dayCloseController.ts'),
            read('../server/controllers/inventoryCountController.ts'),
            read('../server/controllers/procurementController.ts'),
            read('../server/controllers/orderController.ts'),
            read('../server/controllers/inventoryController.ts'),
            read('../server/controllers/kdsController.ts'),
            read('../server/controllers/p1FinanceController.ts'),
            read('../server/controllers/refundController.ts'),
        ];

        for (const source of sources) {
            expect(source).not.toContain('req.body.createdBy');
            expect(source).not.toContain('req.body.userId');
            expect(source).not.toContain('body.createdBy');
        }

        expect(sources[0]).toContain("const userId = req.user?.id || 'system';");
        expect(sources[1]).toContain('const userId = req.user?.id;');
        expect(sources[2]).toContain("const actorId = req.user?.id || 'system';");
        expect(sources[3]).toContain("const userId = String((req as any)?.user?.id || 'system');");
        expect(sources[4]).toContain("const actorId = req.user?.id || 'system';");
        expect(sources[4]).toContain('processedBy: actorId');
        expect(sources[4]).not.toContain('const { items, userId, ...bodyData } = req.body;');
        expect(sources[5]).toContain("const actorId = req.user?.id || 'system';");
        expect(sources[5]).not.toContain('actor_id');
        expect(sources[5]).not.toContain('req.body?.requestedBy');
        expect(sources[5]).toContain("if (req.effectiveBranchId && warehouse.branchId !== req.effectiveBranchId)");
        expect(sources[5]).toContain("if (req.effectiveBranchId && (sourceWarehouse.branchId !== req.effectiveBranchId || destWarehouse.branchId !== req.effectiveBranchId))");
        expect(sources[5]).toContain("error: 'SOURCE_BRANCH_MISMATCH'");
        expect(sources[6]).not.toContain('req.body?.completedBy');
        expect(sources[6]).not.toContain('req.body?.completedByName');
        expect(sources[7]).not.toContain('req.body?.openedBy');
        expect(sources[7]).toContain("const openedBy = req.user?.id || 'system';");
        expect(sources[8]).not.toContain('req.body.requestedByName');
        expect(sources[8]).not.toContain('req.body.approvedByName');
        expect(sources[8]).toContain('requestedByName: actorName');
        expect(sources[8]).toContain("req.user?.name || req.user?.id || 'system'");
    });
});
