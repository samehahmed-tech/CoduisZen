import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/controllers/shiftController.ts', import.meta.url)), 'utf8');

describe('shift actor identity contract', () => {
    it('attributes an opened shift to the authenticated actor', () => {
        expect(source).toContain('const userId = req.user?.id;');
        expect(source).toContain('Never trust a');
        expect(source).toContain('client-supplied userId/user_id');
        expect(source).not.toContain('getStringParam(req.body?.userId || req.body?.user_id) || req.user?.id');
    });
});
