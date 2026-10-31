import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('franchise royalty UI contract', () => {
    it('exposes the preview tab with period controls and branch totals', () => {
        const source = fs.readFileSync('components/FranchiseManager.tsx', 'utf8');
        expect(source).toContain("id: 'royalties'");
        expect(source).toContain('franchiseApi.previewRoyalties');
        expect(source).toContain("type=\"date\"");
        expect(source).toContain('royaltyPreview.branches.map');
        expect(source).toContain('no journal entry is posted');
    });
});
