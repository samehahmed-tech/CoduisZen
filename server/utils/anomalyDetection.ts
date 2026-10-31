export type AnomalySeverity = 'HIGH' | 'MEDIUM';

export interface AnomalyMetricInput {
    key: string;
    label: string;
    date: string;
    value: number;
    baseline: number[];
    source: string;
}

export interface DetectedAnomaly {
    key: string;
    label: string;
    date: string;
    value: number;
    baselineAverage: number;
    zScore: number;
    severity: AnomalySeverity;
    explanation: string;
    source: string;
}

/** Detects only statistically unusual latest observations; it never mutates data. */
export function detectLatestAnomaly(input: AnomalyMetricInput): DetectedAnomaly | null {
    const baseline = input.baseline.filter(value => Number.isFinite(value));
    if (!baseline.length || !Number.isFinite(input.value)) return null;
    const average = baseline.reduce((sum, value) => sum + value, 0) / baseline.length;
    const variance = baseline.reduce((sum, value) => sum + ((value - average) ** 2), 0) / baseline.length;
    const standardDeviation = Math.sqrt(variance);
    const delta = input.value - average;
    const zScore = standardDeviation > 0 ? delta / standardDeviation : (delta > 0 ? 3 : 0);
    if (zScore < 2) return null;

    return {
        key: input.key,
        label: input.label,
        date: input.date,
        value: Math.round(input.value * 100) / 100,
        baselineAverage: Math.round(average * 100) / 100,
        zScore: Math.round(zScore * 100) / 100,
        severity: zScore >= 3 ? 'HIGH' : 'MEDIUM',
        explanation: `${input.label} is ${Math.round(zScore * 100) / 100} standard deviations above its recent baseline.`,
        source: input.source,
    };
}
