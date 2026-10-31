import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    fileURLToPath(new URL('../server/controllers/branchController.ts', import.meta.url)),
    'utf8',
);

describe('branch visibility contract', () => {
    it('filters branch directory results to the authenticated allow-list', () => {
        expect(source).toContain('const visibleBranches = new Set([req.user?.branchId, ...allowedBranches]');
        expect(source).toContain('allBranches = allBranches.filter(b => visibleBranches.has(String(b.id)))');
    });
});
