import { Router } from 'express';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { db } from '../db';
import { getIO } from '../socket';
import { transitionOrderStatus } from '../services/orderLifecycleService';
import { kdsTicketItems, kdsTickets, menuItems, orders, orderItems, branches, tables } from '../../src/db/schema';

const router = Router();

const DONE_STATUSES = ['SERVED', 'DELIVERED', 'CANCELLED'];
const KDS_HIDDEN_STATUSES = ['READY', 'SERVED', 'DELIVERED', 'CANCELLED'];
const READY_LIKE_STATUSES = new Set(['READY', 'SERVED', 'DELIVERED']);

const getToken = () => String(
    process.env.PUBLIC_SCREEN_TOKEN
    || process.env.RESTOFLOW_PUBLIC_SCREEN_KEY
    || '',
).trim();

const getParam = (value: unknown, fallback = '') => {
    const raw = Array.isArray(value) ? value[0] : value;
    const text = String(raw || '').trim();
    return text || fallback;
};

const cleanIp = (value?: string | null) => String(value || '')
    .split(',')[0]
    .trim()
    .replace(/^::ffff:/, '')
    .replace(/^\[|\]$/g, '');

const isPrivateLanIp = (value?: string | null) => {
    const ip = cleanIp(value);
    if (!ip) return false;
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('192.168.')) return true;
    const match172 = ip.match(/^172\.(\d+)\./);
    if (match172) {
        const block = Number(match172[1]);
        return block >= 16 && block <= 31;
    }
    return false;
};

const isLanRequest = (req: any) => isPrivateLanIp(req.socket?.remoteAddress);

const requireScreenKey = (req: any, res: any, next: any) => {
    const expected = getToken();
    const actual = getParam(req.query.key) || getParam(req.headers['x-screen-key']);
    const allowLanWithoutKey = process.env.PUBLIC_SCREEN_LAN_NO_KEY === 'true';

    if (allowLanWithoutKey && isLanRequest(req)) {
        return next();
    }

    if (process.env.NODE_ENV === 'production') {
        if (!expected) {
            return res.status(503).json({
                code: 'PUBLIC_SCREEN_TOKEN_REQUIRED',
                message: 'PUBLIC_SCREEN_TOKEN must be configured in production.',
            });
        }
        if (actual !== expected) {
            return res.status(403).json({ code: 'PUBLIC_SCREEN_FORBIDDEN', message: 'Invalid screen key.' });
        }
        return next();
    }

    if (expected && actual === expected) {
        return next();
    }

    if (isLanRequest(req)) {
        return next();
    }

    if (expected) {
        return res.status(403).json({ code: 'PUBLIC_SCREEN_FORBIDDEN', message: 'Invalid screen key or non-LAN request.' });
    }

    return res.status(403).json({ code: 'PUBLIC_SCREEN_LAN_ONLY', message: 'This screen is LAN-only.' });
};

const branchRoom = (branchId?: string | null) => branchId ? `branch:${branchId}` : null;

const emitRefresh = (branchId?: string | null, event?: any) => {
    const room = branchRoom(branchId);
    if (!room) return;
    try {
        getIO().to(room).emit('kds:update', event || {});
    } catch {
        // Socket is best-effort for the public polling screens.
    }
};

const hydrateTickets = async (tickets: any[]) => {
    const ticketIds = tickets.map(ticket => ticket.id);
    const orderIds = Array.from(new Set(tickets.map(ticket => ticket.orderId).filter(Boolean)));

    const [items, orderRows] = await Promise.all([
        ticketIds.length > 0
            ? db.select().from(kdsTicketItems).where(inArray(kdsTicketItems.kdsTicketId, ticketIds))
            : Promise.resolve([]),
        orderIds.length > 0
            ? db
                .select({
                    id: orders.id,
                    orderNumber: orders.orderNumber,
                    type: orders.type,
                    tableId: orders.tableId,
                    tableName: tables.name,
                    customerName: orders.customerName,
                    customerPhone: orders.customerPhone,
                    kitchenNotes: orders.kitchenNotes,
                    notes: orders.notes,
                    status: orders.status,
                    createdAt: orders.createdAt,
                })
                .from(orders)
                .leftJoin(tables, eq(tables.id, orders.tableId))
                .where(inArray(orders.id, orderIds))
            : Promise.resolve([]),
    ]);

    const itemMenuIds = Array.from(new Set(items.map(item => item.menuItemId).filter(Boolean)));
    const menuRows = itemMenuIds.length > 0
        ? await db
            .select({ id: menuItems.id, name: menuItems.name, nameAr: menuItems.nameAr })
            .from(menuItems)
            .where(inArray(menuItems.id, itemMenuIds))
        : [];

    const ordersById = new Map(orderRows.map(order => [order.id, order]));
    const menuById = new Map(menuRows.map(item => [item.id, item]));
    const itemsByTicket: Record<string, any[]> = {};

    for (const item of items) {
        const menuItem = menuById.get(item.menuItemId);
        const hydrated = {
            ...item,
            name: menuItem?.nameAr || item.itemName || menuItem?.name || 'Item',
            nameAr: menuItem?.nameAr || item.itemName || menuItem?.name,
        };
        if (!itemsByTicket[item.kdsTicketId]) itemsByTicket[item.kdsTicketId] = [];
        itemsByTicket[item.kdsTicketId].push(hydrated);
    }

    return tickets.map(ticket => {
        const order = ordersById.get(ticket.orderId) as any;
        return {
            ...ticket,
            items: itemsByTicket[ticket.id] || [],
            orderNumber: order?.orderNumber,
            type: order?.type,
            tableId: order?.tableId,
            tableName: order?.tableName,
            customerName: order?.customerName,
            customerPhone: order?.customerPhone,
            kitchenNotes: order?.kitchenNotes,
            notes: order?.notes,
            orderStatus: order?.status,
            orderCreatedAt: order?.createdAt,
        };
    });
};

const syncOrderReady = async (orderId?: string | null, changedBy = 'public-kds-screen') => {
    if (!orderId) return false;
    const orderTickets = await db.select().from(kdsTickets).where(eq(kdsTickets.orderId, orderId));
    if (orderTickets.length === 0 || !orderTickets.every(ticket => READY_LIKE_STATUSES.has(String(ticket.status)))) {
        return false;
    }

    const [order] = await db.select({ id: orders.id, status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || ['READY', 'DELIVERED', 'COMPLETED', 'CANCELLED'].includes(String(order.status))) {
        return Boolean(order && String(order.status) === 'READY');
    }

    await transitionOrderStatus({
        orderId,
        nextStatus: 'READY',
        notes: 'Kitchen tickets ready from public operator screen',
        changedBy,
        user: { role: 'SUPER_ADMIN' },
        skipPolicy: true,
    });
    return true;
};

router.use(requireScreenKey);

router.get('/tickets', async (req, res) => {
    try {
        const branchId = getParam(req.query.branchId, process.env.DEFAULT_BRANCH_ID || process.env.BRANCH_ID || 'b1');
        const station = getParam(req.query.station).toUpperCase();
        const mode = getParam(req.query.mode, 'kds').toLowerCase();
        const filters: any[] = [eq(kdsTickets.branchId, branchId)];

        if (station && mode !== 'packing') filters.push(eq(kdsTickets.routingStation, station));
        if (mode === 'packing') {
            filters.push(eq(kdsTickets.status, 'READY'));
        } else {
            filters.push(notInArray(kdsTickets.status, KDS_HIDDEN_STATUSES));
        }

        const tickets = await db.select().from(kdsTickets).where(and(...filters));
        const populated = await hydrateTickets(tickets);
        return res.json({ ok: true, branchId, mode, station: station || null, tickets: populated });
    } catch (error: any) {
        return res.status(500).json({ ok: false, code: 'PUBLIC_SCREEN_TICKETS_FAILED', message: error?.message || 'Failed to load tickets' });
    }
});

router.post('/tickets/:id/bump', async (req, res) => {
    try {
        const ticketId = getParam(req.params.id);
        const [ticket] = await db.select().from(kdsTickets).where(eq(kdsTickets.id, ticketId)).limit(1);
        if (!ticket) return res.status(404).json({ ok: false, code: 'TICKET_NOT_FOUND' });

        if (ticket.status !== 'READY') {
            await db.update(kdsTickets)
                .set({ status: 'READY', bumpedAt: new Date(), updatedAt: new Date() })
                .where(eq(kdsTickets.id, ticketId));
        }

        const allReady = await syncOrderReady(ticket.orderId);
        emitRefresh(ticket.branchId, { ticketId, orderId: ticket.orderId, status: 'READY' });
        return res.json({ ok: true, allReady });
    } catch (error: any) {
        return res.status(500).json({ ok: false, code: 'PUBLIC_SCREEN_BUMP_FAILED', message: error?.message || 'Failed to bump ticket' });
    }
});

router.post('/orders/:orderId/handover', async (req, res) => {
    try {
        const orderId = getParam(req.params.orderId);
        const [order] = await db
            .select({ id: orders.id, branchId: orders.branchId, status: orders.status, type: orders.type })
            .from(orders)
            .where(eq(orders.id, orderId))
            .limit(1);
        if (!order) return res.status(404).json({ ok: false, code: 'ORDER_NOT_FOUND' });
        if (String(order.status) === 'CANCELLED') return res.status(409).json({ ok: false, code: 'ORDER_CANCELLED' });
        if (['COMPLETED', 'DELIVERED'].includes(String(order.status))) return res.json({ ok: true });
        if (!['TAKEAWAY', 'PICKUP', 'KIOSK'].includes(String(order.type))) {
            return res.status(409).json({ ok: false, code: 'PACKING_HANDOVER_TYPE_INVALID' });
        }

        await transitionOrderStatus({
            orderId,
            nextStatus: 'DELIVERED',
            notes: 'Packing handover from public operator screen',
            changedBy: 'public-packing-screen',
            user: { role: 'SUPER_ADMIN' },
            skipPolicy: true,
            requireKitchenReady: true,
        });

        emitRefresh(order.branchId, { orderId, status: 'DELIVERED' });
        return res.json({ ok: true });
    } catch (error: any) {
        const statusCode = Number(error?.status) || 500;
        return res.status(statusCode).json({ ok: false, code: error?.code || 'PUBLIC_SCREEN_HANDOVER_FAILED', message: error?.message || 'Handover failed' });
    }
});

/**
 * Public customer order tracking (no auth — link-only). Returns a privacy-safe
 * subset: no phone, no address, no payment internals. Order ids are
 * unguessable (uuid / CC-xxxxxx), which is the access control.
 */
router.get('/track/:id', async (req, res) => {
    try {
        const orderId = getParam((req.params as any).id);
        if (!orderId) return res.status(400).json({ ok: false, code: 'ORDER_ID_REQUIRED' });
        const [order] = await db.select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            type: orders.type,
            branchId: orders.branchId,
            total: orders.total,
            createdAt: orders.createdAt,
            actualDeliveryTime: orders.actualDeliveryTime,
            completedAt: orders.completedAt,
        }).from(orders).where(eq(orders.id, orderId)).limit(1);
        if (!order) return res.status(404).json({ ok: false, code: 'ORDER_NOT_FOUND' });

        const [branch] = order.branchId
            ? await db.select({ name: branches.name, phone: branches.phone }).from(branches).where(eq(branches.id, order.branchId)).limit(1)
            : [];
        const items = await db.select({
            name: orderItems.name,
            nameAr: orderItems.nameAr,
            quantity: orderItems.quantity,
        }).from(orderItems).where(eq(orderItems.orderId, orderId));

        return res.json({
            ok: true,
            order: {
                id: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                type: order.type,
                total: Number(order.total || 0),
                createdAt: order.createdAt,
                deliveredAt: order.actualDeliveryTime || order.completedAt || null,
                branchName: (branch as any)?.name || null,
                branchPhone: (branch as any)?.phone || null,
                items: items.map((item: any) => ({
                    name: item.nameAr || item.name,
                    quantity: Number(item.quantity || 0),
                })),
            },
        });
    } catch (error: any) {
        return res.status(500).json({ ok: false, code: 'TRACK_FAILED', message: error?.message || 'Tracking failed' });
    }
});

export default router;
