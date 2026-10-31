import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('configurable rest policy contract', () => {
    it('persists the policy and routes scheduling through it', () => {
        const schema = fs.readFileSync('src/db/schema.ts', 'utf8');
        const service = fs.readFileSync('server/services/schedulingService.ts', 'utf8');
        const hr = fs.readFileSync('server/services/hrExtendedService.ts', 'utf8');
        expect(schema).toContain('minimumRestMinutes');
        expect(service).toContain('attendancePolicies.minimumRestMinutes');
        expect(service).toContain('getMinimumRestMinutes');
        expect(hr).toContain('minimumRestMinutes: Math.max(660');
    });
});
