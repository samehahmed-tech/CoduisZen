import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPORT_CATEGORIES, getExportReportType } from '../components/reports/reportConstants';

const root = process.cwd();
const loaderSource = readFileSync(resolve(root, 'components/reports/useReportsState.ts'), 'utf8');
const routeSource = readFileSync(resolve(root, 'server/routes/reportRoutes.ts'), 'utf8');
const apiSource = readFileSync(resolve(root, 'services/api/reports.ts'), 'utf8');
const viewSourceByCategory = new Map([
  ['SALES', readFileSync(resolve(root, 'components/reports/views/SalesReports.tsx'), 'utf8')],
  ['FINANCE', readFileSync(resolve(root, 'components/reports/views/FinanceReports.tsx'), 'utf8')],
  ['INVENTORY', readFileSync(resolve(root, 'components/reports/views/InventoryReports.tsx'), 'utf8')],
  ['HR', readFileSync(resolve(root, 'components/reports/views/HrReports.tsx'), 'utf8')],
  ['CRM', readFileSync(resolve(root, 'components/reports/views/CrmReports.tsx'), 'utf8')],
  ['OPS', readFileSync(resolve(root, 'components/reports/views/OpsReports.tsx'), 'utf8')],
  ['AI', readFileSync(resolve(root, 'components/reports/views/AiReports.tsx'), 'utf8')],
]);

describe('report catalog completion coverage', () => {
  it('gives every catalog report a loader, a rendered view, and an export identity', () => {
    const reports = REPORT_CATEGORIES.flatMap(category =>
      category.subReports.map(report => ({ categoryId: category.id, report })),
    );
    expect(reports.length).toBeGreaterThan(80);

    for (const { categoryId, report } of reports) {
      expect(loaderSource, `missing loader: ${report}`).toContain(`case '${report}'`);
      expect(viewSourceByCategory.get(categoryId), `missing view: ${report}`).toContain(report);
      expect(getExportReportType(report), `missing export identity: ${report}`).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it('keeps every report API path matched to a server route', () => {
    const routePaths = [...routeSource.matchAll(/router\.get\('([^']+)'/g)].map(match => match[1]);
    const apiPaths = [...apiSource.matchAll(/`?\/reports(\/[a-z0-9/-]+)/g)].map(match => match[1]);

    expect(routePaths.length).toBeGreaterThan(70);
    expect(new Set(routePaths).size).toBe(routePaths.length);

    for (const routePath of routePaths) {
      expect(apiPaths, `missing client API: ${routePath}`).toContain(routePath);
    }
    for (const apiPath of new Set(apiPaths)) {
      expect(routePaths, `missing server route: ${apiPath}`).toContain(apiPath);
    }
  });
});
