import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('campaign branch scope contract', () => {
    it('scopes campaigns, direct dispatch, and scheduled audiences by branch', () => {
        const controller = read('../server/controllers/campaignController.ts');
        const scheduler = read('../server/services/campaignSchedulerService.ts');
        const routes = read('../server/routes/campaignRoutes.ts');
        const schema = read('../src/db/schema.ts');
        const migration = read('../server/services/marketingSchemaService.ts');

        expect(routes).toContain('router.use(enforceBranch);');
        expect(routes).toContain("router.get('/', marketingAuth, campaignController.getCampaigns);");
        expect(routes).toContain("router.get('/stats', marketingAuth, campaignController.getCampaignStats);");
        expect(controller).toContain('branchId: req.effectiveBranchId || null');
        expect(controller).toContain('or(isNull(campaigns.branchId), eq(campaigns.branchId, branchId))');
        expect(controller).toContain('campaign_branch_orders');
        expect(scheduler).toContain('campaign_branch_orders');
        expect(schema).toContain("branchId: nvarchar('branch_id').references(() => branches.id), // null = all branches");
        expect(schema).toContain("status: nvarchar('status', { length: 50 })");
        expect(migration).toContain("ALTER TABLE dbo.campaigns ADD branch_id nvarchar(255) NULL;");
        expect(migration).toContain("ALTER TABLE dbo.campaigns ALTER COLUMN status nvarchar(50) NOT NULL;");
        expect(migration).toContain('DROP CONSTRAINT ');
        expect(migration).toContain('DF_campaigns_status');
    });
});
