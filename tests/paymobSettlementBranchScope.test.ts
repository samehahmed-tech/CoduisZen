import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Paymob settlement branch safety contract', () => {
    it('anchors reference lookup to the trusted order/session scope', () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'server/services/paymobSettlementService.ts'), 'utf8');
        expect(source).toContain('eq(payments.orderId, session.orderId)');
        expect(source).toContain('eq(payments.orderId, result.merchantOrderId)');
        expect(source).toContain('const paymentScope = session');
    });
});
