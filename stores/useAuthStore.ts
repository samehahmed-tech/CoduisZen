// Auth Store - Connected to Database API (Production Ready)
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, AppSettings, AppPermission, UserRole, INITIAL_ROLE_PERMISSIONS, Branch, Printer, CustomRole } from '../types';
import { rolesApi } from '../services/api/roles';
import { printersApi } from '../services/api/printers';
import { authApi } from '../services/api/auth';
import { usersApi } from '../services/api/users';
import { branchesApi } from '../services/api/branches';
import { settingsApi } from '../services/api/settings';
import { localDb } from '../db/localDb';
import { syncService } from '../services/syncService';
import i18n from '../src/i18n';

export type LoginMode = 'pin' | 'password';

interface DbRole {
    id: string;
    name: string;
    nameAr: string | null;
    permissions: string[];
    isSystem: boolean;
    priority: number;
    color: string;
    icon: string;
}

interface AuthState {
    settings: AppSettings;
    branches: Branch[];
    printers: Printer[];
    users: User[];
    roles: DbRole[];
    rolesLoaded: boolean;
    branchId?: string;
    isAuthenticated: boolean;
    token: string | null;
    isSidebarCollapsed: boolean;
    isLoading: boolean;
    error: string | null;

    // Async Actions (API)
    loginWithPassword: (email: string, password: string) => Promise<User>;
    restoreSession: () => Promise<void>;
    fetchUsers: () => Promise<void>;
    fetchBranches: () => Promise<void>;
    fetchSettings: () => Promise<void>;
    loadRoles: () => Promise<void>;
    fetchPrinters: () => Promise<void>;
    createUser: (user: User) => Promise<void>;
    updateUserInDB: (user: User) => Promise<void>;
    deleteUserFromDB: (id: string) => Promise<void>;
    createPrinterInDB: (printer: Printer) => Promise<void>;
    updatePrinterInDB: (printer: Printer) => Promise<void>;
    deletePrinterFromDB: (id: string) => Promise<void>;
    heartbeatPrinterInDB: (id: string) => Promise<boolean>;
    createBranch: (branch: Branch) => Promise<void>;
    syncToDatabase: () => Promise<void>;

    // Local Actions
    login: (user: User) => void;
    logout: () => void;
    updateSettings: (settings: Partial<AppSettings>) => void;
    hasPermission: (permission: AppPermission) => boolean;
    setActiveBranch: (branchId: string) => void;
    setBranches: (branches: Branch[]) => void;
    setPrinters: (printers: Printer[]) => void;
    updateUsers: (users: User[]) => void;
    updatePrinters: (printers: Printer[]) => void;
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    clearError: () => void;

    // Role Management
    createCustomRole: (id: string, name: string, nameAr: string, permissions: AppPermission[]) => Promise<void> | void;
    updateCustomRole: (id: string, name: string, nameAr: string, permissions: AppPermission[]) => Promise<void> | void;
    deleteCustomRole: (id: string) => Promise<void> | void;
    saveRolePermissions: (roleId: string, permissions: AppPermission[]) => Promise<void> | void;
}

const DEFAULT_SETTINGS: AppSettings = {
    restaurantName: 'Coduis Zen',
    currency: 'EGP',
    currencySymbol: 'ج.م',
    taxRate: 14,
    serviceCharge: 0,
    language: 'ar',
    isDarkMode: true,
    isTouchMode: false,
    theme: 'mica-glass',
    accentColor: '#6366f1',
    branchAddress: '',
    phone: '',
    receiptLogoUrl: '',
    receiptQrUrl: '',
    receiptBrandingByOrderType: {},
    primaryCashierPrinterId: '',
    cashierReceiptCopies: 1,
    autoPrintReceiptOnSubmit: false,
    autoPrintCompletionReceipt: true,
    autoPrintReports: true,
    currentUser: undefined,
    activeBranchId: undefined,
    syncAuthority: 'SERVER',
    branchHierarchy: { id: 'central', level: 'MASTER' },
    customRoles: [],
    rolePermissionOverrides: {},
    endOfDayEmailEnabled: false,
    endOfDayEmailRecipients: [],
};

// Only keep ONE admin user for first login - rest comes from database
const INITIAL_USERS: User[] = [
    { id: 'u1', name: 'مدير النظام', email: 'admin@coduiszen.com', role: UserRole.SUPER_ADMIN, permissions: INITIAL_ROLE_PERMISSIONS[UserRole.SUPER_ADMIN], isActive: true },
];

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            settings: DEFAULT_SETTINGS,
            branches: [], // Empty - loads from database
            printers: [],
            users: INITIAL_USERS,
            roles: [],
            rolesLoaded: false,
            branchId: DEFAULT_SETTINGS.activeBranchId,
            isAuthenticated: false,
            token: null,
            isSidebarCollapsed: false,
            isLoading: false,
            error: null,

            // ============ API Actions ============

            loginWithPassword: async (email, password) => {
                set({ isLoading: true, error: null });
                try {
                    const deviceName = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown-device';
                    const result = await authApi.login(email, password, deviceName);
                    if (result.mfaRequired && result.mfaToken) {
                        const mfaErr: any = new Error('MFA_REQUIRED');
                        mfaErr.code = 'MFA_REQUIRED';
                        mfaErr.mfaToken = result.mfaToken;
                        throw mfaErr;
                    }
                    if (!result.token || !result.user) {
                        throw new Error('INVALID_AUTH_RESPONSE');
                    }
                    const { token, refreshToken, user } = result;

                    if (token) {
                        localStorage.setItem('auth_token', token);
                    }
                    if (refreshToken) {
                        localStorage.setItem('auth_refresh_token', refreshToken);
                    }

                    const mappedUser: User = {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        permissions: user.permissions || INITIAL_ROLE_PERMISSIONS[user.role as UserRole] || [],
                        isActive: user.isActive !== false,
                        assignedBranchId: user.assignedBranchId,
                        allowedBranches: user.allowedBranches || [],
                        defaultPage: user.defaultPage,
                        mfaEnabled: user.mfaEnabled === true,
                    };

                    set((state) => ({
                        token,
                        settings: { ...state.settings, currentUser: mappedUser, activeBranchId: mappedUser.assignedBranchId || state.branches[0]?.id },
                        isAuthenticated: true,
                        isLoading: false
                    }));
                    syncService.syncPending();
                    return mappedUser;
                } catch (error: any) {
                    set({ error: error.message || 'Login failed', isLoading: false });
                    throw error;
                }
            },

            restoreSession: async () => {
                const token = localStorage.getItem('auth_token');
                if (!token) return;
                try {
                    const { user } = await authApi.me();
                    const mappedUser: User = {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        permissions: user.permissions || INITIAL_ROLE_PERMISSIONS[user.role as UserRole] || [],
                        isActive: user.isActive !== false,
                        assignedBranchId: user.assignedBranchId,
                        allowedBranches: user.allowedBranches || [],
                        defaultPage: user.defaultPage,
                        mfaEnabled: user.mfaEnabled === true,
                    };
                    set((state) => ({
                        token,
                        settings: { ...state.settings, currentUser: mappedUser, activeBranchId: mappedUser.assignedBranchId || state.branches[0]?.id },
                        isAuthenticated: true
                    }));
                } catch {
                    const cachedUser = get().settings.currentUser;
                    // Offline fallback only: keep cached session when backend is unreachable and user was previously restored.
                    if (!navigator.onLine && cachedUser) {
                        set((state) => ({
                            token,
                            settings: { ...state.settings, currentUser: cachedUser, activeBranchId: cachedUser.assignedBranchId || state.branches[0]?.id },
                            isAuthenticated: true
                        }));
                    } else {
                        localStorage.removeItem('auth_token');
                        set((state) => ({
                            token: null,
                            isAuthenticated: false,
                            settings: {
                                ...state.settings,
                                currentUser: undefined,
                                activeBranchId: undefined,
                            },
                        }));
                    }
                }
            },

            fetchUsers: async () => {
                set({ isLoading: true });
                try {
                    if (navigator.onLine) {
                        const data = await usersApi.getAll();
                        if (data.length > 0) {
                            const users = data.map((u: any) => ({
                                id: u.id,
                                name: u.name,
                                email: u.email || '',
                                role: u.role as UserRole,
                                permissions: u.permissions || INITIAL_ROLE_PERMISSIONS[u.role as UserRole] || [],
                                isActive: u.is_active !== false && u.isActive !== false,
                                assignedBranchId: u.assigned_branch_id || u.assignedBranchId,
                                allowedBranches: u.allowed_branches || u.allowedBranches || [],
                                mfaEnabled: u.mfa_enabled === true || u.mfaEnabled === true,
                                employeeCode: u.employeeCode || u.employee_code,
                                attendanceCode: u.attendanceCode || u.attendance_code,
                            }));
                            set({ users, isLoading: false });
                            await localDb.users.bulkPut(users);
                        } else {
                            set({ isLoading: false });
                        }
                    } else {
                        const cached = await localDb.users.toArray();
                        if (cached.length > 0) set({ users: cached as User[], isLoading: false });
                        else set({ isLoading: false });
                    }
                } catch (error: any) {
                    set({ isLoading: false });
                    const code = String(error?.code || error?.message || '').toUpperCase();
                    if (code.includes('INVALID_TOKEN') || code.includes('FORBIDDEN') || [401, 403].includes(Number(error?.status))) return;
                    set({ error: error?.code || error?.message || 'FETCH_USERS_FAILED' });
                }
            },

            fetchBranches: async () => {
                try {
                    if (navigator.onLine) {
                        const data = await branchesApi.getAll();
                        if (data.length > 0) {
                            const branches = data.map((b: any) => ({
                                id: b.id,
                                name: b.name,
                                location: b.location || b.address,
                                address: b.address,
                                phone: b.phone,
                                isActive: b.is_active !== false,
                            }));
                            set((state) => {
                                const currentActive = state.settings.activeBranchId;
                                const assignedBranchId = state.settings.currentUser?.assignedBranchId;
                                const activeStillExists = currentActive && branches.some((branch) => branch.id === currentActive);
                                const fallbackBranchId =
                                    branches.find((branch) => branch.id === assignedBranchId)?.id ||
                                    branches.find((branch) => branch.isActive !== false)?.id ||
                                    branches[0]?.id;

                                return {
                                    branches,
                                    settings: {
                                        ...state.settings,
                                        activeBranchId: activeStillExists ? currentActive : fallbackBranchId,
                                    },
                                };
                            });
                            await localDb.branches.bulkPut(branches as any[]);
                        }
                    } else {
                        const cached = await localDb.branches.toArray();
                        if (cached.length > 0) {
                            const cachedBranches = cached as Branch[];
                            set((state) => {
                                const currentActive = state.settings.activeBranchId;
                                const assignedBranchId = state.settings.currentUser?.assignedBranchId;
                                const activeStillExists = currentActive && cachedBranches.some((branch) => branch.id === currentActive);
                                const fallbackBranchId =
                                    cachedBranches.find((branch) => branch.id === assignedBranchId)?.id ||
                                    cachedBranches.find((branch) => branch.isActive !== false)?.id ||
                                    cachedBranches[0]?.id;

                                return {
                                    branches: cachedBranches,
                                    settings: {
                                        ...state.settings,
                                        activeBranchId: activeStillExists ? currentActive : fallbackBranchId,
                                    },
                                };
                            });
                        }
                    }
                } catch (error) {
                    const code = String((error as any)?.code || (error as any)?.message || '').toUpperCase();
                    if (code.includes('INVALID_TOKEN') || Number((error as any)?.status) === 401) return;
                    set({ error: (error as any)?.code || (error as any)?.message || 'FETCH_BRANCHES_FAILED' });
                }
            },

            loadRoles: async () => {
                try {
                    if (navigator.onLine) {
                        const data = await rolesApi.getAll();
                        if (Array.isArray(data) && data.length > 0) {
                            set({ roles: data as any, rolesLoaded: true });
                        }
                    }
                } catch (error) {
                    const code = String((error as any)?.code || (error as any)?.message || '').toUpperCase();
                    if (code.includes('INVALID_TOKEN') || Number((error as any)?.status) === 401) return;
                    set({ error: (error as any)?.code || (error as any)?.message || 'FETCH_ROLES_FAILED' });
                }
            },

            fetchSettings: async () => {
                try {
                    if (navigator.onLine) {
                        const data = await settingsApi.getAll();
                        if (Object.keys(data).length > 0) {
                            set((state) => ({
                                settings: {
                                    ...state.settings,
                                    restaurantName: data.restaurantName || state.settings.restaurantName,
                                    phone: data.phone || state.settings.phone,
                                    branchAddress: data.branchAddress || state.settings.branchAddress,
                                    receiptLogoUrl: data.receiptLogoUrl || state.settings.receiptLogoUrl,
                                    receiptQrUrl: data.receiptQrUrl || state.settings.receiptQrUrl,
                                     receiptBrandingByOrderType: data.receiptBrandingByOrderType || state.settings.receiptBrandingByOrderType,
                                     primaryCashierPrinterId: data.primaryCashierPrinterId || state.settings.primaryCashierPrinterId,
                                     cashierReceiptCopies: data.cashierReceiptCopies ?? state.settings.cashierReceiptCopies,
                                     autoPrintReceipt: data.autoPrintReceipt ?? state.settings.autoPrintReceipt,
                                    autoPrintReceiptOnSubmit: data.autoPrintReceiptOnSubmit ?? state.settings.autoPrintReceiptOnSubmit,
                                    autoPrintCompletionReceipt: data.autoPrintCompletionReceipt ?? state.settings.autoPrintCompletionReceipt,
                                    autoPrintReports: data.autoPrintReports ?? state.settings.autoPrintReports,
                                    currency: data.currency || state.settings.currency,
                                    taxRate: data.taxRate ?? state.settings.taxRate,
                                    serviceCharge: data.serviceCharge ?? state.settings.serviceCharge,
                                    language: data.language || state.settings.language,
                                    isDarkMode: data.isDarkMode ?? state.settings.isDarkMode,
                                    theme: data.theme || state.settings.theme,
                                    currencySymbol: data.currencySymbol || state.settings.currencySymbol,
                                    isTouchMode: data.isTouchMode ?? state.settings.isTouchMode,
                                    customRoles: data.customRoles ?? state.settings.customRoles,
                                    rolePermissionOverrides: data.rolePermissionOverrides ?? state.settings.rolePermissionOverrides,
                                    endOfDayEmailEnabled: data.endOfDayEmailEnabled ?? state.settings.endOfDayEmailEnabled,
                                    endOfDayEmailRecipients: data.endOfDayEmailRecipients ?? state.settings.endOfDayEmailRecipients,
                                }
                            }));
                            await localDb.settings.put({ key: 'app', value: data, updatedAt: Date.now() });
                        }
                    } else {
                        const cached = await localDb.settings.get('app');
                        if (cached?.value) {
                            const data = cached.value;
                            set((state) => ({
                                settings: {
                                    ...state.settings,
                                    restaurantName: data.restaurantName || state.settings.restaurantName,
                                    phone: data.phone || state.settings.phone,
                                    branchAddress: data.branchAddress || state.settings.branchAddress,
                                    receiptLogoUrl: data.receiptLogoUrl || state.settings.receiptLogoUrl,
                                    receiptQrUrl: data.receiptQrUrl || state.settings.receiptQrUrl,
                                     receiptBrandingByOrderType: data.receiptBrandingByOrderType || state.settings.receiptBrandingByOrderType,
                                     primaryCashierPrinterId: data.primaryCashierPrinterId || state.settings.primaryCashierPrinterId,
                                     cashierReceiptCopies: data.cashierReceiptCopies ?? state.settings.cashierReceiptCopies,
                                     autoPrintReceipt: data.autoPrintReceipt ?? state.settings.autoPrintReceipt,
                                    autoPrintReceiptOnSubmit: data.autoPrintReceiptOnSubmit ?? state.settings.autoPrintReceiptOnSubmit,
                                    autoPrintCompletionReceipt: data.autoPrintCompletionReceipt ?? state.settings.autoPrintCompletionReceipt,
                                    autoPrintReports: data.autoPrintReports ?? state.settings.autoPrintReports,
                                    currency: data.currency || state.settings.currency,
                                    taxRate: data.taxRate ?? state.settings.taxRate,
                                    serviceCharge: data.serviceCharge ?? state.settings.serviceCharge,
                                    language: data.language || state.settings.language,
                                    isDarkMode: data.isDarkMode ?? state.settings.isDarkMode,
                                    theme: data.theme || state.settings.theme,
                                    currencySymbol: data.currencySymbol || state.settings.currencySymbol,
                                    isTouchMode: data.isTouchMode ?? state.settings.isTouchMode,
                                    customRoles: data.customRoles ?? state.settings.customRoles,
                                    rolePermissionOverrides: data.rolePermissionOverrides ?? state.settings.rolePermissionOverrides,
                                }
                            }));
                        }
                    }
                } catch (error) {
                    const code = String((error as any)?.code || (error as any)?.message || '').toUpperCase();
                    if (code.includes('INVALID_TOKEN') || Number((error as any)?.status) === 401) return;
                    set({ error: (error as any)?.code || (error as any)?.message || 'FETCH_SETTINGS_FAILED' });
                }
            },

            fetchPrinters: async () => {
                try {
                    if (!navigator.onLine) return;
                    const data = await printersApi.getAll();
                    const printers = data.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        code: p.code || '',
                        type: p.type,
                        address: p.address || '',
                        isActive: p.is_active !== false,
                        branchId: p.branch_id || '',
                        role: p.role || 'OTHER',
                        roles: p.roles || [],
                        stationId: p.station_id || p.stationId || '',
                        gatewayId: p.gateway_id || p.gatewayId || '',
                        isPrimaryCashier: p.is_primary_cashier === true,
                        paperWidth: p.paper_width || p.paperWidth,
                        isOnline: String(p.heartbeat_status || '').toUpperCase() === 'OFFLINE' ? false : p.is_active !== false,
                        lastHeartbeatAt: p.last_heartbeat_at || undefined,
                    }));
                    set({ printers });
                } catch (error) {
                    const code = String((error as any)?.code || (error as any)?.message || '').toUpperCase();
                    if (code.includes('INVALID_TOKEN') || Number((error as any)?.status) === 401) return;
                    set({ error: (error as any)?.code || (error as any)?.message || 'FETCH_PRINTERS_FAILED' });
                }
            },

            createUser: async (user) => {
                set({ isLoading: true });
                try {
                    const payload: any = {
                        id: user.id,
                        name: user.name?.trim(),
                        role: user.role,
                        permissions: user.permissions,
                        allowedBranches: (user.allowedBranches || []).filter(Boolean),
                        is_active: user.isActive,
                    };
                    const email = user.email?.trim();
                    const assignedBranchId = user.assignedBranchId?.trim();
                    const password = (user as any).password?.trim();
                    const pin = (user as any).pin?.trim();
                    const phone = user.phone?.trim();
                    const nationalId = user.nationalId?.trim();
                    const employeeCode = user.employeeCode?.trim();
                    const attendanceCode = user.attendanceCode?.trim();
                    const employmentDate = user.employmentDate?.trim();
                    if (email) payload.email = email;
                    if (assignedBranchId) payload.assigned_branch_id = assignedBranchId;
                    if (password) payload.password = password;
                    if (pin) payload.pin = pin;
                    if (phone) payload.phone = phone;
                    if (nationalId) payload.nationalId = nationalId;
                    if (employeeCode) payload.employeeCode = employeeCode;
                    if (attendanceCode || employeeCode) payload.attendanceCode = attendanceCode || employeeCode;
                    if (employmentDate) payload.employmentDate = employmentDate;
                    if (user.salary) payload.salary = user.salary;

                    await usersApi.create({
                        ...payload,
                    });
                    set((state) => ({ users: [...state.users, user], isLoading: false }));
                } catch (error: any) {
                    set({ error: error.message, isLoading: false });
                    throw error;
                }
            },

            updateUserInDB: async (user) => {
                try {
                    const payload: any = {
                        name: user.name?.trim(),
                        role: user.role,
                        permissions: user.permissions,
                        allowedBranches: (user.allowedBranches || []).filter(Boolean),
                        is_active: user.isActive,
                    };
                    const email = user.email?.trim();
                    const assignedBranchId = user.assignedBranchId?.trim();
                    const phone = user.phone?.trim();
                    const nationalId = user.nationalId?.trim();
                    const employeeCode = user.employeeCode?.trim();
                    const attendanceCode = user.attendanceCode?.trim();
                    const employmentDate = user.employmentDate?.trim();
                    if (email) payload.email = email;
                    if (assignedBranchId) payload.assigned_branch_id = assignedBranchId;
                    if (phone) payload.phone = phone;
                    if (nationalId) payload.nationalId = nationalId;
                    if (employeeCode) payload.employeeCode = employeeCode;
                    if (attendanceCode || employeeCode) payload.attendanceCode = attendanceCode || employeeCode;
                    if (employmentDate) payload.employmentDate = employmentDate;
                    if (user.salary) payload.salary = user.salary;
                    await usersApi.update(user.id, {
                        ...payload,
                    });
                    set((state) => ({
                        users: state.users.map(u => u.id === user.id ? user : u)
                    }));
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'UPDATE_USER_FAILED' });
                    throw error;
                }
            },

            deleteUserFromDB: async (id) => {
                try {
                    await usersApi.delete(id);
                    set((state) => ({
                        users: state.users.filter(u => u.id !== id)
                    }));
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'DELETE_USER_FAILED' });
                    throw error;
                }
            },

            createPrinterInDB: async (printer) => {
                try {
                    const created = await printersApi.create({
                        id: printer.id,
                        name: printer.name,
                        code: printer.code,
                        type: printer.type,
                        address: printer.address,
                        branch_id: printer.branchId,
                        role: printer.role,
                        roles: printer.roles || (printer.role ? [printer.role] : []),
                        station_id: printer.stationId || '',
                        gateway_id: printer.gatewayId || '',
                        is_primary_cashier: printer.isPrimaryCashier === true,
                        is_active: printer.isActive,
                        paper_width: (printer as any).paperWidth,
                    });
                    const mapped: Printer = {
                        id: created.id,
                        name: created.name,
                        code: created.code || '',
                        type: created.type,
                        address: created.address || '',
                        isActive: created.is_active !== false,
                        branchId: created.branch_id || '',
                        role: created.role || 'OTHER',
                        roles: created.roles || [],
                        stationId: created.station_id || created.stationId || '',
                        gatewayId: created.gateway_id || created.gatewayId || '',
                        isPrimaryCashier: created.is_primary_cashier === true,
                        paperWidth: created.paper_width || created.paperWidth,
                        isOnline: String(created.heartbeat_status || '').toUpperCase() === 'OFFLINE' ? false : created.is_active !== false,
                        lastHeartbeatAt: created.last_heartbeat_at || undefined,
                    };
                    set((state) => ({ printers: [mapped, ...state.printers] }));
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'CREATE_PRINTER_FAILED' });
                    throw error;
                }
            },

            updatePrinterInDB: async (printer) => {
                try {
                    const updated = await printersApi.update(printer.id, {
                        name: printer.name,
                        code: printer.code,
                        type: printer.type,
                        address: printer.address,
                        branch_id: printer.branchId,
                        role: printer.role,
                        roles: printer.roles || (printer.role ? [printer.role] : []),
                        station_id: printer.stationId || '',
                        gateway_id: printer.gatewayId || '',
                        is_primary_cashier: printer.isPrimaryCashier === true,
                        is_active: printer.isActive,
                        paper_width: (printer as any).paperWidth,
                    });
                    const mapped: Printer = {
                        id: updated.id,
                        name: updated.name,
                        code: updated.code || '',
                        type: updated.type,
                        address: updated.address || '',
                        isActive: updated.is_active !== false,
                        branchId: updated.branch_id || '',
                        role: updated.role || 'OTHER',
                        roles: updated.roles || [],
                        stationId: updated.station_id || updated.stationId || '',
                        gatewayId: updated.gateway_id || updated.gatewayId || '',
                        isPrimaryCashier: updated.is_primary_cashier === true,
                        paperWidth: updated.paper_width || updated.paperWidth,
                        isOnline: String(updated.heartbeat_status || '').toUpperCase() === 'OFFLINE' ? false : updated.is_active !== false,
                        lastHeartbeatAt: updated.last_heartbeat_at || undefined,
                    };
                    set((state) => ({
                        printers: state.printers.map(p => p.id === mapped.id ? mapped : p)
                    }));
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'UPDATE_PRINTER_FAILED' });
                    throw error;
                }
            },

            deletePrinterFromDB: async (id) => {
                try {
                    await printersApi.delete(id);
                    set((state) => ({
                        printers: state.printers.filter(p => p.id !== id)
                    }));
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'DELETE_PRINTER_FAILED' });
                    throw error;
                }
            },

            heartbeatPrinterInDB: async (id) => {
                try {
                    const res = await printersApi.heartbeat(id);
                    const mapped: Printer = {
                        id: res.printer.id,
                        name: res.printer.name,
                        code: res.printer.code || '',
                        type: res.printer.type,
                        address: res.printer.address || '',
                        isActive: res.printer.is_active !== false,
                        branchId: res.printer.branch_id || '',
                        role: res.printer.role || 'OTHER',
                        roles: res.printer.roles || [],
                        stationId: res.printer.station_id || res.printer.stationId || '',
                        gatewayId: res.printer.gateway_id || res.printer.gatewayId || '',
                        isPrimaryCashier: res.printer.is_primary_cashier === true,
                        paperWidth: res.printer.paper_width || res.printer.paperWidth,
                        isOnline: res.online === true,
                        lastHeartbeatAt: res.printer.last_heartbeat_at || undefined,
                    };
                    set((state) => ({
                        printers: state.printers.map(p => p.id === mapped.id ? mapped : p)
                    }));
                    return Boolean(res.online);
                } catch (error: any) {
                    set({ error: error?.code || error?.message || 'PRINTER_HEARTBEAT_FAILED' });
                    return false;
                }
            },

            createBranch: async (branch) => {
                set({ isLoading: true });
                try {
                    if (navigator.onLine) {
                        await branchesApi.create({
                            id: branch.id,
                            name: branch.name,
                            location: branch.location,
                            address: branch.address,
                            phone: branch.phone,
                            is_active: branch.isActive,
                        });
                    } else {
                        await syncService.queue('branch', 'CREATE', {
                            id: branch.id,
                            name: branch.name,
                            location: branch.location,
                            address: branch.address,
                            phone: branch.phone,
                            is_active: branch.isActive,
                        });
                    }
                    set((state) => ({ branches: [...state.branches, branch], isLoading: false }));
                    await localDb.branches.put(branch as any);
                } catch (error: any) {
                    set({ error: error.message, isLoading: false });
                    throw error;
                }
            },

            syncToDatabase: async () => {
                await syncService.syncPending();
            },

            // ============ Local Actions ============

            login: (user: User) => set((state) => ({
                settings: { ...state.settings, currentUser: user, activeBranchId: user.assignedBranchId || state.branches[0]?.id },
                isAuthenticated: true
            })),

            logout: () => {
                authApi.logout().catch(() => undefined);
                localStorage.removeItem('auth_token');
                localStorage.removeItem('auth_refresh_token');
                set((state) => ({
                    settings: { ...state.settings, currentUser: undefined, activeBranchId: undefined },
                    isAuthenticated: false,
                    token: null
                }));
            },

            updateSettings: (newSettings) => {
                const oldSettings = get().settings;
                set((state) => ({
                    settings: { ...state.settings, ...newSettings }
                }));

                // i18n Sync
                if (newSettings.language && newSettings.language !== oldSettings.language) {
                    i18n.changeLanguage(newSettings.language);
                    document.documentElement.dir = newSettings.language === 'ar' ? 'rtl' : 'ltr';
                }

                // Sync to database in background
                if (navigator.onLine) {
                    settingsApi.updateBulk(newSettings).catch(() => undefined);
                } else {
                    syncService.queue('settingsBulk', 'UPDATE', newSettings).catch(() => undefined);
                }
                localDb.settings.put({ key: 'app', value: { ...get().settings, ...newSettings }, updatedAt: Date.now() }).catch(() => undefined);
            },

            setActiveBranch: (branchId) => set((state) => ({
                settings: { ...state.settings, activeBranchId: branchId }
            })),

            setBranches: (branches) => set({ branches }),
            setPrinters: (printers) => set({ printers }),
            updatePrinters: (printers) => set({ printers }),
            updateUsers: (users) => set({ users }),

            toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
            setSidebarCollapsed: (collapsed: boolean) => set({ isSidebarCollapsed: collapsed }),

            hasPermission: (permission) => {
                const s = get().settings;
                const user = s?.currentUser;
                const { roles } = get();
                const { customRoles = [], rolePermissionOverrides = {} } = s || {};

                if (!user) return false;
                if (user.role === UserRole.SUPER_ADMIN) return true;
                
                if (!permission) return true;
                
                const permStr = String(permission || '');
                if (!permStr) return true;

                if (user.customOverrides?.added?.includes(permission)) return true;
                if (user.customOverrides?.removed?.includes(permission)) return false;

                let curPerms: AppPermission[] = [];
                if (Array.isArray(user.permissions) && user.permissions.length > 0) {
                    curPerms = user.permissions;
                }
                else if (rolePermissionOverrides && rolePermissionOverrides[user.role]) {
                    curPerms = rolePermissionOverrides[user.role];
                }
                else if (roles && roles.length > 0) {
                    const dbRole = roles.find(r => r.id === user.role || r.name === user.role);
                    if (dbRole && Array.isArray(dbRole.permissions) && dbRole.permissions.length > 0) {
                        curPerms = dbRole.permissions as AppPermission[];
                    }
                }
                else if (customRoles && Array.isArray(customRoles)) {
                    const customRole = customRoles.find(r => r.id === user.role);
                    if (customRole) curPerms = customRole.permissions || [];
                }

                if (curPerms.length === 0 && user.role in INITIAL_ROLE_PERMISSIONS) {
                    curPerms = INITIAL_ROLE_PERMISSIONS[user.role as UserRole] || [];
                }

                return Array.isArray(curPerms) && curPerms.includes(permission);
            },

            clearError: () => set({ error: null }),

            // ============ Role Management ============
            createCustomRole: async (id, name, nameAr, permissions) => {
                const newRole: CustomRole = { id, name, nameAr, permissions };
                const state = get();

                if (navigator.onLine) {
                    try {
                        await rolesApi.create({ id, name, nameAr, permissions, isSystem: false });
                        await get().loadRoles();
                    } catch (err: any) {
                        const message = err?.code || err?.message || 'CREATE_ROLE_FAILED';
                        set({ error: message });
                        throw err;
                    }
                }

                state.updateSettings({ customRoles: [...(state.settings.customRoles || []), newRole] });
            },

            updateCustomRole: async (id, name, nameAr, permissions) => {
                const state = get();

                if (navigator.onLine) {
                    try {
                        await rolesApi.update(id, { name, nameAr, permissions: permissions as string[] });
                        await get().loadRoles();
                    } catch (err: any) {
                        const message = err?.code || err?.message || 'UPDATE_ROLE_FAILED';
                        set({ error: message });
                        throw err;
                    }
                }

                state.updateSettings({
                    customRoles: (state.settings.customRoles || []).map(r => r.id === id ? { ...r, name, nameAr, permissions } : r)
                });
            },

            deleteCustomRole: async (id) => {
                const state = get();

                if (navigator.onLine) {
                    try {
                        await rolesApi.delete(id);
                        await get().loadRoles();
                    } catch (err: any) {
                        const message = err?.code || err?.message || 'DELETE_ROLE_FAILED';
                        set({ error: message });
                        throw err;
                    }
                }

                state.updateSettings({
                    customRoles: (state.settings.customRoles || []).filter(r => r.id !== id),
                    rolePermissionOverrides: Object.fromEntries(
                        Object.entries(state.settings.rolePermissionOverrides || {}).filter(([k]) => k !== id)
                    )
                });
            },

            saveRolePermissions: async (roleId, permissions) => {
                const state = get();
                const customRole = (state.settings.customRoles || []).find(r => r.id === roleId);

                if (navigator.onLine) {
                    try {
                        if (customRole) {
                            await rolesApi.update(roleId, { permissions: permissions as string[], name: customRole.name, nameAr: customRole.nameAr || '' });
                        } else {
                            const existing = state.roles.find(r => r.id === roleId || r.name === roleId);
                            if (existing) {
                                await rolesApi.update(existing.id, { permissions: permissions as string[] });
                            } else {
                                throw new Error('ROLE_NOT_FOUND');
                            }
                        }
                        await get().loadRoles();
                    } catch (err: any) {
                        const message = err?.code || err?.message || 'SAVE_ROLE_PERMISSIONS_FAILED';
                        set({ error: message });
                        throw err;
                    }
                }

                if (customRole) {
                    state.updateSettings({
                        customRoles: (state.settings.customRoles || []).map(r => r.id === roleId ? { ...r, permissions } : r)
                    });
                } else {
                    state.updateSettings({
                        rolePermissionOverrides: {
                            ...(state.settings.rolePermissionOverrides || {}),
                            [roleId]: permissions
                        }
                    });
                }
            },
        }),
        {
            name: 'coduis-zen-auth',
            partialize: (state) => ({
                settings: state.settings,
                isAuthenticated: state.isAuthenticated,
                isSidebarCollapsed: state.isSidebarCollapsed,
            }),
        }
    )
);
