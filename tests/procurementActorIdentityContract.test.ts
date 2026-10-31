import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/controllers/procurementController.ts', import.meta.url)), 'utf8');

describe('procurement actor identity contract', () => {
    it('attributes GRN and supplier invoice effects to the authenticated actor', () => {
        expect(source).toContain('const actorId = req.user?.id || \'system\';');
        expect(source).toContain('const databaseActorId = req.user?.id || null;');
        expect(source).toContain('receivedBy: databaseActorId');
        expect(source).toContain('performedBy: actorId');
        expect(source).toContain('createdBy: actorId');
        expect(source).toContain('actorId,');
        expect(source).toContain('req.effectiveBranchId || branchId');
        expect(source).not.toContain('receivedBy: userId');
        expect(source).toContain('createdBy: actorId');
    });
});
