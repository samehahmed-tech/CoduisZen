import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('auto schedule apply contract', () => {
    it('requires explicit confirmation and uses one transaction for inserts', () => {
        const route = fs.readFileSync('server/routes/hrExtendedRoutes.ts', 'utf8');
        const service = fs.readFileSync('server/services/schedulingService.ts', 'utf8');
        expect(route).toContain("req.body?.confirm !== true");
        expect(route).toContain("AUTO_SCHEDULE_CONFIRMATION_REQUIRED");
        expect(service).toContain('return db.transaction(async (tx)');
        expect(service).toContain('AUTO_SCHEDULE_REQUIRES_EMPTY_PLAN');
        expect(service).toContain('tx.insert(shiftPlanEntries)');
    });
});
