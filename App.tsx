import React, { memo, useEffect, useEffectEvent, useRef, useState, Suspense, lazy } from 'react';
import { RouterProvider } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Wifi, WifiOff } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { router } from './routes';
import { useAuthStore } from './stores/useAuthStore';
import { useDataInit } from './hooks/useDataInit';
import { setupApi } from './services/api/setup';
import { socketService } from './services/socketService';
import { useOrderStore } from './stores/useOrderStore';
import { useInventoryStore } from './stores/useInventoryStore';
import { useMenuStore } from './stores/useMenuStore';
import { useFinanceStore } from './stores/useFinanceStore';
import { ToastProvider } from './components/common/ToastProvider';
import { ConfirmProvider } from './components/common/ConfirmProvider';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ThemeProvider } from './theme';
import { auditService } from './services/auditService';
import { setRuntimeMapsConfig } from './components/common/googleMaps';
import { aiIntelligenceService } from './services/aiIntelligenceService';
import { eventBus } from './services/eventBus';
import { AuditEventType, TableStatus } from './types';

// Shift drawer uses framer-motion — lazy so the motion runtime (~43KB) is not
// part of the initial bundle. It renders nothing until a shift opens anyway.
const ShiftManagementDrawer = lazy(() =>
  import('./components/finance/ShiftManagementDrawer').then((m) => ({ default: m.ShiftManagementDrawer }))
);

// Mounts the lazy drawer chunk ONLY while it is actually open, so the
// drawer code (and the motion runtime) is never fetched on routes that
// don't need it. Local drawer state resets between opens via remount,
// matching the fresh X-report load on every open.
const ShiftDrawerOnDemand: React.FC = () => {
  const isShiftDrawerOpen = useFinanceStore((s) => s.isShiftDrawerOpen);
  if (!isShiftDrawerOpen) return null;
  return (
    <Suspense fallback={null}>
      <ShiftManagementDrawer />
    </Suspense>
  );
};

const LoadingTips = [
  "💡 نصيحة: يعمل النظام بكفاءة تامة حتى عند انقطاع الإنترنت ويتم مزامنة البيانات لاحقاً عند الاتصال.",
  "✨ لمسة شخصية: يمكنك تخصيص الألوان والسمات لتناسب بيئة عملك وكأنها مصممة خصيصاً لك.",
  "⚡ سرعة الأداء: استخدم جهاز يعمل باللمس لتجربة أكثر سرعة وسلاسة في شاشة المبيعات (POS).",
  "📊 دقة وإتقان: تأكد من إغلاق الورديات (الشيفتات) يومياً لضمان دقة واستقرار الحسابات النقدية.",
  "🔍 وصول سريع: يمكنك تصنيف المنتجات بشكل صحيح لتسريع اكتشافها من قبل الموظفين.",
  "🛡️ أمان وثقة: يتم حفظ نسخة احتياطية من جميع تغييراتك محلياً قبل مزامنتها مع الخوادم السحابية."
];

// Tip ticker isolated so its 4.5s interval re-renders ONLY this <p> — not the
// whole backdrop-blur card (repainting large blur surfaces is the top jank
// source on this screen). Visuals unchanged.
const LoadingTip = memo(() => {
  const [currentTip, setCurrentTip] = useState(0);

  useEffect(() => {
    const tipInterval = setInterval(() => {
      setCurrentTip(prev => (prev + 1) % LoadingTips.length);
    }, 4500);
    return () => clearInterval(tipInterval);
  }, []);

  return (
    <p
      key={currentTip}
      className="text-slate-300 text-sm leading-relaxed font-semibold animate-in fade-in slide-in-from-bottom-2 duration-500 text-center relative z-10"
    >
      {LoadingTips[currentTip]}
    </p>
  );
});

const LoadingScreen = memo(({ isConnected }: { isConnected: boolean }) => {
  const currentUser = useAuthStore(state => state.settings?.currentUser);

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#020617] text-slate-100 flex items-center justify-center p-4 sm:p-6 selection:bg-indigo-500/30">
      {/* Background Ambience — static: isolated in its own paint layer so it
          never repaints with the card. Same gradients/opacity as before. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none gpu" style={{ contain: 'strict' }}>
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.15),transparent_60%)] blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.1),transparent_60%)] blur-[100px]" />
        
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,white,transparent_75%)]" />
      </div>
      
      <div className="relative z-10 w-full max-w-2xl bg-white/[0.02] backdrop-blur-xl border border-white/10 p-8 sm:p-10 rounded-[2.5rem] shadow-2xl flex flex-col md:flex-row items-center gap-10 md:gap-14 animate-in fade-in zoom-in-95 duration-1000">
        
        {/* Left Side: Logo & Status */}
        <div className="flex flex-col items-center shrink-0">
          <div className="relative group mb-6 gpu">
            <div className="absolute -inset-8 bg-indigo-500/20 blur-[50px] rounded-full group-hover:bg-indigo-500/30 transition-all duration-700 delay-100" />
            <div className="relative w-32 h-32 rounded-3xl bg-white/[0.03] backdrop-blur-md border border-white/10 shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)] flex items-center justify-center overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
               <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] flex items-center justify-center relative overflow-hidden">
                 <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%)] bg-[length:200%_200%] animate-pulse" />
                 <span className="text-3xl font-black text-white tracking-tighter drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">RF</span>
               </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/[0.03] border border-white/5 shadow-inner backdrop-blur-md">
             {isConnected ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 pt-[1px]">متصل بالخادم</span>
                </>
             ) : (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 pt-[1px]">وضع محلي</span>
                </>
             )}
          </div>
        </div>

        {/* Right Side: Welcome & Tips */}
        <div className="flex-1 w-full text-center md:text-right flex flex-col justify-center" dir="rtl">
          <div className="space-y-3 mb-8">
            <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70 overflow-hidden text-ellipsis whitespace-nowrap pb-1">
              {currentUser ? `أهلاً بك، ${currentUser.name}` : 'جاري التشغيل...'}
            </h1>
            <p className="text-slate-400/80 text-sm font-semibold tracking-wide">
              نظام Coduis Zen الذكي لإدارة المطاعم
            </p>
          </div>

          <div className="space-y-5 mb-8">
            {/* Loading Bar — compositor-only sweep (same gradient + glow). */}
            <div className="h-1 w-full bg-slate-800/80 rounded-full overflow-hidden flex">
              <div className="h-full w-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 shadow-[0_0_15px_rgba(99,102,241,0.5)] loading-bar-fill"></div>
            </div>
            
            {/* Activity Indicator */}
            <div className="flex items-center gap-3 text-slate-400/80 text-xs font-bold uppercase justify-center md:justify-start tracking-wider" dir="ltr">
              <Loader2 size={12} className="animate-spin text-indigo-400" />
              <span>جاري تجهيز جلسة آمنة</span>
            </div>
          </div>

          {/* Tips Carousel */}
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 min-h-[6rem] flex items-center justify-center relative overflow-hidden group shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
              {/* Decorative Accents */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-bl-full translate-x-1/2 -translate-y-1/2" />
              <div className="absolute bottom-0 left-0 w-16 h-16 bg-gradient-to-tr from-emerald-500/10 to-teal-500/10 rounded-tr-full -translate-x-1/2 translate-y-1/2" />

              <LoadingTip />
          </div>
        </div>
      </div>
    </div>
  );
});

const App: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeBranchId, isAuthenticated, logout, restoreSession, token, fetchSettings, fetchPrinters } = useAuthStore(
    useShallow((state) => ({
      activeBranchId: state.settings.activeBranchId,
      isAuthenticated: state.isAuthenticated,
      logout: state.logout,
      restoreSession: state.restoreSession,
      token: state.token,
      fetchSettings: state.fetchSettings,
      fetchPrinters: state.fetchPrinters,
    }))
  );
  const fetchMenu = useMenuStore((state) => state.fetchMenu);
  const { fetchOrders, fetchTables, updateTable, addOrderFromSocket, patchOrderStatus } = useOrderStore(
    useShallow((state) => ({
      fetchOrders: state.fetchOrders,
      fetchTables: state.fetchTables,
      updateTable: state.updateTable,
      addOrderFromSocket: state.addOrderFromSocket,
      patchOrderStatus: state.patchOrderStatus,
    }))
  );
  const { patchStockFromSocket, fetchInventory } = useInventoryStore();
  const { isLoading, isConnected } = useDataInit();
  const [setupStatus, setSetupStatus] = useState<'checking' | 'needs' | 'ready'>('checking');
  const lastSyncRef = useRef<string>(new Date().toISOString());

  // Debounced + coalesced: order bursts during rush used to trigger one
  // dashboard invalidation PER event here, on top of the Dashboard's own
  // coalesced refresh — doubling backend load. This only keeps the cache
  // warm for the NEXT dashboard visit; the open Dashboard refreshes itself.
  const dashboardInvalidationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidateDashboard = useEffectEvent(() => {
    if (document.visibilityState === 'hidden') return;
    if (dashboardInvalidationTimer.current) return;
    dashboardInvalidationTimer.current = setTimeout(() => {
      dashboardInvalidationTimer.current = null;
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-secondary'] });
    }, 2500);
  });

  useEffect(() => {
    const unsubscribeStatus = eventBus.on(AuditEventType.ORDER_STATUS_CHANGE, invalidateDashboard);
    const unsubscribePlaced = eventBus.on(AuditEventType.POS_ORDER_PLACEMENT, invalidateDashboard);
    return () => {
      unsubscribeStatus();
      unsubscribePlaced();
    };
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const refreshLiveConfiguration = () => {
      if (!navigator.onLine || document.visibilityState === 'hidden') return;
      void Promise.all([fetchSettings(), fetchPrinters(), fetchMenu()]);
    };
    const timer = window.setInterval(refreshLiveConfiguration, 30_000);
    window.addEventListener('online', refreshLiveConfiguration);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', refreshLiveConfiguration);
    };
  }, [isAuthenticated, fetchSettings, fetchPrinters, fetchMenu]);

  useEffect(() => {
    let active = true;

    const checkSetup = async () => {
      try {
        // Never let a slow/hanging setup probe block first paint: after
        // 3.5s fall through as ready; the router renders meanwhile and the
        // redirect below still applies when the probe resolves.
        const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3500));
        const result = await Promise.race([setupApi.status(), timeout]);
        if (!active) return;
        if (result === null) {
          setSetupStatus('ready');
          return;
        }

        const needsSetup = !!result?.needsSetup;
        setSetupStatus(needsSetup ? 'needs' : 'ready');

        if (needsSetup && window.location.pathname !== '/setup') {
          window.history.replaceState(null, '', '/setup');
        }
        if (!needsSetup && window.location.pathname === '/setup') {
          window.history.replaceState(null, '', '/login');
        }
      } catch {
        if (active) {
          setSetupStatus('ready');
        }
      }
    };

    checkSetup();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Non-critical background services: audit event subscription + AI
    // operational analysis. Deferred until the browser is idle so they never
    // compete with first paint / interaction on the critical path.
    const run = () => {
      auditService.init();
      aiIntelligenceService.init();
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(run, { timeout: 3000 });
      return () => (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(run, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  // Device-aware quality tier: real hardware/network signals (not just screen
  // width) decide whether expensive effects (backdrop blur, aurora drift,
  // parallax) stay full or drop to cheap fallbacks. CSS reads
  // `html[data-perf-tier='lite']`. Evaluated once — no re-render involved.
  useEffect(() => {
    try {
      const nav = navigator as unknown as {
        deviceMemory?: number;
        hardwareConcurrency?: number;
        connection?: { saveData?: boolean; effectiveType?: string };
      };
      const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
      const fewCores = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4;
      const conn = nav.connection;
      const slowNetwork = !!conn && (conn.saveData === true || /^(slow-2g|2g|3g)$/.test(conn.effectiveType || ''));
      const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;
      document.documentElement.dataset.perfTier = (lowMemory || fewCores || slowNetwork || coarsePointer) ? 'lite' : 'full';
    } catch {
      /* leave tier unset → full quality */
    }
  }, []);

  // Runtime maps provider (Settings → Integrations → Maps). Beats build-time
  // env so branches switch OSM/Google + key without a rebuild/redeploy.
  const mapsProviderSetting = useAuthStore((s) => s.settings.mapsProvider);
  const googleMapsKeySetting = useAuthStore((s) => s.settings.googleMapsKey);
  const maptilerKeySetting = useAuthStore((s) => s.settings.maptilerKey);
  useEffect(() => {
    setRuntimeMapsConfig({ provider: mapsProviderSetting, googleKey: googleMapsKeySetting, maptilerKey: maptilerKeySetting });
  }, [mapsProviderSetting, googleMapsKeySetting, maptilerKeySetting]);

  // ============ Socket Patch Handlers (Sprint 2 - Item 7) ============
  // Instead of full refetch on every event, we apply targeted patches.
  // Full refetch only happens on reconnect after disconnect.

  const handleOrderCreated = useEffectEvent((order: any) => {
    if (order?.id) {
      addOrderFromSocket(order);
      invalidateDashboard();
    }
  });

  const handleOrderStatus = useEffectEvent((payload: { id?: string; status?: string; updatedAt?: string } | null) => {
    if (payload?.id && payload?.status) {
      const patched = patchOrderStatus(payload.id, payload.status as any, payload.updatedAt);
      if (!patched && activeBranchId) {
        fetchOrders({ branch_id: activeBranchId, limit: 120 });
      }
      invalidateDashboard();
    }
  });

  const handleTablesRefresh = useEffectEvent(() => {
    if (activeBranchId) {
      fetchTables(activeBranchId);
    }
  });

  const handleTableStatus = useEffectEvent((payload: { id?: string; status?: string; currentOrderId?: string } | null | undefined) => {
    if (payload?.id && payload?.status) {
      updateTable(payload.id, { status: payload.status as TableStatus, currentOrderId: payload.currentOrderId });
      return;
    }

    handleTablesRefresh();
  });

  const handleStockUpdate = useEffectEvent((data: any) => {
    if (data.itemId && data.warehouseId && data.quantity !== undefined) {
      patchStockFromSocket(data.itemId, data.warehouseId, data.quantity);
    }
  });

  const handleSessionRevoked = useEffectEvent(() => {
    logout();
    window.location.href = '/login';
  });

  // Reconnect catch-up: scoped refetch only after disconnect recovery
  const handleReconnectCatchUp = useEffectEvent(() => {
    fetchOrders({ limit: 50 });
    if (activeBranchId) {
      fetchTables(activeBranchId);
    }
    // Incremental inventory catch-up
    fetchInventory(lastSyncRef.current);
    lastSyncRef.current = new Date().toISOString();
  });

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    socketService.init(token);
    socketService.joinBranch(activeBranchId);

    // Targeted patch handlers (no full refetch)
    socketService.on('order:created', handleOrderCreated);
    socketService.on('order:status', handleOrderStatus);
    socketService.on('dispatch:assigned', handleOrderStatus);
    socketService.on('table:status', handleTableStatus);
    socketService.on('table:layout', handleTablesRefresh);
    socketService.on('stock:updated', handleStockUpdate);
    socketService.on('security:session-revoked', handleSessionRevoked);

    // Full refetch only on reconnect after disconnect
    socketService.onReconnect(handleReconnectCatchUp);

    return () => {
      socketService.off('order:created', handleOrderCreated);
      socketService.off('order:status', handleOrderStatus);
      socketService.off('dispatch:assigned', handleOrderStatus);
      socketService.off('table:status', handleTableStatus);
      socketService.off('table:layout', handleTablesRefresh);
      socketService.off('stock:updated', handleStockUpdate);
      socketService.off('security:session-revoked', handleSessionRevoked);
      socketService.offReconnect(handleReconnectCatchUp);
    };
  }, [activeBranchId, handleOrderCreated, handleOrderStatus, handleReconnectCatchUp, handleSessionRevoked, handleTableStatus, handleTablesRefresh, isAuthenticated, token]);

  // The router renders immediately: visitors without a session (the login
  // page, order tracking) never wait behind init. The full LoadingScreen
  // only shows while an existing session is still hydrating its shell data.
  const hasStoredToken =
    typeof window !== 'undefined' && Boolean(window.localStorage.getItem('auth_token'));
  if ((isLoading || setupStatus === 'checking') && (isAuthenticated || hasStoredToken)) {
    return <LoadingScreen isConnected={isConnected} />;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <ShiftDrawerOnDemand />
            <RouterProvider router={router} />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
