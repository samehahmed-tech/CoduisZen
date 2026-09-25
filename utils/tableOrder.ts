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

const roundMoney = (value: unknown): number =>
    Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

/** Row identity shared by the POS cart partition logic (cartId wins, DB id fallback). */
export const tableRowKeyOf = (line: any): string => String(line?.cartId ?? line?.id ?? '');

/**
 * A synthetic bill order covering EVERY open round on a table (oldest
 * first), so temp bills, close-outs and the management modal never show
 * "half the bill" (only the latest round). Money fields are plain sums of
 * the stored server-priced rounds — receipt generators prefer stored
 * tax/total when present, so the printed figures match the per-round
 * tickets exactly.
 */
export const buildTableBillOrder = (tableOrders: Order[]): Order | undefined => {
    const rounds = (tableOrders || []).filter(Boolean);
    if (rounds.length === 0) return undefined;
    // getActiveTableOrders returns oldest-first; the latest round carries the
    // live link (ids, customer, branch/table context).
    const latest = rounds[rounds.length - 1];
    const earliest = rounds[0];
    return {
        ...latest,
        items: rounds.flatMap((order) => order.items || []),
        subtotal: roundMoney(rounds.reduce((sum, order) => sum + Number(order.subtotal || 0), 0)),
        discount: roundMoney(rounds.reduce((sum, order) => sum + Number((order as any).discount || 0), 0)),
        tax: roundMoney(rounds.reduce((sum, order) => sum + Number(order.tax || 0), 0)),
        tipAmount: roundMoney(rounds.reduce((sum, order) => sum + Number(order.tipAmount || 0), 0)),
        deliveryFee: roundMoney(rounds.reduce((sum, order) => sum + Number((order as any).deliveryFee || 0), 0)),
        serviceCharge: roundMoney(rounds.reduce((sum, order) => sum + Number((order as any).serviceCharge || 0), 0)),
        total: roundMoney(sumTableOrdersTotal(rounds)),
        createdAt: earliest.createdAt,
    } as Order;
};

/**
 * Cart lines that are on NO saved round yet (unsent additions the cashier
 * just built). Used by the temp bill so what the cashier sees on screen is
 * what prints — otherwise a pre-send temp bill silently drops the new lines.
 */
export const getTableFreshCartLines = (cart: any[], tableOrders: Order[]): any[] => {
    const savedKeys = new Set<string>();
    for (const order of tableOrders || []) {
        for (const line of order?.items || []) savedKeys.add(tableRowKeyOf(line));
    }
    return (cart || []).filter((line) => !savedKeys.has(tableRowKeyOf(line)));
};
