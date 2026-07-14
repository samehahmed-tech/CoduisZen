import { Request, Response } from 'express';
import { db } from '../db';
import { roles, permissionDefinitions } from '../../src/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { AppPermission, UserRole, INITIAL_ROLE_PERMISSIONS } from '../../types';

const param = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

const PERMISSION_METADATA: { key: AppPermission; name: string; nameAr: string; category: string; categoryAr: string }[] = [
    { key: AppPermission.NAV_DASHBOARD, name: 'Dashboard', nameAr: 'لوحة التحكم', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_ADMIN_DASHBOARD, name: 'Admin Dashboard', nameAr: 'لوحة تحكم الإدارة', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_POS, name: 'POS', nameAr: 'نقطة البيع', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_KDS, name: 'Kitchen Display', nameAr: 'شاشة المطبخ', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_PICKUP, name: 'Pickup / Packing', nameAr: 'الاستلام والتغليف', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_CALL_CENTER, name: 'Call Center', nameAr: 'مركز الاتصال', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_INVENTORY, name: 'Inventory', nameAr: 'المخزون', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_FINANCE, name: 'Finance', nameAr: 'المالية', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_REPORTS, name: 'Reports', nameAr: 'التقارير', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_CRM, name: 'CRM', nameAr: 'إدارة العملاء', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_MENU_MANAGER, name: 'Menu Manager', nameAr: 'إدارة المنيو', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_ORDERS, name: 'Orders', nameAr: 'الطلبات', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_RECIPES, name: 'Recipes', nameAr: 'الوصفات', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_FORENSICS, name: 'Forensics', nameAr: 'التحقيقات', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_AI_ASSISTANT, name: 'AI Assistant', nameAr: 'المساعد الذكي', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_SETTINGS, name: 'Settings', nameAr: 'الإعدادات', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_SECURITY, name: 'Security', nameAr: 'الأمان', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_PRINTERS, name: 'Printers', nameAr: 'الطابعات', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_PRODUCTION, name: 'Production', nameAr: 'الإنتاج', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_PEOPLE, name: 'People / HR', nameAr: 'الموارد البشرية', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_FLOOR_PLAN, name: 'Floor Plan', nameAr: 'مخطط القاعة', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_DRIVER, name: 'Driver', nameAr: 'السائق', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_USER_MANAGEMENT, name: 'User Management', nameAr: 'إدارة المستخدمين', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_TREASURY, name: 'Treasury', nameAr: 'الخزانة', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_PAYROLL, name: 'Payroll', nameAr: 'الرواتب', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_QUALITY, name: 'Quality', nameAr: 'الجودة', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_ATTENDANCE, name: 'Attendance', nameAr: 'الحضور', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_WASTAGE, name: 'Wastage', nameAr: 'الهدر', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_DISPATCH, name: 'Dispatch', nameAr: 'التوزيع', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_FRANCHISE, name: 'Franchise', nameAr: 'الامتياز', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_APPROVAL, name: 'Approvals', nameAr: 'الموافقات', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_MARKETING, name: 'Marketing', nameAr: 'التسويق', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_WHATSAPP, name: 'WhatsApp', nameAr: 'واتساب', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_PLATFORMS, name: 'Platforms', nameAr: 'المنصات', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_WEBHOOKS, name: 'Webhooks', nameAr: 'Webhooks', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_REFUNDS, name: 'Refunds', nameAr: 'المبالغ المستردة', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.NAV_FISCAL, name: 'E-Invoicing', nameAr: 'الفاتورة الإلكترونية', category: 'navigation', categoryAr: 'التنقل' },
    { key: AppPermission.DATA_VIEW_REVENUE, name: 'View Revenue', nameAr: 'عرض الإيرادات', category: 'data', categoryAr: 'البيانات' },
    { key: AppPermission.DATA_VIEW_COSTS, name: 'View Costs', nameAr: 'عرض التكاليف', category: 'data', categoryAr: 'البيانات' },
    { key: AppPermission.DATA_VIEW_PROFITS, name: 'View Profits', nameAr: 'عرض الأرباح', category: 'data', categoryAr: 'البيانات' },
    { key: AppPermission.DATA_VIEW_CUSTOMER_SENSITIVE, name: 'View Customer Data', nameAr: 'عرض بيانات العملاء', category: 'data', categoryAr: 'البيانات' },
    { key: AppPermission.DATA_VIEW_STOCK_LEVELS, name: 'View Stock Levels', nameAr: 'عرض مستويات المخزون', category: 'data', categoryAr: 'البيانات' },
    { key: AppPermission.DATA_VIEW_AUDIT_LOGS, name: 'View Audit Logs', nameAr: 'عرض سجل التدقيق', category: 'data', categoryAr: 'البيانات' },
    { key: AppPermission.DATA_VIEW_SALARIES, name: 'View Salaries', nameAr: 'عرض الرواتب', category: 'data', categoryAr: 'البيانات' },
    { key: AppPermission.OP_VOID_ORDER, name: 'Void Order', nameAr: 'إلغاء طلب', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_APPLY_DISCOUNT, name: 'Apply Discount', nameAr: 'تطبيق خصم', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_PROCESS_REFUND, name: 'Process Refund', nameAr: 'معالجة استرداد', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_TRANSFER_STOCK, name: 'Transfer Stock', nameAr: 'تحويل مخزون', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_ADJUST_STOCK, name: 'Adjust Stock', nameAr: 'تسوية مخزون', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_PLACE_ORDER, name: 'Place Order', nameAr: 'إنشاء طلب', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_CLOSE_DAY, name: 'Close Day', nameAr: 'إغلاق اليوم', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_CREATE_PO, name: 'Create Purchase Order', nameAr: 'إنشاء أمر شراء', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_RECEIVE_GRN, name: 'Receive GRN', nameAr: 'استلام إذن استلام', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_APPROVE_PO, name: 'Approve Purchase Order', nameAr: 'اعتماد أمر شراء', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_CREATE_SUPPLIER_INVOICE, name: 'Create Supplier Invoice', nameAr: 'إنشاء فاتورة مورد', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_APPROVE_SUPPLIER_INVOICE, name: 'Approve Supplier Invoice', nameAr: 'اعتماد فاتورة مورد', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_PROCESS_PAYROLL, name: 'Process Payroll', nameAr: 'معالجة الرواتب', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.OP_MANAGE_CASH_DRAWER, name: 'Manage Cash Drawer', nameAr: 'إدارة الدرج النقدي', category: 'operations', categoryAr: 'العمليات' },
    { key: AppPermission.CFG_MANAGE_USERS, name: 'Manage Users', nameAr: 'إدارة المستخدمين', category: 'configuration', categoryAr: 'الإعدادات' },
    { key: AppPermission.CFG_MANAGE_ROLES, name: 'Manage Roles', nameAr: 'إدارة الأدوار', category: 'configuration', categoryAr: 'الإعدادات' },
    { key: AppPermission.CFG_EDIT_MENU_PRICING, name: 'Edit Menu Pricing', nameAr: 'تعديل أسعار المنيو', category: 'configuration', categoryAr: 'الإعدادات' },
    { key: AppPermission.CFG_EDIT_FLOOR_PLAN, name: 'Edit Floor Plan', nameAr: 'تعديل مخطط القاعة', category: 'configuration', categoryAr: 'الإعدادات' },
    { key: AppPermission.CFG_MANAGE_BRANCHES, name: 'Manage Branches', nameAr: 'إدارة الفروع', category: 'configuration', categoryAr: 'الإعدادات' },
    { key: AppPermission.CFG_OFFLINE_MODE, name: 'Offline Mode', nameAr: 'الوضع غير المتصل', category: 'configuration', categoryAr: 'الإعدادات' },
];

async function migrateBuiltInRolePermissions() {
    const isAppPermission = (perms: string[]) => perms.length === 0 || perms.some(p => p.startsWith('NAV_') || p.startsWith('DATA_') || p.startsWith('OP_') || p.startsWith('CFG_'));
    const systemRoleNames = Object.values(UserRole).filter(r => r !== UserRole.CUSTOM);
    const existingRoles = await db.select().from(roles).where(inArray(roles.name, systemRoleNames as string[]));
    for (const role of existingRoles) {
        const defaultPerms = INITIAL_ROLE_PERMISSIONS[role.name as UserRole];
        if (defaultPerms && defaultPerms.length > 0) {
            const currentPerms = role.permissions && isAppPermission(role.permissions) ? role.permissions : [];
            const mergedPerms = Array.from(new Set([...currentPerms, ...defaultPerms]));
            const hasAllDefaults = defaultPerms.every((permission) => currentPerms.includes(permission));
            if (!role.permissions || !isAppPermission(role.permissions) || !hasAllDefaults) {
                await db.update(roles)
                    .set({ permissions: mergedPerms as string[], updatedAt: new Date() })
                    .where(eq(roles.id, role.id));
            }
        }
    }
    const existingNames = new Set(existingRoles.map(r => r.name));
    for (const roleName of systemRoleNames) {
        if (!existingNames.has(roleName)) {
            const defaultPerms = INITIAL_ROLE_PERMISSIONS[roleName as UserRole];
            const roleId = `role_${roleName.toLowerCase()}`;
            await db.insert(roles).values({
                id: roleId,
                name: roleName,
                nameAr: roleName,
                permissions: defaultPerms ? defaultPerms as string[] : [],
                isSystem: true,
                isActive: true,
                priority: roleName === UserRole.SUPER_ADMIN ? 100 : 50,
                color: '#6366f1',
                icon: 'user',
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
    }
}

async function ensurePermissionDefinitions() {
        const existing = await db.select({ key: permissionDefinitions.key }).top(1).from(permissionDefinitions);
    if (existing.length > 0) return;
    for (const perm of PERMISSION_METADATA) {
        await db.insert(permissionDefinitions).values({
            id: `perm_${perm.key.toLowerCase()}`,
            key: perm.key,
            name: perm.name,
            nameAr: perm.nameAr,
            category: perm.category,
            categoryAr: perm.categoryAr,
            isActive: true,
            sortOrder: PERMISSION_METADATA.indexOf(perm),
        });
    }
}

export const getAllRoles = async (req: Request, res: Response) => {
    try {
        await ensurePermissionDefinitions();
        await migrateBuiltInRolePermissions();
        const allRoles = await db.select().from(roles).where(eq(roles.isActive, true)).orderBy(roles.priority);
        res.json(allRoles);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getRole = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'ROLE_ID_REQUIRED' });
        const [role] = await db.select().from(roles).where(eq(roles.id, id));
        if (!role) return res.status(404).json({ error: 'ROLE_NOT_FOUND' });
        res.json(role);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createRole = async (req: Request, res: Response) => {
    try {
        const { id, name, nameAr, permissions, color, icon, isSystem } = req.body;
        if (!id || !name) return res.status(400).json({ error: 'ROLE_ID_AND_NAME_REQUIRED' });
        const [existing] = await db.select().from(roles).where(eq(roles.id, id));
        if (existing) return res.status(409).json({ error: 'ROLE_ALREADY_EXISTS' });
        const [created] = await db.insert(roles).output().values({
            id,
            name,
            nameAr: nameAr || name,
            permissions: permissions || [],
            isSystem: isSystem ?? false,
            isActive: true,
            priority: 0,
            color: color || '#6366f1',
            icon: icon || 'user',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        res.status(201).json(created);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateRole = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'ROLE_ID_REQUIRED' });
        const { name, nameAr, permissions, isActive, color, icon, priority } = req.body;
        const [existing] = await db.select().from(roles).where(eq(roles.id, id));
        if (!existing) return res.status(404).json({ error: 'ROLE_NOT_FOUND' });
        const [updated] = await db.update(roles)
            .set({
                ...(name !== undefined && { name }),
                ...(nameAr !== undefined && { nameAr }),
                ...(permissions !== undefined && { permissions }),
                ...(isActive !== undefined && { isActive }),
                ...(color !== undefined && { color }),
                ...(icon !== undefined && { icon }),
                ...(priority !== undefined && { priority }),
                updatedAt: new Date(),
            })
            .output()
            .where(eq(roles.id, id));
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteRole = async (req: Request, res: Response) => {
    try {
        const id = param(req.params.id);
        if (!id) return res.status(400).json({ error: 'ROLE_ID_REQUIRED' });
        const [role] = await db.select().from(roles).where(eq(roles.id, id));
        if (!role) return res.status(404).json({ error: 'ROLE_NOT_FOUND' });
        if (role.isSystem) return res.status(403).json({ error: 'CANNOT_DELETE_SYSTEM_ROLE' });
        await db.delete(roles).where(eq(roles.id, id));
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getPermissionDefinitions = async (_req: Request, res: Response) => {
    try {
        await ensurePermissionDefinitions();
        const allPerms = await db.select().from(permissionDefinitions).where(eq(permissionDefinitions.isActive, true)).orderBy(permissionDefinitions.sortOrder);
        res.json(allPerms);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const syncPermissions = async (_req: Request, res: Response) => {
    try {
        await ensurePermissionDefinitions();
        await migrateBuiltInRolePermissions();
        const permCount = await db.select({ count: sql<number>`count(*)` }).from(permissionDefinitions);
        const roleCount = await db.select({ count: sql<number>`count(*)` }).from(roles);
        res.json({ synced: true, permissionDefinitions: Number(permCount[0]?.count || 0), roles: Number(roleCount[0]?.count || 0) });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
