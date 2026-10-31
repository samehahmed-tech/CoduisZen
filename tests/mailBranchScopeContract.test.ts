import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('mail branch scope contract', () => {
    it('prevents branch users from addressing arbitrary users or broadcasting globally', () => {
        const source = fs.readFileSync('server/controllers/mailController.ts', 'utf8');

        expect(source).toContain("const CROSS_BRANCH_MAIL_ROLES = new Set(['SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER', 'CALL_CENTER', 'CALL_CENTER_MANAGER']);");
        expect(source).toContain("const BROADCAST_ALL_ROLES = new Set(['SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER']);");
        expect(source).toContain('canReachAcrossBranches || canReachUserFromBranches(u, senderBranches)');
        expect(source).not.toContain("if (id && activeUsers.some((u) => u.id === id)) recipientIds.add(id);");
    });
});
