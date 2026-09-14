import { apiRequest } from './core';

export interface MailRecipient {
    userId: string;
    userName?: string;
    isRead?: boolean;
    readAt?: string | null;
}

export interface SendMailPayload {
    toUserIds?: string[];
    broadcast?: 'BRANCH' | 'ALL';
    subject: string;
    body: string;
    priority?: string;
    replyToMessageId?: string;
    replyAll?: boolean;
}

export interface InboxMail {
    messageId: string;
    subject: string;
    body: string;
    priority?: string;
    isBroadcast?: boolean;
    broadcastScope?: string | null;
    replyToMessageId?: string | null;
    senderId: string;
    senderName?: string;
    createdAt: string;
    isRead?: boolean;
    readAt?: string | null;
    isStarred?: boolean;
    isArchived?: boolean;
}

export const mailApi = {
    getInbox: (includeArchived = false) =>
        apiRequest<InboxMail[]>(`/mail/inbox${includeArchived ? '?includeArchived=true' : ''}`),
    getSent: () => apiRequest<any[]>('/mail/sent'),
    getMessage: (id: string) => apiRequest<any>(`/mail/message/${id}`),
    getThread: (id: string) => apiRequest<{ rootId: string; thread: any[] }>(`/mail/thread/${id}`),
    send: (data: SendMailPayload) =>
        apiRequest<{ success: boolean; id: string; recipientCount: number }>('/mail/send', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    reply: (messageId: string, body: string, opts?: { replyAll?: boolean; priority?: string }) =>
        apiRequest<{ success: boolean; id: string; recipientCount: number }>('/mail/send', {
            method: 'POST',
            // الموضوع يُشتق تلقائياً في الخادم (Re: ...) لو لم يُرسل
            body: JSON.stringify({ body, replyToMessageId: messageId, replyAll: opts?.replyAll, priority: opts?.priority, subject: '' }),
        }),
    markRead: (id: string) => apiRequest<{ success: boolean }>(`/mail/${id}/read`, { method: 'POST' }),
    toggleStar: (id: string, starred?: boolean) =>
        apiRequest<{ success: boolean; starred: boolean }>(`/mail/${id}/star`, {
            method: 'POST',
            body: JSON.stringify(starred === undefined ? {} : { starred }),
        }),
    archive: (id: string, archived?: boolean) =>
        apiRequest<{ success: boolean; archived: boolean }>(`/mail/${id}/archive`, {
            method: 'POST',
            body: JSON.stringify(archived === undefined ? {} : { archived }),
        }),
    unreadCount: () => apiRequest<{ unread: number }>('/mail/unread-count'),
    directory: () => apiRequest<Array<{ id: string; name: string; role: string; branchId?: string | null }>>('/mail/directory'),
    deleteSent: (id: string) => apiRequest<{ success: boolean }>(`/mail/sent/${id}`, { method: 'DELETE' }),
};
