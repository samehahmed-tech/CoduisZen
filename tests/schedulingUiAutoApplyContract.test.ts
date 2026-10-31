import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('scheduling UI auto-apply contract', () => {
    it('exposes preview, explicit confirmation, blockers, and loading state', () => {
        const source = fs.readFileSync('src/features/hr/components/SchedulingManager.tsx', 'utf8');
        expect(source).toContain("/auto-preview");
        expect(source).toContain("confirm: true");
        expect(source).toContain('autoApplyArmed');
        expect(source).toContain('autoPreview.blockers');
        expect(source).toContain("saving === 'auto-apply'");
    });
});
