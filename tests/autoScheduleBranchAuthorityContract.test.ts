import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('auto schedule branch authority contract', () => {
    it('uses the server-resolved branch for the preview route', () => {
        const source = fs.readFileSync('server/routes/hrExtendedRoutes.ts', 'utf8');
        const route = source.slice(source.indexOf("router.post('/schedules/plans/:id/auto-preview'"), source.indexOf("router.get('/schedules/entries'"));
        expect(route).toContain('req.effectiveBranchId');
        expect(route).not.toContain('req.query.branchId');
    });
});
