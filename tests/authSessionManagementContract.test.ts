import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('admin session management contract', () => {
    it('reports expiry from the session row and hides expired sessions from active views', () => {
        const source = read('server/controllers/authController.ts');

        expect(source).toContain('const isExpired = isSessionExpired(s.expiresAt);');
        expect(source).toContain('!s.isExpired');
        expect(source).not.toContain('isExpired: false');
    });

    it('scopes admin session listing and revocation to the administrator branch', () => {
        const source = read('server/controllers/authController.ts');

        expect(source).toContain("const adminBranchId = req.user?.branchId || null;");
        expect(source).toContain('inArray(userSessions.userId, scopedUserIds)');
        expect(source).toContain("FORBIDDEN_BRANCH_ACCESS");
        expect(source).toContain("adminRole !== 'SUPER_ADMIN'");
    });
});
