import { eventBus } from './eventBus';
import { AuditEventType, AuditLog } from '../types';
import { aiApi } from './api/ai';
import { useOrderStore } from '../stores/useOrderStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useAuthStore } from '../stores/useAuthStore';

class AIIntelligenceService {
    private lastAnalysisTime: number = 0;
    private analysisInterval: number = 1000 * 60 * 15; // 15 minutes
    private orderAccumulator: any[] = [];
    private maxAccumulatorSize: number = 20;

    init() {
        // Listen to order placements to gather context
        eventBus.on(AuditEventType.POS_ORDER_PLACEMENT, (payload) => {
            this.handleNewOrder(payload);
        });
    }

    private handleNewOrder(payload: any) {
        this.orderAccumulator.push(payload.order);
        if (this.orderAccumulator.length > this.maxAccumulatorSize) {
            this.orderAccumulator.shift();
        }

        // Periodically trigger a deep analysis if enough time has passed
        const now = Date.now();
        if (now - this.lastAnalysisTime > this.analysisInterval) {
            this.runOperationalAnalysis();
            this.lastAnalysisTime = now;
        }
    }

    private async runOperationalAnalysis() {
        const { inventory } = useInventoryStore.getState();
        const { settings } = useAuthStore.getState();
        const lang = settings.language || 'en';

        try {
            // 1. Forecast Inventory
            const forecast = await aiApi.chat({
                message: lang === 'ar'
                    ? 'حلل المخزون الحالي والطلبات الأخيرة وحدد العناصر المعرضة للنفاد قريبًا.'
                    : 'Analyze current inventory and recent orders, and identify items at risk of stockout.',
                lang,
                context: {
                    inventory,
                    orders: this.orderAccumulator,
                },
            });

            eventBus.emit(AuditEventType.AI_INSIGHT_GENERATED, {
                type: 'INVENTORY_FORECAST',
                insight: forecast.text,
                timestamp: new Date()
            });

            // 2. Anomaly Detection (Simple logic for now)
            this.detectAnomalies(this.orderAccumulator);

        } catch (error) {}
    }

    private detectAnomalies(recentOrders: any[]) {
        // Detect unusual void patterns or high discounts
        const voidPatterns = recentOrders.filter(o => o.status === 'CANCELLED');
        if (voidPatterns.length > recentOrders.length * 0.3) {
            eventBus.emit(AuditEventType.AI_ANOMALY_DETECTED, {
                type: 'HIGH_VOID_RATE',
                message: 'Unusual volume of cancelled orders detected in the last hour.',
                timestamp: new Date()
            });
        }
    }
}

export const aiIntelligenceService = new AIIntelligenceService();
