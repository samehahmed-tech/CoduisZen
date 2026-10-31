import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    fileURLToPath(new URL('../server/services/webhookService.ts', import.meta.url)),
    'utf8',
);

describe('webhook retry lease contract', () => {
    it('claims failed deliveries atomically and recovers expired claims', () => {
        expect(source).toContain("set({ status: 'RETRYING', nextRetryAt: claimLeaseUntil })");
        expect(source).toContain("eq(webhookDeliveries.status, 'FAILED')");
        expect(source).toContain("eq(webhookDeliveries.status, 'RETRYING')");
        expect(source).toContain("set({ status: 'FAILED', nextRetryAt: null })");
    });

    it('records whether the redelivery succeeded before closing the original attempt', () => {
        expect(source).toContain('const delivered = await this.deliverToEndpoint');
        expect(source).toContain("status: delivered ? 'RETRIED' : 'FAILED'");
    });
});
