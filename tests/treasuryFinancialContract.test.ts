import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('treasury voucher financial safety contract', () => {
    it('does not complete a voucher before supplier linkage and GL posting succeed', () => {
        const source = fs.readFileSync('server/services/treasuryService.ts', 'utf8');
        expect(source).toContain('return await db.transaction(async (tx) =>');
        expect(source).toContain('WITH (UPDLOCK, HOLDLOCK)');
        expect(source).toContain('await tx.insert(supplierPayments).values');
        expect(source).toContain('}, tx);');
        expect(source).toContain("TREASURY_GL_POSTING_FAILED");
        expect(source).toContain("TREASURY_GL_ACCOUNT_NOT_CONFIGURED");
        expect(source).not.toContain('treasury: GL posting skipped');
        expect(source).not.toContain('supplier linkage skipped');
    });

    it('marks the voucher completed only after a journal entry id exists', () => {
        const source = fs.readFileSync('server/services/treasuryService.ts', 'utf8');
        const postingIndex = source.indexOf('const posting = await GLService.postJournalEntry');
        const completionIndex = source.indexOf("status: 'COMPLETED', approvedBy", postingIndex);
        expect(postingIndex).toBeGreaterThan(-1);
        expect(source.indexOf("if (!posting || typeof posting !== 'object'", postingIndex)).toBeGreaterThan(postingIndex);
        expect(completionIndex).toBeGreaterThan(source.indexOf("if (!posting || typeof posting !== 'object'", postingIndex));
    });
});
