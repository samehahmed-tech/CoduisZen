import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useOrderStore } from '../stores/useOrderStore';
import { Order, OrderItem, OrderStatus, OrderType } from '../types';

describe('table discount state', () => {
    beforeAll(() => {
        useOrderStore.persist.setOptions({
            storage: {
                getItem: () => null,
                setItem: () => undefined,
                removeItem: () => undefined,
            },
        });
    });

    beforeEach(() => {
        useOrderStore.setState({
            activeCart: [],
            activeCoupon: null,
            discount: 0,
            orders: [],
            tableDrafts: {},
        });
    });

    it('restores a coupon draft and converts a persisted discount amount to a percentage', () => {
        const cart: OrderItem[] = [{
            id: 'meal-1',
            cartId: 'cart-1',
            name: 'Meal',
            price: 100,
            categoryId: 'meals',
            isAvailable: true,
            quantity: 1,
            selectedModifiers: [],
        }];
        useOrderStore.getState().saveTableDraft('table-1', cart, 25, 'TABLE25');
        useOrderStore.getState().loadTableDraft('table-1');

        expect(useOrderStore.getState()).toMatchObject({
            activeCart: cart,
            activeCoupon: 'TABLE25',
            discount: 25,
        });

        const activeOrder: Order = {
                id: 'order-1',
                orderNumber: 1,
                type: OrderType.DINE_IN,
                branchId: 'b1',
                tableId: 'table-1',
                items: cart,
                status: OrderStatus.PENDING,
                subtotal: 200,
                discount: 50,
                tax: 0,
                total: 150,
                couponCode: 'TABLE25',
                createdAt: new Date(),
        };
        useOrderStore.setState({ orders: [activeOrder] });
        useOrderStore.getState().loadTableOrder('table-1');

        expect(useOrderStore.getState()).toMatchObject({
            activeCoupon: 'TABLE25',
            discount: 25,
        });
    });
});
