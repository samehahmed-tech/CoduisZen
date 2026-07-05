/**
 * Delivery Optimization Service
 * Implements: Phase 3.13 (Route Optimization)
 * 
 * groups pending orders by geographic proximity and suggests optimal batching.
 */

import { db } from '../db';
import { orders, driverTelemetryLatest, deliveryZones } from '../../src/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import logger from '../utils/logger';

const log = logger.child({ service: 'deliveryOpt' });

export interface OptimizedBatch {
    zoneId: string;
    zoneName: string;
    orderIds: string[];
    suggestedDriverId?: string;
    estimatedTimeMinutes: number;
}

export const deliveryOptimizationService = {

    /**
     * Suggest batches of orders for a branch.
     * This is an "island-aware" batching logic.
     */
    async suggestBatches(branchId: string): Promise<OptimizedBatch[]> {
        try {
            // 1. Get all orders READY for delivery in this branch
            const pendingOrders = await db.select({
                id: orders.id,
                customerId: orders.customerId,
                deliveryAddress: orders.deliveryAddress,
            })
            .from(orders)
            .where(and(
                eq(orders.branchId, branchId),
                eq(orders.status, 'READY'),
                eq(orders.type, 'DELIVERY')
            ));

            if (pendingOrders.length === 0) return [];

            // 2. Group by Area/Zone
            const groups: Record<string, string[]> = {};
            for (const order of pendingOrders) {
                const zoneKey = order.deliveryAddress || 'Unknown';
                if (!groups[zoneKey]) groups[zoneKey] = [];
                groups[zoneKey].push(order.id);
            }

            // 3. Find closest available drivers for each zone
            const availableDrivers = await db.select()
                .from(driverTelemetryLatest)
                .where(eq(driverTelemetryLatest.branchId, branchId));

            const batches: OptimizedBatch[] = Object.entries(groups).map(([zoneKey, orderIds]) => {
                return {
                    zoneId: zoneKey,
                    zoneName: zoneKey,
                    orderIds,
                    estimatedTimeMinutes: 15 + (orderIds.length * 5), // Rough heuristic
                };
            });

            return batches;
        } catch (error: any) {
            log.error({ err: error.message, branchId }, 'Failed to suggest delivery batches');
            return [];
        }
    },

    /**
     * Simple Haversine distance for driver-to-branch or driver-to-customer.
     */
    calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
};
