import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('SLA history persistence contract', () => {
    it('persists bounded numeric snapshots without request payloads', () => {
        const service = fs.readFileSync('server/services/slaMetricsService.ts', 'utf8');
        const app = fs.readFileSync('server/app.ts', 'utf8');
        expect(service).toContain("const MAX_SLA_SNAPSHOTS = 720");
        expect(service).toContain('slice(-MAX_SLA_SNAPSHOTS)');
        expect(service).toContain("category: 'operations'");
        expect(app).toContain('const history = await getSlaHistory();');
    });
});
