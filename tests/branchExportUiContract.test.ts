import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('branch export UI contract', () => {
    it('offers bounded period controls and a safe per-branch download action', () => {
        const source = fs.readFileSync('components/FranchiseManager.tsx', 'utf8');
        const api = fs.readFileSync('services/api/franchise.ts', 'utf8');
        expect(source).toContain('downloadBranchExport');
        expect(source).toContain('exportFrom');
        expect(source).toContain('Exports exclude personal data by default');
        expect(api).toContain('exportBranchData');
        expect(api).toContain('apiRequestBlob');
    });
});

