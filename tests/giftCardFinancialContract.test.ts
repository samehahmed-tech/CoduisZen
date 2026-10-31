import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('gift card financial safety contract', () => {
    it('keeps card mutations and GL posting in the same fail-closed transaction', () => {
        const source = fs.readFileSync('server/services/giftCardService.ts', 'utf8');
        expect(source).toContain('const result = await glMod.GLService.postJournalEntry');
        expect(source).toContain('}, tx);');
        expect(source).toContain("GIFT_CARD_GL_POSTING_FAILED");
        expect(source).toContain('WITH (UPDLOCK, HOLDLOCK)');
        expect(source).toContain('const card = await db.transaction(async (tx) =>');
        expect(source).toContain('const updated = await db.transaction(async (tx) =>');
        expect(source).not.toContain('GL posting skipped');
        expect(source).not.toContain('non-blocking warnings');
    });

    it('uses a unique transaction reference for each top-up, redemption, and void', () => {
        const source = fs.readFileSync('server/services/giftCardService.ts', 'utf8');
        expect(source).toContain('GCTOP-${transactionId}');
        expect(source).toContain('GCREDEEM-${transactionId}');
        expect(source).toContain('GCVOID-${transactionId}');
    });
});
