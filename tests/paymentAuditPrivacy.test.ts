import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    fileURLToPath(new URL('../server/services/paymentGatewayService.ts', import.meta.url)),
    'utf8',
);

describe('payment audit privacy contract', () => {
    it('records payment metadata without spreading the request or gateway response', () => {
        expect(source).toContain('customerPhoneProvided: Boolean(req.customerPhone)');
        expect(source).toContain('transactionIdPresent: Boolean(response.transactionId)');
        expect(source).not.toContain('payload: { ...req, response }');
    });
});
