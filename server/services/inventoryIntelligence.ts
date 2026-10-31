/**
 * Inventory Intelligence Service
 * Implements: Reorder Points, Auto Purchase Suggestion, Unit Conversion, Stock Count
 * Section 5 of the ERP Launch Readiness Checklist
 */

import { db } from '../db';
import { inventoryItems, inventoryStock, warehouses, suppliers, stockMovements, orderItems, orders } from '../../src/db/schema';
import { eq, and, sql, lte, gt, desc, asc, inArray } from 'drizzle-orm';
import { aiService } from './aiService';
import { wrapUntrustedAiData } from '../utils/aiPromptSafety';

// =============================================================================
// Types
// =============================================================================

export interface ReorderAlert {
    itemId: string;
    itemName: string;
    sku: string | null;
    unit: string;
    warehouseId: string;
    warehouseName: string;
    currentQty: number;
    threshold: number;
    reorderQty: number;
    supplierId: string | null;
    priority: 'CRITICAL' | 'LOW' | 'WARNING';
    avgDailyUsage: number;
    daysUntilStockout: number;
    costPrice: number;
}

export interface PurchaseSuggestion {
    itemId: string;
    itemName: string;
    sku: string | null;
    unit: string;
    supplierId: string | null;
    supplierName: string | null;
    currentQty: number;
    avgDailyUsage: number;
    suggestedQty: number;
    estimatedCost: number;
    estimatedCostSource: 'ITEM_COST_PRICE' | 'UNAVAILABLE';
    urgency: 'IMMEDIATE' | 'SOON' | 'PLANNED';
    reason: string;
    explanation: string;
}

export interface UnitConversion {
    from: string;
    to: string;
    factor: number;
}

export interface StockCountSession {
    id: string;
    warehouseId: string;
    branchId?: string;
    createdBy: string;
    status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    items: StockCountItem[];
    createdAt: string;
    completedAt?: string;
    completedBy?: string;
    totalVariance: number;
    totalVarianceCost: number;
}

export interface StockCountItem {
    itemId: string;
    itemName: string;
    unit: string;
    systemQty: number;
    countedQty: number | null;
    variance: number;
    varianceCost: number;
    notes?: string;
}

export interface AIForecastResult {
    text: string;
    aiStatus: 'GENERATED' | 'DEGRADED_FALLBACK' | 'INSUFFICIENT_DATA';
    branchId: string | null;
    itemId: string;
    sampleDays: number;
    dataFrom: string | null;
    dataAsOf: string | null;
    dataFreshnessHours: number | null;
    dateBasis: 'ORDER_BUSINESS_DATE_WITH_MOVEMENT_FALLBACK';
    source: 'STOCK_MOVEMENTS_SALE_CONSUMPTION_90_DAY_ORDER_BUSINESS_DATE';
}

// =============================================================================
// Unit Conversion Table
// =============================================================================

const CONVERSIONS: UnitConversion[] = [
    // Weight
    { from: 'kg', to: 'g', factor: 1000 },
    { from: 'g', to: 'kg', factor: 0.001 },
    { from: 'g', to: 'mg', factor: 1000 },
    { from: 'mg', to: 'g', factor: 0.001 },
    { from: 'lb', to: 'kg', factor: 0.4536 },
    { from: 'kg', to: 'lb', factor: 2.2046 },
    { from: 'oz', to: 'g', factor: 28.3495 },
    { from: 'g', to: 'oz', factor: 0.03527 },
    // Volume
    { from: 'liter', to: 'ml', factor: 1000 },
    { from: 'ml', to: 'liter', factor: 0.001 },
    { from: 'gallon', to: 'liter', factor: 3.7854 },
    { from: 'liter', to: 'gallon', factor: 0.2642 },
    { from: 'cup', to: 'ml', factor: 236.588 },
    { from: 'ml', to: 'cup', factor: 0.00423 },
    // Count
    { from: 'dozen', to: 'piece', factor: 12 },
    { from: 'piece', to: 'dozen', factor: 1 / 12 },
    { from: 'box', to: 'piece', factor: 24 },  // default, can be overridden
    { from: 'carton', to: 'piece', factor: 12 }, // default
];

// =============================================================================
// Service
// =============================================================================

export const inventoryIntelligence = {

    // =========================================================================
    // Unit Conversion
    // =========================================================================
    convert(value: number, from: string, to: string): { result: number; factor: number } | null {
        const fromNorm = from.toLowerCase().trim();
        const toNorm = to.toLowerCase().trim();
        if (fromNorm === toNorm) return { result: value, factor: 1 };

        const conversion = CONVERSIONS.find(c => c.from === fromNorm && c.to === toNorm);
        if (conversion) {
            return { result: value * conversion.factor, factor: conversion.factor };
        }

        // Try reverse
        const reverse = CONVERSIONS.find(c => c.from === toNorm && c.to === fromNorm);
        if (reverse) {
            return { result: value / reverse.factor, factor: 1 / reverse.factor };
        }

        // Try two-step conversion (from → common → to)
        const commonUnits = ['g', 'ml', 'piece'];
        for (const common of commonUnits) {
            const step1 = CONVERSIONS.find(c => c.from === fromNorm && c.to === common);
            const step2 = CONVERSIONS.find(c => c.from === common && c.to === toNorm);
            if (step1 && step2) {
                const factor = step1.factor * step2.factor;
                return { result: value * factor, factor };
            }
        }

        return null;
    },

    getSupportedUnits(): string[] {
        const units = new Set<string>();
        for (const c of CONVERSIONS) {
            units.add(c.from);
            units.add(c.to);
        }
        return [...units].sort();
    },

    getConversionsForUnit(unit: string): UnitConversion[] {
        const norm = unit.toLowerCase().trim();
        return CONVERSIONS.filter(c => c.from === norm || c.to === norm);
    },

    // =========================================================================
    // Reorder Alerts
    // =========================================================================
    async getReorderAlerts(warehouseId?: string, branchId?: string): Promise<ReorderAlert[]> {
        const branchWarehouses = branchId
            ? await db.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.branchId, branchId), eq(warehouses.isActive, true)))
            : [];
        const allowedWarehouseIds = branchId ? branchWarehouses.map(row => row.id) : undefined;
        if (branchId && !allowedWarehouseIds?.length) return [];

        // Get all items with their stock levels
        const stockQuery = db.select({
            itemId: inventoryStock.itemId,
            warehouseId: inventoryStock.warehouseId,
            quantity: inventoryStock.quantity,
        }).from(inventoryStock);

        const stockFilters = [
            warehouseId ? eq(inventoryStock.warehouseId, warehouseId) : undefined,
            allowedWarehouseIds ? inArray(inventoryStock.warehouseId, allowedWarehouseIds) : undefined,
        ].filter(Boolean) as any[];
        const stocks = stockFilters.length ? await stockQuery.where(and(...stockFilters)) : await stockQuery;

        const items = await db.select().from(inventoryItems).where(eq(inventoryItems.isActive, true));
        const warehouseList = await db.select().from(warehouses).where(and(eq(warehouses.isActive, true), ...(allowedWarehouseIds ? [inArray(warehouses.id, allowedWarehouseIds)] : [])));

        const itemMap = new Map(items.map(i => [i.id, i]));
        const warehouseMap = new Map(warehouseList.map(w => [w.id, w]));

        const alerts: ReorderAlert[] = [];

        // Get avg daily usage for all items (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const usageData = await db.select({
            itemId: stockMovements.itemId,
            totalUsed: sql<number>`COALESCE(SUM(${stockMovements.quantity}), 0)`,
        })
            .from(stockMovements)
            .leftJoin(warehouses, eq(stockMovements.fromWarehouseId, warehouses.id))
            .where(
                and(
                    eq(stockMovements.type, 'SALE_CONSUMPTION'),
                    gt(stockMovements.createdAt, thirtyDaysAgo),
                    branchId ? inArray(stockMovements.fromWarehouseId, allowedWarehouseIds || []) : undefined,
                )
            )
            .groupBy(stockMovements.itemId);

        const usageMap = new Map(usageData.map(u => [u.itemId, Number(u.totalUsed) / 30]));

        for (const stock of stocks) {
            const item = itemMap.get(stock.itemId);
            if (!item) continue;

            const threshold = Number(item.threshold || 0);
            if (threshold <= 0) continue; // No reorder point set

            const currentQty = Number(stock.quantity || 0);
            if (currentQty > threshold) continue; // Above threshold

            const warehouse = warehouseMap.get(stock.warehouseId);
            const avgDaily = usageMap.get(stock.itemId) || 0;
            const daysUntilStockout = avgDaily > 0 ? Math.floor(currentQty / avgDaily) : 999;

            let priority: ReorderAlert['priority'] = 'LOW';
            if (currentQty <= 0) priority = 'CRITICAL';
            else if (currentQty <= threshold * 0.5) priority = 'CRITICAL';
            else if (currentQty <= threshold) priority = 'WARNING';

            // Suggest reorder quantity: 2 weeks of supply or 2x threshold
            const reorderQty = Math.max(
                Math.ceil(avgDaily * 14),
                threshold * 2
            );

            alerts.push({
                itemId: stock.itemId,
                itemName: item.name,
                sku: item.sku,
                unit: item.unit,
                warehouseId: stock.warehouseId,
                warehouseName: warehouse?.name || 'Unknown',
                currentQty,
                threshold,
                reorderQty,
                supplierId: item.supplierId,
                priority,
                avgDailyUsage: Math.round(avgDaily * 100) / 100,
                daysUntilStockout,
                costPrice: Number(item.costPrice || 0),
            });
        }

        // Sort: CRITICAL first, then by daysUntilStockout
        return alerts.sort((a, b) => {
            const priorityOrder = { CRITICAL: 0, WARNING: 1, LOW: 2 };
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            return a.daysUntilStockout - b.daysUntilStockout;
        });
    },

    // =========================================================================
    // Auto Purchase Suggestions
    // =========================================================================
    async getPurchaseSuggestions(warehouseId?: string, branchId?: string): Promise<PurchaseSuggestion[]> {
        const alerts = await this.getReorderAlerts(warehouseId, branchId);
        const supplierList = await db.select().from(suppliers).where(eq(suppliers.isActive, true));
        const supplierMap = new Map(supplierList.map(s => [s.id, s]));

        return alerts.map(alert => {
            const supplier = alert.supplierId ? supplierMap.get(alert.supplierId) : null;
            let urgency: PurchaseSuggestion['urgency'] = 'PLANNED';
            if (alert.priority === 'CRITICAL') urgency = 'IMMEDIATE';
            else if (alert.priority === 'WARNING') urgency = 'SOON';

            let reason = `Stock at ${alert.currentQty} ${alert.unit}`;
            if (alert.daysUntilStockout < 3) {
                reason += ` — stockout in ${alert.daysUntilStockout} day(s)!`;
            } else if (alert.daysUntilStockout < 7) {
                reason += ` — low stock, ${alert.daysUntilStockout} days remaining`;
            } else {
                reason += ` — below reorder point (${alert.threshold})`;
            }

            return {
                itemId: alert.itemId,
                itemName: alert.itemName,
                sku: alert.sku,
                unit: alert.unit,
                supplierId: alert.supplierId,
                supplierName: supplier?.name || null,
                currentQty: alert.currentQty,
                avgDailyUsage: alert.avgDailyUsage,
                suggestedQty: alert.reorderQty,
                estimatedCost: alert.costPrice > 0
                    ? Math.round(alert.reorderQty * alert.costPrice * 100) / 100
                    : 0,
                estimatedCostSource: alert.costPrice > 0 ? 'ITEM_COST_PRICE' : 'UNAVAILABLE',
                urgency,
                reason,
                explanation: reason,
            };
        });
    },

    // =========================================================================
    // Stock Count (Physical Inventory)
    // =========================================================================
    async createStockCountSession(warehouseId: string, createdBy: string, branchId?: string): Promise<StockCountSession> {
        const [warehouse] = await db.select({ id: warehouses.id, branchId: warehouses.branchId })
            .from(warehouses)
            .where(eq(warehouses.id, warehouseId));
        if (!warehouse) throw new Error('WAREHOUSE_NOT_FOUND');
        if (branchId && warehouse.branchId !== branchId) throw new Error('BRANCH_MISMATCH');
        // Get all stock for this warehouse
        const stocks = await db.select({
            itemId: inventoryStock.itemId,
            quantity: inventoryStock.quantity,
        })
            .from(inventoryStock)
            .where(eq(inventoryStock.warehouseId, warehouseId));

        const items = await db.select().from(inventoryItems).where(eq(inventoryItems.isActive, true));
        const itemMap = new Map(items.map(i => [i.id, i]));

        const countItems: StockCountItem[] = stocks.map(s => {
            const item = itemMap.get(s.itemId);
            return {
                itemId: s.itemId,
                itemName: item?.name || 'Unknown',
                unit: item?.unit || 'piece',
                systemQty: Number(s.quantity || 0),
                countedQty: null,
                variance: 0,
                varianceCost: 0,
            };
        });

        const session: StockCountSession = {
            id: `CNT-${Date.now()}`,
            warehouseId,
            branchId: warehouse.branchId || branchId,
            createdBy,
            status: 'IN_PROGRESS',
            items: countItems,
            createdAt: new Date().toISOString(),
            totalVariance: 0,
            totalVarianceCost: 0,
        };

        // Store in settings (could move to dedicated table later)
        const { settings } = await import('../../src/db/schema');
        const key = `stock_count_${session.id}`;
        await db.insert(settings).values({
            key,
            value: session,
            category: 'inventory',
            updatedBy: createdBy,
            updatedAt: new Date(),
        } as any);

        return session;
    },

    async updateStockCount(sessionId: string, counts: { itemId: string; countedQty: number; notes?: string }[], updatedBy: string, branchId?: string): Promise<StockCountSession> {
        const { settings } = await import('../../src/db/schema');
        const key = `stock_count_${sessionId}`;
        const [row] = await db.select().from(settings).where(eq(settings.key, key));
        if (!row) throw new Error('Stock count session not found');

        const session = row.value as StockCountSession;
        if (branchId && session.branchId !== branchId) throw new Error('BRANCH_MISMATCH');
        if (session.status !== 'IN_PROGRESS') throw new Error('Session is not in progress');

        const items = await db.select().from(inventoryItems).where(eq(inventoryItems.isActive, true));
        const itemMap = new Map(items.map(i => [i.id, i]));

        for (const count of counts) {
            const sessionItem = session.items.find(i => i.itemId === count.itemId);
            if (sessionItem) {
                sessionItem.countedQty = count.countedQty;
                sessionItem.variance = count.countedQty - sessionItem.systemQty;
                const item = itemMap.get(count.itemId);
                sessionItem.varianceCost = sessionItem.variance * Number(item?.costPrice || 0);
                if (count.notes) sessionItem.notes = count.notes;
            }
        }

        session.totalVariance = session.items.reduce((sum, i) => sum + Math.abs(i.variance), 0);
        session.totalVarianceCost = session.items.reduce((sum, i) => sum + Math.abs(i.varianceCost), 0);

        await db.update(settings)
            .set({ value: session, updatedBy, updatedAt: new Date() })
            .where(eq(settings.key, key));

        return session;
    },

    async completeStockCount(sessionId: string, completedBy: string, applyAdjustments: boolean = true, branchId?: string): Promise<StockCountSession> {
        const { settings } = await import('../../src/db/schema');
        const key = `stock_count_${sessionId}`;
        const [row] = await db.select().from(settings).where(eq(settings.key, key));
        if (!row) throw new Error('Stock count session not found');

        const session = row.value as StockCountSession;
        if (branchId && session.branchId !== branchId) throw new Error('BRANCH_MISMATCH');
        if (session.status !== 'IN_PROGRESS') throw new Error('Session is not in progress');

        // Apply adjustments to actual stock
        if (applyAdjustments) {
            for (const item of session.items) {
                if (item.countedQty === null) continue;
                if (Math.abs(item.variance) < 0.001) continue;

                // Update stock to counted quantity
                await db.update(inventoryStock)
                    .set({
                        quantity: item.countedQty,
                        lastUpdated: new Date(),
                    })
                    .where(
                        and(
                            eq(inventoryStock.itemId, item.itemId),
                            eq(inventoryStock.warehouseId, session.warehouseId)
                        )
                    );

                // Record adjustment movement
                await db.insert(stockMovements).values({
                    itemId: item.itemId,
                    fromWarehouseId: session.warehouseId,
                    quantity: Math.abs(item.variance),
                    type: 'ADJUSTMENT',
                    reason: `Stock count adjustment (${sessionId}): ${item.variance > 0 ? 'surplus' : 'shortage'} of ${Math.abs(item.variance)} ${item.unit}`,
                    referenceId: sessionId,
                    performedBy: completedBy,
                    createdAt: new Date(),
                });
            }
        }

        session.status = 'COMPLETED';
        session.completedAt = new Date().toISOString();
        session.completedBy = completedBy;

        await db.update(settings)
            .set({ value: session, updatedBy: completedBy, updatedAt: new Date() })
            .where(eq(settings.key, key));

        try {
            const { getIO } = await import('../socket');
            const [wh] = await db.select({ branchId: warehouses.branchId }).from(warehouses).where(eq(warehouses.id, session.warehouseId));
            if (wh?.branchId) {
                const branchRoom = `branch:${wh.branchId}`;
                // Items that were adjusted
                for (const item of session.items) {
                    if (item.countedQty !== null) {
                        getIO().to(branchRoom).emit('stock:updated', {
                            itemId: item.itemId,
                            warehouseId: session.warehouseId,
                            quantity: Number(item.countedQty),
                            type: 'ADJUSTMENT'
                        });
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to emit stock:updated for stock count', e);
        }

        return session;
    },

    // =========================================================================
    // AI Demand Forecasting
    // =========================================================================
    async getAIForecast(itemId: string, branchId?: string): Promise<AIForecastResult> {
        // 1. Gather historical consumption (Sales) for the last 90 days
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const branchWarehouses = branchId
            ? await db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.branchId, branchId))
            : [];
        const emptyForecast = (): AIForecastResult => ({
            text: 'Insufficient historical data for AI forecasting.',
            aiStatus: 'INSUFFICIENT_DATA',
            branchId: branchId || null,
            itemId,
            sampleDays: 0,
            dataFrom: null,
            dataAsOf: null,
            dataFreshnessHours: null,
            dateBasis: 'ORDER_BUSINESS_DATE_WITH_MOVEMENT_FALLBACK',
            source: 'STOCK_MOVEMENTS_SALE_CONSUMPTION_90_DAY_ORDER_BUSINESS_DATE',
        });
        if (branchId && !branchWarehouses.length) return emptyForecast();
        const consumption = await db.select({
            date: sql<string>`COALESCE(${orders.businessDate}, CAST(${stockMovements.createdAt} AS DATE))`,
            qty: sql<number>`SUM(${stockMovements.quantity})`,
        })
            .from(stockMovements)
            .leftJoin(warehouses, eq(stockMovements.fromWarehouseId, warehouses.id))
            .leftJoin(orders, eq(stockMovements.referenceId, orders.id))
            .where(and(
                eq(stockMovements.itemId, itemId),
                eq(stockMovements.type, 'SALE_CONSUMPTION'),
                gt(stockMovements.createdAt, ninetyDaysAgo),
                branchId ? inArray(stockMovements.fromWarehouseId, branchWarehouses.map(row => row.id)) : undefined,
            ))
            .groupBy(sql`COALESCE(${orders.businessDate}, CAST(${stockMovements.createdAt} AS DATE))`)
            .orderBy(asc(sql`COALESCE(${orders.businessDate}, CAST(${stockMovements.createdAt} AS DATE))`));

        if (consumption.length < 5) return emptyForecast();

        // 2. Format data for the LLM
        const itemData = await db.select().top(1).from(inventoryItems).where(eq(inventoryItems.id, itemId));
        const itemName = itemData[0]?.name || "Unknown Item";
        
        const dataStr = consumption.map(c => `${c.date}: ${c.qty}`).join('\n');
        const prompt = `Analyze historical sales for ${wrapUntrustedAiData(itemName, 'item-name')} and predict future demand.
        Data (Date: Qty Sold):\n${wrapUntrustedAiData(dataStr, 'historical-consumption')}\n
        Provide a concise 2-sentence forecast including seasonal trends or spikes noticed.`;

        // 3. Query AI Service with caching
        // Forecasts are derived from branch-scoped consumption. The cache key
        // must carry the same scope or one branch can receive another branch's
        // forecast for the same item.
        const dataFrom = String(consumption[0]?.date || '') || null;
        const dataAsOf = String(consumption[consumption.length - 1]?.date || '') || null;
        const asOf = dataAsOf ? new Date(`${dataAsOf}T23:59:59.999Z`) : null;
        const quantities = consumption.map(row => Number(row.qty || 0));
        const averageDailyUsage = quantities.length > 0
            ? quantities.reduce((sum, quantity) => sum + quantity, 0) / quantities.length
            : 0;
        const midpoint = Math.max(1, Math.floor(quantities.length / 2));
        const firstHalfAverage = quantities.slice(0, midpoint).reduce((sum, quantity) => sum + quantity, 0) / midpoint;
        const secondHalf = quantities.slice(midpoint);
        const secondHalfAverage = secondHalf.length > 0
            ? secondHalf.reduce((sum, quantity) => sum + quantity, 0) / secondHalf.length
            : firstHalfAverage;
        const trend = secondHalfAverage > firstHalfAverage * 1.1
            ? 'increasing'
            : secondHalfAverage < firstHalfAverage * 0.9 ? 'decreasing' : 'stable';
        const forecastCacheKey = `forecast_${branchId || 'global'}_${itemId}_${dataAsOf || 'none'}`;
        let text: string;
        let aiStatus: AIForecastResult['aiStatus'] = 'GENERATED';
        try {
            text = await aiService.getCachedInsight(forecastCacheKey, async () => {
                return aiService.queryAI(prompt, "You are a demand forecasting expert for a restaurant.");
            }, 1440); // 24 hour cache
        } catch {
            aiStatus = 'DEGRADED_FALLBACK';
            text = `Verified consumption averages ${averageDailyUsage.toFixed(2)} units per active day with a ${trend} trend across ${consumption.length} observed days. AI provider unavailable; use the reorder policy and review the inventory report before purchasing.`;
            console.warn('[AI] Inventory forecast provider unavailable; deterministic consumption fallback used.');
        }
        return {
            text,
            aiStatus,
            branchId: branchId || null,
            itemId,
            sampleDays: consumption.length,
            dataFrom,
            dataAsOf,
            dataFreshnessHours: asOf ? Math.max(0, Math.round(((Date.now() - asOf.getTime()) / 3600000) * 100) / 100) : null,
            dateBasis: 'ORDER_BUSINESS_DATE_WITH_MOVEMENT_FALLBACK',
            source: 'STOCK_MOVEMENTS_SALE_CONSUMPTION_90_DAY_ORDER_BUSINESS_DATE',
        };
    },
};

export default inventoryIntelligence;
