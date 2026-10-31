import React, { Suspense, lazy, useCallback, useMemo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import ContextRail from './common/ContextRail';

import Breadcrumbs from './common/Breadcrumbs';
import { useAuthStore } from '../stores/useAuthStore';
import { usePageTitle } from '../hooks/usePageTitle';
import { useTheme } from '../theme';
import { useAIWidgetStore } from '../stores/useAIWidgetStore';
import GlobalSearch from './common/GlobalSearch';

const KeyboardShortcuts = lazy(() => import('./common/KeyboardShortcuts'));
const OnlineStatus = lazy(() => import('./common/OnlineStatus'));
const AIWidgetsRenderer = lazy(() => import('./common/AIWidgetsRenderer'));
const AIAutonomyPulse = lazy(() => import('./common/AIAutonomyPulse'));
const AIAssistant = lazy(() => import('./AIAssistant'));
import { AlertTriangle, X } from 'lucide-react';

const localDateKey = () => {
    const value = new Date();
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

const MainLayout: React.FC = () => {
    const { isAuthenticated, language, currentUser, branches, activeBranchId } = useAuthStore(
        useShallow((state) => ({
            isAuthenticated: state.isAuthenticated,
            language: state.settings.language,
            currentUser: state.settings.currentUser,
            branches: state.branches,
            activeBranchId: state.settings.activeBranchId,
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
    const [isDrawerViewport, setIsDrawerViewport] = useState(false);
    const mainRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const media = window.matchMedia('(max-width: 1279px)');
        const syncViewportMode = () => setIsDrawerViewport(media.matches);
        syncViewportMode();
        media.addEventListener('change', syncViewportMode);
        return () => media.removeEventListener('change', syncViewportMode);
    }, []);

    useLayoutEffect(() => {
        const main = mainRef.current;
        if (!main) return;
        if (isDrawerViewport) {
            main.style.setProperty('margin-inline-start', '0px', 'important');
            main.style.setProperty('margin-inline-end', '0px', 'important');
            main.style.setProperty('width', '100%', 'important');
            main.style.setProperty('max-width', '100%', 'important');
        } else {
            main.style.removeProperty('margin-inline-start');
            main.style.removeProperty('margin-inline-end');
            main.style.removeProperty('width');
            main.style.removeProperty('max-width');
        }
    }, [isDrawerViewport]);

    useEffect(() => {
        setIsReminderDismissed(sessionStorage.getItem(reminderKey) === 'dismissed');
    }, [reminderKey]);

    usePageTitle();

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
                    void import('../src/features/pos/POS').catch(() => undefined);
                    break;
                case 'KITCHEN_STAFF':
                    void import('./KDS').catch(() => undefined);
                    break;
                case 'CALL_CENTER':
                    void import('./CallCenter').catch(() => undefined);
                    break;
                case 'DRIVER':
                    void import('../src/features/driver/DriverDashboard').catch(() => undefined);
                    break;
                case 'ACCOUNTANT':
                    void import('./Finance').catch(() => undefined);
                    break;
                default:
                    void import('./Dashboard').catch(() => undefined);
                    // Managers live between Dashboard and Reports — warm the
                    // reports chunk on a second idle pass so it opens fluidly.
                    window.setTimeout(() => { void import('./Reports').catch(() => undefined); }, 6000);
                    break;
            }
            // Universal hot routes: POS + OrdersCenter serve every shift
            // regardless of role. Warmed late and staggered (8s+) so they
            // never compete with real work; skipped entirely on saveData.
            // Measured win: first-tap navigation drops from ~2-3s to
            // cache-instant on throttled phones (chunk parse was ~40%).
            try {
                const conn = (navigator as unknown as { connection?: { saveData?: boolean } })?.connection;
                if (conn?.saveData) return;
            } catch {
                // unknown — prefetch anyway on LAN ERP
            }
            const hot = [() => import('../src/features/pos/POS'), () => import('./OrdersCenter')];
            hot.forEach((job, i) => {
                window.setTimeout(() => { void job().catch(() => undefined); }, 8000 + i * 4000);
            });
        };
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            const idleId = (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(prefetchLanding, { timeout: 4000 });
            return () => (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
        }
        const timer = globalThis.setTimeout(prefetchLanding, 2000);
        return () => globalThis.clearTimeout(timer);
    }, [isAuthenticated, currentUser?.role]);

    // --- Role-Based Workspace Logic ---
    useEffect(() => {
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
    }, [isAuthenticated, currentUser, location.pathname, navigate]);

    const isFullscreenRoute = location.pathname === '/pos' || location.pathname === '/kds' || location.pathname === '/pickup' || location.pathname === '/call-center' || location.pathname === '/kiosk' || location.pathname === '/driver';

    // Distraction-free mode for Cashiers (hide sidebar even if on non-POS routes, though they shouldn't be)
    const isDistractionFree = currentUser?.role === 'CASHIER' || currentUser?.role === 'KITCHEN_STAFF' || currentUser?.role === 'DRIVER';
    const hideSidebar = isFullscreenRoute || isDistractionFree;
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

            {!hideSidebar && <ContextRail onOpenCommand={handleOpenCommand} />}

            <main
                ref={mainRef}
                className="flex-1 flex flex-col relative z-10 overflow-hidden min-w-0 min-h-0"
                style={isDrawerViewport ? { marginInline: 0, width: '100%', maxWidth: '100%' } : undefined}
            >
                <div className={`flex-1 min-h-0 ${hideSidebar ? 'overflow-hidden h-full' : 'overflow-y-auto overflow-x-hidden'}`}>
                    <div className={`flex flex-col ${hideSidebar ? 'h-full overflow-hidden' : 'min-h-full'}`}>
                        {!hideSidebar && <Breadcrumbs />}
                        
                        <div className={`flex-1 ${hideSidebar ? 'h-full' : ''}`}>
                            {hideSidebar ? (
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
                    aria-live="polite"
                    className="day-close-alert route-rise pointer-events-none fixed inset-x-3 bottom-[max(0.75rem,var(--safe-bottom))] z-[70] mx-auto w-auto max-w-[640px] sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:w-[min(92vw,640px)] sm:-translate-x-1/2"
                >
                    <div className="day-close-alert__surface pointer-events-auto">
                        <span className="day-close-alert__scan" aria-hidden="true" />
                        <div className="day-close-alert__signal" aria-hidden="true">
                            <AlertTriangle size={21} strokeWidth={2.2} />
                        </div>
                        <div className="day-close-alert__content">
                            <div className="day-close-alert__eyebrow">
                                <span>{language === 'ar' ? 'تنبيه تشغيلي' : 'Operational alert'}</span>
                                <i aria-hidden="true" />
                                <span>{language === 'ar' ? 'إجراء مطلوب' : 'Action required'}</span>
                            </div>
                            <p className="day-close-alert__title">
                                {language === 'ar' ? 'التاريخ التشغيلي يحتاج إلى إغلاق' : 'The operating date needs to be closed'}
                            </p>
                            <p className="day-close-alert__copy">
                                {language === 'ar' ? 'راجع إغلاق اليوم قبل تسجيل عمليات جديدة.' : 'Review Day Close before recording new activity.'}
                            </p>
                            <div className="day-close-alert__dates" aria-label={language === 'ar' ? 'مقارنة التواريخ' : 'Date comparison'}>
                                <span>{language === 'ar' ? 'التشغيل الحالي' : 'Current operation'} <b>{businessDate}</b></span>
                                <span>{language === 'ar' ? 'تاريخ اليوم' : 'Today'} <b>{today}</b></span>
                            </div>
                        </div>
                        <div className="day-close-alert__actions">
                            {canManageBusinessDate ? (
                                <button type="button" onClick={() => navigate('/day-close')} className="day-close-alert__action">
                                    <span>{language === 'ar' ? 'مراجعة الإغلاق' : 'Review close'}</span>
                                </button>
                            ) : (
                                <span className="day-close-alert__note">{language === 'ar' ? 'أبلغ مدير الفرع' : 'Notify your manager'}</span>
                            )}
                            <button
                                type="button"
                                aria-label={language === 'ar' ? 'إخفاء التنبيه مؤقتاً' : 'Dismiss reminder'}
                                onClick={() => {
                                    sessionStorage.setItem(reminderKey, 'dismissed');
                                    setIsReminderDismissed(true);
                                }}
                                className="day-close-alert__dismiss"
                            >
                                <X size={17} />
                            </button>
                        </div>
                    </div>
                </div>
                )}
                {isAssistantOpen && (
                    <div
                        className="route-pop fixed bottom-3 left-3 right-3 z-[90] h-[calc(100dvh-24px)] sm:bottom-20 sm:left-5 sm:right-auto sm:h-[min(760px,calc(100dvh-104px))] sm:w-[min(500px,calc(100vw-40px))]"
                    >
                        <Suspense fallback={null}>
                            <AIAssistant />
                        </Suspense>
                    </div>
                )}

            <Suspense fallback={null}>
                <GlobalSearch />
                <KeyboardShortcuts />
                <OnlineStatus lang={language === 'ar' ? 'ar' : 'en'} />
                <AIWidgetsRenderer />
                <AIAutonomyPulse />
            </Suspense>
        </div>
    );
};

export default MainLayout;
