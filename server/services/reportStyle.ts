/**
 * reportStyle — shared premium identity for EVERY server-rendered report PDF.
 *
 * Guarantees across all exports:
 *  - Cairo font (bundled locally, embedded as data-URI — works offline)
 *  - Latin 0-9 digits with Arabic words (ar-EG-u-nu-latn)
 *  - One emerald/teal brand family: gradient hero, KPI cards, banded tables,
 *    numbered footer, dual signatures.
 */
import fs from 'node:fs';

/** Arabic words + Arabic order, Western digits. */
export const AR_LATIN_LOCALE = 'ar-EG-u-nu-latn';
export const reportLocale = (lang: 'ar' | 'en') => (lang === 'ar' ? AR_LATIN_LOCALE : 'en-US');
export const REPORT_FONT_STACK = `'Cairo',Tahoma,Arial,sans-serif`;

let cachedCairoCss: string | null = null;
/** Bundled Cairo @font-face (data-URI, headless-print safe). */
export const cairoFontCss = () => {
    if (cachedCairoCss !== null) return cachedCairoCss;
    const faces: string[] = [];
    const files = [
        { file: 'public/fonts/Cairo-Variable.ttf', weight: '200 1000' },
        { file: 'public/fonts/Cairo-Regular.ttf', weight: '400' },
        { file: 'public/fonts/Cairo-Bold.ttf', weight: '700' },
    ];
    for (const { file, weight } of files) {
        try {
            if (!fs.existsSync(file)) continue;
            const b64 = fs.readFileSync(file).toString('base64');
            faces.push(`@font-face{font-family:'Cairo';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/ttf;base64,${b64}) format('truetype')}`);
        } catch {
            // Tahoma fallback still prints Arabic correctly.
        }
    }
    cachedCairoCss = faces.join('\n');
    return cachedCairoCss;
};

let cachedLogo: string | null = null;
export const reportLogoData = () => {
    if (cachedLogo !== null) return cachedLogo;
    try {
        const file = 'public/logo.png';
        cachedLogo = fs.existsSync(file) ? `data:image/png;base64,${fs.readFileSync(file).toString('base64')}` : '';
    } catch {
        cachedLogo = '';
    }
    return cachedLogo;
};

export const htmlEscape = (value: unknown) =>
    String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const safeNumber = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const fmtMoney = (value: unknown, locale: string, currency: string) =>
    `${safeNumber(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export const fmtInt = (value: unknown, locale: string) =>
    safeNumber(value).toLocaleString(locale, { maximumFractionDigits: 0 });

export const fmtDate = (value: unknown, locale: string) => {
    if (!value) return '-';
    const d = new Date(value as any);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const fmtDateTime = (value: unknown, locale: string) => {
    if (!value) return '-';
    const d = new Date(value as any);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/** Single headless-Chrome launcher shared by every report generator. */
export const launchReportBrowser = async () => {
    const puppeteer = await import('puppeteer');
    const browserExecutable = [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ].find((candidate) => fs.existsSync(candidate));
    return puppeteer.default.launch({ headless: true, executablePath: browserExecutable, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
};

export interface ReportKpi { label: string; value: string; color?: string }
export interface ReportSection {
    title: string;
    headers: string[];
    rows: string[][];
    /** Bold closing row, e.g. [الإجمالي, 12, 3,400.00]. */
    footer?: string[];
    emptyText?: string;
}
export interface ReportShellInput {
    lang: 'ar' | 'en';
    title: string;
    subtitle?: string;
    /** Meta grid under the title: [label, value] pairs. */
    meta?: [string, string][];
    badge?: string;
    kpis?: ReportKpi[];
    sections?: ReportSection[];
    /** Raw HTML blocks (callouts, chips, signature cards…) rendered between tables. */
    extras?: string[];
    noteTitle?: string;
    note?: string;
    signatures?: [string, string];
    footerTag?: string;
    footerMeta?: string;
    orientation?: 'portrait' | 'landscape';
}

/** Amber callout box HTML for use inside `extras`. */
export const calloutHtml = (title: string, body: string) =>
    `<div class="notes"><h2>${htmlEscape(title)}</h2><p>${htmlEscape(body)}</p></div>`;

/** Stat chips row HTML for use inside `extras`. */
export const chipsHtml = (title: string, chips: [string, string][]) =>
    `<div class="section"><h2>${htmlEscape(title)}</h2><div class="health">${chips.map(([label, value]) => `<div class="chip"><span>${htmlEscape(label)}</span><b>${htmlEscape(value)}</b></div>`).join('')}</div></div>`;

/**
 * Renders the complete branded A4 document and returns the PDF bytes.
 * Tables paginate cleanly (thead repeats, rows never split).
 */
export const renderReportPdf = async (input: ReportShellInput): Promise<Buffer> => {
    const rtl = input.lang === 'ar';
    const wide = (input.orientation || 'portrait') === 'landscape';
    const logoData = reportLogoData();
    const kpis = (input.kpis || []).map((k) =>
        `<div class="card"><div class="bar" style="background:${k.color || '#0f766e'}"></div><div class="label">${htmlEscape(k.label)}</div><div class="value" style="color:${k.color || '#0f766e'}">${htmlEscape(k.value)}</div></div>`,
    ).join('');
    const sections = (input.sections || []).map((s) => `
<section class="section"><h2>${htmlEscape(s.title)}</h2>
<table><thead><tr>${s.headers.map((h) => `<th>${htmlEscape(h)}</th>`).join('')}</tr></thead><tbody>${
        s.rows.length
            ? s.rows.map((r) => `<tr>${r.map((c) => `<td>${htmlEscape(c)}</td>`).join('')}</tr>`).join('')
            : `<tr><td colspan="${Math.max(s.headers.length, 1)}" class="empty">${htmlEscape(s.emptyText || (rtl ? 'لا توجد بيانات' : 'No data'))}</td></tr>`
    }${s.footer ? `<tr class="total-row">${s.footer.map((c) => `<td>${htmlEscape(c)}</td>`).join('')}</tr>` : ''}</tbody></table></section>`,
    ).join('');
    const meta = (input.meta || []).map(([label, value]) => `${htmlEscape(label)}: <b>${htmlEscape(value)}</b>`).join(' &nbsp;•&nbsp; ');
    const generatedAt = fmtDateTime(new Date(), reportLocale(input.lang));
    const html = `<!doctype html><html lang="${input.lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" /><style>
${cairoFontCss()}
@page { size:A4; margin:0; }
*{box-sizing:border-box}
body{margin:0;background:#e9f1ec;color:#10231d;direction:${rtl ? 'rtl' : 'ltr'};font-family:${REPORT_FONT_STACK};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hero{background:linear-gradient(135deg,#052e26 0%,#0b4f3f 55%,#0f766e 100%);color:#fff;padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:18px}
.brand{display:flex;align-items:center;gap:14px}
.logo{width:64px;height:64px;object-fit:contain;background:#fff;border-radius:16px;padding:7px;flex-shrink:0}
.hero h1{margin:0;font-size:27px;font-weight:900;line-height:1.25}
.hero .sub{margin:4px 0 0;color:#a7f3d0;font-size:11px;font-weight:800}
.hero .meta{margin-top:8px;font-size:10px;color:#ecfdf5;font-weight:700;line-height:1.8}
.hero .meta b{font-weight:900}
.badge{display:inline-block;font-size:10px;font-weight:900;border-radius:999px;padding:3px 14px;margin-top:8px;background:#34d399;color:#052e26}
.wrap{padding:14px 16px 20px}
.kpis{display:grid;grid-template-columns:repeat(${wide ? 4 : 4},1fr);gap:9px;margin-bottom:12px}
.card{position:relative;background:#fff;border:1px solid #d3e2d8;border-radius:14px;padding:10px 12px 11px;min-height:70px;overflow:hidden;box-shadow:0 6px 18px rgba(6,46,38,.06)}
.card .bar{position:absolute;inset-inline-start:0;top:0;bottom:0;width:4px}
.label{font-size:9.5px;color:#5b6f66;font-weight:800}
.value{direction:ltr;text-align:${rtl ? 'right' : 'left'};font-size:16px;line-height:1.25;margin-top:5px;font-weight:900;overflow-wrap:anywhere}
.grid{display:grid;grid-template-columns:1fr ${wide ? '1fr' : '1fr'};gap:12px}
.section{background:#fff;border:1px solid #d3e2d8;border-radius:14px;padding:12px;margin-bottom:12px;box-shadow:0 6px 18px rgba(6,46,38,.05);break-inside:avoid}
.kpis,.sign{break-inside:avoid}
.section h2{margin:0 0 9px;color:#065f46;font-size:13.5px;font-weight:900;border-bottom:2px solid #a7f3d0;padding-bottom:6px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead{display:table-header-group}
tr{break-inside:avoid}
th{background:#065f46;color:#fff;font-size:9px;font-weight:900;padding:7px 6px;text-align:${rtl ? 'right' : 'left'}}
th:first-child{border-start-start-radius:8px;border-end-start-radius:8px}th:last-child{border-start-end-radius:8px;border-end-end-radius:8px}
td{font-size:9px;padding:7px 6px;border-bottom:1px solid #e3efe8;vertical-align:middle;overflow-wrap:anywhere;text-align:${rtl ? 'right' : 'left'}}
tbody tr:nth-child(even) td{background:#f4faf6}
tr.total-row td{background:#ecfdf5!important;font-weight:900;border-top:2px solid #0f766e}
.empty{text-align:center;color:#7d8f86;font-weight:800;padding:16px;font-size:10px}
.health{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.chip{background:#f4faf6;border:1px solid #d3e2d8;border-radius:10px;padding:9px;text-align:center}
.chip b{display:block;font-size:15px;direction:ltr;margin-top:2px}
.chip span{font-size:8.5px;font-weight:800;color:#5b6f66}
.notes{background:#fffbeb;border:1.5px solid #d97706;border-radius:14px;padding:12px 14px;margin-bottom:12px}
.notes h2{margin:0 0 6px;color:#92400e;font-size:13px;font-weight:900}
.notes p{margin:0;font-size:10.5px;line-height:1.8;color:#451a03;white-space:pre-wrap;overflow-wrap:anywhere}
.sign{display:flex;gap:12px}
.sign div{flex:1;border:1.5px dashed #7d8f86;border-radius:10px;padding:10px;font-size:9px;font-weight:800;color:#3f554c;text-align:center;line-height:2.2;background:#fff}
</style></head><body>
<header class="hero"><div class="brand">${logoData ? `<img class="logo" src="${logoData}" />` : ''}<div><h1>${htmlEscape(input.title)}</h1>${input.subtitle ? `<p class="sub">${htmlEscape(input.subtitle)}</p>` : ''}<div class="meta">${meta}${meta ? ' &nbsp;•&nbsp; ' : ''}${htmlEscape(rtl ? 'تاريخ التقرير' : 'Generated')}: <b>${htmlEscape(generatedAt)}</b></div>${input.badge ? `<span class="badge">${htmlEscape(input.badge)}</span>` : ''}</div></div></header>
<div class="wrap">
${kpis ? `<section class="kpis">${kpis}</section>` : ''}
${sections}
${(input.extras || []).join('')}
${input.note ? calloutHtml(input.noteTitle || (rtl ? 'ملاحظات' : 'Notes'), input.note) : ''}
${input.signatures ? `<section class="section"><div class="sign"><div>${htmlEscape(input.signatures[0])} — ${htmlEscape(rtl ? 'الاسم' : 'Name')}: …………………<br/>${htmlEscape(rtl ? 'التوقيع' : 'Signature')}: ………………… &nbsp;&nbsp; ${htmlEscape(rtl ? 'التاريخ' : 'Date')}: ……………</div><div>${htmlEscape(input.signatures[1])} — ${htmlEscape(rtl ? 'الاسم' : 'Name')}: …………………<br/>${htmlEscape(rtl ? 'التوقيع' : 'Signature')}: ………………… &nbsp;&nbsp; ${htmlEscape(rtl ? 'التاريخ' : 'Date')}: ……………</div></div></section>` : ''}
</div>
</body></html>`;
    const footerTemplate = `<div style="width:100%;font-size:8px;color:#5b6f66;font-family:${REPORT_FONT_STACK};padding:0 12mm;display:flex;justify-content:space-between;align-items:center;direction:${rtl ? 'rtl' : 'ltr'}"><span>Coduis Zen • ${htmlEscape(input.footerTag || input.title)} • ${htmlEscape(input.footerMeta || '')}</span><span dir="ltr"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
    const browser = await launchReportBrowser();
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' as any });
        return Buffer.from(await page.pdf({
            format: 'A4', landscape: wide, printBackground: true, preferCSSPageSize: false,
            displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate,
            margin: { top: '8mm', bottom: '16mm', left: '0', right: '0' },
        }));
    } finally {
        await browser.close();
    }
};
