export type LaborForecastPoint = {
    date: string;
    revenue: number;
    laborHours: number;
};

export type RevenueForecastPoint = { date: string; revenue: number };

export type LaborForecastResult = {
    historical: LaborForecastPoint[];
    forecast: Array<RevenueForecastPoint & {
        requiredLaborHours: number;
        requiredHeadcount: number;
    }>;
    salesPerLaborHour: number;
    confidence: number;
    confidenceMethod: 'COVERAGE_AND_RATIO_STABILITY';
    dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
    source: 'ORDERS_TOTAL_AND_ATTENDANCE_SESSION_HOURS';
    assumptions: {
        standardShiftHours: number;
        calculation: 'FORECAST_REVENUE_DIVIDED_BY_HISTORICAL_SALES_PER_LABOR_HOUR';
    };
};

const round = (value: number, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function calculateLaborForecast(
    historical: LaborForecastPoint[],
    forecastRevenue: RevenueForecastPoint[],
    standardShiftHours = 8,
): LaborForecastResult {
    const validHistory = historical
        .map(point => ({ ...point, revenue: Number(point.revenue || 0), laborHours: Number(point.laborHours || 0) }))
        .filter(point => point.revenue >= 0 && point.laborHours >= 0);
    const ratioDays = validHistory.filter(point => point.revenue > 0 && point.laborHours > 0);
    const totalRevenue = ratioDays.reduce((sum, point) => sum + point.revenue, 0);
    const totalHours = ratioDays.reduce((sum, point) => sum + point.laborHours, 0);
    const salesPerLaborHour = totalHours > 0 ? totalRevenue / totalHours : 0;

    const dailyRatios = ratioDays
        .map(point => point.revenue / point.laborHours)
        .filter(value => Number.isFinite(value) && value > 0);
    const averageRatio = dailyRatios.length
        ? dailyRatios.reduce((sum, value) => sum + value, 0) / dailyRatios.length
        : 0;
    const variance = dailyRatios.length
        ? dailyRatios.reduce((sum, value) => sum + ((value - averageRatio) ** 2), 0) / dailyRatios.length
        : 0;
    const coefficientOfVariation = averageRatio > 0 ? Math.sqrt(variance) / averageRatio : 1;
    const coverage = clamp(ratioDays.length / 14, 0, 1);
    const stability = clamp(1 - coefficientOfVariation, 0, 1);
    const confidence = round(coverage * stability, 2);
    const dataQuality: LaborForecastResult['dataQuality'] = ratioDays.length < 5
        ? 'INSUFFICIENT'
        : confidence >= 0.75 ? 'HIGH' : confidence >= 0.45 ? 'MEDIUM' : 'LOW';

    const forecast = salesPerLaborHour > 0
        ? forecastRevenue.map(point => ({
            ...point,
            revenue: round(Number(point.revenue || 0)),
            requiredLaborHours: round(Number(point.revenue || 0) / salesPerLaborHour),
            requiredHeadcount: Math.ceil((Number(point.revenue || 0) / salesPerLaborHour) / standardShiftHours),
        }))
        : [];

    return {
        historical: validHistory.map(point => ({ ...point, revenue: round(point.revenue), laborHours: round(point.laborHours) })),
        forecast,
        salesPerLaborHour: round(salesPerLaborHour),
        confidence,
        confidenceMethod: 'COVERAGE_AND_RATIO_STABILITY',
        dataQuality,
        source: 'ORDERS_TOTAL_AND_ATTENDANCE_SESSION_HOURS',
        assumptions: {
            standardShiftHours,
            calculation: 'FORECAST_REVENUE_DIVIDED_BY_HISTORICAL_SALES_PER_LABOR_HOUR',
        },
    };
}
