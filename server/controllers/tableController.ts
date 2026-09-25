import { Request, Response } from 'express';
import { db } from '../db';
import { tables, floorZones, orders, orderItems, orderStatusHistory, settings, branches } from '../../src/db/schema';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { getIO } from '../socket';
import { logger } from '../utils/logger';
import { parseSettingJson, upsertSetting } from '../utils/settingsStore.js';
import { createSignedAuditLog } from '../services/auditService';
import { allocateDailyOrderNumber } from '../services/orderNumberService';

const tableRefKey = (referenceId: string) => `tableOpRef:${referenceId}`;

const loadReplayPayload = async (referenceId?: string) => {
    if (!referenceId) return null;
    const [row] = await db.select().top(1).from(settings).where(eq(settings.key, tableRefKey(referenceId)));
    return parseSettingJson<any | null>(row?.value, null);
};

const saveReplayPayload = async (referenceId: string, payload: any, updatedBy?: string) => {
    await upsertSetting({
        key: tableRefKey(referenceId),
        value: payload,
        category: 'table-idempotency',
        updatedBy: updatedBy || 'system',
    });
};

const parseLayoutInt = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.round(parsed);
};

const parseLayoutNumber = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const parseLayoutText = (value: unknown, fallback: string) => {
    const text = String(value ?? '').trim();
    return text || fallback;
};

const normalizeCouponCode = (value: unknown) => String(value ?? '').trim().toUpperCase() || null;

const normalizeTableShape = (value: unknown) => {
    const shape = parseLayoutText(value, 'square').toLowerCase();
    if (['square', 'round', 'rectangle', 'circle', 'oval', 'booth', 'bar'].includes(shape)) return shape === 'circle' ? 'round' : shape;
    return 'square';
};

const normalizeTableStatus = (value: unknown) => {
    const status = parseLayoutText(value, 'AVAILABLE').toUpperCase();
    if (status === 'AVAILABLE') return 'AVAILABLE';
    if (['OCCUPIED', 'RESERVED', 'DIRTY', 'OUT_OF_SERVICE'].includes(status)) return 'OCCUPIED';
    return 'AVAILABLE';
};

const normalizeZoneLayout = (zone: any, branchId: string) => ({
    id: parseLayoutText(zone?.id, ''),
    name: parseLayoutText(zone?.name, 'Main'),
    branchId,
    width: parseLayoutInt(zone?.width, 800),
    height: parseLayoutInt(zone?.height, 600),
    updatedAt: new Date(),
});

const normalizeTableLayout = (table: any, branchId: string) => ({
    id: parseLayoutText(table?.id, ''),
    name: parseLayoutText(table?.name, 'Table'),
    branchId,
    zoneId: table?.zoneId ? String(table.zoneId) : null,
    x: parseLayoutInt(table?.x ?? table?.position?.x, 0),
    y: parseLayoutInt(table?.y ?? table?.position?.y, 0),
    width: parseLayoutInt(table?.width, 100),
    height: parseLayoutInt(table?.height, 100),
    shape: normalizeTableShape(table?.shape),
    seats: Math.max(1, parseLayoutInt(table?.seats, 4)),
    discount: normalizeCouponCode(table?.defaultCouponCode)
        ? 0
        : Math.min(100, Math.max(0, parseLayoutNumber(table?.discount, 0))),
    defaultCouponCode: normalizeCouponCode(table?.defaultCouponCode),
    minSpend: Math.max(0, parseLayoutNumber(table?.minSpend, 0)),
    isVIP: table?.isVIP === true,
    notes: String(table?.notes ?? '').trim() || null,
    status: normalizeTableStatus(table?.status),
    updatedAt: new Date(),
});

export const getTables = async (req: Request, res: Response) => {
    try {
        const branchId = getStringParam(req.query.branchId);
        if (!branchId) return res.status(400).json({ error: 'Branch ID required' });

        const allTables = await db.select().from(tables).where(eq(tables.branchId, branchId));
        res.json(allTables.map((table) => ({
            ...table,
            status: normalizeTableStatus(table.status),
        })));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getZones = async (req: Request, res: Response) => {
    try {
        const branchId = getStringParam(req.query.branchId);
        if (!branchId) return res.status(400).json({ error: 'Branch ID required' });

        const allZones = await db.select().from(floorZones).where(eq(floorZones.branchId, branchId));
        res.json(allZones);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const saveLayout = async (req: Request, res: Response) => {
    try {
        const { branchId: requestedBranchId, zones: zonesData, tables: tablesData, reference_id } = req.body || {};
        const branchId = req.effectiveBranchId || getStringParam(requestedBranchId);
        const replayId = reference_id ? String(reference_id) : '';

        if (!branchId) {
            return res.status(400).json({
                code: 'BRANCH_REQUIRED',
                error: 'BRANCH_REQUIRED',
                message: 'Branch ID is required to save floor layout.',
            });
        }

        if (!Array.isArray(zonesData) || !Array.isArray(tablesData)) {
            return res.status(400).json({
                code: 'INVALID_LAYOUT_PAYLOAD',
                error: 'INVALID_LAYOUT_PAYLOAD',
                message: 'Floor layout must include zones and tables arrays.',
            });
        }

        if (replayId) {
            const existing = await loadReplayPayload(replayId);
            if (existing) return res.json({ ...existing, idempotentReplay: true, referenceId: replayId });
        }

        const zoneRows = zonesData.map((zone: any) => normalizeZoneLayout(zone, branchId));
        const tableRows = tablesData.map((table: any) => normalizeTableLayout(table, branchId));

        const invalidZone = zoneRows.find((zone) => !zone.id);
        const invalidTable = tableRows.find((table) => !table.id || !table.zoneId);
        if (invalidZone || invalidTable) {
            return res.status(400).json({
                code: 'INVALID_LAYOUT_PAYLOAD',
                error: 'INVALID_LAYOUT_PAYLOAD',
                message: invalidZone ? 'Every floor zone must have an id.' : 'Every table must have an id and zoneId.',
            });
        }

        const zoneIds = new Set(zoneRows.map((zone) => zone.id));
        const tableWithMissingZone = tableRows.find((table) => table.zoneId && !zoneIds.has(table.zoneId));
        if (tableWithMissingZone) {
            return res.status(400).json({
                code: 'INVALID_TABLE_ZONE',
                error: 'INVALID_TABLE_ZONE',
                message: `Table ${tableWithMissingZone.name} references a missing floor zone.`,
            });
        }

        await db.transaction(async (tx) => {
            // Upsert Zones
            for (const zone of zoneRows) {
                const [existingZone] = await tx.select().top(1).from(floorZones).where(eq(floorZones.id, zone.id));
                if (existingZone) {
                    await tx.update(floorZones)
                        .set({
                            name: zone.name,
                            branchId: zone.branchId,
                            width: zone.width,
                            height: zone.height,
                            updatedAt: zone.updatedAt,
                        })
                        .where(eq(floorZones.id, zone.id));
                } else {
                    await tx.insert(floorZones).values(zone);
                }
            }

            // Upsert Tables
            // Be careful not to overwrite status/currentOrderId if just updating layout positions
            for (const table of tableRows) {
                // We typically only update layout fields here (x, y, width, height, shape, seats, name, zoneId)
                // If the table is new, insert it.
                const [existingTable] = await tx.select().top(1).from(tables).where(eq(tables.id, table.id));
                if (existingTable) {
                    await tx.update(tables)
                        .set({
                        branchId: table.branchId,
                        x: table.x,
                        y: table.y,
                        width: table.width,
                        height: table.height,
                        shape: table.shape,
                         seats: table.seats,
                         name: table.name,
                         zoneId: table.zoneId,
                         discount: table.discount,
                         defaultCouponCode: table.defaultCouponCode,
                         minSpend: table.minSpend,
                         isVIP: table.isVIP,
                         notes: table.notes,
                         updatedAt: new Date()
                    })
                        .where(eq(tables.id, table.id));
                } else {
                    await tx.insert(tables).values(table);
                }
            }
        });

        try {
            const branchRoom = branchId ? `branch:${branchId}` : null;
            if (branchRoom) {
                getIO().to(branchRoom).emit('table:layout', { branchId });
            }
        } catch {
            // socket is optional
        }

        const responsePayload = { success: true, zones: zoneRows.length, tables: tableRows.length };
        if (replayId) {
            await saveReplayPayload(replayId, responsePayload, req.user?.id || 'system');
        }
        res.json(responsePayload);
    } catch (error: any) {
        logger.error({ err: error, body: req.body, userId: req.user?.id }, 'Failed to save floor layout');
        res.status(500).json({
            code: 'FLOOR_LAYOUT_SAVE_FAILED',
            error: 'FLOOR_LAYOUT_SAVE_FAILED',
            message: 'Failed to save floor layout. Please review zones and tables data.',
        });
    }
};

export const updateTableStatus = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'TABLE_ID_REQUIRED' });
        const { status, currentOrderId, reference_id } = req.body || {};
        const normalizedStatus = String(status || '').toUpperCase();
        if (!['AVAILABLE', 'OCCUPIED'].includes(normalizedStatus)) {
            return res.status(400).json({ error: 'TABLE_STATUS_INVALID' });
        }

        if (reference_id) {
            const replayKey = `tableStatusRef:${String(reference_id)}`;
            const [existingReplay] = await db.select().top(1).from(settings).where(eq(settings.key, replayKey));
            if (existingReplay) {
                const [existingTable] = await db.select().top(1).from(tables).where(eq(tables.id, id));
                if (existingTable) {
                    return res.json({ ...existingTable, idempotentReplay: true, referenceId: reference_id });
                }
            }
        }

        const [updatedTable] = await db.update(tables)
            .set({
                status: normalizedStatus,
                currentOrderId: currentOrderId || null,
                updatedAt: new Date()
            })
            .output()
            .where(eq(tables.id, id));

        if (!updatedTable) return res.status(404).json({ error: 'Table not found' });

        if (reference_id) {
            const replayKey = `tableStatusRef:${String(reference_id)}`;
            await upsertSetting({
                key: replayKey,
                value: {
                    tableId: updatedTable.id,
                    status: updatedTable.status,
                    currentOrderId: updatedTable.currentOrderId || null,
                    recordedAt: new Date().toISOString(),
                },
                category: 'table-idempotency',
                updatedBy: req.user?.id || 'system',
            });
        }

        try {
            const branchRoom = updatedTable.branchId ? `branch:${updatedTable.branchId}` : null;
            if (branchRoom) {
                getIO().to(branchRoom).emit('table:status', {
                    id: updatedTable.id,
                    status: updatedTable.status,
                    currentOrderId: updatedTable.currentOrderId
                });
            }
        } catch {
            // socket is optional
        }

        res.json(updatedTable);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

const emitTableReset = (branchId: string, tableId: string, orderIds: string[], changedAt: Date) => {
    try {
        const branchRoom = getIO().to(`branch:${branchId}`);
        branchRoom.emit('table:status', { id: tableId, status: 'AVAILABLE', currentOrderId: null, resetOrderIds: orderIds });
        orderIds.forEach((orderId) => branchRoom.emit('order:status', {
            id: orderId,
            status: 'CANCELLED',
            updatedAt: changedAt.toISOString(),
        }));
    } catch {
        // Reset is already committed; clients will receive canonical state on their next refresh.
    }
};

export const resetTable = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        const branchId = req.effectiveBranchId;
        const reason = String(req.body?.reason || 'Admin reset for a stuck table').trim().slice(0, 240);
        if (!id || !branchId) return res.status(400).json({ error: 'TABLE_AND_BRANCH_REQUIRED' });

        const [table] = await db.select().top(1).from(tables)
            .where(and(eq(tables.id, id), eq(tables.branchId, branchId)));
        if (!table) return res.status(404).json({ error: 'TABLE_NOT_FOUND' });

        const activeOrders = await db.select({ id: orders.id }).from(orders).where(and(
            eq(orders.branchId, branchId),
            eq(orders.tableId, id),
            notInArray(orders.status, ['DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED']),
        ));
        const orderIds = activeOrders.map((order) => order.id);
        const now = new Date();

        await db.transaction(async (tx) => {
            if (orderIds.length > 0) {
                await tx.update(orders).set({
                    status: 'CANCELLED',
                    cancelledAt: now,
                    cancelReason: reason,
                    updatedAt: now,
                }).where(inArray(orders.id, orderIds));
                await tx.insert(orderStatusHistory).values(orderIds.map((orderId) => ({
                    orderId,
                    status: 'CANCELLED',
                    changedBy: req.user?.id,
                    notes: reason,
                    createdAt: now,
                })));
            }
            await tx.update(tables).set({
                status: 'AVAILABLE',
                currentOrderId: null,
                lockedByUserId: null,
                updatedAt: now,
            }).where(and(eq(tables.id, id), eq(tables.branchId, branchId)));
        });

        await createSignedAuditLog({
            eventType: 'TABLE_FORCE_RESET',
            userId: req.user?.id,
            userName: req.user?.name,
            userRole: req.user?.role,
            branchId,
            before: { status: table.status, currentOrderId: table.currentOrderId, activeOrderIds: orderIds },
            after: { status: 'AVAILABLE', currentOrderId: null },
            reason,
        });

        const payload = { id, status: 'AVAILABLE', currentOrderId: null, resetOrderIds: orderIds };
        emitTableReset(branchId, id, orderIds, now);
        res.json(payload);
    } catch (error: any) {
        logger.error({ error: error.message }, 'Failed to reset table');
        res.status(500).json({ error: error.message });
    }
};

const TERMINAL_ORDER_STATUSES = ['DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'];
const money = (value: number) => Number(value.toFixed(2));

const findActiveOrderByTable = async (tx: any, tableId: string, branchId: string) => {
    const [table] = await tx.select({ currentOrderId: tables.currentOrderId, status: tables.status })
        .from(tables)
        .where(and(eq(tables.id, tableId), eq(tables.branchId, branchId)))
        .top(1);
    if (!table?.currentOrderId || String(table.status).toUpperCase() === 'AVAILABLE') return null;

    const [order] = await tx.select().top(1).from(orders).where(and(
        eq(orders.id, table.currentOrderId),
        eq(orders.tableId, tableId),
        eq(orders.branchId, branchId),
        notInArray(orders.status, TERMINAL_ORDER_STATUSES),
    ));
    return order || null;
};

// ALL open rounds on a table, oldest first. A dine-in table holds one order
// per kitchen send — table-level operations (transfer/split/merge/close)
// must see every round, never just the linked (latest) one.
const findActiveOrdersByTable = async (tx: any, tableId: string, branchId: string) => {
    const [table] = await tx.select({ currentOrderId: tables.currentOrderId, status: tables.status })
        .from(tables)
        .where(and(eq(tables.id, tableId), eq(tables.branchId, branchId)))
        .top(1);
    if (!table || String(table.status).toUpperCase() === 'AVAILABLE') return [];
    const rows = await tx.select().from(orders).where(and(
        eq(orders.tableId, tableId),
        eq(orders.branchId, branchId),
        notInArray(orders.status, TERMINAL_ORDER_STATUSES),
    ));
    rows.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return rows;
};

// After items leave a table, either free it (no open rounds left) or repoint
// its link at the latest remaining round — never leave the link dangling at
// an emptied order while other rounds still owe money.
const repointSourceTableLink = async (tx: any, tableId: string, branchId: string) => {
    const remaining = await findActiveOrdersByTable(tx, tableId, branchId);
    const live = remaining.filter((order: any) => Number(order.subtotal || 0) > 0);
    const effective = live.length > 0 ? live : remaining;
    if (effective.length === 0) {
        await tx.update(tables).set({
            status: 'AVAILABLE',
            currentOrderId: null,
            updatedAt: new Date(),
        }).where(and(eq(tables.id, tableId), eq(tables.branchId, branchId)));
        return null;
    }
    const latest = effective[effective.length - 1];
    await tx.update(tables).set({
        status: 'OCCUPIED',
        currentOrderId: latest.id,
        updatedAt: new Date(),
    }).where(and(eq(tables.id, tableId), eq(tables.branchId, branchId)));
    return latest;
};

const completeEmptiedOrder = async (tx: any, orderId: string, userId: string | undefined, notes: string) => {
    const [order] = await tx.select({ id: orders.id, subtotal: orders.subtotal }).top(1)
        .from(orders).where(eq(orders.id, orderId));
    if (!order || Number(order.subtotal || 0) > 0) return null;
    const now = new Date();
    const [completed] = await tx.update(orders).set({
        status: 'COMPLETED',
        completedAt: now,
        updatedAt: now,
    }).output().where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({
        orderId,
        status: 'COMPLETED',
        changedBy: userId,
        notes,
        createdAt: now,
    });
    return completed || null;
};

const assertTablePairInBranch = async (tx: any, sourceTableId: string, targetTableId: string, branchId: string) => {
    const rows = await tx.select({ id: tables.id }).from(tables).where(and(
        eq(tables.branchId, branchId),
        inArray(tables.id, [sourceTableId, targetTableId]),
    ));
    const ids = new Set(rows.map((row: any) => String(row.id)));
    if (!ids.has(sourceTableId)) throw new Error('SOURCE_TABLE_NOT_FOUND');
    if (!ids.has(targetTableId)) throw new Error('TARGET_TABLE_NOT_FOUND');
};

const recalcOrderTotals = async (tx: any, orderId: string) => {
    const [order] = await tx.select().top(1).from(orders).where(eq(orders.id, orderId));
    if (!order) return null;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    
    const subtotal = money(items.reduce(
        (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0,
    ));
    const itemsTax = money(items.reduce((sum: number, item: any) => sum + Number(item.tax || 0), 0));

    const discountAmount = Number(order.discount || 0);
    const netAmount = Math.max(0, subtotal - discountAmount);
    
    // Proportional tax reduction if discount exists
    const taxRatio = subtotal > 0 ? (netAmount / subtotal) : 0;
    const tax = money(itemsTax * taxRatio);

    let serviceCharge = Number(order.serviceCharge || 0);
    if (order.type === 'DINE_IN' && subtotal > 0) {
        const [branchRecord] = await tx.select({ serviceCharge: branches.serviceCharge })
            .top(1).from(branches).where(eq(branches.id, order.branchId));
        const [serviceSetting] = await tx.select({ value: settings.value }).top(1)
            .from(settings).where(eq(settings.key, 'serviceCharge'));

        // Effective rate: explicit branch value wins, otherwise the global
        // setting (Settings → Financial). Accepts 12 (percent) or 0.12
        // (fraction); 0 / missing = disabled. No hidden defaults.
        const normalizeServiceRate = (raw: unknown): number => {
            const num = Number(raw);
            if (!Number.isFinite(num) || num <= 0) return 0;
            return num > 1 ? num / 100 : num;
        };
        const branchRaw = branchRecord?.serviceCharge === null || branchRecord?.serviceCharge === undefined
            ? null
            : Number(branchRecord.serviceCharge);
        const serviceRate = branchRaw !== null
            ? normalizeServiceRate(branchRaw)
            : normalizeServiceRate(parseSettingJson(serviceSetting?.value, 0));
        serviceCharge = money(netAmount * serviceRate);
    }

    const total = netAmount + tax + serviceCharge + Number(order.deliveryFee || 0);

    const [updated] = await tx.update(orders).set({
        subtotal,
        tax,
        serviceCharge,
        total,
        updatedAt: new Date(),
    }).output().where(eq(orders.id, orderId));

    return updated || null;
};

const pickItemsToMove = async (
    tx: any,
    sourceOrderIds: string[],
    selectedItems: Array<{ id?: string | number; name?: string; price?: number; quantity?: number }>
) => {
    const ids = Array.from(new Set((sourceOrderIds || []).map(String).filter(Boolean)));
    if (ids.length === 0) throw new Error('SOURCE_ORDER_NOT_FOUND');
    const rows = await tx.select().from(orderItems).where(inArray(orderItems.orderId, ids));
    // Oldest round first so partial picks drain earlier tickets before later ones.
    const rank = new Map(ids.map((id, index) => [id, index]));
    const sourceItems = rows.sort((a: any, b: any) =>
        (rank.get(String(a.orderId)) ?? 0) - (rank.get(String(b.orderId)) ?? 0));
    if (!selectedItems || selectedItems.length === 0) {
        return sourceItems;
    }

    const remaining = [...sourceItems];
    const picked: typeof sourceItems = [];

    const consumeMatches = (
        matches: (candidate: any) => boolean,
        neededQty: number,
    ): { took: typeof picked; stillNeeded: number } => {
        const took: typeof picked = [];
        let stillNeeded = neededQty;
        for (let i = 0; i < remaining.length && stillNeeded > 0; i += 1) {
            const candidate = remaining[i];
            if (!candidate || !matches(candidate)) continue;

            const availableQty = Number(candidate.quantity || 0);
            if (availableQty <= 0) continue;

            const takeQty = Math.min(availableQty, stillNeeded);
            took.push({ ...candidate, quantity: takeQty });
            stillNeeded -= takeQty;

            if (takeQty === availableQty) {
                remaining.splice(i, 1);
                i -= 1;
            } else {
                remaining[i] = { ...candidate, quantity: availableQty - takeQty };
            }
        }
        return { took, stillNeeded };
    };

    for (const reqItem of selectedItems) {
        const targetId = String(reqItem?.id ?? '').trim();
        const targetName = String(reqItem?.name || '').trim().toLowerCase();
        const targetPrice = Number(reqItem?.price || 0);
        const neededQty = Number(reqItem?.quantity ?? 1);
        if (!Number.isInteger(neededQty) || neededQty <= 0) throw new Error('INVALID_ITEM_QUANTITY');

        // Pass 1: exact row-id match (normal path).
        let { took, stillNeeded } = consumeMatches(
            (candidate) => !!targetId && String(candidate.id) === targetId,
            neededQty,
        );
        // Pass 2 (stale-client tolerance): the cashier's cart may still hold
        // a temp id (order just placed, no refresh yet) — fall back to
        // name + unit-price matching instead of failing the whole move.
        if (stillNeeded > 0 && targetId && targetName) {
            const fallback = consumeMatches(
                (candidate) =>
                    String(candidate.name || '').trim().toLowerCase() === targetName &&
                    Number(candidate.price || 0) === targetPrice,
                stillNeeded,
            );
            took = [...took, ...fallback.took];
            stillNeeded = fallback.stillNeeded;
        }
        // Pass 3: legacy callers that send no id at all.
        if (stillNeeded > 0 && !targetId && targetName) {
            const legacy = consumeMatches(
                (candidate) =>
                    String(candidate.name || '').trim().toLowerCase() === targetName &&
                    Number(candidate.price || 0) === targetPrice,
                stillNeeded,
            );
            took = [...took, ...legacy.took];
            stillNeeded = legacy.stillNeeded;
        }
        if (stillNeeded > 0) throw new Error('ORDER_ITEM_QUANTITY_UNAVAILABLE');
        picked.push(...took);
    }

    return picked;
};

const movePickedItems = async (tx: any, pickedItems: any[], targetOrderId: string) => {
    for (const item of pickedItems) {
        const [row] = await tx.select().top(1).from(orderItems).where(eq(orderItems.id, item.id));
        if (!row) throw new Error('ORDER_ITEM_NOT_FOUND');

        const existingQty = Number(row.quantity || 0);
        const moveQty = Number(item.quantity || 0);
        if (moveQty <= 0 || moveQty > existingQty) throw new Error('ORDER_ITEM_QUANTITY_UNAVAILABLE');

        const movedTax = money((Number(row.tax || 0) / existingQty) * moveQty);
        const nextQty = existingQty - moveQty;
        if (nextQty === 0) {
            await tx.delete(orderItems).where(eq(orderItems.id, row.id));
        } else {
            await tx.update(orderItems).set({
                quantity: nextQty,
                tax: money(Number(row.tax || 0) - movedTax),
            }).where(eq(orderItems.id, row.id));
        }

        await tx.insert(orderItems).values({
            orderId: targetOrderId,
            menuItemId: row.menuItemId,
            name: row.name,
            nameAr: row.nameAr,
            price: row.price,
            cost: row.cost,
            quantity: moveQty,
            tax: movedTax,
            notes: row.notes,
            modifiers: row.modifiers as any,
            status: row.status || 'PENDING',
            seatNumber: row.seatNumber,
            course: row.course,
        });
    }
};

const movedDiscountAmount = (order: any, pickedItems: any[]) => {
    const subtotal = Math.max(0, Number(order.subtotal || 0));
    if (subtotal === 0) return 0;
    const movedSubtotal = pickedItems.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0,
    );
    return money(Number(order.discount || 0) * Math.min(1, movedSubtotal / subtotal));
};

export const transferTableOrder = async (req: Request, res: Response) => {
    try {
        const { sourceTableId, targetTableId, reference_id } = req.body || {};
        const branchId = req.effectiveBranchId;
        const replayId = reference_id ? String(reference_id) : '';
        if (!sourceTableId || !targetTableId || !branchId) {
            return res.status(400).json({ error: 'SOURCE_TARGET_BRANCH_REQUIRED' });
        }
        if (sourceTableId === targetTableId) {
            return res.status(400).json({ error: 'SOURCE_EQUALS_TARGET' });
        }
        if (replayId) {
            const existing = await loadReplayPayload(replayId);
            if (existing) return res.json({ ...existing, idempotentReplay: true, referenceId: replayId });
        }

        const result = await db.transaction(async (tx) => {
            await assertTablePairInBranch(tx, String(sourceTableId), String(targetTableId), branchId);
            // Move EVERY open round — moving only the linked one would orphan
            // earlier rounds on a table that is about to be marked AVAILABLE.
            const sourceOrders = await findActiveOrdersByTable(tx, String(sourceTableId), branchId);
            if (sourceOrders.length === 0) throw new Error('SOURCE_ORDER_NOT_FOUND');

            const targetOrder = await findActiveOrderByTable(tx, String(targetTableId), branchId);
            if (targetOrder) throw new Error('TARGET_TABLE_HAS_ACTIVE_ORDER');

            const movedIds = sourceOrders.map((order: any) => String(order.id));
            await tx.update(orders).set({
                tableId: String(targetTableId),
                updatedAt: new Date(),
            }).where(inArray(orders.id, movedIds));
            const [movedOrder] = await tx.select().top(1).from(orders).where(eq(orders.id, movedIds[movedIds.length - 1]));

            await tx.update(tables).set({
                status: 'AVAILABLE',
                currentOrderId: null,
                updatedAt: new Date(),
            }).where(and(eq(tables.id, String(sourceTableId)), eq(tables.branchId, branchId)));

            await tx.update(tables).set({
                status: 'OCCUPIED',
                currentOrderId: movedOrder.id,
                updatedAt: new Date(),
            }).where(and(eq(tables.id, String(targetTableId)), eq(tables.branchId, branchId)));

            return { movedOrder, movedOrderIds: movedIds };
        });

        try {
            if (result.movedOrder?.branchId) {
                const room = `branch:${result.movedOrder.branchId}`;
                for (const movedId of result.movedOrderIds || [result.movedOrder.id]) {
                    getIO().to(room).emit('order:status', { id: movedId, status: result.movedOrder.status });
                }
                getIO().to(room).emit('table:status', { id: sourceTableId, status: 'AVAILABLE', currentOrderId: null });
                getIO().to(room).emit('table:status', { id: targetTableId, status: 'OCCUPIED', currentOrderId: result.movedOrder.id });
            }
        } catch {
            // socket optional
        }

        const responsePayload = { success: true, ...result };
        if (replayId) {
            await saveReplayPayload(replayId, responsePayload, req.user?.id || 'system');
        }
        return res.json(responsePayload);
    } catch (error: any) {
        return res.status(400).json({ error: error.message || 'TABLE_TRANSFER_FAILED' });
    }
};

export const splitTableOrder = async (req: Request, res: Response) => {
    try {
        const { sourceTableId, targetTableId, items, sourceOrderIds, reference_id } = req.body || {};
        const branchId = req.effectiveBranchId;
        const replayId = reference_id ? String(reference_id) : '';
        if (!sourceTableId || !targetTableId || !branchId) {
            return res.status(400).json({ error: 'SOURCE_TARGET_BRANCH_REQUIRED' });
        }
        if (sourceTableId === targetTableId) {
            return res.status(400).json({ error: 'SOURCE_EQUALS_TARGET' });
        }
        if (replayId) {
            const existing = await loadReplayPayload(replayId);
            if (existing) return res.json({ ...existing, idempotentReplay: true, referenceId: replayId });
        }

        const result = await db.transaction(async (tx) => {
            await assertTablePairInBranch(tx, String(sourceTableId), String(targetTableId), branchId);
            const sourceRounds = await findActiveOrdersByTable(tx, String(sourceTableId), branchId);
            if (sourceRounds.length === 0) throw new Error('SOURCE_ORDER_NOT_FOUND');
            const requestedIds = Array.from(new Set(
                (Array.isArray(sourceOrderIds) ? sourceOrderIds : []).map(String).filter(Boolean),
            ));
            const knownIds = new Set(sourceRounds.map((order: any) => String(order.id)));
            const effectiveIds = (requestedIds.length > 0 ? requestedIds : sourceRounds.map((order: any) => String(order.id)))
                .filter((id) => knownIds.has(id));
            if (effectiveIds.length === 0) throw new Error('SOURCE_ORDER_NOT_FOUND');
            const sourceOrder = sourceRounds.find((order: any) => String(order.id) === effectiveIds[effectiveIds.length - 1]) || sourceRounds[sourceRounds.length - 1];

            const targetOrder = await findActiveOrderByTable(tx, String(targetTableId), branchId);
            if (targetOrder) throw new Error('TARGET_TABLE_HAS_ACTIVE_ORDER');

            const pickedItems = await pickItemsToMove(tx, effectiveIds, Array.isArray(items) ? items : []);
            if (pickedItems.length === 0) throw new Error('NO_ITEMS_SELECTED');

            const [branch] = await tx.select({ businessDate: branches.businessDate }).top(1)
                .from(branches).where(eq(branches.id, branchId));
            const businessDate = sourceOrder.businessDate || branch?.businessDate;
            if (!businessDate) throw new Error('BUSINESS_DATE_REQUIRED');
            const orderNumber = await allocateDailyOrderNumber(tx, branchId, businessDate);
            // Discount travels proportionally with the moved lines, per round.
            const pickedByOrder = new Map<string, any[]>();
            for (const item of pickedItems) {
                const key = String((item as any).orderId);
                if (!pickedByOrder.has(key)) pickedByOrder.set(key, []);
                pickedByOrder.get(key)!.push(item);
            }
            let movedDiscount = 0;
            for (const round of sourceRounds) {
                const picked = pickedByOrder.get(String(round.id)) || [];
                if (picked.length === 0) continue;
                const part = movedDiscountAmount(round, picked);
                movedDiscount = money(movedDiscount + part);
                await tx.update(orders).set({
                    discount: money(Number(round.discount || 0) - part),
                    updatedAt: new Date(),
                }).where(eq(orders.id, round.id));
            }

            const newOrderId = `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const [newOrder] = await tx.insert(orders).output().values({
                id: newOrderId,
                parentOrderId: sourceOrder.id,
                orderNumber,
                type: sourceOrder.type,
                source: sourceOrder.source,
                branchId,
                tableId: String(targetTableId),
                customerId: sourceOrder.customerId,
                customerName: sourceOrder.customerName,
                customerPhone: sourceOrder.customerPhone,
                deliveryAddress: sourceOrder.deliveryAddress,
                isCallCenterOrder: sourceOrder.isCallCenterOrder,
                status: 'PENDING',
                subtotal: 0,
                discount: movedDiscount,
                discountType: sourceOrder.discountType,
                discountReason: sourceOrder.discountReason,
                tax: 0,
                deliveryFee: 0,
                serviceCharge: 0,
                total: 0,
                freeDelivery: false,
                isUrgent: sourceOrder.isUrgent,
                notes: sourceOrder.notes,
                syncStatus: sourceOrder.syncStatus || 'SYNCED',
                businessDate,
                shiftId: sourceOrder.shiftId,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            await movePickedItems(tx, pickedItems, newOrder.id);

            for (const round of sourceRounds) {
                await recalcOrderTotals(tx as any, round.id);
                await completeEmptiedOrder(tx, round.id, req.user?.id, 'Split to another table');
            }
            const updatedSource = await recalcOrderTotals(tx as any, sourceOrder.id);
            const updatedTarget = await recalcOrderTotals(tx as any, newOrder.id);
            // The source table stays alive while ANY round still owes money;
            // its link repoints at the latest remaining round (an emptied
            // linked order must not stay linked while other rounds are open).
            await repointSourceTableLink(tx, String(sourceTableId), branchId);

            await tx.update(tables).set({
                status: 'OCCUPIED',
                currentOrderId: newOrder.id,
                updatedAt: new Date(),
            }).where(and(eq(tables.id, String(targetTableId)), eq(tables.branchId, branchId)));

            return { sourceOrder: updatedSource, targetOrder: updatedTarget };
        });

        try {
            const branchId = result.sourceOrder?.branchId || result.targetOrder?.branchId;
            if (branchId) {
                const room = `branch:${branchId}`;
                getIO().to(room).emit('table:status', { id: targetTableId, status: 'OCCUPIED', currentOrderId: result.targetOrder?.id });
                if (result.sourceOrder) getIO().to(room).emit('order:status', { id: result.sourceOrder.id, status: result.sourceOrder.status });
                if (result.targetOrder) getIO().to(room).emit('order:created', result.targetOrder);
            }
        } catch {
            // socket optional
        }

        const responsePayload = { success: true, ...result };
        if (replayId) {
            await saveReplayPayload(replayId, responsePayload, req.user?.id || 'system');
        }
        return res.json(responsePayload);
    } catch (error: any) {
        return res.status(400).json({ error: error.message || 'TABLE_SPLIT_FAILED' });
    }
};

export const mergeTableOrders = async (req: Request, res: Response) => {
    try {
        const { sourceTableId, targetTableId, items, sourceOrderIds, reference_id } = req.body || {};
        const branchId = req.effectiveBranchId;
        const replayId = reference_id ? String(reference_id) : '';
        if (!sourceTableId || !targetTableId || !branchId) {
            return res.status(400).json({ error: 'SOURCE_TARGET_BRANCH_REQUIRED' });
        }
        if (sourceTableId === targetTableId) {
            return res.status(400).json({ error: 'SOURCE_EQUALS_TARGET' });
        }
        if (replayId) {
            const existing = await loadReplayPayload(replayId);
            if (existing) return res.json({ ...existing, idempotentReplay: true, referenceId: replayId });
        }

        const result = await db.transaction(async (tx) => {
            await assertTablePairInBranch(tx, String(sourceTableId), String(targetTableId), branchId);
            const sourceRounds = await findActiveOrdersByTable(tx, String(sourceTableId), branchId);
            if (sourceRounds.length === 0) throw new Error('SOURCE_ORDER_NOT_FOUND');
            const requestedIds = Array.from(new Set(
                (Array.isArray(sourceOrderIds) ? sourceOrderIds : []).map(String).filter(Boolean),
            ));
            const knownIds = new Set(sourceRounds.map((order: any) => String(order.id)));
            const effectiveIds = (requestedIds.length > 0 ? requestedIds : sourceRounds.map((order: any) => String(order.id)))
                .filter((id) => knownIds.has(id));
            if (effectiveIds.length === 0) throw new Error('SOURCE_ORDER_NOT_FOUND');

            const targetOrder = await findActiveOrderByTable(tx, String(targetTableId), branchId);
            if (!targetOrder) throw new Error('TARGET_ORDER_NOT_FOUND');

            const pickedItems = await pickItemsToMove(tx, effectiveIds, Array.isArray(items) ? items : []);
            if (pickedItems.length === 0) throw new Error('NO_ITEMS_SELECTED');
            const pickedByOrder = new Map<string, any[]>();
            for (const item of pickedItems) {
                const key = String((item as any).orderId);
                if (!pickedByOrder.has(key)) pickedByOrder.set(key, []);
                pickedByOrder.get(key)!.push(item);
            }
            let movedDiscount = 0;
            for (const round of sourceRounds) {
                const picked = pickedByOrder.get(String(round.id)) || [];
                if (picked.length === 0) continue;
                const part = movedDiscountAmount(round, picked);
                movedDiscount = money(movedDiscount + part);
                await tx.update(orders).set({
                    discount: money(Number(round.discount || 0) - part),
                    updatedAt: new Date(),
                }).where(eq(orders.id, round.id));
            }
            await tx.update(orders).set({
                discount: money(Number(targetOrder.discount || 0) + movedDiscount),
                updatedAt: new Date(),
            }).where(eq(orders.id, targetOrder.id));
            await movePickedItems(tx, pickedItems, targetOrder.id);

            for (const round of sourceRounds) {
                await recalcOrderTotals(tx as any, round.id);
                await completeEmptiedOrder(tx, round.id, req.user?.id, 'Merged into another table');
            }
            const linkedSource = sourceRounds.find((order: any) => effectiveIds.includes(String(order.id))) || sourceRounds[sourceRounds.length - 1];
            const updatedSource = await recalcOrderTotals(tx as any, linkedSource.id);
            const updatedTarget = await recalcOrderTotals(tx as any, targetOrder.id);

            // Free the source table only when EVERY round is settled;
            // otherwise repoint its link at the latest remaining round.
            const sourceLink = await repointSourceTableLink(tx, String(sourceTableId), branchId);

            await tx.update(tables).set({
                status: 'OCCUPIED',
                currentOrderId: targetOrder.id,
                updatedAt: new Date(),
            }).where(and(eq(tables.id, String(targetTableId)), eq(tables.branchId, branchId)));

            const [freshSource] = await tx.select().top(1).from(orders).where(eq(orders.id, linkedSource.id));
            const [freshTarget] = await tx.select().top(1).from(orders).where(eq(orders.id, targetOrder.id));
            return { sourceOrder: freshSource, targetOrder: freshTarget, sourceTableOpen: !!sourceLink, sourceLinkId: sourceLink?.id || null };
        });

        try {
            const branchId = result.sourceOrder?.branchId || result.targetOrder?.branchId;
            if (branchId) {
                const room = `branch:${branchId}`;
                if (result.sourceOrder) getIO().to(room).emit('order:status', { id: result.sourceOrder.id, status: result.sourceOrder.status });
                if (result.targetOrder) getIO().to(room).emit('order:status', { id: result.targetOrder.id, status: result.targetOrder.status });
                getIO().to(room).emit('table:status', { id: sourceTableId, status: result.sourceTableOpen ? 'OCCUPIED' : 'AVAILABLE', currentOrderId: result.sourceLinkId });
                getIO().to(room).emit('table:status', { id: targetTableId, status: 'OCCUPIED', currentOrderId: result.targetOrder?.id });
            }
        } catch {
            // socket optional
        }

        const responsePayload = { success: true, ...result };
        if (replayId) {
            await saveReplayPayload(replayId, responsePayload, req.user?.id || 'system');
        }
        return res.json(responsePayload);
    } catch (error: any) {
        return res.status(400).json({ error: error.message || 'TABLE_MERGE_FAILED' });
    }
};
