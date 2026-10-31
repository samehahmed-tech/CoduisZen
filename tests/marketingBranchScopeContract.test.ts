import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('marketing branch scope contract', () => {
    it('scopes complaint routes and persists complaint branch provenance', () => {
        const routes = read('../server/routes/marketingRoutes.ts');
        const controller = read('../server/controllers/marketingController.ts');
        const schema = read('../src/db/schema.ts');
        const migration = read('../server/services/marketingSchemaService.ts');

        expect(routes).toContain('router.use(enforceBranch);');
        expect(controller).toContain('eq(customerComplaints.branchId, branchId)');
        expect(controller).toContain('branchId,');
        expect(controller).toContain("error: 'ORDER_CUSTOMER_MISMATCH'");
        expect(controller).toContain('canAccessBranch(req.user, existing.branchId)');
        expect(schema).toContain("branchId: nvarchar('branch_id').references(() => branches.id),");
        expect(migration).toContain("ALTER TABLE dbo.customer_complaints ADD branch_id nvarchar(255) NULL;");
    });
});
