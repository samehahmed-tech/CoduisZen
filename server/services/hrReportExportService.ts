import fs from 'node:fs';
import path from 'node:path';
import type { Writable } from 'node:stream';
import ExcelJS from 'exceljs';

type Lang = 'ar' | 'en';

const logoPath = path.resolve(process.cwd(), 'public', 'logo.png');

const labels = {
    ar: {
        title: 'تقرير حضور الموظفين',
        period: 'الفترة',
        generatedAt: 'تاريخ الإنشاء',
        employees: 'الموظفون',
        records: 'الأيام',
        completed: 'مكتملة',
        open: 'مفتوحة',
        leave: 'إجازة',
        rest: 'راحة أسبوعية',
        absent: 'غياب',
        hours: 'إجمالي الساعات',
        employee: 'الموظف',
        code: 'الكود',
        branch: 'الفرع',
        day: 'اليوم',
        clockIn: 'الحضور',
        clockOut: 'الانصراف',
        late: 'تأخير',
        early: 'انصراف مبكر',
        overtime: 'إضافي',
        status: 'الحالة',
        summary: 'ملخص الموظف',
        noData: '-',
    },
    en: {
        title: 'Employee Attendance Report',
        period: 'Period',
        generatedAt: 'Generated at',
        employees: 'Employees',
        records: 'Days',
        completed: 'Completed',
        open: 'Open',
        leave: 'Leave',
        rest: 'Weekly Rest',
        absent: 'Absent',
        hours: 'Total Hours',
        employee: 'Employee',
        code: 'Code',
        branch: 'Branch',
        day: 'Day',
        clockIn: 'Clock in',
        clockOut: 'Clock out',
        late: 'Late',
        early: 'Early leave',
        overtime: 'Overtime',
        status: 'Status',
        summary: 'Employee Summary',
        noData: '-',
    },
} as const;

const statusLabel = (status: unknown, lang: Lang) => {
    const t = labels[lang];
    const value = String(status || '').toUpperCase();
    if (value === 'CLOSED' || value === 'COMPLETED') return t.completed;
    if (value === 'OPEN' || value === 'IN_PROGRESS') return t.open;
    if (value === 'LEAVE') return t.leave;
    if (value === 'REST_DAY') return t.rest;
    if (value === 'ABSENT' || value === 'NO_PUNCH') return t.absent;
    return value || t.noData;
};

const statusFill = (label: string, lang: Lang) => {
    const t = labels[lang];
    if (label === t.completed) return 'D1FAE5';
    if (label === t.open) return 'FEF3C7';
    if (label === t.leave) return 'DBEAFE';
    if (label === t.rest) return 'EDE9FE';
    if (label === t.absent) return 'FFE4E6';
    return 'F1F5F9';
};

const toDate = (value: unknown) => {
    if (!value) return null;
    const date = new Date(value as any);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value: unknown, lang: Lang) => {
    const date = toDate(value);
    if (!date) return labels[lang].noData;
    return date.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
};

const formatTime = (value: unknown, lang: Lang) => {
    const date = toDate(value);
    if (!date) return labels[lang].noData;
    return date.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
    });
};

const num = (value: unknown) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const generateHrAttendanceXlsx = async (report: any, lang: Lang = 'ar') => {
    const rows = Array.isArray(report.rows) ? report.rows : [];
    const t = labels[lang];
    const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Coduis Zen';
    workbook.created = new Date();
    workbook.views = [{ rightToLeft: lang === 'ar' } as any];

    const sheet = workbook.addWorksheet(lang === 'ar' ? 'الحضور' : 'Attendance', {
        views: [{ rightToLeft: lang === 'ar', state: 'frozen', ySplit: 10 }],
        properties: { defaultRowHeight: 22 },
    });

    sheet.mergeCells('A1:L3');
    sheet.mergeCells('A4:L4');
    sheet.getCell('A1').value = t.title;
    sheet.getCell('A1').font = { bold: true, size: 24, color: { argb: 'FFFFFFFF' } };
    sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: lang === 'ar' ? 'right' : 'left' };
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10243E' } };
    sheet.getCell('A4').value = `${t.period}: ${report.period?.startDate || 'all'} ${lang === 'ar' ? 'إلى' : 'to'} ${report.period?.endDate || 'all'}    |    ${t.generatedAt}: ${new Date().toLocaleString(locale)}`;
    sheet.getCell('A4').font = { bold: true, size: 11, color: { argb: 'FF64748B' } };
    sheet.getCell('A4').alignment = { horizontal: lang === 'ar' ? 'right' : 'left' };

    if (fs.existsSync(logoPath)) {
        const logo = workbook.addImage({ filename: logoPath, extension: 'png' });
        sheet.addImage(logo, { tl: { col: lang === 'ar' ? 10.5 : 0.2, row: 0.3 }, ext: { width: 74, height: 74 } });
    }

    const totalHours = rows.reduce((sum: number, row: any) => sum + num(row.totalHours), 0);
    const statusCounts = rows.reduce((acc: Record<string, number>, row: any) => {
        const label = statusLabel(row.status, lang);
        acc[label] = (acc[label] || 0) + 1;
        return acc;
    }, {});
    const groups = new Map<string, any[]>();
    rows.forEach((row: any) => {
        const key = String(row.employeeId || row.employeeCode || row.employeeName || 'unknown');
        const list = groups.get(key) || [];
        list.push(row);
        groups.set(key, list);
    });

    const kpis = [
        [t.employees, groups.size],
        [t.records, rows.length],
        [t.completed, statusCounts[t.completed] || 0],
        [t.open, statusCounts[t.open] || 0],
        [t.leave, statusCounts[t.leave] || 0],
        [t.absent, statusCounts[t.absent] || 0],
        [t.hours, Number(totalHours.toFixed(2))],
    ];

    kpis.forEach(([label, value], index) => {
        const col = index + 1;
        const cell = sheet.getCell(6, col);
        cell.value = label as string;
        cell.font = { bold: true, size: 10, color: { argb: 'FF64748B' } };
        cell.alignment = { horizontal: 'center' };
        const val = sheet.getCell(7, col);
        val.value = value as any;
        val.font = { bold: true, size: 16, color: { argb: 'FF10243E' } };
        val.alignment = { horizontal: 'center' };
        val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };
        val.border = { bottom: { style: 'thin', color: { argb: 'FFD8E4F2' } } };
    });

    const headerRow = sheet.getRow(9);
    headerRow.values = ['#', t.employee, t.code, t.branch, t.day, t.clockIn, t.clockOut, t.hours, t.late, t.early, t.overtime, t.status];
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF19324F' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
    });

    let rowPointer = 10;
    Array.from(groups.values()).forEach((employeeRows: any[], employeeIndex: number) => {
        const first = employeeRows[0] || {};
        const employeeHours = employeeRows.reduce((sum: number, row: any) => sum + num(row.totalHours), 0);
        const employeeCompleted = employeeRows.filter((row: any) => statusLabel(row.status, lang) === t.completed).length;

        const summaryRow = sheet.getRow(rowPointer);
        summaryRow.values = [
            employeeIndex + 1,
            first.employeeName || first.employeeId || '',
            first.employeeCode || first.employeeId || '',
            first.branchName || first.branchId || '',
            `${t.records}: ${employeeRows.length}`,
            `${t.completed}: ${employeeCompleted}`,
            '',
            Number(employeeHours.toFixed(2)),
            '',
            '',
            '',
            t.summary,
        ];
        summaryRow.height = 28;
        summaryRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true, size: 11, color: { argb: 'FF10243E' } };
            cell.alignment = {
                horizontal: colNumber >= 5 ? 'center' : lang === 'ar' ? 'right' : 'left',
                vertical: 'middle',
                wrapText: true,
            };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF6FF' } };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFD5E4F6' } },
                bottom: { style: 'thin', color: { argb: 'FFD5E4F6' } },
            };
        });
        summaryRow.getCell(12).font = { bold: true, size: 10, color: { argb: 'FF2563EB' } };
        rowPointer += 1;

        employeeRows
            .sort((a: any, b: any) => String(a.clockInAt || '').localeCompare(String(b.clockInAt || '')))
            .forEach((row: any) => {
                const label = statusLabel(row.status, lang);
                const technicalDay = ['ABSENT', 'LEAVE', 'REST_DAY'].includes(String(row.status || '').toUpperCase());
                const detailRow = sheet.getRow(rowPointer);
                detailRow.values = [
                    '',
                    '',
                    '',
                    '',
                    formatDate(row.clockInAt, lang),
                    technicalDay ? t.noData : formatTime(row.clockInAt, lang),
                    technicalDay ? t.noData : formatTime(row.clockOutAt, lang),
                    Number(num(row.totalHours).toFixed(2)),
                    num(row.lateMinutes),
                    num(row.earlyLeaveMinutes),
                    num(row.overtimeMinutes),
                    label,
                ];
                detailRow.height = 24;
                detailRow.eachCell((cell, colNumber) => {
                    cell.font = { size: 10, bold: colNumber === 12 };
                    cell.alignment = {
                        horizontal: colNumber >= 5 ? 'center' : lang === 'ar' ? 'right' : 'left',
                        vertical: 'middle',
                        wrapText: true,
                    };
                    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
                });
                detailRow.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${statusFill(label, lang)}` } };
                detailRow.getCell(12).font = { bold: true, size: 10, color: { argb: 'FF10243E' } };
                rowPointer += 1;
            });

        rowPointer += 1;
    });

    sheet.columns = [
        { width: 7 },
        { width: 30 },
        { width: 16 },
        { width: 18 },
        { width: 15 },
        { width: 14 },
        { width: 14 },
        { width: 12 },
        { width: 11 },
        { width: 14 },
        { width: 12 },
        { width: 18 },
    ];
    sheet.autoFilter = 'A9:L9';

    return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const streamHrAttendanceXlsx = async (
    report: any,
    output: Writable,
    lang: Lang = 'ar',
) => {
    const rows = Array.isArray(report.rows) ? report.rows : [];
    const t = labels[lang];
    const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: output,
        useStyles: true,
        useSharedStrings: false,
    });
    workbook.creator = 'Coduis Zen';
    workbook.created = new Date();
    workbook.views = [{ rightToLeft: lang === 'ar' } as any];

    const sheet = workbook.addWorksheet(lang === 'ar' ? 'الحضور' : 'Attendance', {
        views: [{ rightToLeft: lang === 'ar', state: 'frozen', ySplit: 10 }],
        properties: { defaultRowHeight: 22 },
    });

    sheet.columns = [
        { width: 7 },
        { width: 30 },
        { width: 16 },
        { width: 18 },
        { width: 15 },
        { width: 14 },
        { width: 14 },
        { width: 12 },
        { width: 11 },
        { width: 14 },
        { width: 12 },
        { width: 18 },
    ];

    sheet.mergeCells('A1:L3');
    sheet.mergeCells('A4:L4');
    sheet.getCell('A1').value = t.title;
    sheet.getCell('A1').font = { bold: true, size: 24, color: { argb: 'FFFFFFFF' } };
    sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: lang === 'ar' ? 'right' : 'left' };
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10243E' } };
    sheet.getCell('A4').value = `${t.period}: ${report.period?.startDate || 'all'} ${lang === 'ar' ? 'إلى' : 'to'} ${report.period?.endDate || 'all'}    |    ${t.generatedAt}: ${new Date().toLocaleString(locale)}`;
    sheet.getCell('A4').font = { bold: true, size: 11, color: { argb: 'FF64748B' } };
    sheet.getCell('A4').alignment = { horizontal: lang === 'ar' ? 'right' : 'left' };

    const totalHours = rows.reduce((sum: number, row: any) => sum + num(row.totalHours), 0);
    const statusCounts = rows.reduce((acc: Record<string, number>, row: any) => {
        const label = statusLabel(row.status, lang);
        acc[label] = (acc[label] || 0) + 1;
        return acc;
    }, {});
    const groups = new Map<string, any[]>();
    rows.forEach((row: any) => {
        const key = String(row.employeeId || row.employeeCode || row.employeeName || 'unknown');
        const list = groups.get(key) || [];
        list.push(row);
        groups.set(key, list);
    });

    const kpis = [
        [t.employees, groups.size],
        [t.records, rows.length],
        [t.completed, statusCounts[t.completed] || 0],
        [t.open, statusCounts[t.open] || 0],
        [t.leave, statusCounts[t.leave] || 0],
        [t.absent, statusCounts[t.absent] || 0],
        [t.hours, Number(totalHours.toFixed(2))],
    ];

    kpis.forEach(([label, value], index) => {
        const col = index + 1;
        const cell = sheet.getCell(6, col);
        cell.value = label as string;
        cell.font = { bold: true, size: 10, color: { argb: 'FF64748B' } };
        cell.alignment = { horizontal: 'center' };
        const val = sheet.getCell(7, col);
        val.value = value as any;
        val.font = { bold: true, size: 16, color: { argb: 'FF10243E' } };
        val.alignment = { horizontal: 'center' };
        val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };
        val.border = { bottom: { style: 'thin', color: { argb: 'FFD8E4F2' } } };
    });

    const headerRow = sheet.getRow(9);
    headerRow.values = ['#', t.employee, t.code, t.branch, t.day, t.clockIn, t.clockOut, t.hours, t.late, t.early, t.overtime, t.status];
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF19324F' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
    });
    headerRow.commit();

    let rowPointer = 10;
    Array.from(groups.values()).forEach((employeeRows: any[], employeeIndex: number) => {
        const first = employeeRows[0] || {};
        const employeeHours = employeeRows.reduce((sum: number, row: any) => sum + num(row.totalHours), 0);
        const employeeCompleted = employeeRows.filter((row: any) => statusLabel(row.status, lang) === t.completed).length;

        const summaryRow = sheet.addRow([
            employeeIndex + 1,
            first.employeeName || first.employeeId || '',
            first.employeeCode || first.employeeId || '',
            first.branchName || first.branchId || '',
            `${t.records}: ${employeeRows.length}`,
            `${t.completed}: ${employeeCompleted}`,
            '',
            Number(employeeHours.toFixed(2)),
            '',
            '',
            '',
            t.summary,
        ]);
        summaryRow.height = 28;
        summaryRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true, size: 11, color: { argb: 'FF10243E' } };
            cell.alignment = {
                horizontal: colNumber >= 5 ? 'center' : lang === 'ar' ? 'right' : 'left',
                vertical: 'middle',
                wrapText: true,
            };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF6FF' } };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFD5E4F6' } },
                bottom: { style: 'thin', color: { argb: 'FFD5E4F6' } },
            };
        });
        summaryRow.getCell(12).font = { bold: true, size: 10, color: { argb: 'FF2563EB' } };
        summaryRow.commit();
        rowPointer += 1;

        employeeRows
            .sort((a: any, b: any) => String(a.clockInAt || '').localeCompare(String(b.clockInAt || '')))
            .forEach((row: any) => {
                const label = statusLabel(row.status, lang);
                const technicalDay = ['ABSENT', 'LEAVE', 'REST_DAY'].includes(String(row.status || '').toUpperCase());
                const detailRow = sheet.addRow([
                    '',
                    '',
                    '',
                    '',
                    formatDate(row.clockInAt, lang),
                    technicalDay ? t.noData : formatTime(row.clockInAt, lang),
                    technicalDay ? t.noData : formatTime(row.clockOutAt, lang),
                    Number(num(row.totalHours).toFixed(2)),
                    num(row.lateMinutes),
                    num(row.earlyLeaveMinutes),
                    num(row.overtimeMinutes),
                    label,
                ]);
                detailRow.height = 24;
                detailRow.eachCell((cell, colNumber) => {
                    cell.font = { size: 10, bold: colNumber === 12 };
                    cell.alignment = {
                        horizontal: colNumber >= 5 ? 'center' : lang === 'ar' ? 'right' : 'left',
                        vertical: 'middle',
                        wrapText: true,
                    };
                    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
                });
                detailRow.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${statusFill(label, lang)}` } };
                detailRow.getCell(12).font = { bold: true, size: 10, color: { argb: 'FF10243E' } };
                detailRow.commit();
                rowPointer += 1;
            });

        sheet.addRow([]).commit();
        rowPointer += 1;
    });

    sheet.autoFilter = 'A9:L9';
    await workbook.commit();
};

export const generateHrTabularXlsx = async (input: {
    title: string;
    subtitle?: string;
    rows: Array<Record<string, any>>;
    totals?: Record<string, any>;
    sheetName?: string;
    lang?: Lang;
}) => {
    const lang = input.lang || 'ar';
    const rtl = lang === 'ar';
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Coduis Zen';
    workbook.created = new Date();
    workbook.views = [{ rightToLeft: rtl } as any];

    const sheet = workbook.addWorksheet(input.sheetName || (rtl ? 'التقرير' : 'Report'), {
        views: [{ rightToLeft: rtl, state: 'frozen', ySplit: 8 }],
        properties: { defaultRowHeight: 22 },
    });

    const rows = input.rows || [];
    const headers = Object.keys(rows[0] || {});
    const lastCol = Math.max(headers.length, 8);
    sheet.mergeCells(1, 1, 3, lastCol);
    sheet.mergeCells(4, 1, 4, lastCol);
    sheet.getCell(1, 1).value = input.title;
    sheet.getCell(1, 1).font = { bold: true, size: 23, color: { argb: 'FFFFFFFF' } };
    sheet.getCell(1, 1).alignment = { vertical: 'middle', horizontal: rtl ? 'right' : 'left' };
    sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10243E' } };
    sheet.getCell(4, 1).value = input.subtitle || new Date().toLocaleString(rtl ? 'ar-EG' : 'en-US');
    sheet.getCell(4, 1).font = { bold: true, size: 11, color: { argb: 'FF64748B' } };
    sheet.getCell(4, 1).alignment = { horizontal: rtl ? 'right' : 'left' };

    if (fs.existsSync(logoPath)) {
        const logo = workbook.addImage({ filename: logoPath, extension: 'png' });
        sheet.addImage(logo, { tl: { col: rtl ? Math.max(0, lastCol - 1.4) : 0.2, row: 0.3 }, ext: { width: 74, height: 74 } });
    }

    const totals = Object.entries(input.totals || {}).slice(0, Math.min(lastCol, 8));
    totals.forEach(([label, value], index) => {
        const col = index + 1;
        sheet.getCell(6, col).value = label;
        sheet.getCell(6, col).font = { bold: true, size: 10, color: { argb: 'FF64748B' } };
        sheet.getCell(6, col).alignment = { horizontal: 'center' };
        sheet.getCell(7, col).value = value as any;
        sheet.getCell(7, col).font = { bold: true, size: 15, color: { argb: 'FF10243E' } };
        sheet.getCell(7, col).alignment = { horizontal: 'center' };
        sheet.getCell(7, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };
    });

    const headerRow = sheet.getRow(9);
    headerRow.values = headers;
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF19324F' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
    });

    rows.forEach((row) => {
        const sheetRow = sheet.addRow(headers.map(header => row[header]));
        sheetRow.eachCell((cell, colNumber) => {
            const value = cell.value;
            const isNegative = typeof value === 'number' && value < 0;
            cell.font = {
                size: 10,
                bold: colNumber <= 2,
                color: { argb: isNegative ? 'FFBE123C' : 'FF142033' },
            };
            cell.alignment = {
                horizontal: typeof value === 'number' ? 'center' : rtl ? 'right' : 'left',
                vertical: 'middle',
                wrapText: true,
            };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
        });
    });

    headers.forEach((header, index) => {
        const maxLength = Math.max(
            String(header).length,
            ...rows.slice(0, 200).map(row => String(row[header] ?? '').length),
        );
        sheet.getColumn(index + 1).width = Math.min(Math.max(maxLength + 4, 12), 34);
    });
    if (headers.length) {
        sheet.autoFilter = { from: { row: 9, column: 1 }, to: { row: 9, column: headers.length } };
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
};
