import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('order payment authority contract', () => {
    it('derives order paid state from validated payment rows', () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'server/controllers/orderController.ts'), 'utf8');
        expect(source).toContain('isPaid: false,');
        expect(source).toContain('paidAmount: 0,');
        expect(source).toContain("throw appError(400, 'INVALID_PAYMENT_ROW'");
        expect(source).toContain('const paidNow = paymentsToInsert.length > 0 && paymentTotal + 0.01 >= Number(total);');
        expect(source).toContain('isPaid: paidNow,');
        expect(source).not.toContain('const paidNow = Boolean(orderData.isPaid) || paymentsToInsert.length > 0;');
    });
});
