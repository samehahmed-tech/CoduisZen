/**
 * Central bilingual role labels — single source of truth.
 * Ensures Users & Roles screens show ALL roles in the active system language:
 * settings.language === 'ar' → Arabic, otherwise English.
 */

export type RoleLang = 'ar' | 'en';

export interface RoleLabelEntry {
    en: string;
    ar: string;
    description?: string;
    descriptionAr?: string;
    isCorporate?: boolean;
}

export const ROLE_I18N: Record<string, RoleLabelEntry> = {
    SUPER_ADMIN: { en: 'Super Admin', ar: 'مدير النظام', description: 'Full system access — all permissions, all branches', descriptionAr: 'وصول كامل — كل الصلاحيات، كل الفروع', isCorporate: true },
    OWNER: { en: 'Owner', ar: 'المالك', description: 'Business owner with broad operational & financial control', descriptionAr: 'مالك النشاط — صلاحيات تشغيلية ومالية واسعة', isCorporate: true },
    PARTNER: { en: 'Partner', ar: 'الشريك', description: 'Partner-level access to reports & financial data', descriptionAr: 'وصول شريك — تقارير وبيانات مالية', isCorporate: true },
    OWNER_VIEWER: { en: 'Owner Viewer', ar: 'مشاهد المالك', description: 'Read-only access to dashboards & reports', descriptionAr: 'وصول للعرض فقط — لوحات وتقارير', isCorporate: true },
    CEO: { en: 'CEO', ar: 'الرئيس التنفيذي', description: 'Executive-level strategic overview', descriptionAr: 'نظرة استراتيجية تنفيذية', isCorporate: true },
    COO: { en: 'COO', ar: 'مدير العمليات', description: 'Daily operations oversight', descriptionAr: 'الإشراف على العمليات اليومية', isCorporate: true },
    GENERAL_MANAGER: { en: 'General Manager', ar: 'المدير العام', description: 'Full branch management across all departments', descriptionAr: 'إدارة كاملة للفرع عبر كل الأقسام', isCorporate: true },
    BRANCH_MANAGER: { en: 'Branch Manager', ar: 'مدير الفرع', description: 'Manages a single branch end-to-end', descriptionAr: 'يدير فرع واحد بشكل كامل', isCorporate: false },
    CASHIER_MANAGER: { en: 'Cashier Manager', ar: 'مدير الكاشير', description: 'Oversees all cashiers & POS operations', descriptionAr: 'الإشراف على الكاشير وعمليات البيع', isCorporate: false },
    CASHIER: { en: 'Cashier', ar: 'الكاشير', description: 'POS operations & cash drawer management', descriptionAr: 'عمليات نقطة البيع والدرج النقدي', isCorporate: false },
    WAITER: { en: 'Waiter', ar: 'النادل', description: 'Order taking & table service', descriptionAr: 'أخذ الطلبات وخدمة الطاولات', isCorporate: false },
    CAPTAIN: { en: 'Captain', ar: 'الكابتن', description: 'Supervises service, can void orders', descriptionAr: 'يشرف على الخدمة، يمكن إلغاء الطلبات', isCorporate: false },
    DRIVER: { en: 'Driver', ar: 'السائق', description: 'Delivery driver mobile access', descriptionAr: 'وصول تطبيق السائق للتوصيل', isCorporate: false },
    KITCHEN_STAFF: { en: 'Kitchen Staff', ar: 'طاقم المطبخ', description: 'Kitchen display system access', descriptionAr: 'وصول شاشة المطبخ', isCorporate: false },
    CALL_CENTER: { en: 'Call Center Agent', ar: 'موظف مركز الاتصال', description: 'Order taking via phone & CRM', descriptionAr: 'أخذ الطلبات عبر الهاتف وإدارة العملاء', isCorporate: false },
    CALL_CENTER_MANAGER: { en: 'Call Center Manager', ar: 'مدير مركز الاتصال', description: 'Manages call center team & reports', descriptionAr: 'إدارة فريق مركز الاتصال والتقارير', isCorporate: true },
    WAREHOUSE_STAFF: { en: 'Warehouse Staff', ar: 'موظف المخزن', description: 'Stock management & GRN receiving', descriptionAr: 'إدارة المخزون واستلام إذون الاستلام', isCorporate: false },
    WAREHOUSE_DIRECTOR: { en: 'Warehouse Director', ar: 'مدير المخازن', description: 'Full warehouse & procurement control', descriptionAr: 'تحكم كامل في المخازن والمشتريات', isCorporate: true },
    PRODUCTION_STAFF: { en: 'Production Staff', ar: 'طاقم الإنتاج', description: 'Production order execution & recipes', descriptionAr: 'تنفيذ أوامر الإنتاج والوصفات', isCorporate: false },
    PROCUREMENT_MANAGER: { en: 'Procurement Manager', ar: 'مدير المشتريات', description: 'Purchase orders, suppliers & procurement', descriptionAr: 'أوامر الشراء، الموردين والمشتريات', isCorporate: true },
    ACCOUNTANT: { en: 'Accountant', ar: 'المحاسب', description: 'Financial records & reporting', descriptionAr: 'السجلات المالية والتقارير', isCorporate: true },
    COST_ACCOUNTANT: { en: 'Cost Accountant', ar: 'محاسب التكاليف', description: 'Recipe costing & inventory valuation', descriptionAr: 'تكلفة الوصفات وتقييم المخزون', isCorporate: true },
    FINANCE_DIRECTOR: { en: 'Finance Director', ar: 'المدير المالي', description: 'Full financial control & treasury', descriptionAr: 'تحكم مالي كامل والخزانة', isCorporate: true },
    HR_MANAGER: { en: 'HR Manager', ar: 'مدير الموارد البشرية', description: 'Employee management & attendance', descriptionAr: 'إدارة الموظفين والحضور', isCorporate: true },
    PAYROLL_OFFICER: { en: 'Payroll Officer', ar: 'مسؤول الرواتب', description: 'Payroll processing & salary data', descriptionAr: 'معالجة الرواتب وبيانات المرتبات', isCorporate: true },
    TREASURY_OFFICER: { en: 'Treasury Officer', ar: 'مسؤول الخزانة', description: 'Cash management & daily closing', descriptionAr: 'إدارة النقدية والإغلاق اليومي', isCorporate: true },
    TECH_SUPPORT: { en: 'Technical Support', ar: 'الدعم الفني', description: 'System configuration & printer setup', descriptionAr: 'إعدادات النظام وإعداد الطابعات', isCorporate: true },
    QUALITY_OFFICER: { en: 'Quality Officer', ar: 'مسؤول الجودة', description: 'Quality control & waste tracking', descriptionAr: 'مراقبة الجودة وتتبع الهدر', isCorporate: false },
    CAFE_ADMIN: { en: 'Cafe Admin (Limited)', ar: 'مدير كافيه (محدود)', description: 'Cafe edition — POS, reports, inventory & menu only', descriptionAr: 'نسخة الكافيه — نقطة بيع وتقارير ومخزون ومنيو فقط', isCorporate: false },
    PICKUP_STAFF: { en: 'Handover Screen', ar: 'موظف شاشة التسليم', description: 'Pickup / handover screen operator', descriptionAr: 'مشغل شاشة التسليم للعملاء', isCorporate: false },    CUSTOM: { en: 'Custom Role', ar: 'دور مخصص', description: 'Custom-defined role with selected permissions', descriptionAr: 'دور مخصص بصلاحيات محددة', isCorporate: false },
    // Legacy / seed aliases (older DB rows use these keys)
    ADMIN: { en: 'Administrator', ar: 'مدير النظام', description: 'System administrator', descriptionAr: 'مدير النظام', isCorporate: true },
    MANAGER: { en: 'Manager', ar: 'مدير', description: 'Branch operations manager', descriptionAr: 'مدير تشغيل الفرع', isCorporate: false },
    IT: { en: 'IT Support', ar: 'تقنية المعلومات', description: 'IT support and system configuration', descriptionAr: 'دعم تقني وإعداد النظام', isCorporate: true },
    KITCHEN: { en: 'Kitchen', ar: 'المطبخ', description: 'Kitchen display and order preparation', descriptionAr: 'شاشة المطبخ وتحضير الطلبات', isCorporate: false },
    STAFF: { en: 'Staff', ar: 'موظف', description: 'General staff access', descriptionAr: 'وصول عام للموظفين', isCorporate: false },
    COOK: { en: 'Cook', ar: 'طباخ', description: 'Kitchen preparation', descriptionAr: 'تحضير المطبخ', isCorporate: false },
    SUPERVISOR: { en: 'Supervisor', ar: 'مشرف', description: 'Shift supervision', descriptionAr: 'إشراف الوردية', isCorporate: false },
};

/** Normalize any role identifier (id like `role_owner`, name like `OWNER`, raw Arabic) to a dict key. */
export function normalizeRoleKey(input: string): string {
    const raw = String(input || '').trim();
    if (!raw) return '';
    // DB ids like role_owner / custom_xxx
    if (/^role_/i.test(raw)) return raw.replace(/^role_/i, '').toUpperCase();
    return raw.toUpperCase();
}

export interface RoleLike {
    id?: string;
    name?: string;
    nameAr?: string;
    nameEn?: string;
}

function containsArabic(s: string): boolean {
    return /[\u0600-\u06FF]/.test(s || '');
}

/**
 * Resolve display label for a role in the requested language.
 * - Built-in keys → always from ROLE_I18N (never raw codes, never mixed).
 * - Custom roles ({name, nameAr}) → pick per lang; if the wanted lang value is
 *   missing or in the wrong script, fall back to the other value.
 */
export function getRoleLabel(
    role: string | RoleLike | null | undefined,
    lang: string,
    fallback = '',
): string {
    const isAr = lang === 'ar';
    if (role == null) return fallback;
    const obj: RoleLike = typeof role === 'string' ? { name: role } : role;
    const candidates = [obj.name, obj.id].filter(Boolean) as string[];
    for (const c of candidates) {
        const key = normalizeRoleKey(c);
        const entry = ROLE_I18N[key];
        if (entry) return isAr ? entry.ar : entry.en;
    }
    // Custom role: name = EN, nameAr = AR (older rows may have only one filled)
    const en = (obj.nameEn || obj.name || '').trim();
    const ar = (obj.nameAr || '').trim();
    if (isAr) {
        if (ar) return ar;
        if (en && containsArabic(en)) return en;
        if (en) return en; // last resort — better than blank
        return fallback;
    }
    if (en && !containsArabic(en)) return en;
    if (ar && !containsArabic(ar)) return ar; // latin stored in nameAr
    if (en) return en;
    if (ar) return ar;
    return fallback;
}

export function getRoleDescription(
    role: string | RoleLike | null | undefined,
    lang: string,
    fallback = '',
): string {
    const isAr = lang === 'ar';
    const key = typeof role === 'string' ? normalizeRoleKey(role) : normalizeRoleKey(role?.name || role?.id || '');
    const entry = ROLE_I18N[key];
    if (entry) return isAr ? (entry.descriptionAr || entry.description || fallback) : (entry.description || fallback);
    return fallback;
}

export function isRoleCorporate(role: string | RoleLike | null | undefined): boolean {
    const key = typeof role === 'string' ? normalizeRoleKey(role) : normalizeRoleKey(role?.name || role?.id || '');
    return ROLE_I18N[key]?.isCorporate ?? false;
}

/** Match localized text (en + ar + raw key) for search boxes. */
export function roleMatchesQuery(
    role: string | RoleLike | null | undefined,
    query: string,
): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const obj: RoleLike = typeof role === 'string' ? { name: role } : (role || {});
    const key = normalizeRoleKey(obj.name || obj.id || (typeof role === 'string' ? role : ''));
    const entry = ROLE_I18N[key];
    const hay = [
        obj.name || '',
        obj.nameAr || '',
        obj.nameEn || '',
        obj.id || '',
        key,
        entry?.en || '',
        entry?.ar || '',
    ].join(' ').toLowerCase();
    return hay.includes(q);
}
