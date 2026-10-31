import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('barcode branch and privacy contract', () => {
    it('requires branch scope for operational barcode lookups', () => {
        const routes = fs.readFileSync('server/routes/barcodeRoutes.ts', 'utf8');
        const controller = fs.readFileSync('server/controllers/barcodeLookupController.ts', 'utf8');

        expect(routes).toContain("router.get('/lookup/:code', posAuth, enforceBranch, unifiedBarcodeLookup);");
        expect(routes).toContain("router.get('/check/:code', managerAuth, enforceBranch, checkBarcodeExists);");
        expect(routes).toContain("router.get('/menu/:code', posAuth, enforceBranch, lookupMenuItemByBarcode);");
        expect(routes).toContain("router.get('/inventory/:code', posAuth, enforceBranch, lookupInventoryItemByBarcode);");
        expect(controller).not.toContain('cost_price as \"costPrice\"');
        expect(controller).not.toContain('purchase_price as \"purchasePrice\"');
    });
});
