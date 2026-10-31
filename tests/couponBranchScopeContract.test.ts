import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('coupon branch scope contract', () => {
    it('keeps global coupons compatible while enforcing branch-specific coupons', () => {
        const marketing = read('../server/controllers/marketingController.ts');
        const orders = read('../server/controllers/orderController.ts');
        const routes = read('../server/routes/orderRoutes.ts');
        const schema = read('../src/db/schema.ts');
        const migration = read('../server/services/marketingSchemaService.ts');

        expect(marketing).toContain('branchId ? or(isNull(coupons.branchId), eq(coupons.branchId, branchId))');
        expect(marketing).toContain('branchId,');
        expect(orders).toContain('or(isNull(couponsTable.branchId), eq(couponsTable.branchId, effectiveCouponBranchId))');
        expect(orders).toContain('or(isNull(coupons.branchId), eq(coupons.branchId, orderData.branchId))');
        expect(routes).toContain("router.post('/coupons/validate', posAuth, enforceBranch");
        expect(schema).toContain("branchId: nvarchar('branch_id').references(() => branches.id), // null = all branches");
        expect(migration).toContain("ALTER TABLE dbo.coupons ADD branch_id nvarchar(255) NULL;");
    });
});
