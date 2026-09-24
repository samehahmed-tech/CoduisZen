import type { ElementType } from 'react';
import {
    Activity,
    LayoutDashboard,
    ShoppingCart,
    ChefHat,
    Phone,
    Monitor,
    UtensilsCrossed,
    Package,
    Users,
    DollarSign,
    BarChart3,
    Brain,
    Sparkles,
    Shield,
    Fingerprint,
    Settings,
    Factory,
    Truck,
    Bike,
    Megaphone,
    Clock,
    FileText,
    Wallet,
    Layers,
    MessageCircle,
    Globe,
    Award,
    RotateCcw,
    Trash2,
    Printer,
    Building2,
    Map as MapIcon,
    AlertTriangle,
    CheckCircle,
    BookOpen,
    ScrollText,
    ClipboardCheck,
    ShieldCheck,
    Rocket,
    PieChart,
    Store,
    BadgeCheck,
    Receipt,
    Vault,
    CalendarDays,
    ListTodo,
    Navigation,
    Inbox,
    Beef
} from 'lucide-react';
import { AppPermission } from '../../types';

export interface NavItem {
    id: string;
    path: string;
    label: string;
    labelAr: string;
    icon: ElementType;
    permission: AppPermission;
    keywords?: string;
}

export interface NavSection {
    id: string;
    label: string;
    labelAr: string;
    /** Section-level icon displayed in the module header */
    icon?: ElementType;
    /** Color accent for the module (used in sidebar styling) */
    color?: string;
    items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
    // 1. Sales & Operations
    // Day-to-day POS operations, order management, and refunds
    {
        id: 'sales',
        label: 'Sales',
        labelAr: 'المبيعات',
        icon: ShoppingCart,
        color: 'emerald',
        items: [
            { id: 'dashboard', path: '/', label: 'Dashboard', labelAr: 'لوحة القيادة', icon: LayoutDashboard, permission: AppPermission.NAV_DASHBOARD, keywords: 'home kpi analytics' },
            { id: 'pos', path: '/pos', label: 'Point of Sale', labelAr: 'نقطة البيع', icon: ShoppingCart, permission: AppPermission.NAV_POS, keywords: 'cashier register receipt' },
            { id: 'orders', path: '/orders', label: 'Orders Center', labelAr: 'مركز الطلبات', icon: ClipboardCheck, permission: AppPermission.NAV_ORDERS, keywords: 'order list history' },
            { id: 'kds', path: '/kds', label: 'Kitchen Display', labelAr: 'شاشة المطبخ', icon: ChefHat, permission: AppPermission.NAV_KDS, keywords: 'kitchen station tickets' },
            { id: 'pickup', path: '/pickup', label: 'Handover Screen', labelAr: 'شاشة التسليم', icon: Monitor, permission: AppPermission.NAV_PICKUP, keywords: 'pickup customer display ready handover' },
            { id: 'kiosk', path: '/kiosk', label: 'Self Ordering', labelAr: 'الطلب الذاتي', icon: UtensilsCrossed, permission: AppPermission.NAV_POS, keywords: 'kiosk self ordering customer' },
            { id: 'floor-designer', path: '/floor-designer', label: 'Tables & Floor', labelAr: 'الطاولات والصالة', icon: MapIcon, permission: AppPermission.NAV_FLOOR_PLAN, keywords: 'tables layout seating' },
            { id: 'refunds', path: '/refunds', label: 'Refunds', labelAr: 'المرتجعات', icon: RotateCcw, permission: AppPermission.NAV_REFUNDS, keywords: 'returns void' },
            { id: 'day-close', path: '/day-close', label: 'Day Close', labelAr: 'إقفال اليوم', icon: Clock, permission: AppPermission.OP_CLOSE_DAY, keywords: 'shift close end-of-day' },
        ],
    },
    // 2. Call Center & Delivery
    // Everything related to call center operations and delivery
    {
        id: 'callcenter',
        label: 'Call Center',
        labelAr: 'الكول سنتر',
        icon: Phone,
        color: 'violet',
        items: [
            { id: 'call-center', path: '/call-center', label: 'Order Desk', labelAr: 'تسجيل الطلبات', icon: Phone, permission: AppPermission.NAV_CALL_CENTER, keywords: 'calls delivery desk' },
            { id: 'call-center-manager', path: '/call-center-manager', label: 'CC Manager', labelAr: 'إدارة الكول سنتر', icon: PieChart, permission: AppPermission.NAV_CALL_CENTER, keywords: 'supervisor monitor' },
            { id: 'crm', path: '/crm', label: 'Customers (CRM)', labelAr: 'العملاء (CRM)', icon: Users, permission: AppPermission.NAV_CRM, keywords: 'loyalty contacts' },
            { id: 'zones', path: '/zones', label: 'Delivery Zones', labelAr: 'المناطق والتسعير', icon: MapIcon, permission: AppPermission.NAV_CALL_CENTER, keywords: 'regions pricing' },
            { id: 'dispatch', path: '/dispatch', label: 'Dispatch Handover', labelAr: 'تسليم الطيارين', icon: Truck, permission: AppPermission.NAV_DISPATCH, keywords: 'drivers tracking handover assign' },
            { id: 'drivers', path: '/drivers', label: 'Pilots', labelAr: 'الطيارون', icon: Bike, permission: AppPermission.NAV_DISPATCH, keywords: 'pilots roster team drivers' },
            { id: 'driver-dashboard', path: '/driver', label: 'Driver Workspace', labelAr: 'صفحة الطيار', icon: Navigation, permission: AppPermission.NAV_DRIVER, keywords: 'driver mobile orders collection' },
            { id: 'platforms', path: '/platforms', label: 'Platforms', labelAr: 'التطبيقات والمنصات', icon: Globe, permission: AppPermission.NAV_PLATFORMS, keywords: 'integrations aggregators talabat' },
            { id: 'whatsapp', path: '/whatsapp', label: 'WhatsApp', labelAr: 'واتساب', icon: MessageCircle, permission: AppPermission.NAV_WHATSAPP, keywords: 'messaging chat' },
            { id: 'mail', path: '/mail', label: 'Staff Mail', labelAr: 'البريد الداخلي', icon: Inbox, permission: AppPermission.NAV_MAIL, keywords: 'mail inbox messages broadcast team' },
        ],
    },
    // 3. Menu & Recipes
    // Menu engineering, recipes, and printing configuration
    {
        id: 'menu',
        label: 'Menu',
        labelAr: 'المنيو',
        icon: BookOpen,
        color: 'orange',
        items: [
            { id: 'menu-manager', path: '/menu', label: 'Menu Manager', labelAr: 'إدارة المنيو', icon: BookOpen, permission: AppPermission.NAV_MENU_MANAGER, keywords: 'items pricing modifiers categories' },
            { id: 'recipes', path: '/recipes', label: 'Recipes', labelAr: 'الوصفات والتكلفة', icon: ScrollText, permission: AppPermission.NAV_RECIPES, keywords: 'costing bom ingredients' },
            { id: 'printers', path: '/printers', label: 'Printers', labelAr: 'الطابعات والتوجيه', icon: Printer, permission: AppPermission.NAV_PRINTERS, keywords: 'routing kitchen bar' },
            { id: 'receipt-designer', path: '/receipt-designer', label: 'Receipt Designer', labelAr: 'تصميم الإيصال', icon: Receipt, permission: AppPermission.NAV_PRINTERS, keywords: 'receipt template design' },
        ],
    },
    // 4. Inventory & Production
    // Stock management, production, wastage tracking
    {
        id: 'inventory',
        label: 'Inventory',
        labelAr: 'المخزون',
        icon: Package,
        color: 'cyan',
        items: [
            { id: 'inventory-main', path: '/inventory', label: 'Stock Overview', labelAr: 'نظرة المخزون', icon: Package, permission: AppPermission.NAV_INVENTORY, keywords: 'stock overview dashboard hub' },
            { id: 'inventory-items', path: '/inventory/items', label: 'Stock Items', labelAr: 'الأصناف المخزنية', icon: Layers, permission: AppPermission.NAV_INVENTORY, keywords: 'stock items skus adjustments import' },
            { id: 'inventory-suppliers', path: '/inventory/suppliers', label: 'Suppliers', labelAr: 'الموردين', icon: Truck, permission: AppPermission.NAV_INVENTORY, keywords: 'suppliers vendors returns' },
            { id: 'inventory-procurement', path: '/inventory/procurement', label: 'Procurement', labelAr: 'المشتريات', icon: FileText, permission: AppPermission.NAV_INVENTORY, keywords: 'purchase orders receiving procurement' },
            { id: 'inventory-warehouses', path: '/inventory/warehouses', label: 'Warehouses', labelAr: 'المخازن والتحويلات', icon: Building2, permission: AppPermission.NAV_INVENTORY, keywords: 'warehouses transfers branches logistics' },
            { id: 'inventory-counts', path: '/inventory/counts', label: 'Stock Counts', labelAr: 'الجرد', icon: ClipboardCheck, permission: AppPermission.NAV_INVENTORY, keywords: 'stock count audit variance blind' },
            { id: 'inventory-movements', path: '/inventory/movements', label: 'Movements', labelAr: 'الحركات والمسحوبات', icon: Activity, permission: AppPermission.NAV_INVENTORY, keywords: 'movements log consumption withdrawals' },
            { id: 'stock-requests', path: '/stock-requests', label: 'Stock Requests', labelAr: 'الطلبيات المخزنية', icon: ClipboardCheck, permission: AppPermission.NAV_INVENTORY, keywords: 'branch orders central warehouse supply requests' },
            { id: 'production', path: '/production', label: 'Production', labelAr: 'الإنتاج', icon: Factory, permission: AppPermission.NAV_PRODUCTION, keywords: 'prep manufacturing' },
            { id: 'butchery', path: '/butchery', label: 'Butchery', labelAr: 'التشريح والتقطيع', icon: Beef, permission: AppPermission.NAV_PRODUCTION, keywords: 'butchery fabrication yield meat cutting تشريح تقطيع' },
            { id: 'wastage', path: '/wastage', label: 'Wastage', labelAr: 'الهالك والهدر', icon: Trash2, permission: AppPermission.NAV_WASTAGE, keywords: 'loss spoilage' },
            { id: 'inventory-intel', path: '/inventory-intelligence', label: 'Intelligence', labelAr: 'ذكاء المخزون', icon: Brain, permission: AppPermission.NAV_INVENTORY, keywords: 'forecast reorder analytics' },
        ],
    },
    // 5. Finance & Reports
    // Financial operations, reporting, and compliance
    {
        id: 'finance',
        label: 'Finance',
        labelAr: 'المالية',
        icon: DollarSign,
        color: 'amber',
        items: [
            { id: 'finance-hub', path: '/finance', label: 'Finance Hub', labelAr: 'المحاسبة', icon: DollarSign, permission: AppPermission.NAV_FINANCE, keywords: 'ledger accounting' },
            { id: 'treasury', path: '/treasury', label: 'Treasury', labelAr: 'الخزينة', icon: Vault, permission: AppPermission.NAV_FINANCE, keywords: 'treasury cashbox deposits supplier payments custody vouchers خزينة توريد عهدة موردين' },
            { id: 'expenses', path: '/expenses', label: 'Expenses', labelAr: '\u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062a', icon: Wallet, permission: AppPermission.NAV_FINANCE, keywords: 'expense petty cash spending maintenance utilities' },
            { id: 'reports', path: '/reports', label: 'Reports', labelAr: 'التقارير', icon: BarChart3, permission: AppPermission.NAV_REPORTS, keywords: 'analytics sales daily' },
            { id: 'fiscal', path: '/fiscal', label: 'E-Invoicing (ETA)', labelAr: 'الفاتورة الإلكترونية', icon: Receipt, permission: AppPermission.NAV_FISCAL, keywords: 'tax compliance eta' },
            { id: 'approvals', path: '/approvals', label: 'Approvals', labelAr: 'مركز الموافقات', icon: BadgeCheck, permission: AppPermission.NAV_APPROVAL, keywords: 'approval workflow' },
        ],
    },

    {
        id: 'people',
        label: 'People & HR',
        labelAr: 'الموارد البشرية والفريق',
        icon: Users,
        color: 'blue',
        items: [
            { id: 'hr-hub', path: '/hr', label: 'Employees', labelAr: 'الموظفون', icon: Users, permission: AppPermission.NAV_PEOPLE, keywords: 'hr employees staff add user fingerprint' },
            { id: 'hr-guide', path: '/hr-guide', label: 'HR User Guide', labelAr: 'دليل الموارد البشرية', icon: BookOpen, permission: AppPermission.NAV_PEOPLE, keywords: 'hr guide help payroll attendance employees' },
            { id: 'hr-settings', path: '/hr-settings', label: 'Department Settings', labelAr: 'إعدادات الأقسام', icon: Building2, permission: AppPermission.NAV_PEOPLE, keywords: 'departments job titles branch structure hr settings' },
            { id: 'attendance', path: '/attendance', label: 'Attendance & Shifts', labelAr: 'الحضور والانصراف', icon: Clock, permission: AppPermission.NAV_ATTENDANCE, keywords: 'shifts time exceptions' },
            { id: 'payroll', path: '/payroll', label: 'Payroll & Slips', labelAr: 'الرواتب والأجور', icon: Wallet, permission: AppPermission.NAV_PAYROLL, keywords: 'wages slips cycles' },
            { id: 'forensics', path: '/forensics', label: 'Audit & Forensics', labelAr: 'التدقيق والتحقيقات', icon: Fingerprint, permission: AppPermission.NAV_FORENSICS, keywords: 'audit log trail' },
            { id: 'franchise', path: '/franchise', label: 'Franchise', labelAr: 'إدارة الفروع', icon: Store, permission: AppPermission.NAV_FRANCHISE, keywords: 'multi-branch franchise' },
            { id: 'migration', path: '/migration', label: 'Data Import (CSV)', labelAr: 'استيراد البيانات', icon: FileText, permission: AppPermission.NAV_APPROVAL, keywords: 'csv migration import' },
            { id: 'biometric-devices', path: '/biometric-devices', label: 'Biometric Devices', labelAr: 'أجهزة البصمة', icon: Fingerprint, permission: AppPermission.NAV_ATTENDANCE, keywords: 'zkteco fingerprint biometric sync devices' },
            { id: 'scheduling', path: '/scheduling', label: 'Scheduling', labelAr: 'جدولة الورديات', icon: CalendarDays, permission: AppPermission.NAV_ATTENDANCE, keywords: 'schedule week shifts' },
            { id: 'shift-tasks', path: '/shift-tasks', label: 'Shift Tasks', labelAr: 'قوائم المهام', icon: ListTodo, permission: AppPermission.NAV_ATTENDANCE, keywords: 'tasks checklist opening closing' },
        ],
    },
    // 7. Marketing & Engagement
    {
        id: 'engage',
        label: 'Marketing',
        labelAr: 'التسويق',
        icon: Megaphone,
        color: 'pink',
        items: [
            { id: 'marketing', path: '/marketing', label: 'Campaigns', labelAr: 'الحملات التسويقية', icon: Megaphone, permission: AppPermission.NAV_MARKETING, keywords: 'campaigns promotions' },
            { id: 'ai-assistant', path: '/ai-assistant', label: 'AI Assistant', labelAr: 'المساعد الذكي', icon: Sparkles, permission: AppPermission.NAV_AI_ASSISTANT, keywords: 'assistant chatbot' },
            { id: 'ai-insights', path: '/ai-insights', label: 'AI Insights', labelAr: 'رؤى الذكاء', icon: Brain, permission: AppPermission.NAV_AI_ASSISTANT, keywords: 'forecast anomaly' },
        ],
    },
    // 8. System & Settings
    {
        id: 'system',
        label: 'System',
        labelAr: 'النظام',
        icon: Settings,
        color: 'slate',
        items: [
            { id: 'admin-dashboard', path: '/admin-dashboard', label: 'Admin Dashboard', labelAr: 'لوحة الإدارة', icon: LayoutDashboard, permission: AppPermission.NAV_ADMIN_DASHBOARD, keywords: 'admin overview' },
            { id: 'user-management', path: '/user-management', label: 'Users & Roles', labelAr: 'المستخدمون والأدوار', icon: Shield, permission: AppPermission.NAV_USER_MANAGEMENT, keywords: 'users roles permissions security access accounts' },
            { id: 'settings', path: '/settings', label: 'Settings', labelAr: 'الإعدادات', icon: Settings, permission: AppPermission.NAV_SETTINGS, keywords: 'configuration' },
        ],
    },
];

export const PRIMARY_MOBILE_NAV: NavItem[] = [
    { id: 'mobile-home', path: '/', label: 'Home', labelAr: 'الرئيسية', icon: LayoutDashboard, permission: AppPermission.NAV_DASHBOARD },
    { id: 'mobile-orders', path: '/pos', label: 'Orders', labelAr: 'الطلبات', icon: ShoppingCart, permission: AppPermission.NAV_POS },
    { id: 'mobile-kitchen', path: '/kds', label: 'Kitchen', labelAr: 'المطبخ', icon: ChefHat, permission: AppPermission.NAV_KDS },
    { id: 'mobile-drivers', path: '/dispatch', label: 'Pilots', labelAr: 'الطيارين', icon: Truck, permission: AppPermission.NAV_DISPATCH },
    { id: 'mobile-more', path: '/menu', label: 'More', labelAr: 'المزيد', icon: Layers, permission: AppPermission.NAV_MENU_MANAGER },
];

export const CONTEXTUAL_NAV_MAP: Record<string, NavSection[]> = {
    '/pos': [
        {
            id: 'pos-context',
            label: 'POS Operations',
            labelAr: 'عمليات الكاشير',
            items: [
                { id: 'pos-tables', path: '/pos', label: 'Tables / Dine-in', labelAr: 'الطاولات', icon: MapIcon, permission: AppPermission.NAV_POS },
                { id: 'pos-orders', path: '/pos#orders', label: 'Active Orders', labelAr: 'الطلبات النشطة', icon: ShoppingCart, permission: AppPermission.NAV_POS },
                { id: 'pos-payments', path: '/pos#payments', label: 'Payments & Split', labelAr: 'الدفع والتقسيم', icon: DollarSign, permission: AppPermission.NAV_POS },
                { id: 'pos-receipts', path: '/pos#receipts', label: 'Recent Receipts', labelAr: 'الإيصالات', icon: FileText, permission: AppPermission.NAV_POS },
            ]
        }
    ],
    '/kds': [
        {
            id: 'kds-context',
            label: 'Kitchen Display',
            labelAr: 'شاشة المطبخ',
            items: [
                { id: 'kds-queue', path: '/kds', label: 'Order Queue', labelAr: 'قائمة الطلبات', icon: UtensilsCrossed, permission: AppPermission.NAV_KDS },
                { id: 'kds-prep', path: '/kds#preparing', label: 'Preparing', labelAr: 'قيد التحضير', icon: ChefHat, permission: AppPermission.NAV_KDS },
                { id: 'kds-ready', path: '/kds#ready', label: 'Ready Orders', labelAr: 'الطلبات الجاهزة', icon: CheckCircle, permission: AppPermission.NAV_KDS },
                { id: 'kds-delayed', path: '/kds#delayed', label: 'Delayed Orders', labelAr: 'الطلبات المتأخرة', icon: AlertTriangle, permission: AppPermission.NAV_KDS },
            ]
        }
    ],
};

export const flattenNav = () => NAV_SECTIONS.flatMap(section => section.items);
