import React, { useMemo, useEffect, useState, useRef, useCallback, useTransition } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
    PanelLeftClose,
    PanelLeftOpen,
    Menu,
    LogOut,
    Wifi,
    WifiOff,
    Search,
    X,
    AlertTriangle,
    CheckCircle,
    Sparkles,
    ChevronRight,
    Bot,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../../stores/useAuthStore';
import { useOrderStore } from '../../stores/useOrderStore';
import { useFinanceStore } from '../../stores/useFinanceStore';
import { useAIWidgetStore } from '../../stores/useAIWidgetStore';
import { syncService } from '../../services/syncService';
import { NAV_SECTIONS, CONTEXTUAL_NAV_MAP } from './navigation';
import { loaders } from '../../routes';
import { UserRole } from '../../types';
import BranchContextSwitcher from './BranchContextSwitcher';

/* Map nav item paths to route loader keys for hover preloading */
const PATH_LOADER_MAP: Record<string, string> = {
    '/': 'Dashboard', '/pos': 'POS', '/orders': 'OrdersCenter', '/kds': 'KDS',
    '/pickup': 'PickupScreen', '/kiosk': 'SelfOrderingKiosk',
    '/floor-designer': 'FloorDesigner', '/refunds': 'RefundManager', '/day-close': 'DayCloseHub',
    '/call-center': 'CallCenter', '/call-center-manager': 'CallCenterManager', '/crm': 'CRM',
    '/zones': 'ZonesManager', '/dispatch': 'DispatchHub', '/drivers': 'DriversHub', '/driver': 'DriverDashboard', '/platforms': 'PlatformAggregator',
    '/whatsapp': 'WhatsAppHub', '/mail': 'MailHub', '/menu': 'MenuManager', '/recipes': 'RecipeManager',
    '/receipt-designer': 'ReceiptDesigner',
    '/printers': 'PrinterManager', '/inventory': 'Inventory', '/stock-requests': 'StockRequests', '/production': 'Production',
    '/wastage': 'WastageManager', '/butchery': 'ButcheryManager', '/inventory-intelligence': 'InventoryIntelligence',
    '/finance': 'Finance', '/treasury': 'TreasuryHub', '/expenses': 'Expenses', '/reports': 'Reports', '/fiscal': 'FiscalHub',
    '/approvals': 'ApprovalCenter', '/user-management': 'UserManagement',
    '/forensics': 'ForensicsHub', '/franchise': 'FranchiseManager',
    '/marketing': 'CampaignHub', '/ai-assistant': 'AIAssistant', '/ai-insights': 'AIInsights',
    '/hr': 'HRHub', '/hr-guide': 'HRUserGuide', '/hr-settings': 'HRSettingsManager',
    '/attendance': 'AttendanceManager', '/payroll': 'PayrollManager', '/migration': 'DataMigrationWizard',
    '/biometric-devices': 'BiometricDeviceManager', '/scheduling': 'SchedulingManager', '/shift-tasks': 'TaskChecklistManager',
    '/admin-dashboard': 'AdminDashboardPage', '/roles': 'RolesPermissions', '/settings': 'SettingsHub',
    '/offline-conflicts': 'OfflineConflictCenter',
};

interface ContextRailProps { onOpenCommand: () => void; }

const ContextRail: React.FC<ContextRailProps> = ({ onOpenCommand }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { branches, currentUser, hasPermission, isSidebarCollapsed, language, logout, setSidebarCollapsed, toggleSidebar } = useAuthStore(
        useShallow((state) => ({
            branches: state.branches,
            currentUser: state.settings.currentUser,
            hasPermission: state.hasPermission,
            isSidebarCollapsed: state.isSidebarCollapsed,
            language: state.settings.language,
            logout: state.logout,
            setSidebarCollapsed: state.setSidebarCollapsed,
            toggleSidebar: state.toggleSidebar,
        }))
    );
    const setDiscount = useOrderStore((state) => state.setDiscount);
    const discount = useOrderStore((state) => state.discount);
    const activeShift = useFinanceStore((state) => state.activeShift);
    const setIsShiftDrawerOpen = useFinanceStore((state) => state.setIsShiftDrawerOpen);

    const lang = (language || 'en') as 'en' | 'ar';
    const isRtl = lang === 'ar';
    const user = currentUser;
    const isCC = user?.role === UserRole.CALL_CENTER;
    const pinned = !isSidebarCollapsed;

    const [mobileOpen, setMobileOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [selectionClosing, setSelectionClosing] = useState(false);
    const [clickedNavId, setClickedNavId] = useState<string | null>(null);
    const [syncStats, setSyncStats] = useState({ total: 0, pending: 0, failed: 0, synced: 0 });
    const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
    const clickFxTimerRef = useRef<number | null>(null);
    const clickFxRafRef = useRef<number | null>(null);
    const toggleAssistant = useAIWidgetStore(state => state.toggleAssistant);

    // Route changes render heavy lazy pages — run them as a transition so the
    // rail click stays responsive. Keep the browser document view-transition
    // off here: it snapshots the fixed rail during navigation and can make
    // labels flash or freeze while the rail collapses.
    const [, startNavTransition] = useTransition();
    const navigateTransition = useCallback((path: string) => {
        startNavTransition(() => navigate(path));
    }, [navigate]);

    const isRouteActive = useCallback((path: string) => {
        const [pathname, hash] = path.split('#');
        if (pathname === '/') return location.pathname === '/';
        if (hash) return location.pathname === pathname && location.hash === `#${hash}`;
        return location.pathname === pathname || location.pathname.startsWith(`${pathname}/`);
    }, [location.hash, location.pathname]);

    const filteredSections = useMemo(() => {
        const baseSections = CONTEXTUAL_NAV_MAP[location.pathname] || NAV_SECTIONS;
        return baseSections
            .map((section) => ({
                ...section,
                items: section.items.filter((item) => hasPermission(item.permission)),
            }))
            .filter((section) => section.items.length > 0);
    }, [hasPermission, location.pathname]);

    const routeSectionId = useMemo(() => (
        filteredSections.find((section) =>
            section.items.some((item) => isRouteActive(item.path))
        )?.id ?? null
    ), [filteredSections, isRouteActive]);

    useEffect(() => {
        setSelectedSectionId((current) => {
            if (routeSectionId) return routeSectionId;
            if (current && filteredSections.some((section) => section.id === current)) return current;
            return filteredSections[0]?.id ?? null;
        });
    }, [filteredSections, routeSectionId]);

    const selectedSection = useMemo(() => (
        filteredSections.find((section) => section.id === selectedSectionId) ?? filteredSections[0]
    ), [filteredSections, selectedSectionId]);

    /* Longest-prefix wins for item highlighting: /inventory must not stay
       lit when /inventory/suppliers is the actual page (both prefix-match).
       Section headers keep the loose prefix check so the group still opens. */
    const isBestRouteActive = useCallback((path: string) => {
        if (!isRouteActive(path)) return false;
        const [pathname] = path.split('#');
        return !filteredSections.some((section) =>
            section.items.some((item) => {
                if (item.path === path) return false;
                const [other] = item.path.split('#');
                return other.length > pathname.length && isRouteActive(item.path);
            })
        );
    }, [filteredSections, isRouteActive]);

    /* Hover preload — start loading the page component when mouse enters */
    const preloadedRef = useRef<Set<string>>(new Set());
    const handlePreload = useCallback((path: string) => {
        const key = PATH_LOADER_MAP[path];
        if (!key || preloadedRef.current.has(key)) return;
        const loader = (loaders as Record<string, () => Promise<unknown>>)[key];
        if (loader) {
            preloadedRef.current.add(key);
            loader();
        }
    }, []);

    useEffect(() => {
        // Idle prefetch of likely-next routes — deliberately conservative:
        // hover prefetch (above) already covers mouse users. Auto-prefetch
        // waits until the app is long idle so it never competes with first
        // paint/interaction, and stays off on data-saver / slow networks.
        const likelyNextPaths = Array.from(new Set(
            filteredSections.flatMap((section) => section.items.map((item) => item.path))
        )).filter((path) => path !== location.pathname).slice(0, 2);
        if (likelyNextPaths.length === 0) return;

        const connection = (navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string };
        }).connection;
        if (connection?.saveData) return;
        if (connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') return;

        const preloadLikelyRoutes = () => {
            if (document.visibilityState === 'hidden') return;
            likelyNextPaths.forEach(handlePreload);
        };
        const timeoutId = window.setTimeout(preloadLikelyRoutes, 10000);
        return () => window.clearTimeout(timeoutId);
    }, [filteredSections, handlePreload, location.pathname]);

    useEffect(() => {
        let mounted = true;
        const refresh = async () => {
            try {
                const stats = await syncService.getQueueStats();
                if (mounted) {
                    setSyncStats(stats);
                }
            } catch {
                // ignore sync status errors in the shell
            }
        };
        const onOnline = () => {
            setIsOnline(true);
            refresh();
        };
        const onOffline = () => {
            setIsOnline(false);
            refresh();
        };

        refresh();
        const id = window.setInterval(refresh, 8000);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        return () => {
            mounted = false;
            window.clearInterval(id);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    useEffect(() => {
        const open = () => setMobileOpen(true);
        window.addEventListener('rf:open-rail', open as EventListener);
        return () => window.removeEventListener('rf:open-rail', open as EventListener);
    }, []);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = mobileOpen ? 'hidden' : previousOverflow;
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [mobileOpen]);

    useEffect(() => {
        if (!selectionClosing) return;
        const timeoutId = window.setTimeout(() => setSelectionClosing(false), 420);
        return () => window.clearTimeout(timeoutId);
    }, [selectionClosing]);

    useEffect(() => () => {
        if (clickFxTimerRef.current !== null) window.clearTimeout(clickFxTimerRef.current);
        if (clickFxRafRef.current !== null) window.cancelAnimationFrame(clickFxRafRef.current);
    }, []);

    const handleRailPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--rail-spot-x', `${event.clientX - rect.left}px`);
        event.currentTarget.style.setProperty('--rail-spot-y', `${event.clientY - rect.top}px`);
    }, []);

    const handleRailPointerLeave = useCallback((event: React.PointerEvent<HTMLElement>) => {
        setSelectionClosing(false);
        event.currentTarget.style.removeProperty('--rail-spot-x');
        event.currentTarget.style.removeProperty('--rail-spot-y');
    }, []);

    const triggerNavClickFx = useCallback((id: string, event: React.PointerEvent<HTMLAnchorElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--rail-click-x', `${event.clientX - rect.left}px`);
        event.currentTarget.style.setProperty('--rail-click-y', `${event.clientY - rect.top}px`);
        if (clickFxTimerRef.current !== null) window.clearTimeout(clickFxTimerRef.current);
        if (clickFxRafRef.current !== null) window.cancelAnimationFrame(clickFxRafRef.current);
        setClickedNavId(null);
        clickFxRafRef.current = window.requestAnimationFrame(() => {
            setClickedNavId(id);
            clickFxTimerRef.current = window.setTimeout(() => setClickedNavId(null), 720);
        });
    }, []);

    const handleToggleSidebar = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        if (pinned) {
            event.currentTarget.blur();
            setSelectionClosing(true);
        }
        toggleSidebar();
    }, [pinned, toggleSidebar]);

    const closeRailAfterSelection = useCallback(() => {
        setMobileOpen(false);
        if (window.matchMedia('(min-width: 1024px)').matches) {
            setSelectionClosing(true);
            setSidebarCollapsed(true);
        }
    }, [setSidebarCollapsed]);

    const runRailAction = useCallback((action: () => void) => (
        event: React.MouseEvent<HTMLButtonElement>
    ) => {
        // A focused quick-action keeps :focus-within active and visually holds
        // the rail open; release focus before collapsing it.
        event.currentTarget.blur();
        closeRailAfterSelection();
        action();
    }, [closeRailAfterSelection]);

    const handleLogout = useCallback(() => {
        logout();
        navigate('/login');
    }, [logout, navigate]);

    const syncHasError = syncStats.failed > 0;
    const syncHasPending = syncStats.pending > 0;
    return (
        <>
            {mobileOpen && (
                <div
                    className="xl:hidden fixed inset-0 z-[75]"
                    style={{ background: 'rgba(2, 8, 23, 0.52)' }}
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <button
                onClick={() => setMobileOpen(true)}
                className={`xl:hidden fixed top-3 z-[71] p-2.5 rounded-xl border shadow-lg bg-card/95 text-main border-border/30 ${isRtl ? 'right-3' : 'left-3'}`}
                aria-label={lang === 'ar' ? 'فتح القائمة' : 'Open menu'}
            >
                <Menu size={18} />
            </button>

            <aside
                className={`
                    workspace-rail workspace-rail-v2
                    ${pinned ? 'rail-pinned' : ''}
                    ${mobileOpen ? 'rail-mobile-open' : ''}
                    ${selectionClosing ? 'rail-selection-closing' : ''}
                    xl:translate-x-0
                `}
                onPointerMove={handleRailPointerMove}
                onPointerLeave={handleRailPointerLeave}
                style={{
                    fontFamily: isRtl ? 'var(--font-arabic)' : 'var(--font-body)',
                    [isRtl ? 'right' : 'left']: 'var(--rail-margin, 8px)',
                }}
            >
                <div className="rail-v2-surface">
                <div className="sidebar-hero shrink-0">
                    <div className="sidebar-hero-top">
                        <button
                            type="button"
                            className="sidebar-logomark shrink-0 overflow-visible"
                            onClick={runRailAction(() => navigateTransition('/'))}
                            aria-label={lang === 'ar' ? 'العودة للوحة القيادة' : 'Go to dashboard'}
                        >
                            <img src="/logo.png?v=6" alt="Coduis Xen ERP Systems" className="h-full w-full object-contain" draggable={false} />
                        </button>
                        <div className="sidebar-brand-lockup" aria-hidden="true">
                            <strong>CODUIS XEN</strong>
                            <span>{lang === 'ar' ? 'نظام تشغيل المطاعم' : 'Restaurant operations'}</span>
                        </div>
                        <button
                            onClick={handleToggleSidebar}
                            className="sidebar-pin-btn sidebar-collapse-toggle hidden md:flex shrink-0 ms-auto"
                            title={pinned ? (lang === 'ar' ? 'تصغير القائمة' : 'Collapse sidebar') : (lang === 'ar' ? 'توسيع القائمة' : 'Expand sidebar')}
                            aria-label={pinned ? (lang === 'ar' ? 'تصغير القائمة' : 'Collapse sidebar') : (lang === 'ar' ? 'توسيع القائمة' : 'Expand sidebar')}
                            aria-pressed={pinned}
                        >
                            {pinned ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
                        </button>
                        {mobileOpen && (
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="xl:hidden sidebar-collapse-btn shrink-0 ms-auto"
                                aria-label={lang === 'ar' ? 'إغلاق القائمة' : 'Close menu'}
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>

                </div>

                {branches.length > 0 && (
                    <div className="sidebar-branch-context shrink-0">
                        <BranchContextSwitcher variant="sidebar" />
                    </div>
                )}

                {isCC && (
                    <div className="mx-2 mb-2 shrink-0">
                        <div className="sidebar-panel">
                            <div className="sidebar-panel-title">{lang === 'ar' ? 'أدوات المشغل' : 'Operator Tools'}</div>
                            <div className="flex gap-1 flex-wrap mb-2">
                                {[0, 5, 10, 15, 20].map((value) => (
                                    <button
                                        key={value}
                                        onClick={() => setDiscount(value)}
                                        className={`sidebar-chip ${discount === value ? 'sidebar-chip-active' : ''}`}
                                    >
                                        {value}%
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <nav className="sidebar-nav sidebar-nav-shell sidebar-workspace-tree flex-1" aria-label={lang === 'ar' ? 'التنقل بين أقسام النظام' : 'System navigation'}>
                    <div className="sidebar-tree-caption sidebar-text-block">
                        <span>{lang === 'ar' ? 'أقسام النظام' : 'Workspaces'}</span>
                        <small>{filteredSections.length}</small>
                    </div>
                    {filteredSections.map((section, idx) => {
                        const SectionIcon = section.icon;
                        const expanded = section.id === selectedSection?.id;
                        const containsCurrentPage = section.id === routeSectionId;
                        return (
                            <section key={section.id} className={`sidebar-workspace-group ${expanded ? 'is-expanded' : ''} ${containsCurrentPage ? 'contains-current-page' : ''}`}>
                                <button
                                    type="button"
                                    id={`workspace-heading-${section.id}`}
                                    className="sidebar-workspace-trigger"
                                    aria-expanded={expanded}
                                    aria-controls={`workspace-pages-${section.id}`}
                                    title={lang === 'ar' ? section.labelAr : section.label}
                                    onClick={() => setSelectedSectionId(section.id)}
                                >
                                    <span className="sidebar-workspace-symbol">{SectionIcon && <SectionIcon size={19} aria-hidden="true" />}</span>
                                    <span className="sidebar-workspace-name">{lang === 'ar' ? section.labelAr : section.label}</span>
                                    <span className="sidebar-section-index sidebar-workspace-count" aria-hidden="true">{String(idx + 1).padStart(2, '0')}</span>
                                    <ChevronRight className="sidebar-workspace-chevron" size={15} aria-hidden="true" />
                                </button>
                                <div
                                    id={`workspace-pages-${section.id}`}
                                    className="sidebar-workspace-pages"
                                    hidden={!expanded}
                                    role="group"
                                    aria-labelledby={`workspace-heading-${section.id}`}
                                >
                                {section.items.map((item, itemIdx) => {
                                            const Icon = item.icon;
                                            const isActive = isBestRouteActive(item.path);
                                            return (
                                                <NavLink
                                                    key={item.id}
                                                    to={item.path}
                                                    onClick={(event) => {
                                                        // Same destination, same active styling — but the heavy
                                                        // page render happens in a transition (no frozen click).
                                                        // Modifier/middle clicks keep native new-tab behavior.
                                                        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                                                         event.preventDefault();
                                                         event.currentTarget.blur();
                                                         closeRailAfterSelection();
                                                         navigateTransition(item.path);
                                                    }}
                                                    onMouseEnter={() => handlePreload(item.path)}
                                                    onPointerDown={(event) => {
                                                        handlePreload(item.path);
                                                        triggerNavClickFx(item.id, event);
                                                    }}
                                                    onFocus={() => handlePreload(item.path)}
                                                    className={`sidebar-nav-item ${isActive ? 'sidebar-nav-item-active' : ''} ${clickedNavId === item.id ? 'sidebar-nav-item-clicked' : ''}`}
                                                    style={{ animationDelay: `${itemIdx * 30}ms` }}
                                                    title={lang === 'ar' ? item.labelAr : item.label}
                                                >
                                                    <span className="sidebar-nav-glow" />
                                                    <span className="sidebar-nav-ripple" aria-hidden="true" />
                                                    <span className={`sidebar-nav-icon ${isActive ? 'sidebar-nav-icon-active' : ''}`}>
                                                        <Icon size={17} strokeWidth={2.15} />
                                                    </span>
                                                    <span className="sidebar-nav-label">{lang === 'ar' ? item.labelAr : item.label}</span>
                                                    <span className="sidebar-nav-hint">
                                                        <ChevronRight size={11} />
                                                    </span>
                                                    {isActive && <span className="sidebar-nav-dot" />}
                                                </NavLink>
                                            );
                                })}
                                </div>
                            </section>
                        );
                    })}
                </nav>
                <div className="sidebar-footer shrink-0">
                    <div className="sidebar-sync-bar">
                        <div className="flex items-center gap-1.5">
                            {isOnline ? <Wifi size={9} className="text-emerald-500" /> : <WifiOff size={9} className="text-rose-500" />}
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${isOnline ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {isOnline ? (lang === 'ar' ? 'متصل' : 'Live') : (lang === 'ar' ? 'غير متصل' : 'Offline')}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 ms-auto">
                            {syncHasError && (
                                <span className="sidebar-sync-badge danger">
                                    <AlertTriangle size={7} />{syncStats.failed}
                                </span>
                            )}
                            {syncHasPending && (
                                <span className="sidebar-sync-badge warn">
                                    {syncStats.pending} {lang === 'ar' ? 'انتظار' : 'wait'}
                                </span>
                            )}
                            {!syncHasError && !syncHasPending && syncStats.synced > 0 && (
                                <span className="sidebar-sync-badge ok">
                                    <CheckCircle size={7} />{lang === 'ar' ? 'مزامن' : 'synced'}
                                </span>
                            )}
                        </div>
                    </div>

                    {activeShift && (
                        <div className="px-2 pb-0.5">
                             <button
                                 onClick={runRailAction(() => setIsShiftDrawerOpen(true))}
                                className="sidebar-close-shift"
                            >
                                <LogOut size={12} />
                                <span className="sidebar-nav-label">{lang === 'ar' ? 'إغلاق الوردية' : 'Close Shift'}</span>
                                <span className="sidebar-nav-label ms-auto text-[8px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                                    {lang === 'ar' ? 'نشطة' : 'Active'}
                                </span>
                            </button>
                        </div>
                    )}
                    <div className="sidebar-quick-actions" role="group" aria-label={lang === 'ar' ? 'إجراءات سريعة' : 'Quick actions'}>
                         <button
                             onClick={runRailAction(onOpenCommand)}
                            className="sidebar-quick-action"
                            title={lang === 'ar' ? 'البحث السريع (Ctrl K)' : 'Quick search (Ctrl K)'}
                            aria-label={lang === 'ar' ? 'فتح البحث السريع (Ctrl K)' : 'Open quick search (Ctrl K)'}
                        >
                            <Search size={14} />
                        </button>

                         <button
                             onClick={runRailAction(toggleAssistant)}
                            className="sidebar-quick-action is-primary"
                            title={lang === 'ar' ? 'المساعد الذكي' : 'AI Assistant'}
                            aria-label={lang === 'ar' ? 'فتح المساعد الذكي' : 'Open AI assistant'}
                        >
                            <Bot size={14} />
                        </button>

                         <button
                             onClick={runRailAction(() => navigateTransition('/theme-lab'))}
                            className="sidebar-quick-action"
                            title={lang === 'ar' ? 'إعدادات المظهر' : 'Appearance Settings'}
                            aria-label={lang === 'ar' ? 'إعدادات المظهر' : 'Appearance Settings'}
                        >
                            <Sparkles size={14} />
                        </button>
                    </div>
                </div>
                </div>
            </aside>
        </>
    );
};

export default React.memo(ContextRail);
