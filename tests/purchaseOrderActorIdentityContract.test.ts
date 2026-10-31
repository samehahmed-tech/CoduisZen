import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/controllers/purchaseOrderController.ts', import.meta.url)), 'utf8');

describe('purchase order actor identity contract', () => {
    it('uses the authenticated actor for PO creation and receipt effects', () => {
        expect(source).toContain("const actorId = req.user?.id || 'system';");
        expect(source).toContain('createdBy: actorId');
        expect(source).toContain('performedBy: actorId');
        expect(source).toContain('userId: actorId');
        expect(source).toContain('const branchId = req.effectiveBranchId || requestedBranchId;');
        expect(source).toContain("throw new Error('PO_TARGET_WAREHOUSE_MISMATCH');");
        expect(source).toContain("throw new Error('WAREHOUSE_BRANCH_MISMATCH');");
        expect(source).toContain("throw new Error('WAREHOUSE_NOT_FOUND');");
        expect(source).not.toContain('createdBy } = req.body');
        expect(source).not.toContain('receivedBy } = req.body');
        expect(source).not.toContain('receivedBy ||');
    });
});
