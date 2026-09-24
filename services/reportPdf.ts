/**
 * Direct designer-PDF pipeline for reports (no print dialog).
 * Heavy libs (html2canvas + jspdf) load lazily on first export only.
 *
 * How it works: the report HTML is paginated into exact A4 page boxes
 * BEFORE capture (tables split row-wise with repeated headers, nothing is
 * ever cut mid-row), every page is captured separately, and each capture
 * lands on exactly one A4 PDF page. Footers/headers are part of the HTML,
 * so Arabic renders pixel-perfect — jsPDF never touches text (its built-in
 * fonts cannot shape Arabic).
 */

import { isSameLogoUrl } from './reportBrand';

export interface DirectPdfOptions {
    filename: string;
    title: string;
    restaurant: string;
    logoUrl?: string;
    /** Second logo: the ERP/system mark shown beside the restaurant logo. */
    systemLogoUrl?: string;
    metaChips?: string[];
    subtitle?: string;
    orientation?: 'landscape' | 'portrait';
    isArabic?: boolean;
    /** Brand extras — default to Coduis Zen when omitted. */
    systemName?: string;
    systemTagline?: string;
    branchName?: string;
    /** Printed in the cover meta grid ("Prepared by …"). */
    generatedBy?: string;
}

const esc = (s: string) =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** CSS pixels per millimetre at the 96dpi reference density. */
export const PX_PER_MM = 96 / 25.4;

export interface A4PageGeometry {
    orientation: 'landscape' | 'portrait';
    pageWmm: number;
    pageHmm: number;
    marginXmm: number;
    marginTopMm: number;
    footerReserveMm: number;
    contentWmm: number;
    contentHmm: number;
    contentWpx: number;
    contentHpx: number;
}

/**
 * Exact A4 content-box geometry. The capture width and the jsPDF image box
 * both derive from here, so what you see is exactly one A4 page.
 * landscape → 277×186mm (1047×703px), portrait → 190×273mm (718×1032px).
 */
export function getA4PageGeometry(orientation: 'landscape' | 'portrait' = 'landscape'): A4PageGeometry {
    const landscape = orientation === 'landscape';
    const pageWmm = landscape ? 297 : 210;
    const pageHmm = landscape ? 210 : 297;
    const marginXmm = 10;
    const marginTopMm = 10;
    const footerReserveMm = 14;
    const contentWmm = pageWmm - marginXmm * 2;
    const contentHmm = pageHmm - marginTopMm - footerReserveMm;
    return {
        orientation,
        pageWmm,
        pageHmm,
        marginXmm,
        marginTopMm,
        footerReserveMm,
        contentWmm,
        contentHmm,
        contentWpx: Math.round(contentWmm * PX_PER_MM),
        contentHpx: Math.round(contentHmm * PX_PER_MM),
    };
}

/** Reserved vertical space (px) for the running head / footer strips (mirrored in CSS). */
export const PDF_HEAD_RESERVE_PX = 58;
export const PDF_FOOT_RESERVE_PX = 34;
const PDF_SLACK_PX = 8;

export type PdfCoverOptions = Pick<
    DirectPdfOptions,
    'title' | 'restaurant' | 'logoUrl' | 'systemLogoUrl' | 'metaChips' | 'subtitle' | 'isArabic' | 'systemName' | 'systemTagline' | 'branchName' | 'generatedBy'
>;

/** Branded A4 cover header rendered as the first page content. */
export function buildPdfCover(opts: PdfCoverOptions & { dateText?: string }): string {
    const dir = opts.isArabic ? 'rtl' : 'ltr';
    const system = opts.systemName || 'Coduis Zen';
    const tagline = opts.systemTagline || (opts.isArabic ? 'نظام إدارة المطاعم' : 'Restaurant OS');
    const dateText = opts.dateText || new Date().toLocaleString(opts.isArabic ? 'ar-EG' : 'en-GB');
    const chips = (opts.metaChips || []).filter(Boolean).map((m) => `<span class="pdf-chip">${esc(m)}</span>`).join('');
    const branchChip = opts.branchName ? `<span class="pdf-chip pdf-chip-branch">${esc(opts.branchName)}</span>` : '';
    const byChip = opts.generatedBy
        ? `<div class="pdf-meta-cell"><span class="pdf-meta-k">${esc(opts.isArabic ? 'أعدّه' : 'Prepared by')}</span><span class="pdf-meta-v">${esc(opts.generatedBy)}</span></div>`
        : '';
    return `
    <div class="pdf-cover" dir="${dir}">
      <div class="pdf-eyebrow">${esc(system)} &nbsp;•&nbsp; ${esc(tagline)}</div>
      <div class="pdf-brand">
        ${opts.logoUrl ? `<img class="pdf-logo" src="${opts.logoUrl}" alt="" crossorigin="anonymous" onerror="this.style.display='none'" />` : ''}
        ${opts.systemLogoUrl && !isSameLogoUrl(opts.systemLogoUrl, opts.logoUrl) ? `<img class="pdf-logo pdf-logo-system" src="${opts.systemLogoUrl}" alt="" crossorigin="anonymous" onerror="this.style.display='none'" />` : ''}
        <div class="pdf-brand-text">
          <div class="pdf-restaurant">${esc(opts.restaurant)}</div>
        </div>
      </div>
      <div class="pdf-titleband"><div class="pdf-title">${esc(opts.title)}</div>${
        opts.subtitle ? `<div class="pdf-sub">${esc(opts.subtitle)}</div>` : ''
    }</div>
      <div class="pdf-meta-grid">
        <div class="pdf-meta-cell"><span class="pdf-meta-k">${esc(opts.isArabic ? 'التاريخ' : 'Generated')}</span><span class="pdf-meta-v">${esc(dateText)}</span></div>
        ${byChip}
      </div>
      ${(chips || branchChip) ? `<div class="pdf-chips">${branchChip}${chips}</div>` : ''}
    </div>`;
}

export interface PdfHeadFootOptions {
    isArabic?: boolean;
    systemName?: string;
    systemTagline?: string;
    title?: string;
    branchName?: string;
    restaurant?: string;
    dateText?: string;
}

/** Compact running header for pages 2+ (first page carries the full cover). */
export function buildPdfRunningHead(opts: PdfHeadFootOptions): string {
    const dir = opts.isArabic ? 'rtl' : 'ltr';
    const system = opts.systemName || 'Coduis Zen';
    return `
    <div class="pdf-page-head" dir="${dir}">
      <span class="pdf-head-system">${esc(system)}${opts.systemTagline ? ` • ${esc(opts.systemTagline)}` : ''}</span>
      <span class="pdf-head-title">${esc(opts.title || '')}</span>
      ${opts.branchName ? `<span class="pdf-head-branch">${esc(opts.branchName)}</span>` : ''}
    </div>`;
}

/** Page footer strip — pure HTML so Arabic shapes correctly (jsPDF text cannot). */
export function buildPdfPageFooter(opts: PdfHeadFootOptions, page: number, totalPages: number): string {
    const dir = opts.isArabic ? 'rtl' : 'ltr';
    const system = opts.systemName || 'Coduis Zen';
    const dateText = opts.dateText || new Date().toLocaleString(opts.isArabic ? 'ar-EG' : 'en-GB');
    const pageText = opts.isArabic ? `صفحة ${page} / ${totalPages}` : `Page ${page} / ${totalPages}`;
    return `
    <div class="pdf-page-foot" dir="${dir}">
      <div class="pdf-foot-rule"></div>
      <div class="pdf-foot-row">
        <span class="pdf-foot-brand">${esc(system)} • ${esc(opts.restaurant || '')}</span>
        <span class="pdf-foot-date">${esc(dateText)}</span>
        <span class="pdf-foot-page">${esc(pageText)}</span>
      </div>
    </div>`;
}

/**
 * html2canvas 1.x only understands classic CSS colors (hex/rgb/hsl). The app
 * runs Tailwind v4, so computed styles routinely contain oklch()/lab()/
 * color-mix() — any one of them makes the capture THROW and the export falls
 * back to the print dialog. This walks the (live, off-screen) capture tree
 * and rewrites every unsupported color to an equivalent the canvas parser
 * accepts, before html2canvas ever sees it.
 */
const UNSUPPORTED_COLOR_FN = /(oklch|oklab|\blab\b|lch|color-mix|light-dark|color-contrast|device-cmyk)\s*\(/i;

let colorProbe: CanvasRenderingContext2D | null | undefined;
const toCanvasSafeColor = (value: string, fallback: string): string => {
    if (!value || !UNSUPPORTED_COLOR_FN.test(value)) return value;
    try {
        if (colorProbe === undefined) {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            colorProbe = canvas.getContext('2d', { willReadFrequently: true });
        }
        if (colorProbe) {
            colorProbe.fillStyle = '#000000';
            colorProbe.fillStyle = value as any;
            const parsed: string = colorProbe.fillStyle as string;
            // Accept the normalized result ONLY if it no longer contains an
            // unsupported function: some browsers accept lab()/oklch() in
            // canvas and echo them back verbatim, which would NOT fix the
            // html2canvas throw. Otherwise the getter keeps '#000000'.
            if (parsed && parsed !== '#000000' && !UNSUPPORTED_COLOR_FN.test(parsed)) return parsed;
        }
    } catch {
        // Probe unavailable — use the fallback below.
    }
    return fallback;
};

const SANITIZED_COLOR_PROPS: Array<{ prop: string; fallback: string }> = [
    { prop: 'color', fallback: '#142033' },
    { prop: 'background-color', fallback: 'transparent' },
    { prop: 'border-top-color', fallback: 'currentcolor' },
    { prop: 'border-right-color', fallback: 'currentcolor' },
    { prop: 'border-bottom-color', fallback: 'currentcolor' },
    { prop: 'border-left-color', fallback: 'currentcolor' },
    { prop: 'outline-color', fallback: 'currentcolor' },
    { prop: 'text-decoration-color', fallback: 'currentcolor' },
    { prop: 'column-rule-color', fallback: 'currentcolor' },
    { prop: 'fill', fallback: '#142033' },
    { prop: 'stroke', fallback: 'none' },
    { prop: 'stop-color', fallback: '#142033' },
    { prop: 'flood-color', fallback: '#000000' },
    { prop: 'lighting-color', fallback: '#ffffff' },
];

function sanitizeSubtreeForCanvas(root: HTMLElement): void {
    const walker: HTMLElement[] = [root];
    root.querySelectorAll('*').forEach((el) => walker.push(el as HTMLElement));
    for (const el of walker) {
        let cs: CSSStyleDeclaration;
        try {
            cs = window.getComputedStyle(el);
        } catch {
            continue;
        }
        for (const { prop, fallback } of SANITIZED_COLOR_PROPS) {
            let value = '';
            try {
                value = cs.getPropertyValue(prop);
            } catch {
                continue;
            }
            if (value && UNSUPPORTED_COLOR_FN.test(value)) {
                try {
                    el.style.setProperty(prop, toCanvasSafeColor(value, fallback), 'important');
                } catch {
                    // Non-stylable node — skip.
                }
            }
        }
        // Gradient backgrounds whose stops use modern colors also throw.
        // Dropping the decoration keeps every byte of content intact.
        try {
            const bg = cs.getPropertyValue('background-image');
            if (bg && bg !== 'none' && UNSUPPORTED_COLOR_FN.test(bg)) {
                el.style.setProperty('background-image', 'none', 'important');
            }
        } catch {
            // ignore
        }
    }
}

/** Capture stylesheet (exported for constraint tests — see reportPdfLayout.test.ts). */
export const PDF_DOC_CSS = `
  /* NOTE: html2canvas 1.x ignores flex gap + logical properties
     (margin-inline-start, border-inline-start, …) — this stylesheet uses
     physical properties + [dir] overrides only, so capture == design.
     NOTE 2: letter-spacing DISCONNECTS Arabic letters — it is enabled for
     LTR eyebrows/labels only and zeroed under [dir="rtl"]. */
  .pdf-doc { background: #ffffff; color: #142033; font-family: 'Cairo',Tahoma,'Segoe UI',Arial,sans-serif; padding: 0; }
  .pdf-page { background: #ffffff; color: #142033; overflow: hidden; display: flex; flex-direction: column; }
  .pdf-page-body { flex: 1 1 auto; min-height: 0; }
  [dir="rtl"] .pdf-eyebrow, [dir="rtl"] .pdf-meta-k, [dir="rtl"] .pdf-head-system, [dir="rtl"] .pdf-stat-k { letter-spacing: 0 !important; }
  /* ---- cover (compact: data must start on page 1) ---- */
  .pdf-cover { border: 1px solid #d7e1ec; border-radius: 12px; overflow: hidden; margin-bottom: 8px; background: #ffffff; }
  .pdf-eyebrow { font-size: 9px; font-weight: 800; color: #0f766e; text-transform: uppercase; letter-spacing: 0.14em; padding: 6px 18px 0; }
  .pdf-brand { display: flex; align-items: center; padding: 6px 18px 0; }
  .pdf-brand > * { margin: 0 6px; }
  .pdf-brand > *:first-child { margin-left: 0; margin-right: 6px; }
  [dir="rtl"] .pdf-brand > *:first-child { margin-right: 0; margin-left: 6px; }
  /* Natural logo shape: fixed height, auto width — a wide banner is never
     squeezed into a square. */
  .pdf-logo { height: 52px; width: auto; max-width: 230px; object-fit: contain; border-radius: 10px; border: 1px solid #c9a227; background: linear-gradient(135deg,#0b1b30,#020617); padding: 4px 10px; }
  .pdf-restaurant { font-size: 15px; font-weight: 800; color: #0f766e; }
  .pdf-titleband { background: #10243e; border-bottom: 4px solid #c9a227; border-radius: 8px; padding: 9px 18px; margin: 8px 14px 0; }
  .pdf-title { font-size: 21px; font-weight: 900; color: #ffffff; line-height: 1.35; }
  .pdf-sub { font-size: 11px; font-weight: 700; color: #c9d6e2; margin-top: 2px; }
  .pdf-meta-grid { display: flex; flex-wrap: wrap; padding: 6px 12px 0 12px; }
  .pdf-meta-cell { display: flex; align-items: baseline; margin: 0 10px 3px 10px; font-size: 10px; }
  .pdf-meta-cell > * { margin: 0 3px; }
  .pdf-meta-k { font-weight: 800; color: #7b8aa0; text-transform: uppercase; letter-spacing: 0.06em; font-size: 9px; }
  .pdf-meta-v { font-weight: 800; color: #10243e; }
  .pdf-chips { display: flex; flex-wrap: wrap; padding: 6px 14px 8px 14px; }
  .pdf-chip { border: 1px solid #d7e1ec; border-radius: 999px; padding: 4px 10px; margin: 2px 3px; background: #f4f8fb; font-size: 10px; font-weight: 800; color: #3d4f63; }
  .pdf-chip-branch { background: #10243e; border-color: #10243e; color: #ffffff; }
  /* ---- running head / footer ---- */
  .pdf-page-head { display: flex; align-items: center; height: 32px; margin-bottom: 12px; border-bottom: 2px solid #c9a227; padding-bottom: 8px; }
  .pdf-page-head > * { margin: 0 5px; }
  .pdf-page-head > *:first-child { margin-left: 0; }
  [dir="rtl"] .pdf-page-head > *:first-child { margin-left: 5px; margin-right: 0; }
  .pdf-head-system { font-size: 8.5px; font-weight: 800; color: #0f766e; text-transform: uppercase; letter-spacing: 0.1em; white-space: nowrap; }
  .pdf-head-title { font-size: 11px; font-weight: 900; color: #10243e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .pdf-head-branch { font-size: 9px; font-weight: 800; color: #ffffff; background: #10243e; border-radius: 999px; padding: 3px 10px; white-space: nowrap; margin-left: auto !important; }
  [dir="rtl"] .pdf-head-branch { margin-left: 5px !important; margin-right: auto !important; }
  .pdf-page-foot { margin-top: 10px; }
  .pdf-foot-rule { border-top: 2px solid #c9a227; margin-bottom: 6px; }
  .pdf-foot-row { display: flex; align-items: center; font-size: 8.5px; font-weight: 700; color: #64748b; }
  .pdf-foot-row > * { margin: 0 5px; }
  .pdf-foot-brand { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .pdf-foot-date { white-space: nowrap; margin-left: auto !important; }
  [dir="rtl"] .pdf-foot-date { margin-left: 5px !important; margin-right: auto !important; }
  .pdf-foot-page { font-weight: 900; color: #10243e; white-space: nowrap; }
  /* ---- report body ---- */
  .pdf-doc h2, .pdf-doc h3 { color: #10243e; font-weight: 900; margin: 10px 0 6px; }
  .pdf-doc h2 { font-size: 16px; border-left: 4px solid #c9a227; padding-left: 8px; }
  [dir="rtl"] .pdf-doc h2 { border-left: 0; border-right: 4px solid #c9a227; padding-left: 0; padding-right: 8px; }
  .pdf-doc h3 { font-size: 12.5px; color: #0f766e; }
  .pdf-doc p { font-size: 10.5px; color: #3d4f63; line-height: 1.7; margin: 4px 0; }
  .pdf-stats { display: flex; flex-wrap: wrap; margin: 6px -4px 6px -4px; }
  .pdf-stat { flex: 1 1 140px; border: 1px solid #d7e1ec; border-radius: 10px; padding: 8px 12px; margin: 4px; background: #f4f8fb; }
  .pdf-stat-k { display: block; font-size: 9px; font-weight: 800; color: #7b8aa0; text-transform: uppercase; letter-spacing: 0.06em; }
  .pdf-stat-v { display: block; font-size: 18px; font-weight: 900; color: #10243e; font-variant-numeric: tabular-nums; }
  .pdf-doc table { width: 100%; border-collapse: collapse; margin: 6px 0 4px; }
  .pdf-doc thead th { background: #10243e; color: #ffffff; padding: 9px 10px; font-size: 11px; font-weight: 900; border: 1px solid #10243e; border-bottom: 3px solid #c9a227; white-space: nowrap; }
  .pdf-doc td { padding: 6px 10px; border: 1px solid #d5dee8; font-size: 12px; color: #142033; font-variant-numeric: tabular-nums; line-height: 1.5; }
  /* Every table cell centered (headers, body, totals) — beats the screen's
     per-column alignments (Tailwind .text-right etc.) via !important. */
  .pdf-doc th, .pdf-doc td { text-align: center !important; }
  .pdf-doc tbody tr:nth-child(even) { background: #f2f6fa; }
  .pdf-doc tbody td:first-child { font-weight: 800; }
  .pdf-doc tfoot td { background: #0f766e; color: #ffffff; font-weight: 900; border: 1px solid #0f766e; font-size: 11px; }
  /* Full-data print tables replace the paginated screen tables in exports. */
  .pdf-doc .report-full-print { display: block !important; }
  .pdf-doc .report-screen-only .responsive-table,
  .pdf-doc .report-screen-only { display: none !important; }
  .pdf-doc .report-full-print table { width: 100%; border-collapse: collapse; }
  .pdf-logo-system { border-color: #c9a227 !important; }
`;

/** Elements that belong to the screen only and must never appear in a PDF. */
export const PDF_STRIP_SELECTOR = 'button, input, select, textarea, [data-pdf-hide]';

/**
 * Chart containers stripped from PDF exports: the PDF is a tables-only
 * accounting document (clearer + smaller). Recharts mounts everything
 * inside .recharts-wrapper; bare <canvas> would capture blank anyway.
 * Stripping applies only when the report has at least one table — a
 * charts-only report keeps its visuals instead of exporting empty.
 */
export const PDF_CHART_STRIP_SELECTOR =
    '.recharts-responsive-container, .recharts-wrapper, canvas, .report-chart-block, .chart-block';

/** Body rows of a table (excludes header/footer rows). */
function bodyRowsOf(table: HTMLTableElement): HTMLTableRowElement[] {
    return Array.from(table.querySelectorAll('tr')).filter(
        (tr) => !(tr as HTMLElement).closest('thead') && !(tr as HTMLElement).closest('tfoot'),
    ) as HTMLTableRowElement[];
}

function cloneTableShell(table: HTMLTableElement, withCaption: boolean): HTMLTableElement {
    const shell = document.createElement('table');
    shell.className = table.className;
    if (table.getAttribute('dir')) shell.setAttribute('dir', table.getAttribute('dir')!);
    if (withCaption) {
        const caption = table.querySelector('caption');
        if (caption) shell.appendChild(caption.cloneNode(true));
    }
    const colgroup = table.querySelector('colgroup');
    if (colgroup) shell.appendChild(colgroup.cloneNode(true));
    const thead = table.querySelector('thead');
    if (thead) shell.appendChild(thead.cloneNode(true));
    shell.appendChild(document.createElement('tbody'));
    return shell;
}

/**
 * Split report nodes across fixed-height page bodies. Tables split row-wise
 * (header repeats on every chunk, totals stay with the last chunk); every
 * other node moves atomically. A node taller than a whole page is isolated
 * on its own page and shrink-fitted at render time — never clipped, never
 * an infinite loop.
 *
 * Bodies live inside `measureHost` (attached to the document) while filling:
 * layout measurements on detached nodes read zero and would disable
 * pagination entirely.
 */
function paginateNodes(
    nodes: Node[],
    measureHost: HTMLElement,
    contentWpx: number,
    budgetForPage: (pageIndex: number) => number,
): HTMLElement[] {
    const newPageBody = () => {
        const b = document.createElement('div');
        b.className = 'pdf-page-body';
        b.setAttribute('style', `width:${contentWpx}px;`);
        measureHost.appendChild(b);
        return b;
    };
    const pages: HTMLElement[] = [];
    let pageIndex = 0;
    let current = newPageBody();
    pages.push(current);
    const fits = () => current.scrollHeight <= budgetForPage(pageIndex) + 1;

    const startFreshPage = () => {
        pageIndex += 1;
        current = newPageBody();
        pages.push(current);
    };

    const appendAtomic = (node: Node) => {
        current.appendChild(node);
        if (!fits() && current.childNodes.length > 1) {
            // Move the overflowing node (currently the last child) along.
            current.removeChild(node);
            startFreshPage();
            current.appendChild(node);
        }
    };

    const appendTable = (table: HTMLTableElement) => {
        const rows = bodyRowsOf(table);
        const tfoot = table.querySelector('tfoot');
        if (rows.length === 0) {
            appendAtomic(table);
            return;
        }
        // Detach source rows; chunks take ownership progressively.
        const pending = [...rows];
        let chunk = cloneTableShell(table, true);
        let chunkRows = 0;
        const chunkBody = () => chunk.querySelector('tbody')!;
        const freshChunk = (withCaption: boolean) => {
            chunk = cloneTableShell(table, withCaption);
            chunkRows = 0;
        };
        while (pending.length > 0) {
            if (chunkRows === 0 && current.childNodes.length > 0 && !fits()) startFreshPage();
            if (!chunk.isConnected) current.appendChild(chunk);
            const row = pending.shift()!;
            chunkBody().appendChild(row);
            chunkRows += 1;
            if (!fits() && chunkRows > 1) {
                // Move the overflowing row to a chunk on a fresh page.
                chunkBody().removeChild(row);
                chunkRows -= 1;
                pending.unshift(row);
                startFreshPage();
                freshChunk(false);
            }
        }
        if (tfoot && chunkRows > 0) {
            const footClone = tfoot.cloneNode(true);
            chunk.appendChild(footClone);
            if (!fits()) {
                // Totals overflowed: pull the last body row with them so the
                // totals never strand alone — or keep everything if it is the
                // only row (render fit-scales the page instead of clipping).
                if (chunkBody().childNodes.length > 1) {
                    const lastRow = chunkBody().lastChild!;
                    chunkBody().removeChild(lastRow);
                    chunk.removeChild(footClone);
                    startFreshPage();
                    freshChunk(false);
                    current.appendChild(chunk);
                    chunkBody().appendChild(lastRow);
                    chunk.appendChild(footClone);
                    chunkRows = 1;
                }
            }
        }
    };

    for (const node of nodes) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'TABLE') {
            appendTable(node as unknown as HTMLTableElement);
        } else if (node.nodeType === Node.TEXT_NODE && !String(node.textContent || '').trim()) {
            continue; // ignorable whitespace between blocks
        } else {
            if (node.nodeType === Node.TEXT_NODE) {
                const wrap = document.createElement('div');
                wrap.textContent = node.textContent;
                appendAtomic(wrap);
            } else {
                appendAtomic(node);
            }
        }
    }
    return pages;
}

/**
 * Render an HTML string to a multipage A4 PDF and download it.
 * Arabic/RTL renders pixel-perfect (everything is canvas, jsPDF never
 * touches text). Throws on failure so callers can fall back to print.
 */
export async function downloadHtmlPdf(bodyHtml: string, opts: DirectPdfOptions): Promise<void> {
    if (typeof document === 'undefined') throw new Error('PDF_EXPORT_REQUIRES_BROWSER');
    const geo = getA4PageGeometry(opts.orientation || 'landscape');
    const dir = opts.isArabic ? 'rtl' : 'ltr';
    const wrapper = document.createElement('div');
    wrapper.setAttribute(
        'style',
        `position:fixed;left:-12000px;top:0;width:${geo.contentWpx}px;background:#ffffff;color-scheme:light;` +
            `--bg-card:255 255 255;--bg-app:255 255 255;--bg-elevated:248 250 252;--bg-sidebar:248 250 252;` +
            `--text-main:15 23 42;--text-muted:100 116 139;--border-color:219 228 238;`
    );
    wrapper.setAttribute('dir', dir);
    const doc = document.createElement('div');
    doc.className = 'pdf-doc';
    doc.setAttribute('dir', dir);
    // Cairo for the capture (best effort online — Tahoma fallback offline).
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap';
    doc.appendChild(fontLink);
    const style = document.createElement('style');
    style.textContent = PDF_DOC_CSS;
    doc.appendChild(style);
    wrapper.appendChild(doc);
    document.body.appendChild(wrapper);

    // Force light theme during capture so accounting PDFs are always clean
    // and printable — WITHOUT any overlay: the `.dark` class is temporarily
    // moved from <html>/<body> down to the app host (#root), so the visible
    // app keeps its dark theme while the capture tree (a <body> child
    // outside #root) computes light. No flash, no progress page; the caller
    // button shows the loading state instead.
    const root = document.documentElement;
    const body = document.body;
    const appHost = document.getElementById('root');
    const hadDarkRoot = root.classList.contains('dark');
    const hadDarkBody = body.classList.contains('dark');
    const hadDark = hadDarkRoot || hadDarkBody;
    let movedDark = false;
    if (hadDark && appHost && !appHost.contains(wrapper)) {
        if (hadDarkRoot) root.classList.remove('dark');
        if (hadDarkBody) body.classList.remove('dark');
        appHost.classList.add('dark');
        movedDark = true;
    } else if (hadDark) {
        if (hadDarkRoot) root.classList.remove('dark');
        if (hadDarkBody) body.classList.remove('dark');
    }

    try {
        // Staging host for measuring (attached: getComputedStyle + layout work).
        const staging = document.createElement('div');
        staging.innerHTML = bodyHtml;
        // Screen-only chrome (export/print buttons, inputs, pagination hints
        // marked data-pdf-hide) is dropped BEFORE measuring so it neither
        // shows in the PDF nor steals page budget.
        staging.querySelectorAll(PDF_STRIP_SELECTOR).forEach((el) => el.remove());
        // Tables-only PDF: drop every chart container (recharts/canvas) so
        // the document is pure accounting data — clearer and smaller. Guard:
        // a report with no table at all keeps its visuals (never export empty).
        // Shell climb: a chart usually lives inside a bordered card with just
        // a heading — removing the chart alone leaves a giant EMPTY box
        // eating half a page, so the heading-only shell goes with it. The
        // climb stops at any ancestor holding a table or real prose.
        if (staging.querySelector('table')) {
            staging.querySelectorAll(PDF_CHART_STRIP_SELECTOR).forEach((chart) => {
                let node: Element | null = chart;
                let candidate: Element | null = chart;
                while (node?.parentElement && node.parentElement !== staging) {
                    const parent = node.parentElement;
                    if (parent.querySelector('table')) break;
                    if (((parent.textContent || '').trim().length) > 160) break;
                    candidate = parent;
                    node = parent;
                }
                if (candidate && !candidate.querySelector('table')) candidate.remove();
            });
        }
        doc.appendChild(staging);

        // Let images/fonts settle BEFORE measuring (cover height + page
        // budgets must use final metrics, or Cairo loading late shifts text
        // and the footer gets pushed out of its box). Cairo weights are
        // requested explicitly — fonts.ready alone may resolve while the
        // weights we actually render are still in flight.
        try {
            const fontsApi: any = (document as any).fonts;
            if (fontsApi?.load) {
                await Promise.race([
                    Promise.all([
                        fontsApi.load('400 12px Cairo'),
                        fontsApi.load('700 16px Cairo'),
                        fontsApi.load('900 24px Cairo'),
                    ]).then(() => fontsApi.ready),
                    new Promise((r) => setTimeout(r, 1500)),
                ]);
            } else {
                await Promise.race([
                    fontsApi?.ready,
                    new Promise((r) => setTimeout(r, 1200)),
                ]);
            }
        } catch {
            // font API unavailable — continue with fallbacks
        }
        await new Promise((r) => setTimeout(r, 300));

        // Cover first so its real height sizes page one.
        const coverHost = document.createElement('div');
        coverHost.innerHTML = buildPdfCover(opts);
        const coverEl = coverHost.firstElementChild as HTMLElement;
        doc.insertBefore(coverEl, staging);
        void doc.offsetHeight;
        const coverH = coverEl.offsetHeight || 0;

        const budgetForPage = (pageIndex: number) =>
            geo.contentHpx -
            (pageIndex === 0 ? 0 : PDF_HEAD_RESERVE_PX) -
            PDF_FOOT_RESERVE_PX -
            (pageIndex === 0 ? coverH : 0) -
            PDF_SLACK_PX;

        const nodes = Array.from(staging.childNodes);
        staging.remove();
        // Measuring host stays attached: detached nodes report zero height.
        const measureHost = document.createElement('div');
        doc.appendChild(measureHost);
        const pageBodies = paginateNodes(nodes, measureHost, geo.contentWpx, budgetForPage);

        // Wrap bodies into fixed A4 page boxes (cover / running head / footer).
        const dateText = new Date().toLocaleString(opts.isArabic ? 'ar-EG' : 'en-GB');
        const pages: HTMLElement[] = pageBodies.map((body, i) => {
            const page = document.createElement('div');
            page.className = 'pdf-page';
            page.setAttribute('style', `width:${geo.contentWpx}px;height:${geo.contentHpx}px;`);
            if (i === 0) {
                page.appendChild(coverEl);
            } else {
                const headHost = document.createElement('div');
                headHost.innerHTML = buildPdfRunningHead(opts);
                page.appendChild(headHost.firstElementChild as HTMLElement);
            }
            page.appendChild(body);
            const footHost = document.createElement('div');
            // Footer count is final here (no pages are added after wrapping).
            footHost.innerHTML = buildPdfPageFooter({ ...opts, dateText }, i + 1, pageBodies.length);
            page.appendChild(footHost.firstElementChild as HTMLElement);
            return page;
        });
        // Bodies moved out of the measuring host into their page boxes.
        measureHost.remove();
        pages.forEach((p) => doc.appendChild(p));

        // Rewrite Tailwind-v4 modern colors (oklch/color-mix/…) to canvas-safe
        // equivalents — otherwise html2canvas throws and the export degrades
        // to the print dialog. MUST run on the attached tree under the final
        // (light) theme: getComputedStyle on detached nodes misses stylesheet
        // rules, leaving modern colors in place.
        sanitizeSubtreeForCanvas(doc);
        // Neutralize shadows (print-clean) without touching layout.
        doc.querySelectorAll('*').forEach((el) => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.boxShadow = 'none';
            htmlEl.style.textShadow = 'none';
        });
        // Force style recalc so the inline overrides win everywhere.
        void doc.offsetHeight;
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
            import('html2canvas'),
            import('jspdf'),
        ]);

        const pdf = new jsPDF({ orientation: geo.orientation, unit: 'mm', format: 'a4', compress: true });
        const scale = pages.length > 12 ? 1.25 : pages.length > 6 ? 1.5 : 2;
        for (let i = 0; i < pages.length; i += 1) {
            const pageEl = pages[i];
            // Over-tall loner content (a chart taller than a page) is captured
            // whole, then shrink-fitted into the A4 box — clipped never.
            const prevH = pageEl.style.height;
            const prevO = pageEl.style.overflow;
            const overflowing = pageEl.scrollHeight - pageEl.clientHeight > 2;
            if (overflowing) {
                pageEl.style.height = 'auto';
                pageEl.style.overflow = 'visible';
            }
            let canvas: HTMLCanvasElement;
            try {
                canvas = await html2canvas(pageEl, {
                    backgroundColor: '#ffffff',
                    scale,
                    useCORS: true,
                    logging: false,
                });
            } finally {
                pageEl.style.height = prevH;
                pageEl.style.overflow = prevO;
            }
            if (i > 0) pdf.addPage();
            const natWmm = (canvas.width * geo.contentWmm) / geo.contentWpx;
            const natHmm = (canvas.height * geo.contentHmm) / geo.contentHpx;
            const fit = Math.min(1, geo.contentWmm / natWmm, geo.contentHmm / natHmm);
            const wmm = natWmm * fit;
            const hmm = natHmm * fit;
            const x = geo.marginXmm + (geo.contentWmm - wmm) / 2;
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, geo.marginTopMm, wmm, hmm);
        }
        pdf.save(opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`);
    } finally {
        // Restore the theme classes exactly as they were.
        if (movedDark && appHost) appHost.classList.remove('dark');
        if (hadDarkRoot) root.classList.add('dark');
        if (hadDarkBody) body.classList.add('dark');
        wrapper.remove();
    }
}

/**
 * Capture a live report element (tables + charts) into a branded multipage A4 PDF.
 */
export async function downloadElementPdf(el: HTMLElement, opts: DirectPdfOptions): Promise<void> {
    await downloadHtmlPdf(el.innerHTML, opts);
}
