import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('consolidated report UI contract', () => {
    it('loads the protected consolidated endpoint with the applied business-date range', () => {
        const page = fs.readFileSync('components/reports/views/ConsolidatedReport.tsx', 'utf8');
        const reports = fs.readFileSync('components/Reports.tsx', 'utf8');
        expect(page).toContain("/analytics/consolidated?");
        expect(page).toContain('businessDateFrom');
        expect(page).toContain('businessDateTo');
        expect(page).toContain('Source: orders by business date');
        expect(reports).toContain('<ConsolidatedReport start={appliedRange.start} end={appliedRange.end}');
    });
});
