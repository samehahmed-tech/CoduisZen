import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('inventory recommendation explanation contract', () => {
    it('exposes an explicit explanation alongside urgency and reason', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/services/inventoryIntelligence.ts'), 'utf8');
        expect(source).toContain('explanation: string;');
        expect(source).toContain("let urgency: PurchaseSuggestion['urgency']");
        expect(source).toContain('reason,');
        expect(source).toContain('explanation: reason');
    });
});
