import React, { useEffect, useMemo, useState } from 'react';
import {
    Activity, Ban, Building2, Check, ChevronRight, Download, Eye, FileText,
    KeyRound, Layers, LockKeyhole, Monitor, Plus, RefreshCw, Save, Search,
    ShieldCheck, SlidersHorizontal, Trash2, UserCog, UserPlus, Users, X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { usersApi } from '@/services/api/users';
import { useToast } from '@/components/common/ToastProvider';
import { useConfirm } from '@/components/common/ConfirmProvider';
import { AppPermission, INITIAL_ROLE_PERMISSIONS, User, UserRole, isCorporateRole } from '@/types';

type Tab = 'users' | 'roles' | 'matrix' | 'sessions' | 'audit' | 'security';
type UserForm = Partial<User> & { password?: string; pin?: string };

const tabs: { id: Tab; ar: string; en: string; icon: React.ElementType }[] = [
    { id: 'users', ar: 'المستخدمين', en: 'Users', icon: Users },
    { id: 'roles', ar: 'الأدوار', en: 'Roles', icon: ShieldCheck },
    { id: 'matrix', ar: 'الصلاحيات', en: 'Permissions', icon: Layers },
    { id: 'sessions', ar: 'الجلسات', en: 'Sessions', icon: Monitor },
    { id: 'audit', ar: 'السجل', en: 'Audit', icon: FileText },
    { id: 'security', ar: 'الأمان', en: 'Security', icon: LockKeyhole },
];

const categories = [
    { key: 'NAV', ar: 'الصفحات', en: 'Pages', color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { key: 'DATA', ar: 'البيانات', en: 'Data', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { key: 'OP', ar: 'العمليات', en: 'Operations', color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { key: 'CFG', ar: 'الإعدادات', en: 'Settings', color: 'text-rose-500', bg: 'bg-rose-500/10' },
];

const arRole: Record<string, string> = {
    SUPER_ADMIN: 'مدير النظام',
    OWNER: 'المالك',
    PARTNER: 'شريك',
    OWNER_VIEWER: 'متابع المالك',
    CEO: 'الرئيس التنفيذي',
    COO: 'مدير العمليات',
    GENERAL_MANAGER: 'مدير عام',
    BRANCH_MANAGER: 'مدير فرع',
    CASHIER_MANAGER: 'مدير كاشير',
    CASHIER: 'كاشير',
    WAITER: 'ويتر',
    CAPTAIN: 'كابتن صالة',
    DRIVER: 'سائق',
    KITCHEN_STAFF: 'مطبخ',
    CALL_CENTER: 'كول سنتر',
    CALL_CENTER_MANAGER: 'مدير كول سنتر',
    WAREHOUSE_STAFF: 'مخازن',
    WAREHOUSE_DIRECTOR: 'مدير مخازن',
    PRODUCTION_STAFF: 'إنتاج',
    PROCUREMENT_MANAGER: 'مشتريات',
    ACCOUNTANT: 'محاسب',
    COST_ACCOUNTANT: 'محاسب تكاليف',
    FINANCE_DIRECTOR: 'مدير مالي',
    HR_MANAGER: 'موارد بشرية',
    PAYROLL_OFFICER: 'مرتبات',
    TREASURY_OFFICER: 'خزنة',
    TECH_SUPPORT: 'دعم فني',
    QUALITY_OFFICER: 'جودة',
    CUSTOM: 'مخصص',
};

const genId = () => `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const allPermissions = Object.values(AppPermission);
const permName = (p: string) => p.replace(/^(NAV|DATA|OP|CFG)_/, '').replace(/_/g, ' ').toLowerCase();

const UserManagement: React.FC = () => {
    const {
        users, branches, roles, settings, fetchUsers, fetchBranches, loadRoles,
        createUser, updateUserInDB, deleteUserFromDB, saveRolePermissions,
    } = useAuthStore();
    const lang = (settings.language || 'ar') as 'ar' | 'en';
    const isAr = lang === 'ar';
    const { success, error: showError, info } = useToast();
    const { confirm } = useConfirm();

    const [tab, setTab] = useState<Tab>('users');
    const [query, setQuery] = useState('');
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

    useEffect(() => {
        fetchUsers();
        fetchBranches();
        loadRoles();
    }, [fetchUsers, fetchBranches, loadRoles]);

    const roleRows = useMemo(() => {
        const dbRoles = roles.map((r: any) => ({
            id: r.id,
            name: r.name,
            nameAr: r.nameAr,
            permissions: (r.permissions || []) as AppPermission[],
            isSystem: r.isSystem,
            color: r.color || '#2563eb',
        }));
        const seen = new Set(dbRoles.flatMap((r) => [r.id, r.name]));
        const enumRoles = Object.values(UserRole)
            .filter((role) => !seen.has(role))
            .map((role) => ({
                id: role,
                name: role,
                nameAr: arRole[role],
                permissions: INITIAL_ROLE_PERMISSIONS[role] || [],
                isSystem: true,
                color: '#64748b',
            }));
        return [...dbRoles, ...enumRoles];
    }, [roles]);

    const selectedUser = users.find((u) => u.id === selectedId) || users[0];
    const roleOf = (role: string) => roleRows.find((r) => r.id === role || r.name === role);
    const roleLabel = (role: string) => isAr ? (roleOf(role)?.nameAr || arRole[role] || role) : (roleOf(role)?.name || role);
    const rolePermissions = (role: string) => roleOf(role)?.permissions || INITIAL_ROLE_PERMISSIONS[role as UserRole] || [];
    const branchName = (id?: string) => branches.find((b) => b.id === id)?.name || (isAr ? 'كل الفروع' : 'All branches');

    const filteredUsers = useMemo(() => {
        const q = query.trim().toLowerCase();
        return users.filter((u) => {
            const hit = !q || [u.name, u.email, u.role, u.phone].some((v) => String(v || '').toLowerCase().includes(q));
            const roleHit = roleFilter === 'ALL' || u.role === roleFilter;
            return hit && roleHit;
        });
    }, [users, query, roleFilter]);

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
            setSessions(sessionRows || []);
            setAudit(auditRows || []);
        } catch (err: any) {
            showError(err.message || (isAr ? 'تعذر تحميل بيانات الأمان' : 'Security data failed'));
        }
    };

    useEffect(() => {
        if (tab === 'sessions' || tab === 'audit' || tab === 'security') refreshAdvanced();
    }, [tab]);

    useEffect(() => {
        setMatrixPerms(rolePermissions(matrixRole));
    }, [matrixRole, roleRows]);

    const openCreate = () => {
        const role = UserRole.CASHIER;
        setForm({
            id: genId(),
            name: '',
            email: '',
            role,
            isActive: true,
            assignedBranchId: branches[0]?.id,
            allowedBranches: branches[0]?.id ? [branches[0].id] : [],
            permissions: rolePermissions(role),
        });
        setFormOpen(true);
    };

    const openEdit = (user: User) => {
        setForm({ ...user, allowedBranches: user.allowedBranches?.length ? user.allowedBranches : (user.assignedBranchId ? [user.assignedBranchId] : []) });
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
            const allowedBranches = isCorporateRole(role)
                ? branches.map((b) => b.id)
                : (form.allowedBranches?.length ? form.allowedBranches : [form.assignedBranchId || branches[0]?.id]).filter(Boolean) as string[];
            const payload: User = {
                id: form.id || genId(),
                name: form.name.trim(),
                email,
                role,
                isActive: form.isActive !== false,
                assignedBranchId: form.assignedBranchId || allowedBranches[0],
                allowedBranches,
                permissions: form.permissions?.length ? form.permissions : rolePermissions(role),
                password: form.password,
                pin: form.pin,
            };
            users.some((u) => u.id === payload.id) ? await updateUserInDB(payload) : await createUser(payload);
            setFormOpen(false);
            setSelectedId(payload.id);
            success(isAr ? 'تم حفظ المستخدم' : 'User saved');
        } catch (err: any) {
            showError(err.message || (isAr ? 'فشل الحفظ' : 'Save failed'));
        } finally {
            setBusy(false);
        }
    };

    const deleteUser = async (user: User) => {
        const ok = await confirm({
            title: isAr ? 'حذف مستخدم' : 'Delete user',
            message: isAr ? `حذف ${user.name} نهائيا؟` : `Delete ${user.name}?`,
            confirmText: isAr ? 'حذف' : 'Delete',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await deleteUserFromDB(user.id);
            success(isAr ? 'تم الحذف' : 'Deleted');
        } catch (err: any) {
            showError(err.message);
        }
    };

    const applyBulk = async (action: 'activate' | 'deactivate' | 'role' | 'branch') => {
        if (!checked.length) return info(isAr ? 'اختار مستخدمين أولا' : 'Select users first');
        setBusy(true);
        try {
            if (action === 'activate') await usersApi.bulkUpdateStatus(checked, true);
            if (action === 'deactivate') await usersApi.bulkUpdateStatus(checked, false);
            if (action === 'role') await usersApi.bulkAssignRole(checked, roleFilter === 'ALL' ? UserRole.CASHIER : roleFilter);
            if (action === 'branch' && branches[0]) await usersApi.bulkAssignBranch(checked, branches[0].id);
            await fetchUsers();
            setChecked([]);
            success(isAr ? 'تم تطبيق الإجراء' : 'Bulk action applied');
        } catch (err: any) {
            showError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const toggleUserPermission = async (perm: AppPermission) => {
        if (!selectedUser) return;
        const next = selectedUser.permissions.includes(perm)
            ? selectedUser.permissions.filter((p) => p !== perm)
            : [...selectedUser.permissions, perm];
        try {
            await usersApi.updatePermissions(selectedUser.id, next);
            await fetchUsers();
            success(isAr ? 'تم تحديث الصلاحيات' : 'Permissions updated');
        } catch (err: any) {
            showError(err.message);
        }
    };

    const saveMatrix = async () => {
        setBusy(true);
        try {
            await saveRolePermissions(matrixRole, matrixPerms);
            success(isAr ? 'تم حفظ صلاحيات الدور' : 'Role permissions saved');
        } catch (err: any) {
            showError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const exportCsv = async () => {
        const blob = await usersApi.exportCsv();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const securityAction = async (kind: 'revoke' | 'mfa' | 'pin' | 'password' | 'toggle') => {
        if (!selectedUser) return;
        if (kind === 'pin' || kind === 'password') {
            setCredentialReset(kind);
            setCredentialValue('');
            return;
        }
        try {
            if (kind === 'revoke') await usersApi.revokeAllSessions(selectedUser.id);
            if (kind === 'mfa') await usersApi.resetMfa(selectedUser.id);
            if (kind === 'toggle') await usersApi.toggleActive(selectedUser.id);
            await Promise.all([fetchUsers(), refreshAdvanced()]);
            success(isAr ? 'تم تنفيذ الإجراء' : 'Action done');
        } catch (err: any) {
            showError(err.message);
        }
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
            setCredentialReset(null);
            setCredentialValue('');
            await Promise.all([fetchUsers(), refreshAdvanced()]);
            success(isAr ? 'تم تنفيذ الإجراء' : 'Action done');
        } catch (err: any) {
            showError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-app p-3 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>
            <div className="mx-auto max-w-[1500px] space-y-4">
                <header className="flex flex-col gap-4 border-b border-border/50 pb-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-primary">
                            <ShieldCheck size={15} /> {isAr ? 'مركز التحكم في الوصول' : 'Access Control Center'}
                        </div>
                        <h1 className="text-2xl font-black text-main md:text-4xl">{isAr ? 'المستخدمين والأدوار والصلاحيات' : 'Users, Roles & Permissions'}</h1>
                        <p className="mt-2 max-w-2xl text-sm font-semibold text-muted">
                            {isAr ? 'إدارة حسابات النظام بالكامل، صلاحيات دقيقة، فروع، جلسات، وسجل تغييرات من قاعدة البيانات.' : 'Manage accounts, granular permissions, branch access, sessions, and audit logs from the database.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => fetchUsers()} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-black text-main transition hover:border-primary/40">
                            <RefreshCw size={14} className="inline align-[-2px]" /> {isAr ? 'تحديث' : 'Refresh'}
                        </button>
                        <button onClick={exportCsv} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-black text-main transition hover:border-primary/40">
                            <Download size={14} className="inline align-[-2px]" /> CSV
                        </button>
                        <button onClick={openCreate} className="rounded-lg bg-primary px-4 py-2 text-xs font-black text-white shadow-lg shadow-primary/20 transition hover:brightness-110">
                            <Plus size={14} className="inline align-[-2px]" /> {isAr ? 'مستخدم جديد' : 'New user'}
                        </button>
                    </div>
                </header>

                <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                        [stats.total, isAr ? 'إجمالي المستخدمين' : 'Total users', Users, 'text-blue-500'],
                        [stats.active, isAr ? 'نشط' : 'Active', Activity, 'text-emerald-500'],
                        [stats.locked, isAr ? 'معطل' : 'Disabled', Ban, 'text-rose-500'],
                        [stats.privileged, isAr ? 'أدوار عليا' : 'Privileged', ShieldCheck, 'text-amber-500'],
                        [stats.branches, isAr ? 'فروع' : 'Branches', Building2, 'text-violet-500'],
                    ].map(([value, label, Icon, color]: any) => (
                        <div key={label} className="rounded-lg border border-border/60 bg-card p-4">
                            <Icon size={18} className={color} />
                            <div className="mt-3 text-2xl font-black text-main">{value}</div>
                            <div className="text-[11px] font-bold text-muted">{label}</div>
                        </div>
                    ))}
                </section>

                <nav className="flex gap-1 overflow-x-auto rounded-lg border border-border/60 bg-card p-1">
                    {tabs.map((item) => {
                        const Icon = item.icon;
                        const active = tab === item.id;
                        return (
                            <button key={item.id} onClick={() => setTab(item.id)}
                                className={`flex min-w-max items-center gap-2 rounded-md px-3 py-2 text-xs font-black transition ${active ? 'bg-primary text-white' : 'text-muted hover:bg-elevated hover:text-main'}`}>
                                <Icon size={15} /> {isAr ? item.ar : item.en}
                            </button>
                        );
                    })}
                </nav>

                {tab === 'users' && (
                    <main className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                        <section className="rounded-lg border border-border/60 bg-card">
                            <div className="flex flex-col gap-3 border-b border-border/60 p-3 lg:flex-row lg:items-center">
                                <div className="relative flex-1">
                                    <Search className={`absolute top-1/2 -translate-y-1/2 text-muted ${isAr ? 'right-3' : 'left-3'}`} size={16} />
                                    <input value={query} onChange={(e) => setQuery(e.target.value)}
                                        className={`h-10 w-full rounded-lg border border-border bg-app px-4 text-sm font-bold text-main outline-none focus:border-primary/50 ${isAr ? 'pr-10' : 'pl-10'}`}
                                        placeholder={isAr ? 'بحث بالاسم، البريد، الدور، الهاتف' : 'Search name, email, role, phone'} />
                                </div>
                                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
                                    className="h-10 rounded-lg border border-border bg-app px-3 text-xs font-black text-main outline-none">
                                    <option value="ALL">{isAr ? 'كل الأدوار' : 'All roles'}</option>
                                    {roleRows.map((role) => <option key={role.id} value={role.name}>{roleLabel(role.name)}</option>)}
                                </select>
                                <div className="flex gap-1">
                                    <button onClick={() => applyBulk('activate')} aria-label={isAr ? 'تفعيل المستخدمين المحددين' : 'Activate selected users'} title={isAr ? 'تفعيل المحدد' : 'Activate selected'} className="rounded-md border border-border px-2 py-2 text-xs font-black text-emerald-500"><Check size={14} /></button>
                                    <button onClick={() => applyBulk('deactivate')} aria-label={isAr ? 'تعطيل المستخدمين المحددين' : 'Deactivate selected users'} title={isAr ? 'تعطيل المحدد' : 'Deactivate selected'} className="rounded-md border border-border px-2 py-2 text-xs font-black text-rose-500"><Ban size={14} /></button>
                                    <button onClick={() => applyBulk('role')} aria-label={isAr ? 'تغيير دور المستخدمين المحددين' : 'Change selected users role'} title={isAr ? 'تغيير الدور' : 'Change role'} className="rounded-md border border-border px-2 py-2 text-xs font-black text-main"><UserCog size={14} /></button>
                                    <button onClick={() => applyBulk('branch')} aria-label={isAr ? 'تغيير فرع المستخدمين المحددين' : 'Change selected users branch'} title={isAr ? 'تغيير الفرع' : 'Change branch'} className="rounded-md border border-border px-2 py-2 text-xs font-black text-main"><Building2 size={14} /></button>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[880px] text-sm">
                                    <thead className="bg-elevated/50 text-[11px] font-black uppercase text-muted">
                                        <tr>
                                            <th className="w-10 p-3"></th>
                                            <th className="p-3 text-start">{isAr ? 'المستخدم' : 'User'}</th>
                                            <th className="p-3 text-start">{isAr ? 'الدور' : 'Role'}</th>
                                            <th className="p-3 text-start">{isAr ? 'الفرع' : 'Branch'}</th>
                                            <th className="p-3 text-start">{isAr ? 'الصلاحيات' : 'Permissions'}</th>
                                            <th className="p-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                                            <th className="p-3 text-end">{isAr ? 'إجراءات' : 'Actions'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.map((user) => {
                                            const active = selectedUser?.id === user.id;
                                            const selected = checked.includes(user.id);
                                            return (
                                                <tr key={user.id} onClick={() => setSelectedId(user.id)}
                                                    className={`cursor-pointer border-t border-border/40 transition ${active ? 'bg-primary/8' : 'hover:bg-elevated/40'}`}>
                                                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                                        <input type="checkbox" checked={selected} onChange={() => setChecked((prev) => selected ? prev.filter((id) => id !== user.id) : [...prev, user.id])} />
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="font-black text-main">{user.name}</div>
                                                        <div className="text-xs font-semibold text-muted">{user.email || '-'}</div>
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="rounded-md bg-blue-500/10 px-2 py-1 text-xs font-black text-blue-500">{roleLabel(String(user.role))}</span>
                                                    </td>
                                                    <td className="p-3 text-xs font-bold text-muted">{branchName(user.assignedBranchId)}</td>
                                                    <td className="p-3 text-xs font-black text-main">{user.permissions?.length || 0}</td>
                                                    <td className="p-3">
                                                        <span className={`rounded-md px-2 py-1 text-[11px] font-black ${user.isActive !== false ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                                            {user.isActive !== false ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Disabled')}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-end" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => openEdit(user)}
                                                            className="rounded-md border border-border px-2 py-2 text-main hover:border-primary/40"
                                                            aria-label={isAr ? `عرض ${user.name}` : `View ${user.name}`}
                                                            title={isAr ? 'عرض المستخدم' : 'View user'}
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => deleteUser(user)}
                                                            className="ms-1 rounded-md border border-border px-2 py-2 text-rose-500 hover:border-rose-500/40"
                                                            aria-label={isAr ? `حذف ${user.name}` : `Delete ${user.name}`}
                                                            title={isAr ? 'حذف المستخدم' : 'Delete user'}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <aside className="rounded-lg border border-border/60 bg-card p-4">
                            {selectedUser ? (
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-lg font-black text-main">{selectedUser.name}</div>
                                            <div className="text-xs font-bold text-muted">{selectedUser.email || '-'}</div>
                                        </div>
                                        <button onClick={() => openEdit(selectedUser)} className="rounded-lg bg-primary px-3 py-2 text-xs font-black text-white">{isAr ? 'تعديل' : 'Edit'}</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <InfoPill label={isAr ? 'الدور' : 'Role'} value={roleLabel(String(selectedUser.role))} />
                                        <InfoPill label={isAr ? 'الفرع' : 'Branch'} value={branchName(selectedUser.assignedBranchId)} />
                                        <InfoPill label={isAr ? 'فروع مسموحة' : 'Allowed'} value={String(selectedUser.allowedBranches?.length || 0)} />
                                        <InfoPill label="MFA" value={selectedUser.mfaEnabled ? 'ON' : 'OFF'} />
                                    </div>
                                    <div>
                                        <div className="mb-2 flex items-center gap-2 text-xs font-black text-main"><Layers size={14} /> {isAr ? 'صلاحيات المستخدم' : 'User permissions'}</div>
                                        <div className="max-h-[420px] space-y-3 overflow-auto pe-1">
                                            {categories.map((cat) => {
                                                const perms = allPermissions.filter((p) => p.startsWith(`${cat.key}_`));
                                                return (
                                                    <div key={cat.key}>
                                                        <div className={`mb-1 inline-flex rounded-md px-2 py-1 text-[11px] font-black ${cat.bg} ${cat.color}`}>{isAr ? cat.ar : cat.en}</div>
                                                        <div className="grid gap-1">
                                                            {perms.map((perm) => {
                                                                const on = selectedUser.permissions?.includes(perm);
                                                                return (
                                                                    <button key={perm} onClick={() => toggleUserPermission(perm)}
                                                                        className={`flex items-center justify-between rounded-md border px-2 py-2 text-start text-[11px] font-bold transition ${on ? 'border-primary/30 bg-primary/8 text-main' : 'border-border/50 text-muted hover:border-primary/30'}`}>
                                                                        <span>{permName(perm)}</span>
                                                                        {on && <Check size={13} className="text-primary" />}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : <Empty title={isAr ? 'لا يوجد مستخدم محدد' : 'No selected user'} />}
                        </aside>
                    </main>
                )}

                {tab === 'roles' && (
                    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {roleRows.map((role) => (
                            <button key={role.id} onClick={() => { setTab('matrix'); setMatrixRole(role.name); }}
                                className="rounded-lg border border-border/60 bg-card p-4 text-start transition hover:border-primary/40 hover:bg-elevated/30">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="font-black text-main">{isAr ? role.nameAr || arRole[role.name] || role.name : role.name}</div>
                                        <div className="mt-1 text-xs font-bold text-muted">{role.permissions.length} {isAr ? 'صلاحية' : 'permissions'}</div>
                                    </div>
                                    <span className={`rounded-md px-2 py-1 text-[10px] font-black ${role.isSystem ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                        {role.isSystem ? (isAr ? 'نظام' : 'System') : (isAr ? 'مخصص' : 'Custom')}
                                    </span>
                                </div>
                                <div className="mt-4 flex items-center gap-2 text-xs font-black text-primary">
                                    {isAr ? 'إدارة الصلاحيات' : 'Manage permissions'} <ChevronRight size={14} />
                                </div>
                            </button>
                        ))}
                    </section>
                )}

                {tab === 'matrix' && (
                    <section className="rounded-lg border border-border/60 bg-card">
                        <div className="flex flex-col gap-3 border-b border-border/60 p-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <div className="text-lg font-black text-main">{isAr ? 'مصفوفة صلاحيات الدور' : 'Role permission matrix'}</div>
                                <div className="text-xs font-bold text-muted">{isAr ? 'أي تعديل هنا يطبق كصلاحيات افتراضية للدور.' : 'Changes here update role defaults.'}</div>
                            </div>
                            <div className="flex gap-2">
                                <select value={matrixRole} onChange={(e) => setMatrixRole(e.target.value)}
                                    className="h-10 rounded-lg border border-border bg-app px-3 text-xs font-black text-main outline-none">
                                    {roleRows.map((role) => <option key={role.id} value={role.name}>{roleLabel(role.name)}</option>)}
                                </select>
                                <button disabled={busy} onClick={saveMatrix} className="rounded-lg bg-primary px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                                    <Save size={14} className="inline align-[-2px]" /> {isAr ? 'حفظ' : 'Save'}
                                </button>
                            </div>
                        </div>
                        <div className="grid gap-3 p-4 lg:grid-cols-4">
                            {categories.map((cat) => (
                                <div key={cat.key} className="rounded-lg border border-border/50 p-3">
                                    <div className={`mb-3 rounded-md px-2 py-2 text-xs font-black ${cat.bg} ${cat.color}`}>{isAr ? cat.ar : cat.en}</div>
                                    <div className="space-y-1">
                                        {allPermissions.filter((p) => p.startsWith(`${cat.key}_`)).map((perm) => {
                                            const on = matrixPerms.includes(perm);
                                            return (
                                                <button key={perm} onClick={() => setMatrixPerms((prev) => on ? prev.filter((p) => p !== perm) : [...prev, perm])}
                                                    className={`flex w-full items-center justify-between rounded-md border px-2 py-2 text-start text-[11px] font-bold transition ${on ? 'border-primary/30 bg-primary/8 text-main' : 'border-border/40 text-muted'}`}>
                                                    <span>{permName(perm)}</span>
                                                    {on && <Check size={13} className="text-primary" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {tab === 'sessions' && (
                    <DataList rows={sessions} empty={isAr ? 'لا توجد جلسات نشطة' : 'No active sessions'}
                        render={(row) => (
                            <>
                                <div className="font-black text-main">{row.userName || row.userId}</div>
                                <div className="text-xs font-bold text-muted">{row.deviceName || row.userAgent || '-'}</div>
                                <div className="text-xs font-bold text-muted">{row.ipAddress || '-'}</div>
                                <div className="text-xs font-bold text-muted">{row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : '-'}</div>
                            </>
                        )} />
                )}

                {tab === 'audit' && (
                    <DataList rows={audit} empty={isAr ? 'لا يوجد سجل تغييرات' : 'No audit events'}
                        render={(row) => (
                            <>
                                <div className="font-black text-main">{row.event_type}</div>
                                <div className="text-xs font-bold text-muted">{row.actor_name || row.actor_id || 'system'}</div>
                                <div className="text-xs font-bold text-muted">{row.reason || '-'}</div>
                                <div className="text-xs font-bold text-muted">{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</div>
                            </>
                        )} />
                )}

                {tab === 'security' && (
                    <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
                        <aside className="rounded-lg border border-border/60 bg-card p-4">
                            <div className="mb-3 text-sm font-black text-main">{isAr ? 'المستخدم المحدد' : 'Selected user'}</div>
                            {selectedUser ? (
                                <div className="space-y-2">
                                    <div className="text-xl font-black text-main">{selectedUser.name}</div>
                                    <div className="text-xs font-bold text-muted">{roleLabel(String(selectedUser.role))}</div>
                                    <select value={selectedUser.id} onChange={(e) => setSelectedId(e.target.value)}
                                        className="mt-3 h-10 w-full rounded-lg border border-border bg-app px-3 text-xs font-black text-main outline-none">
                                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                </div>
                            ) : <Empty title={isAr ? 'اختار مستخدم' : 'Select user'} />}
                        </aside>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <Action title={isAr ? 'إنهاء كل الجلسات' : 'Revoke sessions'} icon={Monitor} onClick={() => securityAction('revoke')} />
                            <Action title={isAr ? 'إعادة ضبط MFA' : 'Reset MFA'} icon={ShieldCheck} onClick={() => securityAction('mfa')} />
                            <Action title={isAr ? 'تغيير PIN' : 'Reset PIN'} icon={KeyRound} onClick={() => securityAction('pin')} />
                            <Action title={isAr ? 'تغيير كلمة المرور' : 'Reset password'} icon={LockKeyhole} onClick={() => securityAction('password')} />
                            <Action title={selectedUser?.isActive === false ? (isAr ? 'تفعيل الحساب' : 'Activate account') : (isAr ? 'تعطيل الحساب' : 'Disable account')} icon={Ban} onClick={() => securityAction('toggle')} danger={selectedUser?.isActive !== false} />
                            <Action title={isAr ? 'تحديث بيانات الأمان' : 'Refresh security data'} icon={RefreshCw} onClick={refreshAdvanced} />
                        </div>
                    </section>
                )}
            </div>

            {formOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" onClick={() => setFormOpen(false)}>
                    <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card p-4">
                            <div className="font-black text-main">{form.id && users.some((u) => u.id === form.id) ? (isAr ? 'تعديل مستخدم' : 'Edit user') : (isAr ? 'مستخدم جديد' : 'New user')}</div>
                            <button onClick={() => setFormOpen(false)} className="rounded-md border border-border p-2"><X size={16} /></button>
                        </div>
                        <div className="grid gap-4 p-4 md:grid-cols-2">
                            <Field label={isAr ? 'الاسم' : 'Name'} value={form.name || ''} onChange={(v) => setForm({ ...form, name: v })} />
                            <Field label={isAr ? 'البريد' : 'Email'} value={form.email || ''} onChange={(v) => setForm({ ...form, email: v })} />
                            <Field label={isAr ? 'كلمة المرور' : 'Password'} type="password" value={form.password || ''} onChange={(v) => setForm({ ...form, password: v })} />
                            <Field label="PIN" value={form.pin || ''} onChange={(v) => setForm({ ...form, pin: v.replace(/\D/g, '').slice(0, 6) })} />
                            <label className="space-y-1">
                                <span className="text-[11px] font-black text-muted">{isAr ? 'الدور' : 'Role'}</span>
                                <select value={String(form.role || UserRole.CASHIER)} onChange={(e) => setForm({ ...form, role: e.target.value, permissions: rolePermissions(e.target.value) })}
                                    className="h-11 w-full rounded-lg border border-border bg-app px-3 text-sm font-bold text-main outline-none focus:border-primary/50">
                                    {roleRows.map((role) => <option key={role.id} value={role.name}>{roleLabel(role.name)}</option>)}
                                </select>
                            </label>
                            <label className="space-y-1">
                                <span className="text-[11px] font-black text-muted">{isAr ? 'الفرع الافتراضي' : 'Default branch'}</span>
                                <select value={form.assignedBranchId || ''} onChange={(e) => setForm({ ...form, assignedBranchId: e.target.value, allowedBranches: [e.target.value] })}
                                    className="h-11 w-full rounded-lg border border-border bg-app px-3 text-sm font-bold text-main outline-none focus:border-primary/50">
                                    <option value="">{isAr ? 'بدون فرع' : 'No branch'}</option>
                                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </label>
                            <label className="flex items-center gap-3 rounded-lg border border-border bg-app p-3 text-sm font-black text-main">
                                <input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                                {isAr ? 'الحساب نشط' : 'Active account'}
                            </label>
                            <div className="md:col-span-2">
                                <div className="mb-2 text-[11px] font-black text-muted">{isAr ? 'الفروع المسموحة' : 'Allowed branches'}</div>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {branches.map((branch) => {
                                        const on = form.allowedBranches?.includes(branch.id);
                                        return (
                                            <button key={branch.id} type="button" onClick={() => {
                                                const current = form.allowedBranches || [];
                                                const next = on ? current.filter((id) => id !== branch.id) : [...current, branch.id];
                                                setForm({ ...form, allowedBranches: next, assignedBranchId: form.assignedBranchId || next[0] });
                                            }} className={`rounded-lg border px-3 py-2 text-start text-xs font-black ${on ? 'border-primary/40 bg-primary/8 text-main' : 'border-border text-muted'}`}>
                                                {on && <Check size={13} className="inline text-primary" />} {branch.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card p-4">
                            <button onClick={() => setFormOpen(false)} className="rounded-lg border border-border px-4 py-2 text-xs font-black text-main">{isAr ? 'إلغاء' : 'Cancel'}</button>
                            <button disabled={busy} onClick={saveForm} className="rounded-lg bg-primary px-5 py-2 text-xs font-black text-white disabled:opacity-50">
                                <Save size={14} className="inline align-[-2px]" /> {isAr ? 'حفظ' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {credentialReset && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && setCredentialReset(null)}>
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                            <div>
                                <h3 className="text-lg font-black text-main">
                                    {credentialReset === 'pin' ? (isAr ? 'تعيين PIN جديد' : 'Set new PIN') : (isAr ? 'تعيين كلمة مرور جديدة' : 'Set new password')}
                                </h3>
                                <p className="mt-1 text-xs font-bold text-muted">
                                    {credentialReset === 'pin' ? (isAr ? 'اتركه فارغا لمسح PIN.' : 'Leave blank to clear PIN.') : (isAr ? 'الحد الأدنى 6 أحرف.' : 'Minimum 6 characters.')}
                                </p>
                            </div>
                            <button onClick={() => setCredentialReset(null)} disabled={busy} className="p-2 text-muted hover:text-main disabled:opacity-50"><X size={18} /></button>
                        </div>
                        <div className="p-5">
                            <input
                                value={credentialValue}
                                onChange={(e) => setCredentialValue(credentialReset === 'pin' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
                                type={credentialReset === 'password' ? 'password' : 'text'}
                                autoFocus
                                className="h-12 w-full rounded-xl border border-border bg-app px-4 text-sm font-black text-main outline-none focus:border-primary"
                            />
                        </div>
                        <div className="flex gap-3 border-t border-border p-4">
                            <button onClick={() => setCredentialReset(null)} disabled={busy} className="flex-1 rounded-xl border border-border bg-app py-3 text-xs font-black text-muted disabled:opacity-50">{isAr ? 'إلغاء' : 'Cancel'}</button>
                            <button onClick={submitCredentialReset} disabled={busy || (credentialReset === 'password' && credentialValue.trim().length < 6)} className="flex-1 rounded-xl bg-primary py-3 text-xs font-black text-white disabled:opacity-50">{isAr ? 'حفظ' : 'Save'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const Field = ({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) => (
    <label className="space-y-1">
        <span className="text-[11px] font-black text-muted">{label}</span>
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
            className="h-11 w-full rounded-lg border border-border bg-app px-3 text-sm font-bold text-main outline-none focus:border-primary/50" />
    </label>
);

const InfoPill = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-lg border border-border/50 bg-app p-3">
        <div className="text-[10px] font-black text-muted">{label}</div>
        <div className="mt-1 truncate font-black text-main">{value}</div>
    </div>
);

const Empty = ({ title }: { title: string }) => (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm font-black text-muted">{title}</div>
);

const DataList = ({ rows, render, empty }: { rows: any[]; empty: string; render: (row: any) => React.ReactNode }) => (
    <section className="rounded-lg border border-border/60 bg-card">
        {rows.length ? rows.map((row, index) => (
            <div key={row.id || index} className="grid gap-2 border-b border-border/40 p-4 last:border-b-0 md:grid-cols-4">
                {render(row)}
            </div>
        )) : <Empty title={empty} />}
    </section>
);

const Action = ({ title, icon: Icon, onClick, danger }: { title: string; icon: React.ElementType; onClick: () => void; danger?: boolean }) => (
    <button onClick={onClick}
        className={`rounded-lg border bg-card p-5 text-start transition hover:-translate-y-0.5 ${danger ? 'border-rose-500/30 hover:bg-rose-500/5' : 'border-border/60 hover:border-primary/40 hover:bg-elevated/30'}`}>
        <Icon size={22} className={danger ? 'text-rose-500' : 'text-primary'} />
        <div className="mt-4 text-sm font-black text-main">{title}</div>
        <SlidersHorizontal size={14} className="mt-3 text-muted" />
    </button>
);

export default UserManagement;
