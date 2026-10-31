import { describe, expect, it } from 'vitest';
import { getMetricDefinition, METRIC_CATALOG } from '../server/services/metricCatalog';

describe('semantic metric catalog', () => {
    it('defines a source, canonical formula, filters and drill-down for every KPI', () => {
        expect(METRIC_CATALOG.length).toBeGreaterThanOrEqual(6);
        for (const metric of METRIC_CATALOG) {
            expect(metric.source.length).toBeGreaterThan(0);
            expect(metric.formula.length).toBeGreaterThan(10);
            expect(metric.filters).toContain('branchId');
            expect(metric.drillDownPath).toMatch(/^\//);
        }
    });

    it('resolves canonical metrics by key', () => {
        expect(getMetricDefinition('avg_ticket')).toMatchObject({ key: 'avg_ticket', source: expect.arrayContaining(['orders.total']) });
        expect(getMetricDefinition('unknown')).toBeUndefined();
    });
});
