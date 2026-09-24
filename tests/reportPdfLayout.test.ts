import { describe, expect, it } from 'vitest';
import {
    buildPdfCover,
    buildPdfPageFooter,
    buildPdfRunningHead,
    getA4PageGeometry,
    PDF_CHART_STRIP_SELECTOR,
    PDF_DOC_CSS,
    PDF_STRIP_SELECTOR,
    PX_PER_MM,
} from '../services/reportPdf';

describe('A4 page geometry (exact, printable)', () => {
    it('landscape content box matches the printable A4 area', () => {
        const g = getA4PageGeometry('landscape');
        expect(g.pageWmm).toBe(297);
        expect(g.pageHmm).toBe(210);
        expect(g.contentWmm).toBe(277);
        expect(g.contentHmm).toBe(186);
        expect(g.contentWpx).toBe(Math.round(277 * PX_PER_MM));
        expect(g.contentHpx).toBe(Math.round(186 * PX_PER_MM));
    });

    it('portrait content box matches the printable A4 area', () => {
        const g = getA4PageGeometry('portrait');
        expect(g.pageWmm).toBe(210);
        expect(g.pageHmm).toBe(297);
        expect(g.contentWmm).toBe(190);
        expect(g.contentHmm).toBe(273);
        expect(g.contentWpx).toBe(Math.round(190 * PX_PER_MM));
        expect(g.contentHpx).toBe(Math.round(273 * PX_PER_MM));
    });

    it('content box plus margins reconstructs the full A4 sheet', () => {
        for (const o of ['landscape', 'portrait'] as const) {
            const g = getA4PageGeometry(o);
            expect(g.contentWmm + g.marginXmm * 2).toBe(g.pageWmm);
            expect(g.contentHmm + g.marginTopMm + g.footerReserveMm).toBe(g.pageHmm);
        }
    });
});

describe('PDF cover (Arabic-safe HTML)', () => {
    it('renders title, restaurant, branch and chips with RTL direction', () => {
        const html = buildPdfCover({
            title: 'تقرير المبيعات اليومية',
            restaurant: 'مطعم السماح',
            branchName: 'فرع مدينة نصر',
            metaChips: ['2026-09-01 → 2026-09-16'],
            subtitle: 'ملخص',
            isArabic: true,
            dateText: '16/09/2026',
        });
        expect(html).toContain('dir="rtl"');
        expect(html).toContain('تقرير المبيعات اليومية');
        expect(html).toContain('مطعم السماح');
        expect(html).toContain('فرع مدينة نصر');
        expect(html).toContain('2026-09-01 → 2026-09-16');
        expect(html).toContain('16/09/2026');
    });

    it('escapes hostile input instead of breaking markup', () => {
        const html = buildPdfCover({ title: '<img src=x onerror=alert(1)>', restaurant: 'R&A' });
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img');
        expect(html).toContain('R&amp;A');
    });

    it('renders LTR English cover without Arabic direction', () => {
        const html = buildPdfCover({ title: 'Daily Sales', restaurant: 'Sameh', isArabic: false });
        expect(html).toContain('dir="ltr"');
        expect(html).toContain('Daily Sales');
    });
});

describe('PDF running head and footer (Arabic-safe HTML, no jsPDF text)', () => {
    it('numbers pages in Arabic when requested', () => {
        const html = buildPdfPageFooter({ isArabic: true, systemName: 'Coduis Zen', restaurant: 'مطعم السماح', dateText: 'د' }, 2, 7);
        expect(html).toContain('صفحة 2 / 7');
        expect(html).toContain('Coduis Zen • مطعم السماح');
    });

    it('numbers pages in English otherwise', () => {
        const html = buildPdfPageFooter({ restaurant: 'Sameh' }, 1, 3);
        expect(html).toContain('Page 1 / 3');
        expect(html).toContain('dir="ltr"');
    });

    it('builds a compact running head with branch chip', () => {
        const html = buildPdfRunningHead({ title: 'تقرير', branchName: 'فرع 1', isArabic: true });
        expect(html).toContain('تقرير');
        expect(html).toContain('فرع 1');
        expect(html).toContain('pdf-page-head');
    });
});

describe('screen-only stripping (buttons never reach the PDF)', () => {
    it('covers interactive controls and opt-out markers', () => {
        for (const part of ['button', 'input', 'select', 'textarea', '[data-pdf-hide]']) {
            expect(PDF_STRIP_SELECTOR).toContain(part);
        }
    });
});

describe('capture stylesheet constraints (html2canvas-safe, Arabic-safe)', () => {
    it('never uses logical properties that html2canvas drops', () => {
        const rulesOnly = PDF_DOC_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
        expect(rulesOnly).not.toContain('inline-start');
        expect(rulesOnly).not.toMatch(/gap\s*:/);
    });

    it('zeroes letter-spacing under RTL so Arabic letters stay joined', () => {
        expect(PDF_DOC_CSS).toContain('[dir="rtl"]');
        expect(PDF_DOC_CSS).toContain('letter-spacing: 0');
    });

    it('keeps body type at a readable print size', () => {
        expect(PDF_DOC_CSS).toContain('font-size: 11px;');
    });
});

describe('tables-only PDF (charts stripped, cells centered)', () => {
    it('targets recharts wrappers and blank-capture canvases', () => {
        expect(PDF_CHART_STRIP_SELECTOR).toContain('.recharts-wrapper');
        expect(PDF_CHART_STRIP_SELECTOR).toContain('.recharts-responsive-container');
        expect(PDF_CHART_STRIP_SELECTOR).toContain('canvas');
    });

    it('centers header, body and totals cells', () => {
        const rulesOnly = PDF_DOC_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
        expect(rulesOnly).toContain('.pdf-doc th');
        expect(rulesOnly).toContain('text-align: center');
    });
});
