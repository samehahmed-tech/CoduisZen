import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/routes/hrExtendedRoutes.ts', import.meta.url)), 'utf8');

describe('HR actor identity contract', () => {
    it('never trusts client-supplied actors for payroll and HR mutations', () => {
        expect(source).not.toContain('req.body.requestedBy');
        expect(source).not.toContain('req.body.closedBy');
        expect(source).not.toContain('req.body.createdBy');
        expect(source).not.toContain('req.body.approvedBy');
        expect(source).not.toContain('req.body.lockedBy');
        expect(source).not.toContain('req.body.reopenedBy');
        expect(source).not.toContain('req.body.completedBy');
        expect(source).toContain("requestedBy: req.user?.id || 'system'");
        expect(source).toContain("closedBy: req.user?.id || 'system'");
        expect(source).toContain("createdBy: req.user?.id || 'system'");
        expect(source).toContain("approvedBy: req.user?.id || 'system'");
        expect(source).toContain("lockedBy: req.user?.id || 'system'");
        expect(source).toContain("const reopenedBy = req.user?.id || 'system';");
        expect(source).toContain("const completedBy = req.user?.id || 'system';");
    });
});
