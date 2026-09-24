
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import React, { Suspense } from 'react';
import { useAuthStore } from './stores/useAuthStore';
import { AppPermission } from './types';
import ErrorBoundary from './components/common/ErrorBoundary';

// Login is lazy too: authenticated users (the hot path) never download it,
// and logged-out users get the shell + login chunk only.
const Login = React.lazy(() => import('./components/Login'));

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
};

// Lazy load components using exported loaders
const Dashboard = React.lazy(loaders.Dashboard);
const AdminDashboardPage = React.lazy(loaders.AdminDashboardPage);
const POS = React.lazy(loaders.POS);
const CallCenter = React.lazy(loaders.CallCenter);
const CallCenterManager = React.lazy(loaders.CallCenterManager);
const KDS = React.lazy(loaders.KDS);
const PickupScreen = React.lazy(loaders.PickupScreen);
const MenuManager = React.lazy(loaders.MenuManager);
const PrinterManager = React.lazy(loaders.PrinterManager);
const ReceiptDesigner = React.lazy(loaders.ReceiptDesigner);
const RecipeManager = React.lazy(loaders.RecipeManager);
const Inventory = React.lazy(loaders.Inventory);
const StockRequests = React.lazy(loaders.StockRequests);
const StockItems = React.lazy(loaders.StockItems);
const Suppliers = React.lazy(loaders.Suppliers);
const Procurement = React.lazy(loaders.Procurement);
const Warehouses = React.lazy(loaders.Warehouses);
const StockCounts = React.lazy(loaders.StockCounts);
const StockMovements = React.lazy(loaders.StockMovements);
const CRM = React.lazy(loaders.CRM);
const ZonesManager = React.lazy(loaders.ZonesManager);
const Finance = React.lazy(loaders.Finance);
const TreasuryHub = React.lazy(loaders.TreasuryHub);
const Expenses = React.lazy(loaders.Expenses);
const Reports = React.lazy(loaders.Reports);
const AIInsights = React.lazy(loaders.AIInsights);
const AIAssistant = React.lazy(loaders.AIAssistant);

const ForensicsHub = React.lazy(loaders.ForensicsHub);
const SettingsHub = React.lazy(loaders.SettingsHub);
const RolesPermissions = React.lazy(loaders.RolesPermissions);
const FloorDesigner = React.lazy(loaders.FloorDesigner);
const Production = React.lazy(loaders.Production);
const ButcheryManager = React.lazy(loaders.Butchery);
const DispatchHub = React.lazy(loaders.DispatchHub);
const DriversHub = React.lazy(loaders.DriversHub);
const CampaignHub = React.lazy(loaders.CampaignHub);

const FiscalHub = React.lazy(loaders.FiscalHub);
const DayCloseHub = React.lazy(loaders.DayCloseHub);
const FranchiseManager = React.lazy(loaders.FranchiseManager);
const LazySetupWizard = React.lazy(loaders.SetupWizard);
const RefundManager = React.lazy(loaders.RefundManager);
const WastageManager = React.lazy(loaders.WastageManager);
const InventoryIntelligence = React.lazy(loaders.InventoryIntelligence);
const ApprovalCenter = React.lazy(loaders.ApprovalCenter);
const WhatsAppHub = React.lazy(loaders.WhatsAppHub);
const MailHub = React.lazy(loaders.MailHub);
const PlatformAggregator = React.lazy(loaders.PlatformAggregator);
const UserManagement = React.lazy(loaders.UserManagement);
const OrdersCenter = React.lazy(loaders.OrdersCenter);

const HRHub = React.lazy(loaders.HRHub);
const AttendanceManager = React.lazy(loaders.AttendanceManager);
const PayrollManager = React.lazy(loaders.PayrollManager);
const DataMigrationWizard = React.lazy(loaders.DataMigrationWizard);
const BiometricDeviceManager = React.lazy(loaders.BiometricDeviceManager);
const SchedulingManager = React.lazy(loaders.SchedulingManager);
const TaskChecklistManager = React.lazy(loaders.TaskChecklistManager);
const HRSettingsManager = React.lazy(loaders.HRSettingsManager);
const HRUserGuide = React.lazy(loaders.HRUserGuide);
const SelfOrderingKiosk = React.lazy(loaders.SelfOrderingKiosk);
const TrackOrder = React.lazy(loaders.TrackOrder);
const ReservationsHub = React.lazy(loaders.ReservationsHub);
const ComplaintsInbox = React.lazy(loaders.ComplaintsInbox);
const InteractionShowcase = React.lazy(loaders.InteractionShowcase);
const DriverDashboard = React.lazy(loaders.DriverDashboard);
const ThemeLab = React.lazy(loaders.ThemeLab);

import PageSkeleton from './components/common/PageSkeleton';

// Delayed fallback: cached chunks resolve in ms — flashing a full skeleton
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
        // Public customer order tracking (no login — link-only token = order id)
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
        path: '/setup',
        element: withSafe(LazySetupWizard),
    },
]);
