import { eventBus } from './eventBus';
import { AuditEventType, AuditLog } from '../types';
import { auditApi } from './api/audit';
import { useAuthStore } from '../stores/useAuthStore';
import { syncService } from './syncService';

class AuditService {
    init() {
        // Subscribe to all audit event types
        Object.values(AuditEventType).forEach(eventType => {
            eventBus.on(eventType, (payload) => this.recordEvent(eventType, payload));
        });
    }

    private async recordEvent(eventType: AuditEventType, payload: any) {
        const { settings } = useAuthStore.getState();
        const user = settings.currentUser;

        const logEntry: Omit<AuditLog, 'id' | 'timestamp'> = {
            eventType,
            userId: user?.id || 'system',
            userName: user?.name || 'System',
            userRole: user?.role || 'SYSTEM',
            branchId: settings.activeBranchId || 'central',
            deviceId: 'browser-client', // Should detect device ID
            payload: {
                before: payload.before,
                after: payload.after || payload.order || payload,
                reason: payload.reason
            },
            metadata: payload.metadata
        };

        // Create the full log with ID and timestamp
        const finalLog: AuditLog = {
            ...logEntry,
            id: `LOG-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            timestamp: new Date(),
        };

        try {
            await auditApi.create(finalLog);
        } catch (error) {
            syncService.queue('auditLog', 'CREATE', finalLog).catch(() => undefined);
        }
    }
}

export const auditService = new AuditService();
