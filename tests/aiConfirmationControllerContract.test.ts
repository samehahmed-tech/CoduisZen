import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI confirmation controller contract', () => {
    it('blocks unconfirmed mutation requests before guard or mutation', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/aiController.ts'), 'utf8');
        const confirmation = source.indexOf("req.body?.confirmation !== AI_EXECUTION_CONFIRMATION");
        const guard = source.indexOf('const guarded = guardAction(action, context);', confirmation);
        expect(confirmation).toBeGreaterThan(-1);
        expect(guard).toBeGreaterThan(confirmation);
        expect(source).toContain("error: 'AI_CONFIRMATION_REQUIRED'");
        expect(source).toContain('confirmationRequired: requiresAiConfirmation(auth.spec)');
    });
});
