import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('status and SLA route contract', () => {
    it('exposes protected service health and latency metrics to administrators only', () => {
        const source = fs.readFileSync('server/app.ts', 'utf8');
        expect(source).toContain("app.get('/api/ops/status', requireRoles('SUPER_ADMIN', 'OWNER'");
        expect(source).toContain('getRequestTiming()');
        expect(source).toContain('SLA_P95_TARGET_MS');
        expect(source).toContain('routesOverTarget');
    });
});
