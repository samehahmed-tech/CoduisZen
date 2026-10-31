import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import { orderItems, inventoryItems, inventoryBatches, stockMovements, purchaseOrders, suppliers, recipes, recipeIngredients } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';
import { convertQuantity } from '../../services/unitConversion';
import { calculateFoodCostVariance } from '../../utils/foodCost';

let recipeVersionColumnReady: Promise<void> | null = null;
const ensureRecipeVersionColumn = () => {
    if (!recipeVersionColumnReady) {
        recipeVersionColumnReady = db.execute(sql`
            IF COL_LENGTH('order_items', 'recipe_version_id') IS NULL
                ALTER TABLE order_items ADD recipe_version_id nvarchar(150)
        `).then(() => undefined).catch((error) => {
            recipeVersionColumnReady = null;
            throw error;
        });
    }
    return recipeVersionColumnReady;
};

export const getActualVsTheoretical = async (req: Request, res: Response) => {
    try {
        await ensureRecipeVersionColumn();
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

        // Prefer the immutable recipe snapshot captured on the order line.
        // The live recipe query below remains a compatibility fallback for
        // legacy orders created before recipe_version_id existed.
        const historicalRows: any = await db.execute(sql`
            SELECT oi.id AS orderItemId,
                   oi.quantity AS orderQuantity,
                   oi.recipe_version_id AS recipeVersionId,
                   rv.yield AS recipeYield,
                   rv.ingredients_snapshot AS ingredientsSnapshot
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN recipe_versions rv ON rv.id = oi.recipe_version_id
            WHERE ((o.business_date IS NOT NULL AND o.business_date >= ${startDate as string} AND o.business_date <= ${endDate as string})
               OR (o.business_date IS NULL AND o.created_at >= ${start} AND o.created_at <= ${end}))
              AND o.status IN ('DELIVERED', 'COMPLETED')
              AND o.deleted_at IS NULL
              AND COALESCE(oi.status, '') NOT IN ('VOID', 'VOIDED', 'CANCELLED')
              ${branchId && branchId !== 'undefined' ? sql`AND o.branch_id = ${branchId}` : sql``}
        `);
        const historicalRecords: any[] = Array.isArray(historicalRows)
            ? historicalRows
            : (historicalRows?.recordset ?? historicalRows?.rows ?? []);
        const historicalIngredientsByItem = new Map<string, { itemName: string; unit: string; qty: number; cost: number }>();
        for (const line of historicalRecords) {
            let snapshot: any[] = [];
            try {
                const parsed = typeof line.ingredientsSnapshot === 'string'
                    ? JSON.parse(line.ingredientsSnapshot)
                    : line.ingredientsSnapshot;
                snapshot = Array.isArray(parsed) ? parsed : [];
            } catch {
                snapshot = [];
            }
            if (snapshot.length === 0) continue;
            for (const ingredient of snapshot) {
                const itemId = String(ingredient?.inventoryItemId || '').trim();
                if (!itemId) continue;
                const yieldCount = Math.max(1, Number(line.recipeYield || 1));
                const qty = (Number(line.orderQuantity || 0) * Number(ingredient.quantity || 0)) / yieldCount;
                const cost = qty * Number(ingredient.costPerUnit || 0);
                const previous = historicalIngredientsByItem.get(itemId);
                if (previous) {
                    previous.qty += qty;
                    previous.cost += cost;
                } else {
                    historicalIngredientsByItem.set(itemId, {
                        itemName: String(ingredient.itemName || itemId),
                        unit: String(ingredient.unit || ''),
                        qty,
                        cost,
                    });
                }
            }
        }

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
                  AND oi.recipe_version_id IS NULL
                  ${branchId && branchId !== 'undefined' ? sql`AND o.branch_id = ${branchId}` : sql``}
            )
            SELECT ri.inventory_item_id AS inventoryItemId,
                   inv.name AS itemName,
                   inv.unit AS invUnit,
                   ri.unit AS recipeUnit,
                   COALESCE(SUM(oi.quantity * ri.quantity / COALESCE(NULLIF(m.recipe_yield, 0), 1)), 0) AS theoreticalQty,
                   COALESCE(inv.cost_price, inv.purchase_price, 0) AS unitCost
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
        const historicalInventoryIds = Array.from(historicalIngredientsByItem.keys());
        const historicalInventoryRows = historicalInventoryIds.length > 0
            ? await db.select({ id: inventoryItems.id, unit: inventoryItems.unit }).from(inventoryItems).where(inArray(inventoryItems.id, historicalInventoryIds))
            : [];
        const historicalInventoryUnits = new Map(historicalInventoryRows.map(item => [item.id, item.unit]));
        const theoreticalMap = new Map<string, { itemName: string; unit: string; qty: number; unitCost: number; fixedCost?: number }>();
        for (const [itemId, historical] of historicalIngredientsByItem) {
            let normalizedQty = historical.qty;
            const inventoryUnit = String(historicalInventoryUnits.get(itemId) || historical.unit);
            try {
                normalizedQty = convertQuantity(historical.qty, historical.unit, inventoryUnit);
            } catch { /* Keep the snapshot quantity when an old unit is unknown. */ }
            const rawUnitCost = historical.qty > 0 ? historical.cost / historical.qty : 0;
            const normalizedCost = normalizedQty * rawUnitCost;
            const unitCost = normalizedQty > 0 ? normalizedCost / normalizedQty : 0;
            theoreticalMap.set(itemId, {
                itemName: historical.itemName,
                unit: inventoryUnit,
                qty: normalizedQty,
                unitCost,
                fixedCost: normalizedCost,
            });
        }
        for (const r of rawTheoretical) {
            const rawQty = Number(r.theoreticalQty || 0);
            let qty = rawQty;
            try {
                qty = convertQuantity(rawQty, String(r.recipeUnit || ''), String(r.invUnit || ''));
            } catch { qty = rawQty; }
            if (!Number.isFinite(qty)) qty = rawQty;
            const unitCost = Number(r.unitCost || 0);
            const prev = theoreticalMap.get(r.inventoryItemId);
            if (prev) {
                prev.qty += qty;
                prev.fixedCost = undefined;
            } else theoreticalMap.set(r.inventoryItemId, { itemName: r.itemName, unit: r.invUnit, qty, unitCost });
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
            actualCost: sql<number>`coalesce(sum(coalesce(nullif(abs(${stockMovements.totalCost}), 0), abs(${stockMovements.quantity}) * coalesce(${stockMovements.unitCost}, 0))), 0)`,
        }).from(stockMovements).where(and(...movementConditions)).groupBy(stockMovements.itemId);

        const actualMap = new Map(actualRows.map(r => [r.inventoryItemId, { qty: Number(r.actualQty || 0), cost: Number(r.actualCost || 0) }]));
        const wasteConditions: any[] = [
            gte(stockMovements.createdAt, start),
            lte(stockMovements.createdAt, end),
            eq(stockMovements.type, 'WASTE'),
        ];
        if (branchId && branchId !== 'undefined') {
            wasteConditions.push(sql`EXISTS (
                SELECT 1 FROM warehouses bw
                WHERE bw.id IN (${stockMovements.fromWarehouseId}, ${stockMovements.toWarehouseId})
                  AND bw.branch_id = ${String(branchId)}
            )`);
        }
        const wasteRows = await db.select({
            inventoryItemId: stockMovements.itemId,
            wasteQty: sql<number>`coalesce(sum(abs(${stockMovements.quantity})), 0)`,
            wasteCost: sql<number>`coalesce(sum(coalesce(nullif(abs(${stockMovements.totalCost}), 0), abs(${stockMovements.quantity}) * coalesce(${stockMovements.unitCost}, 0))), 0)`,
        }).from(stockMovements).where(and(...wasteConditions)).groupBy(stockMovements.itemId);
        const wasteMap = new Map(wasteRows.map(r => [r.inventoryItemId, { qty: Number(r.wasteQty || 0), cost: Number(r.wasteCost || 0) }]));

        const revenueRows: any = await db.execute(sql`
            SELECT COALESCE(SUM(oi.price * oi.quantity), 0) AS revenue,
                   COALESCE(SUM(oi.cost * oi.quantity), 0) AS historicalRecipeCost,
                   SUM(CASE WHEN oi.recipe_version_id IS NOT NULL THEN 1 ELSE 0 END) AS versionedLines,
                   COUNT(*) AS totalLines
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE ((o.business_date IS NOT NULL AND o.business_date >= ${startDate as string} AND o.business_date <= ${endDate as string})
               OR (o.business_date IS NULL AND o.created_at >= ${start} AND o.created_at <= ${end}))
              AND o.status IN ('DELIVERED', 'COMPLETED')
              AND o.deleted_at IS NULL
              AND COALESCE(oi.status, '') NOT IN ('VOID', 'VOIDED', 'CANCELLED')
              ${branchId && branchId !== 'undefined' ? sql`AND o.branch_id = ${branchId}` : sql``}
        `);
        const revenueRecords: any[] = Array.isArray(revenueRows) ? revenueRows : (revenueRows?.recordset ?? revenueRows?.rows ?? []);
        const revenue = Number(revenueRecords[0]?.revenue || 0);
        const historicalRecipeCost = Number(revenueRecords[0]?.historicalRecipeCost || 0);
        const totalLines = Number(revenueRecords[0]?.totalLines || 0);
        const versionedLines = Number(revenueRecords[0]?.versionedLines || 0);

        const itemIds = new Set([...theoreticalMap.keys(), ...actualMap.keys(), ...wasteMap.keys()]);
        const rows = Array.from(itemIds).map(inventoryItemId => {
            const t = theoreticalMap.get(inventoryItemId) || { itemName: 'Unknown item', unit: '', qty: 0, unitCost: 0 };
            const actualRecord = actualMap.get(inventoryItemId) || { qty: 0, cost: 0 };
            const wasteRecord = wasteMap.get(inventoryItemId) || { qty: 0, cost: 0 };
            const theoretical = Number(t.qty.toFixed(3));
            const actual = actualRecord.qty;
            const variance = Number((actual - theoretical).toFixed(3));
            const variancePercent = theoretical > 0 ? Number(((variance / theoretical) * 100).toFixed(1)) : 0;
            const cost = calculateFoodCostVariance({
                theoreticalCost: t.fixedCost ?? (theoretical * t.unitCost),
                actualCost: actualRecord.cost,
                revenue,
            });
            return {
                inventoryItemId,
                itemName: t.itemName,
                unit: t.unit,
                theoreticalQty: theoretical,
                actualQty: Number(actual.toFixed(3)),
                variance,
                variancePercent,
                theoreticalCost: cost.theoreticalCost,
                actualCost: cost.actualCost,
                costVariance: cost.variance,
                costVariancePercent: cost.variancePercent,
                theoreticalFoodCostPercent: cost.theoreticalFoodCostPercent,
                actualFoodCostPercent: cost.actualFoodCostPercent,
                wasteQty: Number(wasteRecord.qty.toFixed(3)),
                wasteCost: Number(wasteRecord.cost.toFixed(2)),
            };
        });
        res.json({
            rows,
            summary: {
                revenue: Number(revenue.toFixed(2)),
                theoreticalCost: Number(rows.reduce((sum, row) => sum + row.theoreticalCost, 0).toFixed(2)),
                actualCost: Number(rows.reduce((sum, row) => sum + row.actualCost, 0).toFixed(2)),
                costVariance: Number(rows.reduce((sum, row) => sum + row.costVariance, 0).toFixed(2)),
                theoreticalFoodCostPercent: revenue > 0 ? Number(((rows.reduce((sum, row) => sum + row.theoreticalCost, 0) / revenue) * 100).toFixed(1)) : 0,
                actualFoodCostPercent: revenue > 0 ? Number(((rows.reduce((sum, row) => sum + row.actualCost, 0) / revenue) * 100).toFixed(1)) : 0,
                wasteQty: Number(rows.reduce((sum, row) => sum + row.wasteQty, 0).toFixed(3)),
                wasteCost: Number(rows.reduce((sum, row) => sum + row.wasteCost, 0).toFixed(2)),
                historicalRecipeCost: Number(historicalRecipeCost.toFixed(2)),
                recipeVersionCoveragePercent: totalLines > 0 ? Number(((versionedLines / totalLines) * 100).toFixed(1)) : 0,
            },
        });
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
