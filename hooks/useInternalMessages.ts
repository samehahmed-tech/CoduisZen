import { useCallback, useEffect, useMemo, useState } from 'react';
import { mailApi } from '../services/api/mail';
import { socketService } from '../services/socketService';

export interface InternalMessage {
    id: string;
    branchId: string;
    fromId: string;
    fromName: string;
    toId?: string;
    toName?: string;
    subject?: string;
    text: string;
    createdAt: string;
    read: boolean;
    readBy: string[];
}

interface UseInternalMessagesOptions {
    branchId?: string;
    userId?: string;
    userName?: string;
    enabled?: boolean;
}

/**
 * Team inbox — now backed by the server-persisted staff mailbox
 * (mail_messages + mail_message_recipients), replacing the old
 * localStorage-only draft. Same hook interface, so all consumers
 * (header popup, tiles badge) keep working untouched.
 * - Lists what the server stored for me, marks read server-side.
 * - Realtime via socket `mail:new` + 60s unread poll.
 */
export const useInternalMessages = (options: UseInternalMessagesOptions = {}) => {
    const { branchId, userId, enabled = true } = options;
    const [messages, setMessages] = useState<InternalMessage[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!enabled || !userId) return;
        setLoading(true);
        try {
            const [inbox, unread] = await Promise.all([
                mailApi.getInbox().catch(() => [] as any[]),
                mailApi.unreadCount().catch(() => ({ unread: 0 })),
            ]);
            const rows = Array.isArray(inbox) ? inbox : [];
            const mapped: InternalMessage[] = rows.map((m: any) => {
                const isRead = !!m.isRead;
                return {
                    id: String(m.messageId || m.id || ''),
                    branchId: branchId || '',
                    fromId: String(m.senderId || m.sender_id || ''),
                    fromName: String(m.senderName || m.sender_id || m.senderId || '—'),
                    text: String(m.body || ''),
                    subject: String(m.subject || ''),
                    createdAt: String(m.createdAt || m.created_at || new Date().toISOString()),
                    read: isRead,
                    readBy: isRead && userId ? [userId] : [],
                };
            }).filter((m) => m.id);
            setMessages(mapped);
            const serverUnread = Number((unread as any)?.unread);
            setUnreadCount(Number.isFinite(serverUnread)
                ? serverUnread
                : mapped.filter((m) => !m.read && m.fromId !== userId).length);
        } finally {
            setLoading(false);
        }
    }, [branchId, enabled, userId]);

    useEffect(() => {
        if (!enabled || !userId) {
            setMessages([]);
            setUnreadCount(0);
            return;
        }
        refresh();
    }, [enabled, userId, refresh]);

    // Realtime: server pushes `mail:new` to our user room on every send.
    useEffect(() => {
        if (!enabled || !userId) return;
        const handler = () => { refresh(); };
        socketService.on('mail:new', handler);
        const t = window.setInterval(() => { refresh(); }, 60000);
        return () => {
            socketService.off('mail:new', handler);
            window.clearInterval(t);
        };
    }, [enabled, userId, refresh]);

    const send = useCallback(async (text: string, to?: { id: string; name: string }) => {
        const clean = text.trim().slice(0, 20000);
        if (!clean || !userId) return null;
        const subject = clean.split('\n')[0].slice(0, 80) || 'رسالة';
        const res = await mailApi.send({
            toUserIds: to ? [to.id] : [],
            broadcast: to ? undefined : 'BRANCH',
            subject,
            body: clean,
        }).catch((e: any) => {
            throw new Error(e?.message || 'SEND_FAILED');
        });
        await refresh();
        return res;
    }, [refresh, userId]);

    const markAllRead = useCallback(async () => {
        const pending = messages.filter((m) => !m.read);
        if (pending.length === 0) return;
        await Promise.allSettled(pending.map((m) => mailApi.markRead(m.id)));
        await refresh();
    }, [messages, refresh]);

    const remove = useCallback(async (id: string) => {
        await mailApi.archive(id, true).catch(() => {});
        await refresh();
    }, [refresh]);

    // Inbox rows are by definition addressed to me — no extra filtering.
    const visible = useMemo(() => messages, [messages]);

    return { messages: visible, unreadCount, loading, send, markAllRead, remove, refresh };
};

export default useInternalMessages;
