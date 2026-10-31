import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const schema = readFileSync(fileURLToPath(new URL('../src/db/schema.ts', import.meta.url)), 'utf8');
const repair = readFileSync(fileURLToPath(new URL('../scripts/sqlserver-schema-repair.sql', import.meta.url)), 'utf8');

describe('payment provider reference uniqueness contract', () => {
    it('enforces provider reference uniqueness and refuses unsafe legacy cleanup', () => {
        expect(schema).toContain("uniqueIndex('payment_sessions_provider_reference_uq')");
        expect(schema).toContain('external_reference IS NOT NULL');
        expect(repair).toContain('payment_sessions_provider_reference_uq');
        expect(repair).toContain('HAVING COUNT(*) > 1');
        expect(repair).toContain('never silently delete or merge payments');
    });
});
