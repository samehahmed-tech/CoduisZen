import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Excel compatibility lazy-load contract', () => {
    it('loads ExcelJS only from explicit read/write operations', () => {
        const source = fs.readFileSync('src/utils/excelCompat.ts', 'utf8');
        expect(source).not.toContain("import ExcelJS from 'exceljs'");
        expect(source).toContain("import('exceljs')");
        expect(source).toContain('const ExcelJS = await loadExcelJs();');
        expect(source).toContain('let excelJsPromise');
    });
});
