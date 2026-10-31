export interface ForecastAccuracy {
    method: 'WALK_FORWARD_LINEAR_REGRESSION_MAPE';
    holdoutDays: number;
    mapePercent: number | null;
}

function linearPredict(values: number[], x: number): number {
    const n = values.length;
    if (n < 2) return values[0] || 0;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    values.forEach((value, index) => {
        sumX += index;
        sumY += value;
        sumXY += index * value;
        sumX2 += index * index;
    });
    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return values[n - 1] || 0;
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    return Math.max(0, slope * x + intercept);
}

/** Measures out-of-sample error without using future observations in training. */
export function calculateWalkForwardMape(values: number[], requestedHoldoutDays = 7): ForecastAccuracy {
    const holdoutDays = Math.min(requestedHoldoutDays, Math.max(0, values.length - 5));
    if (holdoutDays < 1) return { method: 'WALK_FORWARD_LINEAR_REGRESSION_MAPE', holdoutDays: 0, mapePercent: null };

    const split = values.length - holdoutDays;
    const training = values.slice(0, split);
    const errors = values.slice(split).flatMap((actual, offset) => {
        if (!Number.isFinite(actual) || actual <= 0) return [];
        const predicted = linearPredict(training, training.length + offset);
        return [Math.abs((actual - predicted) / actual)];
    });
    return {
        method: 'WALK_FORWARD_LINEAR_REGRESSION_MAPE',
        holdoutDays,
        mapePercent: errors.length ? Math.round((errors.reduce((sum, error) => sum + error, 0) / errors.length) * 10000) / 100 : null,
    };
}
