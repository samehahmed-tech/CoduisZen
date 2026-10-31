import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('labor forecast branch authority contract', () => {
    it('uses the server-resolved effective branch and does not trust query branch input', () => {
        const source = fs.readFileSync('server/routes/hrExtendedRoutes.ts', 'utf8');
        const route = source.slice(source.indexOf("router.get('/labor-forecast'"), source.indexOf("router.post('/self-service/leave-requests'"));
        expect(route).toContain('req.effectiveBranchId');
        expect(route).not.toContain('req.query.branchId');
    });
});
