import { create } from 'zustand';
import { mailApi, InboxMail, SendMailPayload } from '../services/api/mail';
import { socketService } from '../services/socketService';

interface MailState {
    inbox: InboxMail[];
    sent: any[];
    directory: Array<{ id: string; name: string; role: string; branchId?: string | null }>;
    unread: number;
    isLoading: boolean;
    error: string | null;
    fetchInbox: (includeArchived?: boolean) => Promise<void>;
    fetchSent: () => Promise<void>;
    fetchDirectory: () => Promise<void>;
    fetchUnread: () => Promise<void>;
    sendMail: (data: SendMailPayload) => Promise<any>;
    replyMail: (messageId: string, body: string, opts?: { replyAll?: boolean; priority?: string }) => Promise<any>;
    fetchThread: (id: string) => Promise<{ rootId: string; thread: any[] }>;
    openMessage: (id: string) => Promise<any>;
    toggleStar: (id: string) => Promise<void>;
    archiveMessage: (id: string, archived?: boolean) => Promise<void>;
    deleteSent: (id: string) => Promise<void>;
    subscribeLive: (onNew?: (msg: any) => void) => () => void;
    clearError: () => void;
}

export const useMailStore = create<MailState>((set, get) => ({
    inbox: [],
    sent: [],
    directory: [],
    unread: 0,
    isLoading: false,
    error: null,

    fetchInbox: async (includeArchived = false) => {
        set({ isLoading: get().inbox.length === 0, error: null });
        try {
            const data = await mailApi.getInbox(includeArchived);
            set({ inbox: Array.isArray(data) ? data : [], isLoading: false });
        } catch (e: any) {
            set({ error: e.message || 'MAIL_INBOX_FAILED', isLoading: false });
        }
    },

    fetchSent: async () => {
        try {
            const data = await mailApi.getSent();
            set({ sent: Array.isArray(data) ? data : [] });
        } catch (e: any) {
            set({ error: e.message || 'MAIL_SENT_FAILED' });
        }
    },

    fetchDirectory: async () => {
        try {
            const data = await mailApi.directory();
            set({ directory: Array.isArray(data) ? data : [] });
        } catch {
            set({ directory: [] });
        }
    },

    fetchUnread: async () => {
        try {
            const data = await mailApi.unreadCount();
            set({ unread: Number(data?.unread || 0) });
        } catch {
            /* badge stays stale — non-blocking */
        }
    },

    sendMail: async (data) => {
        try {
            const res = await mailApi.send(data);
            await get().fetchSent().catch(() => {});
            return res;
        } catch (e: any) {
            set({ error: e.message });
            throw e;
        }
    },

    replyMail: async (messageId, body, opts) => {
        try {
            const res = await mailApi.reply(messageId, body, opts);
            await Promise.all([get().fetchSent().catch(() => {}), get().fetchInbox(true).catch(() => {})]);
            return res;
        } catch (e: any) {
            set({ error: e.message });
            throw e;
        }
    },

    fetchThread: async (id) => {
        const res = await mailApi.getThread(id);
        return res;
    },

    openMessage: async (id) => {
        const detail = await mailApi.getMessage(id);
        // Mark read locally once the detail is opened
        try { await mailApi.markRead(id); } catch { /* keep readable */ }
        set((state) => ({
            inbox: state.inbox.map((m) => m.messageId === id ? { ...m, isRead: true } : m),
            unread: Math.max(0, state.unread - (state.inbox.find((m) => m.messageId === id && !m.isRead) ? 1 : 0)),
        }));
        return detail;
    },

    toggleStar: async (id) => {
        const current = get().inbox.find((m) => m.messageId === id);
        const res = await mailApi.toggleStar(id);
        set((state) => ({
            inbox: state.inbox.map((m) => m.messageId === id ? { ...m, isStarred: res.starred } : m),
        }));
        void current;
    },

    archiveMessage: async (id, archived) => {
        const res = await mailApi.archive(id, archived);
        set((state) => ({
            inbox: archived === false
                ? state.inbox
                : state.inbox.filter((m) => m.messageId !== id),
        }));
        void res;
        await get().fetchInbox(true).catch(() => {});
    },

    deleteSent: async (id) => {
        await mailApi.deleteSent(id);
        set((state) => ({ sent: state.sent.filter((m: any) => String(m.id) !== String(id)) }));
    },

    subscribeLive: (onNew) => {
        const handler = (msg: any) => {
            get().fetchInbox().catch(() => {});
            get().fetchUnread().catch(() => {});
            if (onNew) onNew(msg);
        };
        socketService.on('mail:new', handler);
        return () => socketService.off('mail:new', handler);
    },

    clearError: () => set({ error: null }),
}));
