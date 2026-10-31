import { describe, expect, it } from 'vitest';
import { sanitizeEtaDeadLetter } from '../server/utils/etaDeadLetterSecurity';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('ETA dead-letter privacy contract', () => {
    it('does not expose the original fiscal payload in list responses', () => {
        const safe = sanitizeEtaDeadLetter({
            id: 1,
            branchId: 'b1',
            payload: { taxpayer: 'secret', invoiceLines: [{ amount: 10 }] },
            lastError: 'x'.repeat(500),
            attempts: 5,
        });
        expect(safe).toMatchObject({ id: 1, branchId: 'b1', attempts: 5 });
        expect(safe.lastError).toHaveLength(300);
        expect(safe).not.toHaveProperty('payload');
        expect(safe).not.toHaveProperty('taxpayer');
    });

    it('keeps the fiscal dead-letter controller on the sanitized projection', () => {
        const source = readFileSync(path.resolve(process.cwd(), 'server/controllers/fiscalController.ts'), 'utf8');
        expect(source).toContain('res.json(rows.map(sanitizeEtaDeadLetter));');
    });
});
