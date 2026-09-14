import React, { Suspense, lazy, useCallback, useMemo, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import ContextRail from './common/ContextRail';

import Breadcrumbs from './common/Breadcrumbs';
import { useAuthStore } from '../stores/useAuthStore';
import { usePageTitle } from '../hooks/usePageTitle';
import { useTheme } from '../theme';
import { useAIWidgetStore } from '../stores/useAIWidgetStore';

// GlobalSearch is hidden until Ctrl+K — keep it out of the initial bundle and
// prefetch it when idle so the palette still opens instantly.
const GlobalSearch = lazy(() => import('./common/GlobalSearch'));

const KeyboardShortcuts = lazy(() => import('./common/KeyboardShortcuts'));
const OnlineStatus = lazy(() => import('./common/OnlineStatus'));
const AIWidgetsRenderer = lazy(() => import('./common/AIWidgetsRenderer'));
const AIAssistant = lazy(() => import('./AIAssistant'));
const TilesView = lazy(() => import('./TilesView'));
import { AlertTriangle, LayoutGrid, X } from 'lucide-react';

const localDateKey = () => {
    const value = new Date();
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

const MainLayout: React.FC = () => {
    const { isAuthenticated, language, currentUser, branches, activeBranchId, layoutMode } = useAuthStore(
        useShallow((state) => ({
            isAuthenticated: state.isAuthenticated,
            language: state.settings.language,
            currentUser: state.settings.currentUser,
            branches: state.branches,
            activeBranchId: state.settings.activeBranchId,
            layoutMode: state.settings.layoutMode || 'classic',
        }))
    );
    const location = useLocation();
    const navigate = useNavigate();
    const { config } = useTheme();
    const today = localDateKey();
    const activeBranch = useMemo(() => branches.find((branch) => branch.id === activeBranchId), [branches, activeBranchId]);
    const businessDate = activeBranch?.businessDate || today;
    // Stale only when the branch is still operating on a PAST date. A future
    // business date (set right after an evening day-close) is intentional.
    const staleBusinessDate = Boolean(activeBranch?.businessDate) && businessDate < today;
    const canManageBusinessDate = ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'].includes(String(currentUser?.role || ''));
    const reminderKey = `business-date-reminder:${activeBranchId || 'none'}:${today}`;
    const [isReminderDismissed, setIsReminderDismissed] = useState(false);

    useEffect(() => {
        setIsReminderDismissed(sessionStorage.getItem(reminderKey) === 'dismissed');
    }, [reminderKey]);

    usePageTitle();

    // Idle-prefetch the search palette chunk so Ctrl+K stays instant even
    // though the component is no longer in the initial bundle.
    useEffect(() => {
        const prefetch = () => { void import('./common/GlobalSearch'); };
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            const idleId = (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(prefetch, { timeout: 4000 });
            return () => (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
        }
        const timer = window.setTimeout(prefetch, 2500);
        return () => window.clearTimeout(timer);
    }, []);

    // Role-aware landing prefetch: warm the chunk of the user's OWN landing
    // page while idle (admin/accountant → Dashboard, cashier → POS, kitchen
    // → KDS, call-center → CallCenter, driver → DriverDashboard). The
    // redirect in the effect above then lands on an already-cached chunk —
    // navigation feels instant. Dynamic imports only (no static cycle with
    // routes.tsx), paths mirror routes.tsx loaders so chunk names match.
    useEffect(() => {
        if (!isAuthenticated || !currentUser?.role) return;
        const prefetchLanding = () => {
            switch (currentUser.role) {
                case 'CASHIER':
                case 'WAITER':
                case 'CAPTAIN':
                    void import('../src/features/pos/POS');
                    break;
                case 'KITCHEN_STAFF':
                    void import('./KDS');
                    break;
                case 'CALL_CENTER':
                    void import('./CallCenter');
                    break;
                case 'DRIVER':
                    void import('../src/features/driver/DriverDashboard');
                    break;
                case 'ACCOUNTANT':
                    void import('./Finance');
                    break;
                default:
                    void import('./Dashboard');
                    // Managers live between Dashboard and Reports — warm the
                    // reports chunk on a second idle pass so it opens fluidly.
                    window.setTimeout(() => { void import('./Reports'); }, 6000);
                    break;
            }
        };
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            const idleId = (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(prefetchLanding, { timeout: 4000 });
            return () => (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
        }
        const timer = window.setTimeout(prefetchLanding, 2000);
        return () => window.clearTimeout(timer);
    }, [isAuthenticated, currentUser?.role]);

    // --- Role-Based Workspace Logic ---
    // In tiles mode the launcher ('/') is the home for every role.
    useEffect(() => {
        if (layoutMode === 'tiles') return;
        if (!isAuthenticated || !currentUser) return;

        // Redirect to default page if at root
        if (location.pathname === '/') {
            if (currentUser.defaultPage) {
                navigate(currentUser.defaultPage, { replace: true });
                return;
            }

            // Fallback role-based routing
            switch (currentUser.role) {
                case 'CASHIER':
                case 'WAITER':
                case 'CAPTAIN':
                    navigate('/pos', { replace: true });
                    break;
                case 'KITCHEN_STAFF':
                    navigate('/kds', { replace: true });
                    break;
                case 'CALL_CENTER':
                    navigate('/call-center', { replace: true });
                    break;
                case 'DRIVER':
                    navigate('/driver', { replace: true });
                    break;
                case 'ACCOUNTANT':
                    navigate('/finance', { replace: true });
                    break;
                // Managers and Admins stay on Dashboard (/)
                default:
                    break;
            }
        }
    }, [isAuthenticated, currentUser, location.pathname, navigate, layoutMode]);

    const isFullscreenRoute = location.pathname === '/pos' || location.pathname === '/kds' || location.pathname === '/pickup' || location.pathname === '/call-center' || location.pathname === '/kiosk' || location.pathname === '/driver';

    // Distraction-free mode for Cashiers (hide sidebar even if on non-POS routes, though they shouldn't be)
    const isDistractionFree = currentUser?.role === 'CASHIER' || currentUser?.role === 'KITCHEN_STAFF' || currentUser?.role === 'DRIVER';
    const hideSidebar = isFullscreenRoute || isDistractionFree;
    // Tiles mode replaces the sidebar rail with the 3D launcher (fullscreen ops screens keep their own chrome).
    const isTilesMode = layoutMode === 'tiles' && !hideSidebar;
    const isTilesHome = isTilesMode && location.pathname === '/';

    const { densityClass, direction, fontClass } = useMemo(() => {
        const isRtl = language === 'ar';
        return {
            densityClass: `density-${config.layout.density}`,
            direction: isRtl ? 'rtl' : 'ltr',
            fontClass: isRtl ? 'font-neo-ar' : 'font-neo',
        };
    }, [config.layout.density, language]);

    const handleOpenCommand = useCallback(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' }));
    }, []);

    const isAssistantOpen = useAIWidgetStore(state => state.isAssistantOpen);

    if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;

    return (
        <div
            className={`workspace-shell ${hideSidebar ? 'pos-ui' : 'neo-ui'} ${densityClass} flex h-[100dvh] w-full overflow-hidden text-main ${fontClass} transition-colors duration-150`}
            dir={direction}
        >
            {!hideSidebar && (
                <>
                    <div className="workspace-backdrop-layer fixed inset-0 pointer-events-none z-0" />
                    <div className="workspace-backdrop-grid fixed inset-0 pointer-events-none z-0" />
                    <div className="workspace-backdrop-glow fixed inset-0 pointer-events-none z-0" />
                </>
            )}

            {!hideSidebar && !isTilesMode && <ContextRail onOpenCommand={handleOpenCommand} />}

            <main className="flex-1 flex flex-col relative z-10 overflow-hidden min-w-0 min-h-0">
                <div className={`flex-1 min-h-0 ${hideSidebar ? 'overflow-hidden h-full' : 'overflow-y-auto overflow-x-hidden'}`}>
                    <div className={`flex flex-col ${hideSidebar ? 'h-full overflow-hidden' : 'min-h-full'}`}>
                        {!hideSidebar && <Breadcrumbs />}
                        
                        <div className={`flex-1 ${hideSidebar ? 'h-full' : ''}`}>
                            {isTilesHome ? (
                                <Suspense fallback={null}>
                                    <TilesView />
                                </Suspense>
                            ) : hideSidebar ? (
                                /* Operational fullscreen screens (POS/KDS/Pickup...) render
                                   without route transitions: a lazy route suspending during
                                   the enter animation can leave the page stuck invisible. */
                                <Outlet />
                            ) : (
                                /* No key={pathname} on purpose: the rail navigates
                                   with viewTransition (native browser morph), so a
                                   remount + replayed enter animation would double
                                   the motion and trash page state. Outlet swaps
                                   instantly and fluidly. */
                                <div className="min-h-full">
                                    <Outlet />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {staleBusinessDate && !isReminderDismissed && (
                <div
                    role="alert"
                    className="route-rise fixed bottom-4 left-1/2 z-[70] w-[min(94vw,720px)] -translate-x-1/2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-2xl"
                >
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={22} />
                            <div className="min-w-0 flex-1">
                                <p className="font-black">
                                    {language === 'ar' ? `تنبيه: النظام ما زال يعمل بتاريخ ${businessDate}` : `Warning: the system is still operating on ${businessDate}`}
                                </p>
                                <p className="mt-1 text-xs font-bold opacity-80">
                                    {language === 'ar' ? `تاريخ اليوم ${today}. راجع إغلاق اليوم قبل تسجيل عمليات جديدة.` : `Today is ${today}. Review Day Close before recording new activity.`}
                                </p>
                                {canManageBusinessDate ? (
                                    <button type="button" onClick={() => navigate('/day-close')} className="mt-3 rounded-lg bg-amber-700 px-3 py-2 text-xs font-black text-white">
                                        {language === 'ar' ? 'فتح إغلاق اليوم' : 'Open Day Close'}
                                    </button>
                                ) : (
                                    <p className="mt-2 text-xs font-black">{language === 'ar' ? 'أبلغ مدير الفرع لتصحيح تاريخ التشغيل.' : 'Ask the branch manager to correct the business date.'}</p>
                                )}
                            </div>
                            <button
                                type="button"
                                aria-label={language === 'ar' ? 'إخفاء التنبيه مؤقتاً' : 'Dismiss reminder'}
                                onClick={() => {
                                    sessionStorage.setItem(reminderKey, 'dismissed');
                                    setIsReminderDismissed(true);
                                }}
                                className="rounded-lg p-1.5 text-amber-800 hover:bg-amber-100"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                )}
                {/* Tiles mode: floating launcher-home button on module pages */}
                {isTilesMode && !isTilesHome && (
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="route-pop fixed bottom-5 z-[80] flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-card/90 text-primary shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur transition-transform hover:scale-105 active:scale-95 start-5"
                        aria-label={language === 'ar' ? 'العودة للبلاطات' : 'Back to tiles'}
                        title={language === 'ar' ? 'البلاطات' : 'Tiles'}
                    >
                        <LayoutGrid size={22} />
                    </button>
                )}
                {isAssistantOpen && (
                    <div
                        className="route-pop fixed bottom-4 left-3 right-3 z-[90] h-[calc(100dvh-24px)] sm:bottom-20 sm:left-5 sm:right-auto sm:h-[min(720px,calc(100dvh-104px))] sm:w-[440px]"
                    >
                        <Suspense fallback={null}>
                            <AIAssistant />
                        </Suspense>
                    </div>
                )}

            <Suspense fallback={null}>
                <GlobalSearch />
                <KeyboardShortcuts />
                <OnlineStatus />
                <AIWidgetsRenderer />
            </Suspense>
        </div>
    );
};

export default MainLayout;
