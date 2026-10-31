// pdfkit no longer used here — every report renders through headless Chrome
// (correct Arabic shaping + embedded Cairo). Kept as a lazy dep for safety.
import fs from 'node:fs';
import ExcelJS from 'exceljs';

const registerReadableFonts = (doc: any) => {
    const candidates = [
        { regular: 'C:/Windows/Fonts/tahoma.ttf', bold: 'C:/Windows/Fonts/tahomabd.ttf' },
        { regular: 'C:/Windows/Fonts/arial.ttf', bold: 'C:/Windows/Fonts/arialbd.ttf' },
        { regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' },
    ];
    const selected = candidates.find(font => fs.existsSync(font.regular) && fs.existsSync(font.bold));
    if (!selected) return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
    doc.registerFont('ReportRegular', selected.regular);
    doc.registerFont('ReportBold', selected.bold);
    return { regular: 'ReportRegular', bold: 'ReportBold' };
};

const htmlEscape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
/** Latin-digit Arabic locale: Arabic words/order, Western 0-9 digits. */
const AR_LATIN_LOCALE = 'ar-EG-u-nu-latn';
/** Bundled Cairo font embedded as data-URI @font-face (works offline in headless print). */
let cachedCairoCss: string | null = null;
const cairoFontCss = () => {
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
            // Missing/unreadable font file — Tahoma fallback below still prints Arabic.
        }
    }
    cachedCairoCss = faces.join('\n');
    return cachedCairoCss;
};
const reportRows = (value: unknown, labelKey: string): any[] => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    if (labelKey in value) return [value];
    return Object.entries(value).map(([label, row]) => row && typeof row === 'object'
        ? { [labelKey]: label, ...row }
        : { [labelKey]: label, count: 0, total: row });
};

export type DayClosePaper = 'a4' | '80mm';

/**
 * Renders a purchase order (with ordered vs received quantities) as a PDF.
 * Supports A4 and 80mm thermal roll paper, mirroring the day-close pipeline.
 */
export const generatePurchaseOrderPDF = async (po: any, lang: 'ar' | 'en' = 'ar', paper: DayClosePaper = 'a4'): Promise<Buffer> => {
    const rtl = lang === 'ar';
    const thermal = paper === '80mm';
    const locale = rtl ? AR_LATIN_LOCALE : 'en-US';
    const currency = po.currency || 'EGP';
    const money = (value: unknown) => `${safeNumber(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    const statusLabels: Record<string, string> = rtl ? {
        DRAFT: 'مسودة', SENT: 'مرسل', ORDERED: 'مطلوب', PENDING_APPROVAL: 'بانتظار الاعتماد',
        PARTIAL: 'استلام جزئي', RECEIVED: 'مستلم', CLOSED: 'مغلق', CANCELLED: 'ملغي',
    } : {};
    const t = rtl ? {
        title: 'أمر شراء', number: 'رقم الأمر', supplier: 'المورد', branch: 'الفرع', warehouse: 'مخزن الاستلام',
        createdAt: 'تاريخ الإنشاء', expected: 'الاستلام المتوقع', status: 'الحالة', createdBy: 'أنشأ بواسطة',
        item: 'الصنف', unit: 'الوحدة', ordered: 'المطلوب', received: 'المستلم', remaining: 'المتبقي',
        unitPrice: 'سعر الوحدة', lineTotal: 'الإجمالي', subtotal: 'إجمالي الأمر', noData: 'لا توجد بنود',
        printedAt: 'تاريخ الطباعة',
    } : {
        title: 'Purchase Order', number: 'PO Number', supplier: 'Supplier', branch: 'Branch', warehouse: 'Receiving Warehouse',
        createdAt: 'Created At', expected: 'Expected Delivery', status: 'Status', createdBy: 'Created By',
        item: 'Item', unit: 'Unit', ordered: 'Ordered', received: 'Received', remaining: 'Remaining',
        unitPrice: 'Unit Price', lineTotal: 'Total', subtotal: 'Order Total', noData: 'No items',
        printedAt: 'Printed At',
    };
    const items: any[] = Array.isArray(po.items) ? po.items : [];
    const rowsHtml = items.length ? items.map((item) => `
        <tr>
            <td>${htmlEscape(item.itemName || item.itemNameAr || item.itemId)}</td>
            <td>${htmlEscape(item.unit || '-')}</td>
            <td class="num">${safeNumber(item.orderedQty)}</td>
            <td class="num">${safeNumber(item.receivedQty)}</td>
            <td class="num">${Math.max(0, safeNumber(item.orderedQty) - safeNumber(item.receivedQty))}</td>
            <td class="num">${money(item.unitPrice)}</td>
            <td class="num">${money(safeNumber(item.orderedQty) * safeNumber(item.unitPrice))}</td>
        </tr>`).join('') : `<tr><td colspan="7" class="empty">${t.noData}</td></tr>`;
    const metaRows = [
        [t.supplier, po.supplierName || po.supplierId || '-'],
        [t.branch, po.branchName || po.branchId || '-'],
        [t.warehouse, po.targetWarehouseName || '-'],
        [t.createdAt, po.createdAt ? new Date(po.createdAt).toLocaleString(locale) : '-'],
        [t.expected, po.expectedDate ? new Date(po.expectedDate).toLocaleDateString(locale) : '-'],
        [t.status, statusLabels[String(po.status || '').toUpperCase()] || String(po.status || '-')],
        [t.createdBy, po.createdBy || '-'],
        [t.printedAt, new Date().toLocaleString(locale)],
    ].map(([label, value]) => `<div class="meta-row"><span>${htmlEscape(label)}</span><b>${htmlEscape(value)}</b></div>`).join('');
    const pageStyle = thermal ? '@page { size:80mm auto; margin:0; }' : '@page { size:A4; margin:10mm; }';
    const baseStyle = `
${cairoFontCss()}
*{box-sizing:border-box} body{margin:0;background:#fff;color:#102033;font-family:'Cairo',Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hero{background:linear-gradient(135deg,#052e26,#0b4f3f 55%,#0f766e);color:#fff;border-radius:${thermal ? '0' : '16px'};padding:${thermal ? '8px 2mm' : '14px 18px'};margin-bottom:${thermal ? '6px' : '12px'};text-align:center}
.hero h1{margin:0;font-size:${thermal ? '15px' : '24px'};font-weight:900}.hero p{margin:3px 0 0;font-size:${thermal ? '9px' : '11px'};color:#cbd5e1}
.meta{display:grid;grid-template-columns:1fr;margin-bottom:${thermal ? '6px' : '12px'};gap:3px}
.meta-row{display:flex;justify-content:space-between;gap:8px;border:1px solid #e2e8f0;border-radius:${thermal ? '0' : '10px'};padding:${thermal ? '3px 2mm' : '7px 10px'};font-size:${thermal ? '9px' : '11px'}}
.meta-row span{color:#64748b;font-weight:800}.meta-row b{font-weight:900;text-align:${rtl ? 'left' : 'right'};overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{background:#eef4fb;color:#123c69;font-size:${thermal ? '8px' : '9.5px'};font-weight:900;padding:${thermal ? '4px 1mm' : '7px 6px'};border:1px solid #d4e2f0;text-align:${rtl ? 'right' : 'left'}}
td{font-size:${thermal ? '8.5px' : '10px'};padding:${thermal ? '4px 1mm' : '7px 6px'};border:1px solid #e2ebf5;vertical-align:middle;overflow-wrap:anywhere;text-align:${rtl ? 'right' : 'left'}}
td.num{text-align:center;direction:ltr}
tbody tr:nth-child(even) td{background:#f8fbff}
.empty{text-align:center;color:#64748b;font-weight:900;padding:14px}
.total{margin-top:${thermal ? '6px' : '12px'};display:flex;justify-content:flex-end}
.total div{border:2px solid #0b172a;border-radius:${thermal ? '0' : '12px'};padding:${thermal ? '5px 3mm' : '10px 18px'};font-size:${thermal ? '11px' : '15px'};font-weight:900}
${thermal ? 'html,body{width:80mm;max-width:80mm}body{padding:2mm}' : ''}
`;
    const html = `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" /><style>
${pageStyle}${baseStyle}
</style></head><body>
<section class="hero"><h1>${t.title} · ${htmlEscape(po.id)}</h1><p>${t.number}: ${htmlEscape(po.id)}</p></section>
<section class="meta">${metaRows}</section>
<table><thead><tr>
<th style="width:${thermal ? '26%' : '30%'}">${t.item}</th><th style="width:${thermal ? '9%' : '8%'}">${t.unit}</th>
<th style="width:${thermal ? '11%' : '10%'}">${t.ordered}</th><th style="width:${thermal ? '11%' : '10%'}">${t.received}</th>
<th style="width:${thermal ? '11%' : '10%'}">${t.remaining}</th><th style="width:${thermal ? '15%' : '15%'}">${t.unitPrice}</th>
<th style="width:${thermal ? '17%' : '17%'}">${t.lineTotal}</th>
</tr></thead><tbody>${rowsHtml}</tbody></table>
<div class="total"><div>${t.subtotal}: ${money(po.subtotal ?? items.reduce((sum, item) => sum + safeNumber(item.orderedQty) * safeNumber(item.unitPrice), 0))}</div></div>
</body></html>`;
    const puppeteer = await import('puppeteer');
    const browserExecutable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(candidate => fs.existsSync(candidate));
    const browser = await puppeteer.default.launch({ headless: true, executablePath: browserExecutable, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        if (thermal) await page.setViewport({ width: 302, height: 1200, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: 'networkidle0' as any });
        if (thermal) {
            const contentHeight = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
            return Buffer.from(await page.pdf({ width: '80mm', height: `${contentHeight + 24}px`, printBackground: true, preferCSSPageSize: false }));
        }
        return Buffer.from(await page.pdf({ format: 'A4', landscape: false, printBackground: true, preferCSSPageSize: true }));
    } finally {
        await browser.close();
    }
};

export const generateDayClosePDF = async (report: any, lang: 'ar' | 'en' = 'ar', paper: DayClosePaper = 'a4'): Promise<Buffer> => {
    const rtl = lang === 'ar';
    const thermal = paper === '80mm';
    const locale = rtl ? AR_LATIN_LOCALE : 'en-US';
    const fontFamily = `'Cairo',Tahoma,Arial,sans-serif`;
    const sales = report.salesSummary || {};
    const finance = report.financeSummary || {};
    const orderTypeRows = reportRows(report.orderTypeBreakdown, 'type');
    const paymentRows = reportRows(report.paymentBreakdown, 'method');
    const channelRows = reportRows(report.channelBreakdown, 'source');
    const callCenter = report.callCenterSummary || null;
    const topExpenseRows = reportRows(finance.topExpenses, 'name');
    const expenseRows = reportRows(finance.expenseRows, 'name');
    const currency = report.currency || 'EGP';
    const money = (value: unknown) => `${safeNumber(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    const int = (value: unknown) => safeNumber(value).toLocaleString(locale, { maximumFractionDigits: 0 });
    // Cash reconciliation: open-preview reports carry `shiftCashSummary`,
    // closed snapshots carry it under `closedSnapshot.shifts`.
    const cash = report.shiftCashSummary || report.closedSnapshot?.shifts || {};
    const expectedCash = safeNumber(cash.expectedCash);
    const actualCash = safeNumber(cash.actualCash);
    const variance = safeNumber(cash.variance ?? (actualCash - expectedCash));
    const varianceState = Math.abs(variance) <= 0.005 ? 'match' : variance > 0 ? 'over' : 'short';
    const cancelledPaid = report.cancelledPaidSummary || null;
    const drivers: any[] = Array.isArray(report.driverCashOutstanding) ? report.driverCashOutstanding : [];
    const refunds = report.closedSnapshot?.sales?.refunds || null;
    const notes = String(report.notes || '').trim();
    const isClosed = String(report.status || '').toUpperCase() === 'CLOSED';
    const generatedAt = new Date().toLocaleString(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const t = rtl ? {
        title: 'تقرير إغلاق اليوم', subtitle: 'ملخص تشغيلي ومالي كامل', branch: 'الفرع', date: 'تاريخ التشغيل', generated: 'تاريخ التقرير', closedBy: 'أغلق بواسطة',
        statusClosed: 'يوم مغلق', statusPreview: 'معاينة قبل الإغلاق',
        orders: 'الطلبات', gross: 'إجمالي الإيراد', discounts: 'الخصومات', tax: 'الضريبة', netSales: 'صافي المبيعات', expenses: 'المصروفات', profit: 'صافي الربح', avgOrder: 'متوسط الطلب',
        sectionSales: 'المبيعات حسب النوع', sectionPayments: 'طرق الدفع', sectionChannels: 'القنوات والكول سنتر', sectionExpenses: 'المصروفات', sectionExpenseRows: 'تفاصيل المصروفات', sectionAudit: 'المراجعة والرقابة', sectionHealth: 'سلامة التشغيل',
        sectionCash: 'تسوية النقدية', cashExpected: 'النقدية المتوقعة', cashActual: 'النقدية الفعلية', cashVariance: 'الفرق', cashMatch: 'مطابق — لا يوجد فرق', cashOver: 'زيادة', cashShort: 'عجز',
        cancelledPaid: 'ملغي-مدفوع (بالخزنة خارج الإيراد)', driverCash: 'عهدة الطيارين (خارج الدرج)', refundsLine: 'المرتجعات',
        sectionNotes: 'ملاحظات الإغلاق',
        type: 'النوع', count: 'العدد', total: 'الإجمالي', method: 'طريقة الدفع', channel: 'القناة', account: 'الحساب', description: 'الوصف', reference: 'المرجع', amount: 'القيمة',
        callCenterOrders: 'طلبات الكول سنتر', callCenterRevenue: 'إيراد الكول سنتر', platformOrders: 'منها منصات', grandTotal: 'الإجمالي',
        pendingExpenses: 'مصروفات معلقة', events: 'أحداث المراجعة', voids: 'إلغاءات', refunds: 'مرتجعات', managerDiscounts: 'خصومات', fiscalPending: 'فواتير معلقة', fiscalFailed: 'فواتير فاشلة',
        financeExceptions: 'استثناءات مالية', sideEffects: 'أخطاء تشغيل', noData: 'لا توجد بيانات',
        signAccountant: 'المحاسب', signManager: 'مدير الفرع', signName: 'الاسم', signSig: 'التوقيع', signDate: 'التاريخ',
        thanks: 'شكراً لكم', footerTag: 'تقرير إغلاق يوم',
    } : {
        title: 'End of Day Report', subtitle: 'Complete operational and financial summary', branch: 'Branch', date: 'Business Date', generated: 'Generated', closedBy: 'Closed By',
        statusClosed: 'Closed day', statusPreview: 'Pre-close preview',
        orders: 'Orders', gross: 'Gross Revenue', discounts: 'Discounts', tax: 'Tax', netSales: 'Net Sales', expenses: 'Expenses', profit: 'Net Profit', avgOrder: 'Average Order',
        sectionSales: 'Sales by Type', sectionPayments: 'Payments', sectionChannels: 'Channels & Call Center', sectionExpenses: 'Expenses', sectionExpenseRows: 'Expense Details', sectionAudit: 'Audit & Controls', sectionHealth: 'Operational Health',
        sectionCash: 'Cash Reconciliation', cashExpected: 'Expected Cash', cashActual: 'Actual Cash', cashVariance: 'Variance', cashMatch: 'Matched — no variance', cashOver: 'Over', cashShort: 'Short',
        cancelledPaid: 'Cancelled-paid (in drawer, out of revenue)', driverCash: 'Driver pocket cash (out of drawer)', refundsLine: 'Refunds',
        sectionNotes: 'Close Notes',
        type: 'Type', count: 'Count', total: 'Total', method: 'Method', channel: 'Channel', account: 'Account', description: 'Description', reference: 'Reference', amount: 'Amount',
        callCenterOrders: 'Call-center orders', callCenterRevenue: 'Call-center revenue', platformOrders: 'Of which platforms', grandTotal: 'Total',
        pendingExpenses: 'Pending Expenses', events: 'Audit Events', voids: 'Voids', refunds: 'Refunds', managerDiscounts: 'Discounts', fiscalPending: 'Fiscal Pending', fiscalFailed: 'Fiscal Failed',
        financeExceptions: 'Finance Exceptions', sideEffects: 'Side Effect Errors', noData: 'No data',
        signAccountant: 'Accountant', signManager: 'Branch Manager', signName: 'Name', signSig: 'Signature', signDate: 'Date',
        thanks: 'Thank you', footerTag: 'Day close report',
    };
    const logoFile = 'public/logo.png';
    const logoData = fs.existsSync(logoFile) ? `data:image/png;base64,${fs.readFileSync(logoFile).toString('base64')}` : '';
    const statusBadge = isClosed
        ? `<span class="badge closed">${t.statusClosed}</span>`
        : `<span class="badge preview">${t.statusPreview}</span>`;
    const table = (headers: string[], rows: any[], cells: (row: any) => unknown[], footer?: unknown[]) => `
        <table><thead><tr>${headers.map(h => `<th>${htmlEscape(h)}</th>`).join('')}</tr></thead><tbody>${
            rows.length ? rows.map(row => `<tr>${cells(row).map((cell, index) => `<td data-label="${htmlEscape(headers[index] || '')}">${htmlEscape(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="empty">${t.noData}</td></tr>`
        }${footer ? `<tr class="total-row">${footer.map((cell, index) => `<td data-label="${htmlEscape(index === 0 ? t.grandTotal : headers[index] || '')}">${htmlEscape(cell)}</td>`).join('')}</tr>` : ''}</tbody></table>`;
    const sumCount = (rows: any[]) => rows.reduce((s, r) => s + safeNumber(r.count), 0);
    const sumTotal = (rows: any[]) => rows.reduce((s, r) => s + safeNumber(r.total), 0);
    const varianceLabel = varianceState === 'match' ? t.cashMatch : `${variance > 0 ? t.cashOver : t.cashShort}: ${money(Math.abs(variance))}`;

    if (thermal) {
        // ============ 80mm thermal receipt ============
        const sep = '<div class="sep"></div>';
        const line = (label: string, value: string, strong = false) => `<div class="line${strong ? ' strong' : ''}"><span>${htmlEscape(label)}</span><b>${htmlEscape(value)}</b></div>`;
        const payLines = paymentRows.length
            ? paymentRows.map(r => `<div class="line"><span>${htmlEscape(r.method)} × ${int(r.count)}</span><b>${money(r.total)}</b></div>`).join('')
            : `<div class="dim">${t.noData}</div>`;
        const typeLines = orderTypeRows.length
            ? orderTypeRows.map(r => `<div class="line"><span>${htmlEscape(r.type)} × ${int(r.count)}</span><b>${money(r.total)}</b></div>`).join('')
            : `<div class="dim">${t.noData}</div>`;
        const html = `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" /><style>
${cairoFontCss()}
@page { size:80mm auto; margin:0; }
*{box-sizing:border-box}
html,body{width:80mm;max-width:80mm;background:#fff;color:#000;overflow:visible}
body{margin:0;padding:3mm 2.5mm;font-family:${fontFamily};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.head{text-align:center;border-bottom:2.5px double #000;padding-bottom:6px;margin-bottom:6px}
.logo{width:40px;height:40px;object-fit:contain;margin:0 auto 4px;display:block}
.head h1{margin:0;font-size:17px;font-weight:900}
.head .sub{font-size:9px;font-weight:800;margin-top:2px}
.head .meta{font-size:8.5px;margin-top:3px;line-height:1.5}
.badge{display:inline-block;margin-top:4px;font-size:8.5px;font-weight:900;border:1.5px solid #000;border-radius:999px;padding:1px 10px}
.sep{border-top:1px dashed #000;margin:6px 0}
.sect{font-size:10.5px;font-weight:900;background:#000;color:#fff;text-align:center;padding:3px 4px;margin:7px 0 4px;border-radius:2px}
.line{display:flex;justify-content:space-between;align-items:baseline;gap:6px;font-size:9px;padding:2px 0;line-height:1.4}
.line span{font-weight:700}.line b{font-weight:900;white-space:nowrap;direction:ltr}
.line.strong{font-size:10.5px;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:4px 0;margin-top:3px}
.cashbox{border:1.5px solid #000;border-radius:3px;padding:5px 6px;margin-top:4px}
.cashbox .var{font-size:12px;font-weight:900;text-align:center;border-top:1px dashed #000;margin-top:4px;padding-top:4px}
.dim{text-align:center;font-size:8.5px;color:#000;padding:4px}
.notes{border:1px dashed #000;border-radius:3px;padding:5px 6px;font-size:8.5px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
.sign{display:flex;gap:8px;margin-top:8px}
.sign div{flex:1;border:1px solid #000;border-radius:3px;padding:4px;font-size:7.5px;font-weight:800;text-align:center;line-height:2}
.foot{text-align:center;font-size:8px;margin-top:8px;border-top:2.5px double #000;padding-top:6px;line-height:1.7}
</style></head><body>
<div class="head">
${logoData ? `<img class="logo" src="${logoData}" />` : ''}
<h1>${t.title}</h1>
<div class="sub">${t.subtitle}</div>
<div class="meta">${htmlEscape(report.branchName || report.branchId)} · ${htmlEscape(report.date)}<br/>${t.generated}: ${htmlEscape(generatedAt)}${report.closedBy ? `<br/>${t.closedBy}: ${htmlEscape(report.closedBy)}` : ''}</div>
<div><span class="badge">${isClosed ? t.statusClosed : t.statusPreview}</span></div>
</div>
<div class="sect">${t.orders} · ${t.gross}</div>
${line(t.orders, int(sales.totalOrders))}
${line(t.gross, money(sales.totalRevenue))}
${line(t.discounts, money(sales.totalDiscount))}
${line(t.tax, money(sales.totalTax))}
${line(t.netSales, money(sales.netSales), true)}
${line(t.expenses, money(finance.expenses))}
${line(t.profit, money(finance.netProfit), true)}
<div class="sect">${t.sectionCash}</div>
<div class="cashbox">
${line(t.cashExpected, money(expectedCash))}
${line(t.cashActual, money(actualCash))}
<div class="var">${htmlEscape(varianceLabel)}</div>
</div>
${cancelledPaid && safeNumber(cancelledPaid.total) > 0 ? line(`${t.cancelledPaid} (${int(cancelledPaid.orders)})`, money(cancelledPaid.total)) : ''}
${drivers.map(d => line(`${d.driverName}`, money(d.outstanding))).join('')}
<div class="sect">${t.sectionPayments}</div>
${payLines}
${line(t.grandTotal, money(sumTotal(paymentRows)), true)}
<div class="sect">${t.sectionSales}</div>
${typeLines}
${channelRows.length ? `<div class="sect">${t.sectionChannels}</div>` + channelRows.map(r => `<div class="line"><span>${htmlEscape(r.source)} × ${int(r.count)}</span><b>${money(r.total)}</b></div>`).join('') : ''}
${notes ? `<div class="sect">${t.sectionNotes}</div><div class="notes">${htmlEscape(notes)}</div>` : ''}
${sep}
<div class="sign"><div>${t.signAccountant}<br/>${t.signName}: ……<br/>${t.signSig}: ……</div><div>${t.signManager}<br/>${t.signName}: ……<br/>${t.signSig}: ……</div></div>
<div class="foot"><b>${t.thanks}</b><br/>${t.footerTag} · ${htmlEscape(report.date)}</div>
</body></html>`;
        const puppeteer = await import('puppeteer');
        const browserExecutable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(candidate => fs.existsSync(candidate));
        const browser = await puppeteer.default.launch({ headless: true, executablePath: browserExecutable, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 302, height: 1200, deviceScaleFactor: 1 });
            await page.setContent(html, { waitUntil: 'networkidle0' as any });
            const contentHeight = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
            return Buffer.from(await page.pdf({ width: '80mm', height: `${contentHeight + 24}px`, printBackground: true, preferCSSPageSize: false }));
        } finally {
            await browser.close();
        }
    }

    // ============ A4 portrait report ============
    const cards = [
        [t.orders, int(sales.totalOrders || 0), '#0f766e'], [t.gross, money(sales.totalRevenue), '#1d4ed8'], [t.discounts, money(sales.totalDiscount), '#ea580c'], [t.tax, money(sales.totalTax), '#7c3aed'],
        [t.netSales, money(sales.netSales), '#059669'], [t.expenses, money(finance.expenses), '#dc2626'], [t.profit, money(finance.netProfit), safeNumber(finance.netProfit) >= 0 ? '#059669' : '#dc2626'], [t.avgOrder, money(sales.averageOrderValue), '#0f172a'],
    ].map(([label, value, color]) => `<div class="card"><div class="bar" style="background:${color}"></div><div class="label">${htmlEscape(label)}</div><div class="value" style="color:${color}">${htmlEscape(value)}</div></div>`).join('');
    const channelTable = channelRows.length || callCenter
        ? `${table([t.channel, t.count, t.total], channelRows, row => [row.source, int(row.count), money(row.total)], channelRows.length ? [t.grandTotal, int(sumCount(channelRows)), money(sumTotal(channelRows))] : undefined)}
           ${callCenter ? `<div class="callc"><span>${t.callCenterOrders}: <b>${int(callCenter.orders)}</b> / ${money(callCenter.revenue)}</span><span>${t.platformOrders}: <b>${int(callCenter.platformOrders)}</b> / ${money(callCenter.platformRevenue)}</span></div>` : ''}`
        : `<div class="empty">${t.noData}</div>`;
    const html = `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" /><style>
${cairoFontCss()}
@page { size:A4; margin:0; }
*{box-sizing:border-box}
body{margin:0;background:#e9f1ec;color:#10231d;direction:${rtl ? 'rtl' : 'ltr'};font-family:${fontFamily};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hero{background:linear-gradient(135deg,#052e26 0%,#0b4f3f 55%,#0f766e 100%);color:#fff;padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:18px}
.brand{display:flex;align-items:center;gap:14px}
.logo{width:64px;height:64px;object-fit:contain;background:#fff;border-radius:16px;padding:7px;flex-shrink:0}
.hero h1{margin:0;font-size:28px;font-weight:900;line-height:1.2}
.hero .sub{margin:4px 0 0;color:#a7f3d0;font-size:11.5px;font-weight:800}
.hero .meta{margin-top:8px;font-size:10.5px;color:#ecfdf5;font-weight:700;line-height:1.7}
.badge{display:inline-block;font-size:10px;font-weight:900;border-radius:999px;padding:3px 14px;margin-top:8px}
.badge.closed{background:#34d399;color:#052e26}
.badge.preview{background:#fbbf24;color:#451a03}
.wrap{padding:14px 16px 20px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:12px}
.card{position:relative;background:#fff;border:1px solid #d3e2d8;border-radius:14px;padding:10px 12px 11px;min-height:72px;overflow:hidden;box-shadow:0 6px 18px rgba(6,46,38,.06)}
.card .bar{position:absolute;inset-inline-start:0;top:0;bottom:0;width:4px}
.label{font-size:9.5px;color:#5b6f66;font-weight:800}
.value{direction:ltr;text-align:${rtl ? 'right' : 'left'};font-size:16.5px;line-height:1.25;margin-top:5px;font-weight:900;overflow-wrap:anywhere}
.cash{background:linear-gradient(180deg,#f0fdf6,#fff);border:1.5px solid #0f766e;border-radius:14px;padding:12px 14px;margin-bottom:12px}
.cash h2{margin:0 0 8px;color:#065f46;font-size:14px;font-weight:900}
.cashgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.cashcell{background:#fff;border:1px solid #bbe0d2;border-radius:10px;padding:8px 10px;text-align:center}
.cashcell .l{font-size:9px;font-weight:800;color:#5b6f66}
.cashcell .v{font-size:17px;font-weight:900;margin-top:3px;direction:ltr}
.cashcell.var .v{font-size:19px}
.cashnote{margin-top:8px;font-size:10px;font-weight:800;text-align:center;border-radius:8px;padding:6px}
.cashnote.match{background:#d1fae5;color:#065f46}
.cashnote.over{background:#e0f2fe;color:#075985}
.cashnote.short{background:#fee2e2;color:#991b1b}
.cashsub{margin-top:7px;font-size:9.5px;font-weight:700;color:#3f554c;line-height:1.8}
.notes{background:#fffbeb;border:1.5px solid #d97706;border-radius:14px;padding:12px 14px;margin-bottom:12px}
.notes h2{margin:0 0 6px;color:#92400e;font-size:13px;font-weight:900}
.notes p{margin:0;font-size:10.5px;line-height:1.8;color:#451a03;white-space:pre-wrap;overflow-wrap:anywhere}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.section{background:#fff;border:1px solid #d3e2d8;border-radius:14px;padding:12px;margin-bottom:12px;break-inside:avoid;box-shadow:0 6px 18px rgba(6,46,38,.05)}
.section.full{grid-column:1/-1}
.section h2{margin:0 0 9px;color:#065f46;font-size:13.5px;font-weight:900;border-bottom:2px solid #a7f3d0;padding-bottom:6px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{background:#065f46;color:#fff;font-size:9px;font-weight:900;padding:7px 6px;text-align:${rtl ? 'right' : 'left'}}
th:first-child{border-start-start-radius:8px;border-end-start-radius:8px}th:last-child{border-start-end-radius:8px;border-end-end-radius:8px}
td{font-size:9px;padding:7px 6px;border-bottom:1px solid #e3efe8;vertical-align:middle;overflow-wrap:anywhere;text-align:${rtl ? 'right' : 'left'}}
tbody tr:nth-child(even) td{background:#f4faf6}
tr.total-row td{background:#ecfdf5!important;font-weight:900;border-top:2px solid #0f766e}
.empty{text-align:center;color:#7d8f86;font-weight:800;padding:16px;font-size:10px}
.health{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.chip{background:#f4faf6;border:1px solid #d3e2d8;border-radius:10px;padding:9px;text-align:center}
.chip b{display:block;font-size:16px;direction:ltr}
.chip span{font-size:8.5px;font-weight:800;color:#5b6f66}
.callc{display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:9.5px;font-weight:700;color:#3f554c;background:#f4faf6;border-radius:8px;padding:7px 10px}
.pendline{margin-top:8px;font-size:9.5px;font-weight:800;color:#92400e}
.sign{display:flex;gap:12px;margin-top:2px}
.sign div{flex:1;border:1.5px dashed #7d8f86;border-radius:10px;padding:10px;font-size:9px;font-weight:800;color:#3f554c;text-align:center;line-height:2.2;background:#fff}
</style></head><body>
<header class="hero"><div class="brand">${logoData ? `<img class="logo" src="${logoData}" />` : ''}<div><h1>${t.title}</h1><p class="sub">${t.subtitle}</p><div class="meta">${t.branch}: ${htmlEscape(report.branchName || report.branchId)} &nbsp;•&nbsp; ${t.date}: ${htmlEscape(report.date)}<br/>${t.generated}: ${htmlEscape(generatedAt)}${report.closedBy ? ` &nbsp;•&nbsp; ${t.closedBy}: ${htmlEscape(report.closedBy)}` : ''}</div>${statusBadge}</div></div></header>
<div class="wrap">
<section class="kpis">${cards}</section>
<section class="cash"><h2>${t.sectionCash}</h2><div class="cashgrid">
<div class="cashcell"><div class="l">${t.cashExpected}</div><div class="v">${money(expectedCash)}</div></div>
<div class="cashcell"><div class="l">${t.cashActual}</div><div class="v">${money(actualCash)}</div></div>
<div class="cashcell var"><div class="l">${t.cashVariance}</div><div class="v" style="color:${varianceState === 'match' ? '#059669' : varianceState === 'over' ? '#0284c7' : '#dc2626'}">${variance > 0 ? '+' : ''}${money(variance)}</div></div>
</div><div class="cashnote ${varianceState}">${htmlEscape(varianceLabel)}</div>
${cancelledPaid && safeNumber(cancelledPaid.total) > 0 ? `<div class="cashsub">${t.cancelledPaid}: <b>${int(cancelledPaid.orders)}</b> / <b>${money(cancelledPaid.total)}</b></div>` : ''}
${drivers.map(d => `<div class="cashsub">${htmlEscape(d.driverName)}: <b>${money(d.outstanding)}</b></div>`).join('')}
${refunds ? `<div class="cashsub">${t.refundsLine}: <b>${int(refunds.count)}</b> / <b>${money(refunds.total)}</b></div>` : ''}
</section>
${notes ? `<section class="notes"><h2>${t.sectionNotes}</h2><p>${htmlEscape(notes)}</p></section>` : ''}
<div class="grid">
<section class="section"><h2>${t.sectionSales}</h2>${table([t.type, t.count, t.total], orderTypeRows, row => [row.type, int(row.count), money(row.total)], orderTypeRows.length ? [t.grandTotal, int(sumCount(orderTypeRows)), money(sumTotal(orderTypeRows))] : undefined)}</section>
<section class="section"><h2>${t.sectionPayments}</h2>${table([t.method, t.count, t.total], paymentRows, row => [row.method, int(row.count), money(row.total)], paymentRows.length ? [t.grandTotal, int(sumCount(paymentRows)), money(sumTotal(paymentRows))] : undefined)}</section>
<section class="section"><h2>${t.sectionChannels}</h2>${channelTable}</section>
<section class="section"><h2>${t.sectionExpenses}</h2>${table([t.account, t.total], topExpenseRows, row => [row.name, money(row.total)])}<div class="pendline">${t.pendingExpenses}: ${money(finance.pendingExpenses)}</div></section>
<section class="section full"><h2>${t.sectionExpenseRows}</h2>${table([t.date, t.account, t.description, t.reference, t.amount], expenseRows, row => [row.date ? new Date(row.date).toLocaleDateString(locale) : '-', row.name, row.description || '-', row.reference || '-', money(row.total)])}</section>
<section class="section"><h2>${t.sectionAudit}</h2><div class="health"><div class="chip"><span>${t.events}</span><b>${report.auditSummary?.totalEvents || 0}</b></div><div class="chip"><span>${t.voids}</span><b>${report.auditSummary?.voidCount || 0}</b></div><div class="chip"><span>${t.refunds}</span><b>${report.auditSummary?.refundCount || 0}</b></div><div class="chip"><span>${t.managerDiscounts}</span><b>${report.auditSummary?.discountCount || 0}</b></div></div></section>
<section class="section"><h2>${t.sectionHealth}</h2><div class="health"><div class="chip"><span>${t.fiscalPending}</span><b>${report.fiscalHealth?.pending || 0}</b></div><div class="chip"><span>${t.fiscalFailed}</span><b>${report.fiscalHealth?.failed || 0}</b></div><div class="chip"><span>${t.financeExceptions}</span><b>${report.financeHealth?.pendingExceptions || 0}</b></div><div class="chip"><span>${t.sideEffects}</span><b>${report.sideEffectHealth?.failedTotal || 0}</b></div></div></section>
<section class="section full"><div class="sign"><div>${t.signAccountant} — ${t.signName}: …………………<br/>${t.signSig}: ………………… &nbsp;&nbsp; ${t.signDate}: ……………</div><div>${t.signManager} — ${t.signName}: …………………<br/>${t.signSig}: ………………… &nbsp;&nbsp; ${t.signDate}: ……………</div></div></section>
</div>
</div>
</body></html>`;
    const footerTemplate = `<div style="width:100%;font-size:8px;color:#5b6f66;font-family:'Cairo',Tahoma,Arial,sans-serif;padding:0 12mm;display:flex;justify-content:space-between;align-items:center;direction:${rtl ? 'rtl' : 'ltr'}"><span>Coduis Zen • ${htmlEscape(t.footerTag)} • ${htmlEscape(report.branchName || report.branchId)} • ${htmlEscape(report.date)}</span><span dir="ltr"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
    const puppeteer = await import('puppeteer');
    const browserExecutable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(candidate => fs.existsSync(candidate));
    const browser = await puppeteer.default.launch({ headless: true, executablePath: browserExecutable, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' as any });
        return Buffer.from(await page.pdf({ format: 'A4', landscape: false, printBackground: true, preferCSSPageSize: false, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate, margin: { top: '8mm', bottom: '16mm', left: '0', right: '0' } }));
    } finally {
        await browser.close();
    }
};

export const generateDayCloseXlsx = async (report: any, lang: 'ar' | 'en' = 'ar'): Promise<Buffer> => {
    const rtl = lang === 'ar';
    const locale = rtl ? AR_LATIN_LOCALE : 'en-US';
    const t = rtl ? { summary: 'الملخص', sales: 'المبيعات', payments: 'الدفع', expenses: 'المصروفات', details: 'تفاصيل المصروفات', health: 'الصحة التشغيلية', cash: 'النقدية', channels: 'القنوات', metric: 'البند', value: 'القيمة' } : { summary: 'Summary', sales: 'Sales', payments: 'Payments', expenses: 'Expenses', details: 'Expense Details', health: 'Health', cash: 'Cash', channels: 'Channels', metric: 'Metric', value: 'Value' };
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Coduis Zen';
    workbook.created = new Date();
    const currency = report.currency || 'EGP';
    const money = (value: unknown) => safeNumber(value);
    const orderTypeRows = reportRows(report.orderTypeBreakdown, 'type');
    const paymentRows = reportRows(report.paymentBreakdown, 'method');
    const channelRows = reportRows(report.channelBreakdown, 'source');
    const topExpenseRows = reportRows(report.financeSummary?.topExpenses, 'name');
    const expenseRows = reportRows(report.financeSummary?.expenseRows, 'name');
    const cash = report.shiftCashSummary || report.closedSnapshot?.shifts || {};
    const variance = safeNumber(cash.variance ?? (safeNumber(cash.actualCash) - safeNumber(cash.expectedCash)));

    const BRAND = 'FF0B4F3F';
    const BRAND_LIGHT = 'FFE7F2ED';
    const BAND = 'FFF4FAF6';
    const BORDER = 'FFCBDCD2';
    const thinSide = { style: 'thin', color: { argb: BORDER } } as ExcelJS.Border;
    const thinBorder: Partial<ExcelJS.Borders> = { top: thinSide, bottom: thinSide, left: thinSide, right: thinSide };
    // Styles a data sheet: brand header, banded rows, bold totals row,
    // money formatting, frozen header, autofilter, print fit.
    const styleSheet = (ws: ExcelJS.Worksheet, opts: { moneyCols?: number[]; widths?: number[]; totalRow?: boolean; title?: string }) => {
        const header = ws.getRow(1);
        header.font = { name: 'Cairo', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
        header.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.views = [{ rightToLeft: rtl, state: 'frozen', ySplit: 1 }];
        ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + ws.columnCount)}1` };
        const last = ws.rowCount;
        ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            row.eachCell({ includeEmpty: false }, (cell) => {
                cell.border = thinBorder;
                cell.font = { ...((cell.font as ExcelJS.Font) || {}), name: 'Cairo', size: 11 } as ExcelJS.Font;
            });
            if (rowNumber > 1 && rowNumber % 2 === 0) {
                row.eachCell({ includeEmpty: false }, (cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
                });
            }
        });
        if (opts.totalRow && last > 2) {
            const total = ws.getRow(last);
            total.font = { bold: true };
            total.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_LIGHT } };
            total.border = { ...thinBorder, top: { style: 'double', color: { argb: BRAND } } };
        }
        (opts.moneyCols || []).forEach((col) => {
            ws.getColumn(col).numFmt = '#,##0.00';
        });
        (opts.widths || []).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
        if (!opts.widths) ws.columns.forEach(col => { col.width = 22; });
        ws.properties.tabColor = { argb: 'FF0F766E' };
        ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
        ws.headerFooter = { oddFooter: `&C${report.branchName || report.branchId} • ${report.date} • ${currency}` };
        return ws;
    };
    const addSheet = (name: string, rows: any[][], style?: { moneyCols?: number[]; widths?: number[]; totalRow?: boolean }) => {
        const ws = workbook.addWorksheet(name);
        ws.addRows(rows);
        return styleSheet(ws, style || {});
    };
    // NOTE: row positions below are contractual (Summary!B4 = orders,
    // Payments!C2 = first payment total) — styling only, never reorder.
    addSheet(t.summary, [
        [t.metric, t.value],
        [rtl ? 'الفرع' : 'Branch', report.branchName || report.branchId],
        [rtl ? 'تاريخ التشغيل' : 'Business Date', report.date],
        [rtl ? 'عدد الطلبات' : 'Orders', report.salesSummary?.totalOrders || 0],
        [rtl ? 'إجمالي الإيراد' : 'Gross Revenue', money(report.salesSummary?.totalRevenue)],
        [rtl ? 'صافي المبيعات' : 'Net Sales', money(report.salesSummary?.netSales)],
        [rtl ? 'المصروفات' : 'Expenses', money(report.financeSummary?.expenses)],
        [rtl ? 'صافي الربح' : 'Net Profit', money(report.financeSummary?.netProfit)],
        [rtl ? 'الحالة' : 'Status', String(report.status || 'OPEN')],
        [rtl ? 'أغلق بواسطة' : 'Closed By', report.closedBy || '-'],
        [rtl ? 'العملة' : 'Currency', currency],
    ], { moneyCols: [2], widths: [26, 30] });
    addSheet(t.sales, [
        [rtl ? 'النوع' : 'Type', rtl ? 'العدد' : 'Count', rtl ? 'الإجمالي' : 'Total'],
        ...orderTypeRows.map((r: any) => [r.type, r.count, money(r.total)]),
        ...(orderTypeRows.length ? [[rtl ? 'الإجمالي' : 'Total', orderTypeRows.reduce((s: number, r: any) => s + safeNumber(r.count), 0), orderTypeRows.reduce((s: number, r: any) => s + safeNumber(r.total), 0)]] : []),
    ], { moneyCols: [3], widths: [24, 14, 22], totalRow: true });
    addSheet(t.payments, [
        [rtl ? 'طريقة الدفع' : 'Method', rtl ? 'العدد' : 'Count', rtl ? 'الإجمالي' : 'Total'],
        ...paymentRows.map((r: any) => [r.method, r.count, money(r.total)]),
        ...(paymentRows.length ? [[rtl ? 'الإجمالي' : 'Total', paymentRows.reduce((s: number, r: any) => s + safeNumber(r.count), 0), paymentRows.reduce((s: number, r: any) => s + safeNumber(r.total), 0)]] : []),
    ], { moneyCols: [3], widths: [24, 14, 22], totalRow: true });
    addSheet(t.cash, [
        [t.metric, t.value],
        [rtl ? 'النقدية المتوقعة' : 'Expected Cash', money(cash.expectedCash)],
        [rtl ? 'النقدية الفعلية' : 'Actual Cash', money(cash.actualCash)],
        [rtl ? 'الفرق (زيادة / عجز)' : 'Variance (Over / Short)', variance],
        [rtl ? 'الحالة' : 'State', Math.abs(variance) <= 0.005 ? (rtl ? 'مطابق' : 'Matched') : variance > 0 ? (rtl ? 'زيادة' : 'Over') : (rtl ? 'عجز' : 'Short')],
        ...(report.cancelledPaidSummary ? [[rtl ? 'ملغي-مدفوع' : 'Cancelled-paid', money(report.cancelledPaidSummary.total)]] : []),
        ...((Array.isArray(report.driverCashOutstanding) ? report.driverCashOutstanding : []).map((d: any) => [d.driverName, money(d.outstanding)])),
        ...(report.notes ? [[rtl ? 'ملاحظات الإغلاق' : 'Close Notes', String(report.notes)]] : []),
    ], { moneyCols: [2], widths: [30, 30] });
    addSheet(t.channels, [
        [rtl ? 'القناة' : 'Channel', rtl ? 'العدد' : 'Count', rtl ? 'الإجمالي' : 'Total'],
        ...channelRows.map((r: any) => [r.source, r.count, money(r.total)]),
        ...(channelRows.length ? [[rtl ? 'الإجمالي' : 'Total', channelRows.reduce((s: number, r: any) => s + safeNumber(r.count), 0), channelRows.reduce((s: number, r: any) => s + safeNumber(r.total), 0)]] : []),
    ], { moneyCols: [3], widths: [26, 14, 22], totalRow: true });
    addSheet(t.expenses, [
        [rtl ? 'الحساب' : 'Account', rtl ? 'الإجمالي' : 'Total'],
        ...topExpenseRows.map((r: any) => [r.name, money(r.total)]),
        ...(topExpenseRows.length ? [[rtl ? 'الإجمالي' : 'Total', topExpenseRows.reduce((s: number, r: any) => s + safeNumber(r.total), 0)]] : []),
    ], { moneyCols: [2], widths: [34, 22], totalRow: true });
    addSheet(t.details, [
        [rtl ? 'التاريخ' : 'Date', rtl ? 'الحساب' : 'Account', rtl ? 'الوصف' : 'Description', rtl ? 'المرجع' : 'Reference', rtl ? 'القيمة' : 'Amount'],
        ...expenseRows.map((r: any) => [r.date ? new Date(r.date).toLocaleDateString(locale) : '-', r.name, r.description || '-', r.reference || '-', money(r.total)]),
    ], { moneyCols: [5], widths: [16, 26, 40, 20, 18] });
    addSheet(t.health, [
        [t.metric, t.value],
        ['Fiscal Pending', report.fiscalHealth?.pending || 0],
        ['Fiscal Failed', report.fiscalHealth?.failed || 0],
        ['Finance Exceptions', report.financeHealth?.pendingExceptions || 0],
        ['Side Effect Errors', report.sideEffectHealth?.failedTotal || 0],
        ['Audit Events', report.auditSummary?.totalEvents || 0],
        ['Voids', report.auditSummary?.voidCount || 0],
        ['Refunds', report.auditSummary?.refundCount || 0],
    ], { widths: [26, 20] });
    return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const generatePayslipPDF = async (payslip: any, lang: 'ar' | 'en' = 'ar'): Promise<Buffer> => {
    const { renderReportPdf, reportLocale, fmtMoney, fmtDateTime } = await import('./reportStyle');
    const rtl = lang === 'ar';
    const locale = reportLocale(lang);
    const payload = payslip.payload || {};
    const fixedAllowances = Number(payload.fixedAllowances || payload.components?.fixedAllowances || 0);
    const fixedDeductions = Number(payload.fixedDeductions || payload.components?.fixedDeductions || 0);
    const attendanceDeductions = Number(payload.attendanceDeductions || payload.components?.attendanceDeductions || 0);
    const t = rtl ? {
        title: 'قسيمة راتب', subtitle: 'كشف مستحقات الموظف', employee: 'الموظف', employeeId: 'كود الموظف', branch: 'الفرع', cycle: 'الدورة', generated: 'تاريخ الإصدار',
        earnings: 'المستحقات', deductions: 'الاستقطاعات', totals: 'الإجمالي', item: 'البند', amount: 'القيمة',
        basic: 'الراتب الأساسي', allowances: 'بدلات ثابتة', overtime: 'إضافي', bonuses: 'مكافآت', otherEarn: 'مستحقات أخرى',
        penalties: 'جزاءات', loans: 'أقساط سلف', attendance: 'خصم الحضور', fixed: 'استقطاعات ثابتة', otherDed: 'استقطاعات أخرى',
        gross: 'إجمالي المستحق', totalDed: 'إجمالي الاستقطاعات', net: 'صافي الراتب',
        signEmployee: 'الموظف', signManager: 'المدير المالي',
    } : {
        title: 'Payslip', subtitle: 'Employee earnings statement', employee: 'Employee', employeeId: 'Employee ID', branch: 'Branch', cycle: 'Cycle', generated: 'Issued',
        earnings: 'Earnings', deductions: 'Deductions', totals: 'Totals', item: 'Item', amount: 'Amount',
        basic: 'Basic Salary', allowances: 'Fixed Allowances', overtime: 'Overtime', bonuses: 'Bonuses', otherEarn: 'Other Earnings',
        penalties: 'Penalties', loans: 'Loan Deductions', attendance: 'Attendance Deductions', fixed: 'Fixed Deductions', otherDed: 'Other Deductions',
        gross: 'Gross Pay', totalDed: 'Total Deductions', net: 'Net Pay',
        signEmployee: 'Employee', signManager: 'Finance Manager',
    };
    const money = (v: unknown) => fmtMoney(v, locale, 'EGP');
    const earnings: [string, number][] = [
        [t.basic, Number(payload.baseSalary || 0)],
        [t.allowances, fixedAllowances],
        [t.overtime, Number(payload.overtime || 0)],
        [t.bonuses, Number(payload.bonuses || 0)],
        [t.otherEarn, Number(payload.earnings || 0)],
    ];
    const deductions: [string, number][] = [
        [t.penalties, Number(payload.penalties || 0)],
        [t.loans, Number(payload.loanDeductions || 0)],
        [t.attendance, attendanceDeductions],
        [t.fixed, fixedDeductions],
        [t.otherDed, Number(payload.otherDeductions || 0)],
    ];
    const totalDed = deductions.reduce((s, [, v]) => s + v, 0);
    const gross = Number(payload.grossPay ?? earnings.reduce((s, [, v]) => s + v, 0));
    const net = Number(payload.netPay ?? gross - totalDed);
    return renderReportPdf({
        lang,
        title: t.title,
        subtitle: `${t.subtitle} • ${payslip.cycleId || ''}`,
        meta: [
            [t.employee, String(payload.employeeName || payslip.employeeId || '-')],
            [t.employeeId, String(payslip.employeeId || '-')],
            [t.branch, String(payload.branchName || '-')],
            [t.cycle, String(payslip.cycleId || '-')],
            [t.generated, fmtDateTime(payload.generatedAt || new Date(), locale)],
        ],
        kpis: [
            { label: t.gross, value: money(gross), color: '#1d4ed8' },
            { label: t.totalDed, value: money(totalDed), color: '#dc2626' },
            { label: t.net, value: money(net), color: '#059669' },
        ],
        sections: [
            { title: t.earnings, headers: [t.item, t.amount], rows: earnings.map(([l, v]) => [l, money(v)]), footer: [t.gross, money(gross)] },
            { title: t.deductions, headers: [t.item, t.amount], rows: deductions.map(([l, v]) => [l, money(v)]), footer: [t.totalDed, money(totalDed)] },
            { title: t.totals, headers: [t.item, t.amount], rows: [[t.gross, money(gross)], [t.totalDed, money(totalDed)]], footer: [t.net, money(net)] },
        ],
        signatures: [t.signEmployee, t.signManager],
        footerTag: t.title,
        footerMeta: String(payload.employeeName || payslip.employeeId || ''),
    });
};

export const generateHrAttendancePDF = async (report: any, lang: 'ar' | 'en' = 'ar'): Promise<Buffer> => {
    const rows = Array.isArray(report.rows) ? report.rows : [];
    const rtl = lang === 'ar';
    const locale = rtl ? AR_LATIN_LOCALE : 'en-US';
    const text = rtl ? {
        title: 'تقرير حضور الموظفين', period: 'الفترة', generated: 'تاريخ الإنشاء', employees: 'الموظفون', days: 'الأيام', completed: 'مكتملة', open: 'مفتوحة', leave: 'إجازة', rest: 'راحة أسبوعية', absent: 'غياب', hours: 'إجمالي الساعات', employee: 'الموظف', code: 'الكود', branch: 'الفرع', day: 'اليوم', clockIn: 'الحضور', clockOut: 'الانصراف', late: 'تأخير', early: 'انصراف مبكر', overtime: 'إضافي', status: 'الحالة', noRows: 'لا توجد سجلات مطابقة للفترة الحالية'
    } : {
        title: 'Employee Attendance Report', period: 'Period', generated: 'Generated at', employees: 'Employees', days: 'Days', completed: 'Completed', open: 'Open', leave: 'Leave', rest: 'Weekly Rest', absent: 'Absent', hours: 'Total Hours', employee: 'Employee', code: 'Code', branch: 'Branch', day: 'Day', clockIn: 'Clock in', clockOut: 'Clock out', late: 'Late', early: 'Early leave', overtime: 'Overtime', status: 'Status', noRows: 'No matching attendance records for this period'
    };
    const htmlEscape = (value: unknown) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const labelStatus = (status?: string) => {
        const value = String(status || '').toUpperCase();
        if (value === 'CLOSED' || value === 'COMPLETED') return text.completed;
        if (value === 'OPEN' || value === 'IN_PROGRESS') return text.open;
        if (value === 'LEAVE') return text.leave;
        if (value === 'REST_DAY') return text.rest;
        if (value === 'ABSENT' || value === 'NO_PUNCH') return text.absent;
        return value || '-';
    };
    const statusClass = (label: string) => {
        if (label === text.completed) return 'done';
        if (label === text.open) return 'open';
        if (label === text.leave) return 'leave';
        if (label === text.rest) return 'rest';
        if (label === text.absent) return 'absent';
        return 'review';
    };
    const datePart = (value?: string | Date | null) => {
        if (!value) return '-';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
    };
    const timePart = (value?: string | Date | null) => {
        if (!value) return '-';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '-' : date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    };
    const num = (value: unknown) => {
        const parsed = Number(value || 0);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const logoFile = 'public/logo.png';
    const logoData = fs.existsSync(logoFile) ? `data:image/png;base64,${fs.readFileSync(logoFile).toString('base64')}` : '';
    const statusCounts = rows.reduce((acc: Record<string, number>, row: any) => {
        const label = labelStatus(row.status);
        acc[label] = (acc[label] || 0) + 1;
        return acc;
    }, {});
    const hoursTotal = rows.reduce((sum: number, row: any) => sum + num(row.totalHours), 0);
    const employeeGroups = new Map<string, any[]>();
    rows.forEach((row: any) => {
        const key = String(row.employeeId || row.employeeCode || row.employeeName || 'unknown');
        const list = employeeGroups.get(key) || [];
        list.push(row);
        employeeGroups.set(key, list);
    });
    const dayRows = Array.from(employeeGroups.values()).map((employeeRows: any[], index: number) => {
        const first = employeeRows[0] || {};
        const employeeHours = employeeRows.reduce((sum: number, row: any) => sum + num(row.totalHours), 0);
        const details = employeeRows
            .sort((a: any, b: any) => String(a.clockInAt || '').localeCompare(String(b.clockInAt || '')))
            .map((row: any) => {
                const label = labelStatus(row.status);
                const technicalDay = ['ABSENT', 'LEAVE', 'REST_DAY'].includes(String(row.status || '').toUpperCase());
                return `
                    <tr class="day-row">
                        <td></td>
                        <td>${htmlEscape(datePart(row.clockInAt))}</td>
                        <td>${htmlEscape(technicalDay ? '-' : timePart(row.clockInAt))}</td>
                        <td>${htmlEscape(timePart(row.clockOutAt))}</td>
                        <td class="center strong">${num(row.totalHours).toFixed(2)}</td>
                        <td class="center late">${num(row.lateMinutes)}</td>
                        <td class="center early">${num(row.earlyLeaveMinutes)}</td>
                        <td class="center overtime">${num(row.overtimeMinutes)}</td>
                        <td><span class="pill ${statusClass(label)}">${htmlEscape(label)}</span></td>
                    </tr>
                `;
            }).join('');
        return `
            <tr class="employee-row">
                <td class="center">${index + 1}</td>
                <td colspan="3"><div class="employee-name">${htmlEscape(first.employeeName || first.employeeId || '-')}</div><div class="employee-meta">${htmlEscape(first.employeeCode || first.employeeId || '-')} · ${htmlEscape(first.branchName || first.branchId || '-')}</div></td>
                <td class="center strong">${employeeHours.toFixed(2)}</td>
                <td colspan="2" class="center">${text.completed}: ${employeeRows.filter((row: any) => labelStatus(row.status) === text.completed).length}</td>
                <td colspan="2" class="center">${text.days}: ${employeeRows.length}</td>
            </tr>
            ${details}
        `;
    }).join('');
    const generatedAt = new Date().toLocaleString(locale);
    const html = `<!doctype html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8" />
<style>
${cairoFontCss()}
@page { size: A4 landscape; margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; background: #f5f7fb; color: #142033; direction: ${rtl ? 'rtl' : 'ltr'}; font-family: 'Cairo',Tahoma, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.hero { background: linear-gradient(135deg,#052e26,#0b4f3f 60%,#0f766e); color: #fff; border-radius: 18px; padding: 16px 20px; margin-bottom: 12px; display:flex; align-items:center; justify-content:space-between; gap:18px; }
.logo { width: 70px; height: 70px; object-fit: contain; background:#fff; border-radius:16px; padding:8px; }
.hero h1 { margin: 0 0 8px; font-size: 27px; line-height: 1.2; font-weight: 900; }
.hero p { margin: 0; color: #dbeafe; font-size: 12px; font-weight: 700; }
.cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 12px; }
.card { background: #fff; border: 1px solid #dbe5f1; border-radius: 12px; padding: 9px 11px; min-height: 64px; }
.label { color: #64748b; font-size: 10px; font-weight: 800; }
.value { color: #10243e; font-size: 22px; line-height: 1.1; margin-top: 4px; font-weight: 900; direction: ltr; text-align: ${rtl ? 'right' : 'left'}; }
table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d8e4f2; table-layout: fixed; }
thead { display: table-header-group; }
th { background: #eaf2ff; color: #19324f; font-size: 9px; font-weight: 900; padding: 7px 5px; border: 1px solid #d1dfef; text-align: ${rtl ? 'right' : 'left'}; white-space: nowrap; }
td { font-size: 9px; padding: 6px 5px; border: 1px solid #e1ebf6; text-align: ${rtl ? 'right' : 'left'}; vertical-align: middle; overflow-wrap: anywhere; }
tbody tr:nth-child(even) td { background: #f8fbff; }
.employee-row td { background: #eef6ff !important; border-top: 2px solid #bfd7f4; }
.employee-name { font-size: 11px; font-weight: 900; color: #10243e; }
.employee-meta { margin-top: 3px; font-size: 8px; font-weight: 800; color: #64748b; }
.center { text-align: center; }
.strong { font-weight: 900; }
.pill { display: inline-block; min-width: 58px; text-align: center; padding: 3px 7px; border-radius: 999px; font-weight: 900; }
.done { color: #047857; background: #d1fae5; }
.open { color: #b45309; background: #fef3c7; }
.leave { color: #0369a1; background: #dbeafe; }
.rest { color: #6d28d9; background: #ede9fe; }
.absent { color: #be123c; background: #ffe4e6; }
.review { color: #475569; background: #f1f5f9; }
.late { color: #be123c; font-weight: 900; }
.early { color: #2563eb; font-weight: 900; }
.overtime { color: #7c3aed; font-weight: 900; }
.empty { padding: 42px; text-align: center; color: #64748b; font-weight: 900; }
</style></head>
<body>
<section class="hero"><div><h1>${text.title}</h1><p>${text.period}: ${htmlEscape(report.period?.startDate || 'all')} ${rtl ? 'إلى' : 'to'} ${htmlEscape(report.period?.endDate || 'all')} | ${text.generated}: ${htmlEscape(generatedAt)}</p></div>${logoData ? `<img class="logo" src="${logoData}" />` : ''}</section>
<section class="cards">
<div class="card"><div class="label">${text.employees}</div><div class="value">${employeeGroups.size}</div></div>
<div class="card"><div class="label">${text.days}</div><div class="value">${rows.length}</div></div>
<div class="card"><div class="label">${text.completed}</div><div class="value" style="color:#047857">${statusCounts[text.completed] || 0}</div></div>
<div class="card"><div class="label">${text.open}</div><div class="value" style="color:#b45309">${statusCounts[text.open] || 0}</div></div>
<div class="card"><div class="label">${text.absent}</div><div class="value" style="color:#be123c">${statusCounts[text.absent] || 0}</div></div>
<div class="card"><div class="label">${text.hours}</div><div class="value" style="color:#2563eb">${hoursTotal.toFixed(1)}</div></div>
</section>
<table><thead><tr><th style="width:5%">#</th><th style="width:15%">${text.day}</th><th style="width:12%">${text.clockIn}</th><th style="width:12%">${text.clockOut}</th><th style="width:10%">${text.hours}</th><th style="width:10%">${text.late}</th><th style="width:12%">${text.early}</th><th style="width:10%">${text.overtime}</th><th style="width:14%">${text.status}</th></tr></thead><tbody>${dayRows || `<tr><td colspan="9" class="empty">${text.noRows}</td></tr>`}</tbody></table>
</body></html>`;
    const puppeteer = await import('puppeteer');
    const browserExecutable = [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ].find(candidate => fs.existsSync(candidate));
    const browser = await puppeteer.default.launch({ headless: true, executablePath: browserExecutable, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' as any });
        const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
};
export const generatePayrollCompliancePDF = async (report: any): Promise<Buffer> => {
    const lang = String(report.lang || 'ar').toLowerCase() === 'en' ? 'en' : 'ar';
    const rtl = lang === 'ar';
    const locale = rtl ? AR_LATIN_LOCALE : 'en-US';
    const t = rtl ? {
        title: 'تقرير الرواتب والامتثال', period: 'الفترة', generated: 'تاريخ الإنشاء', employees: 'الموظفون', gross: 'إجمالي الرواتب', employeeInsurance: 'تأمين الموظف', employerInsurance: 'تأمين صاحب العمل', tax: 'ضريبة المرتب', net: 'الصافي بعد الاستقطاعات', rows: 'البيانات', config: 'إعدادات الامتثال', noRows: 'لا توجد بيانات'
    } : {
        title: 'Payroll Compliance Report', period: 'Period', generated: 'Generated at', employees: 'Employees', gross: 'Gross payroll', employeeInsurance: 'Employee insurance', employerInsurance: 'Employer insurance', tax: 'Salary tax', net: 'Net after statutory', rows: 'Rows', config: 'Compliance config', noRows: 'No rows'
    };
    const htmlEscape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const money = (value: unknown) => Number(value || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const logoFile = 'public/logo.png';
    const logoData = fs.existsSync(logoFile) ? `data:image/png;base64,${fs.readFileSync(logoFile).toString('base64')}` : '';
    const rows = Array.isArray(report.rows) ? report.rows : [];
    const headers = Object.keys(rows[0] || {}).slice(0, 9);
    const tableRows = rows.slice(0, 120).map((row: any) => `
        <tr>${headers.map(header => `<td>${htmlEscape(row[header])}</td>`).join('')}</tr>
    `).join('');
    const generatedAt = new Date().toLocaleString(locale);
    const html = `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" />
<style>
${cairoFontCss()}
@page { size:A4 landscape; margin:10mm; }
* { box-sizing:border-box; }
body { margin:0; background:#f5f7fb; color:#142033; direction:${rtl ? 'rtl' : 'ltr'}; font-family:'Cairo',Tahoma,Arial,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.hero { background:linear-gradient(135deg,#052e26,#0b4f3f 60%,#0f766e); color:#fff; border-radius:18px; padding:16px 20px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; gap:18px; }
.logo { width:70px; height:70px; object-fit:contain; background:#fff; border-radius:16px; padding:8px; }
h1 { margin:0 0 8px; font-size:27px; font-weight:900; }
.hero p { margin:0; color:#dbeafe; font-size:12px; font-weight:700; }
.cards { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; margin-bottom:12px; }
.card { background:#fff; border:1px solid #dbe5f1; border-radius:12px; padding:9px 11px; min-height:64px; }
.label { color:#64748b; font-size:10px; font-weight:800; }
.value { color:#10243e; font-size:19px; line-height:1.1; margin-top:4px; font-weight:900; direction:ltr; text-align:${rtl ? 'right' : 'left'}; }
table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #d8e4f2; table-layout:fixed; }
th { background:#eaf2ff; color:#19324f; font-size:9px; font-weight:900; padding:7px 5px; border:1px solid #d1dfef; text-align:${rtl ? 'right' : 'left'}; }
td { font-size:8.5px; padding:6px 5px; border:1px solid #e1ebf6; text-align:${rtl ? 'right' : 'left'}; vertical-align:middle; overflow-wrap:anywhere; }
tbody tr:nth-child(even) td { background:#f8fbff; }
.section-title { font-size:13px; font-weight:900; color:#10243e; margin:14px 0 8px; }
.empty { padding:35px; text-align:center; color:#64748b; font-weight:900; }
</style></head><body>
<section class="hero"><div><h1>${t.title}</h1><p>${htmlEscape(report.template)} | ${htmlEscape(report.cycle?.branchName || report.cycle?.branchId || '')} | ${t.period}: ${htmlEscape(report.cycle?.periodStart || '')} ${rtl ? 'إلى' : 'to'} ${htmlEscape(report.cycle?.periodEnd || '')} | ${t.generated}: ${htmlEscape(generatedAt)}</p></div>${logoData ? `<img class="logo" src="${logoData}" />` : ''}</section>
<section class="cards">
<div class="card"><div class="label">${t.employees}</div><div class="value">${report.totals?.employees || 0}</div></div>
<div class="card"><div class="label">${t.gross}</div><div class="value">${money(report.totals?.grossPay)}</div></div>
<div class="card"><div class="label">${t.employeeInsurance}</div><div class="value">${money(report.totals?.employeeInsurance)}</div></div>
<div class="card"><div class="label">${t.employerInsurance}</div><div class="value">${money(report.totals?.employerInsurance)}</div></div>
<div class="card"><div class="label">${t.tax}</div><div class="value">${money(report.totals?.salaryTax)}</div></div>
<div class="card"><div class="label">${t.net}</div><div class="value">${money(report.totals?.netAfterStatutory)}</div></div>
</section>
<div class="section-title">${t.rows}</div>
<table><thead><tr>${headers.map(header => `<th>${htmlEscape(header)}</th>`).join('')}</tr></thead><tbody>${tableRows || `<tr><td colspan="${Math.max(headers.length, 1)}" class="empty">${t.noRows}</td></tr>`}</tbody></table>
<div class="section-title">${t.config}</div>
<table><tbody><tr><td>Annual exemption</td><td>${money(report.config?.annualPersonalExemption)}</td><td>Employee insurance</td><td>${Number(report.config?.employeeInsuranceRate || 0) * 100}%</td><td>Employer insurance</td><td>${Number(report.config?.employerInsuranceRate || 0) * 100}%</td></tr></tbody></table>
</body></html>`;
    const puppeteer = await import('puppeteer');
    const browserExecutable = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(candidate => fs.existsSync(candidate));
    const browser = await puppeteer.default.launch({ headless: true, executablePath: browserExecutable, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' as any });
        const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
};

