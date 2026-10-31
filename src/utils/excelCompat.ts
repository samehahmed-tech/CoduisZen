import type ExcelJS from 'exceljs';

let excelJsPromise: Promise<typeof ExcelJS> | undefined;

// ExcelJS is ~900KB and only needed after an explicit import/export action.
// Keep menu/inventory route activation free of spreadsheet parsing code.
const loadExcelJs = async (): Promise<typeof ExcelJS> => {
    excelJsPromise ??= import('exceljs').then((module) => module.default);
    return excelJsPromise;
};

type CompatSheet = {
    rows: unknown[] | unknown[][];
    mode: 'json' | 'aoa';
    '!cols'?: Array<{ wch?: number }>;
};

type CompatBook = {
    sheets: Record<string, CompatSheet>;
    SheetNames: string[];
};

const toRows = (sheet: CompatSheet): Record<string, unknown>[] => {
    if (sheet.mode === 'json') return sheet.rows as Record<string, unknown>[];
    const matrix = sheet.rows as unknown[][];
    const headers = (matrix[0] || []).map((value) => String(value ?? ''));
    return matrix.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
};

const addSheet = (workbook: ExcelJS.Workbook, name: string, sheet: CompatSheet) => {
    const worksheet = workbook.addWorksheet(name);
    if (sheet.mode === 'json') {
        const rows = sheet.rows as Record<string, unknown>[];
        const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
        worksheet.columns = keys.map((key) => ({ header: key, key, width: 18 }));
        if (rows.length) worksheet.addRows(rows);
    } else {
        worksheet.addRows(sheet.rows as unknown[][]);
    }
    if (sheet['!cols']) {
        sheet['!cols'].forEach((column, index) => {
            if (column?.wch) worksheet.getColumn(index + 1).width = column.wch;
        });
    }
};

const download = async (workbook: ExcelJS.Workbook, filename: string) => {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

export const getXlsxCompat = async () => ({
    utils: {
        book_new: (): CompatBook => ({ sheets: {}, SheetNames: [] }),
        aoa_to_sheet: (rows: unknown[][]): CompatSheet => ({ rows, mode: 'aoa' }),
        json_to_sheet: (rows: Record<string, unknown>[]): CompatSheet => ({ rows, mode: 'json' }),
        book_append_sheet: (book: CompatBook, sheet: CompatSheet, name: string) => {
            book.sheets[name] = sheet;
            if (!book.SheetNames.includes(name)) book.SheetNames.push(name);
        },
        sheet_to_json: <T = Record<string, unknown>>(sheet: CompatSheet, _options?: unknown): T[] => toRows(sheet) as T[],
    },
    read: async (data: ArrayBuffer) => {
        const ExcelJS = await loadExcelJs();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(data);
        const book: CompatBook = { sheets: {}, SheetNames: [] };
        workbook.eachSheet((worksheet) => {
            const rows: unknown[][] = [];
            worksheet.eachRow({ includeEmpty: false }, (row) => {
                rows.push((row.values as unknown[]).slice(1));
            });
            book.SheetNames.push(worksheet.name);
            book.sheets[worksheet.name] = { rows, mode: 'aoa' };
        });
        return {
            SheetNames: book.SheetNames,
            Sheets: book.sheets,
        };
    },
    writeFile: async (book: CompatBook, filename: string) => {
        const ExcelJS = await loadExcelJs();
        const workbook = new ExcelJS.Workbook();
        book.SheetNames.forEach((name) => addSheet(workbook, name, book.sheets[name]));
        await download(workbook, filename);
    },
});
