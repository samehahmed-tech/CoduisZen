import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production control room UI contract', () => {
    it('keeps the production page focused on live operations and automatic sale-triggered runs', () => {
        const source = fs.readFileSync('components/Production.tsx', 'utf8');
        expect(source).toContain('Live line status');
        expect(source).toContain('Sales can trigger production automatically');
        expect(source).toContain('AUTO-READY');
        expect(source).toContain('overflow-x-hidden');
        expect(source).toContain('sm:flex-row');
    });
});
