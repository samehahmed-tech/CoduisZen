import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('purchase return financial safety contract', () => {
    it('rolls back stock movement when the supplier credit-note GL fails', () => {
        const controller = fs.readFileSync('server/controllers/procurementController.ts', 'utf8');
        const gl = fs.readFileSync('server/services/glService.ts', 'utf8');
        expect(controller).toContain('const glEntryId = await db.transaction(async (tx) =>');
        expect(controller).toContain("referenceType: 'PURCHASE_RETURN'");
        expect(controller).toContain('}, tx);');
        expect(controller).toContain("PURCHASE_RETURN_GL_FAILED");
        expect(controller).not.toContain('best-effort GL');
        expect(controller).not.toContain('PURCHASE_RETURN_GL_FAILED\',');
        expect(gl).toContain("'PURCHASE_RETURN'");
    });

    it('keeps the response contract tied to a real journal entry id', () => {
        const source = fs.readFileSync('server/controllers/procurementController.ts', 'utf8');
        const check = source.indexOf('if (!entryId) throw Object.assign(new Error(\'PURCHASE_RETURN_GL_FAILED\')');
        const response = source.indexOf('glEntryId });', check);
        expect(check).toBeGreaterThan(-1);
        expect(response).toBeGreaterThan(check);
    });
});
