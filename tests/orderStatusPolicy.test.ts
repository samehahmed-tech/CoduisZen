import { describe, expect, it } from 'vitest';
import { evaluateOrderStatusUpdate } from '../server/services/orderStatusPolicy';

describe('order status lifecycle policy', () => {
    it('routes takeaway and pickup ready orders through customer handover', () => {
        expect(evaluateOrderStatusUpdate({
            currentStatus: 'READY',
            nextStatus: 'DELIVERED',
            orderType: 'TAKEAWAY',
            userRole: 'CASHIER',
            userBranchId: 'BR-1',
            orderBranchId: 'BR-1',
        }).ok).toBe(true);

        expect(evaluateOrderStatusUpdate({
            currentStatus: 'READY',
            nextStatus: 'COMPLETED',
            orderType: 'PICKUP',
            userRole: 'CASHIER',
            userBranchId: 'BR-1',
            orderBranchId: 'BR-1',
        }).ok).toBe(false);
    });

    it('requires delivery orders to leave for delivery before delivery confirmation', () => {
        expect(evaluateOrderStatusUpdate({
            currentStatus: 'READY',
            nextStatus: 'OUT_FOR_DELIVERY',
            orderType: 'DELIVERY',
            userRole: 'MANAGER',
            userBranchId: 'BR-1',
            orderBranchId: 'BR-1',
        }).ok).toBe(true);

        expect(evaluateOrderStatusUpdate({
            currentStatus: 'READY',
            nextStatus: 'DELIVERED',
            orderType: 'DELIVERY',
            userRole: 'MANAGER',
            userBranchId: 'BR-1',
            orderBranchId: 'BR-1',
        }).ok).toBe(false);
    });

    it('settles dine-in orders from ready to completed without pickup handover', () => {
        expect(evaluateOrderStatusUpdate({
            currentStatus: 'READY',
            nextStatus: 'COMPLETED',
            orderType: 'DINE_IN',
            userRole: 'CASHIER',
            userBranchId: 'BR-1',
            orderBranchId: 'BR-1',
        }).ok).toBe(true);

        expect(evaluateOrderStatusUpdate({
            currentStatus: 'READY',
            nextStatus: 'DELIVERED',
            orderType: 'DINE_IN',
            userRole: 'CASHIER',
            userBranchId: 'BR-1',
            orderBranchId: 'BR-1',
        }).ok).toBe(false);
    });

    it('allows active dine-in tables to settle directly when the guest pays', () => {
        for (const currentStatus of ['PENDING', 'PREPARING']) {
            expect(evaluateOrderStatusUpdate({
                currentStatus,
                nextStatus: 'COMPLETED',
                orderType: 'DINE_IN',
                userRole: 'CASHIER',
                userBranchId: 'BR-1',
                orderBranchId: 'BR-1',
            }).ok).toBe(true);
        }
    });

    it('allows direct takeaway and pickup orders to complete from POS payment', () => {
        for (const orderType of ['TAKEAWAY', 'PICKUP']) {
            expect(evaluateOrderStatusUpdate({
                currentStatus: 'PENDING',
                nextStatus: 'COMPLETED',
                orderType,
                userRole: 'CASHIER',
                userBranchId: 'BR-1',
                orderBranchId: 'BR-1',
            }).ok).toBe(true);
        }
    });
});
