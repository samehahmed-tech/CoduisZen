import { create } from 'zustand';
import { apiRequest } from '../services/api/core';
import socketService from '../src/services/socketService';

export type WhatsAppStatusPayload = {
    ok: boolean;
    provider?: string;
    configured?: boolean;
    status: 'INITIALIZING' | 'AWAITING_SCAN' | 'READY' | 'DISCONNECTED' | 'AUTH_ERROR';
    qr?: string;
    bridgeUrl?: string;
    sessionId?: string;
    sessionName?: string;
    queueCount?: number;
    isProcessing?: boolean;
    checkedAt?: string;
    reason?: string;
    lastWebhookAt?: string | null;
    inboxCount?: number;
    openEscalations?: number;
    startedAt?: string | null;
};

export type WhatsAppAutomationConfig = {
    orderCreated: boolean;
    outForDelivery: boolean;
    delivered: boolean;
    feedback: boolean;
    botEnabled: boolean;
    humanHandoffKeywords: string[];
    feedbackDelayMinutes: number;
    quietHoursEnabled: boolean;
    quietHoursFrom: string;
    quietHoursTo: string;
};

interface WhatsAppState {
    statusData: WhatsAppStatusPayload | null;
    inbox: any[];
    escalations: any[];
    automationConfig: WhatsAppAutomationConfig | null;
    isLoading: boolean;
    error: string | null;
    qrCode: string | null;
    fetchStatus: (silent?: boolean) => Promise<void>;
    fetchInbox: () => Promise<void>;
    fetchEscalations: () => Promise<void>;
    fetchAutomationConfig: () => Promise<void>;
    saveAutomationConfig: (config: WhatsAppAutomationConfig) => Promise<boolean>;
    sendCampaign: (targets: string[], text: string, isMarketing?: boolean) => Promise<boolean>;
    sendDirectMessage: (to: string, text: string) => Promise<boolean>;
    restartEngine: () => Promise<void>;
    resetSession: () => Promise<void>;
    subscribeSocket: () => void;
    unsubscribeSocket: () => void;
}

export const useWhatsAppStore = create<WhatsAppState>((set) => ({
    statusData: null,
    inbox: [],
    escalations: [],
    automationConfig: null,
    isLoading: false,
    error: null,
    qrCode: null,

    fetchStatus: async (silent = false) => {
        if (!silent) set({ isLoading: true, error: null });
        try {
            const data = await apiRequest<WhatsAppStatusPayload>('/whatsapp/status');
            set({ 
                statusData: data, 
                isLoading: false,
                qrCode: data.qr || null 
            });
        } catch (err: any) {
            set({ error: err.message, isLoading: false });
        }
    },

    fetchInbox: async () => {
        try {
            const data = await apiRequest<{inbox: any[]}>('/whatsapp/inbox');
            set({ inbox: Array.isArray(data.inbox) ? data.inbox : [] });
        } catch {
            set({ inbox: [] });
        }
    },

    fetchEscalations: async () => {
        try {
            const data = await apiRequest<{escalations: any[]}>('/whatsapp/escalations?status=OPEN');
            set({ escalations: Array.isArray(data.escalations) ? data.escalations : [] });
        } catch {
            set({ escalations: [] });
        }
    },

    fetchAutomationConfig: async () => {
        try {
            const data = await apiRequest<{config: WhatsAppAutomationConfig}>('/whatsapp/automation-config');
            set({ automationConfig: data.config });
        } catch {
            set({ automationConfig: null });
        }
    },

    saveAutomationConfig: async (config) => {
        set({ isLoading: true, error: null });
        try {
            await apiRequest('/whatsapp/automation-config', {
                method: 'PUT',
                body: JSON.stringify({ config }),
            });
            set({ automationConfig: config, isLoading: false });
            return true;
        } catch (err: any) {
            set({ error: err.message, isLoading: false });
            return false;
        }
    },

    sendCampaign: async (targets, text, isMarketing = true) => {
        set({ isLoading: true, error: null });
        try {
            await apiRequest('/whatsapp/campaign', { 
                method: 'POST',
                body: JSON.stringify({ targets, text, isMarketing })
            });
            set({ isLoading: false });
            return true;
        } catch (err: any) {
            set({ error: err.message, isLoading: false });
            return false;
        }
    },

    sendDirectMessage: async (to, text) => {
        set({ isLoading: true, error: null });
        try {
            await apiRequest('/whatsapp/send-test', {
                method: 'POST',
                body: JSON.stringify({ to, text })
            });
            set({ isLoading: false });
            return true;
        } catch (err: any) {
            set({ error: err.message, isLoading: false });
            return false;
        }
    },

    restartEngine: async () => {
        set({ isLoading: true, error: null });
        try {
            await apiRequest('/whatsapp/restart', { method: 'POST' });
            set({ isLoading: false });
            setTimeout(() => {
                useWhatsAppStore.getState().fetchStatus(true);
            }, 1200);
        } catch (err: any) {
            set({ error: err.message, isLoading: false });
        }
    },

    resetSession: async () => {
        set({ isLoading: true, error: null, qrCode: null });
        try {
            await apiRequest('/whatsapp/reset-session', { method: 'POST' });
            set({ isLoading: false });
            setTimeout(() => {
                useWhatsAppStore.getState().fetchStatus(true);
            }, 1200);
        } catch (err: any) {
            set({ error: err.message, isLoading: false });
        }
    },

    subscribeSocket: () => {
        const onStatus = (data: any) => {
            const status = data?.status as WhatsAppStatusPayload['status'] | undefined;
            if (!status) return;
            set((prev) => ({
                statusData: { ...prev.statusData!, ...data, ok: true },
                qrCode: status === 'READY' ? null : (data.qr || prev.qrCode),
                error: status === 'READY' ? null : prev.error,
            }));
            // When status changes, do a full fetch to get counts etc.
            useWhatsAppStore.getState().fetchStatus(true);
        };
        const onQr = (qr: string) => {
            set((prev) => ({
                qrCode: qr,
                statusData: prev.statusData
                    ? { ...prev.statusData, status: 'AWAITING_SCAN', qr }
                    : { ok: true, status: 'AWAITING_SCAN', qr } as WhatsAppStatusPayload,
            }));
        };
        const onQueue = (data: any) => {
            set((prev) => ({
                statusData: prev.statusData ? { ...prev.statusData, queueCount: data?.count ?? prev.statusData.queueCount } : prev.statusData,
            }));
        };
        const onInboxNew = () => {
            useWhatsAppStore.getState().fetchInbox();
            useWhatsAppStore.getState().fetchEscalations();
        };
        socketService.on('whatsapp:status', onStatus);
        socketService.on('whatsapp:qr', onQr);
        socketService.on('whatsapp:queue', onQueue);
        socketService.on('whatsapp:inbox_new', onInboxNew);
        // Store handlers for cleanup
        (useWhatsAppStore as any).__socketHandlers = { onStatus, onQr, onQueue, onInboxNew };
    },

    unsubscribeSocket: () => {
        const handlers = (useWhatsAppStore as any).__socketHandlers;
        if (!handlers) return;
        socketService.off('whatsapp:status', handlers.onStatus);
        socketService.off('whatsapp:qr', handlers.onQr);
        socketService.off('whatsapp:queue', handlers.onQueue);
        socketService.off('whatsapp:inbox_new', handlers.onInboxNew);
        (useWhatsAppStore as any).__socketHandlers = null;
    },
}));
