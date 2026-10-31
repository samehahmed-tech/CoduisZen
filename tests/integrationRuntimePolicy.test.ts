import {
    buildIntegrationIdempotencyKey,
    classifyIntegrationHttpStatus,
    computeIntegrationBackoffMs,
    shouldRetryIntegrationFailure,
} from '../server/utils/integrationRuntimePolicy';
import { describe, expect, it } from 'vitest';

describe('integration runtime policy', () => {
    it('classifies retryable, conflict, and permanent HTTP failures', () => {
        expect(classifyIntegrationHttpStatus(503)).toBe('TRANSIENT');
        expect(classifyIntegrationHttpStatus(429)).toBe('TRANSIENT');
        expect(classifyIntegrationHttpStatus(409)).toBe('CONFLICT');
        expect(classifyIntegrationHttpStatus(400)).toBe('PERMANENT');
        expect(shouldRetryIntegrationFailure('CONFLICT')).toBe(true);
        expect(shouldRetryIntegrationFailure('PERMANENT')).toBe(false);
    });

    it('caps exponential backoff and normalizes invalid attempts', () => {
        expect(computeIntegrationBackoffMs(1)).toBe(1000);
        expect(computeIntegrationBackoffMs(3)).toBe(4000);
        expect(computeIntegrationBackoffMs(99)).toBe(300000);
        expect(computeIntegrationBackoffMs(0)).toBe(1000);
    });

    it('builds a stable key independent of object insertion order', () => {
        const first = buildIntegrationIdempotencyKey('webhook', 'd1', 'order.created', { b: 2, a: 1 });
        const second = buildIntegrationIdempotencyKey('webhook', 'd1', 'order.created', { a: 1, b: 2 });
        expect(first).toBe(second);
        expect(first).toMatch(/^webhook:d1:order\.created:[a-f0-9]{24}$/);
    });
});
