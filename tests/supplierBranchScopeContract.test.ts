import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('supplier branch scope contract', () => {
    it('binds supplier reads and writes to the effective branch middleware', () => {
        const route = fs.readFileSync('server/routes/supplierRoutes.ts', 'utf8');
        const controller = fs.readFileSync('server/controllers/supplierController.ts', 'utf8');

        expect(route).toContain("router.get('/', enforceBranch, supplierController.getSuppliers);");
        expect(route).toContain("router.post('/', procurementAuth, enforceBranch, supplierController.createSupplier);");
        expect(route).toContain("router.put('/:id', procurementAuth, enforceBranch, supplierController.updateSupplier);");
        expect(route).toContain("router.delete('/:id', procurementAuth, enforceBranch, supplierController.deactivateSupplier);");
        expect(controller).toContain('or(isNull(suppliers.branchId), eq(suppliers.branchId, req.effectiveBranchId))');
        expect(controller).toContain('return eq(suppliers.branchId, req.effectiveBranchId);');
        expect(controller).toContain('branchId: req.effectiveBranchId || null');
        expect(controller).toContain('delete updates.id;');
        expect(controller).toContain('delete updates.branchId;');
    });

    it('keeps legacy global supplier rows readable but not writable by branch users', () => {
        const controller = fs.readFileSync('server/controllers/supplierController.ts', 'utf8');
        expect(controller).toContain("['SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER']");
        expect(controller).toContain('const currentWhere = scope ? and(eq(suppliers.id, id), scope) : eq(suppliers.id, id);');
    });
});
