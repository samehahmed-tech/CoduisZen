import { describe, expect, it } from 'vitest';
import {
    buildTableBillOrder,
    getActiveTableOrders,
    getTableFreshCartLines,
    sumTableOrdersTotal,
} from '../utils/tableOrder';

const table = (overrides: any = {}) => ({
    id: 'table-1',
    status: 'OCCUPIED',
    currentOrderId: 'order-b',
    ...overrides,
});

const order = (overrides: any = {}) => ({
    id: 'order-a',
    tableId: 'table-1',
    status: 'PREPARING',
    total: 0,
    items: [],
    createdAt: new Date('2026-09-16T10:00:00'),
    ...overrides,
});

describe('table floor-map totals', () => {
    it('sums every open ticket on the table (the reported 150-shows-75 case)', () => {
        const tables = [table()] as any;
        const orders = [
            order({ id: 'order-a', total: 75, createdAt: new Date('2026-09-16T10:00:00') }),
            order({ id: 'order-b', total: 75, createdAt: new Date('2026-09-16T10:05:00') }),
        ] as any;
        const list = getActiveTableOrders(orders, tables, 'table-1');
        expect(list.map((o) => o.id).sort()).toEqual(['order-a', 'order-b']);
        expect(sumTableOrdersTotal(list)).toBe(150);
    });

    it('ignores closed/cancelled tickets', () => {
        const tables = [table({ currentOrderId: 'order-live' })] as any;
        const orders = [
            order({ id: 'order-live', total: 150 }),
            order({ id: 'order-done', total: 999, status: 'COMPLETED' }),
            order({ id: 'order-void', total: 999, status: 'CANCELLED' }),
        ] as any;
        expect(sumTableOrdersTotal(getActiveTableOrders(orders, tables, 'table-1'))).toBe(150);
    });

    it('dedupes retried/optimistic copies by id', () => {
        const tables = [table({ currentOrderId: 'order-a' })] as any;
        const draft = order({ id: 'order-a', total: 150 });
        const orders = [draft, { ...draft }] as any;
        expect(getActiveTableOrders(orders, tables, 'table-1')).toHaveLength(1);
    });

    it('still surfaces other open tickets when the link is stale', () => {
        const tables = [table({ currentOrderId: 'order-closed' })] as any;
        const orders = [
            order({ id: 'order-closed', total: 10, status: 'COMPLETED' }),
            order({ id: 'order-open', total: 150 }),
        ] as any;
        expect(sumTableOrdersTotal(getActiveTableOrders(orders, tables, 'table-1'))).toBe(150);
    });

    it('returns nothing for a free table with no link', () => {
        const tables = [{ id: 'table-9', status: 'AVAILABLE', currentOrderId: null }] as any;
        const orders = [order({ id: 'x', tableId: 'table-9', total: 50 })] as any;
        expect(getActiveTableOrders(orders, tables, 'table-9')).toHaveLength(0);
    });
});

describe('table bill aggregation (temp bill / close-out)', () => {
    const round = (id: string, lines: Array<{ name: string; price: number; quantity: number }>, money: any) => order({
        id,
        items: lines.map((l, i) => ({ ...l, cartId: `${id}-row-${i}` })),
        subtotal: money.subtotal,
        discount: money.discount || 0,
        tax: money.tax,
        tipAmount: money.tip || 0,
        total: money.total,
        createdAt: new Date(`2026-09-16T10:${id === 'order-a' ? '00' : '05'}:00`),
    });

    it('combines every round into one bill (last-round-only printed 75 of 150)', () => {
        const rounds = [
            round('order-a', [{ name: 'Tea', price: 70, quantity: 1 }], { subtotal: 70, tax: 5, total: 75 }),
            round('order-b', [{ name: 'Coffee', price: 65, quantity: 1 }], { subtotal: 65, tax: 10, total: 75 }),
        ] as any;
        const bill = buildTableBillOrder(rounds)!;
        expect(bill).toBeDefined();
        expect(bill.items).toHaveLength(2);
        expect(bill.total).toBe(150);
        expect(bill.subtotal).toBe(135);
        expect(bill.tax).toBe(15);
        // Live context comes from the latest (linked) round.
        expect(bill.id).toBe('order-b');
    });

    it('returns undefined when there is nothing to bill', () => {
        expect(buildTableBillOrder([])).toBeUndefined();
    });

    it('detects unsent cart lines missing from every saved round', () => {
        const rounds = [
            round('order-a', [{ name: 'Tea', price: 70, quantity: 1 }], { subtotal: 70, tax: 5, total: 75 }),
        ] as any;
        const cart = [
            { cartId: 'order-a-row-0', name: 'Tea', price: 70, quantity: 1 },
            { cartId: 'cart-fresh-1', name: 'Cake', price: 50, quantity: 1 },
        ];
        const fresh = getTableFreshCartLines(cart, rounds);
        expect(fresh.map((l: any) => l.name)).toEqual(['Cake']);
    });

    it('treats an empty cart as fully sent', () => {
        const rounds = [round('order-a', [], { subtotal: 0, tax: 0, total: 0 })] as any;
        expect(getTableFreshCartLines([], rounds)).toEqual([]);
    });
});
