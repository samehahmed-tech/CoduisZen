/**
 * Seed file for default roles and permissions
 * Run with: npx tsx scripts/seed-roles-permissions.ts
 */

import { db, pool } from '../server/db';
import { roles, permissionDefinitions } from '../src/db/schema';
import { sql } from 'drizzle-orm';

// ============================================================================
// PERMISSION DEFINITIONS - All available permissions in the system
// ============================================================================

const PERMISSION_CATEGORIES = {
    dashboard: { name: 'Dashboard', nameAr: 'لوحة التحكم' },
    orders: { name: 'Orders', nameAr: 'الطلبات' },
    pos: { name: 'POS', nameAr: 'نقطة البيع' },
    menu: { name: 'Menu', nameAr: 'القائمة' },
    inventory: { name: 'Inventory', nameAr: 'المخزون' },
    reports: { name: 'Reports', nameAr: 'التقارير' },
    finance: { name: 'Finance', nameAr: 'المالية' },
    customers: { name: 'Customers', nameAr: 'العملاء' },
    crm: { name: 'CRM', nameAr: 'إدارة العلاقات' },
    users: { name: 'Users', nameAr: 'المستخدمين' },
    branches: { name: 'Branches', nameAr: 'الفروع' },
    settings: { name: 'Settings', nameAr: 'الإعدادات' },
    shifts: { name: 'Shifts', nameAr: 'الورديات' },
    tables: { name: 'Tables', nameAr: 'الطاولات' },
    delivery: { name: 'Delivery', nameAr: 'التوصيل' },
    hr: { name: 'HR', nameAr: 'الموارد البشرية' },
    suppliers: { name: 'Suppliers', nameAr: 'الموردين' },
    production: { name: 'Production', nameAr: 'الإنتاج' },
    audit: { name: 'Audit', nameAr: 'سجل المراجعة' },
    system: { name: 'System', nameAr: 'النظام' },
};

const ALL_PERMISSIONS = [
    // Dashboard
    { key: 'dashboard.view', name: 'View Dashboard', nameAr: 'عرض لوحة التحكم', category: 'dashboard' },
    { key: 'dashboard.kpis', name: 'View KPIs', nameAr: 'عرض مؤشرات الأداء', category: 'dashboard' },
    { key: 'dashboard.ai_insights', name: 'View AI Insights', nameAr: 'عرض تحليلات الذكاء الاصطناعي', category: 'dashboard' },

    // Orders
    { key: 'orders.view', name: 'View Orders', nameAr: 'عرض الطلبات', category: 'orders' },
    { key: 'orders.create', name: 'Create Orders', nameAr: 'إنشاء طلبات', category: 'orders' },
    { key: 'orders.edit', name: 'Edit Orders', nameAr: 'تعديل الطلبات', category: 'orders' },
    { key: 'orders.cancel', name: 'Cancel Orders', nameAr: 'إلغاء الطلبات', category: 'orders' },
    { key: 'orders.void', name: 'Void Orders', nameAr: 'إلغاء فواتير', category: 'orders' },
    { key: 'orders.refund', name: 'Process Refunds', nameAr: 'معالجة المرتجعات', category: 'orders' },
    { key: 'orders.discount', name: 'Apply Discounts', nameAr: 'تطبيق التخفيضات', category: 'orders' },
    { key: 'orders.discount_unlimited', name: 'Unlimited Discount', nameAr: 'تخفيض غير محدود', category: 'orders' },
    { key: 'orders.price_override', name: 'Override Prices', nameAr: 'تعديل الأسعار', category: 'orders' },
    { key: 'orders.view_all', name: 'View All Branches Orders', nameAr: 'عرض طلبات جميع الفروع', category: 'orders' },

    // POS
    { key: 'pos.access', name: 'Access POS', nameAr: 'الدخول لنقطة البيع', category: 'pos' },
    { key: 'pos.open_drawer', name: 'Open Cash Drawer', nameAr: 'فتح درج النقود', category: 'pos' },
    { key: 'pos.cash_in_out', name: 'Cash In/Out', nameAr: 'إيداع/سحب نقدي', category: 'pos' },
    { key: 'pos.split_bill', name: 'Split Bill', nameAr: 'تقسيم الفاتورة', category: 'pos' },
    { key: 'pos.merge_tables', name: 'Merge Tables', nameAr: 'دمج الطاولات', category: 'pos' },
    { key: 'pos.transfer_order', name: 'Transfer Orders', nameAr: 'تحويل الطلبات', category: 'pos' },

    // Menu
    { key: 'menu.view', name: 'View Menu', nameAr: 'عرض القائمة', category: 'menu' },
    { key: 'menu.create', name: 'Create Menu Items', nameAr: 'إضافة أصناف', category: 'menu' },
    { key: 'menu.edit', name: 'Edit Menu Items', nameAr: 'تعديل الأصناف', category: 'menu' },
    { key: 'menu.delete', name: 'Delete Menu Items', nameAr: 'حذف الأصناف', category: 'menu' },
    { key: 'menu.pricing', name: 'Manage Pricing', nameAr: 'إدارة الأسعار', category: 'menu' },
    { key: 'menu.categories', name: 'Manage Categories', nameAr: 'إدارة التصنيفات', category: 'menu' },
    { key: 'menu.modifiers', name: 'Manage Modifiers', nameAr: 'إدارة الإضافات', category: 'menu' },
    { key: 'menu.recipes', name: 'Manage Recipes', nameAr: 'إدارة الوصفات', category: 'menu' },
    { key: 'menu.import_export', name: 'Import/Export Menu', nameAr: 'استيراد/تصدير القائمة', category: 'menu' },

    // Inventory
    { key: 'inventory.view', name: 'View Inventory', nameAr: 'عرض المخزون', category: 'inventory' },
    { key: 'inventory.adjust', name: 'Adjust Stock', nameAr: 'تعديل المخزون', category: 'inventory' },
    { key: 'inventory.transfer', name: 'Transfer Stock', nameAr: 'تحويل المخزون', category: 'inventory' },
    { key: 'inventory.receive', name: 'Receive Goods', nameAr: 'استلام البضائع', category: 'inventory' },
    { key: 'inventory.count', name: 'Stock Count', nameAr: 'جرد المخزون', category: 'inventory' },
    { key: 'inventory.wastage', name: 'Record Wastage', nameAr: 'تسجيل الهدر', category: 'inventory' },
    { key: 'inventory.purchase_orders', name: 'Manage Purchase Orders', nameAr: 'إدارة أوامر الشراء', category: 'inventory' },

    // Reports
    { key: 'reports.view', name: 'View Reports', nameAr: 'عرض التقارير', category: 'reports' },
    { key: 'reports.sales', name: 'Sales Reports', nameAr: 'تقارير المبيعات', category: 'reports' },
    { key: 'reports.profit', name: 'Profit Reports', nameAr: 'تقارير الأرباح', category: 'reports' },
    { key: 'reports.inventory', name: 'Inventory Reports', nameAr: 'تقارير المخزون', category: 'reports' },
    { key: 'reports.staff', name: 'Staff Reports', nameAr: 'تقارير الموظفين', category: 'reports' },
    { key: 'reports.financial', name: 'Financial Reports', nameAr: 'التقارير المالية', category: 'reports' },
    { key: 'reports.export', name: 'Export Reports', nameAr: 'تصدير التقارير', category: 'reports' },
    { key: 'reports.view_all_branches', name: 'View All Branches Reports', nameAr: 'عرض تقارير جميع الفروع', category: 'reports' },

    // Finance
    { key: 'finance.view', name: 'View Finance', nameAr: 'عرض المالية', category: 'finance' },
    { key: 'finance.expenses', name: 'Manage Expenses', nameAr: 'إدارة المصروفات', category: 'finance' },
    { key: 'finance.income', name: 'Manage Income', nameAr: 'إدارة الإيرادات', category: 'finance' },
    { key: 'finance.accounts', name: 'Manage Accounts', nameAr: 'إدارة الحسابات', category: 'finance' },
    { key: 'finance.transactions', name: 'View Transactions', nameAr: 'عرض المعاملات', category: 'finance' },
    { key: 'finance.journals', name: 'Manage Journals', nameAr: 'إدارة القيود', category: 'finance' },
    { key: 'finance.day_close', name: 'Day Close', nameAr: 'إغلاق اليومية', category: 'finance' },
    { key: 'finance.fiscal', name: 'Fiscal Management', nameAr: 'الإدارة الضريبية', category: 'finance' },

    // Customers
    { key: 'customers.view', name: 'View Customers', nameAr: 'عرض العملاء', category: 'customers' },
    { key: 'customers.create', name: 'Create Customers', nameAr: 'إضافة عملاء', category: 'customers' },
    { key: 'customers.edit', name: 'Edit Customers', nameAr: 'تعديل العملاء', category: 'customers' },
    { key: 'customers.delete', name: 'Delete Customers', nameAr: 'حذف العملاء', category: 'customers' },
    { key: 'customers.loyalty', name: 'Manage Loyalty', nameAr: 'إدارة الولاء', category: 'customers' },

    // CRM
    { key: 'crm.campaigns', name: 'Manage Campaigns', nameAr: 'إدارة الحملات', category: 'crm' },
    { key: 'crm.analytics', name: 'CRM Analytics', nameAr: 'تحليلات العملاء', category: 'crm' },
    { key: 'crm.segments', name: 'Manage Segments', nameAr: 'إدارة الشرائح', category: 'crm' },

    // Users
    { key: 'users.view', name: 'View Users', nameAr: 'عرض المستخدمين', category: 'users' },
    { key: 'users.create', name: 'Create Users', nameAr: 'إضافة مستخدمين', category: 'users' },
    { key: 'users.edit', name: 'Edit Users', nameAr: 'تعديل المستخدمين', category: 'users' },
    { key: 'users.delete', name: 'Delete Users', nameAr: 'حذف المستخدمين', category: 'users' },
    { key: 'users.permissions', name: 'Manage Permissions', nameAr: 'إدارة الصلاحيات', category: 'users' },
    { key: 'users.roles', name: 'Manage Roles', nameAr: 'إدارة الأدوار', category: 'users' },
    { key: 'users.reset_password', name: 'Reset Passwords', nameAr: 'إعادة تعيين كلمات المرور', category: 'users' },
    { key: 'users.reset_pin', name: 'Reset PIN Codes', nameAr: 'إعادة تعيين الرقم السري', category: 'users' },

    // Branches
    { key: 'branches.view', name: 'View Branches', nameAr: 'عرض الفروع', category: 'branches' },
    { key: 'branches.create', name: 'Create Branches', nameAr: 'إضافة فروع', category: 'branches' },
    { key: 'branches.edit', name: 'Edit Branches', nameAr: 'تعديل الفروع', category: 'branches' },
    { key: 'branches.delete', name: 'Delete Branches', nameAr: 'حذف الفروع', category: 'branches' },
    { key: 'branches.switch', name: 'Switch Branches', nameAr: 'التبديل بين الفروع', category: 'branches' },

    // Settings
    { key: 'settings.view', name: 'View Settings', nameAr: 'عرض الإعدادات', category: 'settings' },
    { key: 'settings.general', name: 'General Settings', nameAr: 'الإعدادات العامة', category: 'settings' },
    { key: 'settings.printers', name: 'Printer Settings', nameAr: 'إعدادات الطابعات', category: 'settings' },
    { key: 'settings.payment', name: 'Payment Settings', nameAr: 'إعدادات الدفع', category: 'settings' },
    { key: 'settings.tax', name: 'Tax Settings', nameAr: 'إعدادات الضرائب', category: 'settings' },
    { key: 'settings.notifications', name: 'Notification Settings', nameAr: 'إعدادات الإشعارات', category: 'settings' },
    { key: 'settings.integrations', name: 'Integration Settings', nameAr: 'إعدادات التكامل', category: 'settings' },

    // Shifts
    { key: 'shifts.view', name: 'View Shifts', nameAr: 'عرض الورديات', category: 'shifts' },
    { key: 'shifts.open', name: 'Open Shift', nameAr: 'فتح وردية', category: 'shifts' },
    { key: 'shifts.close', name: 'Close Shift', nameAr: 'إغلاق وردية', category: 'shifts' },
    { key: 'shifts.manage_all', name: 'Manage All Shifts', nameAr: 'إدارة كل الورديات', category: 'shifts' },

    // Tables
    { key: 'tables.view', name: 'View Tables', nameAr: 'عرض الطاولات', category: 'tables' },
    { key: 'tables.manage', name: 'Manage Tables', nameAr: 'إدارة الطاولات', category: 'tables' },
    { key: 'tables.reservations', name: 'Manage Reservations', nameAr: 'إدارة الحجوزات', category: 'tables' },

    // Delivery
    { key: 'delivery.view', name: 'View Delivery', nameAr: 'عرض التوصيل', category: 'delivery' },
    { key: 'delivery.assign', name: 'Assign Drivers', nameAr: 'تعيين السائقين', category: 'delivery' },
    { key: 'delivery.track', name: 'Track Deliveries', nameAr: 'تتبع التوصيلات', category: 'delivery' },
    { key: 'delivery.manage_drivers', name: 'Manage Drivers', nameAr: 'إدارة السائقين', category: 'delivery' },
    { key: 'delivery.zones', name: 'Manage Zones', nameAr: 'إدارة المناطق', category: 'delivery' },

    // HR
    { key: 'hr.view', name: 'View HR', nameAr: 'عرض الموارد البشرية', category: 'hr' },
    { key: 'hr.employees', name: 'Manage Employees', nameAr: 'إدارة الموظفين', category: 'hr' },
    { key: 'hr.attendance', name: 'Manage Attendance', nameAr: 'إدارة الحضور', category: 'hr' },
    { key: 'hr.payroll', name: 'Manage Payroll', nameAr: 'إدارة الرواتب', category: 'hr' },
    { key: 'hr.leaves', name: 'Manage Leaves', nameAr: 'إدارة الإجازات', category: 'hr' },

    // Suppliers
    { key: 'suppliers.view', name: 'View Suppliers', nameAr: 'عرض الموردين', category: 'suppliers' },
    { key: 'suppliers.manage', name: 'Manage Suppliers', nameAr: 'إدارة الموردين', category: 'suppliers' },
    { key: 'suppliers.payments', name: 'Supplier Payments', nameAr: 'مدفوعات الموردين', category: 'suppliers' },

    // Production
    { key: 'production.view', name: 'View Production', nameAr: 'عرض الإنتاج', category: 'production' },
    { key: 'production.batches', name: 'Manage Batches', nameAr: 'إدارة الدفعات', category: 'production' },
    { key: 'production.bom', name: 'Manage BOM', nameAr: 'إدارة قوائم المواد', category: 'production' },

    // Audit
    { key: 'audit.view', name: 'View Audit Logs', nameAr: 'عرض سجل المراجعة', category: 'audit' },
    { key: 'audit.export', name: 'Export Audit Logs', nameAr: 'تصدير سجل المراجعة', category: 'audit' },

    // System
    { key: 'system.backup', name: 'System Backup', nameAr: 'نسخ احتياطي', category: 'system' },
    { key: 'system.restore', name: 'System Restore', nameAr: 'استعادة النظام', category: 'system' },
    { key: 'system.maintenance', name: 'System Maintenance', nameAr: 'صيانة النظام', category: 'system' },
    { key: 'system.logs', name: 'View System Logs', nameAr: 'عرض سجلات النظام', category: 'system' },
];

// ============================================================================
// PREDEFINED ROLES
// ============================================================================

const PREDEFINED_ROLES = [
    {
        id: 'role_owner',
        name: 'OWNER',
        nameAr: 'المالك',
        description: 'Full system access with all permissions',
        descriptionAr: 'صلاحية كاملة للنظام',
        isSystem: true,
        priority: 100,
        color: '#dc2626',
        icon: 'crown',
        permissions: ['*'], // All permissions
    },
    {
        id: 'role_partner',
        name: 'PARTNER',
        nameAr: 'شريك',
        description: 'Partner with cross-branch view and approval access',
        descriptionAr: 'شريك مع عرض متعدد الفروع وصلاحيات موافقة',
        isSystem: true,
        priority: 95,
        color: '#9333ea',
        icon: 'handshake',
        permissions: [
            'dashboard.*',
            'orders.*',
            'reports.*',
            'finance.*',
            'inventory.view',
            'customers.*',
            'crm.*',
            'branches.view',
            'branches.switch',
            'shifts.view',
            'delivery.view',
            'hr.view',
            'suppliers.view',
            'production.view',
            'audit.view',
        ],
    },
    {
        id: 'role_owner_viewer',
        name: 'OWNER_VIEWER',
        nameAr: 'المالك (عرض فقط)',
        description: 'Read-only cross-branch access for owners',
        descriptionAr: 'عرض فقط لجميع الفروع للمالك',
        isSystem: true,
        priority: 90,
        color: '#6366f1',
        icon: 'eye',
        permissions: [
            'dashboard.view', 'dashboard.kpis',
            'orders.view',
            'reports.*',
            'finance.view', 'finance.transactions',
            'inventory.view',
            'customers.view',
            'branches.view',
            'shifts.view',
            'delivery.view',
            'hr.view',
            'suppliers.view',
            'production.view',
        ],
    },
    {
        id: 'role_admin',
        name: 'ADMIN',
        nameAr: 'مدير النظام',
        description: 'System administrator with full access except system-level operations',
        descriptionAr: 'مدير النظام مع صلاحيات كاملة عدا العمليات على مستوى النظام',
        isSystem: true,
        priority: 90,
        color: '#7c3aed',
        icon: 'shield',
        permissions: ALL_PERMISSIONS.filter(p => !p.key.startsWith('system.')).map(p => p.key),
    },
    {
        id: 'role_manager',
        name: 'MANAGER',
        nameAr: 'مدير',
        description: 'Branch manager with operational access',
        descriptionAr: 'مدير فرع مع صلاحيات تشغيلية',
        isSystem: true,
        priority: 70,
        color: '#2563eb',
        icon: 'briefcase',
        permissions: [
            'dashboard.view', 'dashboard.kpis',
            'orders.*', 'pos.*',
            'menu.view', 'menu.edit',
            'inventory.view', 'inventory.adjust', 'inventory.wastage',
            'reports.view', 'reports.sales', 'reports.inventory', 'reports.staff',
            'customers.*',
            'shifts.*',
            'tables.*',
            'delivery.view', 'delivery.assign', 'delivery.track',
        ],
    },
    {
        id: 'role_accountant',
        name: 'ACCOUNTANT',
        nameAr: 'محاسب',
        description: 'Financial and accounting access',
        descriptionAr: 'صلاحيات مالية ومحاسبية',
        isSystem: true,
        priority: 60,
        color: '#059669',
        icon: 'calculator',
        permissions: [
            'dashboard.view', 'dashboard.kpis',
            'orders.view',
            'reports.*',
            'finance.*',
            'inventory.view',
            'suppliers.view', 'suppliers.payments',
        ],
    },
    {
        id: 'role_cashier',
        name: 'CASHIER',
        nameAr: 'كاشير',
        description: 'POS and order management',
        descriptionAr: 'نقطة البيع وإدارة الطلبات',
        isSystem: true,
        priority: 40,
        color: '#0891b2',
        icon: 'wallet',
        permissions: [
            'pos.access', 'pos.open_drawer',
            'orders.view', 'orders.create', 'orders.edit',
            'customers.view', 'customers.create',
            'shifts.view', 'shifts.open', 'shifts.close',
            'tables.view',
        ],
    },
    {
        id: 'role_it',
        name: 'IT',
        nameAr: 'تقنية المعلومات',
        description: 'IT support and system configuration',
        descriptionAr: 'دعم تقني وإعداد النظام',
        isSystem: true,
        priority: 80,
        color: '#6366f1',
        icon: 'settings',
        permissions: [
            'settings.*',
            'users.view', 'users.reset_password', 'users.reset_pin',
            'branches.view',
            'system.*',
            'audit.*',
        ],
    },
    {
        id: 'role_waiter',
        name: 'WAITER',
        nameAr: 'ويتر',
        description: 'Table service and order taking',
        descriptionAr: 'خدمة الطاولات وتلقي الطلبات',
        isSystem: true,
        priority: 30,
        color: '#f59e0b',
        icon: 'utensils',
        permissions: [
            'pos.access',
            'orders.view', 'orders.create', 'orders.edit',
            'tables.view',
            'menu.view',
        ],
    },
    {
        id: 'role_kitchen',
        name: 'KITCHEN',
        nameAr: 'المطبخ',
        description: 'Kitchen display and order preparation',
        descriptionAr: 'شاشة المطبخ وتحضير الطلبات',
        isSystem: true,
        priority: 25,
        color: '#ea580c',
        icon: 'chef-hat',
        permissions: [
            'orders.view',
            'menu.view',
            'inventory.view',
        ],
    },
    {
        id: 'role_driver',
        name: 'DRIVER',
        nameAr: 'سائق',
        description: 'Delivery driver access',
        descriptionAr: 'صلاحيات سائق التوصيل',
        isSystem: true,
        priority: 20,
        color: '#16a34a',
        icon: 'truck',
        permissions: [
            'delivery.view', 'delivery.track',
            'orders.view',
        ],
    },
    {
        id: 'role_call_center',
        name: 'CALL_CENTER',
        nameAr: 'مركز الاتصال',
        description: 'Call center operator access',
        descriptionAr: 'صلاحيات موظف مركز الاتصال',
        isSystem: true,
        priority: 35,
        color: '#8b5cf6',
        icon: 'headphones',
        permissions: [
            'orders.view', 'orders.create', 'orders.edit',
            'customers.*',
            'delivery.view', 'delivery.track',
            'menu.view',
        ],
    },
];

// ============================================================================
// SEED FUNCTION
// ============================================================================

async function seedRolesAndPermissions() {
    console.log('🔐 Seeding roles and permissions...\n');

    // 1. Insert permission definitions
    console.log('📋 Inserting permission definitions...');
    for (const perm of ALL_PERMISSIONS) {
        const catInfo = PERMISSION_CATEGORIES[perm.category as keyof typeof PERMISSION_CATEGORIES];
        await pool.query(`
            IF NOT EXISTS (SELECT 1 FROM permission_definitions WHERE [key] = $1)
            INSERT INTO permission_definitions (id, [key], name, name_ar, category, category_ar, is_active, sort_order, created_at)
            VALUES ($2, $1, $3, $4, $5, $6, 1, $7, GETDATE())
        `, [
            perm.key,
            `perm_${perm.key.replace(/\./g, '_')}`,
            perm.name,
            perm.nameAr,
            perm.category,
            catInfo?.nameAr || perm.category,
            ALL_PERMISSIONS.indexOf(perm),
        ]);
    }
    console.log(`   ✓ Inserted ${ALL_PERMISSIONS.length} permissions\n`);

    // 2. Insert predefined roles
    console.log('👥 Inserting predefined roles...');
    for (const role of PREDEFINED_ROLES) {
        await pool.query(`
            IF NOT EXISTS (SELECT 1 FROM roles WHERE name = $1)
            INSERT INTO roles (id, name, name_ar, description, description_ar, permissions, is_system, is_active, priority, color, icon, created_at, updated_at)
            VALUES ($2, $1, $3, $4, $5, $6, $7, 1, $8, $9, $10, GETDATE(), GETDATE())
        `, [
            role.name,
            role.id,
            role.nameAr,
            role.description,
            role.descriptionAr,
            JSON.stringify(role.permissions || []),
            role.isSystem === false ? 0 : 1,
            role.priority || 0,
            role.color || '#6366f1',
            role.icon || 'user',
        ]);
        console.log(`   ✓ Role: ${role.nameAr} (${role.name})`);
    }

    console.log('\n✅ Seeding complete!');
    console.log('\n📝 Available roles:');
    PREDEFINED_ROLES.forEach(r => {
        console.log(`   • ${r.nameAr} (${r.name}) - ${r.description}`);
    });

    process.exit(0);
}

seedRolesAndPermissions().catch(err => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
});
