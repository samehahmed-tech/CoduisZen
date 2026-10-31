import { db } from '../db';
import { settings } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { parseSettingJson, upsertSetting } from '../utils/settingsStore';

export const SLA_HISTORY_SETTING_KEY = 'ops.sla.history';
const MAX_SLA_SNAPSHOTS = 720; // 30 days at the default two-minute monitor interval.

export type SlaSnapshot = {
    recordedAt: string;
    p95TargetMs: number;
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    routesOverTarget: Array<{ route: string; n: number; p95: number; errors: number }>;
};

const readHistory = async (): Promise<SlaSnapshot[]> => {
    const [row] = await db.select({ value: settings.value }).from(settings)
        .where(eq(settings.key, SLA_HISTORY_SETTING_KEY)).top(1);
    const parsed = parseSettingJson<unknown>(row?.value, []);
    return Array.isArray(parsed) ? parsed.filter((item): item is SlaSnapshot => Boolean(item && typeof item === 'object')) : [];
};

export const recordSlaSnapshot = async (snapshot: Omit<SlaSnapshot, 'recordedAt'>) => {
    try {
        const history = await readHistory();
        const next = [...history, { ...snapshot, recordedAt: new Date().toISOString() }].slice(-MAX_SLA_SNAPSHOTS);
        await upsertSetting({ key: SLA_HISTORY_SETTING_KEY, value: next, category: 'operations', updatedBy: 'system' });
    } catch {
        // Metrics persistence must never interrupt request handling or alerts.
    }
};

export const getSlaHistory = async (limit = 168): Promise<SlaSnapshot[]> => {
    try {
        const history = await readHistory();
        return history.slice(-Math.max(1, Math.min(MAX_SLA_SNAPSHOTS, Number(limit) || 168)));
    } catch {
        return [];
    }
};
