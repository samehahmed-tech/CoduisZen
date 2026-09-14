import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ShieldCheck, Shield, Users, ChevronRight, ChevronDown, Search, Plus,
    X, Save, Loader2, Settings, Crown, MapPin, Building2, UserCog,
    FileText, AlertTriangle, Check, Trash2, Lock,
    Globe, Smartphone, DollarSign, ShoppingCart,
    ChefHat, Palette, Monitor, BellRing, MessageCircle,
    LayoutDashboard, ShoppingBag, ClipboardList, UtensilsCrossed,
    Map as MapIcon, RotateCcw, Clock, Phone, Package,
    Factory, Trash2 as WastageIcon, Brain, BookOpen,
    ScrollText, Printer, Receipt, Wallet, BarChart3,
    BadgeCheck, Fingerprint, Store, Megaphone, Sparkles,
    Navigation, ListTodo, CalendarDays, Layers,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    UserRole, AppPermission, INITIAL_ROLE_PERMISSIONS,
} from '../types';
import { ROLE_I18N, getRoleLabel, getRoleDescription, roleMatchesQuery } from '../utils/roleLabels';
import { useAuthStore } from '../stores/useAuthStore';
import { useToast } from './Toast';
import { nanoid } from 'nanoid';

// ============ Constants ============

const ROLE_DEPARTMENTS: { label: string; labelAr: string; color: string; roles: UserRole[] }[] = [
    { label: 'Executive & Corporate', labelAr: 'التوجيه والشركة', color: '#7c3aed', roles: [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.PARTNER, UserRole.OWNER_VIEWER, UserRole.CEO, UserRole.COO, UserRole.GENERAL_MANAGER] },
    { label: 'Finance & Accounts', labelAr: 'المالية والمحاسبة', color: '#059669', roles: [UserRole.FINANCE_DIRECTOR, UserRole.ACCOUNTANT, UserRole.COST_ACCOUNTANT, UserRole.TREASURY_OFFICER] },
    { label: 'Operations & Branch', labelAr: 'التشغيل والفروع', color: '#d97706', roles: [UserRole.BRANCH_MANAGER, UserRole.CASHIER_MANAGER, UserRole.CASHIER, UserRole.CAPTAIN, UserRole.WAITER] },
    { label: 'Kitchen & Production', labelAr: 'المطبخ والإنتاج', color: '#dc2626', roles: [UserRole.KITCHEN_STAFF, UserRole.PRODUCTION_STAFF, UserRole.QUALITY_OFFICER] },
    { label: 'Supply & Logistics', labelAr: 'التوريد والخدمات اللوجستية', color: '#0891b2', roles: [UserRole.PROCUREMENT_MANAGER, UserRole.WAREHOUSE_DIRECTOR, UserRole.WAREHOUSE_STAFF] },
    { label: 'Support & Services', labelAr: 'الدعم والخدمات', color: '#ec4899', roles: [UserRole.CALL_CENTER_MANAGER, UserRole.CALL_CENTER, UserRole.HR_MANAGER, UserRole.PAYROLL_OFFICER, UserRole.TECH_SUPPORT] },
];

const PERM_CATEGORIES: { id: string; label: string; labelAr: string; icon: any; color: string; filter: (p: AppPermission) => boolean }[] = [
    { id: 'NAV', label: 'Pages & Navigation', labelAr: 'الصفحات والتنقل', icon: Globe, color: '#6366f1', filter: p => p.startsWith('NAV_') },
    { id: 'DATA', label: 'Data & Reports', labelAr: 'البيانات والتقارير', icon: FileText, color: '#059669', filter: p => p.startsWith('DATA_') },
    { id: 'OP', label: 'Operations & Actions', labelAr: 'العمليات والإجراءات', icon: Settings, color: '#d97706', filter: p => p.startsWith('OP_') },
    { id: 'CFG', label: 'System Configuration', labelAr: 'إعدادات النظام', icon: Lock, color: '#dc2626', filter: p => p.startsWith('CFG_') },
];

const PERM_LABELS: Record<string, { en: string; ar: string }> = {
    NAV_DASHBOARD: { en: 'Dashboard', ar: 'لوحة التحكم' },
    NAV_ADMIN_DASHBOARD: { en: 'Admin Dashboard', ar: 'لوحة تحكم الإدارة' },
    NAV_POS: { en: 'POS', ar: 'نقطة البيع' },
    NAV_KDS: { en: 'Kitchen Display', ar: 'شاشة المطبخ' },
    NAV_PICKUP: { en: 'Pickup / Packing', ar: 'الاستلام والتغليف' },
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
    NAV_SECURITY: { en: 'Security', ar: 'الأمان' },
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
    NAV_WEBHOOKS: { en: 'Webhooks', ar: 'Webhooks' },
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
    OP_RECEIVE_GRN: { en: 'Receive GRN', ar: 'استلام إذن استلام' },
    OP_APPROVE_PO: { en: 'Approve Purchase Order', ar: 'اعتماد أمر شراء' },
    OP_CREATE_SUPPLIER_INVOICE: { en: 'Create Supplier Invoice', ar: 'إنشاء فاتورة مورد' },
    OP_APPROVE_SUPPLIER_INVOICE: { en: 'Approve Supplier Invoice', ar: 'اعتماد فاتورة مورد' },
    OP_PROCESS_PAYROLL: { en: 'Process Payroll', ar: 'معالجة الرواتب' },
    OP_MANAGE_CASH_DRAWER: { en: 'Manage Cash Drawer', ar: 'إدارة الدرج النقدي' },
    OP_MANAGE_DELIVERY: { en: 'Manage Delivery', ar: 'إدارة التوصيل' },
    OP_MANAGE_MARKETING: { en: 'Manage Marketing', ar: 'إدارة التسويق' },
    OP_MANAGE_WHATSAPP: { en: 'Manage WhatsApp', ar: 'إدارة واتساب' },
    CFG_MANAGE_USERS: { en: 'Manage Users', ar: 'إدارة المستخدمين' },
    CFG_MANAGE_ROLES: { en: 'Manage Roles', ar: 'إدارة الأدوار' },
    CFG_EDIT_MENU_PRICING: { en: 'Edit Menu Pricing', ar: 'تعديل أسعار المنيو' },
    CFG_EDIT_FLOOR_PLAN: { en: 'Edit Floor Plan', ar: 'تعديل مخطط القاعة' },
    CFG_MANAGE_BRANCHES: { en: 'Manage Branches', ar: 'إدارة الفروع' },
    CFG_OFFLINE_MODE: { en: 'Offline Mode', ar: 'الوضع غير المتصل' },
    CFG_MANAGE_PRINTERS: { en: 'Manage Printers', ar: 'إدارة الطابعات' },
    CFG_MANAGE_SETTINGS: { en: 'Manage Settings', ar: 'إدارة الإعدادات' },
    CFG_MANAGE_PLATFORMS: { en: 'Manage Platforms', ar: 'إدارة المنصات' },
};

// ROLE_LABELS is now centralized in utils/roleLabels.ts (bilingual en/ar).
// Kept as alias for backward-compat; includes legacy keys (ADMIN, MANAGER, IT...).
const ROLE_LABELS = ROLE_I18N as unknown as Record<string, { en: string; ar: string; description: string; descriptionAr: string; isCorporate: boolean }>;

// ============ Component ============

const RolesPermissions: React.FC = () => {
    const navigate = useNavigate();
    const { settings, users, roles: dbRoles, loadRoles } = useAuthStore();
    const { t } = useTranslation();
    const lang = settings.language;
    const { showToast } = useToast();

    const [searchQuery, setSearchQuery] = useState('');
    const [permSearchQuery, setPermSearchQuery] = useState('');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [selectedRoleId, setSelectedRoleId] = useState<string>(UserRole.BRANCH_MANAGER);
    const [editingPermissions, setEditingPermissions] = useState<AppPermission[]>([]);
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeCat, setActiveCat] = useState('NAV');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleNameAr, setNewRoleNameAr] = useState('');
    const [roleNameDraft, setRoleNameDraft] = useState('');
    const [roleNameArDraft, setRoleNameArDraft] = useState('');

    useEffect(() => { loadRoles(); }, [loadRoles]);

    const customRoles = settings.customRoles || [];
    const roleOverrides = settings.rolePermissionOverrides || {};

    const userCountByRole = useMemo(() => {
        const counts: Record<string, number> = {};
        users.forEach(u => { counts[u.role] = (counts[u.role] || 0) + 1; });
        return counts;
    }, [users]);

    const allRoles = useMemo(() => {
        const builtIn = Object.values(UserRole).filter(r => r !== UserRole.CUSTOM);
        const customRoleIds = customRoles.map(c => c.id);
        const dbCustomIds = dbRoles.filter(r => !r.isSystem).map(r => r.id).filter(id => !customRoleIds.includes(id));
        return [...builtIn, ...customRoleIds, ...dbCustomIds];
    }, [customRoles, dbRoles]);

    const getEffectivePermissions = useCallback((roleId: string): AppPermission[] => {
        const customRole = customRoles.find(c => c.id === roleId);
        if (customRole) return customRole.permissions;
        if (roleOverrides[roleId]) return roleOverrides[roleId];
        const dbRole = dbRoles.find(r => r.id === roleId || r.name === roleId);
        if (dbRole && Array.isArray(dbRole.permissions) && dbRole.permissions.length > 0) {
            return dbRole.permissions as AppPermission[];
        }
        return INITIAL_ROLE_PERMISSIONS[roleId as UserRole] || [];
    }, [customRoles, roleOverrides, dbRoles]);

    const getDefaultPermissions = useCallback((roleId: string): AppPermission[] => {
        const customRole = customRoles.find(c => c.id === roleId);
        if (customRole) return [];
        return INITIAL_ROLE_PERMISSIONS[roleId as UserRole] || [];
    }, [customRoles]);

    useEffect(() => {
        setEditingPermissions([...getEffectivePermissions(selectedRoleId)]);
        setHasChanges(false);
        setPermSearchQuery('');
    }, [selectedRoleId, getEffectivePermissions]);

    const selectedRoleData = useMemo(() => {
        const custom = customRoles.find(c => c.id === selectedRoleId);
        if (custom) return { id: custom.id, name: custom.name, nameAr: custom.nameAr || custom.name, isCustom: true, isCorporate: false };
        const dbCustom = dbRoles.find(r => (r.id === selectedRoleId || r.name === selectedRoleId) && !r.isSystem);
        if (dbCustom) return { id: dbCustom.id, name: dbCustom.name, nameAr: dbCustom.nameAr || dbCustom.name, isCustom: true, isCorporate: false };
        // Built-in: keep canonical en/ar from central map (never raw codes).
        const label = getRoleLabel(selectedRoleId, 'en', selectedRoleId);
        const labelAr = getRoleLabel(selectedRoleId, 'ar', selectedRoleId);
        const builtIn = ROLE_LABELS[selectedRoleId];
        if (builtIn || label !== selectedRoleId) return { id: selectedRoleId, name: label, nameAr: labelAr, isCustom: false, isCorporate: builtIn?.isCorporate ?? false };
        // Unknown/legacy key: still resolve via central aliases, fallback to raw id.
        return { id: selectedRoleId, name: label, nameAr: labelAr, isCustom: false, isCorporate: false };
    }, [selectedRoleId, customRoles, dbRoles]);
    const selectedRoleDisplayName = selectedRoleData
        ? (selectedRoleData.isCustom
            ? getRoleLabel({ name: selectedRoleData.name, nameAr: selectedRoleData.nameAr }, lang, selectedRoleData.name)
            : getRoleLabel(selectedRoleData.id, lang, selectedRoleData.name))
        : '';
    const selectedRoleDescription = (() => {
        if (!selectedRoleData || selectedRoleData.isCustom) return lang === 'ar' ? 'دور مخصص بصلاحيات محددة' : 'Custom role with custom permissions';
        return getRoleDescription(selectedRoleData.id, lang, '');
    })();

    const isRoleCustom = selectedRoleData?.isCustom || false;
    const isRoleSuperAdmin = selectedRoleId === UserRole.SUPER_ADMIN;

    useEffect(() => {
        setRoleNameDraft(selectedRoleData?.name || '');
        setRoleNameArDraft(selectedRoleData?.nameAr || selectedRoleData?.name || '');
    }, [selectedRoleData?.id, selectedRoleData?.name, selectedRoleData?.nameAr]);

    const totalPerms = Object.values(AppPermission).length;
    const permProgress = (editingPermissions.length / totalPerms) * 100;

    // Permissions for the active category
    const activeCatPerms = useMemo(() => {
        const cat = PERM_CATEGORIES.find(c => c.id === activeCat);
        if (!cat) return [];
        const perms = Object.values(AppPermission).filter(cat.filter);
        if (!permSearchQuery.trim()) return perms;
        const q = permSearchQuery.toLowerCase();
        return perms.filter(p => {
            const label = PERM_LABELS[p];
            const name = label ? label.en : p;
            const nameAr = label ? label.ar : p;
            return name.toLowerCase().includes(q) || nameAr.toLowerCase().includes(q) || p.toLowerCase().includes(q);
        });
    }, [activeCat, permSearchQuery]);

    // Default permissions for comparison (for built-in roles)
    const defaultPerms = useMemo(() => getDefaultPermissions(selectedRoleId), [selectedRoleId, getDefaultPermissions]);

    // Changed permissions (added/removed vs default)
    const changedPerms = useMemo(() => {
        if (isRoleCustom) return { added: editingPermissions, removed: [] as AppPermission[] };
        const added = editingPermissions.filter(p => !defaultPerms.includes(p));
        const removed = defaultPerms.filter(p => !editingPermissions.includes(p));
        return { added, removed };
    }, [editingPermissions, defaultPerms, isRoleCustom]);

    const handleTogglePermission = (perm: AppPermission) => {
        if (isRoleSuperAdmin) return;
        setEditingPermissions(prev => {
            const exists = prev.includes(perm);
            setHasChanges(true);
            return exists ? prev.filter(p => p !== perm) : [...prev, perm];
        });
    };

    const handleToggleCategory = (selectAll: boolean) => {
        if (isRoleSuperAdmin) return;
        const cat = PERM_CATEGORIES.find(c => c.id === activeCat);
        if (!cat) return;
        const catPerms = Object.values(AppPermission).filter(cat.filter);
        setEditingPermissions(prev => {
            const updated = selectAll
                ? [...new Set([...prev, ...catPerms])]
                : prev.filter(p => !catPerms.includes(p));
            setHasChanges(true);
            return updated;
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { saveRolePermissions, updateCustomRole } = useAuthStore.getState();
            if (isRoleCustom) {
                await updateCustomRole(
                    selectedRoleId,
                    roleNameDraft.trim() || selectedRoleData?.name || selectedRoleId,
                    roleNameArDraft.trim() || roleNameDraft.trim() || selectedRoleData?.nameAr || selectedRoleId,
                    editingPermissions
                );
            } else {
                await saveRolePermissions(selectedRoleId, editingPermissions);
            }
            setHasChanges(false);
            showToast(t('permissions_saved'), 'success');
        } catch {
            showToast(t('permissions_save_failed'), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        if (isRoleCustom) {
            setEditingPermissions([]);
        } else {
            setEditingPermissions([...INITIAL_ROLE_PERMISSIONS[selectedRoleId as UserRole] || []]);
        }
        setHasChanges(true);
    };

    const handleCreateRole = async () => {
        if (!newRoleName.trim()) { showToast(t('enter_role_name'), 'error'); return; }
        const id = `custom_${nanoid(8)}`;
        const { createCustomRole } = useAuthStore.getState();
        setIsSaving(true);
        try {
            await createCustomRole(id, newRoleName.trim(), newRoleNameAr.trim() || newRoleName.trim(), []);
            setShowCreateModal(false);
            setNewRoleName('');
            setNewRoleNameAr('');
            setSelectedRoleId(id);
            showToast(t('role_created'), 'success');
        } catch {
            showToast(t('permissions_save_failed'), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteRole = async () => {
        if (!isRoleCustom) return;
        const { deleteCustomRole } = useAuthStore.getState();
        setIsSaving(true);
        try {
            await deleteCustomRole(selectedRoleId);
            setShowDeleteConfirm(false);
            setSelectedRoleId(UserRole.BRANCH_MANAGER);
            showToast(t('role_deleted'), 'success');
        } catch {
            showToast(t('permissions_save_failed'), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const filteredRoles = useMemo(() => {
        if (!searchQuery.trim()) return allRoles;
        return allRoles.filter(roleId => {
            const custom = customRoles.find(c => c.id === roleId);
            if (custom) return roleMatchesQuery({ name: custom.name, nameAr: custom.nameAr || custom.name }, searchQuery);
            const dbCustom = dbRoles.find(r => r.id === roleId || r.name === roleId);
            if (dbCustom && !dbCustom.isSystem) return roleMatchesQuery({ name: dbCustom.name, nameAr: dbCustom.nameAr || dbCustom.name }, searchQuery);
            return roleMatchesQuery(roleId, searchQuery);
        });
    }, [allRoles, searchQuery, customRoles, dbRoles]);

    const tn = (en: string, ar: string) => lang === 'ar' ? ar : en;
    const inputClass = "w-full px-5 py-4 bg-elevated/40 border border-border/30 rounded-2xl outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all font-bold text-sm text-main placeholder:text-muted/40";
    const labelClass = "text-[10px] font-black text-muted uppercase tracking-widest mb-1.5 block";

    return (
        <div className="min-h-screen bg-app overflow-hidden selection:bg-primary/30">
            <div className="flex h-screen overflow-hidden">
                {/* ============= Sidebar ============= */}
                <aside className={`${sidebarCollapsed ? 'w-20' : 'w-72'} shrink-0 bg-card/80 backdrop-blur-xl border-r border-border/30 flex flex-col transition-all duration-300 z-20`}>
                    <div className="p-5 border-b border-border/20 flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-amber-600/20 shrink-0">
                            <ShieldCheck size={22} />
                        </div>
                        {!sidebarCollapsed && (
                            <div>
                                <h2 className="text-sm font-black text-main uppercase tracking-tight leading-none">{tn('Roles', 'الأدوار')}</h2>
                                <p className="text-[8px] font-black text-muted uppercase tracking-widest mt-1">{tn('Access Control', 'التحكم بالوصول')}</p>
                            </div>
                        )}
                        <button type="button" aria-label={sidebarCollapsed ? tn('Expand roles sidebar', 'توسيع قائمة الأدوار') : tn('Collapse roles sidebar', 'طي قائمة الأدوار')} onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="ml-auto p-1.5 rounded-lg text-muted hover:bg-elevated/60 transition-all">
                            <ChevronRight size={16} className={`transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
                        </button>
                    </div>

                    {!sidebarCollapsed && (
                        <div className="px-4 pt-4 pb-2 space-y-3">
                            <div className="relative">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    placeholder={tn('Search roles...', 'بحث في الأدوار...')}
                                    className="w-full pl-10 pr-4 py-3 bg-elevated/40 border border-border/20 rounded-2xl outline-none focus:border-amber-500/30 transition-all text-xs font-bold text-main placeholder:text-muted/40"
                                />
                            </div>
                            <button onClick={() => { setNewRoleName(''); setNewRoleNameAr(''); setShowCreateModal(true); }}
                                className="w-full py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2"
                            >
                                <Plus size={14} /> {tn('Custom Role', 'دور مخصص')}
                            </button>
                        </div>
                    )}

                    <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-5">
                        {ROLE_DEPARTMENTS.map(dept => {
                            const deptRoles = dept.roles.filter(r => filteredRoles.includes(r));
                            if (deptRoles.length === 0) return null;
                            return (
                                <div key={dept.label}>
                                    {!sidebarCollapsed && (
                                        <p className="px-3 pb-1 text-[8px] font-black text-muted uppercase tracking-[0.2em]">
                                            {tn(dept.label, dept.labelAr)}
                                        </p>
                                    )}
                                    <div className="space-y-0.5">
                                        {deptRoles.map(roleId => {
                                            const isActive = selectedRoleId === roleId;
                                            const label = ROLE_LABELS[roleId];
                                            const displayName = getRoleLabel(roleId, lang, roleId);
                                            return (
                                                <button key={roleId} onClick={() => setSelectedRoleId(roleId)}
                                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${isActive ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'text-muted hover:text-main hover:bg-elevated/40'}`}
                                                    title={sidebarCollapsed ? displayName : undefined}
                                                >
                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-[8px] ${isActive ? 'bg-white/20' : 'bg-elevated/60'}`}
                                                        style={!isActive ? { backgroundColor: dept.color + '15', color: dept.color } : {}}
                                                    >
                                                        {label?.isCorporate ? <Crown size={12} /> : <MapPin size={12} />}
                                                    </div>
                                                    {!sidebarCollapsed && (
                                                        <div className="flex-1 text-left">
                                                            <span className="font-black text-[9px] uppercase tracking-widest">{displayName}</span>
                                                        </div>
                                                    )}
                                                    {!sidebarCollapsed && userCountByRole[roleId] > 0 && (
                                                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg ${isActive ? 'bg-white/20' : 'bg-elevated/60 text-muted'}`}>{userCountByRole[roleId]}</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                        {(customRoles.length > 0 || dbRoles.filter(r => !r.isSystem).length > 0) && !sidebarCollapsed && (
                            <div>
                                <p className="px-3 pb-1 text-[8px] font-black text-amber-600 uppercase tracking-[0.2em]">
                                    {tn('Custom Roles', 'أدوار مخصصة')}
                                </p>
                                <div className="space-y-0.5">
                                    {customRoles.filter(c => filteredRoles.includes(c.id)).map(cr => {
                                        const isActive = selectedRoleId === cr.id;
                                        return (
                                            <button key={cr.id} onClick={() => setSelectedRoleId(cr.id)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${isActive ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'text-muted hover:text-main hover:bg-elevated/40'}`}
                                            >
                                                <div className="w-7 h-7 rounded-lg bg-amber-600/10 text-amber-600 flex items-center justify-center">
                                                    <UserCog size={12} />
                                                </div>
                                                <div className="flex-1 text-left">
                                                    <span className="font-black text-[9px] uppercase tracking-widest">{getRoleLabel({ name: cr.name, nameAr: cr.nameAr || cr.name }, lang, cr.name)}</span>
                                                </div>
                                                {userCountByRole[cr.id] > 0 && (
                                                    <span className="text-[8px] font-black px-2 py-0.5 rounded-lg bg-elevated/60 text-muted">{userCountByRole[cr.id]}</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                    {dbRoles.filter(r => !r.isSystem && !customRoles.some(c => c.id === r.id)).filter(cr => filteredRoles.includes(cr.id)).map(cr => {
                                        const isActive = selectedRoleId === cr.id;
                                        return (
                                            <button key={cr.id} onClick={() => setSelectedRoleId(cr.id)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${isActive ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'text-muted hover:text-main hover:bg-elevated/40'}`}
                                            >
                                                <div className="w-7 h-7 rounded-lg bg-amber-600/10 text-amber-600 flex items-center justify-center">
                                                    <UserCog size={12} />
                                                </div>
                                                <div className="flex-1 text-left">
                                                    <span className="font-black text-[9px] uppercase tracking-widest">{getRoleLabel({ name: cr.name, nameAr: (cr as any).nameAr || cr.name }, lang, cr.name)}</span>
                                                </div>
                                                {userCountByRole[cr.id] > 0 && (
                                                    <span className="text-[8px] font-black px-2 py-0.5 rounded-lg bg-elevated/60 text-muted">{userCountByRole[cr.id]}</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </nav>

                    {!sidebarCollapsed && (
                        <div className="p-4 border-t border-border/20">
                            <button onClick={() => navigate('/user-management')} className="w-full py-3 bg-elevated/40 border border-border/20 rounded-2xl font-black text-[9px] uppercase tracking-widest text-muted hover:text-main hover:bg-elevated/60 transition-all flex items-center justify-center gap-2">
                                <Users size={14} /> {tn('Manage Users', 'إدارة المستخدمين')}
                            </button>
                        </div>
                    )}
                </aside>

                {/* ============= Main Content ============= */}
                <main className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Top Bar */}
                    <div className="sticky top-0 z-10 bg-app/80 backdrop-blur-xl border-b border-border/20">
                        <div className="px-8 py-4 flex items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl text-white shadow-lg bg-amber-600">
                                    <ShieldCheck size={22} />
                                </div>
                                <div>
                                    <h1 className="text-xl font-black text-main uppercase tracking-tight leading-none">
                                        {selectedRoleDisplayName}
                                    </h1>
                                    <p className="text-[9px] font-black text-muted uppercase tracking-[0.2em] mt-1">
                                        {selectedRoleData?.isCorporate ? tn('Corporate', 'مؤسسي') : tn('Branch', 'فرع')}
                                        {isRoleCustom && ` • ${tn('Custom', 'مخصص')}`}
                                        {isRoleSuperAdmin && ` • ${tn('Full Access', 'وصول كامل')}`}
                                        {hasChanges && !isRoleSuperAdmin && ` • ${tn('Unsaved Changes', 'تغييرات غير محفوظة')}`}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {hasChanges && !isRoleSuperAdmin && (
                                    <>
                                        <button onClick={handleReset} className="px-5 py-3 bg-elevated/40 border border-border/20 rounded-2xl font-black text-[10px] uppercase tracking-widest text-muted hover:text-main hover:bg-elevated/60 transition-all">
                                            {tn('Reset', 'إعادة تعيين')}
                                        </button>
                                        <button onClick={handleSave} disabled={isSaving}
                                            className="px-7 py-3 bg-amber-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:shadow-2xl hover:shadow-amber-600/30 transition-all shadow-xl shadow-amber-600/20 flex items-center gap-2"
                                        >
                                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                            {tn('Save Changes', 'حفظ التغييرات')}
                                        </button>
                                    </>
                                )}
                                <button onClick={() => navigate(-1)} className="px-5 py-3 bg-elevated/40 border border-border/20 rounded-2xl font-black text-[10px] uppercase tracking-widest text-muted hover:text-main hover:bg-elevated/60 transition-all">
                                    {tn('Back', 'رجوع')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Stats Overview */}
                    <div className="px-8 pt-6 pb-2">
                        <div className="grid grid-cols-4 gap-4">
                            <div className="bg-elevated/20 border border-border/20 rounded-2xl p-4 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#7c3aed20', color: '#7c3aed' }}>
                                    <ShieldCheck size={18} />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-muted uppercase tracking-widest">{tn('Total Roles', 'إجمالي الأدوار')}</p>
                                    <p className="text-base font-black text-main mt-0.5">{allRoles.length}</p>
                                </div>
                            </div>
                            <div className="bg-elevated/20 border border-border/20 rounded-2xl p-4 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#05966920', color: '#059669' }}>
                                    <Users size={18} />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-muted uppercase tracking-widest">{tn('Users', 'المستخدمين')}</p>
                                    <p className="text-base font-black text-main mt-0.5">{users.length}</p>
                                </div>
                            </div>
                            <div className="bg-elevated/20 border border-border/20 rounded-2xl p-4 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#d9770620', color: '#d97706' }}>
                                    <UserCog size={18} />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-muted uppercase tracking-widest">{tn('Custom', 'مخصص')}</p>
                                    <p className="text-base font-black text-main mt-0.5">{customRoles.length + dbRoles.filter(r => !r.isSystem && !customRoles.some(c => c.id === r.id)).length}</p>
                                </div>
                            </div>
                            <div className="bg-elevated/20 border border-border/20 rounded-2xl p-4 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#0891b220', color: '#0891b2' }}>
                                    <Layers size={18} />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-muted uppercase tracking-widest">{tn('Permissions', 'الصلاحيات')}</p>
                                    <p className="text-base font-black text-main mt-0.5">{editingPermissions.length}/{totalPerms}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-8 pb-24">
                        <div className="bg-elevated/5 border border-border/20 rounded-[2.5rem] p-8 shadow-xl mt-4">
                            {/* ===== Role Info Header ===== */}
                            <div className="flex items-start justify-between pb-6 border-b border-border/20 mb-6">
                                <div className="flex items-center gap-5">
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black ${selectedRoleData?.isCorporate ? 'bg-purple-500/10 text-purple-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                        {selectedRoleData?.isCorporate ? <Crown size={28} /> : <MapPin size={28} />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            {isRoleCustom ? (
                                                <div className="flex gap-3">
                                                    <input type="text" value={roleNameDraft}
                                                        onChange={e => { setRoleNameDraft(e.target.value); setHasChanges(true); }}
                                                        className="bg-transparent outline-none text-xl font-black text-main uppercase tracking-tight border-b border-border/30 focus:border-amber-500/50 pb-0.5 w-36"
                                                    />
                                                    <input type="text" value={roleNameArDraft}
                                                        onChange={e => { setRoleNameArDraft(e.target.value); setHasChanges(true); }}
                                                        className="bg-transparent outline-none text-xl font-black text-main border-b border-border/30 focus:border-amber-500/50 pb-0.5 w-36 text-right"
                                                        dir="rtl"
                                                    />
                                                </div>
                                            ) : (
                                                <h3 className="text-xl font-black text-main uppercase tracking-tight">
                                                    {selectedRoleDisplayName}
                                                </h3>
                                            )}
                                            {isRoleSuperAdmin && (
                                                <span className="px-3 py-1.5 bg-rose-500/10 text-rose-500 rounded-xl text-[8px] font-black uppercase tracking-widest">{tn('Locked', 'مقفل')}</span>
                                            )}
                                             {isRoleCustom && (
                                                <button
                                                    onClick={() => setShowDeleteConfirm(true)}
                                                    className="p-2 rounded-xl text-muted hover:text-red-500 hover:bg-red-500/10 transition-all"
                                                    aria-label={tn('Delete custom role', 'حذف الدور المخصص')}
                                                    title={tn('Delete custom role', 'حذف الدور المخصص')}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-muted font-bold mt-1 max-w-lg leading-relaxed">
                                            {selectedRoleDescription}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                    <div className="text-right">
                                        <div className="flex items-center gap-2 justify-end">
                                            <span className="text-[10px] font-black text-muted">{tn('Permissions', 'الصلاحيات')}</span>
                                            <div className="w-28 h-2.5 bg-elevated/40 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${permProgress}%`, backgroundColor: isRoleSuperAdmin ? '#dc2626' : '#d97706' }} />
                                            </div>
                                            <span className={`text-xs font-black ${isRoleSuperAdmin ? 'text-rose-500' : 'text-amber-600'}`}>{editingPermissions.length}/{totalPerms}</span>
                                        </div>
                                        {!isRoleSuperAdmin && changedPerms.added.length + changedPerms.removed.length > 0 && (
                                            <p className="text-[8px] font-bold mt-0.5">
                                                <span className="text-emerald-500">+{changedPerms.added.length}</span>
                                                <span className="text-muted mx-1">/</span>
                                                <span className="text-rose-500">-{changedPerms.removed.length}</span>
                                                <span className="text-muted ml-1">{tn('from default', 'عن الافتراضي')}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ===== Category Pills + Permission Search ===== */}
                            <div className="flex items-center gap-3 mb-6 flex-wrap">
                                {PERM_CATEGORIES.map(cat => {
                                    const catPerms = Object.values(AppPermission).filter(cat.filter);
                                    const enabledCount = editingPermissions.filter(p => catPerms.includes(p)).length;
                                    const isActive = activeCat === cat.id;
                                    return (
                                        <button key={cat.id} onClick={() => setActiveCat(cat.id)}
                                            className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition-all border-2 ${isActive ? 'shadow-lg' : 'border-transparent hover:border-border/30'}`}
                                            style={{ backgroundColor: isActive ? cat.color + '15' : '', borderColor: isActive ? cat.color + '40' : '' }}
                                        >
                                            <cat.icon size={16} style={{ color: cat.color }} />
                                            <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? '' : 'text-muted'}`}>{tn(cat.label.split(' ')[0], cat.labelAr.split(' ')[0])}</span>
                                            <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg ${isActive ? '' : 'bg-elevated/60 text-muted'}`} style={isActive ? { backgroundColor: cat.color + '20', color: cat.color } : {}}>
                                                {enabledCount}/{catPerms.length}
                                            </span>
                                        </button>
                                    );
                                })}
                                <div className="flex-1" />
                                <div className="relative w-56">
                                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                                    <input type="text" value={permSearchQuery} onChange={e => setPermSearchQuery(e.target.value)}
                                        placeholder={tn('Search permissions...', 'بحث في الصلاحيات...')}
                                        className="w-full pl-10 pr-4 py-3 bg-elevated/40 border border-border/20 rounded-2xl outline-none focus:border-amber-500/30 transition-all text-[10px] font-bold text-main placeholder:text-muted/40"
                                    />
                                </div>
                            </div>

                            {/* ===== Bulk Actions Bar ===== */}
                            {!isRoleSuperAdmin && (
                                <div className="flex items-center gap-2 mb-4 px-1">
                                    <button onClick={() => handleToggleCategory(true)}
                                        className="px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                                    >{tn('Select All', 'تحديد الكل')}</button>
                                    <button onClick={() => handleToggleCategory(false)}
                                        className="px-4 py-2 bg-rose-500/10 text-rose-500 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all"
                                    >{tn('Deselect All', 'إلغاء الكل')}</button>
                                    {!isRoleCustom && defaultPerms.length > 0 && (
                                        <>
                                            <div className="w-px h-5 bg-border/30 mx-1" />
                                            <button onClick={() => { setEditingPermissions([...defaultPerms]); setHasChanges(true); }}
                                                className="px-4 py-2 bg-blue-500/10 text-blue-500 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-blue-500/20 transition-all"
                                            >{tn('Restore Defaults', 'استعادة الافتراضي')}</button>
                                        </>
                                    )}
                                    <span className="ml-auto text-[8px] text-muted font-bold">
                                        {changedPerms.added.length > 0 && <span className="text-emerald-500">+{changedPerms.added.length} {tn('added', 'مضافة')}</span>}
                                        {changedPerms.added.length > 0 && changedPerms.removed.length > 0 && <span className="mx-1.5">•</span>}
                                        {changedPerms.removed.length > 0 && <span className="text-rose-500">-{changedPerms.removed.length} {tn('removed', 'محذوفة')}</span>}
                                    </span>
                                </div>
                            )}

                            {/* ===== Permission Cards Grid ===== */}
                            {activeCatPerms.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-elevated/40 flex items-center justify-center">
                                        <Search size={24} className="text-muted/40" />
                                    </div>
                                    <p className="text-xs font-black text-muted">{tn('No permissions match your search', 'لا توجد صلاحيات تطابق بحثك')}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {activeCatPerms.map(perm => {
                                        const enabled = editingPermissions.includes(perm);
                                        const label = PERM_LABELS[perm];
                                        const isChanged = isRoleCustom ? enabled : (enabled !== defaultPerms.includes(perm));
                                        const isAdded = isRoleCustom ? enabled : (enabled && !defaultPerms.includes(perm));
                                        const isRemoved = !isRoleCustom && !enabled && defaultPerms.includes(perm);
                                        const cat = PERM_CATEGORIES.find(c => c.filter(perm));
                                        return (
                                            <div key={perm}
                                                onClick={() => handleTogglePermission(perm)}
                                                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer group ${enabled ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-transparent bg-elevated/20 hover:bg-elevated/30'} ${isRoleSuperAdmin ? 'opacity-50 cursor-not-allowed' : ''} ${isChanged && !isRoleSuperAdmin ? (isAdded ? 'ring-1 ring-emerald-500/20' : isRemoved ? 'ring-1 ring-rose-500/20' : '') : ''}`}
                                            >
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    {/* Toggle */}
                                                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${enabled ? 'bg-amber-600 border-amber-600' : 'border-border/40 group-hover:border-amber-500/40'}`}>
                                                        {enabled && <Check size={14} className="text-white" />}
                                                    </div>
                                                    {/* Info */}
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-black text-main uppercase leading-tight truncate">
                                                                {label ? tn(label.en, label.ar) : perm}
                                                            </span>
                                                            {isAdded && <span className="text-[7px] font-black text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase">{tn('New', 'جديد')}</span>}
                                                            {isRemoved && <span className="text-[7px] font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded uppercase">{tn('Removed', 'محذوف')}</span>}
                                                        </div>
                                                        <p className="text-[7px] font-mono text-muted/60 font-bold truncate">{perm}</p>
                                                    </div>
                                                </div>
                                                {/* Category dot */}
                                                {cat && <div className="w-2 h-2 rounded-full shrink-0 ml-2" style={{ backgroundColor: cat.color }} />}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Footer Note */}
                            <div className="mt-6 pt-6 border-t border-border/20">
                                <p className="text-[9px] text-muted font-bold text-center leading-relaxed">
                                    {isRoleSuperAdmin
                                        ? tn('Super Admin has full system access and cannot be modified.', 'مدير النظام لديه وصول كامل ولا يمكن تعديل صلاحياته.')
                                        : tn('Changes are saved to the server immediately. Users with this role will see updated permissions on next login.', 'يتم حفظ التغييرات على الخادم فوراً. سيرى المستخدمون بهذا الدور الصلاحيات المحدثة عند تسجيل الدخول التالي.')}
                                </p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Create Custom Role Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md p-4 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
                    <div className="bg-card border border-border/30 rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl animate-fade-up" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-amber-600 text-white rounded-2xl shadow-lg shadow-amber-600/20"><UserCog size={24} /></div>
                                <h3 className="text-xl font-black text-main tracking-tighter uppercase">{tn('Create Custom Role', 'إنشاء دور مخصص')}</h3>
                            </div>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="p-3 rounded-2xl hover:bg-elevated text-muted transition-colors"
                                aria-label={tn('Close create role modal', 'إغلاق نافذة إنشاء الدور')}
                                title={tn('Close', 'إغلاق')}
                            ><X size={24} /></button>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className={labelClass}>{tn('Name (EN)', 'الاسم (إنجليزي)')}</label>
                                <input type="text" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} className={inputClass} placeholder="e.g. Inventory Manager" autoFocus />
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Name (AR)', 'الاسم (عربي)')}</label>
                                <input type="text" value={newRoleNameAr} onChange={e => setNewRoleNameAr(e.target.value)} className={inputClass} placeholder="مدير المخزون" dir="rtl" />
                            </div>
                            <button onClick={handleCreateRole} disabled={!newRoleName.trim() || isSaving}
                                className="w-full py-5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-amber-600/20 hover:opacity-90 transition-all disabled:opacity-50"
                            >
                                {isSaving ? tn('Saving...', 'جار الحفظ...') : tn('Create Role', 'إنشاء الدور')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Custom Role Confirm */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md p-4 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="bg-card border border-border/30 rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl animate-fade-up" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-red-600 text-white rounded-2xl shadow-lg shadow-red-600/20"><AlertTriangle size={24} /></div>
                                <h3 className="text-xl font-black text-main tracking-tighter uppercase">{tn('Delete Role', 'حذف الدور')}</h3>
                            </div>
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="p-3 rounded-2xl hover:bg-elevated text-muted"
                                aria-label={tn('Close delete role confirmation', 'إغلاق تأكيد حذف الدور')}
                                title={tn('Close', 'إغلاق')}
                            ><X size={24} /></button>
                        </div>
                        <p className="text-[12px] font-bold text-muted mb-6 leading-relaxed">
                            {tn('Are you sure you want to delete this custom role? Users assigned to it will need a new role.', 'هل أنت متأكد من حذف هذا الدور المخصص؟ المستخدمون المعينون به سيحتاجون إلى دور جديد.')}
                        </p>
                        <div className="flex gap-4">
                            <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-4 bg-elevated/40 border border-border/20 rounded-2xl font-black text-[10px] uppercase tracking-widest text-main hover:bg-elevated transition-all">
                                {tn('Cancel', 'إلغاء')}
                            </button>
                            <button onClick={handleDeleteRole} disabled={isSaving} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-600/20 disabled:opacity-50">
                                {isSaving ? tn('Deleting...', 'جار الحذف...') : tn('Delete', 'حذف')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RolesPermissions;
