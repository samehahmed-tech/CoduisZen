/**
 * Inventory Intelligence Service
 * Implements: Reorder Points, Auto Purchase Suggestion, Unit Conversion, Stock Count
 * Section 5 of the ERP Launch Readiness Checklist
 */

import { db } from '../db';
import { inventoryItems, inventoryStock, warehouses, suppliers, stockMovements, orderItems } from '../../src/db/schema';
import { eq, and, sql, lte, gt, desc, asc, inArray } from 'drizzle-orm';
import { aiService } from './aiService';

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
    urgency: 'IMMEDIATE' | 'SOON' | 'PLANNED';
    reason: string;
}

export interface UnitConversion {
    from: string;
    to: string;
    factor: number;
}

export interface StockCountSession {
    id: string;
    warehouseId: string;
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
    async getReorderAlerts(warehouseId?: string): Promise<ReorderAlert[]> {
        // Get all items with their stock levels
        const stockQuery = db.select({
            itemId: inventoryStock.itemId,
            warehouseId: inventoryStock.warehouseId,
            quantity: inventoryStock.quantity,
        }).from(inventoryStock);

        const stocks = warehouseId
            ? await stockQuery.where(eq(inventoryStock.warehouseId, warehouseId))
            : await stockQuery;

        const items = await db.select().from(inventoryItems).where(eq(inventoryItems.isActive, true));
        const warehouseList = await db.select().from(warehouses).where(eq(warehouses.isActive, true));

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
            .where(
                and(
                    eq(stockMovements.type, 'SALE_CONSUMPTION'),
                    gt(stockMovements.createdAt, thirtyDaysAgo)
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
    async getPurchaseSuggestions(warehouseId?: string): Promise<PurchaseSuggestion[]> {
        const alerts = await this.getReorderAlerts(warehouseId);
        const supplierList = await db.select().from(suppliers).where(eq(suppliers.isActive, true));
        const supplierMap = new Map(supplierList.map(s => [s.id, s]));

        return alerts.map(alert => {
            const supplier = alert.supplierId ? supplierMap.get(alert.supplierId) : null;
            const item = {} as any; // We already have the data in alert

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
                estimatedCost: 0, // Could be calculated from PO history
                urgency,
                reason,
            };
        });
    },

    // =========================================================================
    // Stock Count (Physical Inventory)
    // =========================================================================
    async createStockCountSession(warehouseId: string, createdBy: string): Promise<StockCountSession> {
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

    async updateStockCount(sessionId: string, counts: { itemId: string; countedQty: number; notes?: string }[], updatedBy: string): Promise<StockCountSession> {
        const { settings } = await import('../../src/db/schema');
        const key = `stock_count_${sessionId}`;
        const [row] = await db.select().from(settings).where(eq(settings.key, key));
        if (!row) throw new Error('Stock count session not found');

        const session = row.value as StockCountSession;
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

    async completeStockCount(sessionId: string, completedBy: string, applyAdjustments: boolean = true): Promise<StockCountSession> {
        const { settings } = await import('../../src/db/schema');
        const key = `stock_count_${sessionId}`;
        const [row] = await db.select().from(settings).where(eq(settings.key, key));
        if (!row) throw new Error('Stock count session not found');

        const session = row.value as StockCountSession;
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
    async getAIForecast(itemId: string, branchId?: string): Promise<string> {
        // 1. Gather historical consumption (Sales) for the last 90 days
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const consumption = await db.select({
            date: sql<string>`DATE(${stockMovements.createdAt})`,
            qty: sql<number>`SUM(${stockMovements.quantity})`,
        })
            .from(stockMovements)
            .where(and(
                eq(stockMovements.itemId, itemId),
                eq(stockMovements.type, 'SALE_CONSUMPTION'),
                gt(stockMovements.createdAt, ninetyDaysAgo)
            ))
            .groupBy(sql`DATE(${stockMovements.createdAt})`)
            .orderBy(asc(sql`DATE(${stockMovements.createdAt})`));

        if (consumption.length < 5) return "Insufficient historical data for AI forecasting.";

        // 2. Format data for the LLM
        const itemData = await db.select().top(1).from(inventoryItems).where(eq(inventoryItems.id, itemId));
        const itemName = itemData[0]?.name || "Unknown Item";
        
        const dataStr = consumption.map(c => `${c.date}: ${c.qty}`).join('\n');
        const prompt = `Analyze historical sales for "${itemName}" and predict future demand. 
        Data (Date: Qty Sold):\n${dataStr}\n
        Provide a concise 2-sentence forecast including seasonal trends or spikes noticed.`;

        // 3. Query AI Service with caching
        return aiService.getCachedInsight(`forecast_${itemId}`, async () => {
            return aiService.queryAI(prompt, "You are a demand forecasting expert for a restaurant.");
        }, 1440); // 24 hour cache
    },
};

export default inventoryIntelligence;
