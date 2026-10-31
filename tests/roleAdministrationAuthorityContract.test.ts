import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('role administration authority contract', () => {
    it('keeps global role and permission policy in Head Office roles', () => {
        const source = fs.readFileSync('server/routes/rolesRoutes.ts', 'utf8');
        expect(source).toContain("const readAccess = requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER');");
        expect(source).toContain("const writeAccess = requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER');");
        expect(source).not.toContain('requireRoleOrPermission');
        expect(source).not.toContain('BRANCH_MANAGER');
        expect(source).not.toContain('CFG_MANAGE_ROLES');
    });
});
