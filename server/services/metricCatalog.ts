export type MetricDefinition = {
    key: string;
    label: string;
    formula: string;
    source: string[];
    filters: Array<'branchId' | 'businessDateFrom' | 'businessDateTo'>;
    drillDownPath: string;
};

/** Canonical definitions shared by reports, dashboards and grounded AI. */
export const METRIC_CATALOG: readonly MetricDefinition[] = [
    { key: 'revenue', label: 'Revenue', formula: 'SUM(orders.total) excluding CANCELLED orders', source: ['orders.total', 'orders.status'], filters: ['branchId', 'businessDateFrom', 'businessDateTo'], drillDownPath: '/reports/orders' },
    { key: 'order_count', label: 'Order count', formula: 'COUNT(orders.id) excluding CANCELLED orders', source: ['orders.id', 'orders.status'], filters: ['branchId', 'businessDateFrom', 'businessDateTo'], drillDownPath: '/reports/orders' },
    { key: 'avg_ticket', label: 'Average ticket', formula: 'revenue / order_count; zero when order_count is zero', source: ['orders.total', 'orders.id', 'orders.status'], filters: ['branchId', 'businessDateFrom', 'businessDateTo'], drillDownPath: '/reports/orders' },
    { key: 'discounts', label: 'Discounts', formula: 'SUM(orders.discount)', source: ['orders.discount'], filters: ['branchId', 'businessDateFrom', 'businessDateTo'], drillDownPath: '/reports/discounts' },
    { key: 'refunds', label: 'Processed refunds', formula: 'SUM(refund_records.amount) where status = PROCESSED', source: ['refund_records.amount', 'refund_records.status'], filters: ['branchId', 'businessDateFrom', 'businessDateTo'], drillDownPath: '/reports/refunds' },
    { key: 'cash_variance', label: 'Cash variance', formula: 'SUM(ABS(day_close_reports.variance))', source: ['day_close_reports.variance'], filters: ['branchId', 'businessDateFrom', 'businessDateTo'], drillDownPath: '/finance/day-close' },
];

export function getMetricDefinition(key: string): MetricDefinition | undefined {
    return METRIC_CATALOG.find(metric => metric.key === key);
}
