import { describe, expect, it } from 'vitest';
import { getExportReportType, isTabularExportSupported } from '../components/reports/reportConstants';

describe('report tabular export support', () => {
    it('marks server-backed CSV/Excel exports only', () => {
        expect(getExportReportType('Daily Sales')).toBe('DAILY_SALES');
        expect(isTabularExportSupported('Daily Sales')).toBe(true);
        expect(isTabularExportSupported('Payroll Summary')).toBe(true);
        expect(isTabularExportSupported('Demand Forecasting')).toBe(false);
    });
});
