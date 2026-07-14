import { Request, Response } from 'express';
import { db } from '../db';
import { tables, floorZones, orders, orderItems, settings, branches } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { getIO } from '../socket';
import { logger } from '../utils/logger';
import { parseSettingJson, upsertSetting } from '../utils/settingsStore.js';

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

const parseLayoutText = (value: unknown, fallback: string) => {
    const text = String(value ?? '').trim();
    return text || fallback;
};

const normalizeTableShape = (value: unknown) => {
    const shape = parseLayoutText(value, 'square').toLowerCase();
    if (['square', 'round', 'rectangle', 'circle'].includes(shape)) return shape;
    return 'square';
};

const normalizeTableStatus = (value: unknown) => {
    const status = parseLayoutText(value, 'AVAILABLE').toUpperCase();
    if (['AVAILABLE', 'OCCUPIED', 'RESERVED', 'DIRTY', 'OUT_OF_SERVICE'].includes(status)) return status;
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
    status: normalizeTableStatus(table?.status),
    updatedAt: new Date(),
});

export const getTables = async (req: Request, res: Response) => {
    try {
        const branchId = getStringParam(req.query.branchId);
        if (!branchId) return res.status(400).json({ error: 'Branch ID required' });

        const allTables = await db.select().from(tables).where(eq(tables.branchId, branchId));
        res.json(allTables);
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
                status,
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

const findActiveOrderByTable = async (tx: typeof db, tableId: string) => {
    const rows = await tx.select().from(orders).where(eq(orders.tableId, tableId));
    return rows.find((o) => !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(String(o.status)));
};

const computeSubtotalFromItems = async (tx: typeof db, orderId: string) => {
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
};

const recalcOrderTotals = async (tx: any, orderId: string) => {
    const [order] = await tx.select().top(1).from(orders).where(eq(orders.id, orderId));
    if (!order) return null;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    
    let subtotal = 0;
    let itemsTax = 0;
    
    for (const item of items) {
        const linePrice = Number(item.price || 0);
        const lineQty = Number(item.quantity || 0);
        subtotal += linePrice * lineQty;
        
        // Use item tax if available, otherwise calculate 14%
        if (item.tax !== undefined && item.tax !== null && item.tax !== 0) {
            itemsTax += Number(item.tax);
        } else {
            itemsTax += parseFloat(((linePrice * lineQty) * 0.14).toFixed(2));
        }
    }

    const discountAmount = Number(order.discount || 0);
    const netAmount = Math.max(0, subtotal - discountAmount);
    
    // Proportional tax reduction if discount exists
    const taxRatio = subtotal > 0 ? (netAmount / subtotal) : 0;
    const tax = parseFloat((itemsTax * taxRatio).toFixed(2));

    let serviceCharge = Number(order.serviceCharge || 0);
    if (order.type === 'DINE_IN' && subtotal > 0) {
        const [branchRecord] = await tx.select({ serviceCharge: branches.serviceCharge })
            .top(1).from(branches).where(eq(branches.id, order.branchId));
        
        const serviceRate = branchRecord?.serviceCharge || 0.12;
        serviceCharge = parseFloat((netAmount * serviceRate).toFixed(2));
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
    tx: typeof db,
    sourceOrderId: string,
    selectedItems: Array<{ name?: string; price?: number; quantity?: number }>
) => {
    const sourceItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, sourceOrderId));
    if (!selectedItems || selectedItems.length === 0) {
        return sourceItems;
    }

    const remaining = [...sourceItems];
    const picked: typeof sourceItems = [];

    for (const reqItem of selectedItems) {
        const targetName = String(reqItem?.name || '').trim().toLowerCase();
        const targetPrice = Number(reqItem?.price || 0);
        let neededQty = Math.max(1, Number(reqItem?.quantity || 1));

        for (let i = 0; i < remaining.length && neededQty > 0; i += 1) {
            const candidate = remaining[i];
            if (!candidate) continue;
            const sameName = String(candidate.name || '').trim().toLowerCase() === targetName;
            const samePrice = Number(candidate.price || 0) === targetPrice;
            if (!sameName || !samePrice) continue;

            const availableQty = Number(candidate.quantity || 0);
            if (availableQty <= 0) continue;

            const takeQty = Math.min(availableQty, neededQty);
            picked.push({ ...candidate, quantity: takeQty });
            neededQty -= takeQty;

            if (takeQty === availableQty) {
                remaining.splice(i, 1);
                i -= 1;
            } else {
                remaining[i] = { ...candidate, quantity: availableQty - takeQty };
            }
        }
    }

    return picked;
};

export const transferTableOrder = async (req: Request, res: Response) => {
    try {
        const { sourceTableId, targetTableId, reference_id } = req.body || {};
        const replayId = reference_id ? String(reference_id) : '';
        if (!sourceTableId || !targetTableId) {
            return res.status(400).json({ error: 'SOURCE_TARGET_REQUIRED' });
        }
        if (sourceTableId === targetTableId) {
            return res.status(400).json({ error: 'SOURCE_EQUALS_TARGET' });
        }
        if (replayId) {
            const existing = await loadReplayPayload(replayId);
            if (existing) return res.json({ ...existing, idempotentReplay: true, referenceId: replayId });
        }

        const result = await db.transaction(async (tx) => {
            const sourceOrder = await findActiveOrderByTable(tx as any, String(sourceTableId));
            if (!sourceOrder) throw new Error('SOURCE_ORDER_NOT_FOUND');

            const targetOrder = await findActiveOrderByTable(tx as any, String(targetTableId));
            if (targetOrder) throw new Error('TARGET_TABLE_HAS_ACTIVE_ORDER');

            const [movedOrder] = await tx.update(orders).set({
                tableId: String(targetTableId),
                updatedAt: new Date(),
            }).output().where(eq(orders.id, sourceOrder.id));

            await tx.update(tables).set({
                status: 'AVAILABLE',
                currentOrderId: null,
                updatedAt: new Date(),
            }).where(eq(tables.id, String(sourceTableId)));

            await tx.update(tables).set({
                status: 'OCCUPIED',
                currentOrderId: movedOrder.id,
                updatedAt: new Date(),
            }).where(eq(tables.id, String(targetTableId)));

            return { movedOrder };
        });

        try {
            if (result.movedOrder?.branchId) {
                const room = `branch:${result.movedOrder.branchId}`;
                getIO().to(room).emit('order:status', { id: result.movedOrder.id, status: result.movedOrder.status });
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
        const { sourceTableId, targetTableId, items, reference_id } = req.body || {};
        const replayId = reference_id ? String(reference_id) : '';
        if (!sourceTableId || !targetTableId) {
            return res.status(400).json({ error: 'SOURCE_TARGET_REQUIRED' });
        }
        if (sourceTableId === targetTableId) {
            return res.status(400).json({ error: 'SOURCE_EQUALS_TARGET' });
        }
        if (replayId) {
            const existing = await loadReplayPayload(replayId);
            if (existing) return res.json({ ...existing, idempotentReplay: true, referenceId: replayId });
        }

        const result = await db.transaction(async (tx) => {
            const sourceOrder = await findActiveOrderByTable(tx as any, String(sourceTableId));
            if (!sourceOrder) throw new Error('SOURCE_ORDER_NOT_FOUND');

            const targetOrder = await findActiveOrderByTable(tx as any, String(targetTableId));
            if (targetOrder) throw new Error('TARGET_TABLE_HAS_ACTIVE_ORDER');

            const pickedItems = await pickItemsToMove(tx as any, sourceOrder.id, Array.isArray(items) ? items : []);
            if (pickedItems.length === 0) throw new Error('NO_ITEMS_SELECTED');

            const newOrderId = `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const [newOrder] = await tx.insert(orders).output().values({
                id: newOrderId,
                type: sourceOrder.type,
                source: sourceOrder.source,
                branchId: sourceOrder.branchId,
                tableId: String(targetTableId),
                customerId: sourceOrder.customerId,
                customerName: sourceOrder.customerName,
                customerPhone: sourceOrder.customerPhone,
                deliveryAddress: sourceOrder.deliveryAddress,
                isCallCenterOrder: sourceOrder.isCallCenterOrder,
                status: 'PENDING',
                subtotal: 0,
                discount: 0,
                tax: 0,
                deliveryFee: 0,
                serviceCharge: 0,
                total: 0,
                freeDelivery: false,
                isUrgent: sourceOrder.isUrgent,
                notes: sourceOrder.notes,
                syncStatus: sourceOrder.syncStatus || 'SYNCED',
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            for (const item of pickedItems) {
                // reduce quantity/delete from source rows
            const [row] = await tx.select().top(1).from(orderItems).where(eq(orderItems.id, item.id));
                if (!row) continue;
                const existingQty = Number(row.quantity || 0);
                const moveQty = Number(item.quantity || 0);
                const nextQty = existingQty - moveQty;
                if (nextQty <= 0) {
                    await tx.delete(orderItems).where(eq(orderItems.id, row.id));
                } else {
                    await tx.update(orderItems).set({ quantity: nextQty }).where(eq(orderItems.id, row.id));
                }

                await tx.insert(orderItems).values({
                    orderId: newOrder.id,
                    menuItemId: item.menuItemId,
                    name: item.name,
                    nameAr: item.nameAr,
                    price: item.price,
                    quantity: moveQty,
                    tax: item.tax ? parseFloat(((Number(item.tax) / existingQty) * moveQty).toFixed(2)) : parseFloat(((Number(item.price) * moveQty) * 0.14).toFixed(2)),
                    notes: item.notes,
                    modifiers: item.modifiers as any,
                    status: 'PENDING',
                });
            }

            const updatedSource = await recalcOrderTotals(tx as any, sourceOrder.id);
            const updatedTarget = await recalcOrderTotals(tx as any, newOrder.id);

            await tx.update(tables).set({
                status: 'OCCUPIED',
                currentOrderId: newOrder.id,
                updatedAt: new Date(),
            }).where(eq(tables.id, String(targetTableId)));

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
        const { sourceTableId, targetTableId, items, reference_id } = req.body || {};
        const replayId = reference_id ? String(reference_id) : '';
        if (!sourceTableId || !targetTableId) {
            return res.status(400).json({ error: 'SOURCE_TARGET_REQUIRED' });
        }
        if (sourceTableId === targetTableId) {
            return res.status(400).json({ error: 'SOURCE_EQUALS_TARGET' });
        }
        if (replayId) {
            const existing = await loadReplayPayload(replayId);
            if (existing) return res.json({ ...existing, idempotentReplay: true, referenceId: replayId });
        }

        const result = await db.transaction(async (tx) => {
            const sourceOrder = await findActiveOrderByTable(tx as any, String(sourceTableId));
            if (!sourceOrder) throw new Error('SOURCE_ORDER_NOT_FOUND');

            const targetOrder = await findActiveOrderByTable(tx as any, String(targetTableId));
            if (!targetOrder) throw new Error('TARGET_ORDER_NOT_FOUND');

            const pickedItems = await pickItemsToMove(tx as any, sourceOrder.id, Array.isArray(items) ? items : []);
            if (pickedItems.length === 0) throw new Error('NO_ITEMS_SELECTED');

            for (const item of pickedItems) {
                const [row] = await tx.select().top(1).from(orderItems).where(eq(orderItems.id, item.id));
                if (!row) continue;
                const existingQty = Number(row.quantity || 0);
                const moveQty = Number(item.quantity || 0);
                const nextQty = existingQty - moveQty;

                if (nextQty <= 0) {
                    await tx.delete(orderItems).where(eq(orderItems.id, row.id));
                } else {
                    await tx.update(orderItems).set({ quantity: nextQty }).where(eq(orderItems.id, row.id));
                }

                await tx.insert(orderItems).values({
                    orderId: targetOrder.id,
                    menuItemId: item.menuItemId,
                    name: item.name,
                    nameAr: item.nameAr,
                    price: item.price,
                    quantity: moveQty,
                    tax: item.tax ? parseFloat(((Number(item.tax) / existingQty) * moveQty).toFixed(2)) : parseFloat(((Number(item.price) * moveQty) * 0.14).toFixed(2)),
                    notes: item.notes,
                    modifiers: item.modifiers as any,
                    status: 'PENDING',
                });
            }

            const updatedSource = await recalcOrderTotals(tx as any, sourceOrder.id);
            const updatedTarget = await recalcOrderTotals(tx as any, targetOrder.id);

            if (!updatedSource || Number(updatedSource.subtotal || 0) <= 0) {
                await tx.update(orders).set({
                    status: 'DELIVERED',
                    completedAt: new Date(),
                    updatedAt: new Date(),
                }).where(eq(orders.id, sourceOrder.id));
                await tx.update(tables).set({
                    status: 'AVAILABLE',
                    currentOrderId: null,
                    updatedAt: new Date(),
                }).where(eq(tables.id, String(sourceTableId)));
            }

            await tx.update(tables).set({
                status: 'OCCUPIED',
                currentOrderId: targetOrder.id,
                updatedAt: new Date(),
            }).where(eq(tables.id, String(targetTableId)));

            const [freshSource] = await tx.select().top(1).from(orders).where(eq(orders.id, sourceOrder.id));
            const [freshTarget] = await tx.select().top(1).from(orders).where(eq(orders.id, targetOrder.id));
            return { sourceOrder: freshSource, targetOrder: freshTarget };
        });

        try {
            const branchId = result.sourceOrder?.branchId || result.targetOrder?.branchId;
            if (branchId) {
                const room = `branch:${branchId}`;
                if (result.sourceOrder) getIO().to(room).emit('order:status', { id: result.sourceOrder.id, status: result.sourceOrder.status });
                if (result.targetOrder) getIO().to(room).emit('order:status', { id: result.targetOrder.id, status: result.targetOrder.status });
                getIO().to(room).emit('table:status', { id: sourceTableId, status: result.sourceOrder?.status === 'DELIVERED' ? 'AVAILABLE' : 'OCCUPIED', currentOrderId: result.sourceOrder?.status === 'DELIVERED' ? null : result.sourceOrder?.id });
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
