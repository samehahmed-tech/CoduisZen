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
