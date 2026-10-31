import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../server/controllers/aiController.ts', import.meta.url)), 'utf8');

describe('AI action branch contract', () => {
    it('checks target branch scope before preview and execution', () => {
        expect(source).toContain('isAiActionBranchAllowed(user, action)');
        expect(source).toContain("AI_ACTION_BRANCH_FORBIDDEN");
    });
});
