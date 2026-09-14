import React, { lazy, Suspense, useMemo, useEffect, useState, useRef, useCallback, useTransition } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
    Pin,
    PinOff,
    Menu,
    LogOut,
    Wifi,
    WifiOff,
    Search,
    X,
    AlertTriangle,
    CheckCircle,
    ChevronDown,
    Sparkles,
    ChevronRight,
    LayoutGrid,
    Bell,
    Mail,
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
    '/wastage': 'WastageManager', '/inventory-intelligence': 'InventoryIntelligence',
    '/finance': 'Finance', '/treasury': 'TreasuryHub', '/expenses': 'Expenses', '/reports': 'Reports', '/fiscal': 'FiscalHub',
    '/approvals': 'ApprovalCenter', '/user-management': 'UserManagement',
    '/forensics': 'ForensicsHub', '/franchise': 'FranchiseManager',
    '/marketing': 'CampaignHub', '/ai-assistant': 'AIAssistant', '/ai-insights': 'AIInsights',
    '/hr': 'HRHub', '/hr-guide': 'HRUserGuide', '/hr-settings': 'HRSettingsManager',
    '/attendance': 'AttendanceManager', '/payroll': 'PayrollManager', '/migration': 'DataMigrationWizard',
    '/biometric-devices': 'BiometricDeviceManager', '/scheduling': 'SchedulingManager', '/shift-tasks': 'TaskChecklistManager',
    '/admin-dashboard': 'AdminDashboardPage', '/roles': 'RolesPermissions', '/settings': 'SettingsHub',
};

const AppearanceModal = lazy(() => import('./AppearanceModal'));

interface ContextRailProps { onOpenCommand: () => void; }

const ContextRail: React.FC<ContextRailProps> = ({ onOpenCommand }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { branches, currentUser, hasPermission, isSidebarCollapsed, language, logout, toggleSidebar, layoutMode, updateSettings } = useAuthStore(
        useShallow((state) => ({
            branches: state.branches,
            currentUser: state.settings.currentUser,
            hasPermission: state.hasPermission,
            isSidebarCollapsed: state.isSidebarCollapsed,
            language: state.settings.language,
            logout: state.logout,
            toggleSidebar: state.toggleSidebar,
            layoutMode: state.settings.layoutMode || 'classic',
            updateSettings: state.updateSettings,
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
    const [showMessagesPanel, setShowMessagesPanel] = useState(false);
    const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
    const [syncStats, setSyncStats] = useState({ total: 0, pending: 0, failed: 0, synced: 0 });
    const [showAppearanceModal, setShowAppearanceModal] = useState(false);
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
    const navRef = useRef<HTMLElement>(null);
    const toggleAssistant = useAIWidgetStore(state => state.toggleAssistant);

    // Route changes render heavy lazy pages — run them as a transition so the
    // rail click (and any typing) stays responsive while the page reconciles.
    // viewTransition hands the swap to the browser's View Transitions API
    // (native-feel morph, automatic fallback where unsupported).
    const [, startNavTransition] = useTransition();
    const navigateTransition = useCallback((path: string) => {
        startNavTransition(() => navigate(path, { viewTransition: true }));
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

    useEffect(() => {
        const initialMap: Record<string, boolean> = {};
        filteredSections.forEach((section) => {
            initialMap[section.id] = true;
        });
        setOpenSections((prev) => (Object.keys(prev).length === 0 ? initialMap : prev));
    }, [filteredSections]);

    /* Auto-expand the section containing the active route */
    useEffect(() => {
        const activeSection = filteredSections.find((section) =>
            section.items.some((item) => isRouteActive(item.path))
        );
        if (activeSection) {
            setOpenSections((prev) => ({ ...prev, [activeSection.id]: true }));
        }
    }, [filteredSections, isRouteActive]);

    const toggleSection = useCallback((id: string) => {
        setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
    }, []);

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

    const handleLogout = useCallback(() => {
        logout();
        navigate('/login');
    }, [logout, navigate]);

    const syncHasError = syncStats.failed > 0;
    const syncHasPending = syncStats.pending > 0;
    const userInitials = user?.name?.split(' ').map((word) => word[0]).join('').substring(0, 2).toUpperCase() || 'AD';
    const totalNavItems = filteredSections.reduce((sum, section) => sum + section.items.length, 0);

    return (
        <>
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-[75]"
                    style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <button
                onClick={() => setMobileOpen(true)}
                className={`lg:hidden fixed top-3 z-[71] p-2.5 rounded-xl border shadow-lg bg-card/95 text-main border-border/30 ${isRtl ? 'right-3' : 'left-3'}`}
                aria-label={lang === 'ar' ? 'فتح القائمة' : 'Open menu'}
            >
                <Menu size={18} />
            </button>

            <aside
                className={`
                    workspace-rail
                    ${pinned ? 'rail-pinned' : ''}
                    ${mobileOpen ? 'rail-mobile-open' : ''}
                    lg:translate-x-0
                `}
                style={{
                    fontFamily: isRtl ? 'var(--font-arabic)' : 'var(--font-body)',
                    [isRtl ? 'right' : 'left']: 'var(--rail-margin, 8px)',
                }}
            >
                <div className="sidebar-hero shrink-0">
                    <div className="sidebar-hero-top">
                        <button
                            type="button"
                            className="sidebar-logomark shrink-0"
                            onClick={() => navigateTransition('/')}
                            aria-label={lang === 'ar' ? 'العودة للوحة القيادة' : 'Go to dashboard'}
                        >
                            <span>RF</span>
                        </button>
                        <div className="sidebar-text-block sidebar-brand-meta min-w-0 flex-1">
                            <div className="text-[12px] font-extrabold tracking-tight text-main leading-none">Coduis Zen</div>
                            <div className="text-[9px] font-semibold text-muted/50 tracking-widest uppercase mt-0.5">
                                {lang === 'ar' ? 'نظام الطعام' : 'Restaurant OS'}
                            </div>
                        </div>
                        <button
                            onClick={toggleSidebar}
                            className="sidebar-pin-btn hidden lg:flex shrink-0 ms-auto"
                            title={pinned ? (lang === 'ar' ? 'إلغاء التثبيت' : 'Unpin sidebar') : (lang === 'ar' ? 'تثبيت السايدبار' : 'Pin sidebar')}
                            aria-label={pinned ? (lang === 'ar' ? 'إلغاء تثبيت القائمة' : 'Unpin sidebar') : (lang === 'ar' ? 'تثبيت القائمة' : 'Pin sidebar')}
                        >
                            {pinned ? <PinOff size={12} /> : <Pin size={12} />}
                        </button>
                        {mobileOpen && (
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="lg:hidden sidebar-collapse-btn shrink-0 ms-auto"
                                aria-label={lang === 'ar' ? 'إغلاق القائمة' : 'Close menu'}
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    <div className="sidebar-text-block sidebar-brand-chip">
                        <span className={`sidebar-brand-status ${isOnline ? 'is-online' : 'is-offline'}`}>
                            {isOnline ? (lang === 'ar' ? 'متصل' : 'Online') : (lang === 'ar' ? 'غير متصل' : 'Offline')}
                        </span>
                    </div>

                    <div className="space-y-2">
                        <button
                            onClick={onOpenCommand}
                            className="sidebar-search-btn"
                            title={lang === 'ar' ? 'فتح البحث' : 'Open Search'}
                            aria-label={lang === 'ar' ? 'فتح البحث السريع' : 'Open quick search'}
                        >
                            <Search size={13} />
                            <span className="sidebar-nav-label">{lang === 'ar' ? 'بحث سريع' : 'Quick Search'}</span>
                            <span className="sidebar-kbd ms-auto sidebar-nav-label">Ctrl K</span>
                        </button>
                        <div className="sidebar-overview">
                            <div className="sidebar-overview-pill">
                                <Sparkles size={10} />
                                <span>{totalNavItems} {lang === 'ar' ? 'مسار' : 'routes'}</span>
                            </div>
                            <div className={`sidebar-overview-pill ${isOnline ? 'is-live' : 'is-offline'}`}>
                                {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                                <span>{isOnline ? (lang === 'ar' ? 'متصل' : 'Live') : (lang === 'ar' ? 'غير متصل' : 'Off')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {branches.length > 0 && (
                    <div className="mx-2 mb-2 shrink-0">
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

                <nav ref={navRef} className="sidebar-nav sidebar-nav-shell flex-1 overflow-y-auto overflow-x-hidden px-1.5">
                    {filteredSections.map((section, idx) => {
                        const isOpen = openSections[section.id] ?? true;
                        const SectionIcon = section.icon;
                        const hasActiveChild = section.items.some((item) => isRouteActive(item.path));
                        return (
                            <div key={section.id} className={`sidebar-nav-group ${idx > 0 ? 'mt-2' : 'mt-0.5'}`}>
                                <button
                                    onClick={() => toggleSection(section.id)}
                                    className={`sidebar-text-block sidebar-section-trigger w-full flex items-center gap-2 group ${hasActiveChild ? 'has-active-child' : ''}`}
                                >
                                    {SectionIcon && (
                                        <span className={`sidebar-section-icon ${hasActiveChild ? 'is-active' : ''}`}>
                                            <SectionIcon size={13} />
                                        </span>
                                    )}
                                    <span className="flex-1 text-start truncate">{lang === 'ar' ? section.labelAr : section.label}</span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="sidebar-section-count">{section.items.length}</span>
                                        <ChevronDown
                                            size={12}
                                            className="text-muted/40 transition-transform duration-250 ease-out"
                                            style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                        />
                                    </div>
                                </button>

                                <div
                                    className="sidebar-section-wrap grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]"
                                    style={{
                                        gridTemplateRows: isOpen ? '1fr' : '0fr',
                                        opacity: isOpen ? 1 : 0,
                                        marginTop: isOpen ? '3px' : '0px',
                                    }}
                                >
                                    <div className="sidebar-section-list flex flex-col gap-0.5 overflow-hidden">
                                        {section.items.map((item, itemIdx) => {
                                            const Icon = item.icon;
                                            const isActive = isRouteActive(item.path);
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
                                                        setMobileOpen(false);
                                                        navigateTransition(item.path);
                                                    }}
                                                    onMouseEnter={() => handlePreload(item.path)}
                                                    onPointerDown={() => handlePreload(item.path)}
                                                    onFocus={() => handlePreload(item.path)}
                                                    className={`sidebar-nav-item ${isActive ? 'sidebar-nav-item-active' : ''}`}
                                                    style={{ animationDelay: isOpen ? `${itemIdx * 30}ms` : '0ms' }}
                                                    title={lang === 'ar' ? item.labelAr : item.label}
                                                >
                                                    <span className="sidebar-nav-glow" />
                                                    <span className={`sidebar-nav-icon ${isActive ? 'sidebar-nav-icon-active' : ''}`}>
                                                        <Icon size={15} />
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
                                </div>
                            </div>
                        );
                    })}
                    <div className="h-3" />
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
                                onClick={() => setIsShiftDrawerOpen(true)}
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
                    <div className="px-2 pb-2 space-y-1">
                        <button
                            onClick={() => toggleAssistant()}
                            className="w-full sidebar-text-block p-1.5 rounded-lg text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center justify-center gap-2 border border-transparent hover:border-indigo-500/20"
                            title={lang === 'ar' ? 'المساعد الذكي' : 'AI Assistant'}
                        >
                            <Bot size={14} />
                            <span className="text-xs font-bold uppercase tracking-widest">{lang === 'ar' ? 'المساعد' : 'AI Agent'}</span>
                        </button>

                        <button
                            onClick={() => {
                                updateSettings({ layoutMode: layoutMode === 'tiles' ? 'classic' : 'tiles' });
                                navigateTransition('/');
                            }}
                            className="w-full sidebar-text-block p-1.5 rounded-lg text-muted hover:text-main hover:bg-elevated transition-colors flex items-center justify-center gap-2"
                            title={lang === 'ar' ? 'التبديل لوضع البلاطات' : 'Switch to tiles view'}
                        >
                            <LayoutGrid size={14} />
                            <span className="text-xs font-semibold">{lang === 'ar' ? 'البلاطات' : 'Tiles'}</span>
                        </button>

                        <button
                            onClick={() => setShowAppearanceModal(true)}
                            className="w-full sidebar-text-block p-1.5 rounded-lg text-muted hover:text-main hover:bg-elevated transition-colors flex items-center justify-center gap-2"
                            title={lang === 'ar' ? 'إعدادات المظهر' : 'Appearance Settings'}
                        >
                            <Sparkles size={14} />
                            <span className="text-xs font-semibold">{lang === 'ar' ? 'المظهر' : 'Theme'}</span>
                        </button>
                    </div>
                </div>
            </aside>
            <Suspense fallback={null}>
                {showAppearanceModal ? (
                    <AppearanceModal isOpen={showAppearanceModal} onClose={() => setShowAppearanceModal(false)} />
                ) : null}
            </Suspense>
        </>
    );
};

export default React.memo(ContextRail);
