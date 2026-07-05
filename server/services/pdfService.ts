// @ts-ignore
import PDFDocument from 'pdfkit';
import fs from 'node:fs';

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

// Use same type as in dayCloseService
export const generateDayClosePDF = async (report: any): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const buffers: Buffer[] = [];

            doc.on('data', (chunk) => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', (err) => reject(err));

            // Setup Fonts & Header
            doc.font('Helvetica-Bold').fontSize(24).fillColor('#2563eb').text('Coduis Zen', { align: 'center' });
            doc.moveDown(0.2);
            doc.font('Helvetica').fontSize(12).fillColor('#64748b').text('End of Day Report', { align: 'center' });
            doc.moveDown(2);

            // Report Meta Info
            doc.font('Helvetica-Bold').fillColor('#0f172a').fontSize(14).text('General Information');
            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            doc.moveDown(0.5);
            doc.text(`Branch Name: ${report.branchName || report.branchId}`);
            doc.text(`Date: ${report.date}`);
            doc.text(`Closed At: ${report.closedAt ? new Date(report.closedAt).toLocaleString() : new Date().toLocaleString()}`);
            if (report.closedBy) {
                doc.text(`Closed By (User ID): ${report.closedBy}`);
            }
            doc.moveDown(2);

            // Sales Summary
            doc.font('Helvetica-Bold').fillColor('#0f172a').fontSize(14).text('Sales Summary');
            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            doc.moveDown(0.5);
            doc.text(`Total Orders: ${report.salesSummary?.totalOrders || 0}`);
            doc.text(`Gross Revenue: ${(report.salesSummary?.totalRevenue || 0).toFixed(2)} EGP`);
            doc.text(`Total Tax: ${(report.salesSummary?.totalTax || 0).toFixed(2)} EGP`);
            doc.text(`Total Discount: ${(report.salesSummary?.totalDiscount || 0).toFixed(2)} EGP`);
            doc.font('Helvetica-Bold').text(`Net Sales: ${(report.salesSummary?.netSales || 0).toFixed(2)} EGP`);
            doc.font('Helvetica').text(`Average Order Value: ${(report.salesSummary?.averageOrderValue || 0).toFixed(2)} EGP`);
            doc.moveDown(2);

            // Payment Breakdown
            if (report.paymentBreakdown && report.paymentBreakdown.length > 0) {
                doc.font('Helvetica-Bold').fillColor('#0f172a').fontSize(14).text('Payment Operations');
                doc.font('Helvetica').fontSize(10).fillColor('#334155');
                doc.moveDown(0.5);
                report.paymentBreakdown.forEach((p: any) => {
                    doc.text(`- ${p.method}: ${p.count} transactions, Total: ${p.total.toFixed(2)} EGP`);
                });
                doc.moveDown(1.5);
            }

            // Audit & Voids
            if (report.auditSummary) {
                doc.font('Helvetica-Bold').fillColor('#0f172a').fontSize(14).text('Audit & Integrity Summary');
                doc.font('Helvetica').fontSize(10).fillColor('#334155');
                doc.moveDown(0.5);
                doc.text(`Total Security Events: ${report.auditSummary.totalEvents || 0}`);
                doc.text(`Voided Operations: ${report.auditSummary.voidCount || 0}`);
                doc.text(`Refunds: ${report.auditSummary.refundCount || 0}`);
                doc.text(`Manager Discounts: ${report.auditSummary.discountCount || 0}`);
                doc.moveDown(1.5);
            }

            // Fiscal Sync Snapshot
            if (report.fiscalHealth) {
                doc.font('Helvetica-Bold').fillColor('#0f172a').fontSize(14).text('Fiscal Database Sync');
                doc.font('Helvetica').fontSize(10).fillColor('#334155');
                doc.moveDown(0.5);
                doc.text(`Submitted Invoices: ${report.fiscalHealth.submitted || 0}`);
                doc.text(`Pending Dispatch: ${report.fiscalHealth.pending || 0}`);
                doc.text(`Failed Dispatch: ${report.fiscalHealth.failed || 0}`);
                doc.text(`Dead Letters: ${report.fiscalHealth.deadLettersPending || 0}`);
                doc.moveDown(1.5);
            }

            // Footer
            const pageHeight = doc.page.height;
            doc.fontSize(8).fillColor('#94a3b8').text(
                'Automatically generated by Coduis Zen. Do not reply to this email.', 
                50, pageHeight - 50, { align: 'center' }
            );

            doc.end();
        } catch (e) {
            reject(e);
        }
    });
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

