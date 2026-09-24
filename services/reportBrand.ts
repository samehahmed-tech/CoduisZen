/**
 * reportBrand — single source of truth for premium report exports
 * (Excel / PDF / print). Logo + system + restaurant + branch + Cairo,
 * full Arabic/English support.
 */

export const REPORT_SYSTEM_NAME = 'Coduis Zen';

/** Optional system logo (shown next to the restaurant logo on every report surface). */
export const REPORT_SYSTEM_LOGO_URL = '/logo.png?v=2';

/** Default restaurant logo (the transparent system mark). Versioned to bust stale caches. */
export const DEFAULT_RESTAURANT_LOGO_URL = '/logo.png?v=2';

/** Cairo-first stack: Arabic + Latin render in one family, Tahoma fallback offline. */
export const REPORT_FONT_STACK = "'Cairo','Segoe UI',Tahoma,Arial,sans-serif";

/** Escape text injected into print/PDF HTML shells (XSS-safe). */
export const escReportHtml = (s: unknown) =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Landscape when the table is wide, portrait otherwise — one rule everywhere. */
export const pickReportOrientation = (columnCount: number): 'landscape' | 'portrait' =>
    columnCount > 5 ? 'landscape' : 'portrait';

const normLogoUrl = (u?: string): string => {
    const s = String(u || '').trim().toLowerCase();
    if (!s) return '';
    // Data URLs: strict compare. Paths/URLs: compare by pathname so
    // '/logo.png' === 'https://host/logo.png' (same file, no duplicate).
    if (s.startsWith('data:')) return s;
    try {
        return new URL(s, 'http://x').pathname.replace(/\/+$/, '') || s;
    } catch {
        return s;
    }
};

/** True when both URLs point at the same image — render ONE logo, not two. */
export const isSameLogoUrl = (a?: string, b?: string): boolean => {
    const na = normLogoUrl(a);
    const nb = normLogoUrl(b);
    return !!na && na === nb;
};

/** Premium ink palette — deep navy, teal accent, gold rule. */
export const REPORT_PALETTE = {
    navy: '10243E',
    navyDeep: '0B1B30',
    teal: '0F766E',
    tealDark: '0C5F59',
    gold: 'C9A227',
    goldSoft: 'F3E9C8',
    ink: '142033',
    muted: '64748B',
    line: 'DBE4EE',
    band: 'F4F7FA',
    bandAlt: 'F8FBFF',
    white: 'FFFFFF',
    danger: 'BE123C',
    css: {
        navy: '#10243e',
        navyDeep: '#0b1b30',
        teal: '#0f766e',
        tealDark: '#0c5f59',
        gold: '#c9a227',
        goldSoft: '#f3e9c8',
        ink: '#142033',
        muted: '#64748b',
        line: '#dbe4ee',
        band: '#f4f7fa',
        bandAlt: '#f8fbff',
        white: '#ffffff',
        danger: '#be123c',
    },
};

export interface ReportBrandInput {
    settings: {
        restaurantName?: string;
        restaurantNameAr?: string;
        receiptLogoUrl?: string;
        systemLogoUrl?: string;
        language?: string;
    };
    branchName?: string;
    reportTitle: string;
    categoryLabel?: string;
    rangeStart: string;
    rangeEnd: string;
    isArabic: boolean;
}

export interface ReportBrand {
    systemName: string;
    systemTagline: string;
    /** Second mark — undefined when it duplicates the restaurant logo. */
    systemLogoUrl?: string;
    restaurant: string;
    branch: string;
    logoUrl?: string;
    reportTitle: string;
    categoryLabel: string;
    rangeText: string;
    generatedAt: string;
    generatedLabel: string;
    pageLabel: string;
    totalLabel: string;
    allBranchesLabel: string;
    isArabic: boolean;
    align: 'right' | 'left';
    dir: 'rtl' | 'ltr';
}

/** Resolve every branded string for an export in one place. */
export function getReportBrand(input: ReportBrandInput): ReportBrand {
    const { settings, isArabic } = input;
    const restaurant =
        (isArabic ? settings.restaurantNameAr || settings.restaurantName : settings.restaurantName) ||
        REPORT_SYSTEM_NAME;
    const branch = input.branchName || (isArabic ? 'كل الفروع' : 'All branches');
    const logoUrl = settings.receiptLogoUrl || DEFAULT_RESTAURANT_LOGO_URL;
    const systemRaw = (settings as any).systemLogoUrl || REPORT_SYSTEM_LOGO_URL;
    return {
        systemName: REPORT_SYSTEM_NAME,
        systemTagline: isArabic ? 'نظام إدارة المطاعم' : 'Restaurant OS',
        // Never show the same image twice side-by-side.
        systemLogoUrl: isSameLogoUrl(systemRaw, logoUrl) ? undefined : systemRaw,
        restaurant,
        branch,
        logoUrl,
        reportTitle: input.reportTitle,
        categoryLabel: input.categoryLabel || '',
        rangeText: isArabic
            ? `الفترة: ${input.rangeStart} إلى ${input.rangeEnd}`
            : `Range: ${input.rangeStart} to ${input.rangeEnd}`,
        generatedAt: new Date().toLocaleString(isArabic ? 'ar-EG' : 'en-GB'),
        generatedLabel: isArabic ? 'تاريخ التصدير' : 'Generated',
        pageLabel: isArabic ? 'صفحة' : 'Page',
        totalLabel: isArabic ? 'الإجمالي' : 'TOTAL',
        allBranchesLabel: isArabic ? 'كل الفروع' : 'All branches',
        isArabic,
        align: isArabic ? 'right' : 'left',
        dir: isArabic ? 'rtl' : 'ltr',
    };
}
