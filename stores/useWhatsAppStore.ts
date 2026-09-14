import { create } from 'zustand';
import { apiRequest } from '../services/api/core';
import socketService from '../src/services/socketService';

export type WhatsAppStatusPayload = {
    ok: boolean;
    provider?: string;
    configured?: boolean;
    status: 'INITIALIZING' | 'AWAITING_SCAN' | 'AUTHENTICATED' | 'READY' | 'DISCONNECTED' | 'DISABLED' | 'AUTH_ERROR';
    qr?: string;
    qrAt?: string | null;
    authenticatedAt?: string | null;
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
    qrUpdatedAt: string | null;
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

// QR/link poller after restart/reset: puppeteer needs 10-30s to generate the
// first QR, and ready takes another 10-60s after the scan. Poll every 3s
// until READY/DISABLED or ~120s timeout — NEVER stop early just because a QR
// is on screen (that early stop is what stranded the page on a consumed QR
// while the session was still warming up).
let qrPoller: ReturnType<typeof setInterval> | null = null;
const stopQrPoller = () => {
    if (qrPoller) {
        clearInterval(qrPoller);
        qrPoller = null;
    }
};
const startQrPoller = () => {
    stopQrPoller();
    let attempts = 0;
    qrPoller = setInterval(async () => {
        attempts += 1;
        try {
            await useWhatsAppStore.getState().fetchStatus(true);
        } catch { /* keep polling */ }
        const s = useWhatsAppStore.getState();
        if (s.statusData?.status === 'READY' || s.statusData?.status === 'DISABLED') stopQrPoller();
        else if (attempts >= 40) stopQrPoller(); // ~120s timeout
    }, 3000);
};

export const useWhatsAppStore = create<WhatsAppState>((set) => ({
    statusData: null,
    inbox: [],
    escalations: [],
    automationConfig: null,
    isLoading: false,
    error: null,
    qrCode: null,
    qrUpdatedAt: null,

    fetchStatus: async (silent = false) => {
        if (!silent) set({ isLoading: true, error: null });
        try {
            const data = await apiRequest<WhatsAppStatusPayload>('/whatsapp/status');
            set((prev) => {
                // READY and AUTHENTICATED both clear the QR: the code is
                // consumed the moment the phone accepts the scan.
                if (data.status === 'READY' || data.status === 'AUTHENTICATED') {
                    return { statusData: data, isLoading: false, qrCode: null, qrUpdatedAt: null };
                }
                if (data.qr) {
                    return { statusData: data, isLoading: false, qrCode: data.qr, qrUpdatedAt: data.qrAt || new Date().toISOString() };
                }
                // No qr in this poll — NEVER wipe a known-good QR while the
                // engine is still booting or awaiting scan; the poll simply
                // arrived before puppeteer emitted the next QR.
                if (prev.qrCode && (data.status === 'AWAITING_SCAN' || data.status === 'INITIALIZING')) {
                    return { statusData: { ...data, qr: prev.qrCode, qrAt: prev.qrUpdatedAt }, isLoading: false };
                }
                return {
                    statusData: data,
                    isLoading: false,
                    qrCode: null,
                    qrUpdatedAt: null,
                };
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
            startQrPoller();
        } catch (err: any) {
            set({ error: err.message, isLoading: false });
        }
    },

    resetSession: async () => {
        // Keep the old QR visible until the new one arrives — clearing it
        // immediately plus a 1.2s poll (while puppeteer needs 10-30s) is what
        // produced the permanent "no QR" screen.
        set({ isLoading: true, error: null });
        try {
            await apiRequest('/whatsapp/reset-session', { method: 'POST' });
            set({ isLoading: false });
            startQrPoller();
        } catch (err: any) {
            set({ error: err.message, isLoading: false });
        }
    },

    subscribeSocket: () => {
        const onStatus = (data: any) => {
            const status = data?.status as WhatsAppStatusPayload['status'] | undefined;
            if (!status) return;
            if (status === 'READY') stopQrPoller();
            set((prev) => {
                if (status === 'READY' || status === 'AUTHENTICATED') {
                    return {
                        statusData: { ...prev.statusData!, ...data, ok: true, qr: undefined },
                        qrCode: null,
                        qrUpdatedAt: null,
                        error: null,
                    };
                }
                // Socket status carries qr now (server emits it). Preserve a
                // known QR when the event has none and engine is mid-boot.
                const qr = data.qr || ((status === 'AWAITING_SCAN' || status === 'INITIALIZING') ? prev.qrCode : null);
                return {
                    statusData: { ...prev.statusData!, ...data, ok: true, qr: qr || undefined, qrAt: data.qrAt || prev.qrUpdatedAt },
                    qrCode: qr,
                    qrUpdatedAt: data.qr ? (data.qrAt || new Date().toISOString()) : prev.qrUpdatedAt,
                    error: prev.error,
                };
            });
            // Full counters fetch on terminal/transitional states — including
            // AUTHENTICATED so a missed socket event still resolves via poll.
            if (status === 'READY' || status === 'AUTHENTICATED' || status === 'DISCONNECTED' || status === 'AUTH_ERROR' || status === 'DISABLED') {
                useWhatsAppStore.getState().fetchStatus(true);
            }
        };
        const onQr = (qr: string) => {
            stopQrPoller();
            set((prev) => ({
                qrCode: qr,
                qrUpdatedAt: new Date().toISOString(),
                statusData: prev.statusData
                    ? { ...prev.statusData, status: 'AWAITING_SCAN', qr, qrAt: new Date().toISOString() }
                    : { ok: true, status: 'AWAITING_SCAN', qr, qrAt: new Date().toISOString() } as WhatsAppStatusPayload,
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
        // Missed-event safety: if the socket dropped and reconnected (e.g.
        // the READY/AUTHENTICATED burst arrived mid-reconnect), resync once
        // instead of hanging on a stale QR screen.
        const onSocketReconnect = () => {
            useWhatsAppStore.getState().fetchStatus(true);
        };
        socketService.onReconnect(onSocketReconnect);
        // Store handlers for cleanup
        (useWhatsAppStore as any).__socketHandlers = { onStatus, onQr, onQueue, onInboxNew, onSocketReconnect };
    },

    unsubscribeSocket: () => {
        stopQrPoller();
        const handlers = (useWhatsAppStore as any).__socketHandlers;
        if (!handlers) return;
        socketService.off('whatsapp:status', handlers.onStatus);
        socketService.off('whatsapp:qr', handlers.onQr);
        socketService.off('whatsapp:queue', handlers.onQueue);
        socketService.off('whatsapp:inbox_new', handlers.onInboxNew);
        if (handlers.onSocketReconnect) socketService.offReconnect(handlers.onSocketReconnect);
        (useWhatsAppStore as any).__socketHandlers = null;
    },
}));
