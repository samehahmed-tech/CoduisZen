import React, { Suspense, lazy, useCallback, useMemo, useEffect, useState } from 'react';
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
import { AlertTriangle, Sparkles, X } from 'lucide-react';

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
    const staleBusinessDate = businessDate !== today;
    const canManageBusinessDate = ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'].includes(String(currentUser?.role || ''));
    const reminderKey = `business-date-reminder:${activeBranchId || 'none'}:${today}`;
    const [isReminderDismissed, setIsReminderDismissed] = useState(false);

    useEffect(() => {
        setIsReminderDismissed(sessionStorage.getItem(reminderKey) === 'dismissed');
    }, [reminderKey]);

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
    const toggleAssistant = useAIWidgetStore(state => state.toggleAssistant);

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
                            <AnimatePresence mode="sync" initial={false}>
                                <motion.div
                                    key={location.pathname}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ duration: 0.12, ease: 'easeOut' }}
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
                {staleBusinessDate && !isReminderDismissed && (
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 24 }}
                        role="alert"
                        className="fixed bottom-4 left-1/2 z-[70] w-[min(94vw,720px)] -translate-x-1/2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-2xl"
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
                    </motion.div>
                )}
                {isAssistantOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 18, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 14, scale: 0.97 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="fixed bottom-4 left-3 right-3 z-[90] h-[calc(100dvh-24px)] sm:bottom-20 sm:left-5 sm:right-auto sm:h-[min(720px,calc(100dvh-104px))] sm:w-[440px]"
                    >
                        <Suspense fallback={null}>
                            <AIAssistant />
                        </Suspense>
                    </motion.div>
                )}
            </AnimatePresence>

            {!isAssistantOpen && (
                <motion.button
                    type="button"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ y: -2, scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => toggleAssistant(true)}
                    className="fixed bottom-5 left-5 z-[80] flex h-14 items-center gap-2 rounded-2xl border border-cyan-300/30 bg-slate-950 px-4 text-white shadow-[0_18px_50px_rgba(8,145,178,0.28)] focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/30"
                    aria-label={language === 'ar' ? 'فتح المساعد الذكي' : 'Open smart assistant'}
                    title={language === 'ar' ? 'المساعد الذكي' : 'Smart assistant'}
                >
                    <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500 text-slate-950">
                        <Sparkles size={19} />
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-400" />
                    </span>
                    <span className="hidden text-xs font-black sm:block">{language === 'ar' ? 'اسأل المساعد' : 'Ask Copilot'}</span>
                </motion.button>
            )}

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
