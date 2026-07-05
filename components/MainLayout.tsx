import React, { Suspense, lazy, useCallback, useMemo, useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import ContextRail from './common/ContextRail';

import ScrollToTop from './common/ScrollToTop';
import Breadcrumbs from './common/Breadcrumbs';
import { useAuthStore } from '../stores/useAuthStore';
import { usePageTitle } from '../hooks/usePageTitle';
import { useTheme } from '../theme';
import GlobalSearch from './common/GlobalSearch';
import { useAIWidgetStore } from '../stores/useAIWidgetStore';

const KeyboardShortcuts = lazy(() => import('./common/KeyboardShortcuts'));
const OnlineStatus = lazy(() => import('./common/OnlineStatus'));
const AIWidgetsRenderer = lazy(() => import('./common/AIWidgetsRenderer'));
const AIAssistant = lazy(() => import('./AIAssistant'));
import { motion, AnimatePresence } from 'framer-motion';

const MainLayout: React.FC = () => {
    const { isAuthenticated, language, currentUser } = useAuthStore(
        useShallow((state) => ({
            isAuthenticated: state.isAuthenticated,
            language: state.settings.language,
            currentUser: state.settings.currentUser,
        }))
    );
    const location = useLocation();
    const navigate = useNavigate();
    const { config } = useTheme();

    usePageTitle();

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

    const isFullscreenRoute = location.pathname === '/pos' || location.pathname === '/kds' || location.pathname === '/pickup' || location.pathname === '/packing' || location.pathname === '/call-center' || location.pathname === '/kiosk' || location.pathname === '/driver';
    
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

            <main className="flex-1 flex flex-col relative z-10 overflow-hidden min-w-0 min-h-0">
                <div className={`flex-1 min-h-0 ${hideSidebar ? 'overflow-hidden h-full' : 'overflow-y-auto overflow-x-hidden'}`}>
                    <div className={`flex flex-col ${hideSidebar ? 'h-full overflow-hidden' : 'min-h-full'}`}>
                        {!hideSidebar && <Breadcrumbs />}
                        
                        <div className={`flex-1 ${hideSidebar ? 'h-full' : ''}`}>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={location.pathname}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                    className={hideSidebar ? 'h-full' : 'min-h-full'}
                                >
                                    <Outlet />
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </main>

            <AnimatePresence>
                {isAssistantOpen && (
                    <motion.div
                        initial={{ x: direction === 'rtl' ? -400 : 400, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: direction === 'rtl' ? -400 : 400, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed inset-y-0 right-0 z-[60] w-full md:w-[520px] lg:w-[620px] xl:w-[680px] shadow-2xl"
                        style={{ [direction === 'rtl' ? 'left' : 'right']: 0 }}
                    >
                        <Suspense fallback={null}>
                            <AIAssistant />
                        </Suspense>
                    </motion.div>
                )}
            </AnimatePresence>

            <Suspense fallback={null}>
                <GlobalSearch />
                <KeyboardShortcuts />
                <OnlineStatus />
                <AIWidgetsRenderer />
            </Suspense>
            {!hideSidebar && <ScrollToTop />}
        </div>
    );
};

export default MainLayout;
