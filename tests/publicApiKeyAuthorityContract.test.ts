import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('public API key authority contract', () => {
    it('keeps multi-branch API key management in Head Office and IT roles', () => {
        const source = fs.readFileSync('server/routes/publicApiKeyRoutes.ts', 'utf8');
        expect(source).toContain("const managePublicApiKeys = requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER', 'IT');");
        expect(source).not.toContain('requireRoleOrPermission');
        expect(source).not.toContain('CFG_MANAGE_PUBLIC_API_KEYS');
    });
});
