import { db } from '../../db';
import { settings } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { parseSettingJson, upsertSetting } from '../../utils/settingsStore';

export interface TalabatConfig {
    enabled: boolean;
    chainId: string;
    clientId: string;
    /** Never returned by getTalabatConfig (masked). Use getTalabatConfigRaw for server use. */
    clientSecret?: string;
    webhookSecret?: string;
    basicUsername?: string;
    basicPassword?: string;
    baseUrl?: string;
    tokenUrl?: string;
    /** Use sandbox host (catalog/orders/category only; promo/outlet are prod-only). */
    sandbox?: boolean;
    transport?: 'LOGISTICS_DELIVERY' | 'VENDOR_DELIVERY';
    autoAccept?: boolean;
    defaultBranchId?: string;
    storeBranchMap?: Record<string, string>;
}

const KEY = 'talabat_config';

const defaults: TalabatConfig = {
    enabled: false,
    chainId: '',
    clientId: '',
    transport: 'LOGISTICS_DELIVERY',
    autoAccept: true,
};

/** Raw config with secrets — server-side only, never send to client. */
export const getTalabatConfigRaw = async (): Promise<TalabatConfig> => {
    try {
        const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
        const parsed = parseSettingJson<Partial<TalabatConfig>>(row?.value, {});
        return { ...defaults, ...(parsed || {}) } as TalabatConfig;
    } catch {
        return { ...defaults };
    }
};

/** Masked config safe for UI. */
export const getTalabatConfig = async (): Promise<TalabatConfig & { clientSecretSet: boolean; webhookSecretSet: boolean }> => {
    const raw = await getTalabatConfigRaw();
    const { clientSecret, webhookSecret, basicPassword, ...rest } = raw as any;
    return {
        ...rest,
        clientSecretSet: Boolean(clientSecret),
        webhookSecretSet: Boolean(webhookSecret),
        basicPasswordSet: Boolean(basicPassword),
    } as any;
};

export const saveTalabatConfig = async (input: Partial<TalabatConfig>, updatedBy?: string): Promise<void> => {
    const current = await getTalabatConfigRaw();
    // Empty string clears secret; absent keeps existing.
    const next: TalabatConfig = { ...current };
    if (input.enabled !== undefined) next.enabled = Boolean(input.enabled);
    if (input.chainId !== undefined) next.chainId = String(input.chainId || '').trim();
    if (input.clientId !== undefined) next.clientId = String(input.clientId || '').trim();
    if (input.clientSecret !== undefined) next.clientSecret = String(input.clientSecret || '').trim() || undefined;
    if (input.webhookSecret !== undefined) next.webhookSecret = String(input.webhookSecret || '').trim() || undefined;
    if (input.basicUsername !== undefined) next.basicUsername = String(input.basicUsername || '').trim() || undefined;
    if ((input as any).basicPassword !== undefined) (next as any).basicPassword = String((input as any).basicPassword || '').trim() || undefined;
    if (input.baseUrl !== undefined) next.baseUrl = String(input.baseUrl || '').trim() || undefined;
    if (input.tokenUrl !== undefined) next.tokenUrl = String(input.tokenUrl || '').trim() || undefined;
    if (input.sandbox !== undefined) next.sandbox = Boolean(input.sandbox);
    if (input.transport !== undefined && ['LOGISTICS_DELIVERY', 'VENDOR_DELIVERY'].includes(String(input.transport))) {
        next.transport = input.transport;
    }
    if (input.autoAccept !== undefined) next.autoAccept = Boolean(input.autoAccept);
    if (input.defaultBranchId !== undefined) next.defaultBranchId = String(input.defaultBranchId || '').trim() || undefined;
    if (input.storeBranchMap !== undefined && typeof input.storeBranchMap === 'object') {
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(input.storeBranchMap)) {
            const kk = String(k || '').trim();
            const vv = String(v || '').trim();
            if (kk && vv) clean[kk] = vv;
        }
        next.storeBranchMap = clean;
    }
    await upsertSetting({ key: KEY, value: next, category: 'integrations', updatedBy: updatedBy || 'system' });
};
