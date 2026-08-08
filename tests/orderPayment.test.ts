import { describe, expect, it } from 'vitest';
import { PaymentMethod } from '../types';
import { buildOrderPayment } from '../src/features/pos/orderPayment';

describe('POS order payment', () => {
    it('uses the explicit quick-pay method instead of stale UI state', () => {
        expect(buildOrderPayment(PaymentMethod.CASH, 148.2, [])).toEqual({
            paymentMethod: PaymentMethod.CASH,
            payments: [{ method: PaymentMethod.CASH, amount: 148.2 }],
        });
    });

    it('preserves split payment records', () => {
        const payments = [
            { method: PaymentMethod.CASH, amount: 50 },
            { method: PaymentMethod.VISA, amount: 98.2 },
        ];
        expect(buildOrderPayment(PaymentMethod.SPLIT, 148.2, payments).payments).toEqual(payments);
    });

    it('preserves a configured custom payment method', () => {
        expect(buildOrderPayment('TALABAT_PAY', 75, [])).toEqual({
            paymentMethod: 'TALABAT_PAY',
            payments: [{ method: 'TALABAT_PAY', amount: 75 }],
        });
    });
});
