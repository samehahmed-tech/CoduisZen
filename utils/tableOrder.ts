import { Order, OrderStatus, Table, TableStatus } from '../types';

const TERMINAL_ORDER_STATUSES = new Set<OrderStatus>([
    OrderStatus.DELIVERED,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
]);

export const findActiveTableOrder = (orders: Order[], tables: Pick<Table, 'id' | 'status' | 'currentOrderId'>[], tableId: string) => {
    const table = tables.find((candidate) => candidate.id === tableId);
    if (!table || table.status === TableStatus.AVAILABLE || !table.currentOrderId) return undefined;
    return orders.find((order) =>
        order.id === table.currentOrderId
        && order.tableId === tableId
        && !TERMINAL_ORDER_STATUSES.has(order.status),
    );
};

/**
 * Every open ticket on a table, oldest first.
 *
 * Dine-in flow creates a NEW order per kitchen send (a fired ticket goes
 * PREPARING and becomes read-only, so round 2+ is a separate ticket by
 * design). The floor map must therefore reflect ALL of them — showing only
 * the linked one reads as "half the bill" (e.g. 75 of 150).
 */
export const getActiveTableOrders = (
    orders: Order[],
    tables: Pick<Table, 'id' | 'status' | 'currentOrderId'>[],
    tableId: string,
): Order[] => {
    const table = tables.find((candidate) => candidate.id === tableId);
    if (!table) return [];
    const seen = new Set<string>();
    const out: Order[] = [];
    const push = (order?: Order) => {
        if (order?.id && !seen.has(order.id)) {
            seen.add(order.id);
            out.push(order);
        }
    };
    if (table.currentOrderId) {
        push(orders.find((order) =>
            order.id === table.currentOrderId
            && order.tableId === tableId
            && !TERMINAL_ORDER_STATUSES.has(order.status),
        ));
    }
    // Other open tickets on the same table (round 2+, split remainders).
    // Only for non-available tables: a free table with no live link stays
    // free even if a stale open ticket still references it.
    if (table.status !== TableStatus.AVAILABLE) {
        for (const order of orders) {
            if (order.tableId === tableId && !TERMINAL_ORDER_STATUSES.has(order.status)) push(order);
        }
    }
    // Registry lag: occupied on the floor but nothing found above → fall
    // back to the latest live order instead of a ghost zero.
    if (out.length === 0 && table.status !== TableStatus.AVAILABLE) {
        const candidates = orders.filter((order) =>
            order.tableId === tableId && !TERMINAL_ORDER_STATUSES.has(order.status));
        candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        push(candidates[0]);
    }
    out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return out;
};

/** Combined collectible total across a table's open tickets. */
export const sumTableOrdersTotal = (list: Order[]): number =>
    list.reduce((sum, order) => sum + Number(order?.total || 0), 0);
