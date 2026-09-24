import { DEFAULT_RESTAURANT_LOGO_URL, isSameLogoUrl } from './reportBrand';

export interface ReportPrintOptions {
    /** Custom restaurant logo (data URL or absolute URL). Falls back to /logo.png. */
    logoUrl?: string;
    /** Optional system logo shown next to the restaurant logo. */
    systemLogoUrl?: string;
    /** A4 orientation — landscape fits accounting tables best. */
    orientation?: 'portrait' | 'landscape';
    /** Explicit language direction — preferred over regex guessing. */
    isArabic?: boolean;
    /** Extra meta chips rendered under the title (e.g. cashier, filters). */
    extraMeta?: string[];
    /** Brand extras — system + branch lines on the cover. */
    systemName?: string;
    systemTagline?: string;
    branchName?: string;
}

const PRINT_FONT_STACK = "'Cairo','Segoe UI',Tahoma,Arial,sans-serif";

const escPrint = (s: unknown) =>
   String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

export const getReportPrintCSS = (
   restaurantName: string,
   reportTitle: string,
   dateRange: string,
   opts: ReportPrintOptions = {},
): string => {
  const guessedArabic = /[\u0600-\u06FF]/.test(`${restaurantName} ${reportTitle} ${dateRange}`);
  const isArabic = opts.isArabic ?? guessedArabic;
  const printedAt = new Date().toLocaleString(isArabic ? 'ar-EG' : 'en-GB');
  const logoUrl = opts.logoUrl
     || (typeof window !== 'undefined' ? `${window.location.origin}${DEFAULT_RESTAURANT_LOGO_URL}` : DEFAULT_RESTAURANT_LOGO_URL);
  // Never render the same image twice side-by-side.
  const systemLogoUrl = opts.systemLogoUrl && !isSameLogoUrl(opts.systemLogoUrl, logoUrl) ? opts.systemLogoUrl : '';
  const orientation = opts.orientation || 'landscape';
  const extraChips = (opts.extraMeta || []).map((m) => `<span>${escPrint(m)}</span>`).join('\n');
  const dir = isArabic ? 'rtl' : 'ltr';
  const align = isArabic ? 'right' : 'left';
  const systemName = opts.systemName || 'Coduis Zen';
  const systemTagline = opts.systemTagline || (isArabic ? 'نظام إدارة المطاعم' : 'Restaurant OS');
  const branchName = opts.branchName || '';
  const branchChip = branchName ? `<span class="report-export-branch">${escPrint(branchName)}</span>` : '';
  const cairoLink = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" />`;
  const safeRestaurant = escPrint(restaurantName);
  const safeTitle = escPrint(reportTitle);
  const safeRange = escPrint(dateRange);
  const safeSystem = escPrint(systemName);
  const safeTagline = escPrint(systemTagline);

  return `
${cairoLink}
<style>
  @page {
    margin: 11mm 10mm 14mm 10mm;
    size: A4 ${orientation};
    @bottom-right {
      content: counter(page) ' / ' counter(pages);
      font-size: 8pt;
      color: #64748b;
      font-weight: 700;
    }
  }

  html, body {
    background: #ffffff !important;
    color: #142033 !important;
    font-family: ${PRINT_FONT_STACK} !important;
    direction: ${dir};
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Force light accounting theme even when the app runs dark — saves ink. */
  :root, .dark, [data-theme="dark"] {
    color-scheme: light !important;
    --bg-card: 255 255 255 !important;
    --bg-app: 255 255 255 !important;
    --bg-elevated: 248 250 252 !important;
    --text-main: 15 23 42 !important;
    --text-muted: 100 116 139 !important;
    --border-color: 219 228 238 !important;
  }

  body {
    margin: 0 !important;
    padding: 0 0 22mm 0 !important;
  }

  nav, button, input, select, textarea, .sidebar, [class*="sidebar"], .no-print, [data-pdf-hide], .recharts-tooltip-wrapper {
    display: none !important;
  }

  * {
    box-shadow: none !important;
    text-shadow: none !important;
    backdrop-filter: none !important;
  }

  /* Screen-only paginated wrapper is hidden in print; the full-data
     print table (rendered hidden on screen) takes over instead. */
  .responsive-table { overflow: visible !important; }
  .report-full-print { display: block !important; }
  .report-screen-only { display: none !important; }

  table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: auto !important;
    border-collapse: collapse !important;
    margin-top: 10px !important;
    page-break-inside: auto !important;
    overflow: visible !important;
    word-break: break-word !important;
  }

  /* Wide accounting tables shrink instead of clipping off-page. */
  .report-export-body table { font-size: 8.5pt !important; }
  .report-export-body th, .report-export-body td {
    padding: 5px 7px !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
  }

  thead {
    display: table-header-group !important;
  }

  thead tr {
    background: #10243e !important;
    color: #ffffff !important;
    border-bottom: 3px solid #c9a227 !important;
  }

  tr {
    page-break-inside: avoid !important;
  }

  th, td {
    border: 1px solid #dbe4ee !important;
    padding: 8px 10px !important;
    font-size: 9.5pt !important;
    vertical-align: middle !important;
  }

  th {
    font-weight: 900 !important;
    text-align: ${align} !important;
  }

  td {
    color: #162033 !important;
    text-align: ${align} !important;
  }

  tbody tr:nth-child(even) {
    background: #f4f7fa !important;
  }

  tbody td:first-child {
    font-weight: 800 !important;
  }

  tfoot td {
    background: #0f766e !important;
    color: #ffffff !important;
    font-weight: 900 !important;
  }

  h1, h2, h3, h4, p {
    color: #0f172a !important;
  }

  svg,
  .recharts-responsive-container,
  .recharts-wrapper,
  .report-chart-block {
    max-width: 100% !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .print-shell {
    display: block !important;
  }

  .print-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 0 0 18px 0;
    margin-bottom: 18px;
    border-bottom: 2px solid #0f766e;
    border-image: linear-gradient(to ${isArabic ? 'left' : 'right'}, #c9a227 0%, #c9a227 30%, #0f766e 30%, #0f766e 100%) 1;
  }

  .print-header__brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  /* Transparent mark: dark chip backdrop so light artwork stays visible. */
  .print-header__brand img {
    height: 56px;
    width: auto;
    max-width: 250px;
    object-fit: contain;
    background: linear-gradient(135deg, #0b1b30 0%, #020617 100%);
    border: 1px solid #dbe4ee;
    border-radius: 12px;
    padding: 5px 10px;
  }

  .print-header__title {
    font-size: 22px;
    font-weight: 900;
    line-height: 1.2;
    margin: 0;
    color: #10243e;
  }

  .print-header__meta {
    margin-top: 6px;
    color: #5b6b7d;
    font-size: 11px;
    font-weight: 700;
  }

  .print-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    background: #ecfeff;
    border: 1px solid #b7ecea;
    color: #0f766e;
    font-size: 10px;
    font-weight: 800;
  }

  .print-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex !important;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 8px 0 0;
    border-top: 1px solid #dbe4ee;
    color: #64748b;
    font-size: 8.5pt;
    font-weight: 700;
  }

  .print-footer .page-counter::after {
    content: counter(page) ' / ' counter(pages);
  }

  .report-export-shell {
    direction: ${dir};
    font-family: ${PRINT_FONT_STACK};
    color: #142033;
    background: #ffffff;
  }

  .report-export-cover {
    border: 1px solid #dbe4ee;
    border-top: 6px solid #c9a227;
    border-radius: 14px;
    padding: 22px;
    margin-bottom: 18px;
    background: linear-gradient(135deg, #f8fbff 0%, #ffffff 56%, #eef4f2 100%);
  }

  .report-export-eyebrow {
    font-size: 9px;
    font-weight: 800;
    color: #0f766e;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin-bottom: 10px;
  }

  /* letter-spacing disconnects Arabic letters — LTR eyebrows only. */
  [dir="rtl"] .report-export-eyebrow,
  [dir="rtl"] .print-header__brand > div > div:first-child {
    letter-spacing: 0 !important;
  }

  .report-export-title {
    margin: 0;
    font-size: 25px;
    line-height: 1.3;
    font-weight: 900;
    color: #10243e;
  }

  .report-export-meta {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: #475569;
    font-size: 11px;
    font-weight: 800;
  }

  .report-export-meta span {
    border: 1px solid #dbe4ee;
    border-radius: 999px;
    padding: 7px 10px;
    background: #ffffff;
  }

  .report-export-meta span.report-export-branch {
    background: #10243e;
    border-color: #10243e;
    color: #ffffff;
  }

  .report-export-body {
    border: 1px solid #dbe4ee;
    border-radius: 14px;
    padding: 16px;
  }
</style>

<div class="print-shell" dir="${dir}">
  <div class="print-header">
    <div class="print-header__brand">
      <img src="${logoUrl}" alt="${safeRestaurant}" onerror="this.style.display='none'" />
      ${systemLogoUrl ? `<img src="${systemLogoUrl}" alt="${safeSystem}" style="height:44px;width:auto;max-width:200px;border:1px solid #c9a227;border-radius:10px;padding:3px 6px;background:linear-gradient(135deg,#0b1b30,#020617);object-fit:contain;" onerror="this.style.display='none'" />` : ''}
      <div>
        <div style="font-size:9px;font-weight:800;color:#0f766e;text-transform:uppercase;letter-spacing:0.14em;">${safeSystem} • ${safeTagline}</div>
        <h1 class="print-header__title">${safeRestaurant}</h1>
        <div class="print-header__meta">${safeTitle}</div>
        <div class="print-header__meta">${safeRange}${branchName ? ` • ${escPrint(branchName)}` : ''}</div>
      </div>
    </div>
    <div class="print-chip">${isArabic ? 'جاهز للطباعة' : 'Prepared for print'}</div>
  </div>
</div>

<div class="print-footer" dir="${dir}">
  <span>${safeSystem} • ${safeRestaurant}</span>
  <span>${isArabic ? 'وقت الطباعة' : 'Printed at'}: ${printedAt}</span>
  <span class="page-counter">${isArabic ? 'صفحة' : 'Page'}: </span>
</div>
`;
};
