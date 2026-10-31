import { localDb } from '../db/localDb';
import { syncService } from './syncService';
import { createLocalKdsEvent, publishLocalKdsEvent } from './localKdsHub';

export type LocalKdsStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'DELIVERED' | 'CANCELLED';

const LOCAL_KDS_ACTIVE_STATUSES = new Set(['PENDING', 'PREPARING', 'READY']);

const normalizeStatus = (value: unknown): LocalKdsStatus => {
    const status = String(value || 'PENDING').trim().toUpperCase();
    return (['PENDING', 'PREPARING', 'READY', 'SERVED', 'DELIVERED', 'CANCELLED'] as const)
        .includes(status as LocalKdsStatus)
        ? status as LocalKdsStatus
        : 'PENDING';
};

const localTicketId = (orderId: string) => `LOCAL-KDS-${orderId}`;

export const isLocalKdsTicketId = (value: unknown) => String(value || '').startsWith('LOCAL-KDS-');

export const getOrderIdFromLocalKdsTicket = (ticketId: string) =>
    isLocalKdsTicketId(ticketId) ? String(ticketId).slice('LOCAL-KDS-'.length) : ticketId;

export const mapLocalOrderToKdsTicket = (order: any) => {
    const orderId = String(order?.id || '').trim();
    const status = normalizeStatus(order?.status);
    const items = Array.isArray(order?.items) ? order.items : [];
    return {
        id: localTicketId(orderId),
        branchId: String(order?.branchId || order?.branch_id || ''),
        orderId,
        orderNumber: order?.orderNumber ?? order?.order_number ?? orderId,
        type: order?.type || null,
        tableId: order?.tableId ?? order?.table_id ?? null,
        tableName: order?.tableName ?? null,
        kitchenNotes: order?.kitchenNotes ?? order?.notes ?? null,
        routingStation: String(order?.routingStation || 'GENERAL').toUpperCase(),
        // Server dispatch normally moves a newly created POS order to
        // PREPARING. Mirror that state locally when the dispatch request could
        // not reach the server, so the kitchen sees actionable work.
        status: status === 'PENDING' ? 'PREPARING' : status,
        priority: ['RUSH', 'REMAKE'].includes(String(order?.priority || '').toUpperCase())
            ? String(order.priority).toUpperCase()
            : 'NORMAL',
        createdAt: order?.createdAt instanceof Date ? order.createdAt.toISOString() : String(order?.createdAt || new Date().toISOString()),
        bumpedAt: order?.bumpedAt ?? null,
        items: items.map((item: any, index: number) => ({
            id: Number.isFinite(Number(item?.id)) ? Number(item.id) : index + 1,
            kdsTicketId: localTicketId(orderId),
            itemName: String(item?.name || item?.itemName || item?.menuItemName || 'Item'),
            quantity: Math.max(1, Number(item?.quantity || 1)),
            modifiersText: item?.modifiersText ?? null,
            modifiers: item?.modifiers,
            selectedModifiers: item?.selectedModifiers,
            sizeLabel: item?.sizeLabel ?? item?.size ?? null,
            size: item?.size ?? null,
            notes: item?.notes ?? item?.itemNotes ?? null,
            itemNotes: item?.itemNotes ?? item?.notes ?? null,
            isBumped: Boolean(item?.isBumped),
        })),
    };
};

export const getLocalKdsTickets = async (branchId?: string) => {
    const normalizedBranchId = String(branchId || '').trim();
    const orders = await localDb.orders.toArray();
    return orders
        .filter((order: any) => !normalizedBranchId || String(order?.branchId || order?.branch_id || '') === normalizedBranchId)
        .filter((order: any) => LOCAL_KDS_ACTIVE_STATUSES.has(normalizeStatus(order?.status)))
        .filter((order: any) => String(order?.syncStatus || '').toUpperCase() !== 'SYNCED')
        .filter((order: any) => String(order?.id || '').trim())
        .map(mapLocalOrderToKdsTicket);
};

export const updateLocalKdsStatus = async (
    ticketId: string,
    status: Exclude<LocalKdsStatus, 'PENDING' | 'CANCELLED'>,
    actor?: { id?: string; name?: string },
) => {
    const orderId = getOrderIdFromLocalKdsTicket(ticketId);
    const order = await localDb.orders.get(orderId);
    if (!order) throw new Error('LOCAL_KDS_ORDER_NOT_FOUND');
    const branchId = String((order as any).branchId || (order as any).branch_id || '').trim();
    if (!branchId) throw new Error('OFFLINE_BRANCH_CONTEXT_REQUIRED');

    await syncService.queue('orderStatus', 'UPDATE', {
        id: orderId,
        branchId,
        data: {
            status,
            changed_by: actor?.id,
            changed_by_name: actor?.name,
        },
    });
    await localDb.orders.update(orderId, { status, syncStatus: 'PENDING' } as any);
    publishLocalKdsEvent(createLocalKdsEvent('STATUS_CHANGED', branchId, orderId));
    return { orderId, status, branchId };
};
