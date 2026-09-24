import { describe, expect, it } from 'vitest';
import { getActiveTableOrders, sumTableOrdersTotal } from '../utils/tableOrder';

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
