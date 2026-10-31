export const RETENTION_POLICY_KEY = 'ops.data.retention';

export const RETENTION_FIELDS = [
    'auditLogsDays',
    'ordersDays',
    'customerDataDays',
    'webhookDeliveriesDays',
    'telemetryDays',
] as const;

export type RetentionPolicy = {
    auditLogsDays: number;
    ordersDays: number;
    customerDataDays: number;
    webhookDeliveriesDays: number;
    telemetryDays: number;
    executionMode: 'DRY_RUN' | 'MANUAL_APPROVAL';
};

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
    auditLogsDays: 2555,
    ordersDays: 3650,
    customerDataDays: 1095,
    webhookDeliveriesDays: 90,
    telemetryDays: 180,
    executionMode: 'DRY_RUN',
};

export const normalizeRetentionPolicy = (input: unknown): RetentionPolicy => {
    const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    const result = { ...DEFAULT_RETENTION_POLICY };
    for (const field of RETENTION_FIELDS) {
        if (source[field] === undefined) continue;
        const value = Number(source[field]);
        if (!Number.isInteger(value) || value < 30 || value > 3650) throw new Error(`RETENTION_${field.toUpperCase()}_OUT_OF_RANGE`);
        result[field] = value;
    }
    if (source.executionMode !== undefined) {
        if (source.executionMode !== 'DRY_RUN' && source.executionMode !== 'MANUAL_APPROVAL') throw new Error('RETENTION_EXECUTION_MODE_INVALID');
        result.executionMode = source.executionMode;
    }
    return result;
};

export const retentionCutoff = (days: number, now = new Date()) => {
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    return cutoff;
};

