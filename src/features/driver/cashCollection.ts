import { PaymentMethod } from '../../../types';

export const getCashToCollect = (order: any) => {
    const payments = Array.isArray(order?.payments) ? order.payments : [];
    if (payments.length) {
        return payments
            .filter((payment: any) => String(payment?.method || '').toUpperCase() === PaymentMethod.CASH)
            .reduce((sum: number, payment: any) => sum + Math.max(0, Number(payment?.amount || 0)), 0);
    }

    const method = String(order?.paymentMethod || order?.payment_method || '').toUpperCase();
    return !method || method === PaymentMethod.CASH
        ? Math.max(0, Number(order?.total || order?.grandTotal || 0))
        : 0;
};
