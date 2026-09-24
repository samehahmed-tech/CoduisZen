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
import { resolveAvatar, setUserAvatar as persistUserAvatar, withLocalAvatars } from '../src/utils/userAvatars';

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

const mapApiPrinter = (printer: any): Printer => {
    const isActive = (printer.is_active ?? printer.isActive) !== false;
    const heartbeatStatus = String(printer.heartbeat_status ?? printer.heartbeatStatus ?? '').toUpperCase();
    return {
        id: printer.id,
        name: printer.name,
        code: printer.code || '',
        type: printer.type,
        address: printer.address || '',
        isActive,
        branchId: printer.branch_id ?? printer.branchId ?? '',
        role: printer.role || 'OTHER',
        roles: Array.isArray(printer.roles) ? printer.roles : [],
        stationId: printer.station_id ?? printer.stationId ?? '',
        gatewayId: printer.gateway_id ?? printer.gatewayId ?? '',
        isPrimaryCashier: (printer.is_primary_cashier ?? printer.isPrimaryCashier) === true,
        paperWidth: printer.paper_width ?? printer.paperWidth ?? 80,
        isOnline: heartbeatStatus === 'OFFLINE' ? false : isActive,
        lastHeartbeatAt: printer.last_heartbeat_at ?? printer.lastHeartbeatAt ?? undefined,
    };
};

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
    setUserAvatar: (userId: string, dataUrl: string | null) => void;
    logout: () => void;
    updateSettings: (settings: Partial<AppSettings>) => void;
    hasPermission: (permission: AppPermission) => boolean;
    setActiveBranch: (branchId: string) => void;
    setBranches: (branches: Branch[]) => void;
    setBranchBusinessDate: (branchId: string, businessDate: string) => void;
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
    layoutMode: 'classic',
    theme: 'aurora-glass',
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
    orderManualKitchenFlow: false,
    autoCompleteDirectOrders: false,
    autoPrintReports: true,
    currentUser: undefined,
    activeBranchId: undefined,
    syncAuthority: 'SERVER',
    branchHierarchy: { id: 'central', level: 'MASTER' },
    customRoles: [],
    rolePermissionOverrides: {},
    endOfDayEmailEnabled: false,
    endOfDayEmailRecipients: [],
    dayCloseRequireStockCount: true,
    dayCloseWhatsappRecipients: [],
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
                        avatar: resolveAvatar((user as any).avatar, user.id),
                    };

                    set((state) => ({
                        token,
                        settings: { ...state.settings, currentUser: mappedUser, activeBranchId: mappedUser.assignedBranchId || state.branches[0]?.id },
                        isAuthenticated: true,
                        isLoading: false
                    }));
                    syncService.init();
                    syncService.syncPending();
                    return mappedUser;
                } catch (error: any) {
                    set({ error: error.message || 'Login failed', isLoading: false });
                    throw error;
                }
            },

            restoreSession: async () => {
                const token = localStorage.getItem('auth_token');
                const refreshToken = localStorage.getItem('auth_refresh_token');
                if (!token && !refreshToken) return;
                // Cache-first: persisted settings/currentUser already hydrate
                // first paint — trust them and validate the token in the
                // background so boot never waits on a network roundtrip.
                // Only a proved-invalid session (401 / expired) logs out.
                const cached = get();
                if (cached.isAuthenticated && cached.settings.currentUser) {
                    void validateSession(token).catch(() => undefined);
                    return;
                }
                await validateSession(token);
                async function validateSession(activeToken: string | null) {
                try {
                    const { user } = await authApi.me();
                    const currentToken = localStorage.getItem('auth_token') || activeToken;
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
                        avatar: resolveAvatar((user as any).avatar, user.id),
                    };
                    set((state) => ({
                        token: currentToken,
                        settings: { ...state.settings, currentUser: mappedUser, activeBranchId: mappedUser.assignedBranchId || state.branches[0]?.id },
                        isAuthenticated: true
                    }));
                } catch (error: any) {
                    const cachedUser = get().settings.currentUser;
                    const status = Number(error?.status || 0);
                    const code = String(error?.code || error?.message || '').toUpperCase();
                    const sessionIsInvalid = status === 401
                        || code.includes('INVALID_TOKEN')
                        || code.includes('SESSION_EXPIRED')
                        || code.includes('USER_INACTIVE');
                    // An aborted reload or a temporary backend/network failure must not log out a valid cached session.
                    if (!sessionIsInvalid && cachedUser) {
                        set((state) => ({
                            token: localStorage.getItem('auth_token') || activeToken,
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
                                // Admin credential visibility (route is CFG_MANAGE_USERS-gated).
                                // PIN is stored plain server-side so it can be shown; password
                                // is a one-way bcrypt hash — only its presence is exposed.
                                pin: u.pinCode || u.pin || undefined,
                                hasPassword: u.hasPassword ?? undefined,
                                hasPin: u.hasPin ?? Boolean(u.pinCode || u.pinCodeHash),
                                avatar: resolveAvatar(u.avatar, u.id),
                            }));
                            set({ users: withLocalAvatars(users), isLoading: false });
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
                                nameAr: b.name_ar || b.nameAr,
                                location: b.location || b.address,
                                address: b.address,
                                phone: b.phone,
                                email: b.email,
                                serverIp: b.server_ip || b.serverIp,
                                dayCloseEmails: b.day_close_emails || b.dayCloseEmails || [],
                                isActive: b.is_active !== false,
                                timezone: b.timezone,
                                currency: b.currency,
                                taxRate: b.tax_rate ?? b.taxRate,
                                serviceCharge: b.service_charge ?? b.serviceCharge,
                                businessDate: b.business_date ?? b.businessDate,
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
                            if (Array.isArray(data.receiptTemplates)) {
                                localStorage.setItem('coduiszen_receipt_templates', JSON.stringify(data.receiptTemplates));
                            }
                            set((state) => ({
                                settings: {
                                    ...state.settings,
                                    restaurantName: data.restaurantName || state.settings.restaurantName,
                                    phone: data.phone || state.settings.phone,
                                    branchAddress: data.branchAddress || state.settings.branchAddress,
                                    receiptLogoUrl: data.receiptLogoUrl || state.settings.receiptLogoUrl,
                                    receiptQrUrl: data.receiptQrUrl || state.settings.receiptQrUrl,
                                     receiptBrandingByOrderType: data.receiptBrandingByOrderType || state.settings.receiptBrandingByOrderType,
                                     receiptTemplates: Array.isArray(data.receiptTemplates) ? data.receiptTemplates : state.settings.receiptTemplates,
                                     primaryCashierPrinterId: data.primaryCashierPrinterId || state.settings.primaryCashierPrinterId,
                                     cashierReceiptCopies: data.cashierReceiptCopies ?? state.settings.cashierReceiptCopies,
                                     autoPrintReceipt: data.autoPrintReceipt ?? state.settings.autoPrintReceipt,
                                    autoPrintReceiptOnSubmit: data.autoPrintReceiptOnSubmit ?? state.settings.autoPrintReceiptOnSubmit,
                                     autoPrintCompletionReceipt: data.autoPrintCompletionReceipt ?? state.settings.autoPrintCompletionReceipt,
                                     orderManualKitchenFlow: data.orderManualKitchenFlow ?? state.settings.orderManualKitchenFlow,
                                     autoCompleteDirectOrders: data.autoCompleteDirectOrders ?? state.settings.autoCompleteDirectOrders,
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
                                     dayCloseRequireStockCount: data.dayCloseRequireStockCount ?? state.settings.dayCloseRequireStockCount,
                                     dayCloseWhatsappRecipients: data.dayCloseWhatsappRecipients ?? state.settings.dayCloseWhatsappRecipients,
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
                                     orderManualKitchenFlow: data.orderManualKitchenFlow ?? state.settings.orderManualKitchenFlow,
                                     autoCompleteDirectOrders: data.autoCompleteDirectOrders ?? state.settings.autoCompleteDirectOrders,
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
                                     dayCloseRequireStockCount: data.dayCloseRequireStockCount ?? state.settings.dayCloseRequireStockCount,
                                     dayCloseWhatsappRecipients: data.dayCloseWhatsappRecipients ?? state.settings.dayCloseWhatsappRecipients,
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
                    const data = await printersApi.getAll({ active: true });
                    const printers = data.map(mapApiPrinter);
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
                    // Avatar is terminal-local until the server supports it — persist it
                    // alongside so the photo survives reloads and offline use.
                    if (user.avatar) persistUserAvatar(user.id, user.avatar);
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
                    const password = (user as any).password?.trim();
                    const pin = (user as any).pin?.trim();
                    if (email) payload.email = email;
                    if (assignedBranchId) payload.assigned_branch_id = assignedBranchId;
                    if (phone) payload.phone = phone;
                    if (nationalId) payload.nationalId = nationalId;
                    if (password) payload.password = password;
                    if (pin) payload.pin = pin;
                    if (employeeCode) payload.employeeCode = employeeCode;
                    if (attendanceCode || employeeCode) payload.attendanceCode = attendanceCode || employeeCode;
                    if (employmentDate) payload.employmentDate = employmentDate;
                    if (user.salary) payload.salary = user.salary;
                    await usersApi.update(user.id, {
                        ...payload,
                    });
                    // Avatar is terminal-local until the server supports it.
                    if (user.avatar) persistUserAvatar(user.id, user.avatar);
                    set((state) => {
                        const prev = state.users.find((u) => u.id === user.id);
                        const merged = { ...user, avatar: user.avatar ?? prev?.avatar };
                        return {
                            users: state.users.map((u) => (u.id === user.id ? merged : u)),
                            settings: state.settings.currentUser?.id === user.id
                                ? { ...state.settings, currentUser: { ...state.settings.currentUser, ...merged } }
                                : state.settings,
                        };
                    });
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
                    const mapped = mapApiPrinter(created);
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
                    const mapped = mapApiPrinter(updated);
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
                    const mapped = { ...mapApiPrinter(res.printer), isOnline: res.online === true };
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

            login: (user: User) => set((state) => {
                const withAvatar = {
                    ...user,
                    avatar: resolveAvatar((user as any).avatar, user.id),
                };
                return {
                    settings: { ...state.settings, currentUser: withAvatar, activeBranchId: withAvatar.assignedBranchId || state.branches[0]?.id },
                    isAuthenticated: true,
                };
            }),

            setUserAvatar: (userId: string, dataUrl: string | null) => {
                persistUserAvatar(userId, dataUrl);
                const avatar = dataUrl || undefined;
                set((state) => ({
                    users: state.users.map((u) => (u.id === userId ? { ...u, avatar } : u)),
                    settings: state.settings.currentUser?.id === userId
                        ? { ...state.settings, currentUser: { ...state.settings.currentUser, avatar } }
                        : state.settings,
                }));
                // Keep the offline cache in sync (best effort).
                const updated = get().users.find((u) => u.id === userId);
                if (updated) localDb.users.put(updated as any).catch(() => undefined);
            },

            logout: () => {
                if (localStorage.getItem('auth_token')) {
                    authApi.logout().catch(() => undefined);
                }
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
                if (Array.isArray(newSettings.receiptTemplates)) {
                    localStorage.setItem('coduiszen_receipt_templates', JSON.stringify(newSettings.receiptTemplates));
                }
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

            setActiveBranch: (branchId) => set((state) => {
                const user = state.settings.currentUser;
                const allowedBranchIds = new Set([
                    user?.assignedBranchId,
                    ...(user?.allowedBranches || []),
                ].filter(Boolean) as string[]);
                const isAllowed = user?.role === 'SUPER_ADMIN' || allowedBranchIds.has(branchId);
                if (!isAllowed || !state.branches.some((branch) => branch.id === branchId)) return state;
                return {
                    settings: { ...state.settings, activeBranchId: branchId },
                };
            }),

            setBranches: (branches) => set({ branches }),
            setBranchBusinessDate: (branchId, businessDate) => {
                set((state) => ({
                    branches: state.branches.map((branch) =>
                        branch.id === branchId ? { ...branch, businessDate } : branch
                    ),
                }));
                const branch = get().branches.find((item) => item.id === branchId);
                if (branch) void localDb.branches.put(branch as any);
            },
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

                // Staff mail is universal: every active user gets it even if their
                // stored permission snapshot predates NAV_MAIL (explicit removal above still wins).
                if (permission === AppPermission.NAV_MAIL) return true;

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
                const normId = String(roleId).startsWith('role_') ? String(roleId) : `role_${String(roleId).toLowerCase()}`;
                const normName = String(roleId).toUpperCase();

                if (navigator.onLine) {
                    let lastErr: any = null;
                    const tryUpdate = async (id: string) => {
                        await rolesApi.update(id, { permissions: permissions as string[] });
                    };
                    const tryCreate = async () => {
                        await rolesApi.create({ id: normId, name: normName, nameAr: customRole?.nameAr || normName, permissions: permissions as string[], isSystem: !customRole });
                    };
                    try {
                        if (customRole) {
                            await tryUpdate(roleId);
                        } else {
                            const existing = state.roles.find(r => r.id === roleId || r.name === roleId || r.id === normId || r.name === normName);
                            if (existing) {
                                await tryUpdate(existing.id);
                            } else {
                                // role not in local cache — try direct update by both id and name, then create
                                try { await tryUpdate(roleId); } catch (e: any) {
                                    const code = String(e?.code || e?.message || e?.error || '');
                                    const isNotFound = code.includes('ROLE_NOT_FOUND') || e?.status === 404;
                                    const isDup = code.includes('uq_roles_name') || code.includes('Violation of UNIQUE KEY') || code.includes('ROLE_ALREADY_EXISTS');
                                    if (isNotFound) {
                                        try { await tryCreate(); } catch (ce: any) {
                                            const cCode = String(ce?.code || ce?.message || ce?.error || '');
                                            const cDup = cCode.includes('ROLE_ALREADY_EXISTS') || cCode.includes('uq_roles_name') || cCode.includes('Violation of UNIQUE KEY') || ce?.status === 409;
                                            if (cDup) {
                                                // already exists (race) — just update it
                                                try { await tryUpdate(normId); } catch { await tryUpdate(normName); }
                                            } else throw ce;
                                        }
                                    } else if (isDup) {
                                        // update hit duplicate name (concurrent create) — update by normalized id
                                        try { await tryUpdate(normId); } catch { await tryUpdate(normName); }
                                    } else throw e;
                                }
                            }
                        }
                        await get().loadRoles();
                    } catch (err: any) {
                        // surface server's actual error, not generic
                        const serverMsg = err?.data?.error || err?.error || err?.code || err?.message || 'SAVE_ROLE_PERMISSIONS_FAILED';
                        const message = String(serverMsg);
                        set({ error: message });
                        // attach for UI
                        (err as any).message = message;
                        lastErr = err;
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
