import { describe, expect, it } from 'vitest';
import { AI_ACTION_SPECS, AI_EXECUTION_CONFIRMATION, requiresAiConfirmation } from '../server/services/aiPolicy';

describe('AI execution confirmation policy', () => {
    it('requires the explicit confirmation token for every mutating action', () => {
        expect(AI_EXECUTION_CONFIRMATION).toBe('AI_EXECUTE');
        for (const spec of Object.values(AI_ACTION_SPECS)) expect(requiresAiConfirmation(spec)).toBe(spec.mutates);
    });
});
