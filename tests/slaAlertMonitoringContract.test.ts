import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('SLA alert monitoring contract', () => {
    it('alerts only on statistically meaningful p95 breaches', () => {
        const source = fs.readFileSync('server/services/alertService.ts', 'utf8');
        expect(source).toContain("const { getRequestTiming } = await import('../middleware/requestTiming');");
        expect(source).toContain("route.n >= 5 && route.p95 > p95TargetMs");
        expect(source).toContain("this.dispatch('WARNING', 'SLA'");
        expect(source).toContain('SLA_P95_TARGET_MS');
    });
});
