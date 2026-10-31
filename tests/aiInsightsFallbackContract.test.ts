import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI insights provider fallback contract', () => {
    it('keeps insights operational with an explicit degraded status when AI is unavailable', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/aiController.ts'), 'utf8');
        expect(source).toContain("aiStatus: 'GENERATED' | 'DEGRADED_FALLBACK'");
        expect(source).toContain("aiStatus = 'DEGRADED_FALLBACK'");
        expect(source).toContain("console.warn('[AI] Insights provider unavailable; deterministic metrics fallback used.')");
        expect(source).toContain('res.json({ insight, aiStatus, ...provenance })');
    });
});
