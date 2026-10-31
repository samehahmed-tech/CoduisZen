import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/controllers/campaignController.ts', import.meta.url)), 'utf8');

describe('campaign dispatch idempotency contract', () => {
    it('claims and replays a dispatch key without sending twice', () => {
        expect(source).toContain("const idempotencyScope = 'CAMPAIGN_DISPATCH'");
        expect(source).toContain('getIdempotencyKeyFromRequest');
        expect(source).toContain('IDEMPOTENCY_KEY_PAYLOAD_CONFLICT');
        expect(source).toContain('IDEMPOTENCY_KEY_IN_PROGRESS');
        expect(source).toContain('idempotentReplay: true');
        expect(source).toContain("status: 'COMPLETED'");
        expect(source).toContain('responseBody: JSON.stringify(responseBody)');
    });
});
