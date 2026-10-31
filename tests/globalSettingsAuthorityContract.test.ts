import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('global settings authority contract', () => {
    it('does not grant branch managers mutation access to the global settings table', () => {
        const source = fs.readFileSync('server/routes/settingsRoutes.ts', 'utf8');
        expect(source).toContain("const settingsAdmin = requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER');");
        expect(source).not.toContain('BRANCH_MANAGER');
        expect(source).not.toContain('CFG_MANAGE_SETTINGS');
    });
});
