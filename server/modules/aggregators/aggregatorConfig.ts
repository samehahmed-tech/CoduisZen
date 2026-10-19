import { db } from '../../db';
import { settings } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { parseSettingJson, upsertSetting } from '../../utils/settingsStore';
import { KNOWN_PROVIDERS } from './aggregatorTypes';

export interface AggregatorProviderConfig {
    enabled: boolean;
    webhookSecret?: string;
    basicUsername?: string;
    basicPassword?: string;
    defaultBranchId?: string;
    storeBranchMap?: Record<string, string>;
    /** Empty = all branches. Otherwise only these branches accept this provider. */
    branchIds?: string[];
}

export type AggregatorsConfig = Record<string, AggregatorProviderConfig>;

const KEY = 'aggregators_config';

const emptyProvider = (): AggregatorProviderConfig => ({
    enabled: false,
    storeBranchMap: {},
    branchIds: [],
});

export const getAggregatorsConfigRaw = async (): Promise<AggregatorsConfig> => {
    try {
        const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
        const parsed = parseSettingJson<AggregatorsConfig>(row?.value, {});
        const out: AggregatorsConfig = {};
        for (const p of KNOWN_PROVIDERS) out[p.id] = { ...emptyProvider(), ...((parsed as any)?.[p.id] || {}) };
        return out;
    } catch {
        const out: AggregatorsConfig = {};
        for (const p of KNOWN_PROVIDERS) out[p.id] = emptyProvider();
        return out;
    }
};

/** Masked config safe for UI (secrets replaced by flags). */
export const getAggregatorsConfig = async (): Promise<Record<string, any>> => {
    const raw = await getAggregatorsConfigRaw();
    const out: Record<string, any> = {};
    for (const [id, cfg] of Object.entries(raw)) {
        const { webhookSecret, basicPassword, ...rest } = cfg as any;
        out[id] = { ...rest, webhookSecretSet: Boolean(webhookSecret), basicPasswordSet: Boolean(basicPassword) };
    }
    return out;
};

export const saveProviderConfig = async (providerId: string, input: Partial<AggregatorProviderConfig>, updatedBy?: string): Promise<void> => {
    const id = String(providerId || '').trim().toLowerCase();
    if (!KNOWN_PROVIDERS.some((p) => p.id === id)) {
        throw Object.assign(new Error('UNKNOWN_PROVIDER'), { status: 400 });
    }
    const all = await getAggregatorsConfigRaw();
    const next: AggregatorProviderConfig = { ...(all[id] || emptyProvider()) };
    if (input.enabled !== undefined) next.enabled = Boolean(input.enabled);
    if (input.webhookSecret !== undefined) next.webhookSecret = String(input.webhookSecret || '').trim() || undefined;
    if (input.basicUsername !== undefined) next.basicUsername = String(input.basicUsername || '').trim() || undefined;
    if ((input as any).basicPassword !== undefined) (next as any).basicPassword = String((input as any).basicPassword || '').trim() || undefined;
    if (input.defaultBranchId !== undefined) next.defaultBranchId = String(input.defaultBranchId || '').trim() || undefined;
    if (input.storeBranchMap !== undefined && typeof input.storeBranchMap === 'object') {
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(input.storeBranchMap)) {
            if (String(k || '').trim() && String(v || '').trim()) clean[String(k).trim()] = String(v).trim();
        }
        next.storeBranchMap = clean;
    }
    if ((input as any).branchIds !== undefined) {
        next.branchIds = Array.isArray((input as any).branchIds)
            ? (input as any).branchIds.map((b: any) => String(b || '').trim()).filter(Boolean)
            : [];
    }
    all[id] = next;
    await upsertSetting({ key: KEY, value: all, category: 'integrations', updatedBy: updatedBy || 'system' });
};
