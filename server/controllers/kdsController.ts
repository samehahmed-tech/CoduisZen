import { Request, Response } from 'express';
import { db, pool } from '../db';
import { kdsTickets, kdsTicketItems, menuCategories, menuItems, orderStatusHistory, orders, orderItems, printers, tables } from '../../src/db/schema';
import { eq, inArray, and, notInArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';
import { getStringParam } from '../utils/request';
import { getIO } from '../socket';
import { transitionOrderStatus, sweepStaleBranchOrders } from '../services/orderLifecycleService';
import { enqueuePrintJob } from '../services/printQueueService';
import { isKitchenRoutingPrinter, resolvePrinterRoutingStation } from '../services/kdsRouting';

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

        IF EXISTS (
            SELECT 1
            FROM sys.columns c
            JOIN sys.types t ON c.user_type_id = t.user_type_id
            WHERE c.object_id = OBJECT_ID('dbo.kds_tickets')
              AND c.name = 'priority'
              AND t.name <> 'nvarchar'
        )
        BEGIN
            DECLARE @kdsPriorityDefault sysname;
            SELECT @kdsPriorityDefault = dc.name
            FROM sys.default_constraints dc
            JOIN sys.columns c ON c.default_object_id = dc.object_id
            WHERE c.object_id = OBJECT_ID('dbo.kds_tickets') AND c.name = 'priority';
            IF @kdsPriorityDefault IS NOT NULL
            BEGIN
                DECLARE @dropKdsPriorityDefault nvarchar(max);
                SET @dropKdsPriorityDefault = N'ALTER TABLE dbo.kds_tickets DROP CONSTRAINT ' + QUOTENAME(@kdsPriorityDefault);
                EXEC sys.sp_executesql @dropKdsPriorityDefault;
            END;
            ALTER TABLE dbo.kds_tickets ALTER COLUMN priority nvarchar(255) NULL;
            UPDATE dbo.kds_tickets
            SET priority = CASE priority WHEN '1' THEN 'RUSH' WHEN '2' THEN 'REMAKE' ELSE 'NORMAL' END;
            ALTER TABLE dbo.kds_tickets ADD CONSTRAINT df_kds_tickets_priority DEFAULT 'NORMAL' FOR priority;
        END;

        IF OBJECT_ID('kds_ticket_items', 'U') IS NULL
        CREATE TABLE kds_ticket_items (
            id int IDENTITY(1,1) NOT NULL,
            kds_ticket_id nvarchar(255) NOT NULL,
            order_item_id int NULL,
            menu_item_id nvarchar(255) NOT NULL,
            item_name nvarchar(max) NOT NULL,
            quantity int NOT NULL,
            modifiers_text nvarchar(max) NULL,
            size_label nvarchar(255) NULL,
            item_notes nvarchar(max) NULL,
            is_bumped bit DEFAULT 0,
            CONSTRAINT pk_kds_ticket_items PRIMARY KEY (id),
            CONSTRAINT fk_kds_ticket_items_ticket FOREIGN KEY (kds_ticket_id) REFERENCES kds_tickets(id) ON DELETE CASCADE
        );

        IF OBJECT_ID('kds_ticket_items', 'U') IS NOT NULL
           AND COL_LENGTH('kds_ticket_items', 'size_label') IS NULL
        ALTER TABLE kds_ticket_items ADD size_label nvarchar(255) NULL;

        IF OBJECT_ID('kds_ticket_items', 'U') IS NOT NULL
           AND COL_LENGTH('kds_ticket_items', 'item_notes') IS NULL
        ALTER TABLE kds_ticket_items ADD item_notes nvarchar(max) NULL;

        IF OBJECT_ID('kds_ticket_items', 'U') IS NOT NULL
           AND COL_LENGTH('kds_ticket_items', 'is_bumped') IS NULL
        ALTER TABLE kds_ticket_items
            ADD is_bumped bit NOT NULL
                CONSTRAINT df_kds_ticket_items_is_bumped DEFAULT 0;

        IF COL_LENGTH('dbo.kds_ticket_items', 'ticket_id') IS NOT NULL
           AND COLUMNPROPERTY(OBJECT_ID('dbo.kds_ticket_items'), 'ticket_id', 'AllowsNull') = 0
        ALTER TABLE dbo.kds_ticket_items ALTER COLUMN ticket_id nvarchar(255) NULL;

        IF COL_LENGTH('dbo.kds_ticket_items', 'order_item_id') IS NOT NULL
           AND COLUMNPROPERTY(OBJECT_ID('dbo.kds_ticket_items'), 'order_item_id', 'AllowsNull') = 0
        ALTER TABLE dbo.kds_ticket_items ALTER COLUMN order_item_id int NULL;
    `);
    kdsSchemaReady = true;
};

const canAccessBranch = (req: Request, branchId?: string | null) => {
    if (!branchId) return false;
    if (String(req.user?.role || '').toUpperCase() === 'SUPER_ADMIN') return true;
    return req.effectiveBranchId === branchId || req.user?.branchId === branchId || (req.user?.allowedBranches || []).includes(branchId);
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

const JUNK_MODIFIER_TEXT = /\[object\s*object\]|\uFFFD/i;

/**
 * Resolves a readable size/variant label from any order-item shape.
 * Order items only carry sizeId — the name lives on menuItems.sizes.
 */
const resolveOrderItemSizeLabel = (item: any, sizesByMenuItemId?: Map<string, any[]>): string => {
    const direct = item?.sizeLabel || item?.size_label || item?.sizeName || item?.size_name
        || item?.selectedSizeName || item?.selectedSize?.name || item?.selectedSize?.nameAr
        || item?.size?.name || item?.size?.nameAr || item?.variantName || item?.variant;
    if (direct && String(direct).trim()) return String(direct).trim();
    const sizeId = String(item?.sizeId || item?.size_id || '').trim();
    if (!sizeId) return '';
    // sizeId may itself be a label when POS sends names instead of ids
    if (sizesByMenuItemId) {
        const sizes = sizesByMenuItemId.get(String(item?.menuItemId || item?.menu_item_id || '')) || [];
        const match = sizes.find((s: any) => String(s?.id || '') === sizeId);
        if (match) return String(match?.nameAr || match?.name || sizeId).trim();
    }
    return sizeId;
};

/**
 * Builds a readable "group: option ×qty, ..." summary from any modifier payload shape
 * (order-item arrays, kds modifiersText JSON, legacy "[object Object]" rows).
 */
const describeModifierEntry = (mod: any): string => {
    if (!mod || typeof mod === 'boolean') return '';
    if (typeof mod === 'string') {
        const text = mod.trim();
        return text && !JUNK_MODIFIER_TEXT.test(text) ? text : '';
    }
    if (typeof mod === 'number') return String(mod);
    if (typeof mod === 'object') {
        const option = String(
            mod?.optionName || mod?.option_name || mod?.nameAr || mod?.name_ar
            || mod?.name || mod?.itemName || mod?.title || mod?.label || mod?.value || '',
        ).trim();
        if (!option || JUNK_MODIFIER_TEXT.test(option)) return '';
        const group = String(mod?.groupName || mod?.group_name || mod?.group || '').trim();
        const quantity = Number(mod?.quantity || 1);
        const base = group && group !== option ? `${group}: ${option}` : option;
        return quantity > 1 ? `${base} ×${quantity}` : base;
    }
    return '';
};

const describeItemModifiers = (item: any): string => {
    let payload: unknown = item?.modifiers;
    if (!Array.isArray(payload) && typeof item?.modifiersText === 'string') {
        try {
            payload = JSON.parse(item.modifiersText);
        } catch {
            payload = null;
        }
    }
    if (Array.isArray(payload)) {
        const labels = (payload as any[]).map(describeModifierEntry)
            .filter((label: string) => Boolean(label));
        if (labels.length > 0) return Array.from(new Set(labels)).join('، ');
        return '';
    }
    const text = String(item?.modifiersText || '').trim();
    return text && !JUNK_MODIFIER_TEXT.test(text) ? text : '';
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
        const sizeLabel = resolveOrderItemSizeLabel(item);
        const title = sizeLabel
            ? `${Number(item.quantity || 0)} x ${item.name || item.itemName || ''} [${sizeLabel}]`
            : `${Number(item.quantity || 0)} x ${item.name || item.itemName || ''}`;
        lines.push(title);
        const modifierLine = describeItemModifiers(item);
        if (modifierLine) lines.push(`  + ${modifierLine}`);
        const itemNote = String(item.notes || item.itemNotes || item.item_notes || '').trim();
        if (itemNote) lines.push(`  ! ${itemNote}`);
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

const terminalHandoverStatus = (type?: string | null) => String(type || '').toUpperCase() === 'DINE_IN' ? 'COMPLETED' : 'DELIVERED';

/**
 * Marks every non-terminal kitchen ticket of an order as DELIVERED so the
 * kitchen/pickup screens no longer display it.
 */
const forceDeliverKdsTicketsByOrderId = async (orderId: string, now: Date) => {
    await db.update(kdsTickets)
        .set({ status: 'DELIVERED', updatedAt: now })
        .where(and(eq(kdsTickets.orderId, orderId), notInArray(kdsTickets.status, ['DELIVERED', 'CANCELLED'])));
};

/**
 * Last-resort handover path for orders blocked by stale-day / kitchen-ticket
 * guards. Writes the transition directly (with an audit history row) instead
 * of returning 409, so screens can always be cleared.
 */
const forceFinalizeOrderForHandover = async (orderId: string, userId?: string) => {
    const [order] = await db.select({ id: orders.id, branchId: orders.branchId, status: orders.status, type: orders.type, tableId: orders.tableId })
        .top(1)
        .from(orders)
        .where(eq(orders.id, orderId));
    if (!order) return;

    const now = new Date();
    const nextStatus = terminalHandoverStatus(order.type);
    if (!['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(String(order.status))) {
        await db.update(orders)
            .set({
                status: nextStatus,
                ...(nextStatus === 'DELIVERED' ? { actualDeliveryTime: now } : {}),
                ...(nextStatus === 'COMPLETED' ? { completedAt: now } : {}),
                updatedAt: now,
            })
            .where(eq(orders.id, orderId));
        await db.insert(orderStatusHistory).values({
            orderId,
            status: nextStatus,
            changedBy: userId || null,
            notes: 'Packing handover (forced: stale day or missing kitchen tickets)',
            createdAt: now,
        });
        if (nextStatus === 'COMPLETED' && order.tableId) {
            await db.update(tables)
                .set({ status: 'AVAILABLE', currentOrderId: null, lockedByUserId: null, updatedAt: now })
                .where(eq(tables.id, order.tableId));
        }
        const room = order.branchId ? `branch:${order.branchId}` : null;
        if (room) {
            try { getIO().to(room).emit('order:status', { id: orderId, status: nextStatus }); } catch (e) {}
        }
    }
    await forceDeliverKdsTicketsByOrderId(orderId, now);
};

export const kdsController = {
    async getMeta(req: Request, res: Response) {
        try {
            await ensureKdsSchema();
            const branchId = req.effectiveBranchId;
            if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });

            const [printerRows, ticketRows] = await Promise.all([
                db.select({
                    id: printers.id,
                    name: printers.name,
                    code: printers.code,
                    role: printers.role,
                    roles: printers.roles,
                    stationId: printers.stationId,
                }).from(printers).where(and(eq(printers.branchId, branchId), eq(printers.isActive, true))),
                db.select({ routingStation: kdsTickets.routingStation })
                    .from(kdsTickets)
                    .where(and(
                        eq(kdsTickets.branchId, branchId),
                        notInArray(kdsTickets.status, ['DELIVERED', 'CANCELLED']),
                    )),
            ]);

            const stations = Array.from(new Set([
                ...printerRows.filter(isKitchenRoutingPrinter).map(resolvePrinterRoutingStation),
                ...ticketRows.map(ticket => String(ticket.routingStation || '').trim().toUpperCase()).filter(Boolean),
            ])).sort();

            return res.json({
                stations: (stations.length ? stations : ['KITCHEN']).map(name => ({ name })),
                source: 'SERVER_ROUTING',
            });
        } catch (error: any) {
            return res.status(500).json({ error: error?.message || 'KDS_META_FAILED' });
        }
    },

    // Polling endpoint for kitchen displays
    async getTickets(req: Request, res: Response) {
        try {
            await ensureKdsSchema();
            const { station } = req.query;
            const branchId = req.effectiveBranchId;

            // Self-heal any stale orders left from already-closed business days.
            await sweepStaleBranchOrders(branchId);

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
                    .select({ id: menuItems.id, name: menuItems.name, nameAr: menuItems.nameAr, sizes: menuItems.sizes })
                    .from(menuItems)
                    .where(inArray(menuItems.id, itemMenuIds))
                : [];
            const menuNamesById = new Map(menuNameRows.map(item => [item.id, item]));
            const sizesByMenuItemId = new Map<string, any[]>(
                menuNameRows.map(row => [row.id, Array.isArray(row.sizes) ? row.sizes : []]),
            );
            // Backfill size/notes for tickets dispatched before size_label/item_notes existed
            const kdsOrderItemIds = Array.from(new Set(items.map(item => Number(item.orderItemId)).filter(n => Number.isFinite(n) && n > 0)));
            const orderItemRows = kdsOrderItemIds.length > 0
                ? await db
                    .select({ id: orderItems.id, sizeId: orderItems.sizeId, notes: orderItems.notes, modifiers: orderItems.modifiers })
                    .from(orderItems)
                    .where(inArray(orderItems.id, kdsOrderItemIds))
                : [];
            const orderItemsById = new Map(orderItemRows.map(row => [row.id, row]));
            const itemsByTicket: Record<string, any[]> = {};
            const seenTicketItemKeys = new Map<string, Set<string>>();
            items.forEach(i => {
                if (!itemsByTicket[i.kdsTicketId]) itemsByTicket[i.kdsTicketId] = [];
                // Defensive: a retried dispatch (or legacy rows) can leave two
                // kds_ticket_items rows pointing at the same order item. The
                // kitchen must show that line once per ticket.
                const itemKey = (i as any).orderItemId !== undefined && (i as any).orderItemId !== null
                    ? `orderItem:${String((i as any).orderItemId)}`
                    : `row:${String((i as any).id)}`;
                let seen = seenTicketItemKeys.get(i.kdsTicketId);
                if (!seen) {
                    seen = new Set<string>();
                    seenTicketItemKeys.set(i.kdsTicketId, seen);
                }
                if (seen.has(itemKey)) return;
                seen.add(itemKey);
                const menuName = menuNamesById.get(i.menuItemId);
                const linkedOrderItem = orderItemsById.get(Number((i as any).orderItemId));
                const mergedForSize = {
                    ...linkedOrderItem,
                    ...i,
                    menuItemId: (i as any).menuItemId,
                    sizeId: (i as any).sizeLabel ? undefined : linkedOrderItem?.sizeId,
                    sizeLabel: (i as any).sizeLabel,
                };
                const sizeLabel = (i as any).sizeLabel
                    || resolveOrderItemSizeLabel(mergedForSize, sizesByMenuItemId)
                    || resolveOrderItemSizeLabel(linkedOrderItem, sizesByMenuItemId);
                // Map DB field `itemName` to `name` which the frontend KDS component expects
                itemsByTicket[i.kdsTicketId].push({
                    ...i,
                    name: menuName?.nameAr || i.itemName || menuName?.name || 'Item',
                    nameAr: menuName?.nameAr || i.itemName,
                    sizeLabel: sizeLabel || null,
                    size: sizeLabel || null,
                    notes: (i as any).itemNotes || linkedOrderItem?.notes || (i as any).notes || null,
                    itemNotes: (i as any).itemNotes || linkedOrderItem?.notes || null,
                    modifiers: linkedOrderItem?.modifiers || (i as any).modifiers || null,
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
                    isUrgent: orders.isUrgent,
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
                        sizes: menuItems.sizes,
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
                        stationId: printers.stationId,
                        type: printers.type,
                        address: printers.address,
                    })
                    .from(printers)
                    .where(inArray(printers.id, routedPrinterIds))
                : [];
            const printerById = new Map(printerRows.map(printer => [printer.id, printer]));
            const stationByMenuItemId = new Map<string, string[]>();
            const sizesByMenuItemId = new Map<string, any[]>(
                menuRoutingRows.map(row => [row.id, Array.isArray((row as any).sizes) ? (row as any).sizes : []]),
            );
            const printerIdsByStation = new Map<string, string[]>();

            for (const row of menuRoutingRows) {
                const itemPrinterIds = normalizePrinterIds(row.itemPrinterIds);
                const printerIds = itemPrinterIds.length ? itemPrinterIds : normalizePrinterIds(row.categoryPrinterIds);
                const stations = printerIds.map((printerId) => {
                    const printer = printerById.get(printerId);
                    const station = resolvePrinterRoutingStation(printer || { id: printerId });
                    const current = printerIdsByStation.get(station) || [];
                    current.push(printerId);
                    printerIdsByStation.set(station, Array.from(new Set(current)));
                    return station;
                });
                stationByMenuItemId.set(row.id, Array.from(new Set(stations.length ? stations : ['KITCHEN'])));
            }

            const ticketsBuffer: any = {};

            // Group items by station (stations are already de-duplicated per
            // menu item, so each order line lands at most once per ticket).
            orderItemsList.forEach(item => {
                const stations = item.menuItemId ? stationByMenuItemId.get(item.menuItemId) : null;
                const uniqueStations = Array.from(new Set(stations?.length ? stations : ['KITCHEN']));
                for (const station of uniqueStations) {
                    if (!ticketsBuffer[station]) ticketsBuffer[station] = [];
                    const bucket = ticketsBuffer[station] as any[];
                    if (!bucket.some(existing => existing?.id !== undefined && existing.id === item.id)) {
                        bucket.push(item);
                    }
                }
            });

            const printJobsToCreate: Array<{ ticketId: string; station: string; printerId?: string; printer?: any; items: any[] }> = [];

            await db.transaction(async (tx) => {
                // Re-check inside the transaction: two concurrent dispatches
                // (POS retry + server auto-dispatch) must not create duplicate
                // ticket sets for the same order.
                const already = await tx.select({ id: kdsTickets.id }).from(kdsTickets).where(eq(kdsTickets.orderId, orderId));
                if (already.length > 0) return;
                for (const station of Object.keys(ticketsBuffer)) {
                    const ticketId = `KDS-${nanoid(8)}`;
                    await tx.insert(kdsTickets).values({
                        id: ticketId,
                        branchId,
                        orderId,
                        routingStation: station,
                        status: 'PENDING',
                        priority: orderMeta?.isUrgent ? 'RUSH' : 'NORMAL',
                        createdAt: new Date()
                    });

                    const itemsToInsert = ticketsBuffer[station].map((item: any) => ({
                        kdsTicketId: ticketId,
                        orderItemId: item.id,
                        menuItemId: String(item.menuItemId || item.menu_item_id || item.id),
                        itemName: item.nameAr || item.name_ar || item.name,
                        quantity: item.quantity,
                        modifiersText: item.modifiers ? JSON.stringify(item.modifiers) : null,
                        sizeLabel: resolveOrderItemSizeLabel(item, sizesByMenuItemId) || null,
                        itemNotes: String(item.notes || '').trim() || null,
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
            throw error;
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
                    // Audit the direct demotion (bypasses the status policy
                    // by design — kitchen recall), so history stays complete.
                    await db.insert(orderStatusHistory).values({
                        orderId: ticket.orderId,
                        status: 'PREPARING',
                        changedBy: (req as any)?.user?.id || null,
                        notes: `KDS_RECALL ticket ${ticketId}`,
                        createdAt: new Date(),
                    });

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

            const [order] = await db.select({ id: orders.id, branchId: orders.branchId, status: orders.status, type: orders.type })
                .top(1)
                .from(orders)
                .where(eq(orders.id, orderId));
            if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
            if (!canAccessBranch(req, order.branchId)) return res.status(403).json({ error: 'FORBIDDEN_BRANCH_SCOPE' });
            if (String(order.status) === 'CANCELLED') return res.status(409).json({ error: 'ORDER_CANCELLED' });
            if (['COMPLETED', 'DELIVERED'].includes(String(order.status))) {
                // Already terminal: make sure no stale kitchen ticket keeps the screens dirty.
                await forceDeliverKdsTicketsByOrderId(orderId, new Date());
                return res.json({ success: true });
            }
            if (!['TAKEAWAY', 'PICKUP', 'KIOSK'].includes(String(order.type))) {
                return res.status(409).json({ error: 'PACKING_HANDOVER_TYPE_INVALID' });
            }

            try {
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
                    requireKitchenReady: true,
                });
            } catch (transitionError: any) {
                const code = String(transitionError?.code || transitionError?.message || '');
                const forceFinalizeCodes = new Set([
                    'ORDER_BUSINESS_DAY_CLOSED',
                    'ORDER_HISTORY_READ_ONLY',
                    'KITCHEN_TICKETS_MISSING',
                    'KITCHEN_TICKETS_NOT_READY',
                ]);
                if (!forceFinalizeCodes.has(code)) throw transitionError;
                // Stale ticket/day guards must not trap orders on the pickup screen:
                // finalize them directly so the handover always clears the display.
                await forceFinalizeOrderForHandover(orderId, req.user?.id);
            }

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
