import { create } from 'zustand';
import { AuditLog, AuditEventType } from '../types';
import { auditApi } from '../services/api/audit';
import { localDb } from '../db/localDb';

interface AuditState {
    logs: AuditLog[];
    isLoading: boolean;
    error: string | null;
    fetchLogs: (params?: { event_type?: string; user_id?: string; limit?: number }) => Promise<void>;
    addLog: (log: AuditLog) => void;
    clearLogs: () => void;
}

export const useAuditStore = create<AuditState>((set, get) => ({
    logs: [],
    isLoading: false,
    error: null,

    fetchLogs: async (params) => {
        set({ isLoading: true, error: null });
        try {
            if (navigator.onLine) {
                const data = await auditApi.getAll(params);
                const logs = data.map((l: any) => ({
                    ...l,
                    timestamp: new Date(l.createdAt || l.created_at || l.timestamp),
                    payload: typeof l.payload === 'string' ? JSON.parse(l.payload) : l.payload,
                    before: typeof l.before === 'string' && l.before ? JSON.parse(l.before) : l.before,
                    after: typeof l.after === 'string' && l.after ? JSON.parse(l.after) : l.after,
                }));
                set({ logs, isLoading: false });
                await localDb.auditLogs.bulkPut(logs.map(l => ({ ...l, createdAt: l.timestamp })));
            } else {
                const cached = await localDb.auditLogs.toArray();
                set({ logs: cached as AuditLog[], isLoading: false });
            }
        } catch (error: any) {
            set({ error: error.message, isLoading: false });
        }
    },

    addLog: (log) => set((state) => ({
        logs: [log, ...state.logs]
    })),

    clearLogs: () => set({ logs: [] })
}));
