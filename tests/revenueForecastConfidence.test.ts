import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('revenue forecast confidence contract', () => {
    it('does not use a static confidence score and exposes provenance metadata', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/services/revenueForecastService.ts'), 'utf8');
        expect(source).toContain("confidenceMethod: 'R_SQUARED_WITH_COVERAGE_CAP'");
        expect(source).toContain('dataFreshnessHours');
        expect(source).toContain("source: 'ORDERS_TOTAL_30_DAY_LINEAR_REGRESSION'");
        expect(source).toContain('confidence: calculateRegressionConfidence(historical)');
        expect(source).not.toContain('confidence: 0.85');
    });
});
