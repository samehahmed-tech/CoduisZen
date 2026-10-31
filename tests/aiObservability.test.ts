import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiLogger } from '../server/utils/logger';
import { recordAiRoute } from '../server/services/aiObservabilityService';

describe('AI observability privacy contract', () => {
    afterEach(() => vi.restoreAllMocks());

    it('records route metadata without storing prompt text', () => {
        const info = vi.spyOn(aiLogger, 'info').mockImplementation(() => aiLogger as any);
        recordAiRoute({
            userId: 'user-1',
            branchId: 'branch-1',
            message: 'customer phone is 01012345678; summarize sales',
            route: { providerId: 'GEMINI', modelId: 'gemini-2.0-flash', usedFallback: true, latencyMs: 120 },
        });

        expect(info).toHaveBeenCalledTimes(1);
        const event = info.mock.calls[0][0] as any;
        expect(event.messageHash).toHaveLength(16);
        expect(event.message).toBeUndefined();
        expect(JSON.stringify(event)).not.toContain('01012345678');
        expect(event.usedFallback).toBe(true);
    });
});
