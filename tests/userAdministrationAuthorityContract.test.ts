import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('user administration authority contract', () => {
    it('keeps tenant-wide identity administration in Head Office roles', () => {
        const source = fs.readFileSync('server/routes/userRoutes.ts', 'utf8');
        expect(source).toContain("const manageUsersAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER');");
        expect(source).not.toContain('requireRoleOrPermission');
        expect(source).not.toContain('CFG_MANAGE_USERS');
        expect(source).toContain("router.get('/export/csv', manageUsersAuth, userController.exportUsersCSV);");
        expect(source).toContain("router.put('/:id/branch-access', manageUsersAuth, userController.updateBranchAccess);");
    });
});
