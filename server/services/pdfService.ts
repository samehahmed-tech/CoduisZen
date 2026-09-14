// @ts-ignore
import PDFDocument from 'pdfkit';
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
    const locale = rtl ? 'ar-EG' : 'en-US';
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
*{box-sizing:border-box} body{margin:0;background:#fff;color:#102033;font-family:Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hero{background:#0b172a;color:#fff;border-radius:${thermal ? '0' : '16px'};padding:${thermal ? '8px 2mm' : '14px 18px'};margin-bottom:${thermal ? '6px' : '12px'};text-align:center}
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
        await page.setContent(html, { waitUntil: 'networkidle0' });
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
    const locale = rtl ? 'ar-EG' : 'en-US';
    const sales = report.salesSummary || {};
    const finance = report.financeSummary || {};
    const orderTypeRows = reportRows(report.orderTypeBreakdown, 'type');
    const paymentRows = reportRows(report.paymentBreakdown, 'method');
    const topExpenseRows = reportRows(finance.topExpenses, 'name');
    const expenseRows = reportRows(finance.expenseRows, 'name');
    const currency = report.currency || 'EGP';
    const money = (value: unknown) => `${safeNumber(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    const t = rtl ? {
        title: 'تقرير إغلاق اليوم', subtitle: 'ملخص تشغيلي ومالي كامل', branch: 'الفرع', date: 'تاريخ التشغيل', generated: 'تاريخ التقرير', closedBy: 'أغلق بواسطة',
        orders: 'الطلبات', gross: 'إجمالي الإيراد', discounts: 'الخصومات', tax: 'الضريبة', netSales: 'صافي المبيعات', expenses: 'المصروفات', profit: 'صافي الربح', avgOrder: 'متوسط الطلب',
        sectionSales: 'تفاصيل المبيعات', sectionPayments: 'طرق الدفع', sectionExpenses: 'المصروفات', sectionExpenseRows: 'تفاصيل المصروفات', sectionAudit: 'المراجعة والرقابة', sectionHealth: 'سلامة التشغيل',
        type: 'النوع', count: 'العدد', total: 'الإجمالي', method: 'طريقة الدفع', account: 'الحساب', description: 'الوصف', reference: 'المرجع', amount: 'القيمة',
        pendingExpenses: 'مصروفات معلقة', events: 'أحداث المراجعة', voids: 'إلغاءات', refunds: 'مرتجعات', managerDiscounts: 'خصومات مدير', fiscalPending: 'فواتير معلقة', fiscalFailed: 'فواتير فاشلة',
        financeExceptions: 'استثناءات مالية', sideEffects: 'أخطاء تشغيل', noData: 'لا توجد بيانات'
    } : {
        title: 'End of Day Report', subtitle: 'Complete operational and financial summary', branch: 'Branch', date: 'Business Date', generated: 'Generated', closedBy: 'Closed By',
        orders: 'Orders', gross: 'Gross Revenue', discounts: 'Discounts', tax: 'Tax', netSales: 'Net Sales', expenses: 'Expenses', profit: 'Net Profit', avgOrder: 'Average Order',
        sectionSales: 'Sales Details', sectionPayments: 'Payments', sectionExpenses: 'Expenses', sectionExpenseRows: 'Expense Details', sectionAudit: 'Audit & Controls', sectionHealth: 'Operational Health',
        type: 'Type', count: 'Count', total: 'Total', method: 'Method', account: 'Account', description: 'Description', reference: 'Reference', amount: 'Amount',
        pendingExpenses: 'Pending Expenses', events: 'Audit Events', voids: 'Voids', refunds: 'Refunds', managerDiscounts: 'Manager Discounts', fiscalPending: 'Fiscal Pending', fiscalFailed: 'Fiscal Failed',
        financeExceptions: 'Finance Exceptions', sideEffects: 'Side Effect Errors', noData: 'No data'
    };
    const logoFile = 'public/logo.png';
    const logoData = fs.existsSync(logoFile) ? `data:image/png;base64,${fs.readFileSync(logoFile).toString('base64')}` : '';
    const table = (headers: string[], rows: any[], cells: (row: any) => unknown[]) => `
        <table><thead><tr>${headers.map(h => `<th>${htmlEscape(h)}</th>`).join('')}</tr></thead><tbody>${
            rows.length ? rows.map(row => `<tr>${cells(row).map((cell, index) => `<td data-label="${htmlEscape(headers[index] || '')}">${htmlEscape(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="empty">${t.noData}</td></tr>`
        }</tbody></table>`;
    const cards = [
        [t.orders, sales.totalOrders || 0, '#0f172a'], [t.gross, money(sales.totalRevenue), '#2563eb'], [t.discounts, money(sales.totalDiscount), '#f97316'], [t.tax, money(sales.totalTax), '#7c3aed'],
        [t.netSales, money(sales.netSales), '#059669'], [t.expenses, money(finance.expenses), '#dc2626'], [t.profit, money(finance.netProfit), safeNumber(finance.netProfit) >= 0 ? '#059669' : '#dc2626'], [t.avgOrder, money(sales.averageOrderValue), '#0f172a'],
    ].map(([label, value, color]) => `<div class="card"><div class="label">${htmlEscape(label)}</div><div class="value" style="color:${color}">${htmlEscape(value)}</div></div>`).join('');
    const pageStyle = thermal ? '@page { size:80mm auto; margin:0; }' : '@page { size:A4 landscape; margin:9mm; }';
    const thermalStyle = thermal ? `
html,body{width:80mm;max-width:80mm;background:#fff;color:#000;font-size:10px;overflow:visible}
body{margin:0;padding:2mm;width:80mm;max-width:80mm}
.hero{display:block;background:#fff;color:#000;border:0;border-bottom:2px solid #000;border-radius:0;padding:4px 0 7px;margin-bottom:7px;box-shadow:none;text-align:center}
.logo{width:34px;height:34px;border:0;border-radius:0;float:none;margin:0 auto 3px;padding:0}.hero h1{font-size:17px}.hero p{color:#000;font-size:9px}.meta{color:#000!important;font-size:8px;line-height:1.45}
.cards{grid-template-columns:1fr 1fr;gap:4px;margin-bottom:7px}.card{border:1px solid #000;border-radius:0;padding:5px;min-height:44px;box-shadow:none}.label{color:#000;font-size:8px}.value{color:#000!important;font-size:12px;margin-top:2px}
.grid{display:block}.section{border:1px solid #000;border-radius:0;padding:5px;margin-bottom:6px;box-shadow:none;break-inside:auto}.section h2{color:#000;font-size:11px;margin-bottom:4px;border-bottom:1px solid #000;padding-bottom:3px}
table,thead,tbody,tr,th,td{display:block;width:100%}thead{display:none}table{border:0;table-layout:auto}tbody tr{padding:3px 0;border-bottom:1px dashed #777;break-inside:avoid}tbody tr:last-child{border-bottom:0}td{display:grid;grid-template-columns:minmax(0,38%) minmax(0,62%);gap:4px;border:0!important;background:#fff!important;font-size:8.5px;line-height:1.35;padding:2px 0;text-align:${rtl ? 'right' : 'left'};overflow-wrap:anywhere}td::before{content:attr(data-label);font-weight:900;color:#000}.empty{display:block;padding:8px;text-align:center}.empty::before{content:none}
.health{grid-template-columns:1fr 1fr;gap:3px}.chip{background:#fff;border-color:#000;border-radius:0;padding:4px}.chip b{font-size:11px}.chip span{color:#000;font-size:7px}
` : '';
    const html = `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" /><style>
${pageStyle} *{box-sizing:border-box} body{margin:0;background:#eef3f8;color:#102033;direction:${rtl ? 'rtl' : 'ltr'};font-family:Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hero{background:linear-gradient(135deg,#0b172a,#123c69 55%,#0f766e);color:#fff;border-radius:22px;padding:18px 22px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:18px;box-shadow:0 14px 34px rgba(15,23,42,.16)}
.logo{width:72px;height:72px;object-fit:contain;background:#fff;border-radius:18px;padding:8px}.hero h1{margin:0 0 6px;font-size:30px;font-weight:900}.hero p{margin:0;color:#dbeafe;font-size:12px;font-weight:800}.meta{margin-top:9px;font-size:11px;color:#ecfeff;font-weight:800}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:12px}.card{background:#fff;border:1px solid #d7e3f0;border-radius:16px;padding:11px 13px;min-height:70px;box-shadow:0 8px 22px rgba(15,23,42,.06)}.label{font-size:10px;color:#64748b;font-weight:900}.value{direction:ltr;text-align:${rtl ? 'right' : 'left'};font-size:20px;line-height:1.18;margin-top:6px;font-weight:900}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.section{background:#fff;border:1px solid #d7e3f0;border-radius:16px;padding:12px;margin-bottom:12px;break-inside:avoid}.section h2{margin:0 0 9px;color:#123c69;font-size:15px;font-weight:900}
table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#e7f0fb;color:#123c69;font-size:9px;font-weight:900;padding:7px 6px;border:1px solid #d4e2f0;text-align:${rtl ? 'right' : 'left'}}td{font-size:9px;padding:7px 6px;border:1px solid #e2ebf5;vertical-align:middle;overflow-wrap:anywhere}tbody tr:nth-child(even) td{background:#f8fbff}.empty{text-align:center;color:#64748b;font-weight:900;padding:18px}.health{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.chip{background:#f8fafc;border:1px solid #dbe5f1;border-radius:12px;padding:10px}.chip b{display:block;font-size:17px;direction:ltr}.chip span{font-size:9px;font-weight:900;color:#64748b}${thermalStyle}
</style></head><body>
<section class="hero"><div><h1>${t.title}</h1><p>${t.subtitle}</p><div class="meta">${t.branch}: ${htmlEscape(report.branchName || report.branchId)} · ${t.date}: ${htmlEscape(report.date)} · ${t.generated}: ${htmlEscape(new Date().toLocaleString(locale))}${report.closedBy ? ` · ${t.closedBy}: ${htmlEscape(report.closedBy)}` : ''}</div></div>${logoData ? `<img class="logo" src="${logoData}" />` : ''}</section>
<section class="cards">${cards}</section>
<div class="grid">
<section class="section"><h2>${t.sectionSales}</h2>${table([t.type, t.count, t.total], orderTypeRows, row => [row.type, row.count, money(row.total)])}</section>
<section class="section"><h2>${t.sectionPayments}</h2>${table([t.method, t.count, t.total], paymentRows, row => [row.method, row.count, money(row.total)])}</section>
</div>
<section class="section"><h2>${t.sectionExpenses}</h2>${table([t.account, t.total], topExpenseRows, row => [row.name, money(row.total)])}<div class="meta" style="color:#64748b">${t.pendingExpenses}: ${money(finance.pendingExpenses)}</div></section>
<section class="section"><h2>${t.sectionExpenseRows}</h2>${table([t.date, t.account, t.description, t.reference, t.amount], expenseRows, row => [row.date ? new Date(row.date).toLocaleDateString(locale) : '-', row.name, row.description || '-', row.reference || '-', money(row.total)])}</section>
<div class="grid">
<section class="section"><h2>${t.sectionAudit}</h2><div class="health"><div class="chip"><span>${t.events}</span><b>${report.auditSummary?.totalEvents || 0}</b></div><div class="chip"><span>${t.voids}</span><b>${report.auditSummary?.voidCount || 0}</b></div><div class="chip"><span>${t.refunds}</span><b>${report.auditSummary?.refundCount || 0}</b></div><div class="chip"><span>${t.managerDiscounts}</span><b>${report.auditSummary?.discountCount || 0}</b></div></div></section>
<section class="section"><h2>${t.sectionHealth}</h2><div class="health"><div class="chip"><span>${t.fiscalPending}</span><b>${report.fiscalHealth?.pending || 0}</b></div><div class="chip"><span>${t.fiscalFailed}</span><b>${report.fiscalHealth?.failed || 0}</b></div><div class="chip"><span>${t.financeExceptions}</span><b>${report.financeHealth?.pendingExceptions || 0}</b></div><div class="chip"><span>${t.sideEffects}</span><b>${report.sideEffectHealth?.failedTotal || 0}</b></div></div></section>
</div>
</body></html>`;
    const puppeteer = await import('puppeteer');
    const browserExecutable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(candidate => fs.existsSync(candidate));
    const browser = await puppeteer.default.launch({ headless: true, executablePath: browserExecutable, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        if (thermal) await page.setViewport({ width: 302, height: 1200, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: 'networkidle0' });
        if (thermal) {
            const contentHeight = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
            return Buffer.from(await page.pdf({ width: '80mm', height: `${contentHeight + 24}px`, printBackground: true, preferCSSPageSize: false }));
        }
        return Buffer.from(await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true }));
    } finally {
        await browser.close();
    }
};

export const generateDayCloseXlsx = async (report: any, lang: 'ar' | 'en' = 'ar'): Promise<Buffer> => {
    const rtl = lang === 'ar';
    const t = rtl ? { summary: 'الملخص', sales: 'المبيعات', payments: 'الدفع', expenses: 'المصروفات', details: 'تفاصيل المصروفات', health: 'الصحة التشغيلية', metric: 'البند', value: 'القيمة' } : { summary: 'Summary', sales: 'Sales', payments: 'Payments', expenses: 'Expenses', details: 'Expense Details', health: 'Health', metric: 'Metric', value: 'Value' };
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Coduis Zen';
    const currency = report.currency || 'EGP';
    const money = (value: unknown) => safeNumber(value);
    const orderTypeRows = reportRows(report.orderTypeBreakdown, 'type');
    const paymentRows = reportRows(report.paymentBreakdown, 'method');
    const topExpenseRows = reportRows(report.financeSummary?.topExpenses, 'name');
    const expenseRows = reportRows(report.financeSummary?.expenseRows, 'name');
    const addSheet = (name: string, rows: any[][]) => {
        const ws = workbook.addWorksheet(name, { views: [{ rightToLeft: rtl }] });
        ws.addRows(rows);
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123C69' } };
        ws.columns.forEach(col => { col.width = 22; });
        return ws;
    };
    addSheet(t.summary, [
        [t.metric, t.value],
        [rtl ? 'الفرع' : 'Branch', report.branchName || report.branchId],
        [rtl ? 'تاريخ التشغيل' : 'Business Date', report.date],
        [rtl ? 'عدد الطلبات' : 'Orders', report.salesSummary?.totalOrders || 0],
        [rtl ? 'إجمالي الإيراد' : 'Gross Revenue', money(report.salesSummary?.totalRevenue)],
        [rtl ? 'صافي المبيعات' : 'Net Sales', money(report.salesSummary?.netSales)],
        [rtl ? 'المصروفات' : 'Expenses', money(report.financeSummary?.expenses)],
        [rtl ? 'صافي الربح' : 'Net Profit', money(report.financeSummary?.netProfit)],
        [rtl ? 'العملة' : 'Currency', currency],
    ]);
    addSheet(t.sales, [[rtl ? 'النوع' : 'Type', rtl ? 'العدد' : 'Count', rtl ? 'الإجمالي' : 'Total'], ...orderTypeRows.map((r: any) => [r.type, r.count, money(r.total)])]);
    addSheet(t.payments, [[rtl ? 'طريقة الدفع' : 'Method', rtl ? 'العدد' : 'Count', rtl ? 'الإجمالي' : 'Total'], ...paymentRows.map((r: any) => [r.method, r.count, money(r.total)])]);
    addSheet(t.expenses, [[rtl ? 'الحساب' : 'Account', rtl ? 'الإجمالي' : 'Total'], ...topExpenseRows.map((r: any) => [r.name, money(r.total)])]);
    addSheet(t.details, [[rtl ? 'التاريخ' : 'Date', rtl ? 'الحساب' : 'Account', rtl ? 'الوصف' : 'Description', rtl ? 'المرجع' : 'Reference', rtl ? 'القيمة' : 'Amount'], ...expenseRows.map((r: any) => [r.date ? new Date(r.date).toLocaleDateString(rtl ? 'ar-EG' : 'en-US') : '-', r.name, r.description || '-', r.reference || '-', money(r.total)])]);
    addSheet(t.health, [[t.metric, t.value], ['Fiscal Pending', report.fiscalHealth?.pending || 0], ['Fiscal Failed', report.fiscalHealth?.failed || 0], ['Finance Exceptions', report.financeHealth?.pendingExceptions || 0], ['Side Effect Errors', report.sideEffectHealth?.failedTotal || 0]]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const generatePayslipPDF = async (payslip: any): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const buffers: Buffer[] = [];

            doc.on('data', (chunk) => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', (err) => reject(err));

            const payload = payslip.payload || {};
            const fixedAllowances = Number(payload.fixedAllowances || payload.components?.fixedAllowances || 0);
            const fixedDeductions = Number(payload.fixedDeductions || payload.components?.fixedDeductions || 0);
            const attendanceDeductions = Number(payload.attendanceDeductions || payload.components?.attendanceDeductions || 0);

            doc.font('Helvetica-Bold').fontSize(22).fillColor('#0f172a').text('Payslip', { align: 'center' });
            doc.moveDown(0.4);
            doc.font('Helvetica').fontSize(10).fillColor('#64748b').text(`Payroll Cycle: ${payslip.cycleId}`, { align: 'center' });
            doc.moveDown(2);

            doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('Employee');
            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            doc.text(`Employee ID: ${payslip.employeeId}`);
            if (payload.employeeName) doc.text(`Name: ${payload.employeeName}`);
            if (payload.branchName) doc.text(`Branch: ${payload.branchName}`);
            doc.moveDown(1.5);

            doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('Earnings');
            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            doc.text(`Basic Salary: ${(payload.baseSalary || 0).toFixed(2)} EGP`);
            doc.text(`Fixed Allowances: ${fixedAllowances.toFixed(2)} EGP`);
            doc.text(`Overtime: ${(payload.overtime || 0).toFixed(2)} EGP`);
            doc.text(`Bonuses: ${(payload.bonuses || 0).toFixed(2)} EGP`);
            doc.text(`Other Earnings: ${(payload.earnings || 0).toFixed(2)} EGP`);
            doc.moveDown(1);

            doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('Deductions');
            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            doc.text(`Penalties: ${(payload.penalties || 0).toFixed(2)} EGP`);
            doc.text(`Loan Deductions: ${(payload.loanDeductions || 0).toFixed(2)} EGP`);
            doc.text(`Attendance Deductions: ${attendanceDeductions.toFixed(2)} EGP`);
            doc.text(`Fixed Deductions: ${fixedDeductions.toFixed(2)} EGP`);
            doc.text(`Other Deductions: ${(payload.otherDeductions || 0).toFixed(2)} EGP`);
            doc.moveDown(1);

            doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('Totals');
            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            doc.text(`Gross Pay: ${(payload.grossPay || 0).toFixed(2)} EGP`);
            doc.text(`Net Pay: ${(payload.netPay || 0).toFixed(2)} EGP`);
            doc.moveDown(2);

            doc.fontSize(8).fillColor('#94a3b8').text(
                `Generated: ${new Date().toLocaleString()}`, 
                50, doc.page.height - 50, { align: 'center' }
            );

            doc.end();
        } catch (e) {
            reject(e);
        }
    });
};

export const generateHrAttendancePDF = async (report: any, lang: 'ar' | 'en' = 'ar'): Promise<Buffer> => {
    const rows = Array.isArray(report.rows) ? report.rows : [];
    const rtl = lang === 'ar';
    const locale = rtl ? 'ar-EG' : 'en-US';
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
@page { size: A4 landscape; margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; background: #f5f7fb; color: #142033; direction: ${rtl ? 'rtl' : 'ltr'}; font-family: Tahoma, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.hero { background: linear-gradient(135deg,#10243e,#19324f); color: #fff; border-radius: 18px; padding: 16px 20px; margin-bottom: 12px; display:flex; align-items:center; justify-content:space-between; gap:18px; }
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
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
};
export const generatePayrollCompliancePDF = async (report: any): Promise<Buffer> => {
    const lang = String(report.lang || 'ar').toLowerCase() === 'en' ? 'en' : 'ar';
    const rtl = lang === 'ar';
    const locale = rtl ? 'ar-EG' : 'en-US';
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
@page { size:A4 landscape; margin:10mm; }
* { box-sizing:border-box; }
body { margin:0; background:#f5f7fb; color:#142033; direction:${rtl ? 'rtl' : 'ltr'}; font-family:Tahoma,Arial,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.hero { background:linear-gradient(135deg,#10243e,#19324f); color:#fff; border-radius:18px; padding:16px 20px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; gap:18px; }
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
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
};

