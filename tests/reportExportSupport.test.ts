import { describe, expect, it } from 'vitest';
import { extractRenderedReportRows } from '../components/Reports';
import { getExportReportType, isTabularExportSupported } from '../components/reports/reportConstants';

describe('report tabular export support', () => {
    it('marks server-backed CSV/Excel exports only', () => {
        expect(getExportReportType('Daily Sales')).toBe('DAILY_SALES');
        expect(isTabularExportSupported('Daily Sales')).toBe(true);
        expect(isTabularExportSupported('Payroll Summary')).toBe(true);
        expect(isTabularExportSupported('Demand Forecasting')).toBe(false);
    });

    it('turns a rendered non-tabular report into Excel rows', () => {
        const node = {
            querySelectorAll: () => [],
            innerText: 'Demand Forecasting\nExpected orders\n128',
        } as unknown as HTMLElement;

        expect(extractRenderedReportRows(node, 'Report data').tableRows).toEqual([
            ['Report data'],
            ['Demand Forecasting'],
            ['Expected orders'],
            ['128'],
        ]);
    });
});
