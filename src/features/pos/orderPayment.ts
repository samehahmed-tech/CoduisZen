import { PaymentMethod, PaymentRecord } from '../../../types';

export const buildOrderPayment = (
    method: PaymentMethod | string,
    total: number,
    splitPayments: PaymentRecord[],
) => ({
    paymentMethod: method,
    payments: method === PaymentMethod.SPLIT
        ? splitPayments
        : [{ method, amount: total }],
});
