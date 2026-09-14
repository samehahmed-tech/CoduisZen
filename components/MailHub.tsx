import React, { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
    Inbox, Send, Star, Archive, PenSquare, Search, X, Trash2,
    CheckCheck, Megaphone, Users, User, ChevronLeft, AlertTriangle, RefreshCw,
    Reply, ReplyAll, MessageCircle, CornerUpLeft,
} from 'lucide-react';
import { useMailStore } from '@/stores/useMailStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { mailApi } from '@/services/api/mail';
import { useConfirm } from '@/components/common/ConfirmProvider';
import { useToast } from '@/components/Toast';
import PageSkeleton from '@/components/common/PageSkeleton';

type Folder = 'inbox' | 'starred' | 'sent' | 'archived';

const PRIORITY_META: Record<string, { ar: string; en: string; badge: string }> = {
    URGENT: { ar: 'عاجلة', en: 'Urgent', badge: 'text-rose-500 bg-rose-500/10 border-rose-500/30' },
    HIGH: { ar: 'مهمة', en: 'High', badge: 'text-orange-500 bg-orange-500/10 border-orange-500/30' },
    NORMAL: { ar: 'عادية', en: 'Normal', badge: 'text-slate-500 bg-slate-500/10 border-slate-500/25' },
    LOW: { ar: 'منخفضة', en: 'Low', badge: 'text-slate-500 bg-slate-500/10 border-slate-500/25' },
};

const BROADCAST_ROLES = new Set(['SUPER_ADMIN', 'OWNER', 'GENERAL_MANAGER', 'BRANCH_MANAGER']);

const fmtDate = (value: any, lang: string) => {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        });
    } catch { return '—'; }
};

const inputCls = 'w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold';
const labelCls = 'text-[10px] font-black text-slate-400 uppercase ml-1';

const MailHub: React.FC = () => {
    const { settings } = useAuthStore(useShallow((s) => ({ settings: s.settings })));
    const lang = settings.language === 'ar' ? 'ar' : 'en';
    const myRole = String((settings.currentUser as any)?.role || '');
    const myId = String((settings.currentUser as any)?.id || '');
    const canBroadcastAll = BROADCAST_ROLES.has(myRole);
    const { confirm } = useConfirm();
    const toast = useToast();

    const {
        inbox, sent, directory, unread,
        fetchInbox, fetchSent, fetchDirectory, fetchUnread, subscribeLive,
        openMessage, toggleStar, archiveMessage, deleteSent, sendMail,
    } = useMailStore(useShallow((s) => ({
        inbox: s.inbox, sent: s.sent, directory: s.directory, unread: s.unread,
        fetchInbox: s.fetchInbox, fetchSent: s.fetchSent, fetchDirectory: s.fetchDirectory,
        fetchUnread: s.fetchUnread, subscribeLive: s.subscribeLive,
        openMessage: s.openMessage, toggleStar: s.toggleStar,
        archiveMessage: s.archiveMessage, deleteSent: s.deleteSent, sendMail: s.sendMail,
    })));

    const [folder, setFolder] = useState<Folder>('inbox');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<any | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [showCompose, setShowCompose] = useState(false);
    const [replyPrefill, setReplyPrefill] = useState<{ messageId: string; replyAll: boolean; subject: string; toHint: string } | null>(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                await Promise.all([
                    fetchInbox(true).catch(() => {}),
                    fetchSent().catch(() => {}),
                    fetchDirectory().catch(() => {}),
                    fetchUnread().catch(() => {}),
                ]);
            } finally {
                setLoading(false);
            }
        })();
        const off = subscribeLive((msg: any) => {
            toast.info(lang === 'ar' ? `📬 بريد جديد: ${msg?.subject || ''}` : `📬 New mail: ${msg?.subject || ''}`);
        });
        const t = window.setInterval(() => fetchUnread().catch(() => {}), 60000);
        return () => { off(); window.clearInterval(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const visibleInbox = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (inbox || [])
            .filter((m) => (folder === 'inbox' ? !m.isArchived : folder === 'starred' ? m.isStarred && !m.isArchived : folder === 'archived' ? m.isArchived : true))
            .filter((m) => {
                if (!q) return true;
                return `${m.subject} ${m.body} ${m.senderName || ''}`.toLowerCase().includes(q);
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [inbox, folder, search]);

    const visibleSent = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (sent || [])
            .filter((m: any) => !q || `${m.subject} ${m.body}`.toLowerCase().includes(q))
            .sort((a: any, b: any) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime());
    }, [sent, search]);

    const openDetail = async (id: string, fromSent: boolean) => {
        setSelectedId(id);
        setDetailLoading(true);
        try {
            const d = fromSent ? await mailApi.getMessage(id) : await openMessage(id);
            setDetail({ ...d, _fromSent: fromSent });
        } catch {
            toast.error(lang === 'ar' ? 'تعذر فتح الرسالة' : 'Could not open message');
            setSelectedId(null);
        } finally {
            setDetailLoading(false);
        }
    };

    const folders: Array<{ key: Folder; label: string; icon: any; count?: number }> = [
        { key: 'inbox', label: lang === 'ar' ? 'الوارد' : 'Inbox', icon: Inbox, count: unread },
        { key: 'starred', label: lang === 'ar' ? 'المميزة' : 'Starred', icon: Star },
        { key: 'sent', label: lang === 'ar' ? 'المرسلة' : 'Sent', icon: Send },
        { key: 'archived', label: lang === 'ar' ? 'الأرشيف' : 'Archive', icon: Archive },
    ];

    if (loading && inbox.length === 0 && sent.length === 0) return <PageSkeleton type="table" rows={6} />;

    const list = folder === 'sent' ? null : visibleInbox;

    return (
        <div className="px-4 md:px-8 lg:px-10 py-6 max-w-7xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg">
                        <Inbox size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-black text-main tracking-tight">
                            {lang === 'ar' ? 'البريد الداخلي' : 'Staff Mail'}
                        </h1>
                        <p className="text-[11px] font-bold text-muted">
                            {lang === 'ar' ? 'راسل زملاءك أو فرعك أو الجميع — محفوظ ويصل لحظياً' : 'Message colleagues, your branch, or everyone — saved and instant'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => { fetchInbox(true); fetchSent(); fetchUnread(); }}
                        className="p-2.5 rounded-xl border border-border text-muted hover:text-main transition-colors"
                        title={lang === 'ar' ? 'تحديث' : 'Refresh'}
                    >
                        <RefreshCw size={18} />
                    </button>
                    <button
                        onClick={() => { setReplyPrefill(null); setShowCompose(true); }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black shadow-lg transition-all active:scale-95"
                    >
                        <PenSquare size={18} />
                        {lang === 'ar' ? 'رسالة جديدة' : 'Compose'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_1.4fr] gap-4">
                {/* Folders */}
                <div className="flex lg:flex-col gap-1.5 p-2 rounded-2xl border border-border bg-card/60 overflow-x-auto">
                    {folders.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => { setFolder(f.key); setSelectedId(null); setDetail(null); }}
                            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-black whitespace-nowrap transition-all ${folder === f.key ? 'bg-indigo-600 text-white shadow' : 'text-muted hover:text-main hover:bg-slate-500/10'}`}
                        >
                            <f.icon size={16} />
                            {f.label}
                            {!!f.count && (
                                <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
                                    {f.count > 99 ? '99+' : f.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* List */}
                <div className="rounded-2xl border border-border bg-card/60 overflow-hidden flex flex-col min-h-[420px] max-h-[72vh]">
                    <div className="p-3 border-b border-border/60">
                        <div className="relative">
                            <Search size={16} className="absolute top-1/2 -translate-y-1/2 right-3 text-muted" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={lang === 'ar' ? 'بحث...' : 'Search...'}
                                className="w-full pl-4 pr-9 py-2.5 rounded-xl border border-border bg-card text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-border/40">
                        {folder === 'sent' ? (
                            visibleSent.length === 0 ? (
                                <EmptyState lang={lang} />
                            ) : visibleSent.map((m: any) => (
                                <button
                                    key={m.id}
                                    onClick={() => openDetail(String(m.id), true)}
                                    className={`w-full text-right p-3.5 hover:bg-slate-500/5 transition-colors ${selectedId === String(m.id) ? 'bg-indigo-500/10' : ''}`}
                                >
                                    <MailRowTitle
                                        subject={m.subject} snippet={m.body}
                                        date={m.created_at || m.createdAt} lang={lang}
                                        unread={false} starred={false}
                                        meta={`${m.recipient_count ?? '?'} ${lang === 'ar' ? 'مستلم' : 'recipients'} • ${m.read_count ?? 0} ${lang === 'ar' ? 'قرأ' : 'read'}`}
                                        priority={m.priority}
                                        broadcast={m.is_broadcast || m.isBroadcast}
                                        isReply={!!(m.reply_to_message_id || m.replyToMessageId)}
                                    />
                                </button>
                            ))
                        ) : list!.length === 0 ? (
                            <EmptyState lang={lang} />
                        ) : list!.map((m) => (
                            <div
                                key={m.messageId}
                                className={`w-full text-right p-3.5 hover:bg-slate-500/5 transition-colors flex items-start gap-2 ${selectedId === m.messageId ? 'bg-indigo-500/10' : ''} ${!m.isRead ? 'bg-indigo-500/[0.04]' : ''}`}
                            >
                                <button onClick={() => openDetail(m.messageId, false)} className="flex-1 min-w-0 text-right">
                                    <MailRowTitle
                                        subject={m.subject} snippet={m.body}
                                        date={m.createdAt} lang={lang}
                                        unread={!m.isRead} starred={!!m.isStarred}
                                        meta={m.senderName || ''}
                                        priority={m.priority}
                                        broadcast={m.isBroadcast}
                                        isReply={!!(m as any).replyToMessageId}
                                    />
                                </button>
                                <div className="flex flex-col gap-1 shrink-0">
                                    <IconBtn title={m.isStarred ? 'Unstar' : 'Star'} onClick={() => toggleStar(m.messageId)}>
                                        <Star size={15} className={m.isStarred ? 'fill-amber-400 text-amber-400' : ''} />
                                    </IconBtn>
                                    <IconBtn title={lang === 'ar' ? 'أرشفة' : 'Archive'} onClick={() => archiveMessage(m.messageId, !m.isArchived)}>
                                        <Archive size={15} />
                                    </IconBtn>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Reading pane */}
                <div className="rounded-2xl border border-border bg-card/60 overflow-hidden min-h-[420px] max-h-[72vh] flex flex-col">
                    {detailLoading ? (
                        <div className="flex-1 flex items-center justify-center text-muted text-sm font-bold">
                            {lang === 'ar' ? 'جارٍ الفتح...' : 'Opening...'}
                        </div>
                    ) : !detail ? (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-40 gap-2">
                            <Inbox size={40} className="text-muted" />
                            <p className="font-black text-muted text-sm">{lang === 'ar' ? 'اختر رسالة للقراءة' : 'Select a message to read'}</p>
                        </div>
                    ) : (
                        <MessagePane
                            lang={lang} detail={detail} myId={myId}
                            onRefresh={async () => {
                                try {
                                    const d = await mailApi.getMessage(String(detail.id || detail.messageId));
                                    setDetail({ ...d, _fromSent: detail._fromSent });
                                } catch { /* keep old */ }
                                fetchInbox(true); fetchSent();
                            }}
                            onComposeReply={(replyAll) => {
                                const msgId = String(detail.id || detail.messageId);
                                const subj = String(detail.subject || '');
                                setReplyPrefill({
                                    messageId: msgId,
                                    replyAll,
                                    subject: /^re:/i.test(subj) ? subj : `Re: ${subj}`,
                                    toHint: replyAll
                                        ? (lang === 'ar' ? 'المرسل + كل المستلمين' : 'Sender + all recipients')
                                        : String(detail.senderName || detail.sender_id || detail.senderId || ''),
                                });
                                setShowCompose(true);
                            }}
                            onDelete={async () => {
                                const ok = await confirm({
                                    title: lang === 'ar' ? 'حذف الرسالة' : 'Delete message',
                                    message: lang === 'ar' ? 'حذف نهائي للجميع؟' : 'Delete permanently for everyone?',
                                    confirmText: lang === 'ar' ? 'حذف' : 'Delete',
                                    cancelText: lang === 'ar' ? 'تراجع' : 'Back',
                                    variant: 'danger',
                                });
                                if (!ok) return;
                                try {
                                    await deleteSent(String(detail.id));
                                    setDetail(null); setSelectedId(null);
                                    toast.success(lang === 'ar' ? 'تم الحذف' : 'Deleted');
                                } catch {
                                    toast.error(lang === 'ar' ? 'فشل الحذف' : 'Delete failed');
                                }
                            }}
                        />
                    )}
                </div>
            </div>

            {showCompose && (
                <ComposeModal
                    lang={lang} directory={directory} canBroadcastAll={canBroadcastAll}
                    replyPrefill={replyPrefill}
                    onClose={() => { setShowCompose(false); setReplyPrefill(null); }}
                    onSend={async (payload) => {
                        try {
                            const res = replyPrefill
                                ? await sendMail({ subject: payload.subject, body: payload.body, priority: payload.priority, replyToMessageId: replyPrefill.messageId, replyAll: replyPrefill.replyAll })
                                : await sendMail(payload);
                            toast.success(lang === 'ar' ? (replyPrefill ? `تم إرسال الرد إلى ${res.recipientCount} مستلم` : `تم الإرسال إلى ${res.recipientCount} مستلم`) : (replyPrefill ? `Reply sent to ${res.recipientCount} recipients` : `Sent to ${res.recipientCount} recipients`));
                            setShowCompose(false);
                            setReplyPrefill(null);
                            fetchInbox(true); fetchSent();
                            // Refresh open detail to show the new reply in thread
                            if (replyPrefill && selectedId) {
                                try {
                                    const d = await mailApi.getMessage(selectedId);
                                    setDetail({ ...d, _fromSent: detail?._fromSent });
                                } catch { /* ignore */ }
                            }
                        } catch (e: any) {
                            toast.error(String(e?.message || (lang === 'ar' ? 'فشل الإرسال' : 'Send failed')));
                        }
                    }}
                />
            )}
        </div>
    );
};

const IconBtn: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
    <button title={title} onClick={(e) => { e.stopPropagation(); onClick(); }} className="p-1.5 rounded-lg text-muted hover:text-main hover:bg-slate-500/10 transition-colors">
        {children}
    </button>
);

const EmptyState: React.FC<{ lang: string }> = ({ lang }) => (
    <div className="flex flex-col items-center justify-center py-16 opacity-40 gap-2">
        <Inbox size={36} className="text-muted" />
        <p className="font-black text-muted text-sm">{lang === 'ar' ? 'لا رسائل هنا' : 'Nothing here'}</p>
    </div>
);

const MailRowTitle: React.FC<{
    subject: string; snippet: string; date: any; lang: string;
    unread: boolean; starred: boolean; meta: string; priority?: string; broadcast?: boolean; isReply?: boolean;
}> = ({ subject, snippet, date, lang, unread, starred, meta, priority, broadcast, isReply }) => (
    <span className="block min-w-0">
        <span className="flex items-center gap-2">
            {unread && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
            {isReply && <CornerUpLeft size={12} className="text-indigo-400 shrink-0" />}
            <span className={`truncate text-sm ${unread ? 'font-black text-main' : 'font-bold text-main/80'}`}>{subject}</span>
            {starred && <Star size={12} className="fill-amber-400 text-amber-400 shrink-0" />}
        </span>
        <span className="block truncate text-xs text-muted mt-0.5">{String(snippet || '').slice(0, 90)}</span>
        <span className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="text-[10px] font-bold text-muted">{meta} • {fmtDate(date, lang)}</span>
            {priority && priority !== 'NORMAL' && (
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${PRIORITY_META[priority]?.badge || ''}`}>{PRIORITY_META[priority]?.[lang as 'ar' | 'en'] || priority}</span>
            )}
            {broadcast && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded border text-cyan-500 bg-cyan-500/10 border-cyan-500/30 flex items-center gap-1">
                    <Megaphone size={9} />{lang === 'ar' ? 'بث' : 'Cast'}
                </span>
            )}
        </span>
    </span>
);

const MessagePane: React.FC<{ lang: string; detail: any; myId: string; onDelete: () => void; onRefresh: () => void; onComposeReply: (replyAll: boolean) => void }> = ({ lang, detail, myId, onDelete, onRefresh, onComposeReply }) => {
    const fromSent = !!detail._fromSent;
    const recipients: any[] = Array.isArray(detail.recipients) ? detail.recipients : [];
    const readCount = recipients.filter((r: any) => r.isRead).length;
    const isBroadcast = !!(detail.is_broadcast || detail.isBroadcast);
    const canReply = !fromSent || (detail.replyToMessageId || detail.reply_to_message_id);
    const replyParent = detail.replyParent || null;
    const replies: any[] = Array.isArray(detail.replies) ? detail.replies : [];
    const [quickBody, setQuickBody] = useState('');
    const [quickAll, setQuickAll] = useState(false);
    const [quickSending, setQuickSending] = useState(false);
    const [thread, setThread] = useState<any[] | null>(null);
    const [threadLoading, setThreadLoading] = useState(false);
    const toast = useToast();
    const { replyMail } = useMailStore(useShallow((s) => ({ replyMail: s.replyMail })));

    useEffect(() => {
        setQuickBody('');
        setQuickAll(false);
        setThread(null);
    }, [detail?.id, detail?.messageId]);

    const loadThread = async () => {
        const id = String(detail.id || detail.messageId);
        setThreadLoading(true);
        try {
            const res = await mailApi.getThread(id);
            setThread(Array.isArray(res.thread) ? res.thread : []);
        } catch {
            toast.error(lang === 'ar' ? 'تعذر تحميل المحادثة' : 'Could not load thread');
        } finally {
            setThreadLoading(false);
        }
    };

    const sendQuickReply = async () => {
        const text = quickBody.trim();
        if (!text || quickSending) return;
        setQuickSending(true);
        try {
            const res = await replyMail(String(detail.id || detail.messageId), text, { replyAll: quickAll });
            toast.success(lang === 'ar' ? `تم إرسال الرد إلى ${res.recipientCount} مستلم` : `Reply sent to ${res.recipientCount} recipients`);
            setQuickBody('');
            setThread(null);
            onRefresh();
        } catch (e: any) {
            toast.error(String(e?.message || (lang === 'ar' ? 'فشل إرسال الرد' : 'Reply failed')));
        } finally {
            setQuickSending(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-5 flex flex-col">
            <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-black text-main leading-snug">{detail.subject}</h2>
                {fromSent && (
                    <button onClick={onDelete} className="p-2 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 shrink-0" title={lang === 'ar' ? 'حذف للجميع' : 'Delete for all'}>
                        <Trash2 size={16} />
                    </button>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-bold text-muted">
                <span className="flex items-center gap-1"><User size={11} />{detail.senderName || detail.sender_id || detail.senderId}</span>
                <span>•</span><span>{fmtDate(detail.created_at || detail.createdAt, lang)}</span>
                {detail.priority && detail.priority !== 'NORMAL' && (
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${PRIORITY_META[detail.priority]?.badge || ''}`}>{PRIORITY_META[detail.priority]?.[lang as 'ar' | 'en']}</span>
                )}
                {isBroadcast && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded border text-cyan-500 bg-cyan-500/10 border-cyan-500/30 flex items-center gap-1">
                        <Megaphone size={9} />{detail.broadcast_scope || detail.broadcastScope || ''}
                    </span>
                )}
                {(detail.replyToMessageId || detail.reply_to_message_id) && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded border text-indigo-500 bg-indigo-500/10 border-indigo-500/30 flex items-center gap-1">
                        <CornerUpLeft size={9} />{lang === 'ar' ? 'رد' : 'Reply'}
                    </span>
                )}
            </div>
            {replyParent && (
                <div className="mt-3 rounded-xl border border-indigo-500/25 bg-indigo-500/[0.06] px-3 py-2.5 text-xs">
                    <p className="font-black text-indigo-500 flex items-center gap-1.5 text-[11px]">
                        <CornerUpLeft size={12} />
                        {lang === 'ar' ? `رد على: ${replyParent.subject || ''}` : `In reply to: ${replyParent.subject || ''}`}
                    </p>
                    <p className="mt-1 text-muted font-bold leading-6 line-clamp-2">{String(replyParent.body || '').slice(0, 220)}</p>
                </div>
            )}
            <div className="mt-4 text-sm leading-7 text-main/90 whitespace-pre-wrap font-medium">{detail.body}</div>

            {/* Thread: replies */}
            {(replies.length > 0 || thread) && (
                <div className="mt-5">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-black text-muted flex items-center gap-1.5">
                            <MessageCircle size={13} />
                            {lang === 'ar' ? `الردود (${thread ? thread.length - 1 : replies.length})` : `Replies (${thread ? thread.length - 1 : replies.length})`}
                        </p>
                        {!thread && (
                            <button onClick={loadThread} disabled={threadLoading} className="text-[11px] font-black text-indigo-500 hover:underline disabled:opacity-50">
                                {threadLoading ? (lang === 'ar' ? 'جارٍ التحميل...' : 'Loading...') : (lang === 'ar' ? 'عرض المحادثة كاملة' : 'View full thread')}
                            </button>
                        )}
                    </div>
                    <div className="space-y-2">
                        {(thread || replies).map((r: any) => {
                            const rid = String(r.id || r.messageId);
                            const isMe = String(r.senderId || r.sender_id) === String(myId);
                            // Skip anchor itself in full-thread mode
                            if (thread && rid === String(detail.id || detail.messageId)) return null;
                            return (
                                <div key={rid} className={`rounded-xl border px-3 py-2.5 text-xs ${isMe ? 'border-indigo-500/25 bg-indigo-500/[0.05]' : 'border-border bg-slate-500/[0.04]'}`}>
                                    <div className="flex items-center gap-2 text-[10px] font-black text-muted">
                                        <span className="text-main">{r.senderName || r.sender_id || r.senderId}</span>
                                        <span>•</span><span>{fmtDate(r.created_at || r.createdAt, lang)}</span>
                                        {isMe && <span className="text-indigo-500">• {lang === 'ar' ? 'أنت' : 'You'}</span>}
                                    </div>
                                    <p className="mt-1 font-bold text-main/90 leading-6 whitespace-pre-wrap">{r.body}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {fromSent && recipients.length > 0 && (
                <div className="mt-5 rounded-xl border border-border overflow-hidden">
                    <div className="px-3 py-2 bg-slate-500/5 text-[11px] font-black text-muted flex items-center gap-1.5">
                        <CheckCheck size={13} />
                        {lang === 'ar' ? `القراءة: ${readCount} من ${recipients.length}` : `Read: ${readCount} of ${recipients.length}`}
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-border/40">
                        {recipients.map((r: any) => (
                            <div key={r.userId} className="flex items-center gap-2 px-3 py-2 text-xs font-bold">
                                <span className={`w-2 h-2 rounded-full ${r.isRead ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                <span className="text-main flex-1 truncate">{r.userName || r.userId}</span>
                                <span className="text-muted">{r.isRead ? (r.readAt ? fmtDate(r.readAt, lang) : (lang === 'ar' ? 'مقروءة' : 'Read')) : (lang === 'ar' ? 'لم تُقرأ' : 'Unread')}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Reply actions */}
            {canReply && (
                <div className="mt-5 rounded-2xl border border-border bg-slate-500/[0.04] p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => onComposeReply(false)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow transition-all active:scale-95"
                        >
                            <Reply size={14} />
                            {lang === 'ar' ? 'رد' : 'Reply'}
                        </button>
                        {!isBroadcast && (
                            <button
                                onClick={() => onComposeReply(true)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-indigo-500/30 text-indigo-500 hover:bg-indigo-500/10 text-xs font-black transition-all active:scale-95"
                            >
                                <ReplyAll size={14} />
                                {lang === 'ar' ? 'رد على الكل' : 'Reply all'}
                            </button>
                        )}
                        {!isBroadcast && (
                            <label className="flex items-center gap-1.5 text-[11px] font-black text-muted cursor-pointer mr-auto">
                                <input type="checkbox" checked={quickAll} onChange={(e) => setQuickAll(e.target.checked)} className="w-3.5 h-3.5 accent-indigo-600" />
                                {lang === 'ar' ? 'رد سريع على الكل' : 'Quick reply-all'}
                            </label>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <textarea
                            value={quickBody}
                            onChange={(e) => setQuickBody(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendQuickReply();
                            }}
                            rows={2}
                            placeholder={lang === 'ar' ? 'اكتب رداً سريعاً... (Ctrl+Enter للإرسال)' : 'Write a quick reply... (Ctrl+Enter to send)'}
                            className="flex-1 px-3.5 py-2.5 rounded-xl border border-border bg-card text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-6"
                        />
                        <button
                            onClick={sendQuickReply}
                            disabled={!quickBody.trim() || quickSending}
                            className="px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                        >
                            <Send size={14} />
                            {quickSending ? (lang === 'ar' ? '...' : '...') : (lang === 'ar' ? 'إرسال' : 'Send')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const ComposeModal: React.FC<{
    lang: string;
    directory: Array<{ id: string; name: string; role: string; branchId?: string | null }>;
    canBroadcastAll: boolean;
    replyPrefill?: { messageId: string; replyAll: boolean; subject: string; toHint: string } | null;
    onClose: () => void;
    onSend: (payload: { toUserIds?: string[]; broadcast?: 'BRANCH' | 'ALL'; subject: string; body: string; priority?: string }) => Promise<void>;
}> = ({ lang, directory, canBroadcastAll, replyPrefill, onClose, onSend }) => {
    const isReply = !!replyPrefill;
    const [mode, setMode] = useState<'users' | 'BRANCH' | 'ALL'>('users');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [userSearch, setUserSearch] = useState('');
    const [subject, setSubject] = useState(replyPrefill?.subject || '');
    const [body, setBody] = useState('');
    const [priority, setPriority] = useState('NORMAL');
    const [sending, setSending] = useState(false);

    const filteredDir = useMemo(() => {
        const q = userSearch.trim().toLowerCase();
        const list = directory || [];
        if (!q) return list.slice(0, 80);
        return list.filter((u) => `${u.name} ${u.role}`.toLowerCase().includes(q)).slice(0, 80);
    }, [directory, userSearch]);

    const toggleUser = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const valid = subject.trim() && body.trim() && (isReply || mode !== 'users' || selected.size > 0);

    const submit = async () => {
        if (!valid || sending) return;
        setSending(true);
        try {
            await onSend({
                toUserIds: isReply ? undefined : mode === 'users' ? Array.from(selected) : undefined,
                broadcast: isReply ? undefined : mode === 'users' ? undefined : mode,
                subject: subject.trim(),
                body: body.trim(),
                priority,
            });
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[110] p-4" onClick={onClose}>
            <div className="card-primary w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-indigo-50 dark:bg-indigo-950/20">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center">{isReply ? <Reply size={20} /> : <Send size={20} />}</div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white">{isReply ? (replyPrefill?.replyAll ? (lang === 'ar' ? 'رد على الكل' : 'Reply all') : (lang === 'ar' ? 'رد على الرسالة' : 'Reply')) : (lang === 'ar' ? 'رسالة جديدة' : 'New message')}</h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{isReply ? (lang === 'ar' ? `إلى: ${replyPrefill?.toHint || ''}` : `To: ${replyPrefill?.toHint || ''}`) : (lang === 'ar' ? 'لشخص • لأشخاص • للفرع • للكل' : 'To someone • many • branch • all')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={22} /></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    {isReply && (
                        <p className="text-xs font-bold text-indigo-600 bg-indigo-500/10 border border-indigo-500/25 rounded-xl px-3 py-2 flex items-center gap-2">
                            <Reply size={14} />
                            {replyPrefill?.replyAll
                                ? (lang === 'ar' ? 'سيصل الرد للمرسل وكل مستلمي الرسالة الأصلية' : 'Reply goes to sender and all original recipients')
                                : (lang === 'ar' ? 'سيصل الرد لمرسل الرسالة الأصلية مباشرة' : 'Reply goes directly to the original sender')}
                        </p>
                    )}
                    {!isReply && (
                    <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl border border-border bg-slate-500/5">
                        {([
                            { key: 'users' as const, label: lang === 'ar' ? 'أشخاص' : 'People', icon: Users },
                            { key: 'BRANCH' as const, label: lang === 'ar' ? 'كل الفرع' : 'Branch', icon: Megaphone },
                            ...(canBroadcastAll ? [{ key: 'ALL' as const, label: lang === 'ar' ? 'الجميع' : 'Everyone', icon: Megaphone }] : []),
                        ]).map((o) => (
                            <button
                                key={o.key}
                                onClick={() => setMode(o.key)}
                                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black transition-all ${mode === o.key ? 'bg-indigo-600 text-white shadow' : 'text-muted hover:text-main'}`}
                            >
                                <o.icon size={14} />{o.label}
                            </button>
                        ))}
                    </div>
                    )}

                    {!isReply && mode === 'users' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className={labelCls}>
                                    {lang === 'ar' ? `المستلمون (${selected.size})` : `Recipients (${selected.size})`}
                                </label>
                                <div className="relative w-48">
                                    <Search size={13} className="absolute top-1/2 -translate-y-1/2 right-2.5 text-muted" />
                                    <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder={lang === 'ar' ? 'بحث...' : 'Search...'} className="w-full pl-3 pr-8 py-2 text-xs rounded-xl border border-border bg-card font-bold outline-none" />
                                </div>
                            </div>
                            {selected.size > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {Array.from(selected).map((id) => {
                                        const u = (directory || []).find((x) => x.id === id);
                                        return (
                                            <span key={id} className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-500">
                                                {u?.name || id}
                                                <button onClick={() => toggleUser(id)} className="hover:text-rose-500"><X size={12} /></button>
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="max-h-44 overflow-y-auto rounded-xl border border-border divide-y divide-border/40">
                                {filteredDir.length === 0 && (
                                    <p className="p-3 text-xs font-bold text-muted text-center">{lang === 'ar' ? 'لا يوجد مستخدمون' : 'No users found'}</p>
                                )}
                                {filteredDir.map((u) => (
                                    <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-500/5 text-xs font-bold">
                                        <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleUser(u.id)} className="w-4 h-4 accent-indigo-600" />
                                        <span className="text-main flex-1 truncate">{u.name}</span>
                                        <span className="text-muted text-[10px] uppercase">{u.role}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                    {!isReply && mode !== 'users' && (
                        <p className="text-xs font-bold text-cyan-600 bg-cyan-500/10 border border-cyan-500/25 rounded-xl px-3 py-2 flex items-center gap-2">
                            <AlertTriangle size={14} />
                            {mode === 'BRANCH'
                                ? (lang === 'ar' ? 'سيصل لكل مستخدمي فرعك النشطين' : 'Reaches all active users of your branch')
                                : (lang === 'ar' ? 'سيصل لكل مستخدمي السيستم النشطين' : 'Reaches every active user in the system')}
                        </p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3">
                        <div className="space-y-1.5">
                            <label className={labelCls}>{lang === 'ar' ? 'الموضوع' : 'Subject'}</label>
                            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} placeholder={lang === 'ar' ? 'موضوع الرسالة...' : 'Subject...'} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>{lang === 'ar' ? 'الأولوية' : 'Priority'}</label>
                            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                                {Object.entries(PRIORITY_META).map(([k, v]) => (
                                    <option key={k} value={k}>{v[lang as 'ar' | 'en']}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelCls}>{lang === 'ar' ? 'نص الرسالة' : 'Message'}</label>
                        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className={`${inputCls} resize-none leading-7`} placeholder={lang === 'ar' ? 'اكتب رسالتك...' : 'Write your message...'} />
                    </div>
                </div>
                <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2">
                    <span className="text-[11px] font-bold text-muted hidden sm:block">
                        {isReply
                            ? (lang === 'ar' ? 'رد مرتبط بالرسالة الأصلية' : 'Reply linked to original')
                            : mode === 'users'
                            ? (lang === 'ar' ? `${selected.size} مستلم` : `${selected.size} recipients`)
                            : (lang === 'ar' ? 'بث جماعي + إشعار لحظي' : 'Broadcast + instant notify')}
                    </span>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border text-sm font-black text-muted hover:text-main">{lang === 'ar' ? 'تراجع' : 'Back'}</button>
                        <button
                            onClick={submit}
                            disabled={!valid || sending}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black shadow transition-all disabled:opacity-50"
                        >
                            {isReply ? <Reply size={16} /> : <Send size={16} />}
                            {sending ? (lang === 'ar' ? 'جارٍ الإرسال...' : 'Sending...') : isReply ? (lang === 'ar' ? 'إرسال الرد' : 'Send reply') : (lang === 'ar' ? 'إرسال' : 'Send')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MailHub;
