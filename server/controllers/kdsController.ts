import { Request, Response } from 'express';
import { db, pool } from '../db';
import { kdsTickets, kdsTicketItems, menuCategories, menuItems, orders, orderItems, printers, tables } from '../../src/db/schema';
import { eq, inArray, and, notInArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';
import { getStringParam } from '../utils/request';
import { getIO } from '../socket';
import { transitionOrderStatus } from '../services/orderLifecycleService';
import { enqueuePrintJob } from '../services/printQueueService';

let kdsSchemaReady = false;

const ensureKdsSchema = async () => {
    if (kdsSchemaReady) return;
    await pool.query(`
        IF OBJECT_ID('kds_tickets', 'U') IS NULL
        CREATE TABLE kds_tickets (
            id nvarchar(255) NOT NULL,
            branch_id nvarchar(255) NOT NULL,
            order_id nvarchar(255) NOT NULL,
            routing_station nvarchar(255) NOT NULL,
            target_time datetime2 NULL,
            status nvarchar(255) DEFAULT 'PENDING',
            priority nvarchar(255) DEFAULT 'NORMAL',
            printed_at datetime2 NULL,
            bumped_at datetime2 NULL,
            created_at datetime2 DEFAULT GETDATE(),
            updated_at datetime2 DEFAULT GETDATE(),
            CONSTRAINT pk_kds_tickets PRIMARY KEY (id),
            CONSTRAINT fk_kds_tickets_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
            CONSTRAINT fk_kds_tickets_order FOREIGN KEY (order_id) REFERENCES orders(id)
        );

        IF OBJECT_ID('kds_ticket_items', 'U') IS NULL
        CREATE TABLE kds_ticket_items (
            id int IDENTITY(1,1) NOT NULL,
            kds_ticket_id nvarchar(255) NOT NULL,
            order_item_id int NULL,
            menu_item_id nvarchar(255) NOT NULL,
            item_name nvarchar(max) NOT NULL,
            quantity int NOT NULL,
            modifiers_text nvarchar(max) NULL,
            is_bumped bit DEFAULT 0,
            CONSTRAINT pk_kds_ticket_items PRIMARY KEY (id),
            CONSTRAINT fk_kds_ticket_items_ticket FOREIGN KEY (kds_ticket_id) REFERENCES kds_tickets(id) ON DELETE CASCADE
        );

        IF OBJECT_ID('kds_ticket_items', 'U') IS NOT NULL
           AND COL_LENGTH('kds_ticket_items', 'is_bumped') IS NULL
        ALTER TABLE kds_ticket_items
            ADD is_bumped bit NOT NULL
                CONSTRAINT df_kds_ticket_items_is_bumped DEFAULT 0;
    `);
    kdsSchemaReady = true;
};

const canAccessBranch = (req: Request, branchId?: string | null) => {
    if (!branchId) return false;
    if (String(req.user?.role || '').toUpperCase() === 'SUPER_ADMIN') return true;
    return req.effectiveBranchId === branchId || req.user?.branchId === branchId || (req.user?.allowedBranches || []).includes(branchId);
};

const normalizeStationName = (value?: string | null) => {
    const normalized = String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || 'KITCHEN';
};

const normalizePrinterIds = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    if (typeof value !== 'string') return [];
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    } catch {}
    return trimmed.split(',').map((id) => id.trim()).filter(Boolean);
};

const formatKitchenTicket = (params: {
    ticketId: string;
    order: { id: string; orderNumber?: string | number | null; type?: string | null; tableId?: string | null; tableName?: string | null; kitchenNotes?: string | null; createdAt?: Date | string | null };
    station: string;
    items: any[];
}) => {
    const lines: string[] = [];
    const createdAt = params.order.createdAt ? new Date(params.order.createdAt).toLocaleString('ar-EG') : new Date().toLocaleString('ar-EG');
    lines.push('*** تذكرة مطبخ ***');
    lines.push(`القسم: ${params.station}`);
    lines.push(`رقم الطلب: ${params.order.orderNumber || params.order.id}`);
    lines.push(`Order ID: ${params.order.id}`);
    lines.push(`النوع: ${params.order.type || '-'}`);
    if (params.order.tableId || params.order.tableName) lines.push(`الترابيزة: ${params.order.tableName || params.order.tableId}`);
    lines.push(`الوقت: ${createdAt}`);
    lines.push('------------------------------');
    for (const item of params.items) {
        lines.push(`${Number(item.quantity || 0)} x ${item.name || item.itemName || ''}`);
        const notes = item.notes || item.modifiersText || (item.modifiers ? JSON.stringify(item.modifiers) : '');
        if (notes) lines.push(`  ${notes}`);
    }
    if (params.order.kitchenNotes) {
        lines.push('------------------------------');
        lines.push(`ملاحظات: ${params.order.kitchenNotes}`);
    }
    lines.push('------------------------------');
    lines.push(`Ticket: ${params.ticketId}`);
    lines.push('\n\n');
    return lines.join('\n');
};

const kitchenDoneStatuses = new Set(['READY', 'SERVED']);

const syncOrderReadyWhenKitchenComplete = async (req: Request, orderId?: string | null) => {
    if (!orderId) return false;
    const orderTickets = await db.select().from(kdsTickets).where(eq(kdsTickets.orderId, orderId));
    if (orderTickets.length === 0 || !orderTickets.every(t => kitchenDoneStatuses.has(String(t.status)))) {
        return false;
    }

const [order] = await db.select({ id: orders.id, status: orders.status }).top(1).from(orders).where(eq(orders.id, orderId));
    if (!order || ['READY', 'DELIVERED', 'COMPLETED', 'CANCELLED'].includes(String(order.status))) {
        return Boolean(order && String(order.status) === 'READY');
    }

    await transitionOrderStatus({
        orderId,
        nextStatus: 'READY',
        notes: 'Kitchen tickets ready',
        changedBy: req.user?.id,
        user: {
            role: req.user?.role,
            branchId: req.user?.branchId,
            allowedBranches: req.user?.allowedBranches,
        },
    });
    return true;
};

export const kdsController = {
    // Polling endpoint for kitchen displays
    async getTickets(req: Request, res: Response) {
        try {
            await ensureKdsSchema();
            const { station } = req.query;
            const branchId = req.effectiveBranchId;
            const includeServed = String(req.query.includeServed || '').toLowerCase() === 'true';
            const activeStatuses = includeServed ? ['DELIVERED', 'CANCELLED'] : ['SERVED', 'DELIVERED', 'CANCELLED'];
            const filters = [
                branchId ? eq(kdsTickets.branchId, branchId) : undefined,
                station ? eq(kdsTickets.routingStation, String(station)) : undefined,
                notInArray(kdsTickets.status, activeStatuses),
            ].filter(Boolean) as any[];
            const tickets = station
                ? await db.select().from(kdsTickets).where(and(...filters))
                : await db.select().from(kdsTickets).where(and(...filters));

            // Hydrate with items
            const ticketIds = tickets.map(t => t.id);
            const orderIds = Array.from(new Set(tickets.map(t => t.orderId)));

            const [items, orderMeta] = await Promise.all([
                ticketIds.length > 0 ? db.select().from(kdsTicketItems).where(inArray(kdsTicketItems.kdsTicketId, ticketIds)) : Promise.resolve([]),
                orderIds.length > 0
                    ? db
                        .select({ id: orders.id, orderNumber: orders.orderNumber, type: orders.type, tableId: orders.tableId, tableName: tables.name, notes: orders.kitchenNotes })
                        .from(orders)
                        .leftJoin(tables, eq(tables.id, orders.tableId))
                        .where(inArray(orders.id, orderIds))
                    : Promise.resolve([])
            ]);

            const ordersById = Object.fromEntries(orderMeta.map(o => [o.id, o]));
            const itemMenuIds = Array.from(new Set(items.map(item => item.menuItemId).filter(Boolean)));
            const menuNameRows = itemMenuIds.length > 0
                ? await db
                    .select({ id: menuItems.id, name: menuItems.name, nameAr: menuItems.nameAr })
                    .from(menuItems)
                    .where(inArray(menuItems.id, itemMenuIds))
                : [];
            const menuNamesById = new Map(menuNameRows.map(item => [item.id, item]));
            const itemsByTicket: Record<string, any[]> = {};
            items.forEach(i => {
                if (!itemsByTicket[i.kdsTicketId]) itemsByTicket[i.kdsTicketId] = [];
                const menuName = menuNamesById.get(i.menuItemId);
                // Map DB field `itemName` to `name` which the frontend KDS component expects
                itemsByTicket[i.kdsTicketId].push({
                    ...i,
                    name: menuName?.nameAr || i.itemName || menuName?.name || 'Item',
                    nameAr: menuName?.nameAr || i.itemName,
                });
            });

            const populated = tickets.map(t => ({
                ...t,
                items: itemsByTicket[t.id] || [],
                orderNumber: ordersById[t.orderId]?.orderNumber,
                type: ordersById[t.orderId]?.type,
                tableId: ordersById[t.orderId]?.tableId,
                tableName: ordersById[t.orderId]?.tableName,
                kitchenNotes: ordersById[t.orderId]?.notes
            }));

            res.json(populated);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    async dispatchOrder(req: Request, res: Response) {
        try {
            const orderId = getStringParam(req.body?.orderId || req.body?.order_id);
            const requestedBranchId = getStringParam(req.body?.branchId || req.body?.branch_id || req.effectiveBranchId);
            if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });

            const [order] = await db.select({ id: orders.id, branchId: orders.branchId }).top(1).from(orders).where(eq(orders.id, orderId));
            if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
            if (requestedBranchId && requestedBranchId !== order.branchId) return res.status(400).json({ error: 'ORDER_BRANCH_MISMATCH' });
            if (!canAccessBranch(req, order.branchId)) return res.status(403).json({ error: 'FORBIDDEN_BRANCH_SCOPE' });

            const clientHandlesPrinting = req.body?.clientHandlesPrinting === true;
            await kdsController.dispatchToKitchen(order.branchId, order.id, {
                enqueuePrintJobs: !clientHandlesPrinting,
            });
            return res.json({ success: true, branchId: order.branchId, orderId: order.id });
        } catch (error: any) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Trigger KDS Tickets (Called internally by POS / Order Service)
    async dispatchToKitchen(
        branchId: string,
        orderId: string,
        options: { enqueuePrintJobs?: boolean } = {},
    ) {
        try {
            await ensureKdsSchema();
            // Guard against duplicate dispatching
            const existing = await db.select().top(1).from(kdsTickets).where(eq(kdsTickets.orderId, orderId));
            if (existing.length > 0) return;

            const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
            if (orderItemsList.length === 0) return;
            const [orderMeta] = await db
                .select({
                    id: orders.id,
                    orderNumber: orders.orderNumber,
                    type: orders.type,
                    tableId: orders.tableId,
                    tableName: tables.name,
                    kitchenNotes: orders.kitchenNotes,
                    createdAt: orders.createdAt,
                })
                .top(1)
                .from(orders)
                .leftJoin(tables, eq(tables.id, orders.tableId))
                .where(eq(orders.id, orderId));

            const menuItemIds = Array.from(new Set(
                orderItemsList
                    .map(item => item.menuItemId)
                    .filter((id): id is string => Boolean(id)),
            ));
            const menuRoutingRows = menuItemIds.length > 0
                ? await db
                    .select({
                        id: menuItems.id,
                        itemPrinterIds: menuItems.printerIds,
                        categoryPrinterIds: menuCategories.printerIds,
                    })
                    .from(menuItems)
                    .leftJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
                    .where(inArray(menuItems.id, menuItemIds))
                : [];
            const routedPrinterIds = Array.from(new Set(
                menuRoutingRows.flatMap(row => [
                    ...normalizePrinterIds(row.itemPrinterIds),
                    ...normalizePrinterIds(row.categoryPrinterIds),
                ]),
            ));
            const printerRows = routedPrinterIds.length > 0
                ? await db
                    .select({
                        id: printers.id,
                        name: printers.name,
                        code: printers.code,
                        role: printers.role,
                        roles: printers.roles,
                        type: printers.type,
                        address: printers.address,
                    })
                    .from(printers)
                    .where(inArray(printers.id, routedPrinterIds))
                : [];
            const printerById = new Map(printerRows.map(printer => [printer.id, printer]));
            const stationByMenuItemId = new Map<string, string[]>();
            const printerIdsByStation = new Map<string, string[]>();

            for (const row of menuRoutingRows) {
                const itemPrinterIds = normalizePrinterIds(row.itemPrinterIds);
                const printerIds = itemPrinterIds.length ? itemPrinterIds : normalizePrinterIds(row.categoryPrinterIds);
                const stations = printerIds.map((printerId) => {
                    const printer = printerById.get(printerId);
                    const primaryRole = Array.isArray(printer?.roles) ? printer.roles.find(Boolean) : null;
                    const station = normalizeStationName(printer?.code || primaryRole || printer?.role || printer?.name || printerId);
                    const current = printerIdsByStation.get(station) || [];
                    current.push(printerId);
                    printerIdsByStation.set(station, Array.from(new Set(current)));
                    return station;
                });
                stationByMenuItemId.set(row.id, Array.from(new Set(stations.length ? stations : ['KITCHEN'])));
            }

            const ticketsBuffer: any = {};

            // Group items by station
            orderItemsList.forEach(item => {
                const stations = item.menuItemId ? stationByMenuItemId.get(item.menuItemId) : null;
                for (const station of stations?.length ? stations : ['KITCHEN']) {
                    if (!ticketsBuffer[station]) ticketsBuffer[station] = [];
                    ticketsBuffer[station].push(item);
                }
            });

            const printJobsToCreate: Array<{ ticketId: string; station: string; printerId?: string; printer?: any; items: any[] }> = [];

            await db.transaction(async (tx) => {
                for (const station of Object.keys(ticketsBuffer)) {
                    const ticketId = `KDS-${nanoid(8)}`;
                    await tx.insert(kdsTickets).values({
                        id: ticketId,
                        branchId,
                        orderId,
                        routingStation: station,
                        status: 'PENDING',
                        createdAt: new Date()
                    });

                    const itemsToInsert = ticketsBuffer[station].map((item: any) => ({
                        kdsTicketId: ticketId,
                        menuItemId: String(item.menuItemId || item.menu_item_id || item.id),
                        itemName: item.nameAr || item.name_ar || item.name,
                        quantity: item.quantity,
                        modifiersText: item.modifiers ? JSON.stringify(item.modifiers) : null,
                    }));

                    await tx.insert(kdsTicketItems).values(itemsToInsert);
                    const stationPrinterIds = printerIdsByStation.get(station) || [];
                    if (stationPrinterIds.length === 0) {
                        printJobsToCreate.push({ ticketId, station, items: ticketsBuffer[station] });
                    } else {
                        for (const printerId of stationPrinterIds) {
                            printJobsToCreate.push({ ticketId, station, printerId, printer: printerById.get(printerId), items: ticketsBuffer[station] });
                        }
                    }
                }
            });

            for (const printJob of options.enqueuePrintJobs === false ? [] : printJobsToCreate) {
                try {
                    await enqueuePrintJob({
                        branchId,
                        type: 'KITCHEN',
                        content: formatKitchenTicket({
                            ticketId: printJob.ticketId,
                            order: orderMeta || { id: orderId },
                            station: printJob.station,
                            items: printJob.items,
                        }),
                        contentType: 'text',
                        printerId: printJob.printerId || null,
                        printerAddress: printJob.printer?.address || null,
                        printerType: String(printJob.printer?.type || 'LOCAL').toUpperCase() as any,
                        createdBy: 'kds-dispatch',
                        maxAttempts: 3,
                    });
                    await db.update(kdsTickets).set({ printedAt: new Date(), updatedAt: new Date() }).where(eq(kdsTickets.id, printJob.ticketId));
                } catch (printError: any) {
                    logger.error({ err: printError?.message, orderId, ticketId: printJob.ticketId }, 'Failed to enqueue kitchen print job');
                }
            }

            // Alert KDS screens in real-time
            const branchRoom = branchId ? `branch:${branchId}` : null;
            if (branchRoom) {
                try {
                    getIO().to(branchRoom).emit('kds:update');
                } catch (e) {
                   if (process.env.NODE_ENV !== 'test') {
                       logger.warn({ err: e, orderId }, 'Socket emit failed for KDS');
                   }
                }
            }

            logger.info({ orderId }, 'KDS tickets dispatched successfully');
            console.log(`[KDS] Dispatched tickets for order ${orderId} across stations: ${Object.keys(ticketsBuffer).join(',')}`);
        } catch (error: any) {
            logger.error({ err: error, orderId }, 'Failed to dispatch KDS tickets');
            console.error(`[KDS] dispatchToKitchen failed for order ${orderId}:`, error);
        }
    },

    // Mark ticket as ready
    async bumpTicket(req: Request, res: Response) {
        try {
            await ensureKdsSchema();
            const ticketId = getStringParam(req.params.id);
            if (!ticketId) return res.status(400).json({ error: 'TICKET_ID_REQUIRED' });

            // 1. Fetch current ticket to identify order context
            const [ticket] = await db.select().top(1).from(kdsTickets).where(eq(kdsTickets.id, ticketId));
            if (!ticket) return res.status(404).json({ error: 'TICKET_NOT_FOUND' });
            if (!canAccessBranch(req, ticket.branchId)) return res.status(403).json({ error: 'FORBIDDEN_BRANCH_SCOPE' });

            if (ticket.status === 'READY') {
                await db.update(kdsTickets)
                    .set({ status: 'SERVED', updatedAt: new Date() })
                    .where(eq(kdsTickets.id, ticketId));
                await syncOrderReadyWhenKitchenComplete(req, ticket.orderId);

                const room = ticket.branchId ? `branch:${ticket.branchId}` : null;
                if (room) {
                    try {
                        getIO().to(room).emit('kds:update');
                    } catch(e){}
                }

                return res.json({ success: true, served: true });
            }

            // 2. Mark this kitchen ticket as ready
            await db.update(kdsTickets)
                .set({ status: 'READY', bumpedAt: new Date(), updatedAt: new Date() })
                .where(eq(kdsTickets.id, ticketId));

            // 3. Verify if all tickets belonging to this order are now ready
            const allReady = await syncOrderReadyWhenKitchenComplete(req, ticket.orderId);

            // Always tell KDS stations to refresh to drop the ready ticket
            const room = ticket.branchId ? `branch:${ticket.branchId}` : null;
            if (room) {
                try { getIO().to(room).emit('kds:update'); } catch(e){}
            }

            res.json({ success: true, allReady });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    // Recall ticket (Undo bump)
    async recallTicket(req: Request, res: Response) {
        try {
            await ensureKdsSchema();
            const ticketId = getStringParam(req.params.id);
            if (!ticketId) return res.status(400).json({ error: 'TICKET_ID_REQUIRED' });

            const [ticket] = await db.select().top(1).from(kdsTickets).where(eq(kdsTickets.id, ticketId));
            if (!ticket) return res.status(404).json({ error: 'TICKET_NOT_FOUND' });
            if (!canAccessBranch(req, ticket.branchId)) return res.status(403).json({ error: 'FORBIDDEN_BRANCH_SCOPE' });

            // Restore ticket to preparing
            await db.update(kdsTickets)
                .set({ status: 'PREPARING', bumpedAt: null, updatedAt: new Date() })
                .where(eq(kdsTickets.id, ticketId));

            if (ticket.orderId) {
                // Determine if overall order should be restored to PREPARING
                const [order] = await db.select().top(1).from(orders).where(eq(orders.id, ticket.orderId));
                if (order && (order.status === 'READY' || order.status === 'SERVED')) {
                    await db.update(orders)
                        .set({ status: 'PREPARING', updatedAt: new Date() })
                        .where(eq(orders.id, ticket.orderId));

                    const branchRoom = ticket.branchId ? `branch:${ticket.branchId}` : null;
                    if (branchRoom) {
                        try {
                            getIO().to(branchRoom).emit('order:status', { id: ticket.orderId, status: 'PREPARING' });
                        } catch (ioError) {}
                    }
                }
            }

            const room = ticket.branchId ? `branch:${ticket.branchId}` : null;
            if (room) {
                try { getIO().to(room).emit('kds:update'); } catch(e){}
            }

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    },

    async handoverOrder(req: Request, res: Response) {
        try {
            await ensureKdsSchema();
            const orderId = getStringParam(req.params.orderId);
            if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });

            const [order] = await db.select({ id: orders.id, branchId: orders.branchId, status: orders.status })
                .top(1)
                .from(orders)
                .where(eq(orders.id, orderId));
            if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
            if (!canAccessBranch(req, order.branchId)) return res.status(403).json({ error: 'FORBIDDEN_BRANCH_SCOPE' });

            if (!['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(String(order.status))) {
                await transitionOrderStatus({
                    orderId,
                    nextStatus: 'DELIVERED',
                    notes: 'Packing handover',
                    changedBy: req.user?.id,
                    user: {
                        role: req.user?.role,
                        branchId: req.user?.branchId,
                        allowedBranches: req.user?.allowedBranches,
                    },
                });
            }

            await db.update(kdsTickets)
                .set({ status: 'DELIVERED', updatedAt: new Date() })
                .where(eq(kdsTickets.orderId, orderId));

            const room = order.branchId ? `branch:${order.branchId}` : null;
            if (room) {
                try {
                    getIO().to(room).emit('kds:update');
                } catch (ioError) {
                    logger.error({ err: ioError, orderId }, 'Failed to emit socket for packing handover');
                }
            }

            res.json({ success: true });
        } catch (error: any) {
            const statusCode = Number(error?.status) || 500;
            res.status(statusCode).json({
                error: error?.code || error?.message || 'HANDOVER_FAILED',
                message: error?.message || 'Handover failed',
            });
        }
    },

    // Toggle specific item logic (Strike-through)
    async toggleItem(req: Request, res: Response) {
        try {
            await ensureKdsSchema();
            const ticketId = getStringParam(req.params.id);
            const itemId = parseInt(getStringParam(req.params.itemId) || '0', 10);

            if (!ticketId || !itemId) return res.status(400).json({ error: 'INVALID_PARAMS' });

            const [item] = await db.select().top(1).from(kdsTicketItems)
                .where(and(eq(kdsTicketItems.id, itemId), eq(kdsTicketItems.kdsTicketId, ticketId)));

            if (!item) return res.status(404).json({ error: 'ITEM_NOT_FOUND' });

            await db.update(kdsTicketItems)
                .set({ isBumped: !item.isBumped })
                .where(eq(kdsTicketItems.id, itemId));

            const [ticket] = await db.select().top(1).from(kdsTickets).where(eq(kdsTickets.id, ticketId));
            if (ticket && !canAccessBranch(req, ticket.branchId)) return res.status(403).json({ error: 'FORBIDDEN_BRANCH_SCOPE' });
            if (ticket && ticket.branchId) {
                try { getIO().to(`branch:${ticket.branchId}`).emit('kds:update'); } catch(e){}
            }

            res.json({ success: true, isBumped: !item.isBumped });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
};
