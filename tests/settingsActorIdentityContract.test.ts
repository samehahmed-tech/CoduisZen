import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    fileURLToPath(new URL('../server/controllers/settingsController.ts', import.meta.url)),
    'utf8',
);

describe('settings actor identity contract', () => {
    it('uses the authenticated user for individual updates', () => {
        expect(source).toContain('updatedBy: req.user?.id || null');
        expect(source).not.toContain('updatedBy: updated_by');
    });

    it('uses the authenticated user for bulk updates', () => {
        expect(source).toContain('upsertSetting({ key, value, updatedBy: req.user?.id || null })');
        expect(source).not.toContain('const { value, category, updated_by } = req.body');
    });
});
