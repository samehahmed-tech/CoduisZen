import React, { useEffect, useMemo, useState } from 'react';
import {
    Activity, Ban, Building2, Check, ChevronRight, Crown, Download, Eye, EyeOff, FileText,
    KeyRound, Layers, LockKeyhole, MapPin, Monitor, Plus, RefreshCw, Save, Search,
    ShieldCheck, Trash2, Users, X, UserCog, Settings, Globe, FileBarChart,
} from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { usersApi } from '@/services/api/users';
import { rolesApi } from '@/services/api/roles';
import { useToast } from '@/components/common/ToastProvider';
import { useConfirm } from '@/components/common/ConfirmProvider';
import { AppPermission, INITIAL_ROLE_PERMISSIONS, User, UserRole, isCorporateRole } from '@/types';
import { getRoleLabel } from '@/utils/roleLabels';

type Tab = 'users' | 'access' | 'security';
type UserForm = Partial<User> & { password?: string; pin?: string };

const tabs: { id: Tab; ar: string; en: string; icon: React.ElementType }[] = [
    { id: 'users', ar: 'المستخدمين', en: 'Users', icon: Users },
    { id: 'access', ar: 'الأدوار والصلاحيات', en: 'Roles & Permissions', icon: ShieldCheck },
    { id: 'security', ar: 'الأمان والجلسات', en: 'Security', icon: LockKeyhole },
];

const categories: { key: string; ar: string; en: string; icon: React.ElementType; color: string; bg: string }[] = [
    { key: 'NAV', ar: 'الصفحات', en: 'Pages', icon: Globe, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { key: 'DATA', ar: 'البيانات', en: 'Data', icon: FileBarChart, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { key: 'OP', ar: 'العمليات', en: 'Operations', icon: Settings, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { key: 'CFG', ar: 'الإعدادات', en: 'Settings', icon: LockKeyhole, color: 'text-rose-500', bg: 'bg-rose-500/10' },
];

const ROLE_DEPARTMENTS: { label: string; labelAr: string; color: string; roles: string[] }[] = [
    { label: 'Leadership', labelAr: 'القيادة', color: '#7c3aed', roles: [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.PARTNER, UserRole.CEO, UserRole.COO, UserRole.GENERAL_MANAGER] },
    { label: 'Branch Ops', labelAr: 'التشغيل', color: '#d97706', roles: [UserRole.BRANCH_MANAGER, UserRole.CASHIER_MANAGER, UserRole.CASHIER, UserRole.WAITER, UserRole.CAPTAIN, UserRole.KITCHEN_STAFF, UserRole.DRIVER] },
    { label: 'Support', labelAr: 'الدعم', color: '#0891b2', roles: [UserRole.CALL_CENTER, UserRole.CALL_CENTER_MANAGER, UserRole.WAREHOUSE_STAFF, UserRole.WAREHOUSE_DIRECTOR, UserRole.PROCUREMENT_MANAGER] },
    { label: 'Finance & HR', labelAr: 'المالية والموارد', color: '#059669', roles: [UserRole.ACCOUNTANT, UserRole.COST_ACCOUNTANT, UserRole.FINANCE_DIRECTOR, UserRole.HR_MANAGER, UserRole.PAYROLL_OFFICER, UserRole.TREASURY_OFFICER, UserRole.QUALITY_OFFICER, UserRole.TECH_SUPPORT] },
];

const PERM_LABELS: Record<string, { en: string; ar: string }> = {
    NAV_DASHBOARD: { en: 'Dashboard', ar: 'لوحة التحكم' },
    NAV_ADMIN_DASHBOARD: { en: 'Admin Dashboard', ar: 'لوحة تحكم الإدارة' },
    NAV_POS: { en: 'POS', ar: 'نقطة البيع' },
    NAV_KDS: { en: 'Kitchen Display', ar: 'شاشة المطبخ' },
    NAV_PICKUP: { en: 'Pickup', ar: 'الاستلام' },
    NAV_CALL_CENTER: { en: 'Call Center', ar: 'مركز الاتصال' },
    NAV_INVENTORY: { en: 'Inventory', ar: 'المخزون' },
    NAV_FINANCE: { en: 'Finance', ar: 'المالية' },
    NAV_REPORTS: { en: 'Reports', ar: 'التقارير' },
    NAV_CRM: { en: 'CRM', ar: 'إدارة العملاء' },
    NAV_MENU_MANAGER: { en: 'Menu Manager', ar: 'إدارة المنيو' },
    NAV_ORDERS: { en: 'Orders', ar: 'الطلبات' },
    NAV_RECIPES: { en: 'Recipes', ar: 'الوصفات' },
    NAV_FORENSICS: { en: 'Forensics', ar: 'التحقيقات' },
    NAV_AI_ASSISTANT: { en: 'AI Assistant', ar: 'المساعد الذكي' },
    NAV_SETTINGS: { en: 'Settings', ar: 'الإعدادات' },
    NAV_PRINTERS: { en: 'Printers', ar: 'الطابعات' },
    NAV_PRODUCTION: { en: 'Production', ar: 'الإنتاج' },
    NAV_PEOPLE: { en: 'People / HR', ar: 'الموارد البشرية' },
    NAV_FLOOR_PLAN: { en: 'Floor Plan', ar: 'مخطط القاعة' },
    NAV_DRIVER: { en: 'Driver', ar: 'السائق' },
    NAV_TREASURY: { en: 'Treasury', ar: 'الخزانة' },
    NAV_PAYROLL: { en: 'Payroll', ar: 'الرواتب' },
    NAV_QUALITY: { en: 'Quality', ar: 'الجودة' },
    NAV_ATTENDANCE: { en: 'Attendance', ar: 'الحضور' },
    NAV_WASTAGE: { en: 'Wastage', ar: 'الهدر' },
    NAV_DISPATCH: { en: 'Dispatch', ar: 'التوزيع' },
    NAV_FRANCHISE: { en: 'Franchise', ar: 'الامتياز' },
    NAV_APPROVAL: { en: 'Approvals', ar: 'الموافقات' },
    NAV_USER_MANAGEMENT: { en: 'User Management', ar: 'إدارة المستخدمين' },
    NAV_MARKETING: { en: 'Marketing', ar: 'التسويق' },
    NAV_WHATSAPP: { en: 'WhatsApp', ar: 'واتساب' },
    NAV_PLATFORMS: { en: 'Platforms', ar: 'المنصات' },
    NAV_REFUNDS: { en: 'Refunds', ar: 'المبالغ المستردة' },
    NAV_FISCAL: { en: 'E-Invoicing', ar: 'الفاتورة الإلكترونية' },
    DATA_VIEW_REVENUE: { en: 'View Revenue', ar: 'عرض الإيرادات' },
    DATA_VIEW_COSTS: { en: 'View Costs', ar: 'عرض التكاليف' },
    DATA_VIEW_PROFITS: { en: 'View Profits', ar: 'عرض الأرباح' },
    DATA_VIEW_CUSTOMER_SENSITIVE: { en: 'View Customer Data', ar: 'عرض بيانات العملاء' },
    DATA_VIEW_STOCK_LEVELS: { en: 'View Stock Levels', ar: 'عرض مستويات المخزون' },
    DATA_VIEW_AUDIT_LOGS: { en: 'View Audit Logs', ar: 'عرض سجل التدقيق' },
    DATA_VIEW_SALARIES: { en: 'View Salaries', ar: 'عرض الرواتب' },
    OP_VOID_ORDER: { en: 'Void Order', ar: 'إلغاء طلب' },
    OP_APPLY_DISCOUNT: { en: 'Apply Discount', ar: 'تطبيق خصم' },
    OP_PROCESS_REFUND: { en: 'Process Refund', ar: 'معالجة استرداد' },
    OP_TRANSFER_STOCK: { en: 'Transfer Stock', ar: 'تحويل مخزون' },
    OP_ADJUST_STOCK: { en: 'Adjust Stock', ar: 'تسوية مخزون' },
    OP_PLACE_ORDER: { en: 'Place Order', ar: 'إنشاء طلب' },
    OP_CLOSE_DAY: { en: 'Close Day', ar: 'إغلاق اليوم' },
    OP_CREATE_PO: { en: 'Create Purchase Order', ar: 'إنشاء أمر شراء' },
    OP_RECEIVE_GRN: { en: 'Receive GRN', ar: 'استلام إذن' },
    OP_APPROVE_PO: { en: 'Approve PO', ar: 'اعتماد أمر شراء' },
    OP_CREATE_SUPPLIER_INVOICE: { en: 'Create Supplier Invoice', ar: 'إنشاء فاتورة مورد' },
    OP_APPROVE_SUPPLIER_INVOICE: { en: 'Approve Supplier Invoice', ar: 'اعتماد فاتورة' },
    OP_PROCESS_PAYROLL: { en: 'Process Payroll', ar: 'معالجة الرواتب' },
    OP_MANAGE_CASH_DRAWER: { en: 'Manage Cash Drawer', ar: 'إدارة الدرج' },
    CFG_MANAGE_USERS: { en: 'Manage Users', ar: 'إدارة المستخدمين' },
    CFG_MANAGE_ROLES: { en: 'Manage Roles', ar: 'إدارة الأدوار' },
    CFG_EDIT_MENU_PRICING: { en: 'Edit Menu Pricing', ar: 'تعديل أسعار المنيو' },
    CFG_EDIT_FLOOR_PLAN: { en: 'Edit Floor Plan', ar: 'تعديل مخطط القاعة' },
    CFG_MANAGE_BRANCHES: { en: 'Manage Branches', ar: 'إدارة الفروع' },
    CFG_OFFLINE_MODE: { en: 'Offline Mode', ar: 'الوضع غير المتصل' },
};

// Bilingual role names — centralized in utils/roleLabels.ts (single source of truth).
// arRole kept as legacy alias; new code must use getRoleLabel(role, lang).
const arRole: Record<string, string> = {
    SUPER_ADMIN: 'مدير النظام', OWNER: 'المالك', PARTNER: 'شريك', OWNER_VIEWER: 'مشاهد المالك',
    CEO: 'الرئيس التنفيذي', COO: 'مدير العمليات', GENERAL_MANAGER: 'مدير عام', BRANCH_MANAGER: 'مدير فرع',
    CASHIER_MANAGER: 'مدير كاشير', CASHIER: 'كاشير', WAITER: 'ويتر', CAPTAIN: 'كابتن صالة', DRIVER: 'سائق',
    KITCHEN_STAFF: 'مطبخ', CALL_CENTER: 'كول سنتر', CALL_CENTER_MANAGER: 'مدير كول سنتر', WAREHOUSE_STAFF: 'مخازن',
    WAREHOUSE_DIRECTOR: 'مدير مخازن', PRODUCTION_STAFF: 'إنتاج', PROCUREMENT_MANAGER: 'مشتريات', ACCOUNTANT: 'محاسب',
    COST_ACCOUNTANT: 'محاسب تكاليف', FINANCE_DIRECTOR: 'مدير مالي', HR_MANAGER: 'موارد بشرية', PAYROLL_OFFICER: 'مرتبات',
    TREASURY_OFFICER: 'خزنة', TECH_SUPPORT: 'دعم فني', QUALITY_OFFICER: 'جودة', CUSTOM: 'مخصص',
};

const genId = () => `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const allPermissions = Object.values(AppPermission);
const permLabel = (p: string, isAr: boolean) => {
    const lbl = PERM_LABELS[p];
    if (lbl) return isAr ? lbl.ar : lbl.en;
    return p.replace(/^(NAV|DATA|OP|CFG)_/, '').replace(/_/g, ' ').toLowerCase();
};

const UserManagement: React.FC = () => {
    const { users, branches, roles, settings, fetchUsers, fetchBranches, loadRoles, createUser, updateUserInDB, deleteUserFromDB, saveRolePermissions } = useAuthStore();
    const lang = (settings.language || 'ar') as 'ar' | 'en';
    const isAr = lang === 'ar';
    const { success, error: showError, info } = useToast();
    const { confirm } = useConfirm();

    const [tab, setTab] = useState<Tab>('users');
    const [query, setQuery] = useState('');
    const [permQuery, setPermQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('ALL');
    const [selectedId, setSelectedId] = useState('');
    const [checked, setChecked] = useState<string[]>([]);
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState<UserForm>({});
    const [sessions, setSessions] = useState<any[]>([]);
    const [audit, setAudit] = useState<any[]>([]);
    const [matrixRole, setMatrixRole] = useState<string>(UserRole.CASHIER);
    const [matrixPerms, setMatrixPerms] = useState<AppPermission[]>([]);
    const [busy, setBusy] = useState(false);
    const [credentialReset, setCredentialReset] = useState<'pin' | 'password' | null>(null);
    const [credentialValue, setCredentialValue] = useState('');
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleNameAr, setNewRoleNameAr] = useState('');
    const [showCreateRole, setShowCreateRole] = useState(false);

    useEffect(() => {
        fetchUsers();
        fetchBranches();
        (async () => {
            await loadRoles();
            // if roles empty, force server sync (seeds built-ins) then reload — prevents ROLE_NOT_FOUND
            const cur = useAuthStore.getState().roles;
            if (!cur || cur.length === 0) {
                try { await rolesApi.syncPermissions(); } catch { /* ignore */ }
                await loadRoles();
            }
        })();
    }, [fetchUsers, fetchBranches, loadRoles]);

    const roleRows = useMemo(() => {
        const dbRoles = roles.map((r: any) => ({
            id: r.id, name: r.name, nameAr: r.nameAr,
            permissions: (r.permissions || []) as AppPermission[],
            isSystem: r.isSystem, color: r.color || '#6366f1',
        }));
        // Dedupe by normalized key (handles `role_owner` ids, legacy ADMIN/MANAGER, and Arabic-named rows).
        const norm = (s: string) => String(s || '').replace(/^role_/i, '').trim().toUpperCase();
        const seen = new Set(dbRoles.flatMap((r) => [norm(r.id), norm(r.name)]));
        const enumRoles = Object.values(UserRole).filter((role) => !seen.has(norm(role))).map((role) => ({
            id: role, name: role, nameAr: arRole[role], permissions: INITIAL_ROLE_PERMISSIONS[role] || [], isSystem: true, color: '#64748b',
        }));
        return [...dbRoles, ...enumRoles];
    }, [roles]);

    const selectedUser = users.find((u) => u.id === selectedId) || users[0];
    const roleOf = (role: string) => roleRows.find((r) => r.id === role || r.name === role);
    // Always lang-aware: built-ins from central map, customs from {name, nameAr}.
    const roleLabel = (role: string) => {
        const row = roleOf(role);
        if (row) {
            // Built-in/system row without custom naming → central map by key.
            if (row.isSystem !== false && (!row.nameAr || row.nameAr === row.name)) {
                return getRoleLabel(row.name || role, lang, role);
            }
            return getRoleLabel({ name: row.name, nameAr: row.nameAr }, lang, role);
        }
        return getRoleLabel(role, lang, role);
    };
    const rolePermissions = (role: string) => roleOf(role)?.permissions || INITIAL_ROLE_PERMISSIONS[role as UserRole] || [];
    const branchName = (id?: string) => branches.find((b) => b.id === id)?.name || (isAr ? 'كل الفروع' : 'All branches');

    const filteredUsers = useMemo(() => {
        const q = query.trim().toLowerCase();
        return users.filter((u) => {
            // Search matches user fields + role in BOTH languages (so Arabic search finds English-mode roles and vice versa).
            const roleRow = roleRows.find((r) => r.id === u.role || r.name === u.role);
            const roleHay = roleRow
                ? getRoleLabel({ name: roleRow.name, nameAr: roleRow.nameAr }, 'ar', '') + ' ' + getRoleLabel({ name: roleRow.name, nameAr: roleRow.nameAr }, 'en', '')
                : getRoleLabel(String(u.role || ''), 'ar', '') + ' ' + getRoleLabel(String(u.role || ''), 'en', '');
            const hit = !q || [u.name, u.email, u.role, u.phone, roleHay].some((v) => String(v || '').toLowerCase().includes(q));
            const roleHit = roleFilter === 'ALL' || u.role === roleFilter;
            return hit && roleHit;
        });
    }, [users, query, roleFilter, roleRows]);

    const stats = useMemo(() => ({
        total: users.length,
        active: users.filter((u) => u.isActive !== false).length,
        locked: users.filter((u) => u.isActive === false).length,
        privileged: users.filter((u) => isCorporateRole(u.role)).length,
        branches: branches.length,
    }), [users, branches]);

    const refreshAdvanced = async () => {
        try {
            const [sessionRows, auditRows] = await Promise.all([usersApi.getActiveSessions(), usersApi.getAuditChanges()]);
            setSessions(sessionRows || []); setAudit(auditRows || []);
        } catch (err: any) { showError(err.message || (isAr ? 'تعذر تحميل بيانات الأمان' : 'Security data failed')); }
    };
    useEffect(() => { if (tab === 'security') refreshAdvanced(); }, [tab]);
    useEffect(() => { setMatrixPerms(rolePermissions(matrixRole)); }, [matrixRole, roleRows]);

    const openCreate = () => {
        const role = UserRole.CASHIER;
        setForm({ id: genId(), name: '', email: '', role, isActive: true, assignedBranchId: branches[0]?.id, allowedBranches: branches[0]?.id ? [branches[0].id] : [], permissions: rolePermissions(role) });
        setFormOpen(true);
    };
    const openEdit = (user: User) => {
        // password is one-way hashed server-side: never readable, so always start blank
        // (non-blank on save = set new). PIN is stored plain so it can be shown to admins.
        setForm({ ...user, password: '', pin: (user as any).pin || '', allowedBranches: user.allowedBranches?.length ? user.allowedBranches : (user.assignedBranchId ? [user.assignedBranchId] : []) });
        setFormOpen(true);
    };

    const saveForm = async () => {
        const email = form.email?.trim() || '';
        if (!form.name?.trim()) return showError(isAr ? 'الاسم مطلوب' : 'Name required');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError(isAr ? 'بريد إلكتروني صحيح مطلوب' : 'Valid email required');
        if (form.pin && !/^\d{6}$/.test(form.pin)) return showError(isAr ? 'PIN لازم 6 أرقام' : 'PIN must be 6 digits');
        setBusy(true);
        try {
            const role = String(form.role || UserRole.CASHIER);
            const allowedBranches = isCorporateRole(role) ? branches.map((b) => b.id) : (form.allowedBranches?.length ? form.allowedBranches : [form.assignedBranchId || branches[0]?.id]).filter(Boolean) as string[];
            const isEdit = users.some((u) => u.id === form.id);
            const payload: User = {
                id: form.id || genId(), name: form.name.trim(), email, role, isActive: form.isActive !== false,
                assignedBranchId: form.assignedBranchId || allowedBranches[0], allowedBranches,
                permissions: form.permissions?.length ? form.permissions : rolePermissions(role),
                password: form.password, pin: form.pin,
            };
            if (isEdit) await updateUserInDB(payload); else await createUser(payload);
            await fetchUsers();
            setFormOpen(false); setSelectedId(payload.id);
            success(isAr ? 'تم حفظ المستخدم' : 'User saved');
        } catch (err: any) { showError(err?.message || err?.code || (isAr ? 'فشل الحفظ' : 'Save failed')); } finally { setBusy(false); }
    };

    const deleteUser = async (user: User) => {
        const ok = await confirm({ title: isAr ? 'حذف مستخدم' : 'Delete user', message: isAr ? `حذف ${user.name}؟ سيتم تعطيل الحساب.` : `Deactivate ${user.name}?`, confirmText: isAr ? 'تعطيل' : 'Deactivate', variant: 'danger' });
        if (!ok) return;
        try { await deleteUserFromDB(user.id); await fetchUsers(); success(isAr ? 'تم تعطيل المستخدم' : 'User deactivated'); } catch (err: any) { showError(err.message); }
    };

    const applyBulk = async (action: 'activate' | 'deactivate' | 'role' | 'branch') => {
        if (!checked.length) return info(isAr ? 'اختار مستخدمين أولا' : 'Select users first');
        setBusy(true);
        try {
            if (action === 'activate') await usersApi.bulkUpdateStatus(checked, true);
            if (action === 'deactivate') await usersApi.bulkUpdateStatus(checked, false);
            if (action === 'role') await usersApi.bulkAssignRole(checked, roleFilter === 'ALL' ? UserRole.CASHIER : roleFilter);
            if (action === 'branch' && branches[0]) await usersApi.bulkAssignBranch(checked, branches[0].id);
            await fetchUsers(); setChecked([]); success(isAr ? 'تم تطبيق الإجراء' : 'Bulk action applied');
        } catch (err: any) { showError(err.message); } finally { setBusy(false); }
    };

    const toggleUserPermission = async (perm: AppPermission) => {
        if (!selectedUser) return;
        const next = selectedUser.permissions.includes(perm) ? selectedUser.permissions.filter((p) => p !== perm) : [...selectedUser.permissions, perm];
        try { await usersApi.updatePermissions(selectedUser.id, next); await fetchUsers(); success(isAr ? 'تم تحديث الصلاحيات' : 'Permissions updated'); } catch (err: any) { showError(err.message); }
    };

    const saveMatrix = async () => {
        setBusy(true);
        try {
            // ensure roles are fresh before save to avoid stale id mismatch
            await loadRoles();
            await saveRolePermissions(matrixRole, matrixPerms);
            await loadRoles();
            success(isAr ? 'تم حفظ صلاحيات الدور' : 'Role permissions saved');
        } catch (err: any) {
            const msg = err?.message || err?.code || err?.error || '';
            // never surface generic ROLE_NOT_FOUND if details missing — show actual server error
            showError(msg ? String(msg) : (isAr ? 'فشل حفظ الصلاحيات' : 'Failed to save permissions'));
        } finally { setBusy(false); }
    };

    const handleCreateRole = async () => {
        const nameEn = newRoleName.trim();
        const nameAr = newRoleNameAr.trim() || nameEn;
        if (!nameEn) return showError(isAr ? 'اسم الدور مطلوب' : 'Role name required');
        // Bilingual: EN goes to `name`, AR goes to `nameAr` so each system language shows its own.
        const keyBase = nameEn.replace(/\s+/g, '_').toUpperCase().slice(0, 40) || `CUSTOM_${Date.now().toString(36)}`;
        const name = /[\u0600-\u06FF]/.test(nameEn) ? keyBase : nameEn.toUpperCase().replace(/\s+/g, '_');
        setBusy(true);
        try {
            const id = `role_${name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
            await rolesApi.create({ id, name, nameAr, permissions: [], isSystem: false });
            await loadRoles(); setShowCreateRole(false); setNewRoleName(''); setNewRoleNameAr(''); setMatrixRole(name);
            success(isAr ? 'تم إنشاء الدور' : 'Role created');
        } catch (err: any) { showError(err.message); } finally { setBusy(false); }
    };

    const exportCsv = async () => { const blob = await usersApi.exportCsv(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `users-${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url); };

    const securityAction = async (kind: 'revoke' | 'mfa' | 'pin' | 'password' | 'toggle') => {
        if (!selectedUser) return;
        if (kind === 'pin' || kind === 'password') { setCredentialReset(kind); setCredentialValue(''); return; }
        try {
            if (kind === 'revoke') await usersApi.revokeAllSessions(selectedUser.id);
            if (kind === 'mfa') await usersApi.resetMfa(selectedUser.id);
            if (kind === 'toggle') await usersApi.toggleActive(selectedUser.id);
            await Promise.all([fetchUsers(), refreshAdvanced()]);
            success(isAr ? 'تم تنفيذ الإجراء' : 'Action done');
        } catch (err: any) { showError(err.message); }
    };
    const submitCredentialReset = async () => {
        if (!selectedUser || !credentialReset) return;
        const value = credentialValue.trim();
        if (credentialReset === 'pin' && value && !/^\d{6}$/.test(value)) return showError(isAr ? 'PIN غير صحيح' : 'Invalid PIN');
        if (credentialReset === 'password' && value.length < 6) return showError(isAr ? 'كلمة المرور قصيرة' : 'Password too short');
        setBusy(true);
        try {
            if (credentialReset === 'pin') await usersApi.resetPin(selectedUser.id, value || undefined);
            else await usersApi.resetPassword(selectedUser.id, value);
            setCredentialReset(null); setCredentialValue('');
            await Promise.all([fetchUsers(), refreshAdvanced()]);
            success(isAr ? 'تم تنفيذ الإجراء' : 'Action done');
        } catch (err: any) { showError(err.message); } finally { setBusy(false); }
    };

    const filteredPerms = (key: string) => {
        const perms = allPermissions.filter((p) => p.startsWith(`${key}_`));
        if (!permQuery.trim()) return perms;
        const q = permQuery.toLowerCase();
        return perms.filter((p) => permLabel(p, isAr).toLowerCase().includes(q) || p.toLowerCase().includes(q));
    };

    return (
        <div className="min-h-screen bg-app p-3 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>
            <div className="mx-auto max-w-[1500px] space-y-4">
                <header className="flex flex-col gap-4 border-b border-border/50 pb-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-primary"><ShieldCheck size={15} /> {isAr ? 'مركز التحكم الموحد' : 'Unified Access Center'}</div>
                        <h1 className="text-2xl font-black text-main md:text-4xl">{isAr ? 'المستخدمين والأدوار والصلاحيات' : 'Users, Roles & Permissions'}</h1>
                        <p className="mt-2 max-w-2xl text-sm font-semibold text-muted">{isAr ? 'إدارة موحدة: المستخدم + دوره + صلاحياته + فروعه + أمانه في مكان واحد بدون تعقيد.' : 'Unified management: user, role, permissions, branches and security in one simple place.'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => { fetchUsers(); loadRoles(); }} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-black text-main hover:border-primary/40"><RefreshCw size={14} className="inline align-[-2px]" /> {isAr ? 'تحديث' : 'Refresh'}</button>
                        <button onClick={exportCsv} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-black text-main hover:border-primary/40"><Download size={14} className="inline align-[-2px]" /> CSV</button>
                        <button onClick={openCreate} className="rounded-lg bg-primary px-4 py-2 text-xs font-black text-white shadow-lg shadow-primary/20 hover:brightness-110"><Plus size={14} className="inline align-[-2px]" /> {isAr ? 'مستخدم جديد' : 'New user'}</button>
                    </div>
                </header>

                <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {[[stats.total, isAr ? 'إجمالي المستخدمين' : 'Total users', Users, 'text-blue-500'], [stats.active, isAr ? 'نشط' : 'Active', Activity, 'text-emerald-500'], [stats.locked, isAr ? 'معطل' : 'Disabled', Ban, 'text-rose-500'], [stats.privileged, isAr ? 'أدوار عليا' : 'Privileged', Crown, 'text-amber-500'], [stats.branches, isAr ? 'فروع' : 'Branches', Building2, 'text-violet-500']].map(([value, label, Icon, color]: any) => (
                        <div key={label} className="rounded-lg border border-border/60 bg-card p-4"><Icon size={18} className={color} /><div className="mt-3 text-2xl font-black text-main">{value}</div><div className="text-[11px] font-bold text-muted">{label}</div></div>
                    ))}
                </section>

                <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border/60 bg-card p-1.5">
                    {tabs.map((item) => { const Icon = item.icon; const active = tab === item.id; return (
                        <button key={item.id} onClick={() => setTab(item.id)} className={`flex min-w-max items-center gap-2 rounded-lg px-5 py-2.5 text-xs font-black transition ${active ? 'bg-primary text-white shadow' : 'text-muted hover:bg-elevated hover:text-main'}`}><Icon size={15} /> {isAr ? item.ar : item.en}</button>
                    ); })}
                </nav>

                {tab === 'users' && (
                    <main className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_380px]">
                        <section className="rounded-xl border border-border/60 bg-card overflow-hidden">
                            <div className="flex flex-col gap-3 border-b border-border/60 p-3 lg:flex-row lg:items-center">
                                <div className="relative flex-1"><Search className={`absolute top-1/2 -translate-y-1/2 text-muted ${isAr ? 'right-3' : 'left-3'}`} size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} className={`h-10 w-full rounded-lg border border-border bg-app px-4 text-sm font-bold text-main outline-none focus:border-primary/50 ${isAr ? 'pr-10' : 'pl-10'}`} placeholder={isAr ? 'بحث بالاسم، البريد، الدور' : 'Search name, email, role'} /></div>
                                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-10 rounded-lg border border-border bg-app px-3 text-xs font-black text-main"><option value="ALL">{isAr ? 'كل الأدوار' : 'All roles'}</option>{roleRows.map((role) => <option key={role.id} value={role.name}>{roleLabel(role.name)}</option>)}</select>
                                <div className="flex gap-1">
                                    <button onClick={() => applyBulk('activate')} title={isAr ? 'تفعيل' : 'Activate'} className="rounded-md border border-border px-2.5 py-2 text-emerald-500 hover:bg-emerald-500/10"><Check size={14} /></button>
                                    <button onClick={() => applyBulk('deactivate')} title={isAr ? 'تعطيل' : 'Deactivate'} className="rounded-md border border-border px-2.5 py-2 text-rose-500 hover:bg-rose-500/10"><Ban size={14} /></button>
                                    <button onClick={() => applyBulk('role')} title={isAr ? 'تغيير الدور' : 'Change role'} className="rounded-md border border-border px-2.5 py-2 text-main hover:bg-elevated"><UserCog size={14} /></button>
                                    <button onClick={() => applyBulk('branch')} title={isAr ? 'تغيير الفرع' : 'Change branch'} className="rounded-md border border-border px-2.5 py-2 text-main hover:bg-elevated"><Building2 size={14} /></button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[880px] text-sm">
                                    <thead className="bg-elevated/50 text-[11px] font-black uppercase text-muted"><tr><th className="w-10 p-3"></th><th className="p-3 text-start">{isAr ? 'المستخدم' : 'User'}</th><th className="p-3 text-start">{isAr ? 'الدور' : 'Role'}</th><th className="p-3 text-start">{isAr ? 'الفرع' : 'Branch'}</th><th className="p-3 text-start">{isAr ? 'الصلاحيات' : 'Perms'}</th><th className="p-3 text-start">{isAr ? 'الحالة' : 'Status'}</th><th className="p-3 text-end">{isAr ? 'إجراءات' : 'Actions'}</th></tr></thead>
                                    <tbody>
                                        {filteredUsers.map((user) => {
                                            const active = selectedUser?.id === user.id; const selected = checked.includes(user.id);
                                            return (
                                                <tr key={user.id} onClick={() => setSelectedId(user.id)} className={`cursor-pointer border-t border-border/40 ${active ? 'bg-primary/10' : 'hover:bg-elevated/40'}`}>
                                                    <td className="p-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected} onChange={() => setChecked((prev) => selected ? prev.filter((id) => id !== user.id) : [...prev, user.id])} /></td>
                                                    <td className="p-3"><div className="font-black text-main">{user.name}</div><div className="text-xs font-semibold text-muted truncate max-w-[180px]">{user.email || '-'}</div></td>
                                                    <td className="p-3"><span className={`rounded-md px-2 py-1 text-xs font-black ${isCorporateRole(user.role) ? 'bg-amber-500/10 text-amber-600' : 'bg-blue-500/10 text-blue-500'}`}>{roleLabel(String(user.role))}</span></td>
                                                    <td className="p-3 text-xs font-bold text-muted">{branchName(user.assignedBranchId)}</td>
                                                    <td className="p-3"><span className="rounded-md bg-elevated px-2 py-1 text-xs font-black text-main">{user.permissions?.length || 0}</span></td>
                                                    <td className="p-3"><span className={`rounded-md px-2 py-1 text-[11px] font-black ${user.isActive !== false ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{user.isActive !== false ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Disabled')}</span></td>
                                                    <td className="p-3 text-end" onClick={(e) => e.stopPropagation()}>
                                                        <button onClick={() => openEdit(user)} className="rounded-md border border-border px-2.5 py-2 text-main hover:border-primary/40"><Eye size={14} /></button>
                                                        <button onClick={() => deleteUser(user)} className="ms-1 rounded-md border border-border px-2.5 py-2 text-rose-500 hover:border-rose-500/40"><Trash2 size={14} /></button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {!filteredUsers.length && <tr><td colSpan={7} className="p-10 text-center text-sm font-black text-muted">{isAr ? 'لا يوجد مستخدمون' : 'No users found'}</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <aside className="rounded-xl border border-border/60 bg-card p-4 h-fit sticky top-4">
                            {selectedUser ? (
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div><div className="text-lg font-black text-main">{selectedUser.name}</div><div className="text-xs font-bold text-muted truncate">{selectedUser.email || '-'}</div><div className="mt-2 flex flex-wrap gap-1"><span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-black text-primary">{roleLabel(String(selectedUser.role))}</span><span className="rounded-md bg-elevated px-2 py-1 text-xs font-bold text-muted">{branchName(selectedUser.assignedBranchId)}</span></div></div>
                                        <button onClick={() => openEdit(selectedUser)} className="rounded-lg bg-primary px-3 py-2 text-xs font-black text-white">{isAr ? 'تعديل' : 'Edit'}</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <InfoPill label={isAr ? 'الصلاحيات' : 'Perms'} value={String(selectedUser.permissions?.length || 0)} />
                                        <InfoPill label={isAr ? 'الفروع' : 'Branches'} value={String(selectedUser.allowedBranches?.length || 0)} />
                                        <InfoPill label="MFA" value={selectedUser.mfaEnabled ? 'ON' : 'OFF'} />
                                        <InfoPill label={isAr ? 'الحالة' : 'Status'} value={selectedUser.isActive !== false ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Off')} />
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setTab('access')} className="flex-1 rounded-lg border border-border px-3 py-2.5 text-xs font-black text-main hover:bg-elevated"><ShieldCheck size={14} className="inline me-1" /> {isAr ? 'إدارة الصلاحيات' : 'Permissions'}</button>
                                        <button onClick={() => setTab('security')} className="flex-1 rounded-lg border border-border px-3 py-2.5 text-xs font-black text-main hover:bg-elevated"><LockKeyhole size={14} className="inline me-1" /> {isAr ? 'الأمان' : 'Security'}</button>
                                    </div>
                                    <div>
                                        <div className="mb-2 flex items-center gap-2 text-xs font-black text-main"><Layers size={14} /> {isAr ? 'صلاحيات سريعة' : 'Quick permissions'}</div>
                                        <div className="relative mb-2"><Search size={14} className={`absolute top-1/2 -translate-y-1/2 text-muted ${isAr ? 'right-2.5' : 'left-2.5'}`} /><input value={permQuery} onChange={(e) => setPermQuery(e.target.value)} placeholder={isAr ? 'بحث صلاحية' : 'Search permission'} className={`h-8 w-full rounded-lg border border-border bg-app px-3 text-xs font-bold outline-none ${isAr ? 'pr-8' : 'pl-8'}`} /></div>
                                        <div className="max-h-[340px] space-y-3 overflow-auto pe-1">
                                            {categories.map((cat) => {
                                                const CatIcon = cat.icon;
                                                const perms = filteredPerms(cat.key);
                                                if (!perms.length) return null;
                                                return (
                                                    <div key={cat.key}><div className={`mb-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-black ${cat.bg} ${cat.color}`}><CatIcon size={12} /> {isAr ? cat.ar : cat.en}</div>
                                                        <div className="grid gap-1">{perms.map((perm) => { const on = selectedUser.permissions?.includes(perm as AppPermission); return (
                                                            <button key={perm} onClick={() => toggleUserPermission(perm as AppPermission)} className={`flex items-center justify-between rounded-md border px-2.5 py-2 text-start text-[11px] font-bold ${on ? 'border-primary/30 bg-primary/10 text-main' : 'border-border/50 text-muted hover:border-primary/30'}`}><span className="truncate pe-2">{permLabel(perm, isAr)}</span>{on && <Check size={13} className="text-primary shrink-0" />}</button>
                                                        ); })}</div></div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : <Empty title={isAr ? 'اختار مستخدم' : 'Select a user'} />}
                        </aside>
                    </main>
                )}

                {tab === 'access' && (
                    <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                        <div className="space-y-3">
                            <div className="rounded-xl border border-border/60 bg-card p-3">
                                <div className="flex items-center justify-between gap-2 mb-3"><h3 className="font-black text-main text-sm">{isAr ? 'الأدوار' : 'Roles'}</h3><button onClick={() => setShowCreateRole(true)} className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-black text-white"><Plus size={12} className="inline me-1" /> {isAr ? 'دور' : 'Role'}</button></div>
                                {showCreateRole && (
                                    <div className="mb-3 space-y-2 rounded-lg border border-border/60 bg-app p-2">
                                        <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder={isAr ? 'اسم الدور بالإنجليزية' : 'Role name (EN)'} className="w-full h-9 rounded-lg border border-border bg-card px-3 text-xs font-bold outline-none" dir="ltr" />
                                        <input value={newRoleNameAr} onChange={(e) => setNewRoleNameAr(e.target.value)} placeholder={isAr ? 'اسم الدور بالعربية' : 'Role name (AR)'} className="w-full h-9 rounded-lg border border-border bg-card px-3 text-xs font-bold outline-none" dir="rtl" />
                                        <div className="flex gap-2"><button disabled={busy} onClick={handleCreateRole} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-black text-white disabled:opacity-50"><Save size={14} className="inline me-1" /> {isAr ? 'إنشاء' : 'Create'}</button><button onClick={() => { setShowCreateRole(false); setNewRoleName(''); setNewRoleNameAr(''); }} className="rounded-lg border border-border px-3 py-2"><X size={14} /></button></div>
                                    </div>
                                )}
                                <div className="space-y-4 max-h-[70vh] overflow-auto pe-1">
                                    {ROLE_DEPARTMENTS.map((dept) => {
                                        const deptRoles = roleRows.filter((r) => dept.roles.includes(r.name));
                                        const customInDept: any[] = []; // custom roles not in dept will be shown separately below
                                        if (!deptRoles.length) return null;
                                        return (
                                            <div key={dept.label}><div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest" style={{ color: dept.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: dept.color }} /> {isAr ? dept.labelAr : dept.label}</div>
                                                <div className="space-y-1">{deptRoles.map((role) => { const active = matrixRole === role.name; return (
                                                    <button key={role.id} onClick={() => setMatrixRole(role.name)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-start transition ${active ? 'border-primary bg-primary text-white shadow' : 'border-border/60 bg-app hover:border-primary/30'}`}>
                                                        <div className="min-w-0"><div className={`truncate text-xs font-black ${active ? 'text-white' : 'text-main'}`}>{getRoleLabel({ name: role.name, nameAr: role.nameAr }, lang, role.name)}</div><div className={`text-[11px] ${active ? 'text-white/80' : 'text-muted'}`}>{role.permissions.length} {isAr ? 'صلاحية' : 'perms'}</div></div>
                                                        {isCorporateRole(role.name) ? <Crown size={14} className={active ? 'text-white' : 'text-amber-500'} /> : <MapPin size={14} className={active ? 'text-white' : 'text-muted'} />}
                                                    </button>
                                                ); })}</div></div>
                                        );
                                    })}
                                    {roleRows.filter((r) => !ROLE_DEPARTMENTS.flatMap(d => d.roles).includes(r.name)).length > 0 && (
                                        <div><div className="mb-1 text-[10px] font-black uppercase tracking-widest text-muted">{isAr ? 'مخصص' : 'Custom'}</div>
                                            <div className="space-y-1">{roleRows.filter((r) => !ROLE_DEPARTMENTS.flatMap(d => d.roles).includes(r.name)).map((role) => { const active = matrixRole === role.name; return (
                                                <button key={role.id} onClick={() => setMatrixRole(role.name)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-start ${active ? 'border-primary bg-primary text-white' : 'border-border/60 bg-app hover:border-primary/30'}`}><span className="truncate text-xs font-black">{getRoleLabel({ name: role.name, nameAr: role.nameAr }, lang, role.name)}</span><span className={`text-[11px] ${active ? 'text-white/80' : 'text-muted'}`}>{role.permissions.length}</span></button>
                                            ); })}</div></div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
                            <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
                                <div><div className="flex items-center gap-2 text-sm font-black text-main"><ShieldCheck size={16} className="text-primary" /> {roleLabel(matrixRole)} <span className="rounded-md bg-elevated px-2 py-1 text-xs font-bold text-muted">{matrixPerms.length}/{allPermissions.length}</span></div><div className="text-xs font-bold text-muted mt-1">{isAr ? 'حدد الصلاحيات الافتراضية لهذا الدور، ثم احفظ. سيُطبق على كل مستخدمي الدور.' : 'Select default permissions for this role, then save. Applies to all users with this role.'}</div></div>
                                <div className="flex gap-2 shrink-0">
                                    <div className="relative"><Search size={14} className={`absolute top-1/2 -translate-y-1/2 text-muted ${isAr ? 'right-2.5' : 'left-2.5'}`} /><input value={permQuery} onChange={(e) => setPermQuery(e.target.value)} placeholder={isAr ? 'بحث صلاحية' : 'Search perm'} className={`h-10 w-40 rounded-lg border border-border bg-app px-3 text-xs font-bold outline-none focus:border-primary/50 ${isAr ? 'pr-8' : 'pl-8'}`} /></div>
                                    <button disabled={busy} onClick={saveMatrix} className="rounded-lg bg-primary px-5 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save size={14} className="inline me-1" /> {isAr ? 'حفظ الدور' : 'Save role'}</button>
                                </div>
                            </div>

                            <div className="p-4">
                                <div className="mb-3 flex flex-wrap gap-2">
                                    {categories.map((cat) => { const count = allPermissions.filter((p) => p.startsWith(`${cat.key}_`)).length; const enabled = matrixPerms.filter((p) => p.startsWith(`${cat.key}_`)).length; return (
                                        <span key={cat.key} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black ${enabled ? cat.bg + ' border-transparent ' + cat.color : 'border-border text-muted'}`}><cat.icon size={12} /> {isAr ? cat.ar : cat.en} {enabled}/{count}</span>
                                    ); })}
                                    <button onClick={() => setMatrixPerms([])} className="rounded-full border border-border px-3 py-1 text-xs font-black text-muted hover:bg-elevated">{isAr ? 'مسح الكل' : 'Clear'}</button>
                                    <button onClick={() => setMatrixPerms(allPermissions)} className="rounded-full border border-border px-3 py-1 text-xs font-black text-muted hover:bg-elevated">{isAr ? 'تحديد الكل' : 'Select all'}</button>
                                </div>
                                <div className="grid gap-4 lg:grid-cols-2">
                                    {categories.map((cat) => {
                                        const perms = filteredPerms(cat.key);
                                        if (!perms.length) return null;
                                        const allOn = perms.every((p) => matrixPerms.includes(p as AppPermission));
                                        return (
                                            <div key={cat.key} className="rounded-xl border border-border/50 bg-app/50 overflow-hidden">
                                                <div className={`flex items-center justify-between px-3 py-2.5 ${cat.bg}`}><div className={`flex items-center gap-1.5 text-xs font-black ${cat.color}`}><cat.icon size={14} /> {isAr ? cat.ar : cat.en}</div><button onClick={() => setMatrixPerms((prev) => allOn ? prev.filter((p) => !p.startsWith(`${cat.key}_`)) : [...new Set([...prev, ...perms as AppPermission[]])])} className={`rounded-md border px-2 py-1 text-[11px] font-black ${allOn ? 'bg-card border-border text-main' : 'bg-primary text-white border-transparent'}`}>{allOn ? (isAr ? 'إلغاء الكل' : 'Clear') : (isAr ? 'تحديد الكل' : 'All')}</button></div>
                                                <div className="grid gap-1 p-2 max-h-[360px] overflow-auto">
                                                    {perms.map((perm) => { const on = matrixPerms.includes(perm as AppPermission); return (
                                                        <button key={perm} onClick={() => setMatrixPerms((prev) => on ? prev.filter((p) => p !== perm) : [...prev, perm as AppPermission])} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-start text-xs font-bold transition ${on ? 'border-primary/30 bg-primary/10 text-main' : 'border-border/40 bg-card text-muted hover:border-primary/20'}`}><span className="truncate pe-2">{permLabel(perm, isAr)}</span><span className={`flex h-5 w-5 items-center justify-center rounded-md border text-[10px] ${on ? 'bg-primary border-primary text-white' : 'border-border bg-app'}`}>{on && <Check size={12} />}</span></button>
                                                    ); })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {tab === 'security' && (
                    <div className="space-y-4">
                        <section className="grid gap-4 lg:grid-cols-[380px_1fr]">
                            <aside className="rounded-xl border border-border/60 bg-card p-4 h-fit">
                                <div className="mb-3 text-sm font-black text-main">{isAr ? 'المستخدم المحدد' : 'Selected user'}</div>
                                {selectedUser ? (
                                    <div className="space-y-3">
                                        <div className="rounded-xl bg-elevated/50 p-4"><div className="text-lg font-black text-main">{selectedUser.name}</div><div className="text-xs font-bold text-muted truncate">{selectedUser.email}</div><div className="mt-2 flex gap-2"><span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-black text-primary">{roleLabel(String(selectedUser.role))}</span><span className={`rounded-md px-2 py-1 text-xs font-black ${selectedUser.isActive !== false ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{selectedUser.isActive !== false ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Disabled')}</span></div></div>
                                        <select value={selectedUser.id} onChange={(e) => setSelectedId(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-app px-3 text-xs font-black text-main"><option value="">{isAr ? 'اختار مستخدم' : 'Select user'}</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} — {roleLabel(String(u.role))}</option>)}</select>
                                        <div className="grid gap-2">
                                            <Action title={isAr ? 'إنهاء كل الجلسات' : 'Revoke all sessions'} icon={Monitor} onClick={() => securityAction('revoke')} />
                                            <Action title={isAr ? 'إعادة ضبط MFA' : 'Reset MFA'} icon={ShieldCheck} onClick={() => securityAction('mfa')} />
                                            <Action title={isAr ? 'تغيير PIN' : 'Reset PIN'} icon={KeyRound} onClick={() => securityAction('pin')} />
                                            <Action title={isAr ? 'تغيير كلمة المرور' : 'Reset password'} icon={LockKeyhole} onClick={() => securityAction('password')} />
                                            <Action title={selectedUser?.isActive === false ? (isAr ? 'تفعيل الحساب' : 'Activate account') : (isAr ? 'تعطيل الحساب' : 'Disable account')} icon={Ban} onClick={() => securityAction('toggle')} danger={selectedUser?.isActive !== false} />
                                        </div>
                                    </div>
                                ) : <Empty title={isAr ? 'اختار مستخدم' : 'Select user'} />}
                            </aside>
                            <div className="space-y-4">
                                <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
                                    <div className="flex items-center justify-between border-b border-border/50 p-4"><h3 className="font-black text-main flex items-center gap-2"><Monitor size={16} /> {isAr ? 'الجلسات النشطة' : 'Active sessions'} <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-black text-primary">{sessions.length}</span></h3><button onClick={refreshAdvanced} className="rounded-md border border-border px-3 py-1.5 text-xs font-black text-main"><RefreshCw size={12} className="inline me-1" /> {isAr ? 'تحديث' : 'Refresh'}</button></div>
                                    <div className="max-h-[300px] overflow-auto">{sessions.length ? sessions.map((row, i) => (
                                        <div key={row.id || i} className="flex flex-col gap-1 border-b border-border/40 p-3 last:border-0 md:flex-row md:items-center md:justify-between"><div><div className="font-black text-main text-sm">{row.userName || row.userId}</div><div className="text-xs font-bold text-muted truncate max-w-[320px]">{row.deviceName || row.userAgent || '-'}</div></div><div className="text-xs font-bold text-muted text-start md:text-end"><div>{row.ipAddress || '-'}</div><div>{row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString(isAr ? 'ar-EG' : 'en') : '-'}</div></div></div>
                                    )) : <div className="p-8 text-center text-sm font-black text-muted">{isAr ? 'لا توجد جلسات نشطة' : 'No active sessions'}</div>}</div>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
                                    <div className="border-b border-border/50 p-4"><h3 className="font-black text-main flex items-center gap-2"><FileText size={16} /> {isAr ? 'سجل تغييرات المستخدمين' : 'User audit log'} <span className="rounded-full bg-elevated px-2 py-0.5 text-xs font-black text-muted">{audit.length}</span></h3></div>
                                    <div className="max-h-[340px] overflow-auto">{audit.length ? audit.map((row, i) => (
                                        <div key={row.id || i} className="grid gap-1 border-b border-border/40 p-3 last:border-0 md:grid-cols-[160px_140px_1fr_170px]"><div className="font-black text-main text-xs">{row.event_type}</div><div className="text-xs font-bold text-muted truncate">{row.actor_name || row.actor_id || 'system'}</div><div className="text-xs font-bold text-muted truncate">{row.reason || '-'}</div><div className="text-xs font-bold text-muted md:text-end">{row.created_at ? new Date(row.created_at).toLocaleString(isAr ? 'ar-EG' : 'en') : '-'}</div></div>
                                    )) : <div className="p-8 text-center text-sm font-black text-muted">{isAr ? 'لا يوجد سجل' : 'No audit events'}</div>}</div>
                                </div>
                            </div>
                        </section>
                    </div>
                )}
            </div>

            {formOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" onClick={() => setFormOpen(false)}>
                    <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card p-4"><div className="font-black text-main">{form.id && users.some((u) => u.id === form.id) ? (isAr ? 'تعديل مستخدم' : 'Edit user') : (isAr ? 'مستخدم جديد' : 'New user')}</div><button onClick={() => setFormOpen(false)} className="rounded-md border border-border p-2"><X size={16} /></button></div>
                        <div className="grid gap-4 p-4 md:grid-cols-2">
                            <Field label={isAr ? 'الاسم *' : 'Name *'} value={form.name || ''} onChange={(v) => setForm({ ...form, name: v })} />
                            <Field label={isAr ? 'البريد *' : 'Email *'} value={form.email || ''} onChange={(v) => setForm({ ...form, email: v })} placeholder="name@company.com" />
                            <Field label={isAr ? 'كلمة المرور' : 'Password'} type="password" value={form.password || ''} onChange={(v) => setForm({ ...form, password: v })} placeholder={isAr ? 'جديدة…' : 'New…'} hint={form.hasPassword ? (isAr ? 'معيّنة حالياً — اتركها فارغة للاحتفاظ بها' : 'Currently set — leave blank to keep it') : (isAr ? 'غير معيّنة لهذا المستخدم' : 'No password set for this user')} />
                            <Field label="PIN (6 digits)" secret value={form.pin || ''} onChange={(v) => setForm({ ...form, pin: v.replace(/\D/g, '').slice(0, 6) })} placeholder="123456" hint={(form.hasPin || form.pin) ? (isAr ? 'معيّن حالياً — ظاهر لك كمسؤول' : 'Currently set — visible to you as admin') : (isAr ? 'غير معيّن' : 'No PIN set')} />
                            <label className="space-y-1"><span className="text-[11px] font-black text-muted">{isAr ? 'الدور *' : 'Role *'}</span><select value={String(form.role || UserRole.CASHIER)} onChange={(e) => setForm({ ...form, role: e.target.value, permissions: rolePermissions(e.target.value) })} className="h-11 w-full rounded-lg border border-border bg-app px-3 text-sm font-bold text-main outline-none focus:border-primary/50">{roleRows.map((role) => <option key={role.id} value={role.name}>{roleLabel(role.name)}</option>)}</select></label>
                            <label className="space-y-1"><span className="text-[11px] font-black text-muted">{isAr ? 'الفرع الافتراضي' : 'Default branch'}</span><select value={form.assignedBranchId || ''} onChange={(e) => setForm({ ...form, assignedBranchId: e.target.value, allowedBranches: form.assignedBranchId ? form.allowedBranches : [e.target.value] })} className="h-11 w-full rounded-lg border border-border bg-app px-3 text-sm font-bold text-main outline-none focus:border-primary/50"><option value="">{isAr ? 'بدون فرع' : 'No branch'}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
                            <label className="flex items-center gap-3 rounded-lg border border-border bg-app p-3 text-sm font-black text-main"><input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />{isAr ? 'الحساب نشط' : 'Active account'}</label>
                            <div className="md:col-span-2">
                                <div className="mb-2 text-[11px] font-black text-muted">{isAr ? 'الفروع المسموحة' : 'Allowed branches'}</div>
                                {branches.length ? (
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{branches.map((branch) => { const on = form.allowedBranches?.includes(branch.id); return (
                                        <button key={branch.id} type="button" onClick={() => { const current = form.allowedBranches || []; const next = on ? current.filter((id) => id !== branch.id) : [...current, branch.id]; setForm({ ...form, allowedBranches: next, assignedBranchId: form.assignedBranchId || next[0] }); }} className={`rounded-lg border px-3 py-2.5 text-start text-xs font-black transition ${on ? 'border-primary bg-primary/10 text-main' : 'border-border bg-app text-muted hover:border-primary/30'}`}>{on && <Check size={13} className="inline text-primary me-1" />} {branch.name}</button>
                                    ); })}</div>
                                ) : <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs font-bold text-muted">{isAr ? 'لا توجد فروع' : 'No branches'}</div>}
                            </div>
                        </div>
                        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card p-4">
                            <button onClick={() => setFormOpen(false)} className="rounded-lg border border-border px-4 py-2.5 text-xs font-black text-main">{isAr ? 'إلغاء' : 'Cancel'}</button>
                            <button disabled={busy} onClick={saveForm} className="rounded-lg bg-primary px-6 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save size={14} className="inline me-1" /> {isAr ? 'حفظ' : 'Save'}</button>
                        </div>
                    </div>
                </div>
            )}
            {credentialReset && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && setCredentialReset(null)}>
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4 border-b border-border p-5"><div><h3 className="text-lg font-black text-main">{credentialReset === 'pin' ? (isAr ? 'تعيين PIN جديد' : 'Set new PIN') : (isAr ? 'تعيين كلمة مرور جديدة' : 'Set new password')}</h3><p className="mt-1 text-xs font-bold text-muted">{credentialReset === 'pin' ? (isAr ? '6 أرقام، اتركه فارغا لمسح PIN.' : '6 digits, leave blank to clear.') : (isAr ? 'الحد الأدنى 6 أحرف.' : 'Minimum 6 characters.')}</p></div><button onClick={() => setCredentialReset(null)} disabled={busy} className="p-2 text-muted hover:text-main"><X size={18} /></button></div>
                        <div className="p-5"><input value={credentialValue} onChange={(e) => setCredentialValue(credentialReset === 'pin' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)} type={credentialReset === 'password' ? 'password' : 'text'} autoFocus className="h-12 w-full rounded-xl border border-border bg-app px-4 text-sm font-black text-main outline-none focus:border-primary" placeholder={credentialReset === 'pin' ? '123456' : '••••••••'} /></div>
                        <div className="flex gap-3 border-t border-border p-4"><button onClick={() => setCredentialReset(null)} disabled={busy} className="flex-1 rounded-xl border border-border bg-app py-3 text-xs font-black text-muted">{isAr ? 'إلغاء' : 'Cancel'}</button><button onClick={submitCredentialReset} disabled={busy || (credentialReset === 'password' && credentialValue.trim().length < 6)} className="flex-1 rounded-xl bg-primary py-3 text-xs font-black text-white disabled:opacity-50">{isAr ? 'حفظ' : 'Save'}</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};

const Field = ({ label, value, onChange, type = 'text', placeholder, hint, secret }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; hint?: string; secret?: boolean }) => {
    const [show, setShow] = useState(false);
    const maskable = secret || type === 'password';
    return (
        <label className="space-y-1">
            <span className="text-[11px] font-black text-muted">{label}</span>
            <span className="relative block">
                <input type={maskable ? (show ? 'text' : 'password') : type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`h-11 w-full rounded-lg border border-border bg-app px-3 text-sm font-bold text-main outline-none focus:border-primary/50 placeholder:text-muted/40 ${maskable ? 'pe-10' : ''}`} />
                {maskable && !!value && (
                    <button type="button" onClick={(e) => { e.preventDefault(); setShow((s) => !s); }} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted hover:text-main" aria-label={show ? 'Hide' : 'Show'}>
                        {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                )}
            </span>
            {hint && <span className="block text-[10px] font-bold text-muted">{hint}</span>}
        </label>
    );
};
const InfoPill = ({ label, value }: { label: string; value: string }) => (<div className="rounded-lg border border-border/50 bg-app p-3"><div className="text-[10px] font-black text-muted uppercase tracking-widest">{label}</div><div className="mt-1 truncate text-sm font-black text-main">{value}</div></div>);
const Empty = ({ title }: { title: string }) => (<div className="rounded-lg border border-dashed border-border p-8 text-center text-sm font-black text-muted">{title}</div>);
const Action = ({ title, icon: Icon, onClick, danger }: { title: string; icon: React.ElementType; onClick: () => void; danger?: boolean }) => (
    <button onClick={onClick} className={`flex items-center gap-3 rounded-xl border p-3.5 text-start transition hover:-translate-y-0.5 ${danger ? 'border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10' : 'border-border/60 bg-card hover:border-primary/30 hover:bg-elevated/40'}`}><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${danger ? 'bg-rose-500 text-white' : 'bg-primary text-white'}`}><Icon size={16} /></span><span className="text-xs font-black text-main flex-1">{title}</span><ChevronRight size={14} className="text-muted" /></button>
);

export default UserManagement;
