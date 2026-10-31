
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import React, { Suspense } from 'react';
import { useAuthStore } from './stores/useAuthStore';
import { AppPermission } from './types';
import ErrorBoundary from './components/common/ErrorBoundary';

// â”€â”€ Resilient lazy loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Two real-world failure modes, both previously fatal (the whole route
// died with "Failed to fetch dynamically imported module"):
//   1. Server restarting mid-navigation (hotfix apply / watchdog recovery):
//      the chunk fetch hits a dead server â†’ retry with backoff succeeds.
//   2. New deploy while a tab is open: the running app references chunk
//      hashes that no longer exist on disk â†’ one-time auto-reload picks
//      the fresh build (sessionStorage guard prevents reload loops).
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const isChunkFetchFailure = (error: any) =>
    error instanceof TypeError
    || /failed to fetch|dynamically imported module|chunkload|loading chunk|networkerror|err_connection|load failed/i.test(String(error?.message || error || ''));

const lazyImport = async (factory: () => Promise<any>, attempt = 0): Promise<any> => {
    try {
        return await factory();
    } catch (error: any) {
        if (attempt < 2 && isChunkFetchFailure(error)) {
            await sleep([600, 1800][attempt]);
            return lazyImport(factory, attempt + 1);
        }
        // Stale build: the referenced chunk hash is gone from disk. Reload
        // once so the browser picks the fresh deploy instead of a dead route.
        if (isChunkFetchFailure(error) && typeof window !== 'undefined') {
            const key = 'coduiszen:chunk-reload';
            const last = Number(sessionStorage.getItem(key) || 0);
            if (Date.now() - last > 30_000) {
                try { sessionStorage.setItem(key, String(Date.now())); } catch { /* ignore */ }
                window.location.reload();
            }
        }
        throw error;
    }
};

/** React.lazy wrapper: retries transient chunk failures + auto-reloads on stale builds. */
const lazyRoute = (factory: () => Promise<any>) => React.lazy(() => lazyImport(factory));

// Login is lazy too: authenticated users (the hot path) never download it,
// and logged-out users get the shell + login chunk only.
const Login = lazyRoute(() => import('./components/Login'));

// Lazy load components for better performance
// Export loaders for preloading
export const loaders = {
    Dashboard: () => import('./components/Dashboard'),
    AdminDashboardPage: () => import('./components/AdminDashboardPage'),
    POS: () => import('./src/features/pos/POS'),
    CallCenter: () => import('./components/CallCenter'),
    CallCenterManager: () => import('./components/CallCenterManager'),
    KDS: () => import('./components/KDS'),
    PickupScreen: () => import('./components/PickupScreen').then((mod) => ({ default: mod.PickupScreen })),
    MenuManager: () => import('./components/menu/MenuProfitCenter'),
    PrinterManager: () => import('./components/PrinterManager'),
    ReceiptDesigner: () => import('./components/ReceiptDesigner'),
    RecipeManager: () => import('./components/RecipeManager'),
    Inventory: () => import('./src/features/inventory/Inventory'),
    StockRequests: () => import('./src/features/inventory/StockRequests'),
    StockItems: () => import('./src/features/inventory/pages/StockItemsPage'),
    Suppliers: () => import('./src/features/inventory/pages/SuppliersPage'),
    Procurement: () => import('./src/features/inventory/pages/ProcurementPage'),
    Warehouses: () => import('./src/features/inventory/pages/WarehousesPage'),
    StockCounts: () => import('./src/features/inventory/pages/StockCountsPage'),
    StockMovements: () => import('./src/features/inventory/pages/MovementsPage'),
    CRM: () => import('./components/CRM'),
    ZonesManager: () => import('./components/ZonesManager'),
    Finance: () => import('./components/Finance'),
    TreasuryHub: () => import('./components/TreasuryHub'),
    Expenses: () => import('./components/Expenses'),
    Reports: () => import('./components/Reports'),
    AIInsights: () => import('./components/AIInsights'),
    AIAssistant: () => import('./components/AIAssistant'),

    ForensicsHub: () => import('./components/ForensicsHub'),
    SettingsHub: () => import('./components/SettingsHub'),
    RolesPermissions: () => import('./components/RolesPermissions'),
    FloorDesigner: () => import('./components/FloorDesigner'),
    Production: () => import('./components/Production'),
    Butchery: () => import('./components/ButcheryManager'),
    DispatchHub: () => import('./components/DispatchHub'),
    DriversHub: () => import('./components/DriversHub'),
    CampaignHub: () => import('./components/CampaignHub'),

    FiscalHub: () => import('./components/FiscalHub'),
    DayCloseHub: () => import('./components/DayCloseHub'),
    FranchiseManager: () => import('./components/FranchiseManager'),
    SetupWizard: () => import('./components/SetupWizard'),
    RefundManager: () => import('./components/RefundManager'),
    WastageManager: () => import('./components/WastageManager'),
    InventoryIntelligence: () => import('./components/InventoryIntelligence'),
    ApprovalCenter: () => import('./components/ApprovalCenter'),
    WhatsAppHub: () => import('./components/WhatsAppHub'),
    MailHub: () => import('./components/MailHub'),
    PlatformAggregator: () => import('./components/PlatformAggregator'),
    UserManagement: () => import('./src/features/hr/UserManagement'),
    OrdersCenter: () => import('./components/OrdersCenter'),
    SelfOrderingKiosk: () => import('./components/kiosk/SelfOrderingKiosk'),
    TrackOrder: () => import('./components/TrackOrder'),
    CustomerDisplay: () => import('./components/CustomerDisplay'),
    ReservationsHub: () => import('./components/ReservationsHub'),
    ComplaintsInbox: () => import('./components/ComplaintsInbox'),
    InteractionShowcase: () => import('./components/InteractionShowcase'),
    
    // HR & Payroll UI
    HRHub: () => import('./src/features/hr/components/HRHub'),
    AttendanceManager: () => import('./src/features/hr/components/AttendanceManager'),
    PayrollManager: () => import('./src/features/hr/components/PayrollManager'),
    DataMigrationWizard: () => import('./src/features/hr/components/DataMigrationWizard'),
    BiometricDeviceManager: () => import('./src/features/hr/components/BiometricDeviceManager'),
    SchedulingManager: () => import('./src/features/hr/components/SchedulingManager'),
    TaskChecklistManager: () => import('./src/features/hr/components/TaskChecklistManager'),
    HRSettingsManager: () => import('./src/features/hr/components/HRSettingsManager'),
    HRUserGuide: () => import('./src/features/hr/components/HRUserGuide'),
    DriverDashboard: () => import('./src/features/driver/DriverDashboard'),
    ThemeLab: () => import('./components/ThemeLab'),
    OfflineConflictCenter: () => import('./components/OfflineConflictCenter'),
    PublicStatusPage: () => import('./components/PublicStatusPage'),
    PublicQrMenu: () => import('./components/PublicQrMenu'),
};

// Lazy load components using exported loaders
const Dashboard = lazyRoute(loaders.Dashboard);
const AdminDashboardPage = lazyRoute(loaders.AdminDashboardPage);
const POS = lazyRoute(loaders.POS);
const CallCenter = lazyRoute(loaders.CallCenter);
const CallCenterManager = lazyRoute(loaders.CallCenterManager);
const KDS = lazyRoute(loaders.KDS);
const PickupScreen = lazyRoute(loaders.PickupScreen);
const MenuManager = lazyRoute(loaders.MenuManager);
const PrinterManager = lazyRoute(loaders.PrinterManager);
const ReceiptDesigner = lazyRoute(loaders.ReceiptDesigner);
const RecipeManager = lazyRoute(loaders.RecipeManager);
const Inventory = lazyRoute(loaders.Inventory);
const StockRequests = lazyRoute(loaders.StockRequests);
const StockItems = lazyRoute(loaders.StockItems);
const Suppliers = lazyRoute(loaders.Suppliers);
const Procurement = lazyRoute(loaders.Procurement);
const Warehouses = lazyRoute(loaders.Warehouses);
const StockCounts = lazyRoute(loaders.StockCounts);
const StockMovements = lazyRoute(loaders.StockMovements);
const CRM = lazyRoute(loaders.CRM);
const ZonesManager = lazyRoute(loaders.ZonesManager);
const Finance = lazyRoute(loaders.Finance);
const TreasuryHub = lazyRoute(loaders.TreasuryHub);
const Expenses = lazyRoute(loaders.Expenses);
const Reports = lazyRoute(loaders.Reports);
const AIInsights = lazyRoute(loaders.AIInsights);
const AIAssistant = lazyRoute(loaders.AIAssistant);

const ForensicsHub = lazyRoute(loaders.ForensicsHub);
const SettingsHub = lazyRoute(loaders.SettingsHub);
const RolesPermissions = lazyRoute(loaders.RolesPermissions);
const FloorDesigner = lazyRoute(loaders.FloorDesigner);
const Production = lazyRoute(loaders.Production);
const ButcheryManager = lazyRoute(loaders.Butchery);
const DispatchHub = lazyRoute(loaders.DispatchHub);
const DriversHub = lazyRoute(loaders.DriversHub);
const CampaignHub = lazyRoute(loaders.CampaignHub);

const FiscalHub = lazyRoute(loaders.FiscalHub);
const DayCloseHub = lazyRoute(loaders.DayCloseHub);
const FranchiseManager = lazyRoute(loaders.FranchiseManager);
const LazySetupWizard = lazyRoute(loaders.SetupWizard);
const RefundManager = lazyRoute(loaders.RefundManager);
const WastageManager = lazyRoute(loaders.WastageManager);
const InventoryIntelligence = lazyRoute(loaders.InventoryIntelligence);
const ApprovalCenter = lazyRoute(loaders.ApprovalCenter);
const WhatsAppHub = lazyRoute(loaders.WhatsAppHub);
const MailHub = lazyRoute(loaders.MailHub);
const PlatformAggregator = lazyRoute(loaders.PlatformAggregator);
const UserManagement = lazyRoute(loaders.UserManagement);
const OrdersCenter = lazyRoute(loaders.OrdersCenter);

const HRHub = lazyRoute(loaders.HRHub);
const AttendanceManager = lazyRoute(loaders.AttendanceManager);
const PayrollManager = lazyRoute(loaders.PayrollManager);
const DataMigrationWizard = lazyRoute(loaders.DataMigrationWizard);
const BiometricDeviceManager = lazyRoute(loaders.BiometricDeviceManager);
const SchedulingManager = lazyRoute(loaders.SchedulingManager);
const TaskChecklistManager = lazyRoute(loaders.TaskChecklistManager);
const HRSettingsManager = lazyRoute(loaders.HRSettingsManager);
const HRUserGuide = lazyRoute(loaders.HRUserGuide);
const SelfOrderingKiosk = lazyRoute(loaders.SelfOrderingKiosk);
const TrackOrder = lazyRoute(loaders.TrackOrder);
const CustomerDisplay = lazyRoute(loaders.CustomerDisplay);
const ReservationsHub = lazyRoute(loaders.ReservationsHub);
const ComplaintsInbox = lazyRoute(loaders.ComplaintsInbox);
const InteractionShowcase = lazyRoute(loaders.InteractionShowcase);
const DriverDashboard = lazyRoute(loaders.DriverDashboard);
const ThemeLab = lazyRoute(loaders.ThemeLab);
const OfflineConflictCenter = lazyRoute(loaders.OfflineConflictCenter);
const PublicStatusPage = lazyRoute(loaders.PublicStatusPage);
const PublicQrMenu = lazyRoute(loaders.PublicQrMenu);

import PageSkeleton from './components/common/PageSkeleton';

// Delayed fallback: cached chunks resolve in ms â€” flashing a full skeleton
// for them feels like flicker, not loading. Only show the skeleton if the
// chunk actually takes longer than 200ms.
const Loading = () => {
    const [show, setShow] = React.useState(false);
    React.useEffect(() => {
        const timer = window.setTimeout(() => setShow(true), 200);
        return () => window.clearTimeout(timer);
    }, []);
    if (!show) return null;
    return <PageSkeleton type="table" rows={5} />;
};

const RequirePermission: React.FC<{ permission: AppPermission; children: React.ReactNode }> = ({ permission, children }) => {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const hasPermission = useAuthStore((state) => state.hasPermission);
    const location = useLocation();
    const hasStoredToken = typeof window !== 'undefined' && Boolean(window.localStorage.getItem('auth_token'));
    const fallbackPath = hasPermission(AppPermission.NAV_DASHBOARD)
        ? '/'
        : hasPermission(AppPermission.NAV_POS)
            ? '/pos'
            : hasPermission(AppPermission.NAV_CALL_CENTER)
                ? '/call-center'
                : hasPermission(AppPermission.NAV_KDS)
                    ? '/kds'
                    : hasPermission(AppPermission.NAV_PICKUP)
                        ? '/pickup'
                        : hasPermission(AppPermission.NAV_REPORTS)
                            ? '/reports'
                            : '/login';
    if (!isAuthenticated && hasStoredToken) return <Loading />;
    if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
    if (!hasPermission(permission)) return <Navigate to={fallbackPath} replace />;
    return <>{children}</>;
};

/** Wraps a lazy component with ErrorBoundary + Suspense for safe route rendering */
const withSafe = (Component: React.ComponentType) => (
    <ErrorBoundary>
        <Suspense fallback={<Loading />}>
            <Component />
        </Suspense>
    </ErrorBoundary>
);

const withPermission = (permission: AppPermission, element: React.ReactNode) => (
    <RequirePermission permission={permission}>{element}</RequirePermission>
);

export const router = createBrowserRouter([
    {
        path: '/',
        element: <MainLayout />,
        children: [
            { index: true, element: withPermission(AppPermission.NAV_DASHBOARD, withSafe(Dashboard)) },
            { path: 'admin-dashboard', element: withPermission(AppPermission.NAV_ADMIN_DASHBOARD, withSafe(AdminDashboardPage)) },
            { path: 'pos', element: withPermission(AppPermission.NAV_POS, withSafe(POS)) },
            { path: 'call-center', element: withPermission(AppPermission.NAV_CALL_CENTER, withSafe(CallCenter)) },
            { path: 'call-center-manager', element: withPermission(AppPermission.NAV_CALL_CENTER, withSafe(CallCenterManager)) },
            { path: 'kds', element: withPermission(AppPermission.NAV_KDS, withSafe(KDS)) },
            { path: 'kitchen', element: <Navigate to="/kds" replace /> },
            { path: 'pickup', element: withPermission(AppPermission.NAV_PICKUP, withSafe(PickupScreen)) },
            { path: 'packing', element: <Navigate to="/pickup" replace /> },
            { path: 'menu', element: withPermission(AppPermission.NAV_MENU_MANAGER, withSafe(MenuManager)) },
            { path: 'printers', element: withPermission(AppPermission.NAV_PRINTERS, withSafe(PrinterManager)) },
            { path: 'recipes', element: withPermission(AppPermission.NAV_RECIPES, withSafe(RecipeManager)) },
            { path: 'receipt-designer', element: withPermission(AppPermission.NAV_PRINTERS, withSafe(ReceiptDesigner)) },
            { path: 'inventory', element: withPermission(AppPermission.NAV_INVENTORY, withSafe(Inventory)) },
            { path: 'inventory/items', element: withPermission(AppPermission.NAV_INVENTORY, withSafe(StockItems)) },
            { path: 'inventory/suppliers', element: withPermission(AppPermission.NAV_INVENTORY, withSafe(Suppliers)) },
            { path: 'inventory/procurement', element: withPermission(AppPermission.NAV_INVENTORY, withSafe(Procurement)) },
            { path: 'inventory/warehouses', element: withPermission(AppPermission.NAV_INVENTORY, withSafe(Warehouses)) },
            { path: 'inventory/counts', element: withPermission(AppPermission.NAV_INVENTORY, withSafe(StockCounts)) },
            { path: 'inventory/movements', element: withPermission(AppPermission.NAV_INVENTORY, withSafe(StockMovements)) },
            { path: 'stock-requests', element: withPermission(AppPermission.NAV_INVENTORY, withSafe(StockRequests)) },
            { path: 'crm', element: withPermission(AppPermission.NAV_CRM, withSafe(CRM)) },
            { path: 'zones', element: withPermission(AppPermission.NAV_CALL_CENTER, withSafe(ZonesManager)) },
            { path: 'finance', element: withPermission(AppPermission.NAV_FINANCE, withSafe(Finance)) },
            { path: 'treasury', element: withPermission(AppPermission.NAV_FINANCE, withSafe(TreasuryHub)) },
            { path: 'expenses', element: withPermission(AppPermission.NAV_FINANCE, withSafe(Expenses)) },
            { path: 'reports', element: withPermission(AppPermission.NAV_REPORTS, withSafe(Reports)) },
            { path: 'ai-insights', element: withPermission(AppPermission.NAV_AI_ASSISTANT, withSafe(AIInsights)) },
            { path: 'ai-assistant', element: withPermission(AppPermission.NAV_AI_ASSISTANT, withSafe(AIAssistant)) },
            { path: 'security', element: <Navigate to="/user-management" replace /> },
            { path: 'forensics', element: withPermission(AppPermission.NAV_FORENSICS, withSafe(ForensicsHub)) },
            { path: 'settings', element: withPermission(AppPermission.NAV_SETTINGS, withSafe(SettingsHub)) },
            { path: 'production', element: withPermission(AppPermission.NAV_PRODUCTION, withSafe(Production)) },
            { path: 'butchery', element: withPermission(AppPermission.NAV_PRODUCTION, withSafe(ButcheryManager)) },
            { path: 'dispatch', element: withPermission(AppPermission.NAV_DISPATCH, withSafe(DispatchHub)) },
            { path: 'drivers', element: withPermission(AppPermission.NAV_DISPATCH, withSafe(DriversHub)) },
            { path: 'marketing', element: withPermission(AppPermission.NAV_MARKETING, withSafe(CampaignHub)) },
            { path: 'people', element: <Navigate to="/user-management" replace /> },
            { path: 'fiscal', element: withPermission(AppPermission.NAV_FISCAL, withSafe(FiscalHub)) },
            { path: 'day-close', element: withPermission(AppPermission.OP_CLOSE_DAY, withSafe(DayCloseHub)) },
            { path: 'offline-conflicts', element: withPermission(AppPermission.CFG_OFFLINE_MODE, withSafe(OfflineConflictCenter)) },
            { path: 'franchise', element: withPermission(AppPermission.NAV_FRANCHISE, withSafe(FranchiseManager)) },
            { path: 'refunds', element: withPermission(AppPermission.NAV_REFUNDS, withSafe(RefundManager)) },
            { path: 'wastage', element: withPermission(AppPermission.NAV_WASTAGE, withSafe(WastageManager)) },
            { path: 'inventory-intelligence', element: withPermission(AppPermission.NAV_INVENTORY, withSafe(InventoryIntelligence)) },
            { path: 'approvals', element: withPermission(AppPermission.NAV_APPROVAL, withSafe(ApprovalCenter)) },
            { path: 'whatsapp', element: withPermission(AppPermission.NAV_WHATSAPP, withSafe(WhatsAppHub)) },
            { path: 'mail', element: withPermission(AppPermission.NAV_MAIL, withSafe(MailHub)) },
            { path: 'platforms', element: withPermission(AppPermission.NAV_PLATFORMS, withSafe(PlatformAggregator)) },
            { path: 'user-management', element: withPermission(AppPermission.NAV_USER_MANAGEMENT, withSafe(UserManagement)) },
            { path: 'roles', element: <Navigate to="/user-management" replace /> },
            { path: 'orders', element: withPermission(AppPermission.NAV_ORDERS, withSafe(OrdersCenter)) },
            { path: 'hr', element: withPermission(AppPermission.NAV_PEOPLE, withSafe(HRHub)) },
            { path: 'attendance', element: withPermission(AppPermission.NAV_ATTENDANCE, withSafe(AttendanceManager)) },
            { path: 'payroll', element: withPermission(AppPermission.NAV_PAYROLL, withSafe(PayrollManager)) },
            { path: 'hr-settings', element: withPermission(AppPermission.NAV_PEOPLE, withSafe(HRSettingsManager)) },
            { path: 'hr-guide', element: withPermission(AppPermission.NAV_PEOPLE, withSafe(HRUserGuide)) },
            { path: 'scheduling', element: withPermission(AppPermission.NAV_ATTENDANCE, withSafe(SchedulingManager)) },
            { path: 'shift-tasks', element: withPermission(AppPermission.NAV_ATTENDANCE, withSafe(TaskChecklistManager)) },
            { path: 'migration', element: withPermission(AppPermission.NAV_APPROVAL, withSafe(DataMigrationWizard)) },
            { path: 'biometric-devices', element: withPermission(AppPermission.NAV_ATTENDANCE, withSafe(BiometricDeviceManager)) },
            { path: 'kiosk', element: withPermission(AppPermission.NAV_POS, withSafe(SelfOrderingKiosk)) },
            { path: 'reservations', element: withPermission(AppPermission.NAV_FLOOR_PLAN, withSafe(ReservationsHub)) },
            { path: 'complaints', element: withPermission(AppPermission.NAV_CRM, withSafe(ComplaintsInbox)) },
            { path: 'theme-lab', element: withPermission(AppPermission.NAV_SETTINGS, withSafe(ThemeLab)) },
            { path: 'ui-showcase', element: withPermission(AppPermission.NAV_SETTINGS, withSafe(InteractionShowcase)) },
        ],
    },
    {
        path: 'floor-designer',
        element: (
            <RequirePermission permission={AppPermission.NAV_FLOOR_PLAN}>
                {withSafe(FloorDesigner)}
            </RequirePermission>
        ),
    },
    {
        path: '/login',
        element: (
            <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                    <Login />
                </Suspense>
            </ErrorBoundary>
        ),
    },
    {
        path: '/driver',
        element: (
            <RequirePermission permission={AppPermission.NAV_DRIVER}>
                {withSafe(DriverDashboard)}
            </RequirePermission>
        ),
    },
    {
        path: '/status',
        element: (
            <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                    <PublicStatusPage />
                </Suspense>
            </ErrorBoundary>
        ),
    },
    {
        path: '/qr/:branchId/:tableId',
        element: (
            <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                    <PublicQrMenu />
                </Suspense>
            </ErrorBoundary>
        ),
    },
    {
        // Public customer order tracking
        path: '/t/:id',
        element: (
            <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                    <TrackOrder />
                </Suspense>
            </ErrorBoundary>
        ),
    },
    {
        // Public branch-scoped pickup board; screen key is passed in the URL/header.
        path: '/customer-display',
        element: (
            <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                    <CustomerDisplay />
                </Suspense>
            </ErrorBoundary>
        ),
    },
    {
        path: '/setup',
        element: withSafe(LazySetupWizard),
    },
]);
