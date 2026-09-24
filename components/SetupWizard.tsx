import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setupApi } from '../services/api/setup';
import { useAuthStore } from '../stores/useAuthStore';
import {
    CheckCircle2, ArrowRight, ArrowLeft, Globe, Loader2, Printer, Users, Layout,
    Coffee, UtensilsCrossed, Crown, ShoppingCart, ChefHat, Monitor, BookOpen,
    Package, BarChart3, DollarSign, Phone, Clock, Megaphone, Shield, Lock,
    Eye, EyeOff, Copy, RefreshCw, Store, Check, ChevronDown, Wallet, Truck,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { AppPermission, INITIAL_ROLE_PERMISSIONS, UserRole } from '../types';

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Permissions every admin gets regardless of package (shell + inbox).
const BASE_PERMS: AppPermission[] = [AppPermission.NAV_DASHBOARD, AppPermission.NAV_MAIL];

interface ModuleDef {
    id: string;
    icon: React.ElementType;
    nameAr: string;
    nameEn: string;
    descAr: string;
    descEn: string;
    permissions: AppPermission[];
    warnAr?: string;
}

const MODULES: ModuleDef[] = [
    { id: 'pos', icon: ShoppingCart, nameAr: 'نقطة البيع', nameEn: 'Point of Sale', descAr: 'شاشة الكاشير والطلبات (صالة + تيك أواي)', descEn: 'Cashier screen & orders (dine-in + takeaway)', permissions: [AppPermission.NAV_POS, AppPermission.NAV_ORDERS, AppPermission.OP_PLACE_ORDER] },
    { id: 'cashier', icon: Wallet, nameAr: 'عمليات الكاشير', nameEn: 'Cashier Ops', descAr: 'الدرج والخصم والإلغاء والمرتجع', descEn: 'Drawer, discounts, voids & refunds', permissions: [AppPermission.OP_MANAGE_CASH_DRAWER, AppPermission.OP_APPLY_DISCOUNT, AppPermission.OP_VOID_ORDER, AppPermission.OP_PROCESS_REFUND] },
    { id: 'dayclose', icon: Clock, nameAr: 'إقفال اليوم', nameEn: 'Day Close', descAr: 'تقغيل الوردية وإقفال يوم التشغيل', descEn: 'Shift handover & day close', permissions: [AppPermission.OP_CLOSE_DAY] },
    { id: 'kds', icon: ChefHat, nameAr: 'شاشة المطبخ', nameEn: 'Kitchen Display', descAr: 'تذاكر التحضير والمتابعة', descEn: 'Prep tickets & tracking', permissions: [AppPermission.NAV_KDS] },
    { id: 'pickup', icon: Monitor, nameAr: 'شاشة التسليم', nameEn: 'Handover Screen', descAr: 'تسليم الطلبات للعملاء', descEn: 'Order handover to customers', permissions: [AppPermission.NAV_PICKUP] },
    { id: 'menu', icon: BookOpen, nameAr: 'المنيو والوصفات', nameEn: 'Menu & Recipes', descAr: 'الأصناف والأسعار والوصفات والطابعات', descEn: 'Items, pricing, recipes & printers', permissions: [AppPermission.NAV_MENU_MANAGER, AppPermission.NAV_RECIPES, AppPermission.NAV_PRINTERS, AppPermission.CFG_EDIT_MENU_PRICING] },
    { id: 'inventory', icon: Package, nameAr: 'المخزون والجرد', nameEn: 'Inventory & Stock Count', descAr: 'الأرصدة وإدخال الجرد والتحويلات والتسويات', descEn: 'Balances, stock counts, transfers & adjustments', permissions: [AppPermission.NAV_INVENTORY, AppPermission.DATA_VIEW_STOCK_LEVELS, AppPermission.OP_TRANSFER_STOCK, AppPermission.OP_ADJUST_STOCK] },
    { id: 'purchasing', icon: Truck, nameAr: 'المشتريات والموردين', nameEn: 'Purchasing', descAr: 'أوامر الشراء واستلام البضاعة', descEn: 'Purchase orders & goods receiving', permissions: [AppPermission.OP_CREATE_PO, AppPermission.OP_RECEIVE_GRN, AppPermission.OP_APPROVE_PO] },
    { id: 'wastage', icon: CheckCircle2, nameAr: 'الهالك والهدر', nameEn: 'Wastage', descAr: 'تسجيل الهالك ومتابعته', descEn: 'Wastage logging & tracking', permissions: [AppPermission.NAV_WASTAGE] },
    { id: 'reports', icon: BarChart3, nameAr: 'التقارير', nameEn: 'Reports', descAr: 'تقارير البيع والإيراد والتكاليف والأرباح', descEn: 'Sales, revenue, cost & profit reports', permissions: [AppPermission.NAV_REPORTS, AppPermission.DATA_VIEW_REVENUE, AppPermission.DATA_VIEW_COSTS, AppPermission.DATA_VIEW_PROFITS] },
    { id: 'finance', icon: DollarSign, nameAr: 'المالية', nameEn: 'Finance', descAr: 'المحاسبة والخزينة والمصروفات', descEn: 'Accounting, treasury & expenses', permissions: [AppPermission.NAV_FINANCE] },
    { id: 'crm', icon: Users, nameAr: 'العملاء', nameEn: 'Customers (CRM)', descAr: 'بيانات العملاء والولاء', descEn: 'Customer data & loyalty', permissions: [AppPermission.NAV_CRM, AppPermission.DATA_VIEW_CUSTOMER_SENSITIVE] },
    { id: 'delivery', icon: Phone, nameAr: 'الكول سنتر والدليفري', nameEn: 'Call Center & Delivery', descAr: 'استقبال الطلبات والطيارين والمنصات', descEn: 'Order desk, pilots & platforms', permissions: [AppPermission.NAV_CALL_CENTER, AppPermission.NAV_DISPATCH, AppPermission.NAV_PLATFORMS, AppPermission.NAV_WHATSAPP] },
    { id: 'hr', icon: Users, nameAr: 'الموارد البشرية', nameEn: 'HR & Payroll', descAr: 'الموظفين والحضور والرواتب', descEn: 'Employees, attendance & payroll', permissions: [AppPermission.NAV_PEOPLE, AppPermission.NAV_ATTENDANCE, AppPermission.NAV_PAYROLL] },
    { id: 'marketing', icon: Megaphone, nameAr: 'التسويق', nameEn: 'Marketing', descAr: 'الحملات والمساعد الذكي', descEn: 'Campaigns & AI assistant', permissions: [AppPermission.NAV_MARKETING, AppPermission.NAV_AI_ASSISTANT] },
    { id: 'team', icon: Shield, nameAr: 'إدارة الفريق', nameEn: 'Team Management', descAr: 'إنشاء حسابات للموظفين', descEn: 'Create staff accounts', permissions: [AppPermission.NAV_USER_MANAGEMENT, AppPermission.CFG_MANAGE_USERS], warnAr: 'تنبيه: الحساب هيقدر يعدل صلاحيات المستخدمين — امنحه للثقة فقط' },
];

const PERM_AR: Record<string, string> = {
    NAV_POS: 'شاشة البيع', NAV_ORDERS: 'مركز الطلبات', OP_PLACE_ORDER: 'إنشاء طلب',
    OP_MANAGE_CASH_DRAWER: 'إدارة درج الكاشير', OP_APPLY_DISCOUNT: 'عمل خصم', OP_VOID_ORDER: 'إلغاء طلب', OP_PROCESS_REFUND: 'مرتجع / استرداد',
    OP_CLOSE_DAY: 'إقفال اليوم',
    NAV_KDS: 'شاشة المطبخ', NAV_PICKUP: 'شاشة التسليم',
    NAV_MENU_MANAGER: 'إدارة المنيو', NAV_RECIPES: 'الوصفات والتكلفة', NAV_PRINTERS: 'الطابعات', CFG_EDIT_MENU_PRICING: 'تعديل أسعار المنيو',
    NAV_INVENTORY: 'إدارة المخزون', DATA_VIEW_STOCK_LEVELS: 'عرض أرصدة المخزون', OP_TRANSFER_STOCK: 'تحويل مخزون', OP_ADJUST_STOCK: 'تسوية وإدخال الجرد',
    OP_CREATE_PO: 'إنشاء أمر شراء', OP_RECEIVE_GRN: 'استلام البضاعة', OP_APPROVE_PO: 'اعتماد أمر الشراء',
    NAV_WASTAGE: 'الهالك والهدر',
    NAV_REPORTS: 'التقارير', DATA_VIEW_REVENUE: 'عرض الإيرادات', DATA_VIEW_COSTS: 'عرض التكاليف', DATA_VIEW_PROFITS: 'عرض الأرباح',
    NAV_FINANCE: 'المالية',
    NAV_CRM: 'العملاء', DATA_VIEW_CUSTOMER_SENSITIVE: 'بيانات العملاء الحساسة',
    NAV_CALL_CENTER: 'الكول سنتر', NAV_DISPATCH: 'الدليفري والطيارين', NAV_PLATFORMS: 'منصات التوصيل', NAV_WHATSAPP: 'واتساب',
    NAV_PEOPLE: 'الموظفين', NAV_ATTENDANCE: 'الحضور والانصراف', NAV_PAYROLL: 'الرواتب',
    NAV_MARKETING: 'التسويق', NAV_AI_ASSISTANT: 'المساعد الذكي',
    NAV_USER_MANAGEMENT: 'إدارة المستخدمين', CFG_MANAGE_USERS: 'إنشاء وتعديل المستخدمين',
};

interface PackagePreset {
    id: string;
    role: UserRole;
    icon: React.ElementType;
    nameAr: string;
    nameEn: string;
    descAr: string;
    descEn: string;
    modules: string[];
}

const PACKAGES: PackagePreset[] = [
    {
        id: 'cafe', role: UserRole.CAFE_ADMIN, icon: Coffee,
        nameAr: 'كافيه — محدود', nameEn: 'Cafe — Limited',
        descAr: 'بيع + تقارير + مخزون وجرد + منيو + إقفال يوم',
        descEn: 'POS + reports + inventory & count + menu + day close',
        modules: ['pos', 'cashier', 'dayclose', 'kds', 'pickup', 'menu', 'inventory', 'wastage', 'reports'],
    },
    {
        id: 'restaurant', role: UserRole.BRANCH_MANAGER, icon: UtensilsCrossed,
        nameAr: 'مطعم — إدارة فرع', nameEn: 'Restaurant — Branch',
        descAr: 'تشغيل فرع كامل: مبيعات ومخزون وعملاء ومالية',
        descEn: 'Full branch ops: sales, inventory, customers, finance',
        modules: ['pos', 'cashier', 'dayclose', 'kds', 'pickup', 'menu', 'inventory', 'purchasing', 'wastage', 'reports', 'finance', 'crm', 'delivery', 'team'],
    },
    {
        id: 'full', role: UserRole.SUPER_ADMIN, icon: Crown,
        nameAr: 'نسخة كاملة — بدون حدود', nameEn: 'Full — Unlimited',
        descAr: 'كل مميزات السيستم بدون أي حجب',
        descEn: 'Every module with no restrictions',
        modules: MODULES.map((m) => m.id),
    },
];

type StaffKey = 'cashier' | 'kitchen' | 'pickup' | 'manager' | 'accountant';

interface StaffTemplate {
    key: StaffKey;
    icon: React.ElementType;
    nameAr: string;
    nameEn: string;
    hintAr: string;
    requires: string | null;
    role: UserRole;
    defaultPage: string;
}

const STAFF_TEMPLATES: StaffTemplate[] = [
    { key: 'cashier', icon: ShoppingCart, nameAr: 'كاشير', nameEn: 'Cashier', hintAr: 'يشتغل على نقطة البيع بالـ PIN', requires: 'pos', role: UserRole.CASHIER, defaultPage: '/pos' },
    { key: 'kitchen', icon: ChefHat, nameAr: 'شاشة مطبخ', nameEn: 'Kitchen Screen', hintAr: 'يفتح شاشة المطبخ مباشرة', requires: 'kds', role: UserRole.KITCHEN_STAFF, defaultPage: '/kds' },
    { key: 'pickup', icon: Monitor, nameAr: 'شاشة تسليم', nameEn: 'Handover Screen', hintAr: 'يفتح شاشة التسليم مباشرة', requires: 'pickup', role: UserRole.PICKUP_STAFF, defaultPage: '/pickup' },
    { key: 'manager', icon: Crown, nameAr: 'مدير', nameEn: 'Manager', hintAr: 'نفس صلاحيات أدمن العميل (مدير بديل)', requires: null, role: UserRole.CAFE_ADMIN, defaultPage: '/' },
    { key: 'accountant', icon: DollarSign, nameAr: 'محاسب', nameEn: 'Accountant', hintAr: 'التقارير والمالية', requires: 'finance', role: UserRole.ACCOUNTANT, defaultPage: '/finance' },
];

interface StaffForm { enabled: boolean; name: string; email: string; password: string; pin: string; }

const emptyStaff = (): StaffForm => ({ enabled: false, name: '', email: '', password: '', pin: '' });

const randomPin = (taken: Set<string>): string => {
    for (let i = 0; i < 50; i++) {
        const pin = String(Math.floor(100000 + Math.random() * 900000));
        if (!taken.has(pin)) return pin;
    }
    return String(Math.floor(100000 + Math.random() * 900000));
};

const emailLike = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// Mirrors server/services/passwordPolicyService.ts so weak passwords are
// rejected HERE with a clear message instead of failing at the final submit.
const checkPassword = (pw: string): string[] => {
    const errs: string[] = [];
    if (pw.length < 8) errs.push('8 أحرف على الأقل');
    if (!/[A-Z]/.test(pw)) errs.push('حرف كبير (A-Z)');
    if (!/[a-z]/.test(pw)) errs.push('حرف صغير (a-z)');
    if (!/[0-9]/.test(pw)) errs.push('رقم');
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)) errs.push('رمز (مثل ! أو @ أو #)');
    const lower = pw.toLowerCase();
    let seq = false;
    for (let i = 0; i + 2 < lower.length && !seq; i++) {
        const a = lower.charCodeAt(i), b = lower.charCodeAt(i + 1), c = lower.charCodeAt(i + 2);
        if ((b === a + 1 && c === a + 2) || (b === a - 1 && c === a - 2)) seq = true;
    }
    if (seq) errs.push('بدون تسلسل (123 أو abc)');
    let rep = false;
    for (let i = 0; i + 2 < pw.length && !rep; i++) if (pw[i] === pw[i + 1] && pw[i] === pw[i + 2]) rep = true;
    if (rep) errs.push('بدون 3 حروف متكررة (111 أو aaa)');
    return errs;
};

// One-click strong password (unambiguous chars only — easy to read out on-site).
const genPassword = (): string => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%^&*';
    const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
    for (let attempt = 0; attempt < 60; attempt++) {
        const all = upper + lower + digits + special;
        let pw = pick(upper) + pick(lower) + pick(digits) + pick(special);
        for (let i = 4; i < 10; i++) pw += pick(all);
        pw = pw.split('').sort(() => Math.random() - 0.5).join('');
        if (checkPassword(pw).length === 0) return pw;
    }
    return 'Km9#Qt2!Vx4';
};

const PW_HINT_AR = 'الباسورد: 8 أحرف على الأقل — حرف كبير + صغير + رقم + رمز، وبدون تسلسل (123/abc)';

const inputCls = 'mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400';
const labelCls = 'text-sm font-bold text-slate-300';

const DRAFT_KEY = 'coduis_setup_draft';
const MASTER_KEY_STORE = 'coduis_master_key';
const UNLOCK_STORE = 'dealer_setup_unlocked';

const SetupWizard: React.FC = () => {
    const navigate = useNavigate();
    const { settings, updateSettings } = useAuthStore();

    // Coduis Master gate — key is verified against the server BEFORE the wizard opens.
    const [unlocked, setUnlocked] = useState(() => {
        try {
            return sessionStorage.getItem(UNLOCK_STORE) === '1' && !!sessionStorage.getItem(MASTER_KEY_STORE);
        } catch { return false; }
    });
    const [masterKey, setMasterKey] = useState(() => {
        try { return sessionStorage.getItem(MASTER_KEY_STORE) || ''; } catch { return ''; }
    });
    const [showKey, setShowKey] = useState(false);
    const [keyError, setKeyError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);

    const [step, setStep] = useState<WizardStep>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdAccounts, setCreatedAccounts] = useState<Array<{ name: string; email: string; pin?: string; role: string }>>([]);
    const [copied, setCopied] = useState(false);

    const [language, setLanguage] = useState<'ar' | 'en'>(settings.language === 'en' ? 'en' : 'ar');

    const [restaurantName, setRestaurantName] = useState('');
    const [currency, setCurrency] = useState('EGP');
    const [currencySymbol, setCurrencySymbol] = useState('ج.م');
    const [taxRate, setTaxRate] = useState(14);
    const [serviceCharge, setServiceCharge] = useState(0);

    const [branchName, setBranchName] = useState('');
    const [branchAddress, setBranchAddress] = useState('');
    const [branchPhone, setBranchPhone] = useState('');

    // Package + granular modules. moduleOn = module switches, permOff = individually unchecked permissions.
    const [packageId, setPackageId] = useState('cafe');
    const [moduleOn, setModuleOn] = useState<Record<string, boolean>>(() => {
        const base: Record<string, boolean> = {};
        MODULES.forEach((m) => { base[m.id] = PACKAGES[0].modules.includes(m.id); });
        return base;
    });
    const [permOff, setPermOff] = useState<Record<string, boolean>>({});
    const [expandedMod, setExpandedMod] = useState<string | null>(null);

    const [adminName, setAdminName] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');

    const [staff, setStaff] = useState<Record<StaffKey, StaffForm>>({
        cashier: emptyStaff(), kitchen: emptyStaff(), pickup: emptyStaff(), manager: emptyStaff(), accountant: emptyStaff(),
    });

    const [printers, setPrinters] = useState<Array<{ name: string; type: string }>>([]);
    const [printerName, setPrinterName] = useState('');
    const [printerType, setPrinterType] = useState('RECEIPT');

    const [tables, setTables] = useState<Array<{ name: string; capacity: number }>>([]);
    const [tableName, setTableName] = useState('');
    const [tableCapacity, setTableCapacity] = useState(4);

    // Restore on-site draft (refresh-safe). Passwords are never persisted.
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(DRAFT_KEY);
            if (!raw) return;
            const d = JSON.parse(raw);
            if (d && typeof d === 'object') {
                if (typeof d.restaurantName === 'string') setRestaurantName(d.restaurantName);
                if (typeof d.currency === 'string') setCurrency(d.currency);
                if (typeof d.currencySymbol === 'string') setCurrencySymbol(d.currencySymbol);
                if (typeof d.taxRate === 'number') setTaxRate(d.taxRate);
                if (typeof d.serviceCharge === 'number') setServiceCharge(d.serviceCharge);
                if (typeof d.branchName === 'string') setBranchName(d.branchName);
                if (typeof d.branchAddress === 'string') setBranchAddress(d.branchAddress);
                if (typeof d.branchPhone === 'string') setBranchPhone(d.branchPhone);
                if (typeof d.packageId === 'string' && PACKAGES.some((p) => p.id === d.packageId)) setPackageId(d.packageId);
                if (d.moduleOn && typeof d.moduleOn === 'object') {
                    setModuleOn((prev) => {
                        const next = { ...prev };
                        for (const m of MODULES) if (typeof d.moduleOn[m.id] === 'boolean') next[m.id] = d.moduleOn[m.id];
                        return next;
                    });
                }
                if (d.permOff && typeof d.permOff === 'object') {
                    const clean: Record<string, boolean> = {};
                    for (const m of MODULES) for (const p of m.permissions) if (d.permOff[String(p)] === true) clean[String(p)] = true;
                    setPermOff(clean);
                }
                if (typeof d.adminName === 'string') setAdminName(d.adminName);
                if (typeof d.adminEmail === 'string') setAdminEmail(d.adminEmail);
                if (d.staff && typeof d.staff === 'object') {
                    setStaff((prev) => {
                        const next = { ...prev };
                        for (const tpl of STAFF_TEMPLATES) {
                            const s = d.staff[tpl.key];
                            if (s && typeof s === 'object') {
                                next[tpl.key] = {
                                    enabled: s.enabled === true,
                                    name: typeof s.name === 'string' ? s.name : '',
                                    email: typeof s.email === 'string' ? s.email : '',
                                    password: '',
                                    pin: typeof s.pin === 'string' ? s.pin.replace(/\D/g, '').slice(0, 6) : '',
                                };
                            }
                        }
                        return next;
                    });
                }
                if (Array.isArray(d.printers)) setPrinters(d.printers.filter((p: any) => p && typeof p.name === 'string').slice(0, 50));
                if (Array.isArray(d.tables)) setTables(d.tables.filter((x: any) => x && typeof x.name === 'string').slice(0, 200));
                if (typeof d.step === 'number' && d.step >= 0 && d.step <= 5) setStep(d.step as WizardStep);
            }
        } catch { /* corrupted draft — start fresh */ }
    }, []);

    // Persist draft on every change (passwords excluded).
    useEffect(() => {
        if (!unlocked) return;
        try {
            const safeStaff: Record<string, { enabled: boolean; name: string; email: string; pin: string }> = {};
            for (const tpl of STAFF_TEMPLATES) {
                const s = staff[tpl.key];
                safeStaff[tpl.key] = { enabled: s.enabled, name: s.name, email: s.email, pin: s.pin };
            }
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
                restaurantName, currency, currencySymbol, taxRate, serviceCharge,
                branchName, branchAddress, branchPhone, packageId, moduleOn, permOff,
                adminName, adminEmail, staff: safeStaff, printers, tables, step,
            }));
        } catch { /* storage full/blocked — wizard still works in memory */ }
    }, [unlocked, restaurantName, currency, currencySymbol, taxRate, serviceCharge, branchName, branchAddress, branchPhone, packageId, moduleOn, permOff, adminName, adminEmail, staff, printers, tables, step]);

    const preset = useMemo(() => PACKAGES.find((p) => p.id === packageId) || PACKAGES[0], [packageId]);
    const activeModules = useMemo(() => MODULES.filter((m) => moduleOn[m.id]), [moduleOn]);
    const hasModule = (id: string) => !!moduleOn[id];
    const offPermCount = useMemo(() => Object.values(permOff).filter(Boolean).length, [permOff]);

    const customized = useMemo(() => {
        const presetSet = new Set(preset.modules);
        for (const m of MODULES) {
            const shouldBe = presetSet.has(m.id);
            if (!!moduleOn[m.id] !== shouldBe) return true;
        }
        return offPermCount > 0;
    }, [moduleOn, preset, offPermCount]);

    const adminPermissions = useMemo<AppPermission[]>(() => {
        if (preset.role === UserRole.SUPER_ADMIN) return [];
        const set = new Set<AppPermission>(BASE_PERMS);
        for (const mod of MODULES) {
            if (!moduleOn[mod.id]) continue;
            for (const p of mod.permissions) if (!permOff[String(p)]) set.add(p);
        }
        return Array.from(set);
    }, [moduleOn, permOff, preset]);

    const applyPackage = (id: string) => {
        const p = PACKAGES.find((x) => x.id === id);
        if (!p) return;
        setPackageId(id);
        const base: Record<string, boolean> = {};
        MODULES.forEach((m) => { base[m.id] = p.modules.includes(m.id); });
        setModuleOn(base);
        setPermOff({});
        setExpandedMod(null);
    };
    const toggleModule = (id: string) => {
        const turningOn = !moduleOn[id];
        setModuleOn((prev) => ({ ...prev, [id]: turningOn }));
        if (turningOn) {
            const mod = MODULES.find((m) => m.id === id);
            if (mod) {
                setPermOff((prev) => {
                    const next = { ...prev };
                    for (const p of mod.permissions) delete next[String(p)];
                    return next;
                });
            }
        }
    };
    const togglePerm = (perm: AppPermission) => {
        const key = String(perm);
        setPermOff((prev) => {
            const next = { ...prev };
            if (next[key]) delete next[key];
            else next[key] = true;
            return next;
        });
    };

    const setStaffField = (key: StaffKey, patch: Partial<StaffForm>) =>
        setStaff((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

    const toggleStaff = (key: StaffKey) => {
        const cur = staff[key];
        if (!cur.enabled && !cur.pin) {
            const taken = new Set(Object.values(staff).map((x) => x.pin).filter(Boolean));
            setStaff((s) => ({ ...s, [key]: { ...s[key], enabled: true, pin: randomPin(taken) } }));
        } else {
            setStaffField(key, { enabled: !cur.enabled });
        }
    };

    const regenPin = (key: StaffKey) => {
        const taken = new Set(Object.entries(staff).filter(([k]) => k !== key).map(([, x]) => x.pin).filter(Boolean));
        setStaffField(key, { pin: randomPin(taken) });
    };

    const unlock = async () => {
        const key = masterKey.trim();
        if (!key) { setKeyError(language === 'ar' ? 'اكتب المفتاح الأول' : 'Enter the key first'); return; }
        setVerifying(true);
        setKeyError(null);
        try {
            await setupApi.verifyKey(key);
            try {
                sessionStorage.setItem(MASTER_KEY_STORE, key);
                sessionStorage.setItem(UNLOCK_STORE, '1');
            } catch { /* ignore */ }
            setMasterKey(key);
            setUnlocked(true);
        } catch {
            setKeyError(language === 'ar' ? 'المفتاح غير صحيح — اتأكد منه وحاول تاني' : 'Invalid key — check it and try again');
        } finally {
            setVerifying(false);
        }
    };

    const t = useMemo(() => ({
        title: language === 'ar' ? 'تجهيز عميل جديد' : 'New Client Setup',
        subtitle: language === 'ar' ? 'معالج Coduis Master — باقة + موديولات + حسابات في خطوة واحدة' : 'Coduis Master wizard — package + modules + accounts in one go',
        steps: [
            language === 'ar' ? 'المنشأة' : 'Business',
            language === 'ar' ? 'الفرع' : 'Branch',
            language === 'ar' ? 'الباقة' : 'Package',
            language === 'ar' ? 'الموديولات' : 'Modules',
            language === 'ar' ? 'الحسابات' : 'Accounts',
            language === 'ar' ? 'التشغيل' : 'Hardware',
            language === 'ar' ? 'مراجعة' : 'Review',
        ],
        next: language === 'ar' ? 'التالي' : 'Next',
        back: language === 'ar' ? 'رجوع' : 'Back',
        finish: language === 'ar' ? 'تشغيل الإعداد' : 'Launch Setup',
        doneTitle: language === 'ar' ? 'تم تجهيز العميل بنجاح' : 'Client Ready',
        goLogin: language === 'ar' ? 'اذهب لتسجيل الدخول' : 'Go to Login',
    }), [language]);

    const validateStep = (): string | null => {
        if (step === 0 && !restaurantName.trim()) return language === 'ar' ? 'اسم المنشأة مطلوب' : 'Restaurant name is required';
        if (step === 1 && !branchName.trim()) return language === 'ar' ? 'اسم الفرع مطلوب' : 'Branch name is required';
        if (step === 3 && activeModules.length === 0) return language === 'ar' ? 'اختار موديول واحد على الأقل' : 'Select at least one module';
        if (step === 4) {
            if (!adminName.trim() || !adminEmail.trim() || !adminPassword) return language === 'ar' ? 'بيانات الأدمن مطلوبة' : 'Admin details are required';
            if (!emailLike(adminEmail)) return language === 'ar' ? 'بريد الأدمن غير صحيح' : 'Admin email is invalid';
            const adminPwErrs = checkPassword(adminPassword);
            if (adminPwErrs.length > 0) return language === 'ar' ? `باسورد الأدمن ضعيف: ${adminPwErrs.join('، ')}` : `Weak admin password: ${adminPwErrs.join(', ')}`;
            if (adminPassword !== adminPasswordConfirm) return language === 'ar' ? 'كلمة المرور غير متطابقة' : 'Passwords do not match';
            const emails = new Set([adminEmail.trim().toLowerCase()]);
            const pins = new Set<string>();
            for (const tpl of STAFF_TEMPLATES) {
                const f = staff[tpl.key];
                if (!f.enabled) continue;
                if (!f.name.trim()) return language === 'ar' ? `اسم ${tpl.nameAr} مطلوب` : `${tpl.nameEn} name is required`;
                if (f.email.trim()) {
                    if (!emailLike(f.email)) return language === 'ar' ? `بريد ${tpl.nameAr} غير صحيح` : `${tpl.nameEn} email is invalid`;
                    const e = f.email.trim().toLowerCase();
                    if (emails.has(e)) return language === 'ar' ? 'البريد مكرر بين الحسابات' : 'Duplicate email across accounts';
                    emails.add(e);
                }
                if (!f.password && !f.pin) return language === 'ar' ? `حدد باسورد أو PIN لـ ${tpl.nameAr}` : `Set a password or PIN for ${tpl.nameEn}`;
                if (f.password) {
                    const pwErrs = checkPassword(f.password);
                    if (pwErrs.length > 0) return language === 'ar' ? `باسورد ${tpl.nameAr} ضعيف: ${pwErrs.join('، ')} (أو امسحه واكتفي بالـ PIN)` : `${tpl.nameEn} weak password: ${pwErrs.join(', ')} (or clear it and use PIN only)`;
                }
                if (f.pin) {
                    if (!/^\d{6}$/.test(f.pin)) return language === 'ar' ? `PIN ${tpl.nameAr} لازم 6 أرقام` : `${tpl.nameEn} PIN must be 6 digits`;
                    if (pins.has(f.pin)) return language === 'ar' ? 'الـ PIN مكرر — كل جهاز لازم PIN مختلف' : 'Duplicate PIN — each device needs a unique PIN';
                    pins.add(f.pin);
                }
            }
        }
        return null;
    };

    const handleNext = () => {
        const err = validateStep();
        if (err) { setError(err); return; }
        setError(null);
        setStep((s) => (Math.min(6, s + 1) as WizardStep));
    };
    const handleBack = () => { setError(null); setStep((s) => (Math.max(0, s - 1) as WizardStep)); };

    const staffPayload = () => {
        const list: Array<{ name: string; email?: string; password?: string; pin?: string; role: string; permissions: string[]; defaultPage: string }> = [];
        for (const tpl of STAFF_TEMPLATES) {
            const f = staff[tpl.key];
            if (!f.enabled) continue;
            let role = tpl.role;
            let permissions: string[];
            if (tpl.key === 'manager') {
                if (preset.role === UserRole.SUPER_ADMIN) {
                    role = UserRole.OWNER;
                    permissions = [...(INITIAL_ROLE_PERMISSIONS[UserRole.OWNER] || [])];
                } else {
                    role = preset.role;
                    permissions = adminPermissions.map(String);
                }
            } else {
                permissions = [...(INITIAL_ROLE_PERMISSIONS[tpl.role] || [])].map(String);
            }
            list.push({
                name: f.name.trim(),
                email: f.email.trim() || undefined,
                password: f.password || undefined,
                pin: f.pin || undefined,
                role,
                permissions,
                defaultPage: tpl.defaultPage,
            });
        }
        return list;
    };

    const handleFinish = async () => {
        const err = validateStep();
        if (err) { setError(err); return; }
        setError(null);
        setIsSubmitting(true);
        try {
            const payloadStaff = staffPayload();
            const key = masterKey.trim();
            const res = await setupApi.bootstrap({
                masterKey: key,
                dealerKey: key,
                admin: {
                    name: adminName.trim(),
                    email: adminEmail.trim(),
                    password: adminPassword,
                    role: preset.role,
                    permissions: adminPermissions.map(String),
                },
                branch: { name: branchName.trim(), address: branchAddress.trim(), phone: branchPhone.trim() },
                settings: {
                    restaurantName: restaurantName.trim(), currency, currencySymbol,
                    taxRate, serviceCharge, language, theme: settings.theme,
                    isDarkMode: settings.isDarkMode, isTouchMode: settings.isTouchMode,
                    phone: branchPhone.trim(), branchAddress: branchAddress.trim(),
                },
                printers: printers.map((p) => ({ id: nanoid(), name: p.name, type: p.type })),
                roles: [],
                tables: tables.map((x) => ({ id: nanoid(), name: x.name, capacity: x.capacity })),
                staff: payloadStaff,
            });
            void res;
            setCreatedAccounts([
                { name: adminName.trim(), email: adminEmail.trim(), role: preset.nameAr },
                ...payloadStaff.map((s) => ({ name: s.name, email: s.email || '—', pin: s.pin, role: s.role })),
            ]);
            updateSettings({ language });
            try { sessionStorage.removeItem(DRAFT_KEY); sessionStorage.removeItem(UNLOCK_STORE); } catch { /* ignore */ }
            setStep(6);
        } catch (e: any) {
            const code = String(e?.message || e?.code || 'Setup failed');
            const afterColon = code.includes(':') ? code.slice(code.indexOf(':') + 1).trim() : '';
            const friendly = (code.includes('INVALID_MASTER_KEY') || code.includes('INVALID_DEALER_KEY'))
                ? (language === 'ar' ? 'مفتاح Coduis Master غير صالح — اقفل الصفحة وافتحها وأدخل المفتاح الصحيح (شغلك محفوظ تلقائياً)' : 'Invalid Coduis Master key — close and reopen the page with the correct key (your work is auto-saved)')
                : code.includes('PASSWORD_POLICY_FAILED')
                    ? (language === 'ar' ? `الباسورد اترفض من السيرفر: ${afterColon} — ارجع خطوة الحسابات وظبطه` : `Password rejected by server: ${afterColon} — go back to Accounts and fix it`)
                    : code.includes('ALREADY_INITIALIZED')
                    ? (language === 'ar' ? 'النسخة دي متجهزة قبل كده' : 'This instance is already initialized')
                    : code;
            setError(friendly);
        } finally {
            setIsSubmitting(false);
        }
    };

    const copyAccounts = async () => {
        const lines = createdAccounts.map((a) => `${a.name} | ${a.email}${a.pin ? ` | PIN: ${a.pin}` : ''} | ${a.role}`);
        try {
            await navigator.clipboard.writeText(lines.join('\n'));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2500);
        } catch { /* clipboard unavailable */ }
    };

    const addPrinter = () => {
        if (printerName.trim()) { setPrinters((p) => [...p, { name: printerName.trim(), type: printerType }]); setPrinterName(''); }
    };
    const addTable = () => {
        if (tableName.trim()) { setTables((x) => [...x, { name: tableName.trim(), capacity: tableCapacity }]); setTableName(''); setTableCapacity(4); }
    };

    const stepIcons = [Store, Store, Coffee, Package, Users, Printer, CheckCircle2];

    // Coduis Master lock screen — key is verified against the server immediately,
    // so a wrong key can never waste the on-site work that follows.
    if (!unlocked) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 font-neo relative overflow-hidden" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                <div className="absolute -top-40 -start-40 w-[480px] h-[480px] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
                <div className="absolute -bottom-40 -end-40 w-[480px] h-[480px] rounded-full bg-emerald-600/15 blur-[120px] pointer-events-none" />
                <div className="w-full max-w-md bg-slate-900/70 border border-border/30 rounded-[2rem] shadow-2xl p-10 backdrop-blur relative">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-black text-lg mb-6 shadow-lg shadow-indigo-900/50">CM</div>
                    <h1 className="text-2xl font-black text-center">Coduis Master</h1>
                    <p className="text-slate-400 mt-2 text-sm text-center">{language === 'ar' ? 'شاشة تجهيز العملاء — المفتاح بيتأكد فوراً قبل ما تبدأ' : 'Client provisioning — the key is verified instantly before you start'}</p>
                    {keyError && (
                        <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 px-4 py-3 text-sm font-semibold">{keyError}</div>
                    )}
                    <label className={`${labelCls} block mt-6`}>{language === 'ar' ? 'مفتاح Coduis Master' : 'Coduis Master key'}</label>
                    <div className="relative">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={masterKey}
                            onChange={(e) => { setMasterKey(e.target.value); setKeyError(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') void unlock(); }}
                            className={`${inputCls} pe-12`}
                            placeholder="••••••••"
                            dir="ltr"
                        />
                        <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute top-1/2 -translate-y-1/2 end-3 p-1.5 text-slate-400 hover:text-white" aria-label="toggle">
                            {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                    <button onClick={() => void unlock()} disabled={verifying}
                        className="mt-6 w-full px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black disabled:opacity-60 flex items-center justify-center gap-2">
                        {verifying ? <Loader2 className="animate-spin" size={17} /> : <Lock size={17} />}
                        {verifying ? (language === 'ar' ? 'جاري التأكد...' : 'Verifying...') : (language === 'ar' ? 'تحقق وافتح المعالج' : 'Verify & Open Wizard')}
                    </button>
                    <button onClick={() => setLanguage((l) => l === 'ar' ? 'en' : 'ar')} className="mt-4 w-full text-xs text-slate-500 hover:text-slate-300 flex items-center justify-center gap-2">
                        <Globe size={14} /> {language === 'ar' ? 'English' : 'العربية'}
                    </button>
                </div>
            </div>
        );
    }

    const isReview = step === 6 && createdAccounts.length === 0;
    const isDone = step === 6 && createdAccounts.length > 0;

    return (
        <div className="min-h-screen bg-slate-950 text-white p-4 sm:p-6 font-neo relative overflow-x-hidden" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            <div className="absolute -top-40 start-1/3 w-[560px] h-[380px] rounded-full bg-indigo-600/15 blur-[130px] pointer-events-none" />
            <div className="absolute bottom-0 -end-40 w-[420px] h-[420px] rounded-full bg-emerald-600/10 blur-[120px] pointer-events-none" />

            <div className="w-full max-w-5xl mx-auto bg-slate-900/60 border border-border/30 rounded-[2rem] shadow-2xl backdrop-blur relative overflow-hidden">
                {/* Header */}
                <div className="px-6 sm:px-10 pt-8 pb-6 border-b border-border/20 bg-gradient-to-l from-indigo-600/15 via-transparent to-emerald-500/10">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-black text-lg shadow-lg shadow-indigo-900/50">CM</div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-2xl font-black">{t.title}</h1>
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-200 tracking-wide">CODUIS MASTER</span>
                                </div>
                                <p className="text-slate-400 mt-1 text-xs sm:text-sm">{t.subtitle}</p>
                            </div>
                        </div>
                        <button onClick={() => setLanguage((l) => l === 'ar' ? 'en' : 'ar')} className="px-4 py-2 rounded-xl border border-border/30 text-slate-300 hover:text-white hover:border-border/50 flex items-center gap-2 text-sm">
                            <Globe size={16} /> {language === 'ar' ? 'English' : 'العربية'}
                        </button>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center gap-1.5 sm:gap-2 mt-7 overflow-x-auto pb-1">
                        {t.steps.map((label, index) => {
                            const Icon = stepIcons[index];
                            const isActive = index === step;
                            const isDoneStep = index < step || (isDone && index <= 6);
                            return (
                                <React.Fragment key={label}>
                                    <div className={`flex items-center gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl border whitespace-nowrap transition-all ${isActive ? 'border-indigo-400 bg-indigo-500/15 text-white shadow-lg shadow-indigo-900/30' : isDoneStep ? 'border-emerald-500/40 text-emerald-300' : 'border-border/30 text-slate-500'}`}>
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isDoneStep && !isActive ? 'bg-emerald-500/20' : isActive ? 'bg-indigo-500/25' : 'bg-elevated/40'}`}>
                                            {isDoneStep && !isActive ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                                        </div>
                                        <span className="text-[11px] sm:text-xs font-bold hidden sm:inline">{label}</span>
                                        <span className="text-[11px] font-bold sm:hidden">{index + 1}</span>
                                    </div>
                                    {index < t.steps.length - 1 && <div className={`h-px w-3 sm:w-6 shrink-0 ${index < step ? 'bg-emerald-500/50' : 'bg-border/30'}`} />}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                <div className="px-6 sm:px-10 py-8 min-h-[420px]">
                    {error && (
                        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 px-4 py-3 text-sm font-semibold">{error}</div>
                    )}

                    <div key={step} className="route-rise">
                        {step === 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className={labelCls}>{language === 'ar' ? 'اسم المنشأة' : 'Restaurant Name'}</label>
                                    <input value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} className={inputCls} placeholder={language === 'ar' ? 'مثال: كافيه روفان' : 'e.g. Ravan Cafe'} />
                                </div>
                                <div>
                                    <label className={labelCls}>{language === 'ar' ? 'العملة' : 'Currency'}</label>
                                    <input value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>{language === 'ar' ? 'رمز العملة' : 'Currency Symbol'}</label>
                                    <input value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>{language === 'ar' ? 'ضريبة القيمة المضافة %' : 'Tax Rate %'}</label>
                                    <input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>{language === 'ar' ? 'خدمة %' : 'Service Charge %'}</label>
                                    <input type="number" value={serviceCharge} onChange={(e) => setServiceCharge(Number(e.target.value))} className={inputCls} />
                                </div>
                            </div>
                        )}

                        {step === 1 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className={labelCls}>{language === 'ar' ? 'اسم الفرع' : 'Branch Name'}</label>
                                    <input value={branchName} onChange={(e) => setBranchName(e.target.value)} className={inputCls} placeholder={language === 'ar' ? 'مثال: فرع مدينة نصر' : 'e.g. Nasr City branch'} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelCls}>{language === 'ar' ? 'العنوان' : 'Address'}</label>
                                    <input value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>{language === 'ar' ? 'الهاتف' : 'Phone'}</label>
                                    <input value={branchPhone} onChange={(e) => setBranchPhone(e.target.value)} className={inputCls} dir="ltr" />
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-4">
                                <p className="text-sm text-slate-400">{language === 'ar' ? 'اختار الباقة اللي العميل اشتراها — بتظبط الموديولات تلقائياً وتقدر تفصّلها في الخطوة الجاية' : 'Pick the package the client bought — modules auto-adjust and can be fine-tuned next'}</p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {PACKAGES.map((p) => {
                                        const Icon = p.icon;
                                        const selected = packageId === p.id;
                                        return (
                                            <button key={p.id} type="button" onClick={() => applyPackage(p.id)}
                                                className={`text-start rounded-2xl border-2 p-5 transition-all hover:scale-[1.01] ${selected ? 'border-indigo-400 bg-indigo-500/10 shadow-xl shadow-indigo-900/30' : 'border-border/30 bg-slate-800/40 hover:border-slate-500'}`}>
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${selected ? 'bg-indigo-500/30 text-indigo-200' : 'bg-elevated/40 text-slate-300'}`}>
                                                        <Icon size={22} />
                                                    </div>
                                                    {selected && <CheckCircle2 size={20} className="text-emerald-400" />}
                                                </div>
                                                <div className="font-black text-white mb-1">{language === 'ar' ? p.nameAr : p.nameEn}</div>
                                                <div className="text-xs text-slate-400 mb-3 leading-relaxed">{language === 'ar' ? p.descAr : p.descEn}</div>
                                                <div className="text-[11px] font-bold text-indigo-300">{p.modules.length} {language === 'ar' ? 'موديول' : 'modules'}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between flex-wrap gap-3">
                                    <p className="text-sm text-slate-400">
                                        {language === 'ar' ? `الباقة: ${preset.nameAr} — ${activeModules.length} موديول شغال — ${adminPermissions.length} صلاحية` : `Package: ${preset.nameEn} — ${activeModules.length} modules on — ${adminPermissions.length} perms`}
                                        {customized && <span className="ms-2 px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 text-[11px] font-bold">{language === 'ar' ? 'مخصص' : 'Custom'}</span>}
                                        {offPermCount > 0 && <span className="ms-2 px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-300 text-[11px] font-bold">{offPermCount} {language === 'ar' ? 'صلاحية مقفولة' : 'perms off'}</span>}
                                    </p>
                                    {customized && (
                                        <button onClick={() => applyPackage(packageId)} className="text-xs font-bold text-indigo-300 hover:text-indigo-200 flex items-center gap-1.5">
                                            <RefreshCw size={13} /> {language === 'ar' ? 'رجوع لضبط الباقة' : 'Reset to package'}
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500">{language === 'ar' ? 'دوس على السهم تحت أي موديول عشان تفتح وتقفل صلاحياته واحدة واحدة' : 'Expand any module to toggle its individual permissions'}</p>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    {MODULES.map((m) => {
                                        const Icon = m.icon;
                                        const on = hasModule(m.id);
                                        const expanded = expandedMod === m.id;
                                        const offInMod = m.permissions.filter((p) => permOff[String(p)]).length;
                                        return (
                                            <div key={m.id} className={`rounded-2xl border-2 transition-all ${on ? 'border-emerald-400/60 bg-emerald-500/5' : 'border-border/30 bg-slate-800/40'}`}>
                                                <div className="flex items-center gap-3 p-4">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-emerald-500/25 text-emerald-200' : 'bg-elevated/40 text-slate-500'}`}>
                                                        <Icon size={19} />
                                                    </div>
                                                    <button type="button" onClick={() => toggleModule(m.id)} className="min-w-0 flex-1 text-start">
                                                        <div className="font-black text-white text-sm">{language === 'ar' ? m.nameAr : m.nameEn}</div>
                                                        <div className="text-[11px] text-slate-400 leading-relaxed">{language === 'ar' ? m.descAr : m.descEn}</div>
                                                        {on && offInMod > 0 && <div className="text-[10px] text-amber-300 font-bold mt-0.5">{offInMod} {language === 'ar' ? 'صلاحية مقفولة' : 'perms off'}</div>}
                                                    </button>
                                                    <button type="button" onClick={() => setExpandedMod(expanded ? null : m.id)}
                                                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-elevated/40 shrink-0" aria-label="expand">
                                                        <ChevronDown size={16} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                    </button>
                                                    <button type="button" onClick={() => toggleModule(m.id)}
                                                        className={`w-11 h-6 rounded-full p-1 transition-colors shrink-0 ${on ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${on ? (language === 'ar' ? '-translate-x-5' : 'translate-x-5') : ''}`} />
                                                    </button>
                                                </div>
                                                {expanded && (
                                                    <div className="px-4 pb-4">
                                                        <div className="rounded-xl bg-slate-950/50 border border-border/20 p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                            {m.permissions.map((p) => {
                                                                const off = !!permOff[String(p)];
                                                                const effective = on && !off;
                                                                return (
                                                                    <button key={String(p)} type="button" onClick={() => togglePerm(p)}
                                                                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold transition-colors ${effective ? 'text-emerald-200 bg-emerald-500/10' : 'text-slate-500 hover:text-slate-300'}`}>
                                                                        <span className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${effective ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600'}`}>
                                                                            {effective && <Check size={11} />}
                                                                        </span>
                                                                        {language === 'ar' ? (PERM_AR[String(p)] || String(p)) : String(p)}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        {m.warnAr && on && <div className="text-[11px] text-amber-300/90 mt-2 leading-relaxed px-1">{language === 'ar' ? m.warnAr : ''}</div>}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="space-y-6">
                                {/* Admin */}
                                <div className="rounded-2xl border border-indigo-400/30 bg-indigo-500/5 p-5">
                                    <div className="flex items-center gap-2.5 mb-4 flex-wrap">
                                        <Crown size={18} className="text-indigo-300" />
                                        <h3 className="font-black">{language === 'ar' ? 'حساب أدمن العميل' : 'Client Admin Account'}</h3>
                                        <span className="ms-auto text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-200">{preset.nameAr} — {adminPermissions.length} {language === 'ar' ? 'صلاحية' : 'perms'}</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className={labelCls}>{language === 'ar' ? 'الاسم' : 'Name'}</label>
                                            <input value={adminName} onChange={(e) => setAdminName(e.target.value)} className={inputCls} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>{language === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
                                            <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className={inputCls} dir="ltr" />
                                        </div>
                                        <div>
                                            <label className={labelCls}>{language === 'ar' ? 'كلمة المرور' : 'Password'}</label>
                                            <div className="relative">
                                                <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className={`${inputCls} pe-11`} dir="ltr" />
                                                <button type="button" onClick={() => { const p = genPassword(); setAdminPassword(p); setAdminPasswordConfirm(p); }} className="absolute top-[18px] -translate-y-1/2 end-2 p-1.5 text-slate-400 hover:text-white" title={language === 'ar' ? 'توليد باسورد قوي' : 'Generate strong password'}>
                                                    <RefreshCw size={15} />
                                                </button>
                                            </div>
                                            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">{language === 'ar' ? PW_HINT_AR : 'Password: 8+ chars — upper + lower + digit + symbol, no sequences (123/abc)'}</p>
                                        </div>
                                        <div>
                                            <label className={labelCls}>{language === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm Password'}</label>
                                            <input type="password" value={adminPasswordConfirm} onChange={(e) => setAdminPasswordConfirm(e.target.value)} className={inputCls} dir="ltr" />
                                        </div>
                                    </div>
                                </div>

                                {/* Staff */}
                                <div>
                                    <h3 className="font-black mb-1 flex items-center gap-2"><Users size={18} className="text-emerald-300" /> {language === 'ar' ? 'حسابات التشغيل (اختياري)' : 'Operational Accounts (optional)'}</h3>
                                    <p className="text-xs text-slate-500 mb-4">{language === 'ar' ? 'فعّل اللي محتاجه — البريد اختياري (بيتولد تلقائي)، والـ PIN لازم 6 أرقام مختلفة لكل جهاز' : 'Enable what you need — email is optional (auto-generated), PIN must be 6 unique digits per device'}</p>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {STAFF_TEMPLATES.map((tpl) => {
                                            const Icon = tpl.icon;
                                            const f = staff[tpl.key];
                                            const blocked = tpl.requires && !hasModule(tpl.requires);
                                            const needMod = tpl.requires ? MODULES.find((m) => m.id === tpl.requires) : null;
                                            return (
                                                <div key={tpl.key} className={`rounded-2xl border-2 p-4 transition-all ${f.enabled ? 'border-emerald-400/60 bg-emerald-500/5' : 'border-border/30 bg-slate-800/40'}`}>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${f.enabled ? 'bg-emerald-500/25 text-emerald-200' : 'bg-elevated/40 text-slate-400'}`}>
                                                            <Icon size={19} />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-black text-sm">{language === 'ar' ? tpl.nameAr : tpl.nameEn}</div>
                                                            <div className="text-[11px] text-slate-500">{language === 'ar' ? tpl.hintAr : ''}</div>
                                                        </div>
                                                        <button type="button" onClick={() => toggleStaff(tpl.key)} disabled={!!blocked}
                                                            className={`w-11 h-6 rounded-full p-1 transition-colors shrink-0 ${f.enabled ? 'bg-emerald-500' : 'bg-slate-700'} disabled:opacity-40`}>
                                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${f.enabled ? (language === 'ar' ? '-translate-x-5' : 'translate-x-5') : ''}`} />
                                                        </button>
                                                    </div>
                                                    {blocked && needMod && (
                                                        <button type="button" onClick={() => { const base: Record<string, boolean> = {}; MODULES.forEach((m) => { base[m.id] = !!moduleOn[m.id]; }); base[needMod.id] = true; setModuleOn(base); }}
                                                            className="mt-3 w-full text-[11px] font-bold px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20">
                                                            {language === 'ar' ? `فعّل موديول "${needMod.nameAr}" لفتح الحساب ده` : `Enable "${needMod.nameEn}" to unlock this account`}
                                                        </button>
                                                    )}
                                                    {f.enabled && !blocked && (
                                                        <div className="grid grid-cols-2 gap-3 mt-3">
                                                            <input value={f.name} onChange={(e) => setStaffField(tpl.key, { name: e.target.value })} className={`${inputCls} !mt-0 text-sm`} placeholder={language === 'ar' ? 'الاسم *' : 'Name *'} />
                                                            <input value={f.email} onChange={(e) => setStaffField(tpl.key, { email: e.target.value })} className={`${inputCls} !mt-0 text-sm`} placeholder={language === 'ar' ? 'البريد (اختياري)' : 'Email (optional)'} dir="ltr" />
                                                            <div className="relative">
                                                                <input type="password" value={f.password} onChange={(e) => setStaffField(tpl.key, { password: e.target.value })} className={`${inputCls} !mt-0 text-sm pe-10`} placeholder={language === 'ar' ? 'باسورد (أو PIN)' : 'Password (or PIN)'} dir="ltr" />
                                                                <button type="button" onClick={() => setStaffField(tpl.key, { password: genPassword() })} className="absolute top-1/2 -translate-y-1/2 end-2 p-1.5 text-slate-400 hover:text-white" title={language === 'ar' ? 'توليد باسورد قوي' : 'Generate strong password'}>
                                                                    <RefreshCw size={14} />
                                                                </button>
                                                            </div>
                                                            <div className="relative">
                                                                <input value={f.pin} onChange={(e) => setStaffField(tpl.key, { pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} className={`${inputCls} !mt-0 text-sm pe-10`} placeholder="PIN (6)" dir="ltr" inputMode="numeric" />
                                                                <button type="button" onClick={() => regenPin(tpl.key)} className="absolute top-1/2 -translate-y-1/2 end-2 p-1.5 text-slate-400 hover:text-white" title={language === 'ar' ? 'توليد PIN' : 'Generate PIN'}>
                                                                    <RefreshCw size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 5 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="rounded-2xl border border-border/30 bg-slate-800/40 p-5">
                                    <h3 className="font-black mb-1 flex items-center gap-2"><Printer size={17} className="text-indigo-300" /> {language === 'ar' ? 'الطابعات (اختياري)' : 'Printers (optional)'}</h3>
                                    <div className="flex gap-2 mt-3">
                                        <input value={printerName} onChange={(e) => setPrinterName(e.target.value)} className={`${inputCls} !mt-0 text-sm flex-1`} placeholder={language === 'ar' ? 'اسم الطابعة' : 'Printer name'} />
                                        <select value={printerType} onChange={(e) => setPrinterType(e.target.value)} className="rounded-xl bg-slate-800/60 border border-border/30 px-3 py-2.5 text-white text-sm">
                                            <option value="RECEIPT">{language === 'ar' ? 'فواتير' : 'Receipt'}</option>
                                            <option value="KDS">{language === 'ar' ? 'مطبخ' : 'Kitchen'}</option>
                                            <option value="LABEL">{language === 'ar' ? 'ملصقات' : 'Label'}</option>
                                        </select>
                                        <button onClick={addPrinter} className="px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm">+</button>
                                    </div>
                                    {printers.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {printers.map((p, i) => (
                                                <span key={i} className="px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-200 text-xs font-bold flex items-center gap-1.5"><Printer size={12} /> {p.name} ({p.type})</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="rounded-2xl border border-border/30 bg-slate-800/40 p-5">
                                    <h3 className="font-black mb-1 flex items-center gap-2"><Layout size={17} className="text-emerald-300" /> {language === 'ar' ? 'الطاولات (اختياري)' : 'Tables (optional)'}</h3>
                                    <div className="flex gap-2 mt-3">
                                        <input value={tableName} onChange={(e) => setTableName(e.target.value)} className={`${inputCls} !mt-0 text-sm flex-1`} placeholder="T1" />
                                        <input type="number" value={tableCapacity} onChange={(e) => setTableCapacity(Number(e.target.value))} className={`${inputCls} !mt-0 text-sm w-20`} min={1} />
                                        <button onClick={addTable} className="px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">+</button>
                                    </div>
                                    {tables.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {tables.map((x, i) => (
                                                <span key={i} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-200 text-xs font-bold">{x.name} ({x.capacity})</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {isReview && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="rounded-2xl border border-border/30 bg-slate-800/40 p-4">
                                        <div className="text-[11px] font-bold text-slate-500 mb-1">{language === 'ar' ? 'المنشأة / الفرع' : 'Business / Branch'}</div>
                                        <div className="font-black">{restaurantName}</div>
                                        <div className="text-xs text-slate-400">{branchName} {branchPhone ? `— ${branchPhone}` : ''}</div>
                                    </div>
                                    <div className="rounded-2xl border border-indigo-400/40 bg-indigo-500/10 p-4">
                                        <div className="text-[11px] font-bold text-indigo-300 mb-1">{language === 'ar' ? 'الباقة' : 'Package'}</div>
                                        <div className="font-black">{preset.nameAr}{customized ? ' (مخصص)' : ''}</div>
                                        <div className="text-xs text-slate-400">{activeModules.length} {language === 'ar' ? 'موديول — ' : 'modules — '}{adminPermissions.length} {language === 'ar' ? 'صلاحية' : 'perms'}{offPermCount > 0 ? ` (${offPermCount} ${language === 'ar' ? 'مقفولة يدوياً' : 'manually off'})` : ''}</div>
                                    </div>
                                    <div className="rounded-2xl border border-border/30 bg-slate-800/40 p-4">
                                        <div className="text-[11px] font-bold text-slate-500 mb-1">{language === 'ar' ? 'التشغيل' : 'Hardware'}</div>
                                        <div className="font-black">{printers.length} {language === 'ar' ? 'طابعة' : 'printers'} — {tables.length} {language === 'ar' ? 'طاولة' : 'tables'}</div>
                                        <div className="text-xs text-slate-400">{staffPayload().length + 1} {language === 'ar' ? 'حسابات هتتخلق' : 'accounts to create'}</div>
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-border/30 bg-slate-800/40 p-4">
                                    <div className="text-[11px] font-bold text-slate-500 mb-2">{language === 'ar' ? 'الموديولات والصلاحيات' : 'Modules & permissions'}</div>
                                    <div className="space-y-2">
                                        {activeModules.map((m) => {
                                            const off = m.permissions.filter((p) => permOff[String(p)]);
                                            return (
                                                <div key={m.id} className="flex items-start gap-2 text-xs">
                                                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 font-bold shrink-0 flex items-center gap-1"><Check size={11} /> {language === 'ar' ? m.nameAr : m.nameEn}</span>
                                                    {off.length > 0 && <span className="text-rose-300/80 py-1">({language === 'ar' ? 'مقفول: ' : 'off: '}{off.map((p) => PERM_AR[String(p)] || String(p)).join('، ')})</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-border/30 bg-slate-800/40 p-4">
                                    <div className="text-[11px] font-bold text-slate-500 mb-2">{language === 'ar' ? 'الحسابات' : 'Accounts'}</div>
                                    <div className="space-y-1.5 text-sm">
                                        <div className="flex items-center gap-2"><Crown size={14} className="text-indigo-300" /><b>{adminName}</b><span className="text-slate-500 text-xs">{adminEmail} — {language === 'ar' ? 'أدمن' : 'admin'}</span></div>
                                        {STAFF_TEMPLATES.filter((x) => staff[x.key].enabled).map((x) => (
                                            <div key={x.key} className="flex items-center gap-2"><x.icon size={14} className="text-emerald-300" /><b>{staff[x.key].name || x.nameAr}</b><span className="text-slate-500 text-xs">{staff[x.key].pin ? `PIN: ${staff[x.key].pin}` : ''}</span></div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {isDone && (
                            <div className="text-center py-6">
                                <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-200 mb-5">
                                    <CheckCircle2 size={28} />
                                </div>
                                <h2 className="text-2xl font-black mb-2">{t.doneTitle}</h2>
                                <p className="text-slate-400 mb-6 text-sm">{language === 'ar' ? 'سلم البيانات دي للعميل — الـ PINs مش هتظهر تاني' : 'Hand these credentials to the client — PINs will not be shown again'}</p>
                                <div className="max-w-2xl mx-auto rounded-2xl border border-border/30 overflow-hidden text-start">
                                    {createdAccounts.map((a, i) => (
                                        <div key={i} className={`flex items-center gap-3 px-4 py-3 text-sm ${i % 2 ? 'bg-slate-800/30' : 'bg-slate-800/60'}`}>
                                            <b className="flex-1">{a.name}</b>
                                            <span className="text-slate-400 text-xs" dir="ltr">{a.email}</span>
                                            {a.pin && <span className="text-emerald-300 font-black" dir="ltr">PIN: {a.pin}</span>}
                                            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-200 font-bold">{a.role}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
                                    <button onClick={copyAccounts} className="px-5 py-3 rounded-2xl border border-border/30 text-slate-200 hover:text-white hover:border-border/50 font-bold text-sm flex items-center gap-2">
                                        <Copy size={15} /> {copied ? (language === 'ar' ? 'اتنسخ' : 'Copied') : (language === 'ar' ? 'نسخ البيانات' : 'Copy credentials')}
                                    </button>
                                    <button onClick={() => navigate('/login')} className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-black text-white text-sm">
                                        {t.goLogin}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {!isDone && (
                    <div className="px-6 sm:px-10 py-5 border-t border-border/20 bg-slate-900/80 flex items-center justify-between gap-3 sticky bottom-0 backdrop-blur">
                        <button onClick={handleBack} disabled={step === 0} className="px-5 py-3 rounded-2xl border border-border/30 text-slate-300 hover:text-white disabled:opacity-40 flex items-center gap-2 text-sm font-bold">
                            <ArrowLeft size={16} /> {t.back}
                        </button>
                        <div className="text-[11px] text-slate-500 font-bold hidden sm:block">
                            {language === 'ar' ? `خطوة ${step + 1} من 7 — حفظ تلقائي` : `Step ${step + 1} of 7 — auto-saved`}
                            {step === 3 && ` — ${activeModules.length} ${language === 'ar' ? 'موديول' : 'modules'}`}
                            {step === 4 && staffPayload().length > 0 && ` — ${staffPayload().length} ${language === 'ar' ? 'حسابات تشغيل' : 'staff'}`}
                        </div>
                        <button onClick={isReview ? handleFinish : handleNext} disabled={isSubmitting}
                            className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black flex items-center gap-2 disabled:opacity-60 text-sm shadow-lg shadow-indigo-900/40">
                            {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
                            {isReview ? t.finish : t.next}
                            {!isSubmitting && <ArrowRight size={16} />}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SetupWizard;
