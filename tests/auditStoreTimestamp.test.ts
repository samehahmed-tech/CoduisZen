import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditEventType } from '../types';

vi.mock('../services/api/audit', () => ({
    auditApi: {
        getAll: vi.fn(),
    },
}));

vi.mock('../db/localDb', () => ({
    localDb: {
        auditLogs: {
            bulkPut: vi.fn(),
            toArray: vi.fn(),
        },
    },
}));

import { auditApi } from '../services/api/audit';
import { useAuditStore } from '../stores/useAuditStore';

describe('audit store timestamps', () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, 'navigator', {
            value: { onLine: true },
            configurable: true,
        });
        useAuditStore.setState({ logs: [], isLoading: false, error: null });
        vi.clearAllMocks();
    });

    it('accepts server camelCase createdAt timestamps', async () => {
        vi.mocked(auditApi.getAll).mockResolvedValueOnce([
            {
                id: 'audit-1',
                eventType: AuditEventType.POS_PAYMENT,
                userId: 'user-1',
                userName: 'Cashier',
                userRole: 'cashier',
                branchId: 'branch-1',
                deviceId: 'pos-1',
                payload: { after: { total: 120 } },
                createdAt: '2026-06-29T10:15:00.000Z',
            },
        ]);

        await useAuditStore.getState().fetchLogs({ limit: 1 });

        expect(useAuditStore.getState().logs[0].timestamp.toISOString()).toBe('2026-06-29T10:15:00.000Z');
    });
});
