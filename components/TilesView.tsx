import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import {
    Search, LayoutDashboard, Star, Clock3, Sparkles, Bell, Mail, X,
    Plus, Clock, Wallet, BookOpen, ChevronLeft, CheckCircle2,
    AlertTriangle, Info, Flame, Bike, ClipboardCheck, ChefHat,
} from 'lucide-react';
import { NAV_SECTIONS, flattenNav, type NavItem } from './common/navigation';
import { ModuleTile } from './tiles/ModuleTile';
import { useAuthStore } from '../stores/useAuthStore';
import { useOrderStore } from '../stores/useOrderStore';
import { useSystemNotifications, type SystemNotification } from '../hooks/useSystemNotifications';
import { useInternalMessages } from '../hooks/useInternalMessages';
import { useFinanceStore } from '../stores/useFinanceStore';
import type { OpsStats } from '../src/workers/opsStats.worker';

const SEV_META: Record<SystemNotification['severity'], { Icon: React.FC<{ size?: number; className?: string }>; chip: string }> = {
    critical: { Icon: AlertTriangle, chip: 'bg-rose-500/12 text-rose-500' },
    warning: { Icon: Bell, chip: 'bg-amber-500/12 text-amber-500' },
    info: { Icon: Info, chip: 'bg-blue-500/12 text-blue-500' },
    success: { Icon: CheckCircle2, chip: 'bg-emerald-500/12 text-emerald-500' },
};

const QUICK_ACTIONS = [
    { path: '/pos', ar: 'طلب جديد', en: 'New order', Icon: Plus, hex: '#10b981' },
    { path: '/day-close', ar: 'إقفال اليوم', en: 'Day close', Icon: Clock, hex: '#f59e0b' },
    { path: '/expenses', ar: 'مصروف', en: 'Expense', Icon: Wallet, hex: '#ec4899' },
    { path: '/menu', ar: 'المنيو', en: 'Menu', Icon: BookOpen, hex: '#8b5cf6' },
];

const LIVE_PATHS = new Set(['/pos', '/kds', '/orders', '/pickup', '/dispatch', '/driver', '/call-center']);
const ACTIVE_FINAL = new Set(['DELIVERED', 'CANCELLED', 'CLOSED', 'REJECTED', 'VOIDED']);
const UPPER = (v: unknown) => String((v as any)?.status || '').toUpperCase();

/** Synchronous twin of the opsStats worker (first paint + no-Worker fallback). */
const computeOpsSync = (input: any[]): OpsStats => {
    const list = (input || []) as any[];
    const active = list.filter((o) => !ACTIVE_FINAL.has(UPPER(o)));
    const inStatus = (...s: string[]) => active.filter((o) => s.includes(UPPER(o))).length;
    const todayKey = new Date().toISOString().slice(0, 10);
    let revenue = 0;
    const hours = new Array(12).fill(0);
    const nowH = new Date().getHours();
    list.forEach((o) => {
        const t = (o as any)?.createdAt ? new Date((o as any).createdAt) : null;
        if (!t || Number.isNaN(t.getTime())) return;
        const st = UPPER(o);
        if (t.toISOString().slice(0, 10) === todayKey && st !== 'CANCELLED' && st !== 'VOIDED') {
            revenue += Number((o as any)?.total ?? (o as any)?.subtotal ?? 0) || 0;
        }
        const dh = nowH - t.getHours();
        if (dh >= 0 && dh < 12 && t.toDateString() === new Date().toDateString()) hours[11 - dh] += 1;
    });
    const maxH = Math.max(1, ...hours);
    return {
        active: active.length,
        preparing: inStatus('PREPARING', 'IN_PREPARATION', 'CONFIRMED', 'ACCEPTED', 'PENDING'),
        ready: inStatus('READY'),
        out: inStatus('OUT_FOR_DELIVERY'),
        revenue,
        hours: hours.map((h) => Math.max(6, Math.round((h / maxH) * 100))),
    };
};

const favKey = (userId: string) => `tiles:favs:${userId || 'anon'}`;
const recentKey = (userId: string) => `tiles:recent:${userId || 'anon'}`;

const loadList = (key: string): string[] => {
    try {
        const raw = localStorage.getItem(key);
        const arr = JSON.parse(raw || '[]');
        return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch {
        return [];
    }
};

const TilesView: React.FC = () => {
    const navigate = useNavigate();
    const { language, currentUser, hasPermission, updateSettings, branches, activeBranchId, currency } = useAuthStore(
        useShallow((s) => ({
            language: s.settings.language,
            currentUser: s.settings.currentUser,
            hasPermission: s.hasPermission,
            updateSettings: s.updateSettings,
            branches: s.branches,
            activeBranchId: s.settings.activeBranchId,
            currency: s.settings.currencySymbol || 'ج.م',
        }))
    );
    const orders = useOrderStore((s) => s.orders);
    const activeShift = useFinanceStore((s) => s.activeShift);

    const isAr = (language || 'en') === 'ar';
    const userId = String((currentUser as any)?.id || 'anon');
    const [query, setQuery] = useState('');
    const [favs, setFavs] = useState<string[]>(() => loadList(favKey(userId)));
    const [recents, setRecents] = useState<string[]>(() => loadList(recentKey(userId)));

    const { notifications, unreadCount: notifUnread, markRead: markNotifRead } = useSystemNotifications({
        branchId: activeBranchId, userId, hasActiveShift: !!activeShift,
    });
    const { unreadCount: msgUnread } = useInternalMessages({
        branchId: activeBranchId, userId, userName: currentUser?.name,
    });

    // ── Live ops numbers (real, from the order store) ──
    // Aggregated in a Web Worker so socket-driven recomputes never steal the
    // UI thread from tile animations. Synchronous first paint + fallback.
    const [ops, setOps] = useState<OpsStats>(() => computeOpsSync(orders as any[]));
    const opsWorkerRef = useRef<Worker | null>(null);
    useEffect(() => {
        const list = (orders || []) as any[];
        let cancelled = false;
        try {
            if (!opsWorkerRef.current) {
                opsWorkerRef.current = new Worker(
                    new URL('../src/workers/opsStats.worker.ts', import.meta.url),
                    { type: 'module' }
                );
            }
            const worker = opsWorkerRef.current;
            const onMessage = (event: MessageEvent) => {
                if (!cancelled && event.data) setOps(event.data as OpsStats);
            };
            worker.addEventListener('message', onMessage, { once: true });
            worker.postMessage(list);
            return () => {
                cancelled = true;
                worker.removeEventListener('message', onMessage);
            };
        } catch {
            setOps(computeOpsSync(list));
            return undefined;
        }
    }, [orders]);
    useEffect(() => () => {
        opsWorkerRef.current?.terminate();
        opsWorkerRef.current = null;
    }, []);

    const permOf = useMemo(() => {
        const m = new Map<string, NavItem['permission']>();
        flattenNav().forEach((n) => { if (!m.has(n.path)) m.set(n.path, n.permission); });
        return m;
    }, []);

    const can = useCallback((path: string) => {
        const p = permOf.get(path);
        return p ? hasPermission(p) : false;
    }, [permOf, hasPermission]);

    const allItems = useMemo(() => {
        const map = new Map<string, { item: NavItem; sectionColor: string; sectionAr: string; sectionEn: string }>();
        NAV_SECTIONS.forEach((section) => {
            section.items.forEach((item) => {
                if (item.path === '/') return; // dashboard IS the tiles home in this mode
                if (!hasPermission(item.permission)) return;
                if (!map.has(item.path)) {
                    map.set(item.path, { item, sectionColor: section.color || 'slate', sectionAr: section.labelAr, sectionEn: section.label });
                }
            });
        });
        return Array.from(map.values());
    }, [hasPermission]);

    const upNext = useMemo(() => {
        const read: Record<string, number> = { critical: 0, warning: 1, info: 2, success: 3 };
        return [...notifications]
            .sort((a, b) => read[a.severity] - read[b.severity])
            .slice(0, 3);
    }, [notifications]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return allItems;
        return allItems.filter(({ item, sectionAr, sectionEn }) =>
            item.label.toLowerCase().includes(q) ||
            item.labelAr.includes(query.trim()) ||
            sectionAr.includes(query.trim()) ||
            sectionEn.toLowerCase().includes(q) ||
            (item.keywords || '').toLowerCase().includes(q)
        );
    }, [allItems, query]);

    const favItems = useMemo(
        () => favs.map((p) => allItems.find((e) => e.item.path === p)).filter(Boolean) as typeof allItems,
        [favs, allItems]
    );
    const recentItems = useMemo(
        () => recents.map((p) => allItems.find((e) => e.item.path === p)).filter(Boolean).slice(0, 6) as typeof allItems,
        [recents, allItems]
    );

    const grouped = useMemo(() => {
        const groups = new Map<string, { ar: string; en: string; color: string; entries: typeof allItems }>();
        filtered.forEach((entry) => {
            const k = `${entry.sectionAr}|${entry.sectionEn}|${entry.sectionColor}`;
            if (!groups.has(k)) groups.set(k, { ar: entry.sectionAr, en: entry.sectionEn, color: entry.sectionColor, entries: [] });
            groups.get(k)!.entries.push(entry);
        });
        return Array.from(groups.values());
    }, [filtered]);

    const toggleFav = useCallback((path: string) => {
        setFavs((prev) => {
            const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path].slice(0, 12);
            try { localStorage.setItem(favKey(userId), JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    }, [userId]);

    const openTile = useCallback((path: string) => {
        setRecents((prev) => {
            const next = [path, ...prev.filter((p) => p !== path)].slice(0, 8);
            try { localStorage.setItem(recentKey(userId), JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
        navigate(path);
    }, [navigate, userId]);

    const badgeFor = useCallback((path: string): number => {
        if (path === '/approvals') return notifUnread;
        if (path === '/mail') return msgUnread;
        if (path === '/orders' || path === '/pos') return ops.active;
        if (path === '/kds') return ops.preparing;
        if (path === '/dispatch' || path === '/driver') return ops.out;
        return 0;
    }, [notifUnread, msgUnread, ops]);

    const hour = new Date().getHours();
    const greeting = isAr ? (hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء النور') : (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
    const dateLabel = new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    const branch = branches.find((b: any) => b.id === activeBranchId);
    const fmtMoney = (v: number) => `${currency} ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

    const timeAgo = (iso?: string): string => {
        if (!iso) return '';
        const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
        if (s < 60) return isAr ? `منذ ${s} ث` : `${s}s ago`;
        const m = Math.floor(s / 60);
        if (m < 60) return isAr ? `منذ ${m} د` : `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return isAr ? `منذ ${h} س` : `${h}h ago`;
        return isAr ? `منذ ${Math.floor(h / 24)} يوم` : `${Math.floor(h / 24)}d ago`;
    };

    const accentStyle = (hex: string, glowHex: string) => ({
        '--tile-chip-from': hex,
        '--tile-chip-to': hex,
        '--tile-glow': glowHex,
        '--tile-border': glowHex,
        '--tile-wash-from': glowHex,
    }) as React.CSSProperties;

    const renderTile = (entry: (typeof allItems)[number], index: number, variant: 'standard' | 'leader' = 'standard') => {
        const { item } = entry;
        return (
            <ModuleTile
                key={item.path}
                icon={item.icon}
                title={isAr ? item.labelAr : item.label}
                sub={isAr ? entry.sectionAr : entry.sectionEn}
                label={isAr ? item.labelAr : item.label}
                accentKey={entry.sectionColor}
                badge={badgeFor(item.path)}
                live={badgeFor(item.path) === 0 && LIVE_PATHS.has(item.path)}
                count={variant === 'leader' && badgeFor(item.path) > 0 ? badgeFor(item.path) : undefined}
                variant={variant}
                delay={index * 35}
                isFav={favs.includes(item.path)}
                chevronRtl={isAr}
                spanClass={variant === 'leader' ? 'col-span-2' : undefined}
                onOpen={() => openTile(item.path)}
                onToggleFav={() => toggleFav(item.path)}
            />
        );
    };

    const showHeroes = !query.trim();
    const canPos = can('/pos');

    return (
        <div className="tiles-scope relative mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-6 sm:px-6" dir={isAr ? 'rtl' : 'ltr'}>
            <div className="tiles-aurora" aria-hidden="true"><span /><span /><span /></div>

            {/* Header */}
            <header className="relative mb-5 flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-muted">
                        <Sparkles size={12} className="text-primary" />
                        {branch?.name || (isAr ? 'مساحة العمل' : 'Workspace')} · {dateLabel}
                    </p>
                    <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-main sm:text-[1.7rem]">
                        {greeting}{currentUser?.name ? <span className="text-primary">، {String(currentUser.name).split(' ')[0]}</span> : null}
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    {activeShift ? (
                        <span className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-xs font-black text-emerald-500">
                            {isAr ? 'وردية نشطة' : 'Shift open'}
                        </span>
                    ) : (
                        <span className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs font-black text-amber-500">
                            {isAr ? 'لا وردية' : 'No shift'}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => updateSettings({ layoutMode: 'classic' })}
                        className="flex items-center gap-2 rounded-2xl border border-border/30 bg-card/70 px-4 py-2.5 text-xs font-black text-muted backdrop-blur transition-colors hover:text-main"
                    >
                        <LayoutDashboard size={15} />
                        {isAr ? 'الكلاسيكي' : 'Classic'}
                    </button>
                </div>
            </header>

            {/* Search */}
            <div className="relative mb-5">
                <Search size={17} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted start-4" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={isAr ? 'ابحث عن شاشة… (كاشير، مخزون، خزينة)' : 'Search screens…'}
                    className="theme-input w-full py-3.5 ps-11 text-sm"
                    aria-label={isAr ? 'بحث' : 'Search'}
                />
                {query && (
                    <button type="button" onClick={() => setQuery('')} className="absolute top-1/2 -translate-y-1/2 text-muted hover:text-main end-4" aria-label={isAr ? 'مسح' : 'Clear'}>
                        <X size={16} />
                    </button>
                )}
            </div>

            {query.trim() ? (
                <section>
                    <p className="tiles-section-label mb-3">{isAr ? `نتائج (${filtered.length})` : `Results (${filtered.length})`}</p>
                    {filtered.length === 0 ? (
                        <p className="rounded-2xl border border-border/30 bg-card/60 p-8 text-center text-sm font-bold text-muted">
                            {isAr ? 'لا توجد شاشة بهذا الاسم' : 'No screens match'}
                        </p>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                            {filtered.map((entry, i) => renderTile(entry, i))}
                        </div>
                    )}
                </section>
            ) : (
                <>
                    {/* ── Up Next: smart suggestions from live alerts ── */}
                    <section className="mb-6">
                        <p className="tiles-section-label mb-3">
                            <Flame size={13} className="text-primary" />
                            {isAr ? 'الأهم الآن' : 'Up next'}
                        </p>
                        <div className="grid gap-2.5 lg:grid-cols-3">
                            {upNext.length === 0 ? (
                                <div className="upnext-row" style={{ '--tile-delay': '0ms' } as React.CSSProperties}>
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-500">
                                        <CheckCircle2 size={19} />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-black text-main">{isAr ? 'كل حاجة تمام' : 'All clear'}</span>
                                        <span className="block truncate text-[11px] font-bold text-muted">{isAr ? 'لا توجد تنبيهات تحتاج تدخل' : 'Nothing needs attention'}</span>
                                    </span>
                                </div>
                            ) : upNext.map((n, i) => {
                                const meta = SEV_META[n.severity];
                                const Icon = meta.Icon;
                                return (
                                    <button
                                        key={n.id}
                                        type="button"
                                        onClick={() => { markNotifRead(n.id); if (n.link) navigate(n.link); }}
                                        className="upnext-row"
                                        style={{ '--tile-delay': `${i * 70}ms` } as React.CSSProperties}
                                    >
                                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${meta.chip}`}>
                                            <Icon size={19} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-black text-main">{isAr ? n.titleAr : n.title}</span>
                                            <span className="block truncate text-[11px] font-bold text-muted">
                                                {isAr ? n.bodyAr : n.body}{n.createdAt ? ` · ${timeAgo(n.createdAt)}` : ''}
                                            </span>
                                        </span>
                                        <ChevronLeft size={17} className={`shrink-0 text-muted ${isAr ? '' : 'rotate-180'}`} />
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* ── Hero bento: POS pulse + live ops + alerts ── */}
                    {showHeroes && (
                        <section className="mb-7 grid gap-3 lg:grid-cols-3">
                            {canPos && (
                                <ModuleTile
                                    icon={ClipboardCheck}
                                    title={isAr ? 'نقطة البيع' : 'Point of Sale'}
                                    sub={`${isAr ? `إيراد اليوم ${fmtMoney(ops.revenue)}` : `Today ${fmtMoney(ops.revenue)}`} · ${isAr ? `${ops.active} طلب نشط` : `${ops.active} active`}`}
                                    label={isAr ? 'نقطة البيع' : 'Point of Sale'}
                                    accentKey="emerald"
                                    badge={ops.active}
                                    live={ops.active === 0}
                                    count={ops.active}
                                    meta={(
                                        <span>
                                            <span className="spark-bars mt-2" aria-hidden="true">
                                                {ops.hours.map((h, i) => (
                                                    <span key={i} className="spark-bar" style={{ height: `${h}%` }} />
                                                ))}
                                            </span>
                                            <span className="mt-1 block text-[10px] font-bold text-white/70">
                                                {isAr ? 'الطلبات آخر 12 ساعة' : 'Orders · last 12h'}
                                            </span>
                                        </span>
                                    )}
                                    variant="hero"
                                    delay={0}
                                    spanClass="lg:col-span-2 lg:row-span-2"
                                    stretch
                                    onOpen={() => openTile('/pos')}
                                />
                            )}
                            {/* Live ops widget */}
                            <div className="tile-widget" style={{ '--tile-delay': '80ms', ...accentStyle('#06b6d4', 'rgba(6,182,212,0.3)') } as React.CSSProperties}>
                                <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-muted">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                    {isAr ? 'التشغيل الآن' : 'Live now'}
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { v: ops.active, l: isAr ? 'نشط' : 'Active', path: '/orders', Icon: ClipboardCheck, c: '#3b82f6' },
                                        { v: ops.preparing, l: isAr ? 'تحضير' : 'Firing', path: '/kds', Icon: ChefHat, c: '#f59e0b' },
                                        { v: ops.out, l: isAr ? 'طيارين' : 'Riders', path: '/dispatch', Icon: Bike, c: '#8b5cf6' },
                                    ].map((s) => (
                                        <button
                                            key={s.l}
                                            type="button"
                                            disabled={!can(s.path)}
                                            onClick={() => openTile(s.path)}
                                            className="rounded-2xl border border-border/30 bg-elevated/40 p-2.5 text-center transition-transform hover:scale-[1.04] active:scale-95 disabled:opacity-40"
                                        >
                                            <s.Icon size={15} className="mx-auto" style={{ color: s.c }} />
                                            <span className="mt-1 block text-lg font-black tabular-nums text-main">{s.v}</span>
                                            <span className="block text-[10px] font-bold text-muted">{s.l}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Alerts widget */}
                            <div className="tile-widget" style={{ '--tile-delay': '140ms', ...accentStyle('#f59e0b', 'rgba(245,158,11,0.3)') } as React.CSSProperties}>
                                <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-muted">
                                    <Bell size={12} className="text-amber-500" />
                                    {isAr ? 'تحتاج انتباه' : 'Needs attention'}
                                </p>
                                <div className="flex items-center gap-2">
                                    {can('/approvals') && (
                                        <button type="button" onClick={() => openTile('/approvals')} className="flex flex-1 items-center justify-between rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 transition-transform hover:scale-[1.02] active:scale-95">
                                            <span className="text-xs font-black text-amber-600 dark:text-amber-400">{isAr ? 'تنبيهات' : 'Alerts'}</span>
                                            <span className="text-xl font-black tabular-nums text-amber-600 dark:text-amber-400">{notifUnread}</span>
                                        </button>
                                    )}
                                    {can('/mail') && (
                                        <button type="button" onClick={() => openTile('/mail')} className="flex flex-1 items-center justify-between rounded-2xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-3 transition-transform hover:scale-[1.02] active:scale-95">
                                            <span className="flex items-center gap-1.5 text-xs font-black text-rose-500"><Mail size={13} />{isAr ? 'رسائل' : 'Mail'}</span>
                                            <span className="text-xl font-black tabular-nums text-rose-500">{msgUnread}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* ── Quick actions ── */}
                    {showHeroes && (
                        <section className="mb-7 flex flex-wrap gap-2.5">
                            {QUICK_ACTIONS.filter((a) => can(a.path)).map((a, i) => (
                                <button
                                    key={a.path}
                                    type="button"
                                    onClick={() => openTile(a.path)}
                                    className="qa-chip"
                                    style={{ '--tile-delay': `${i * 60}ms`, ...accentStyle(a.hex, `${a.hex}66`) } as React.CSSProperties}
                                >
                                    <a.Icon size={15} />
                                    {isAr ? a.ar : a.en}
                                </button>
                            ))}
                        </section>
                    )}

                    {/* ── Pinned + recent (compact) ── */}
                    {favItems.length > 0 && (
                        <section className="mb-7">
                            <p className="tiles-section-label mb-3">
                                <Star size={13} className="text-amber-500" />
                                {isAr ? 'المثبتة' : 'Pinned'}
                            </p>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                                {favItems.map((entry, i) => renderTile(entry, i))}
                            </div>
                        </section>
                    )}

                    {recentItems.length > 0 && (
                        <section className="mb-7">
                            <p className="tiles-section-label mb-3">
                                <Clock3 size={13} />
                                {isAr ? 'الأخيرة' : 'Recent'}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {recentItems.map(({ item }) => {
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={item.path}
                                            type="button"
                                            onClick={() => openTile(item.path)}
                                            className="flex items-center gap-2 rounded-2xl border border-border/30 bg-card/70 px-4 py-2.5 text-xs font-black text-main backdrop-blur transition-transform hover:scale-[1.03] active:scale-95"
                                        >
                                            <Icon size={14} className="text-primary" />
                                            {isAr ? item.labelAr : item.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ── Sections bento: leader + tiles ── */}
                    {grouped.map((group) => (
                        <section key={`${group.ar}|${group.en}`} className="mb-7">
                            <p className="tiles-section-label mb-3">{isAr ? group.ar : group.en}</p>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                                {group.entries.map((entry, i) => renderTile(entry, i, i === 0 && group.entries.length > 3 ? 'leader' : 'standard'))}
                            </div>
                        </section>
                    ))}
                </>
            )}
        </div>
    );
};

export default TilesView;
