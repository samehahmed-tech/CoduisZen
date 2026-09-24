import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import { orderItems, inventoryItems, inventoryBatches, stockMovements, purchaseOrders, suppliers, recipes, recipeIngredients } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';
import { convertQuantity } from '../../services/unitConversion';

export const getActualVsTheoretical = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];

        // Theoretical consumption: qty sold × recipe ingredient qty / recipe yield.
        // Exactly ONE recipe must match each sold line (size match → base → newest),
        // otherwise items with sizes inflate consumption by their recipe count.
        const sizeRank = sql`CASE
            WHEN oi.size_id IS NOT NULL AND LTRIM(RTRIM(oi.size_id)) <> '' AND r.size_id = oi.size_id THEN 0
            WHEN (oi.size_id IS NULL OR LTRIM(RTRIM(oi.size_id)) = '') AND (r.size_id IS NULL OR LTRIM(RTRIM(r.size_id)) = '') THEN 0
            WHEN r.size_id IS NULL OR LTRIM(RTRIM(r.size_id)) = '' THEN 1
            ELSE 2
        END`;

        // Theoretical matches the sales engine: business-day window, live
        // orders/lines only, NULLIF-guarded yield (yield=0 used to divide by
        // zero → NULL → silently dropped rows).
        const rawRows: any = await db.execute(sql`
            WITH matched_recipes AS (
                SELECT oi.id AS order_item_id,
                       r.id AS recipe_id,
                       r.yield AS recipe_yield,
                       ROW_NUMBER() OVER (
                            PARTITION BY oi.id
                            ORDER BY ${sizeRank} ASC, r.updated_at DESC
                        ) AS rn
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                JOIN recipes r ON r.menu_item_id = oi.menu_item_id
                WHERE ((o.business_date IS NOT NULL AND o.business_date >= ${startDate as string} AND o.business_date <= ${endDate as string})
                   OR (o.business_date IS NULL AND o.created_at >= ${start} AND o.created_at <= ${end}))
                  AND o.status IN ('DELIVERED', 'COMPLETED')
                  AND o.deleted_at IS NULL
                  AND COALESCE(oi.status, '') NOT IN ('VOID', 'VOIDED', 'CANCELLED')
                  ${branchId && branchId !== 'undefined' ? sql`AND o.branch_id = ${branchId}` : sql``}
            )
            SELECT ri.inventory_item_id AS inventoryItemId,
                   inv.name AS itemName,
                   inv.unit AS invUnit,
                   ri.unit AS recipeUnit,
                   COALESCE(SUM(oi.quantity * ri.quantity / COALESCE(NULLIF(m.recipe_yield, 0), 1)), 0) AS theoreticalQty
            FROM matched_recipes m
            JOIN order_items oi ON oi.id = m.order_item_id
            JOIN recipe_ingredients ri ON ri.recipe_id = m.recipe_id
            JOIN inventory_items inv ON inv.id = ri.inventory_item_id
            WHERE m.rn = 1
            GROUP BY ri.inventory_item_id, inv.name, inv.unit, ri.unit
        `);
        const rawTheoretical: any[] = Array.isArray(rawRows)
            ? rawRows
            : (rawRows?.recordset ?? rawRows?.rows ?? []);

        // Convert every row to the inventory item's own unit (same factors as
        // the sales engine) then aggregate per item — previously a g-recipe on
        // a kg-item inflated theoretical 1000×.
        const theoreticalMap = new Map<string, { itemName: string; unit: string; qty: number }>();
        for (const r of rawTheoretical) {
            const rawQty = Number(r.theoreticalQty || 0);
            let qty = rawQty;
            try {
                qty = convertQuantity(rawQty, String(r.recipeUnit || ''), String(r.invUnit || ''));
            } catch { qty = rawQty; }
            if (!Number.isFinite(qty)) qty = rawQty;
            const prev = theoreticalMap.get(r.inventoryItemId);
            if (prev) prev.qty += qty;
            else theoreticalMap.set(r.inventoryItemId, { itemName: r.itemName, unit: r.invUnit, qty });
        }

        // Actual = real consumption legs only (sale + production use), scoped
        // to the branch's warehouses. The old list matched types the engine
        // never writes (CONSUMPTION/SALE/MANUAL_OUT) while missing
        // PRODUCTION_CONSUMPTION, and abs()-summed PRODUCTION output.
        const movementConditions: any[] = [
            gte(stockMovements.createdAt, start),
            lte(stockMovements.createdAt, end),
            inArray(stockMovements.type, ['SALE_CONSUMPTION', 'PRODUCTION_CONSUMPTION']),
        ];
        if (branchId && branchId !== 'undefined') {
            movementConditions.push(sql`EXISTS (
                SELECT 1 FROM warehouses bw
                WHERE bw.id IN (${stockMovements.fromWarehouseId}, ${stockMovements.toWarehouseId})
                  AND bw.branch_id = ${String(branchId)}
            )`);
        }

        const actualRows = await db.select({
            inventoryItemId: stockMovements.itemId,
            actualQty: sql<number>`coalesce(sum(abs(${stockMovements.quantity})), 0)`,
        }).from(stockMovements).where(and(...movementConditions)).groupBy(stockMovements.itemId);

        const actualMap = new Map(actualRows.map(r => [r.inventoryItemId, Number(r.actualQty)]));

        res.json(Array.from(theoreticalMap.entries()).map(([inventoryItemId, t]) => {
            const theoretical = Number(t.qty.toFixed(3));
            const actual = actualMap.get(inventoryItemId) || 0;
            const variance = Number((actual - theoretical).toFixed(3));
            const variancePercent = theoretical > 0 ? Number(((variance / theoretical) * 100).toFixed(1)) : 0;
            return {
                inventoryItemId,
                itemName: t.itemName,
                unit: t.unit,
                theoreticalQty: theoretical,
                actualQty: Number(actual.toFixed(3)),
                variance,
                variancePercent,
            };
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getPurchaseHistory = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(purchaseOrders.createdAt, start), lte(purchaseOrders.createdAt, end)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(purchaseOrders.branchId, branchId as string));

        // Committed spend = RECEIVED/PARTIAL only. DRAFT/SENT/CANCELLED are
        // pipeline, reported separately — previously everything inflated
        // totalSpend.
        const committedConds = [...conditions, inArray(purchaseOrders.status, ['RECEIVED', 'PARTIAL'])];
        const bySupplier = await db.select({
            supplierId: purchaseOrders.supplierId,
            supplierName: suppliers.name,
            poCount: sql<number>`count(*)`,
            totalSpend: sql<number>`coalesce(sum(${purchaseOrders.subtotal}), 0)`,
        }).from(purchaseOrders)
            .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
            .where(and(...committedConds))
            .groupBy(purchaseOrders.supplierId, suppliers.name)
            .orderBy(sql`sum(${purchaseOrders.subtotal}) desc`);

        const byStatus = await db.select({
            status: purchaseOrders.status,
            count: sql<number>`count(*)`,
            total: sql<number>`coalesce(sum(${purchaseOrders.subtotal}), 0)`,
        }).from(purchaseOrders).where(and(...conditions)).groupBy(purchaseOrders.status);

        const [summary] = await db.select({
            totalPOs: sql<number>`count(*)`,
            totalSpend: sql<number>`coalesce(sum(${purchaseOrders.subtotal}), 0)`,
            avgPO: sql<number>`coalesce(avg(${purchaseOrders.subtotal}), 0)`,
        }).from(purchaseOrders).where(and(...committedConds));
        const [pipeline] = await db.select({
            totalSpend: sql<number>`coalesce(sum(${purchaseOrders.subtotal}), 0)`,
            count: sql<number>`count(*)`,
        }).from(purchaseOrders).where(and(...conditions, inArray(purchaseOrders.status, ['DRAFT', 'SENT'])));

        res.json({
            summary: {
                totalPOs: Number(summary?.totalPOs || 0),
                totalSpend: Number(Number(summary?.totalSpend || 0).toFixed(2)),
                avgPO: Number(Number(summary?.avgPO || 0).toFixed(2)),
                pipelineSpend: Number(Number(pipeline?.totalSpend || 0).toFixed(2)),
                pipelineCount: Number(pipeline?.count || 0),
                spendBasis: 'RECEIVED_PARTIAL_ONLY',
            },
            bySupplier: bySupplier.map(r => ({ ...r, poCount: Number(r.poCount), totalSpend: Number(Number(r.totalSpend).toFixed(2)) })),
            byStatus: byStatus.map(r => ({ status: r.status, count: Number(r.count), total: Number(Number(r.total).toFixed(2)) })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getInventoryValuation = async (_req: Request, res: Response) => {
    try {
        // Current stock valuation from ACTIVE batches only (EXPIRED lots with
        // leftover qty are not saleable). avgUnitCost is quantity-WEIGHTED —
        // the old plain avg() mispriced mixed batches badly.
        const batchValuation = await db.select({
            itemId: inventoryBatches.itemId,
            itemName: inventoryItems.name,
            unit: inventoryItems.unit,
            totalQty: sql<number>`coalesce(sum(${inventoryBatches.currentQty}), 0)`,
            totalValue: sql<number>`coalesce(sum(${inventoryBatches.currentQty} * ${inventoryBatches.unitCost}), 0)`,
            batchCount: sql<number>`count(*)`,
        }).from(inventoryBatches)
            .innerJoin(inventoryItems, eq(inventoryBatches.itemId, inventoryItems.id))
            .where(and(
                sql`${inventoryBatches.currentQty} > 0`,
                eq(inventoryBatches.status, 'ACTIVE'),
            ))
            .groupBy(inventoryBatches.itemId, inventoryItems.name, inventoryItems.unit)
            .orderBy(sql`sum(${inventoryBatches.currentQty} * ${inventoryBatches.unitCost}) desc`);

        const totalValue = batchValuation.reduce((s, r) => s + Number(r.totalValue), 0);

        res.json({
            totalValue: Number(totalValue.toFixed(2)),
            basis: 'ACTIVE_BATCH_FEFO_COST',
            items: batchValuation.map(r => {
                const qty = Number(r.totalQty);
                const value = Number(r.totalValue);
                return {
                    itemId: r.itemId,
                    itemName: r.itemName,
                    unit: r.unit,
                    totalQty: Number(qty.toFixed(3)),
                    totalValue: Number(value.toFixed(2)),
                    avgUnitCost: qty > 0 ? Number((value / qty).toFixed(2)) : 0,
                    batchCount: Number(r.batchCount),
                };
            }),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
