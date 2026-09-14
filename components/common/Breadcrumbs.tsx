import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, Mail, Bell, AlertTriangle, CheckCircle2, Info, LogOut, User, MapPin, Clock, CalendarDays, Wallet, Send, Trash2, CheckCheck, RefreshCw, Inbox } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useMailStore } from '../../stores/useMailStore';
import { useFinanceStore } from '../../stores/useFinanceStore';
import { translations } from '../../services/translations';
import { useSystemNotifications, type SystemNotification } from '../../hooks/useSystemNotifications';
import { useInternalMessages } from '../../hooks/useInternalMessages';
import { usersApi } from '../../services/api/users';

// Map of raw paths to generic translation keys
const PATH_MAP: Record<string, string> = {
    'pos': 'pos',
    'kitchen': 'kitchen',
    'orders': 'orders',
    'tables': 'tables',
    'production': 'production',
    'menu': 'menu',
    'inventory': 'inventory',
    'finance': 'finance',
    'reports': 'reports',
    'crm': 'crm',
    'user-management': 'team',
    'call-center': 'call_center',
    'dispatch': 'dispatch',
    'ai-assistant': 'ai_assistant',
    'marketing': 'marketing',
    'settings': 'settings',
};

const HR_PATH_LABELS: Record<string, { ar: string; en: string }> = {
    hr: { ar: 'الموظفون', en: 'Employees' },
    'hr-guide': { ar: 'دليل الموارد البشرية', en: 'HR Guide' },
    'hr-settings': { ar: 'إعدادات الأقسام', en: 'HR Settings' },
    attendance: { ar: 'الحضور والانصراف', en: 'Attendance' },
    payroll: { ar: 'الرواتب والأجور', en: 'Payroll' },
    'biometric-devices': { ar: 'أجهزة البصمة', en: 'Biometric Devices' },
    scheduling: { ar: 'جدولة الورديات', en: 'Scheduling' },
    'shift-tasks': { ar: 'قوائم المهام', en: 'Shift Tasks' },
    forensics: { ar: 'التدقيق والتحقيقات', en: 'Forensics' },
};

type PopupKind = 'messages' | 'notifications' | 'user';

const POPUP_WIDTH: Record<PopupKind, number> = {
    messages: 330,
    notifications: 350,
    user: 230,
};

const SEVERITY_META: Record<SystemNotification['severity'], { Icon: React.FC<{ size?: number; className?: string }>; chip: string; dot: string }> = {
    critical: { Icon: AlertTriangle, chip: 'bg-rose-500/10 text-rose-500', dot: 'bg-rose-500' },
    warning: { Icon: Bell, chip: 'bg-amber-500/10 text-amber-500', dot: 'bg-amber-500' },
    info: { Icon: Info, chip: 'bg-blue-500/10 text-blue-500', dot: 'bg-blue-500' },
    success: { Icon: CheckCircle2, chip: 'bg-emerald-500/10 text-emerald-500', dot: 'bg-emerald-500' },
};

const Breadcrumbs: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { settings, logout, branches } = useAuthStore();
    const { activeShift } = useFinanceStore();
    const hasPermission = useAuthStore((s: any) => s.hasPermission);
    const mailUnread = useMailStore((s) => s.unread);
    const fetchMailUnread = useMailStore((s) => s.fetchUnread);
    const subscribeMail = useMailStore((s) => s.subscribeLive);

    const currentUser = settings.currentUser;
    const activeBranch = branches.find(b => b.id === settings.activeBranchId);
    const language = (settings.language || 'en') as 'en' | 'ar';
    const isRtl = language === 'ar';
    const t = translations[language];

    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // ── Real data: system notifications + team inbox ──
    const branchId = settings.activeBranchId;
    const userId = (currentUser as any)?.id ? String((currentUser as any).id) : undefined;
    const userName = currentUser?.name || 'User';
    const {
        notifications, unreadCount: notifUnread, loading: notifLoading,
        refresh: refreshNotif, markRead: markNotifRead, markAllRead: markAllNotifRead,
    } = useSystemNotifications({ branchId, userId, hasActiveShift: !!activeShift });
    const {
        messages, unreadCount: msgUnread, send: sendMessage,
        markAllRead: markAllMsgRead, remove: removeMessage,
    } = useInternalMessages({ branchId, userId, userName });

    // ── Anchored popups: portal to body but positioned under the icon ──
    // (absolute inside main gets clipped by overflow-hidden and slides under the rail)
    const [openKind, setOpenKind] = useState<PopupKind | null>(null);
    const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
    const msgBtnRef = useRef<HTMLButtonElement>(null);
    const notifBtnRef = useRef<HTMLButtonElement>(null);
    const userBtnRef = useRef<HTMLButtonElement>(null);

    const placeUnder = (btn: HTMLButtonElement | null, kind: PopupKind) => {
        if (!btn || typeof window === 'undefined') return null;
        const rect = btn.getBoundingClientRect();
        const vw = window.innerWidth;
        const width = Math.min(POPUP_WIDTH[kind], vw - 16);
        let left = rect.left + rect.width / 2 - width / 2;
        left = Math.max(8, Math.min(left, vw - width - 8));
        return { top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 16)), left, width };
    };

    const buttonFor = (kind: PopupKind) =>
        kind === 'messages' ? msgBtnRef.current : kind === 'notifications' ? notifBtnRef.current : userBtnRef.current;

    const closeAllPopups = () => {
        setOpenKind(null);
        setAnchor(null);
    };

    const togglePopup = (kind: PopupKind) => {
        if (openKind === kind) {
            closeAllPopups();
            return;
        }
        setAnchor(placeUnder(buttonFor(kind), kind));
        setOpenKind(kind);
        if (kind === 'messages') {
            fetchTeamUsers();
            // Mark received messages as read shortly after opening
            window.setTimeout(() => markAllMsgRead(), 800);
        }
    };

    // Keep the popup glued under its icon on scroll / resize / zoom
    useEffect(() => {
        if (!openKind) return;
        const reposition = () => {
            const pos = placeUnder(buttonFor(openKind), openKind);
            if (pos) setAnchor(pos);
            else closeAllPopups();
        };
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        return () => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openKind]);

    // Close popups on Escape + route change so they never get stuck open
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeAllPopups();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        closeAllPopups();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    // Staff mail unread badge (server-persisted inbox)
    useEffect(() => {
        try {
            if (hasPermission && !hasPermission('NAV_MAIL' as any)) return;
        } catch { /* permissive fallback */ }
        fetchMailUnread().catch(() => {});
        const off = subscribeMail();
        return off;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    // ── Team users for message compose ──
    const [teamUsers, setTeamUsers] = useState<any[]>([]);
    const [usersLoaded, setUsersLoaded] = useState(false);
    const fetchTeamUsers = async () => {
        if (usersLoaded) return;
        try {
            const list = await usersApi.getAll();
            const arr = Array.isArray(list) ? list : [];
            setTeamUsers(arr.filter((u: any) => u?.isActive !== false && String(u?.id) !== String(userId)).slice(0, 50));
        } catch {
            /* permission-gated — compose falls back to broadcast */
        } finally {
            setUsersLoaded(true);
        }
    };

    const [draft, setDraft] = useState('');
    const [draftTo, setDraftTo] = useState('');
    const [sendError, setSendError] = useState('');
    const handleSend = async () => {
        if (!draft.trim()) return;
        const toUser = teamUsers.find((u: any) => String(u?.id) === draftTo);
        setSendError('');
        try {
            await sendMessage(draft, toUser ? { id: String(toUser.id), name: String(toUser.name || '') } : undefined);
            setDraft('');
        } catch (e: any) {
            // Keep the draft so nothing is lost; server message is already actionable.
            setSendError(String(e?.message || (isRtl ? 'فشل الإرسال' : 'Send failed')));
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const timeAgo = (iso?: string): string => {
        if (!iso) return '';
        const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
        if (s < 60) return isRtl ? `منذ ${s} ث` : `${s}s ago`;
        const m = Math.floor(s / 60);
        if (m < 60) return isRtl ? `منذ ${m} د` : `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return isRtl ? `منذ ${h} س` : `${h}h ago`;
        const d = Math.floor(h / 24);
        return isRtl ? `منذ ${d} يوم` : `${d}d ago`;
    };

    const msgTime = (iso: string): string => {
        try {
            return new Intl.DateTimeFormat(isRtl ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: 'numeric', hour12: true }).format(new Date(iso));
        } catch {
            return '';
        }
    };

    const userInitials = currentUser?.name?.substring(0, 2).toUpperCase() || 'RF';
    const systemDateLabel = new Intl.DateTimeFormat(isRtl ? 'ar-EG' : 'en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(currentTime);

    const breadcrumbs = useMemo(() => {
        const pathnames = location.pathname.split('/').filter((x) => x);
        const crumbs = [];

        // Always add Home
        crumbs.push({
            name: isRtl ? 'الرئيسية' : 'Home',
            path: '/',
            isLast: pathnames.length === 0,
        });

        let currentPath = '';

        pathnames.forEach((segment, index) => {
            currentPath += `/${segment}`;
            const isLast = index === pathnames.length - 1;

            // Try to translate the segment, otherwise capitalize
            let name = segment;
            const hrLabel = HR_PATH_LABELS[segment];
            const mappedKey = PATH_MAP[segment];
            if (hrLabel) {
                name = hrLabel[language];
            } else if (mappedKey && (t as any)[mappedKey]) {
                name = (t as any)[mappedKey];
            } else if (segment.length === 36 && segment.includes('-')) {
                name = isRtl ? 'تفاصيل' : 'Details'; // UUID detection
            } else {
                name = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
            }

            crumbs.push({
                name,
                path: currentPath,
                isLast,
            });
        });

        return crumbs;
    }, [location.pathname, t, isRtl]);

    if (location.pathname === '/pos' || location.pathname === '/kitchen') {
        return null; // Less clutter on operational screens
    }

    const showMessagesPanel = openKind === 'messages';
    const showNotificationsPanel = openKind === 'notifications';
    const showUserMenu = openKind === 'user';
    const anyPopupOpen = openKind !== null && anchor !== null;

    const orderedMessages = useMemo(
        () => [...messages].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [messages]
    );

    return (
        <>
        <nav
            aria-label="Breadcrumb"
            className={`px-4 sm:px-6 pt-4 pb-2 flex items-center gap-2 sm:gap-4 max-lg:ps-14 ${isRtl ? 'flex-row-reverse' : ''}`}
        >
            <div className={`workspace-breadcrumbs flex-1 min-w-0 flex flex-col gap-2 ${isRtl ? 'workspace-breadcrumbs-rtl' : ''}`}>
                <div className={`flex flex-wrap items-center gap-3 ${isRtl ? 'flex-row' : ''}`}>
                    <div className="flex items-center gap-1.5 bg-elevated/40 border border-border/10 px-2.5 py-1 rounded-lg">
                        <MapPin size={14} className="text-primary" />
                        <span className="max-w-[82px] truncate text-[11px] font-bold text-main sm:max-w-none sm:text-xs">
                            {activeBranch?.name || (isRtl ? 'الفرع الرئيسي' : 'Main Branch')}
                        </span>
                    </div>

                    <div className="hidden sm:flex items-center gap-1.5 bg-elevated/40 border border-border/10 px-2.5 py-1 rounded-lg">
                        <CalendarDays size={14} className="text-muted" />
                        <span className="flex flex-col leading-tight">
                            <span className="text-[11px] sm:text-xs font-semibold text-muted">
                                {new Intl.DateTimeFormat(isRtl ? 'ar-EG' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }).format(currentTime)}
                            </span>
                            <span className="text-[9px] font-black text-muted/70">
                                {isRtl ? 'تاريخ السيستم: ' : 'System: '}{systemDateLabel}
                            </span>
                        </span>
                        <div className="w-[1px] h-3 bg-border/40 mx-0.5" />
                        <Clock size={14} className="text-muted" />
                        <span className="text-[11px] sm:text-xs font-semibold text-muted">
                            {new Intl.DateTimeFormat(isRtl ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: 'numeric', hour12: true }).format(currentTime)}
                        </span>
                    </div>

                    <div className={`hidden md:flex items-center gap-1.5 ${activeShift ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'} border px-2.5 py-1 rounded-lg shadow-sm`}>
                        <Wallet size={14} className={activeShift ? 'text-emerald-500' : 'text-amber-500'} />
                        <span className={`text-[11px] sm:text-xs font-bold ${activeShift ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {activeShift
                                ? (isRtl ? `الوردية #${activeShift.id.slice(-4)}` : `Shift #${activeShift.id.slice(-4)}`)
                                : (isRtl ? 'لا توجد وردية' : 'No Active Shift')}
                        </span>
                    </div>
                </div>

                <ol className="hidden w-full flex-wrap items-center gap-1.5 sm:flex sm:gap-2.5">
                {breadcrumbs.map((crumb, index) => {
                    const isFirst = index === 0;

                    return (
                        <li key={crumb.path} className={`flex items-center ${isRtl && index > 0 ? 'flex-row-reverse' : ''}`}>
                            {index > 0 && (
                                <ChevronRight
                                    size={14}
                                    className={`text-muted/40 mx-1 shrink-0 ${isRtl ? 'rotate-180' : ''}`}
                                    aria-hidden="true"
                                />
                            )}

                            {crumb.isLast ? (
                                <span className="text-[11px] sm:text-[13px] font-bold text-main flex items-center gap-1.5 transition-colors">
                                    {isFirst && <Home size={14} className="text-muted/70" />}
                                    {crumb.name}
                                </span>
                            ) : (
                                <Link
                                    to={crumb.path}
                                    className="text-[11px] sm:text-[13px] font-semibold text-muted hover:text-primary transition-colors flex items-center gap-1.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                >
                                    {isFirst && <Home size={14} className={isRtl ? 'ml-1' : 'mr-1'} />}
                                    {crumb.name}
                                </Link>
                            )}
                        </li>
                    );
                })}
                </ol>
            </div>

            {/* Right Side: Communication & User Profile */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                {/* Messages & Notifications */}
                <div className="flex items-center gap-1.5 p-1 bg-elevated/40 border border-border/10 rounded-xl">
                    <button
                        onClick={() => navigate('/mail')}
                        className="p-2 rounded-lg transition-colors relative text-muted hover:text-main hover:bg-elevated"
                        title={isRtl ? 'البريد الداخلي' : 'Staff Mail'}
                        aria-label={isRtl ? 'البريد الداخلي' : 'Staff Mail'}
                    >
                        <Inbox size={16} />
                        {mailUnread > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-indigo-500 rounded-full border-2 border-card text-[9px] font-black text-white flex items-center justify-center">
                                {mailUnread > 9 ? '9+' : mailUnread}
                            </span>
                        )}
                    </button>
                    <div className="w-[1px] h-5 bg-border/20" />
                    <button
                        ref={msgBtnRef}
                        onClick={() => togglePopup('messages')}
                        className={`p-2 rounded-lg transition-colors relative ${showMessagesPanel ? 'text-main bg-elevated' : 'text-muted hover:text-main hover:bg-elevated'}`}
                        title={isRtl ? 'الرسائل الداخلية' : 'Internal Messages'}
                        aria-label={isRtl ? 'الرسائل الداخلية' : 'Internal Messages'}
                        aria-expanded={showMessagesPanel}
                    >
                        <Mail size={16} />
                        {msgUnread > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-rose-500 rounded-full border-2 border-card text-[9px] font-black text-white flex items-center justify-center">
                                {msgUnread > 9 ? '9+' : msgUnread}
                            </span>
                        )}
                    </button>
                    <div className="w-[1px] h-5 bg-border/20" />
                    <button
                        ref={notifBtnRef}
                        onClick={() => togglePopup('notifications')}
                        className={`p-2 rounded-lg transition-colors relative ${showNotificationsPanel ? 'text-main bg-elevated' : 'text-muted hover:text-main hover:bg-elevated'}`}
                        title={isRtl ? 'الإشعارات' : 'Notifications'}
                        aria-label={isRtl ? 'الإشعارات' : 'Notifications'}
                        aria-expanded={showNotificationsPanel}
                    >
                        <Bell size={16} />
                        {notifUnread > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-amber-500 rounded-full border-2 border-card text-[9px] font-black text-white flex items-center justify-center">
                                {notifUnread > 9 ? '9+' : notifUnread}
                            </span>
                        )}
                    </button>
                </div>

                {/* User Dropdown Profile */}
                <div>
                    <button
                        ref={userBtnRef}
                        type="button"
                        aria-label={isRtl ? 'فتح قائمة المستخدم' : 'Open user menu'}
                        aria-expanded={showUserMenu}
                        onClick={() => togglePopup('user')}
                        className="group flex items-center gap-0 rounded-xl border border-border/10 bg-elevated/40 p-1.5 shadow-sm transition-all hover:bg-elevated sm:gap-2.5 sm:pr-3 sm:rtl:pl-3 sm:rtl:pr-1.5"
                    >
                        <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white font-bold text-[11px] shrink-0 overflow-hidden shadow-inner group-hover:scale-105 transition-transform">
                            {userInitials}
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-card" />
                        </div>
                        <div className="hidden min-w-0 flex-col items-start pr-1 text-left rtl:text-right sm:flex">
                            <span className="text-xs font-bold text-main leading-none truncate max-w-[100px]">{currentUser?.name || 'User'}</span>
                            <span className="text-[9px] font-semibold text-muted/60 uppercase tracking-widest mt-1 truncate">{currentUser?.role}</span>
                        </div>
                    </button>
                </div>
            </div>
        </nav>
        {anyPopupOpen && anchor && createPortal(
            <>
                <div className="fixed inset-0 z-[950]" onClick={closeAllPopups} aria-hidden="true" />
                {/* Messages Popup — anchored under the mail icon */}
                {showMessagesPanel && (
                    <div
                        className="theme-popover route-pop fixed z-[1000] overflow-hidden shadow-2xl flex flex-col"
                        style={{ top: anchor.top, left: anchor.left, width: anchor.width, maxWidth: 'calc(100vw - 1rem)', maxHeight: 'min(70vh, 560px)' }}
                    >
                        <div className="theme-modal-header p-3 flex justify-between items-center shrink-0">
                            <span className="font-bold text-sm tracking-wide text-main">{isRtl ? 'البريد الداخلي' : 'Team Inbox'}</span>
                            {msgUnread > 0 ? (
                                <span className="text-[10px] text-white bg-rose-500 px-2.5 py-0.5 rounded-full font-bold shadow-sm shadow-rose-500/30">{msgUnread} {isRtl ? 'جديد' : 'New'}</span>
                            ) : (
                                <span className="text-[10px] text-muted/60 font-bold">{isRtl ? 'لا جديد' : 'All caught up'}</span>
                            )}
                        </div>
                        {/* Compose */}
                        <div className="p-2 border-b border-border/10 shrink-0">
                            {teamUsers.length > 0 && (
                                <select
                                    value={draftTo}
                                    onChange={(e) => setDraftTo(e.target.value)}
                                    className="theme-input w-full mb-2 text-xs py-1.5"
                                    aria-label={isRtl ? 'إرسال إلى' : 'Send to'}
                                >
                                    <option value="">{isRtl ? 'الكل في الفرع' : 'Everyone in branch'}</option>
                                    {teamUsers.map((u: any) => (
                                        <option key={String(u.id)} value={String(u.id)}>{String(u.name || u.email || u.id)}</option>
                                    ))}
                                </select>
                            )}
                            <div className="flex gap-1.5">
                                <input
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                                    placeholder={isRtl ? 'اكتب رسالة للفريق…' : 'Message the team…'}
                                    className="theme-input flex-1 text-xs py-2"
                                    maxLength={2000}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!draft.trim()}
                                    className="theme-btn-primary rounded-xl px-3 flex items-center justify-center disabled:opacity-40"
                                    aria-label={isRtl ? 'إرسال' : 'Send'}
                                >
                                    <Send size={14} className={isRtl ? 'rotate-180' : ''} />
                                </button>
                            </div>
                            {sendError && (
                                <p className="mt-1.5 text-[11px] font-bold text-rose-500">{sendError}</p>
                            )}
                        </div>
                        <div className="overflow-y-auto flex-1 min-h-0">
                            {orderedMessages.length === 0 ? (
                                <div className="p-8 text-center text-muted/60 text-xs flex flex-col items-center gap-3">
                                    <Mail size={32} className="opacity-20" />
                                    <span>{isRtl ? 'لا توجد رسائل بعد — ابعت أول رسالة للفريق' : 'No messages yet — send the first team message'}</span>
                                </div>
                            ) : (
                                orderedMessages.slice(0, 30).map((m) => {
                                    const mine = userId && m.fromId === userId;
                                    const unreadRow = !(m as any).read && !mine;
                                    return (
                                        <div key={m.id} className="p-3 border-b border-border/5 hover:bg-elevated/50 flex gap-2.5 group">
                                            <div className={`w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[11px] shrink-0 ${unreadRow ? 'ring-2 ring-indigo-500/60' : ''}`}>
                                                {String(m.fromName || '?').substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-xs font-bold text-main truncate">{m.fromName}</span>
                                                    {m.toName && (
                                                        <span className="text-[10px] text-muted/60">→ {m.toName}</span>
                                                    )}
                                                    <span className="text-[10px] text-muted/50 ms-auto shrink-0">{msgTime(m.createdAt)}</span>
                                                </div>
                                                {(m as any).subject && (
                                                    <div className={`text-xs mt-1 leading-snug break-words ${unreadRow ? 'font-black text-main' : 'font-bold text-main/90'}`}>{(m as any).subject}</div>
                                                )}
                                                <div className="text-xs text-muted mt-0.5 leading-relaxed break-words">{m.text}</div>
                                            </div>
                                            {mine && (
                                                <button
                                                    onClick={() => removeMessage(m.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-rose-500 transition-all shrink-0 self-start"
                                                    aria-label={isRtl ? 'حذف' : 'Delete'}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* Notifications Popup — anchored under the bell icon, REAL system data */}
                {showNotificationsPanel && (
                    <div
                        className="theme-popover route-pop fixed z-[1000] overflow-hidden shadow-2xl flex flex-col"
                        style={{ top: anchor.top, left: anchor.left, width: anchor.width, maxWidth: 'calc(100vw - 1rem)', maxHeight: 'min(70vh, 560px)' }}
                    >
                        <div className="theme-modal-header p-3 flex justify-between items-center shrink-0 gap-2">
                            <span className="font-bold text-sm tracking-wide text-main">{isRtl ? 'الإشعارات' : 'Notifications'}</span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={refreshNotif}
                                    className="p-1.5 rounded-lg text-muted hover:text-main hover:bg-elevated transition-colors"
                                    title={isRtl ? 'تحديث' : 'Refresh'}
                                    aria-label={isRtl ? 'تحديث' : 'Refresh'}
                                >
                                    <RefreshCw size={13} className={notifLoading ? 'animate-spin' : ''} />
                                </button>
                                {notifUnread > 0 ? (
                                    <button
                                        onClick={markAllNotifRead}
                                        className="flex items-center gap-1 text-[10px] font-bold text-primary hover:opacity-80"
                                    >
                                        <CheckCheck size={12} />
                                        {isRtl ? 'تحديد الكل كمقروء' : 'Mark all read'}
                                    </button>
                                ) : (
                                    <span className="text-[10px] text-muted/60 font-bold">{notifications.length} {isRtl ? 'تنبيه' : 'alerts'}</span>
                                )}
                            </div>
                        </div>
                        <div className="overflow-y-auto flex-1 min-h-0">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center text-muted/60 text-xs flex flex-col items-center gap-3">
                                    {notifLoading ? (
                                        <RefreshCw size={28} className="opacity-30 animate-spin" />
                                    ) : (
                                        <CheckCircle2 size={30} className="opacity-30 text-emerald-500" />
                                    )}
                                    <span>{notifLoading ? (isRtl ? 'جاري فحص السيستم…' : 'Checking the system…') : (isRtl ? 'مفيش تنبيهات — كل حاجة تمام' : 'All clear — no alerts right now')}</span>
                                </div>
                            ) : (
                                notifications.map((n) => {
                                    const meta = SEVERITY_META[n.severity];
                                    const Icon = meta.Icon;
                                    return (
                                        <button
                                            key={n.id}
                                            onClick={() => { markNotifRead(n.id); if (n.link) { closeAllPopups(); navigate(n.link); } }}
                                            className="w-full text-start p-3 border-b border-border/5 hover:bg-elevated/50 cursor-pointer flex gap-3 transition-colors"
                                        >
                                            <div className={`w-8 h-8 rounded-full ${meta.chip} flex items-center justify-center shrink-0`}>
                                                <Icon size={14} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-xs font-bold text-main leading-snug">{isRtl ? n.titleAr : n.title}</div>
                                                <div className="text-[10px] text-muted mt-1 leading-relaxed">
                                                    {isRtl ? n.bodyAr : n.body}
                                                </div>
                                                {n.createdAt && (
                                                    <div className="text-[9px] text-muted/50 mt-1 font-semibold">{timeAgo(n.createdAt)}</div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
                {showUserMenu && (
                    <div
                        className="theme-popover route-pop fixed z-[1000] overflow-hidden flex flex-col shadow-2xl"
                        style={{ top: anchor.top, left: anchor.left, width: anchor.width, maxWidth: 'calc(100vw - 1rem)' }}
                    >
                        <div className="theme-modal-header px-4 py-4 flex flex-col items-center">
                            <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-lg mb-2 border-2 border-primary/20">
                                {userInitials}
                            </div>
                            <div className="text-sm font-bold text-main truncate text-center">{currentUser?.name || 'User'}</div>
                            <div className="text-[10px] text-muted/60 uppercase tracking-widest mt-0.5 text-center">{currentUser?.role || 'Staff'}</div>
                        </div>

                        <div className="p-2 flex flex-col gap-1">
                            <button
                                type="button"
                                onClick={() => { closeAllPopups(); navigate('/settings'); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold text-muted hover:text-main hover:bg-elevated/50 rounded-xl transition-colors"
                            >
                                <User size={14} className="text-primary" />
                                <span>{isRtl ? 'حسابي وإعداداتي' : 'My Account Settings'}</span>
                            </button>

                            <div className="h-[1px] bg-border/10 my-1 mx-2" />

                            <button type="button" onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors mt-1 shadow-sm">
                                <LogOut size={14} />
                                <span>{isRtl ? 'تسجيل الخروج' : 'Sign Out'}</span>
                            </button>
                        </div>
                    </div>
                )}
            </>,
            document.body
        )}
        </>
    );
};

export default Breadcrumbs;
