import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/routes/fiscalRoutes.ts', import.meta.url)), 'utf8');

describe('fiscal route authorization contract', () => {
    it('protects fiscal reads, submission, and dead-letter mutations with explicit permissions', () => {
        expect(source).toContain('const fiscalRead = requireRoleOrPermission(');
        expect(source).toContain('const fiscalSubmit = requireRoleOrPermission(');
        expect(source).toContain('const fiscalDeadLetterManage = requireRoleOrPermission(');
        expect(source).toContain("router.post('/submit', fiscalSubmit, enforceBranch, submitReceipt);");
        expect(source).toContain("router.post('/dead-letters/:id/retry', fiscalDeadLetterManage, enforceBranch, retryDeadLetter);");
        expect(source).toContain("router.post('/dead-letters/:id/dismiss', fiscalDeadLetterManage, enforceBranch, dismissDeadLetter);");
        expect(source).not.toContain("router.use(enforceBranch);");
    });
});
