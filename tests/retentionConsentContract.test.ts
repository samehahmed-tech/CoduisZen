import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/services/retentionService.ts', import.meta.url)), 'utf8');

describe('retention consent contract', () => {
    it('requires global and WhatsApp consent and claims one run per day', () => {
        expect(source).toContain("private readonly runScope = 'RETENTION_WINBACK'");
        expect(source).toContain('marketingOptIn');
        expect(source).toContain('marketingWhatsappOptIn');
        expect(source).toContain("inArray(orders.status, ['COMPLETED', 'DELIVERED'])");
        expect(source).toContain('idempotencyKeys');
        expect(source).toContain('responseBody: JSON.stringify(result)');
    });
});
