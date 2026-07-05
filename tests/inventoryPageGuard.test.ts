import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/features/inventory/Inventory.tsx'), 'utf8');

describe('inventory page operational guardrails', () => {
    it('keeps branch transfer logistics reachable from tabs', () => {
        expect(source).toContain("id: 'BRANCHES'");
        expect(source).toContain("activeTab === 'BRANCHES'");
    });

    it('surfaces inventory store errors to the operator', () => {
        expect(source).toContain('inventoryError &&');
        expect(source).toContain('onClick={clearError}');
    });

    it('does not ship mojibake in the inventory header copy', () => {
        expect(source).not.toContain('آ·');
    });
});
